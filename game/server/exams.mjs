// HuquqBek secure exam mode: two timed sections (50 MCQ / 60 min, 2 case labs / 60 min), server-only grading,
// attempt credits from verified role/level packages, identity + rules + camera prechecks, proctor signals that
// only ever *flag for human review*, and exam-pass-gated certificate issuance with public verification.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiError } from "./runtime.mjs";
import { ROLES, LEVELS, isDevMode } from "./commerce.mjs";

export const QUESTIONS_PER_EXAM = 50;
export const CASES_PER_EXAM = 2;
export const SECTION_MS = 60 * 60 * 1000;
export const CASE_POINTS = 25;
export const PASS_SCORE = 70;
const TOLERANCE_MS = 5000; // documented network tolerance on deadlines
const CAMERA_GRACE_MS = 20000; // reconnect window before input locks / review flag
const HEARTBEAT_GAP_MS = 60000; // missing camera heartbeats longer than this are flagged
const PRECHECK_TTL_MS = 30 * 60 * 1000;
const CAMERA_CHECK_TTL_MS = 10 * 60 * 1000;
const curriculumLevel = {
  beginner: "Beginner",
  junior: "Junior",
  senior: "Senior",
};
const roleCode = { advokat: "ADV", prokuror: "PRK", sudya: "SUD" };
const ACTIVE = ["TEST_IN_PROGRESS", "CASES_IN_PROGRESS"];
const FINAL = ["PASSED", "FAILED", "DISQUALIFIED", "REVIEW_REQUIRED"];

const shuffle = (list) =>
  list
    .map((v) => [randomBytes(6).toString("hex"), v])
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map((x) => x[1]);
const token = () => randomBytes(8).toString("hex");

/**
 * Build exam banks. Curriculum-derived items are source-backed teaching content but are NOT yet reviewed for
 * certification, so they never count toward the 50 published questions a real exam needs. Reviewed items can be
 * added as server/content/exam-banks/<role>-<level>.json: {questions:[{id,prompt,options,correct,reviewed:true}],cases:[...]}.
 */
export function buildBanks({ curriculum, labs, theoryChecks, extraDir }) {
  const banks = {};
  for (const role of ROLES)
    for (const level of LEVELS) {
      const rooms = curriculum.rooms
        .filter((r) => r.path === role && r.level === curriculumLevel[level])
        .sort((a, b) => a.order - b.order);
      const questions = [];
      for (const r of rooms) {
        for (const q of theoryChecks[r.id] || [])
          questions.push({
            id: `${r.id}:${q.id}`,
            prompt: q.prompt,
            options: q.options,
            correct: q.correct,
            source: r.id,
            reviewed: false,
          });
        if (r.order <= 3)
          for (const q of labs[r.id].questions)
            questions.push({
              id: `${r.id}:${q.id}`,
              prompt: q.prompt,
              options: q.options,
              correct: q.correct,
              source: r.id,
              reviewed: false,
            });
      }
      const cases = rooms
        .filter((r) => r.order >= 4)
        .map((r) => ({
          id: `CASE-${r.id}`,
          title: r.title,
          scenario: r.lab.scenario,
          documents: labs[r.id].documents,
          decisions: labs[r.id].questions.map((q) => ({
            id: q.id,
            prompt: q.prompt,
            options: q.options,
            correct: q.correct,
            feedback: q.feedback,
          })),
          workflow: r.lab.tasks,
          source: r.id,
          reviewed: false,
        }));
      const file = extraDir && `${extraDir}/${role}-${level}.json`;
      if (file && existsSync(file)) {
        const extra = JSON.parse(readFileSync(file, "utf8"));
        for (const q of extra.questions || [])
          questions.push({ ...q, reviewed: q.reviewed === true });
        for (const c of extra.cases || [])
          cases.push({ ...c, reviewed: c.reviewed === true });
      }
      banks[`${role}:${level}`] = { role, level, questions, cases };
    }
  return banks;
}

export function bankReadiness(bank) {
  const reviewedQ = bank.questions.filter((q) => q.reviewed).length,
    reviewedC = bank.cases.filter((c) => c.reviewed).length;
  return {
    ready: reviewedQ >= QUESTIONS_PER_EXAM && reviewedC >= CASES_PER_EXAM,
    reviewedQuestions: reviewedQ,
    reviewedCases: reviewedC,
    totalQuestions: bank.questions.length,
    totalCases: bank.cases.length,
  };
}

export function decideResult(
  testScore,
  caseScore,
  { reviewHold = false, disqualified = false } = {},
) {
  const finalScore = testScore + caseScore;
  if (disqualified) return { finalScore, status: "DISQUALIFIED" };
  // Flags only hold a result that would otherwise certify; a failing score is recorded as FAILED with its flags.
  if (reviewHold && finalScore >= PASS_SCORE)
    return { finalScore, status: "REVIEW_REQUIRED" };
  return { finalScore, status: finalScore >= PASS_SCORE ? "PASSED" : "FAILED" };
}

export function createExams(
  db,
  commerce,
  { banks, now = () => new Date(), env = process.env } = {},
) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS exam_identity(owner TEXT PRIMARY KEY,status TEXT NOT NULL,method TEXT NOT NULL,full_name TEXT NOT NULL,consent_at TEXT NOT NULL,reviewed_at TEXT,reviewer TEXT,note TEXT);
    CREATE TABLE IF NOT EXISTS exam_prechecks(owner TEXT NOT NULL,role TEXT NOT NULL,level TEXT NOT NULL,rules_at TEXT,camera_at TEXT,PRIMARY KEY(owner,role,level));
    CREATE TABLE IF NOT EXISTS exam_attempts(id TEXT PRIMARY KEY,owner TEXT NOT NULL,role TEXT NOT NULL,level TEXT NOT NULL,credit_id TEXT NOT NULL,order_id TEXT NOT NULL,attempt_number INTEGER NOT NULL,status TEXT NOT NULL,practice INTEGER NOT NULL,snapshot TEXT NOT NULL,state TEXT NOT NULL,test_started_at TEXT NOT NULL,test_ends_at TEXT NOT NULL,cases_started_at TEXT,cases_ends_at TEXT,submitted_at TEXT,test_score INTEGER,case_score INTEGER,final_score INTEGER,timed_out INTEGER NOT NULL DEFAULT 0,review_reason TEXT,version INTEGER NOT NULL DEFAULT 0);
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_exam ON exam_attempts(owner,role,level) WHERE status IN ('TEST_IN_PROGRESS','CASES_IN_PROGRESS');
    CREATE TABLE IF NOT EXISTS exam_proctor_events(id INTEGER PRIMARY KEY AUTOINCREMENT,attempt_id TEXT NOT NULL,type TEXT NOT NULL,detail TEXT,client_at TEXT,at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS exam_review_decisions(id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL,decision TEXT NOT NULL,reason TEXT NOT NULL,reviewer TEXT NOT NULL,at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS exam_appeals(id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL,owner TEXT NOT NULL,text TEXT NOT NULL,status TEXT NOT NULL,at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS exam_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,attempt_id TEXT,owner TEXT,action TEXT NOT NULL,detail TEXT,at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS exam_certificates(id TEXT PRIMARY KEY,owner TEXT NOT NULL,role TEXT NOT NULL,level TEXT NOT NULL,first_name TEXT NOT NULL,last_name TEXT NOT NULL,issued_at TEXT NOT NULL,status TEXT NOT NULL,attempt_id TEXT NOT NULL,order_id TEXT NOT NULL,environment TEXT NOT NULL,revoked_at TEXT,revoked_reason TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS one_issued_certificate ON exam_certificates(owner,role,level) WHERE status='issued';`);
  const t = () => now().getTime(),
    iso = (ms = t()) => new Date(ms).toISOString();
  const dev = () => isDevMode(env);
  const audit = (attemptId, owner, action, detail = {}) =>
    db
      .prepare(
        "INSERT INTO exam_audit(attempt_id,owner,action,detail,at) VALUES(?,?,?,?,?)",
      )
      .run(attemptId, owner, action, JSON.stringify(detail), iso());
  const tx = commerce.tx;
  const checkRoleLevel = (role, level) => {
    if (!ROLES.includes(role) || !LEVELS.includes(level))
      throw new ApiError(400, "Rol yoki daraja noto‘g‘ri.");
  };

  function material(role, level) {
    const bank = banks[`${role}:${level}`],
      readiness = bankReadiness(bank);
    if (readiness.ready)
      return {
        mode: "certified",
        readiness,
        questions: bank.questions.filter((q) => q.reviewed),
        cases: bank.cases.filter((c) => c.reviewed),
      };
    if (dev()) {
      // Development practice bank: level items first, padded from the same role only. Never presented as certified.
      const pool = [...bank.questions];
      for (const other of LEVELS)
        if (other !== level) pool.push(...banks[`${role}:${other}`].questions);
      return pool.length >= QUESTIONS_PER_EXAM &&
        bank.cases.length >= CASES_PER_EXAM
        ? { mode: "practice", readiness, questions: pool, cases: bank.cases }
        : { mode: "unavailable", readiness };
    }
    return { mode: "unavailable", readiness };
  }

  // ---------------------------------------------------------------- identity
  function identity(owner) {
    return (
      db
        .prepare(
          "SELECT status,method,full_name AS fullName,consent_at AS consentAt,reviewed_at AS reviewedAt,note FROM exam_identity WHERE owner=?",
        )
        .get(owner) || { status: "none" }
    );
  }
  const identityMethod = () =>
    dev()
      ? "dev_attestation"
      : env.HUQUQBEK_ADMIN_TOKEN
        ? "manual_review"
        : null;
  function submitIdentity(owner, body) {
    if (body?.consent !== true)
      throw new ApiError(400, "Shaxsni tasdiqlash uchun rozilik kerak.");
    const method = identityMethod();
    if (!method)
      throw new ApiError(
        503,
        "Shaxsni tasdiqlash sozlanmagan. Imtihonni boshlash hozircha mumkin emas.",
        "IDENTITY_NOT_CONFIGURED",
      );
    const name =
      db.prepare("SELECT name FROM learners WHERE id=?").get(owner)?.name || "";
    if (name.trim().length < 3 || name === "O‘quvchi")
      throw new ApiError(
        409,
        "Avval profilda to‘liq ism va familiyangizni saqlang.",
        "PROFILE_NAME_REQUIRED",
      );
    const current = identity(owner);
    if (current.status === "verified") return current;
    const status = method === "dev_attestation" ? "verified" : "pending";
    db.prepare(
      "INSERT INTO exam_identity VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET status=excluded.status,method=excluded.method,full_name=excluded.full_name,consent_at=excluded.consent_at,reviewed_at=excluded.reviewed_at,reviewer=excluded.reviewer,note=excluded.note",
    ).run(
      owner,
      status,
      method,
      name.trim(),
      iso(),
      status === "verified" ? iso() : null,
      status === "verified" ? "dev" : null,
      status === "verified"
        ? "Ishlab chiqish rejimidagi o‘z-o‘zini tasdiqlash — haqiqiy tekshiruv emas."
        : null,
    );
    audit(null, owner, "identity_submitted", { method, status });
    return identity(owner);
  }

  // ---------------------------------------------------------------- eligibility / prechecks
  function activeAttempt(owner, role, level) {
    return db
      .prepare(
        `SELECT id FROM exam_attempts WHERE owner=? AND role=? AND level=? AND status IN ('TEST_IN_PROGRESS','CASES_IN_PROGRESS')`,
      )
      .get(owner, role, level);
  }
  function eligibility(owner) {
    const out = {};
    for (const role of ROLES)
      for (const level of LEVELS) {
        // Refresh deadlines of any running attempt so statuses are honest.
        const running = activeAttempt(owner, role, level);
        if (running) load(owner, running.id);
        const credits = commerce.credits(owner, role, level),
          owned = commerce.ownsPackage(owner, role, level);
        const attempts = db
          .prepare(
            "SELECT id,status,final_score,attempt_number,submitted_at FROM exam_attempts WHERE owner=? AND role=? AND level=? ORDER BY test_started_at DESC",
          )
          .all(owner, role, level);
        const passed = attempts.find((a) => a.status === "PASSED"),
          active = attempts.find((a) => ACTIVE.includes(a.status));
        const cert = db
          .prepare(
            "SELECT id,status FROM exam_certificates WHERE owner=? AND role=? AND level=? ORDER BY issued_at DESC LIMIT 1",
          )
          .get(owner, role, level);
        const m = material(role, level);
        let state;
        if (cert?.status === "issued") state = "issued";
        else if (cert?.status === "revoked") state = "revoked";
        else if (passed) state = "passed_ready";
        else if (active) state = "in_progress";
        else if (attempts[0]?.status === "REVIEW_REQUIRED")
          state = "under_review";
        else if (!owned && credits.remaining === 0) state = "package_required";
        else if (credits.remaining === 0)
          state =
            attempts[0]?.status === "DISQUALIFIED"
              ? "disqualified"
              : "exhausted";
        else if (attempts[0]?.status === "FAILED") state = "failed_retry";
        else if (attempts[0]?.status === "DISQUALIFIED")
          state = "disqualified_retry";
        else state = "ready";
        out[`${role}:${level}`] = {
          role,
          level,
          owned,
          credits,
          state,
          activeAttemptId: active?.id || null,
          lastAttempt: attempts[0]
            ? {
                id: attempts[0].id,
                status: attempts[0].status,
                finalScore: attempts[0].final_score,
              }
            : null,
          certificateId: cert?.id || null,
          material: { mode: m.mode, ...m.readiness },
        };
      }
    return {
      exams: out,
      identity: identity(owner),
      identityMethod: identityMethod(),
      dev: dev(),
      rules: rulesSummary(),
    };
  }
  const rulesSummary = () => ({
    questions: QUESTIONS_PER_EXAM,
    testMinutes: 60,
    cases: CASES_PER_EXAM,
    caseMinutes: 60,
    casePoints: CASE_POINTS,
    pass: PASS_SCORE,
    max: 100,
  });

  function rules(owner, role, level) {
    checkRoleLevel(role, level);
    const p = db
      .prepare(
        "SELECT * FROM exam_prechecks WHERE owner=? AND role=? AND level=?",
      )
      .get(owner, role, level);
    return {
      ...rulesSummary(),
      role,
      level,
      credits: commerce.credits(owner, role, level),
      owned: commerce.ownsPackage(owner, role, level),
      acceptedAt: p?.rules_at || null,
      cameraCheckedAt: p?.camera_at || null,
      identity: identity(owner),
      material: material(role, level).mode,
    };
  }
  function upsertPrecheck(owner, role, level, field) {
    db.prepare(
      `INSERT INTO exam_prechecks(owner,role,level,${field}) VALUES(?,?,?,?) ON CONFLICT(owner,role,level) DO UPDATE SET ${field}=excluded.${field}`,
    ).run(owner, role, level, iso());
  }
  function acceptRules(owner, role, level, body) {
    checkRoleLevel(role, level);
    if (body?.accept !== true)
      throw new ApiError(400, "“Qoidalarga roziman” tasdig‘i kerak.");
    upsertPrecheck(owner, role, level, "rules_at");
    audit(null, owner, "rules_accepted", { role, level });
    return rules(owner, role, level);
  }
  function cameraCheck(owner, role, level, body) {
    checkRoleLevel(role, level);
    const w = Number(body?.width),
      h = Number(body?.height),
      frames = Number(body?.frames);
    if (!(w >= 160 && h >= 120 && frames >= 3 && body?.liveTrack === true))
      throw new ApiError(
        400,
        "Kamera kadrlari aniqlanmadi. Kamerani yoqib, qayta tekshiring.",
        "CAMERA_NOT_ACTIVE",
      );
    upsertPrecheck(owner, role, level, "camera_at");
    audit(null, owner, "camera_precheck", { role, level, w, h });
    return rules(owner, role, level);
  }

  // ---------------------------------------------------------------- attempt lifecycle
  function start(owner, role, level) {
    checkRoleLevel(role, level);
    return tx(() => {
      const running = activeAttempt(owner, role, level);
      if (running) {
        const current = load(owner, running.id, true);
        if (ACTIVE.includes(current.status))
          return { resumed: true, attempt: view(current) };
      }
      if (
        !commerce.ownsPackage(owner, role, level) &&
        commerce.credits(owner, role, level).remaining === 0
      )
        throw new ApiError(
          403,
          "Bu imtihon uchun shu rol va daraja paketini xarid qiling. Premium obuna imtihonni ochmaydi.",
          "PACKAGE_REQUIRED",
          { pricingUrl: "#/pricing" },
        );
      if (identity(owner).status !== "verified")
        throw new ApiError(
          409,
          "Avval shaxsingiz tasdiqlanishi kerak.",
          "IDENTITY_REQUIRED",
        );
      const p = db
        .prepare(
          "SELECT * FROM exam_prechecks WHERE owner=? AND role=? AND level=?",
        )
        .get(owner, role, level);
      if (!p?.rules_at || t() - Date.parse(p.rules_at) > PRECHECK_TTL_MS)
        throw new ApiError(
          409,
          "Imtihon qoidalarini o‘qib, rozilik bildiring.",
          "RULES_REQUIRED",
        );
      if (!p?.camera_at || t() - Date.parse(p.camera_at) > CAMERA_CHECK_TTL_MS)
        throw new ApiError(
          409,
          "Kamera tekshiruvidan o‘ting.",
          "CAMERA_REQUIRED",
        );
      const m = material(role, level);
      if (m.mode === "unavailable")
        throw new ApiError(
          409,
          "Imtihon materiallari tayyor emas.",
          "MATERIALS_NOT_READY",
          m.readiness,
        );
      const credit = commerce.consumeCredit(owner, role, level);
      const questions = shuffle(m.questions)
        .slice(0, QUESTIONS_PER_EXAM)
        .map((q) => ({
          id: q.id,
          prompt: q.prompt,
          options: shuffle(
            q.options.map((text, index) => ({ token: token(), index, text })),
          ),
          correct: q.correct,
        }));
      const cases = shuffle(m.cases)
        .slice(0, CASES_PER_EXAM)
        .map((c) => ({
          id: c.id,
          title: c.title,
          scenario: c.scenario,
          documents: c.documents.map((d) => ({
            id: d.id,
            title: d.title,
            body: d.body,
            synthetic: d.synthetic,
          })),
          decisions: c.decisions.map((d) => ({
            id: d.id,
            prompt: d.prompt,
            options: shuffle(
              d.options.map((text, index) => ({ token: token(), index, text })),
            ),
            correct: d.correct,
            feedback: d.feedback,
          })),
          workflow: shuffle(
            c.workflow.map((text, index) => ({ token: token(), index, text })),
          ),
        }));
      const id = "exm_" + randomUUID().replace(/-/g, "").slice(0, 22),
        started = t();
      const state = {
        answers: {},
        cases: Object.fromEntries(
          cases.map((c) => [
            c.id,
            {
              opened: [],
              decisions: {},
              order: c.workflow.map((w) => w.token),
              submitted: false,
            },
          ]),
        ),
        flags: [],
        camera: { lostAt: null, lastHeartbeat: started },
      };
      db.prepare(
        "INSERT INTO exam_attempts(id,owner,role,level,credit_id,order_id,attempt_number,status,practice,snapshot,state,test_started_at,test_ends_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        owner,
        role,
        level,
        credit.creditId,
        credit.orderId,
        credit.attemptNumber,
        "TEST_IN_PROGRESS",
        m.mode === "practice" ? 1 : 0,
        JSON.stringify({ questions, cases }),
        JSON.stringify(state),
        iso(started),
        iso(started + SECTION_MS),
      );
      audit(id, owner, "attempt_started", {
        role,
        level,
        creditId: credit.creditId,
        practice: m.mode === "practice",
      });
      return { resumed: false, attempt: view(load(owner, id, true)) };
    });
  }

  function row(owner, id) {
    const a = db
      .prepare("SELECT * FROM exam_attempts WHERE id=? AND owner=?")
      .get(String(id), owner);
    if (!a) throw new ApiError(404, "Imtihon urinishi topilmadi.");
    return {
      ...a,
      snapshot: JSON.parse(a.snapshot),
      state: JSON.parse(a.state),
    };
  }
  function save(a) {
    const r = db
      .prepare(
        "UPDATE exam_attempts SET status=?,state=?,cases_started_at=?,cases_ends_at=?,submitted_at=?,test_score=?,case_score=?,final_score=?,timed_out=?,review_reason=?,version=version+1 WHERE id=? AND version=?",
      )
      .run(
        a.status,
        JSON.stringify(a.state),
        a.cases_started_at,
        a.cases_ends_at,
        a.submitted_at,
        a.test_score,
        a.case_score,
        a.final_score,
        a.timed_out,
        a.review_reason,
        a.id,
        a.version,
      );
    if (r.changes !== 1)
      throw new ApiError(
        409,
        "Imtihon holati boshqa oynada o‘zgardi. Sahifani yangilang.",
        "CONCURRENT_UPDATE",
      );
    a.version++;
  }
  const gradeTest = (a) =>
    a.snapshot.questions.reduce(
      (n, q, i) =>
        n +
        (q.options.find((o) => o.token === a.state.answers[i])?.index ===
        q.correct
          ? 1
          : 0),
      0,
    );
  function gradeCase(a, c) {
    const s = a.state.cases[c.id];
    const allRead = c.documents.every((d) => s.opened.includes(d.id));
    const decisions = c.decisions.every(
      (d) =>
        d.options.find((o) => o.token === s.decisions[d.id])?.index ===
        d.correct,
    );
    const ordered =
      s.order.length === c.workflow.length &&
      s.order.every(
        (tok, i) => c.workflow.find((w) => w.token === tok)?.index === i,
      );
    return {
      score: allRead && decisions && ordered ? CASE_POINTS : 0,
      checks: { allRead, decisions, ordered },
    };
  }

  function closeTest(a, at, timedOut) {
    a.test_score = gradeTest(a);
    a.status = "CASES_IN_PROGRESS";
    a.cases_started_at = iso(at);
    a.cases_ends_at = iso(at + SECTION_MS);
    if (timedOut) a.state.testTimedOut = true;
    audit(a.id, a.owner, "test_closed", { timedOut });
  }
  function reviewHold(a) {
    const flags = a.state.flags || [];
    return flags.some((f) => f.serious);
  }
  function finalize(a, at, timedOut) {
    if (!ACTIVE.includes(a.status)) return;
    if (a.status === "TEST_IN_PROGRESS") closeTest(a, at, timedOut);
    const results = a.snapshot.cases.map((c) => gradeCase(a, c));
    a.case_score = results.reduce((n, r) => n + r.score, 0);
    // Heartbeat gaps during the active sections are flagged for human review, never auto-disqualified.
    if (a.state.camera.lostAt && at - a.state.camera.lostAt > CAMERA_GRACE_MS)
      flag(a, "camera_absent_at_finish", true);
    const result = decideResult(a.test_score, a.case_score, {
      reviewHold: reviewHold(a),
    });
    a.final_score = result.finalScore;
    a.status = result.status;
    a.submitted_at = iso(at);
    a.timed_out = timedOut ? 1 : 0;
    a.state.caseResults = results.map((r, i) => ({
      id: a.snapshot.cases[i].id,
      score: r.score,
      checks: r.checks,
    }));
    if (result.status === "REVIEW_REQUIRED")
      a.review_reason = (a.state.flags || [])
        .filter((f) => f.serious)
        .map((f) => f.type)
        .join(", ");
    audit(a.id, a.owner, "attempt_finalized", {
      status: a.status,
      test: a.test_score,
      cases: a.case_score,
      final: a.final_score,
      timedOut,
    });
  }
  function flag(a, type, serious, detail) {
    a.state.flags ||= [];
    if (!a.state.flags.some((f) => f.type === type))
      a.state.flags.push({ type, serious, at: iso(), detail });
  }
  /** Apply server deadlines; refresh, other tabs or client clocks can never extend them. */
  function load(owner, id, inTx = false) {
    const a = row(owner, id);
    if (!ACTIVE.includes(a.status)) return a;
    const now = t(),
      testEnd = Date.parse(a.test_ends_at);
    let changed = false;
    if (a.status === "TEST_IN_PROGRESS" && now > testEnd + TOLERANCE_MS) {
      closeTest(a, testEnd, true);
      changed = true;
    }
    if (
      a.status === "CASES_IN_PROGRESS" &&
      now > Date.parse(a.cases_ends_at) + TOLERANCE_MS
    ) {
      finalize(a, Date.parse(a.cases_ends_at), true);
      changed = true;
    }
    if (
      a.state.camera.lastHeartbeat &&
      now - a.state.camera.lastHeartbeat > HEARTBEAT_GAP_MS * 3 &&
      ACTIVE.includes(a.status)
    ) {
      flag(a, "camera_heartbeat_gap", true, {
        seconds: Math.round((now - a.state.camera.lastHeartbeat) / 1000),
      });
      changed = true;
    }
    if (changed) {
      if (inTx) save(a);
      else tx(() => save(a));
    }
    return a;
  }
  function requireSection(a, section) {
    const deadline = Date.parse(
      section === "test" ? a.test_ends_at : a.cases_ends_at,
    );
    if (
      a.status !==
        (section === "test" ? "TEST_IN_PROGRESS" : "CASES_IN_PROGRESS") ||
      t() > deadline + TOLERANCE_MS
    )
      throw new ApiError(
        409,
        "Bu bo‘lim yopilgan yoki vaqti tugagan.",
        "SECTION_CLOSED",
      );
    if (a.state.camera.lostAt && t() - a.state.camera.lostAt > CAMERA_GRACE_MS)
      throw new ApiError(
        423,
        "Kamera o‘chgan. Javob kiritish kamera qayta yoqilguncha bloklangan; taymer davom etmoqda.",
        "CAMERA_REQUIRED",
      );
  }

  function view(a) {
    const finished = FINAL.includes(a.status);
    const credits = commerce.credits(a.owner, a.role, a.level);
    const base = {
      id: a.id,
      role: a.role,
      level: a.level,
      status: a.status,
      practice: !!a.practice,
      attemptNumber: a.attempt_number,
      attemptsGranted: 2,
      credits,
      serverNow: iso(),
      testStartedAt: a.test_started_at,
      testEndsAt: a.test_ends_at,
      casesStartedAt: a.cases_started_at,
      casesEndsAt: a.cases_ends_at,
      camera: {
        locked:
          !!a.state.camera.lostAt &&
          t() - a.state.camera.lostAt > CAMERA_GRACE_MS,
        lostAt: a.state.camera.lostAt ? iso(a.state.camera.lostAt) : null,
        graceMs: CAMERA_GRACE_MS,
      },
      flags: (a.state.flags || []).map((f) => ({
        type: f.type,
        serious: f.serious,
        at: f.at,
      })),
      orderRef: a.order_id,
    };
    if (a.status === "TEST_IN_PROGRESS")
      base.test = {
        questions: a.snapshot.questions.map((q, i) => ({
          index: i,
          prompt: q.prompt,
          options: q.options.map((o) => ({ id: o.token, text: o.text })),
        })),
        answers: a.state.answers,
      };
    if (a.status === "CASES_IN_PROGRESS")
      base.cases = a.snapshot.cases.map((c) => {
        const s = a.state.cases[c.id];
        return {
          id: c.id,
          title: c.title,
          scenario: c.scenario,
          submitted: s.submitted,
          opened: s.opened,
          documents: c.documents.map((d) => ({
            id: d.id,
            title: d.title,
            body: s.opened.includes(d.id) ? d.body : null,
            synthetic: d.synthetic,
          })),
          decisions: c.decisions.map((d) => ({
            id: d.id,
            prompt: d.prompt,
            options: d.options.map((o) => ({ id: o.token, text: o.text })),
            selected: s.decisions[d.id] || null,
          })),
          workflow: s.order.map((tok) => ({
            id: tok,
            text: c.workflow.find((w) => w.token === tok).text,
          })),
        };
      });
    if (finished) {
      base.result = {
        testScore: a.test_score,
        caseScore: a.case_score,
        finalScore: a.final_score,
        pass: PASS_SCORE,
        timedOut: !!a.timed_out,
        submittedAt: a.submitted_at,
        cases: (a.state.caseResults || []).map((r, i) => ({
          id: r.id,
          title: a.snapshot.cases[i].title,
          score: r.score,
          max: CASE_POINTS,
          feedback:
            r.score === CASE_POINTS
              ? "Holat to‘liq va to‘g‘ri hal qilingan."
              : [
                  !r.checks.allRead && "Barcha ish hujjatlari ochilmagan.",
                  !r.checks.decisions &&
                    "Kamida bitta protsessual qaror material bilan mos kelmadi.",
                  !r.checks.ordered &&
                    "Amaliy ish ketma-ketligi noto‘g‘ri tartiblangan.",
                ]
                  .filter(Boolean)
                  .join(" "),
        })),
        reviewReason: a.review_reason,
        appeal:
          db
            .prepare(
              "SELECT status,at FROM exam_appeals WHERE attempt_id=? ORDER BY at DESC LIMIT 1",
            )
            .get(a.id) || null,
        decisions: db
          .prepare(
            "SELECT decision,reason,at FROM exam_review_decisions WHERE attempt_id=? ORDER BY at",
          )
          .all(a.id),
      };
    }
    return base;
  }

  const getAttempt = (owner, id) => view(load(owner, id));
  function answers(owner, id, body) {
    return tx(() => {
      const a = load(owner, id, true);
      requireSection(a, "test");
      const entries = Object.entries(body?.answers || {});
      if (entries.length > QUESTIONS_PER_EXAM)
        throw new ApiError(400, "Javoblar soni noto‘g‘ri.");
      for (const [k, v] of entries) {
        const i = Number(k),
          q = a.snapshot.questions[i];
        if (!q) throw new ApiError(400, "Savol topilmadi.");
        if (v === null) {
          delete a.state.answers[i];
          continue;
        }
        if (!q.options.some((o) => o.token === v))
          throw new ApiError(400, "Javob varianti topilmadi.");
        a.state.answers[i] = v;
      }
      save(a);
      return { saved: Object.keys(a.state.answers).length, serverNow: iso() };
    });
  }
  function submitTest(owner, id) {
    return tx(() => {
      const a = load(owner, id, true);
      if (a.status !== "TEST_IN_PROGRESS") return view(a); // idempotent
      closeTest(a, Math.min(t(), Date.parse(a.test_ends_at)), false);
      save(a);
      return view(a);
    });
  }
  function caseEvent(owner, id, caseId, body) {
    return tx(() => {
      const a = load(owner, id, true);
      requireSection(a, "cases");
      const c = a.snapshot.cases.find((x) => x.id === caseId),
        s = a.state.cases[caseId];
      if (!c) throw new ApiError(404, "Amaliy holat topilmadi.");
      if (s.submitted)
        throw new ApiError(409, "Bu holat topshirilgan.", "CASE_SUBMITTED");
      if (body?.type === "open") {
        if (!c.documents.some((d) => d.id === body.documentId))
          throw new ApiError(400, "Hujjat topilmadi.");
        if (!s.opened.includes(body.documentId)) s.opened.push(body.documentId);
      } else if (body?.type === "decision") {
        const d = c.decisions.find((x) => x.id === body.decisionId);
        if (!d || !d.options.some((o) => o.token === body.optionId))
          throw new ApiError(400, "Qaror varianti topilmadi.");
        s.decisions[d.id] = body.optionId;
      } else if (body?.type === "order") {
        const order = body.order;
        if (
          !Array.isArray(order) ||
          order.length !== c.workflow.length ||
          new Set(order).size !== order.length ||
          !order.every((tok) => c.workflow.some((w) => w.token === tok))
        )
          throw new ApiError(400, "Ketma-ketlik noto‘g‘ri.");
        s.order = order;
      } else throw new ApiError(400, "Harakat turi noto‘g‘ri.");
      save(a);
      return view(a);
    });
  }
  function submitCase(owner, id, caseId) {
    return tx(() => {
      const a = load(owner, id, true);
      requireSection(a, "cases");
      const s = a.state.cases[caseId];
      if (!s) throw new ApiError(404, "Amaliy holat topilmadi.");
      s.submitted = true;
      audit(a.id, owner, "case_submitted", { caseId });
      save(a);
      return view(a);
    });
  }
  function finish(owner, id) {
    return tx(() => {
      const a = load(owner, id, true);
      if (FINAL.includes(a.status)) return view(a); // idempotent
      if (a.status !== "CASES_IN_PROGRESS")
        throw new ApiError(
          409,
          "Avval test bo‘limini topshiring.",
          "TEST_OPEN",
        );
      finalize(a, Math.min(t(), Date.parse(a.cases_ends_at)), false);
      save(a);
      return view(a);
    });
  }

  const SIGNALS = new Set([
    "camera_heartbeat",
    "camera_lost",
    "camera_restored",
    "visibility_hidden",
    "visibility_visible",
    "window_blur",
    "fullscreen_exit",
    "multiple_tabs",
    "network_offline",
    "network_online",
  ]);
  function proctorEvent(owner, id, body) {
    return tx(() => {
      const a = load(owner, id, true);
      if (!ACTIVE.includes(a.status)) return { ignored: true };
      const type = String(body?.type || "");
      if (!SIGNALS.has(type))
        throw new ApiError(400, "Nazorat hodisasi turi noto‘g‘ri.");
      const recent = db
        .prepare(
          "SELECT COUNT(*) n FROM exam_proctor_events WHERE attempt_id=? AND at>?",
        )
        .get(a.id, iso(t() - 60000)).n;
      if (recent > 90) throw new ApiError(429, "Juda ko‘p nazorat hodisasi.");
      const now = t();
      db.prepare(
        "INSERT INTO exam_proctor_events(attempt_id,type,detail,client_at,at) VALUES(?,?,?,?,?)",
      ).run(
        a.id,
        type,
        JSON.stringify(body.detail ?? null).slice(0, 500),
        typeof body.at === "string" ? body.at.slice(0, 40) : null,
        iso(now),
      );
      const cam = a.state.camera;
      if (type === "camera_heartbeat") {
        if (cam.lastHeartbeat && now - cam.lastHeartbeat > HEARTBEAT_GAP_MS)
          flag(a, "camera_heartbeat_gap", true, {
            seconds: Math.round((now - cam.lastHeartbeat) / 1000),
          });
        cam.lastHeartbeat = now;
        if (body.detail?.active === false && !cam.lostAt) cam.lostAt = now;
        if (body.detail?.active === true && cam.lostAt) {
          if (now - cam.lostAt > CAMERA_GRACE_MS)
            flag(a, "camera_absent", true, {
              seconds: Math.round((now - cam.lostAt) / 1000),
            });
          cam.lostAt = null;
        }
      } else if (type === "camera_lost") {
        cam.lostAt ||= now;
      } else if (type === "camera_restored") {
        if (cam.lostAt && now - cam.lostAt > CAMERA_GRACE_MS)
          flag(a, "camera_absent", true, {
            seconds: Math.round((now - cam.lostAt) / 1000),
          });
        cam.lostAt = null;
        cam.lastHeartbeat = now;
      } else if (type === "visibility_hidden" || type === "window_blur") {
        a.state.leaves = (a.state.leaves || 0) + 1;
        if (a.state.leaves >= 3)
          flag(a, "repeated_focus_loss", true, { count: a.state.leaves });
      } else if (type === "multiple_tabs") flag(a, "concurrent_session", true);
      save(a);
      return { camera: view(a).camera, flags: (a.state.flags || []).length };
    });
  }
  function appeal(owner, id, body) {
    const a = row(owner, id);
    if (!["DISQUALIFIED", "REVIEW_REQUIRED", "FAILED"].includes(a.status))
      throw new ApiError(409, "Bu natija uchun apellyatsiya talab qilinmaydi.");
    const text = String(body?.text || "").trim();
    if (text.length < 20 || text.length > 4000)
      throw new ApiError(400, "Apellyatsiya matni 20–4000 belgi bo‘lsin.");
    db.prepare("INSERT INTO exam_appeals VALUES(?,?,?,?,?,?)").run(
      randomUUID(),
      a.id,
      owner,
      text,
      "submitted",
      iso(),
    );
    audit(a.id, owner, "appeal_submitted", {});
    return view(a);
  }

  // ---------------------------------------------------------------- admin review (token-protected)
  function requireAdmin(tokenHeader) {
    const expected = env.HUQUQBEK_ADMIN_TOKEN;
    if (!expected)
      throw new ApiError(
        503,
        "Admin tekshiruv vositasi sozlanmagan.",
        "ADMIN_NOT_CONFIGURED",
      );
    const a = Buffer.from(String(tokenHeader || "")),
      b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      throw new ApiError(403, "Ruxsat yo‘q.");
  }
  function reviews(tokenHeader) {
    requireAdmin(tokenHeader);
    return {
      attempts: db
        .prepare(
          "SELECT id,owner,role,level,status,test_score,case_score,final_score,review_reason,attempt_number,order_id,test_started_at,submitted_at FROM exam_attempts WHERE status IN ('REVIEW_REQUIRED','DISQUALIFIED') ORDER BY submitted_at DESC LIMIT 200",
        )
        .all()
        .map((a) => ({
          ...a,
          events: db
            .prepare(
              "SELECT type,detail,at FROM exam_proctor_events WHERE attempt_id=? AND type!=? ORDER BY at LIMIT 200",
            )
            .all(a.id, "camera_heartbeat"),
          appeals: db
            .prepare(
              "SELECT text,status,at FROM exam_appeals WHERE attempt_id=?",
            )
            .all(a.id),
        })),
      identities: db
        .prepare(
          "SELECT owner,full_name,method,consent_at FROM exam_identity WHERE status='pending'",
        )
        .all(),
    };
  }
  function decide(tokenHeader, id, body) {
    requireAdmin(tokenHeader);
    const decision = body?.decision,
      reason = String(body?.reason || "").trim(),
      reviewer = String(body?.reviewer || "")
        .trim()
        .slice(0, 80);
    if (
      !["CLEAR", "DISQUALIFY", "REQUEST_MORE_INFO"].includes(decision) ||
      reason.length < 5 ||
      !reviewer
    )
      throw new ApiError(400, "Qaror, sabab va tekshiruvchi kerak.");
    return tx(() => {
      const a = db
        .prepare("SELECT owner FROM exam_attempts WHERE id=?")
        .get(String(id));
      if (!a) throw new ApiError(404, "Urinish topilmadi.");
      const at = row(a.owner, id);
      if (
        !["REVIEW_REQUIRED", "DISQUALIFIED", "PASSED", "FAILED"].includes(
          at.status,
        )
      )
        throw new ApiError(
          409,
          "Faol imtihonni yakunlanmaguncha baholab bo‘lmaydi.",
        );
      if (decision === "CLEAR") {
        at.status = decideResult(at.test_score, at.case_score).status;
        at.state.flags = (at.state.flags || []).map((f) => ({
          ...f,
          serious: false,
          cleared: true,
        }));
      }
      if (decision === "DISQUALIFY") {
        at.status = "DISQUALIFIED";
        db.prepare(
          "UPDATE exam_certificates SET status='revoked',revoked_at=?,revoked_reason=? WHERE attempt_id=? AND status='issued'",
        ).run(iso(), "Exam disqualified after review: " + reason, at.id);
      }
      db.prepare("INSERT INTO exam_review_decisions VALUES(?,?,?,?,?,?)").run(
        randomUUID(),
        at.id,
        decision,
        reason,
        reviewer,
        iso(),
      );
      audit(at.id, at.owner, "review_decision", { decision, reviewer });
      save(at);
      return { id: at.id, status: at.status };
    });
  }
  function decideIdentity(tokenHeader, owner, body) {
    requireAdmin(tokenHeader);
    const status = body?.approve === true ? "verified" : "rejected";
    const r = db
      .prepare(
        "UPDATE exam_identity SET status=?,reviewed_at=?,reviewer=?,note=? WHERE owner=? AND status='pending'",
      )
      .run(
        status,
        iso(),
        String(body?.reviewer || "admin").slice(0, 80),
        String(body?.note || "").slice(0, 300),
        String(owner),
      );
    if (!r.changes) throw new ApiError(404, "Kutilayotgan so‘rov topilmadi.");
    audit(null, owner, "identity_reviewed", { status });
    return { owner, status };
  }

  // ---------------------------------------------------------------- certificates (exam-pass gated)
  function certificateState(owner) {
    const e = eligibility(owner).exams;
    return Object.fromEntries(
      Object.entries(e).map(([k, v]) => {
        const cert = v.certificateId
          ? publicCertificate(
              db
                .prepare("SELECT * FROM exam_certificates WHERE id=?")
                .get(v.certificateId),
              true,
            )
          : null;
        return [
          k,
          {
            role: v.role,
            level: v.level,
            state: v.state,
            owned: v.owned,
            credits: v.credits,
            lastAttempt: v.lastAttempt,
            certificate: cert,
          },
        ];
      }),
    );
  }
  function publicCertificate(c, owner = false) {
    if (!c) return null;
    return {
      id: c.id,
      role: c.role,
      level: c.level,
      issuedAt: c.issued_at,
      status: c.status,
      environment: c.environment,
      ...(owner
        ? {
            firstName: c.first_name,
            lastName: c.last_name,
            attemptId: c.attempt_id,
          }
        : {}),
      label: "HuquqBek educational achievement",
    };
  }
  const cleanName = (v) => {
    const s = String(v ?? "")
      .normalize("NFC")
      .replace(/\s+/g, " ")
      .trim();
    if (s.length < 1 || s.length > 48 || /[<>{}\\\u0000-\u001f]/.test(s))
      throw new ApiError(400, "Ism va familiya 1–48 belgi bo‘lsin.");
    return s;
  };
  function issueCertificate(owner, body) {
    const role = body?.role,
      level = body?.level;
    checkRoleLevel(role, level);
    return tx(() => {
      const existing = db
        .prepare(
          "SELECT * FROM exam_certificates WHERE owner=? AND role=? AND level=? AND status='issued'",
        )
        .get(owner, role, level);
      if (existing) return publicCertificate(existing, true);
      if (!commerce.ownsPackage(owner, role, level))
        throw new ApiError(
          403,
          "Sertifikat uchun shu rol va daraja paketi kerak.",
          "PACKAGE_REQUIRED",
          { pricingUrl: "#/pricing" },
        );
      const passed = db
        .prepare(
          "SELECT * FROM exam_attempts WHERE owner=? AND role=? AND level=? AND status='PASSED' AND final_score>=? ORDER BY submitted_at DESC LIMIT 1",
        )
        .get(owner, role, level, PASS_SCORE);
      if (!passed)
        throw new ApiError(
          409,
          "Sertifikat faqat imtihondan kamida 70/100 ball bilan o‘tgandan so‘ng beriladi.",
          "EXAM_NOT_PASSED",
        );
      if (identity(owner).status !== "verified")
        throw new ApiError(409, "Shaxs tasdiqlanmagan.", "IDENTITY_REQUIRED");
      if (passed.practice && !dev())
        throw new ApiError(
          409,
          "Sinov bankidagi natija sertifikat bermaydi.",
          "PRACTICE_RESULT",
        );
      const env = passed.practice ? "development" : "production";
      const id = `${env === "development" ? "DEV-" : ""}HQB-${roleCode[role]}-${level[0].toUpperCase()}-${randomBytes(5).toString("hex").toUpperCase()}`;
      db.prepare(
        "INSERT INTO exam_certificates VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)",
      ).run(
        id,
        owner,
        role,
        level,
        cleanName(body.firstName),
        cleanName(body.lastName),
        iso(),
        "issued",
        passed.id,
        passed.order_id,
        env,
      );
      audit(passed.id, owner, "certificate_issued", { id });
      return publicCertificate(
        db.prepare("SELECT * FROM exam_certificates WHERE id=?").get(id),
        true,
      );
    });
  }
  function myCertificate(owner, id) {
    const c = db
      .prepare("SELECT * FROM exam_certificates WHERE id=? AND owner=?")
      .get(String(id), owner);
    if (!c) throw new ApiError(404, "Sertifikat topilmadi.");
    return publicCertificate(c, true);
  }
  function verifyCertificate(id) {
    const c = /^[A-Z0-9-]{8,40}$/.test(String(id))
      ? db.prepare("SELECT * FROM exam_certificates WHERE id=?").get(String(id))
      : null;
    if (!c)
      return {
        valid: false,
        status: "not_found",
        label: "HuquqBek educational achievement",
      };
    return {
      valid: c.status === "issued" && c.environment === "production",
      status: c.status,
      role: c.role,
      level: c.level,
      issuedAt: c.issued_at,
      environment: c.environment,
      name: `${c.first_name} ${c.last_name.slice(0, 1)}.`,
      label: "HuquqBek educational achievement",
      notLicense: true,
    };
  }

  return {
    eligibility,
    rules,
    acceptRules,
    cameraCheck,
    identity,
    submitIdentity,
    start,
    getAttempt,
    answers,
    submitTest,
    caseEvent,
    submitCase,
    finish,
    proctorEvent,
    appeal,
    reviews,
    decide,
    decideIdentity,
    certificateState,
    issueCertificate,
    myCertificate,
    verifyCertificate,
    material,
  };
}

export function loadExtraBankDir(url) {
  const dir = new URL(url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  return existsSync(dir) && readdirSync(dir).length ? dir : null;
}
