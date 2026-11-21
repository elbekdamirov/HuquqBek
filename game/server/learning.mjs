import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  randomBytes,
  randomUUID,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { ApiError } from "./runtime.mjs";
import { createHearingStore } from "./hearings.mjs";
import { lessonFeedback } from "./localization.mjs";
import { requestLanguage } from "./language.mjs";
import { learningReply } from "./ai.mjs";
import {
  createCommerce,
  signWebhook,
  isFreeLesson,
  FREE_LABS,
} from "./commerce.mjs";
import { createExams, buildBanks, loadExtraBankDir } from "./exams.mjs";
import { createAuth } from "./auth.mjs";

export const curriculum = JSON.parse(
  readFileSync(new URL("./content/curriculum.json", import.meta.url), "utf8"),
);
export const labs = JSON.parse(
  readFileSync(new URL("./content/labs.json", import.meta.url), "utf8"),
);
export const theoryChecks = JSON.parse(
  readFileSync(
    new URL("./content/theory-checks.json", import.meta.url),
    "utf8",
  ),
);
const VERSION = "learning-1";
const paths = ["advokat", "sudya", "prokuror"];
const actorFor = {
  advokat: "CH_ADVOCATE",
  sudya: "CH_JUDGE",
  prokuror: "CH_PROSECUTOR",
};
const getRoom = (id) => {
  const r = curriculum.rooms.find((r) => r.id === id);
  if (!r) throw new ApiError(404, "Xona topilmadi.");
  return r;
};
export const interestQuestions = [
  "Murakkab vaziyatda qaysi ish sizni ko‘proq qiziqtiradi?",
  "Bir-biriga zid hujjatlar bilan nima qilishni yoqtirasiz?",
  "Jamoada qaysi vazifa sizga yaqin?",
  "Qaysi natija sizni ko‘proq qoniqtiradi?",
  "Qaysi amaliy mashqni avval tanlaysiz?",
  "Qaysi ko‘nikmani rivojlantirmoqchisiz?",
].map((prompt, i) => ({
  id: i,
  prompt,
  options: [
    [
      "Mijozning muammosini tushunish va asosli himoya qilish",
      "Ikkala tarafni tinglab xolis qarorga kelish",
      "Da’volarni tekshirish va qonuniy pozitsiya bildirish",
    ],
    [
      "Mijoz foydasiga va qarshi materialni birga tahlil qilish",
      "Har ikki izohni solishtirib sababli xulosa yozish",
      "Ayblov tezisining dalilga mosligini tekshirish",
    ],
    [
      "Vakillik va muzokara",
      "Xolis muhokamani boshqarish",
      "Qonuniylik va dalillarni sinash",
    ],
    [
      "Inson o‘z huquqini tushunib himoya qila olishi",
      "Har bir taraf eshitilib asosli qaror chiqishi",
      "Asossiz da’vo qayta baholanishi",
    ],
    [
      "Mijoz suhbati",
      "Sud majlisini boshqarish",
      "Dalil xaritasini tekshirish",
    ],
    [
      "Savol berish va vakillik",
      "Xolis baholash va qaror yozish",
      "Isbotlash va mas’uliyatli pozitsiya",
    ],
  ][i].map((text, j) => ({ id: paths[j], text })),
}));

const allowAll = {
  lesson: () => {},
  lab: () => {},
  canLesson: () => true,
  canLab: () => true,
};
export function createLearningStore(filename, { access = allowAll } = {}) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS reading_checks(owner TEXT NOT NULL,room TEXT NOT NULL,question TEXT NOT NULL,passed INTEGER NOT NULL,PRIMARY KEY(owner,room,question));
    CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY,v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS learners(id TEXT PRIMARY KEY,name TEXT NOT NULL,interests TEXT);
    CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,owner TEXT NOT NULL,room TEXT NOT NULL,version TEXT NOT NULL,state TEXT NOT NULL,created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS completions(owner TEXT NOT NULL,room TEXT NOT NULL,attempt TEXT NOT NULL,created TEXT NOT NULL,PRIMARY KEY(owner,room));
    CREATE TABLE IF NOT EXISTS certificates(id TEXT PRIMARY KEY,owner TEXT NOT NULL,path TEXT NOT NULL,name TEXT NOT NULL,created TEXT NOT NULL,UNIQUE(owner,path));`);
  // Preserve existing full-path certificates and IDs while adding three five-room milestones.
  if (
    !db
      .prepare("PRAGMA table_info(certificates)")
      .all()
      .some((c) => c.name === "level")
  ) {
    db.exec(`BEGIN IMMEDIATE;
      ALTER TABLE certificates RENAME TO certificates_before_levels;
      CREATE TABLE certificates(id TEXT PRIMARY KEY,owner TEXT NOT NULL,path TEXT NOT NULL,level TEXT NOT NULL,name TEXT NOT NULL,created TEXT NOT NULL,UNIQUE(owner,path,level));
      INSERT INTO certificates SELECT id,owner,path,'Path',name,created FROM certificates_before_levels;
      DROP TABLE certificates_before_levels;
      COMMIT;`);
  }
  {
    const cols = db
      .prepare("PRAGMA table_info(learners)")
      .all()
      .map((c) => c.name);
    if (!cols.includes("active_path"))
      db.exec("ALTER TABLE learners ADD COLUMN active_path TEXT");
    if (!cols.includes("onboarding"))
      db.exec("ALTER TABLE learners ADD COLUMN onboarding TEXT");
  }
  const levels = ["Beginner", "Junior", "Senior"];
  let secret = db
    .prepare("SELECT v FROM settings WHERE k=?")
    .get("key-secret")?.v;
  if (!secret) {
    secret = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO settings VALUES(?,?)").run("key-secret", secret);
  }
  const keyFor = (a) =>
    `HUQUQBEK{${a.room}_${createHmac("sha256", secret).update([a.owner, a.id, a.room, a.version].join("|")).digest("base64url").slice(0, 24)}}`;
  const save = (a) =>
    db
      .prepare("UPDATE attempts SET state=? WHERE id=?")
      .run(JSON.stringify(a.state), a.id);
  const attempt = (owner, id) => {
    const a = db
      .prepare("SELECT * FROM attempts WHERE id=? AND owner=?")
      .get(id, owner);
    if (!a || a.version !== VERSION)
      throw new ApiError(404, "Urinish topilmadi.");
    return { ...a, state: JSON.parse(a.state) };
  };
  const completed = (owner) =>
    db
      .prepare("SELECT room,attempt,created FROM completions WHERE owner=?")
      .all(owner);
  const ensure = (owner) => {
    db.prepare(
      "INSERT OR IGNORE INTO learners(id,name,interests) VALUES(?,?,NULL)",
    ).run(owner, "O‘quvchi");
  };
  const publicAttempt = (a) => {
    const r = getRoom(a.room),
      lab = labs[a.room],
      others = paths.filter((p) => p !== r.path);
    return {
      id: a.id,
      roomId: a.room,
      status: a.state.status,
      read: a.state.read,
      submitted: a.state.submitted || [],
      examined: a.state.examined || [],
      phase: a.state.phase || "preparation",
      correct: a.state.correct,
      errors: a.state.errors,
      log: a.state.log,
      documents: lab.documents,
      checkpoints: lab.questions.map((q, i) => ({
        id: q.id,
        prompt: q.prompt,
        actor: actorFor[others[i % others.length]],
        options: a.state.orders[i].map((x) => ({
          id: x.id,
          text: q.options[x.index],
        })),
      })),
      key: ["passed", "completed"].includes(a.state.status) ? keyFor(a) : null,
    };
  };
  const readingQuestions = (owner, id) =>
    theoryChecks[id].map((q) => ({
      id: q.id,
      prompt: q.prompt,
      source: q.source,
      passed: !!db
        .prepare(
          "SELECT passed FROM reading_checks WHERE owner=? AND room=? AND question=?",
        )
        .get(owner, id, q.id)?.passed,
      options: q.options
        .map((text, index) => ({
          text,
          id: createHmac("sha256", secret)
            .update(["reading", owner, id, q.id, index].join("|"))
            .digest("hex")
            .slice(0, 24),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    }));
  return {
    db,
    ensure,
    completed,
    attempt,
    readingQuestions,
    knowledge(owner, id, questionId, optionId) {
      ensure(owner);
      access.lesson(owner, getRoom(id));
      const room = this.room(owner, id);
      if (room.locked)
        throw new ApiError(409, "Avval oldingi xonani yakunlang.");
      const q = theoryChecks[id].find((q) => q.id === questionId);
      if (!q) throw new ApiError(400, "Savol topilmadi.");
      const valid = readingQuestions(owner, id)
        .find((q) => q.id === questionId)
        .options.some((o) => o.id === optionId);
      if (!valid) throw new ApiError(400, "Javob topilmadi.");
      const expected = createHmac("sha256", secret)
        .update(["reading", owner, id, q.id, q.correct].join("|"))
        .digest("hex")
        .slice(0, 24);
      const ok = optionId === expected;
      if (ok)
        db.prepare(
          "INSERT INTO reading_checks VALUES(?,?,?,1) ON CONFLICT(owner,room,question) DO UPDATE SET passed=1",
        ).run(owner, id, questionId);
      return { ok, feedback: q.explanation, room: this.room(owner, id) };
    },
    profile(owner) {
      ensure(owner);
      const l = db.prepare("SELECT * FROM learners WHERE id=?").get(owner);
      return {
        name: l.name,
        activePath: l.active_path || null,
        onboarding: l.onboarding || null,
        interests: l.interests ? JSON.parse(l.interests) : null,
        completed: completed(owner),
        attempts: db
          .prepare(
            "SELECT id,room,state FROM attempts WHERE owner=? ORDER BY created DESC",
          )
          .all(owner)
          .map((a) => ({
            id: a.id,
            roomId: a.room,
            status: JSON.parse(a.state).status,
            progress: (() => {
              const v = JSON.parse(a.state);
              return v.status === "completed"
                ? 100
                : Math.round(
                    (((v.read?.length || 0) +
                      (v.submitted?.length || 0) +
                      (v.examined?.length || 0) +
                      (v.correct?.length || 0)) /
                      13) *
                      100,
                  );
            })(),
          })),
        certificates: db
          .prepare(
            "SELECT id,path,level,name,created FROM certificates WHERE owner=?",
          )
          .all(owner)
          .map((c) => ({ ...c, legacy: true })),
        storage: "local_browser_profile",
      };
    },
    interests(owner, body) {
      ensure(owner);
      if (
        !Array.isArray(body.answers) ||
        body.answers.length !== 6 ||
        !body.answers.every((x) => paths.includes(x))
      )
        throw new ApiError(400, "Olti savolga javob tanlang.");
      const scores = Object.fromEntries(
        paths.map((p) => [p, body.answers.filter((x) => x === p).length]),
      );
      const max = Math.max(...Object.values(scores));
      const recommended = paths.filter((p) => scores[p] === max);
      const result = {
        scores,
        recommended,
        completedAt: new Date().toISOString(),
        type: "interest_questionnaire_not_psychometric",
      };
      db.prepare("UPDATE learners SET interests=? WHERE id=?").run(
        JSON.stringify(result),
        owner,
      );
      if (recommended.length === 1)
        db.prepare("UPDATE learners SET active_path=? WHERE id=?").run(
          recommended[0],
          owner,
        );
      return result;
    },
    name(owner, name) {
      ensure(owner);
      if (
        typeof name !== "string" ||
        name.trim().length < 2 ||
        name.length > 80
      )
        throw new ApiError(400, "Ism 2–80 belgi bo‘lsin.");
      db.prepare("UPDATE learners SET name=? WHERE id=?").run(
        name.trim(),
        owner,
      );
      db.prepare(
        "UPDATE certificates SET name=? WHERE owner=? AND name='O‘quvchi'",
      ).run(name.trim(), owner);
      return this.profile(owner);
    },
    room(owner, id) {
      const r = getRoom(id);
      const done = new Set(completed(owner).map((x) => x.room));
      const lessonOpen = access.canLesson(owner, r),
        labOpen = access.canLab(owner, r.id);
      const base = {
        ...r,
        locked: r.prerequisites.some((id) => !done.has(id)),
        completed: done.has(id),
        access: {
          lesson: lessonOpen,
          lab: labOpen,
          freeLesson: isFreeLesson(r),
          premiumRequired: !lessonOpen || !labOpen,
        },
      };
      // Locked lesson bodies, worked examples, lab tasks and reading checks never leave the server.
      if (!lessonOpen)
        return {
          ...base,
          theory: [],
          worked_example: "",
          lesson: undefined,
          objective: "",
          knowledge: [],
          lab: {
            scenario: r.lab.scenario,
            tasks: [],
            pass_checks: [],
            materials: [],
          },
        };
      return { ...base, knowledge: readingQuestions(owner, id) };
    },
    start(owner, id) {
      ensure(owner);
      access.lab(owner, id);
      const room = this.room(owner, id);
      if (room.locked)
        throw new ApiError(409, "Avval oldingi xonani kalit bilan yakunlang.");
      const existing = db
        .prepare(
          "SELECT id FROM attempts WHERE owner=? AND room=? AND version=? ORDER BY created DESC LIMIT 1",
        )
        .get(owner, id, VERSION);
      if (existing) return publicAttempt(attempt(owner, existing.id));
      const orders = labs[id].questions.map((q) =>
        q.options
          .map((_, index) => ({
            id: randomBytes(8).toString("hex"),
            index,
            rank: randomBytes(8).toString("hex"),
          }))
          .sort((a, b) => a.rank.localeCompare(b.rank)),
      );
      const a = {
        id: randomUUID(),
        owner,
        room: id,
        version: VERSION,
        state: {
          status: "lab",
          phase: "preparation",
          read: [],
          submitted: [],
          examined: [],
          correct: [],
          errors: 0,
          log: [],
          orders,
        },
      };
      db.prepare("INSERT INTO attempts VALUES(?,?,?,?,?,?)").run(
        a.id,
        owner,
        id,
        VERSION,
        JSON.stringify(a.state),
        new Date().toISOString(),
      );
      return publicAttempt(a);
    },
    resume(owner, id) {
      const a = attempt(owner, id);
      access.lab(owner, a.room);
      return publicAttempt(a);
    },
    inspect(owner, id, docId) {
      const a = attempt(owner, id);
      access.lab(owner, a.room);
      const doc = labs[a.room].documents.find((d) => d.id === docId);
      if (!doc) throw new ApiError(400, "Material topilmadi.");
      if (a.state.status === "lab" && !a.state.read.includes(docId)) {
        a.state.read.push(docId);
        a.state.log.push({
          type: "inspect",
          text: doc.title,
          at: new Date().toISOString(),
        });
        save(a);
      }
      return publicAttempt(a);
    },
    action(owner, id, type, docId) {
      const a = attempt(owner, id);
      access.lab(owner, a.room);
      if (a.state.status !== "lab")
        throw new ApiError(409, "Yakunlangan lab o‘zgartirilmaydi.");
      a.state.submitted ||= [];
      a.state.examined ||= [];
      if (type === "begin") {
        if (a.state.phase !== "preparation" || a.state.read.length !== 3)
          throw new ApiError(409, "Avval uch materialni o‘qing.");
        a.state.phase = "opening";
      } else {
        if (!["opening", "evidence"].includes(a.state.phase))
          throw new ApiError(409, "Avval muhokamani boshlang.");
        if (!labs[a.room].documents.some((d) => d.id === docId))
          throw new ApiError(400, "Material topilmadi.");
        if (type === "present") {
          if (!a.state.read.includes(docId))
            throw new ApiError(409, "Avval hujjatni o‘qing.");
          if (!a.state.submitted.includes(docId)) a.state.submitted.push(docId);
        } else if (type === "examine") {
          if (!a.state.submitted.includes(docId))
            throw new ApiError(409, "Avval materialni taqdim eting.");
          if (!a.state.examined.includes(docId)) a.state.examined.push(docId);
        } else throw new ApiError(400, "Harakat topilmadi.");
        a.state.phase = "evidence";
      }
      a.state.log.push({
        type,
        text:
          type === "begin"
            ? "O‘quv muhokamasi boshlandi"
            : `${docId}: ${type === "present" ? "taqdim etildi" : "birgalikda tekshirildi"}`,
        at: new Date().toISOString(),
      });
      save(a);
      return publicAttempt(a);
    },
    answer(owner, id, questionId, optionId) {
      const a = attempt(owner, id);
      access.lab(owner, a.room);
      if (a.state.status !== "lab")
        throw new ApiError(409, "Bu urinish tekshirilgan. Kalitni kiriting.");
      const i = a.state.correct.length,
        q = labs[a.room].questions[i];
      if (!q || q.id !== questionId)
        throw new ApiError(409, "Joriy vazifani tartib bilan bajaring.");
      if (a.state.examined?.length !== labs[a.room].documents.length)
        throw new ApiError(
          409,
          "Avval uchala materialni o‘qing, taqdim eting va muhokamada tekshiring.",
        );
      const option = a.state.orders[i].find((o) => o.id === optionId);
      if (!option) throw new ApiError(400, "Javob topilmadi.");
      const ok = option.index === q.correct;
      a.state.log.push({
        type: "answer",
        question: q.prompt,
        text: q.options[option.index],
        correct: ok,
        at: new Date().toISOString(),
      });
      a.state.log = a.state.log.slice(-100);
      if (ok) a.state.correct.push(q.id);
      else a.state.errors++;
      if (a.state.correct.length === labs[a.room].questions.length) {
        a.state.status = "passed";
        a.state.phase = "decision";
      } else if (a.state.correct.length === 2) a.state.phase = "arguments";
      save(a);
      return {
        attempt: publicAttempt(a),
        ok,
        feedback: ok
          ? q.feedback
          : "Bu tanlov material va nazariyaga mos kelmadi. Hujjatni qayta ko‘rib, boshqa javobni asoslab tanlang.",
      };
    },
    complete(owner, id, key) {
      const a = attempt(owner, id);
      access.lab(owner, a.room);
      if (!["passed", "completed"].includes(a.state.status))
        throw new ApiError(409, "Avval lab vazifalarini bajaring.");
      const expected = Buffer.from(keyFor(a)),
        actual = Buffer.from(typeof key === "string" ? key.slice(0, 200) : "");
      if (
        expected.length !== actual.length ||
        !timingSafeEqual(expected, actual)
      )
        throw new ApiError(
          400,
          "Kalit mos emas. Shu urinishda berilgan kalitni kiriting.",
        );
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("INSERT OR IGNORE INTO completions VALUES(?,?,?,?)").run(
          owner,
          a.room,
          a.id,
          new Date().toISOString(),
        );
        a.state.status = "completed";
        save(a);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return { attempt: publicAttempt(a), profile: this.profile(owner) };
    },
    certificate(owner, path, level = "Beginner") {
      ensure(owner);
      if (!paths.includes(path) || !levels.includes(level))
        throw new ApiError(400, "Yo‘nalish yoki daraja topilmadi.");
      // New rule: level certificates require a paid package and a passed (>=70/100) exam, never room completion alone.
      throw new ApiError(
        410,
        "Daraja sertifikati endi faqat pullik imtihondan kamida 70/100 ball bilan o‘tgach beriladi.",
        "EXAM_REQUIRED",
      );
    },
    verify(id) {
      const c = db
        .prepare(
          "SELECT id,path,level,name,created FROM certificates WHERE id=?",
        )
        .get(id);
      if (!c) throw new ApiError(404, "Sertifikat topilmadi.");
      return {
        ...c,
        curriculum: VERSION,
        type:
          c.level === "Path"
            ? "guided_training_completion"
            : "level_training_completion",
        rooms: c.level === "Path" ? 15 : 5,
        valid: true,
        legacy: true,
        note: "Avvalgi qoidalar bo‘yicha berilgan o‘quv yakuni qaydi (imtihonsiz).",
      };
    },
  };
}
let store, commerce, exams, auth;
function currentStore() {
  if (store) return store;
  const gate = {
    lesson: (o, r) => commerce.requireLesson(o, r),
    lab: (o, id) => commerce.requireLab(o, id),
    canLesson: (o, r) => commerce.canAccessLesson(o, r),
    canLab: (o, id) => commerce.canAccessLab(o, id),
  };
  store = createLearningStore(
    process.env.HUQUQBEK_LEARNING_DB ||
      fileURLToPath(new URL("../.local/learning.sqlite", import.meta.url)),
    { access: gate },
  );
  commerce = createCommerce(store.db);
  auth = createAuth(store.db);
  exams = createExams(store.db, commerce, {
    banks: buildBanks({
      curriculum,
      labs,
      theoryChecks,
      extraDir: loadExtraBankDir(
        new URL("./content/exam-banks/", import.meta.url),
      ),
    }),
  });
  return store;
}
export function billingWebhook(raw, signature) {
  currentStore();
  return commerce.webhook(raw, signature);
}
export { signWebhook };
const learnerCookie = (res, id) =>
  res.setHeader(
    "Set-Cookie",
    `hb_learner=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`,
  );
function identity(req, res, s) {
  const token = String(req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("hb_learner="))
    ?.slice(11);
  let owner = token;
  if (
    !/^[a-f0-9]{64}$/.test(owner || "") ||
    !s.db.prepare("SELECT id FROM learners WHERE id=?").get(owner)
  ) {
    owner = randomBytes(32).toString("hex");
    s.ensure(owner);
    res.setHeader(
      "Set-Cookie",
      `hb_learner=${owner}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`,
    );
  }
  return owner;
}
const json = (res, data) => {
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
};
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const hearingStores = new WeakMap();
export async function handleLearning(req, res, body, credentials) {
  const s = currentStore(),
    owner = identity(req, res, s),
    url = new URL(req.url, "http://localhost"),
    path = url.pathname.replace("/api/learning/", "");
  if (path.startsWith("hearings/")) {
    let h = hearingStores.get(s.db);
    if (!h) {
      h = createHearingStore(s.db);
      hearingStores.set(s.db, h);
    }
    if (req.method === "GET") return json(res, h.resume(owner, path.slice(9)));
    if (req.method !== "POST") throw new ApiError(405, "POST kerak.");
    const op = path.slice(9);
    if (op === "start") return json(res, h.start(owner, body));
    if (op === "action") return json(res, h.action(owner, body));
    if (op === "speak")
      return json(
        res,
        await h.speak(owner, body, credentials, requestLanguage(req, body)),
      );
    if (op === "decide")
      return json(
        res,
        await h.decide(owner, body, credentials, requestLanguage(req, body)),
      );
    throw new ApiError(404, "Sud API manzili topilmadi.");
  }
  const seg = path.split("/"),
    admin = req.headers["x-huquqbek-admin"];
  if (req.method === "GET") {
    if (path === "auth/config") return json(res, auth.config());
    if (path === "auth/me")
      return json(res, { account: auth.account(owner), ...auth.config() });
    if (path === "pricing") return json(res, commerce.pricing());
    if (path === "me/entitlements")
      return json(res, commerce.entitlements(owner));
    if (path === "exams/eligibility")
      return json(res, exams.eligibility(owner));
    if (seg[0] === "exams" && seg[3] === "rules")
      return json(res, exams.rules(owner, seg[1], seg[2]));
    if (seg[0] === "exam-attempts" && seg.length === 2)
      return json(res, exams.getAttempt(owner, seg[1]));
    if (path === "me/certificates")
      return json(res, exams.certificateState(owner));
    if (seg[0] === "certificates" && seg.length === 2)
      return json(res, exams.myCertificate(owner, seg[1]));
    if (seg[0] === "verify-certificate")
      return json(res, exams.verifyCertificate(seg[1]));
    if (path === "admin/exam-reviews") return json(res, exams.reviews(admin));
    if (path === "profile")
      return json(res, { ...s.profile(owner), account: auth.account(owner) });
    if (path === "catalog")
      return json(res, {
        version: VERSION,
        questions: interestQuestions,
        rooms: curriculum.rooms.map((r) => ({
          id: r.id,
          title: r.title,
          path: r.path,
          level: r.level,
          level_label: r.level_label,
          order: r.order,
          capstone: r.capstone,
          duration_minutes: r.duration_minutes,
          prerequisites: r.prerequisites,
          scenario: r.lab.scenario,
          freeLesson: isFreeLesson(r),
          freeLab: FREE_LABS.includes(r.id),
        })),
        premium: commerce.premium(owner),
      });
    if (path.startsWith("rooms/"))
      return json(res, s.room(owner, path.slice(6)));
    if (path.startsWith("attempts/"))
      return json(res, s.resume(owner, path.slice(9)));
    if (path.startsWith("verify/")) return json(res, s.verify(path.slice(7)));
    if (path.startsWith("certificate/")) {
      const c = s.verify(path.slice(12)),
        lang = requestLanguage(req);
      const text = {
        uz: {
          title: "Darajani tamomlaganlik sertifikati",
          names: { advokat: "Advokat", sudya: "Sudya", prokuror: "Prokuror" },
          body: "yo‘nalishida nazariya, 3D laboratoriya va kalit topshirish orqali quyidagi darajani yakunladi:",
          rooms: "xona",
          notice:
            "HuquqBek sinov kursi. Kasbiy litsenziya yoki davlat malakasi emas.",
          verify: "Tekshirish",
          print: "PDF sifatida saqlash / chop etish",
        },
        en: {
          title: "Certificate of level completion",
          names: { advokat: "Lawyer", sudya: "Judge", prokuror: "Prosecutor" },
          body: "completed the following level through theory, 3D laboratories and room-key submissions in the learning path:",
          rooms: "rooms",
          notice:
            "HuquqBek pilot course. This is not a professional licence or a state qualification.",
          verify: "Verify",
          print: "Save as PDF / print",
        },
        ru: {
          title: "Сертификат об окончании уровня",
          names: { advokat: "Адвокат", sudya: "Судья", prokuror: "Прокурор" },
          body: "завершил(а) указанный уровень обучения: теория, 3D-лаборатории и сдача ключей комнат. Направление:",
          rooms: "комнат",
          notice:
            "Пробный курс HuquqBek. Не является профессиональной лицензией или государственной квалификацией.",
          verify: "Проверка",
          print: "Сохранить PDF / печать",
        },
      }[lang];
      const certificate = `<!doctype html><html lang="${lang}"><meta charset="utf-8"><title>${escape(text.title)} · HuquqBek</title><style>@page{size:A4 landscape;margin:15mm}body{font:18px Georgia,serif;color:#12352c;padding:38px;border:8px double #bd9c54;text-align:center}h1{font-size:34px}strong{font-size:30px}small{font:13px Arial}button{padding:12px}@media print{button{display:none}}</style><img src="/brand/huquqbek-courthouse.svg" width="60" height="60" alt="HuquqBek"><p>HUQUQBEK</p><h1>${escape(text.title)}</h1><strong>${escape(c.name)}</strong><p>${escape(text.body)} ${text.names[c.path]}</p><h2>${escape(c.level === "Path" ? "Beginner · Junior · Senior" : c.level)} · ${c.rooms} ${text.rooms}</h2><p>${escape(c.created.slice(0, 10))}</p><small>ID: ${escape(c.id)} · ${VERSION}<br>${text.verify}: ${escape("http://" + req.headers.host + "/api/learning/verify/" + c.id)}<br>${escape(text.notice)}</small><p><button onclick="window.print()">${text.print}</button></p></html>`;
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      return res.end(certificate);
    }
  }
  if (req.method === "POST") {
    if (path === "auth/google" || path === "auth/dev") {
      const learner =
        path === "auth/google"
          ? await auth.google(owner, body)
          : auth.dev(owner, body);
      if (learner !== owner) learnerCookie(res, learner);
      return json(res, {
        ...s.profile(learner),
        account: auth.account(learner),
      });
    }
    if (path === "auth/guest") {
      auth.guest(owner);
      return json(res, { ...s.profile(owner), account: auth.account(owner) });
    }
    if (path === "auth/logout") {
      const fresh = randomBytes(32).toString("hex");
      s.ensure(fresh);
      learnerCookie(res, fresh);
      return json(res, { ok: true });
    }
    if (path === "active-path") {
      auth.setPath(owner, body.path);
      return json(res, { ...s.profile(owner), account: auth.account(owner) });
    }
    if (path === "checkout") return json(res, commerce.checkout(owner, body));
    if (path === "billing/dev-confirm")
      return json(res, commerce.devConfirm(owner, body.orderId, body.outcome));
    if (path === "billing/cancel")
      return json(res, commerce.cancelSubscription(owner));
    if (path === "exams/identity")
      return json(res, exams.submitIdentity(owner, body));
    if (seg[0] === "exams" && seg.length === 4) {
      const [, role, level, op] = seg;
      if (op === "rules")
        return json(res, exams.acceptRules(owner, role, level, body));
      if (op === "camera")
        return json(res, exams.cameraCheck(owner, role, level, body));
      if (op === "start") return json(res, exams.start(owner, role, level));
    }
    if (seg[0] === "exam-attempts") {
      const id = seg[1],
        op = seg.slice(2).join("/");
      if (op === "answers") return json(res, exams.answers(owner, id, body));
      if (op === "tests/submit") return json(res, exams.submitTest(owner, id));
      if (seg[2] === "cases" && seg[4] === "event")
        return json(res, exams.caseEvent(owner, id, seg[3], body));
      if (seg[2] === "cases" && seg[4] === "submit")
        return json(res, exams.submitCase(owner, id, seg[3]));
      if (op === "finish") return json(res, exams.finish(owner, id));
      if (op === "proctor-events")
        return json(res, exams.proctorEvent(owner, id, body));
      if (op === "appeal") return json(res, exams.appeal(owner, id, body));
    }
    if (path === "certificates/issue")
      return json(res, exams.issueCertificate(owner, body));
    if (
      seg[0] === "admin" &&
      seg[1] === "exam-reviews" &&
      seg[3] === "decision"
    )
      return json(res, exams.decide(admin, seg[2], body));
    if (seg[0] === "admin" && seg[1] === "identity" && seg[3] === "decision")
      return json(res, exams.decideIdentity(admin, seg[2], body));
    if (path === "interests") return json(res, s.interests(owner, body));
    if (path === "profile")
      return json(res, {
        ...s.name(owner, body.name),
        account: auth.account(owner),
      });
    if (path === "knowledge")
      return json(
        res,
        s.knowledge(owner, body.roomId, body.questionId, body.optionId),
      );
    if (path === "start") {
      const r = s.room(owner, body.roomId),
        existing = s.db
          .prepare("SELECT id FROM attempts WHERE owner=? AND room=? LIMIT 1")
          .get(owner, body.roomId);
      if (!existing && !r.knowledge.every((q) => q.passed))
        throw new ApiError(
          409,
          "Avval nazariya orasidagi ikki savolni bajaring.",
        );
      return json(res, s.start(owner, body.roomId));
    }
    if (path === "inspect")
      return json(res, s.inspect(owner, body.attemptId, body.documentId));
    if (path === "action")
      return json(
        res,
        s.action(owner, body.attemptId, body.action, body.documentId),
      );
    if (path === "answer") {
      const result = s.answer(
        owner,
        body.attemptId,
        body.questionId,
        body.optionId,
      );
      return json(res, {
        ...result,
        feedback: lessonFeedback(result.feedback, requestLanguage(req, body)),
      });
    }
    if (path === "complete")
      return json(res, s.complete(owner, body.attemptId, body.key));
    if (path === "certificate")
      return json(res, s.certificate(owner, body.path, body.level));
    if (path === "tutor") {
      const room = body.roomId ? getRoom(body.roomId) : null;
      if (
        typeof body.text !== "string" ||
        body.text.trim().length < 2 ||
        body.text.length > 3000
      )
        throw new ApiError(400, "Xabar 2–3000 belgi bo‘lsin.");
      return json(
        res,
        await learningReply(
          credentials,
          room,
          room ? labs[room.id].documents : [],
          { ...body, language: requestLanguage(req, body) },
        ),
      );
    }
  }
  throw new ApiError(404, "O‘quv API manzili topilmadi.");
}
