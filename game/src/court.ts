// Authoritative courtroom state machine. AI providers only PROPOSE intents; this reducer decides.
export type CourtPhase =
  | "preparation"
  | "opening"
  | "testimony"
  | "evidence"
  | "arguments"
  | "final"
  | "decision"
  | "paused";
export interface CourtState {
  phase: CourtPhase;
  resumeTo?: CourtPhase;
  submitted: string[];
  examined: string[];
  challenged: Record<string, "sustained" | "overruled">;
  witnessCalled: boolean;
  objections: number;
  log: string[];
}
export const phaseNames: Record<CourtPhase, string> = {
  preparation: "Tayyorgarlik",
  opening: "Sud majlisi oçildi",
  testimony: "Guvoh körsatmasi",
  evidence: "Dalillarni tekşiriş",
  arguments: "Taraflar nutqi",
  final: "Yakuniy söz",
  decision: "Ökuv qarori",
  paused: "Tanaffus",
};
export const flow: CourtPhase[] = [
  "preparation",
  "opening",
  "testimony",
  "evidence",
  "arguments",
  "final",
  "decision",
];
const HEARING: CourtPhase[] = [
  "opening",
  "testimony",
  "evidence",
  "arguments",
  "final",
];

export const initialCourt = (): CourtState => ({
  phase: "preparation",
  submitted: [],
  examined: [],
  challenged: {},
  witnessCalled: false,
  objections: 0,
  log: [],
});

/** Accepts states saved by HuquqBek 0.3 ('hearing' / 'closing') and fills new fields. */
export function migrateCourt(s: unknown, validIds?: string[]): CourtState {
  const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
  const map: Record<string, CourtPhase> = {
    hearing: "opening",
    closing: "arguments",
  };
  const candidate =
    typeof o.phase === "string" ? map[o.phase] || o.phase : "preparation";
  const phase =
    flow.includes(candidate as CourtPhase) || candidate === "paused"
      ? (candidate as CourtPhase)
      : "preparation";
  const ids = (v: unknown) =>
    Array.isArray(v)
      ? [
          ...new Set(
            v.filter(
              (x): x is string =>
                typeof x === "string" &&
                /^E[0-9]{1,3}$/.test(x) &&
                (!validIds || validIds.includes(x)),
            ),
          ),
        ].slice(0, 100)
      : [];
  const submitted = ids(o.submitted);
  const challenged: CourtState["challenged"] = {};
  if (o.challenged && typeof o.challenged === "object")
    for (const [id, r] of Object.entries(o.challenged)) {
      if (submitted.includes(id) && (r === "sustained" || r === "overruled"))
        challenged[id] = r;
    }
  return {
    phase,
    submitted,
    examined: ids(o.examined).filter(
      (id) => submitted.includes(id) && challenged[id] !== "sustained",
    ),
    challenged,
    witnessCalled: o.witnessCalled === true,
    objections:
      Number.isSafeInteger(o.objections) && Number(o.objections) >= 0
        ? Math.min(Number(o.objections), 10000)
        : 0,
    log: Array.isArray(o.log)
      ? o.log
          .filter((x): x is string => typeof x === "string")
          .slice(-60)
          .map((x) => x.slice(0, 1800))
      : [],
    ...(phase === "paused"
      ? {
          resumeTo: HEARING.includes(o.resumeTo as CourtPhase)
            ? (o.resumeTo as CourtPhase)
            : "opening",
        }
      : {}),
  };
}

export interface CourtResult {
  state: CourtState;
  ok: boolean;
  line: string;
}

/**
 * Apply an intent. `actor` is who would authorise it: only the judge (or the clerk relaying a player-judge) may change the case.
 * Returns the new state, whether it was accepted, and a scripted judge line used when no AI reply is available.
 */
export function courtAction(
  s: CourtState,
  intent: string,
  id: string | null,
  actor: string,
  read: string[],
  validIds: string[],
  playerRole?: string,
  ruling?: "sustained" | "overruled" | null,
  courtType?: string,
): CourtResult {
  if (playerRole === "sudya" && actor === "CH_CLERK") actor = "CH_JUDGE";
  const same = (line = ""): CourtResult => ({ state: s, ok: false, line });
  if (
    actor === "CH_QONUNAI" ||
    !intent ||
    intent === "none" ||
    intent === "question"
  )
    return same();
  if (actor !== "CH_JUDGE")
    return same(
      "Bu harakatni faqat sudya ruxsat beradi. Sudyaga murojaat qiling.",
    );
  if (s.phase === "decision")
    return same("Mashq qarori chiqarilgan. Yangi urinish boshlang.");
  const next: CourtState = structuredClone(s);
  const done = (line: string, log = line): CourtResult => {
    next.log = [...next.log, log].slice(-60);
    return { state: next, ok: true, line };
  };
  const refuse = (line: string): CourtResult => ({
    state: { ...s, log: [...s.log, `Rad etildi: ${line}`].slice(-60) },
    ok: false,
    line,
  });
  const inHearing = HEARING.includes(s.phase);

  switch (intent) {
    case "begin_hearing":
      if (s.phase === "preparation") {
        next.phase = "opening";
        return done(
          "Sud majlisi oçiq deb eʼlon qilinadi. Taraflar, öz pozitsiyangizni qisqa bayon qiling.",
          "Sudya majlisni oçdi.",
        );
      }
      if (s.phase === "paused") {
        next.phase = s.resumeTo || "opening";
        delete next.resumeTo;
        return done(
          "Tanaffus tugadi. Sud majlisi davom etadi.",
          "Majlis davom ettirildi.",
        );
      }
      return refuse("Majlis allaqaçon davom etmoqda.");
    case "call_witness":
      if (courtType)
        return refuse(
          "Bu mashqda ko‘rsatmalar yozma materiallarda. Alohida guvoh personaji yo‘q.",
        );
      if (!["opening", "testimony", "evidence"].includes(s.phase))
        return refuse("Guvoh faqat majlis davomida çaqiriladi.");
      next.witnessCalled = true;
      next.phase = "testimony";
      return done(
        "Guvoh sud zaliga taklif qilinsin. Guvoh, tribunaga yaqinlaşing va körsatma bering.",
        "Guvoh çaqirildi.",
      );
    case "submit_evidence":
      if (!["opening", "testimony", "evidence"].includes(s.phase))
        return refuse("Dalil faqat majlisning dalil bosqiçida taqdim etiladi.");
      if (!id || !validIds.includes(id))
        return refuse("Qaysi dalil taqdim etilayotgani aniq emas.");
      if (!read.includes(id))
        return refuse(`${id} hali öqilmagan. Avval hujjatni öqing.`);
      if (s.submitted.includes(id))
        return refuse(`${id} allaqaçon taqdim etilgan.`);
      next.submitted.push(id);
      next.phase = "evidence";
      return done(
        `${id} dalili ish hujjatlariga qabul qilindi. Endi uni sudda tekşiramiz.`,
        `${id}: taqdim etildi.`,
      );
    case "examine_evidence":
      if (!["opening", "testimony", "evidence"].includes(s.phase))
        return refuse(
          "Dalil faqat dalillarni tekshirish bosqichida tekshiriladi.",
        );
      if (!id || !validIds.includes(id)) return refuse("Dalil topilmadi.");
      if (!id || !s.submitted.includes(id))
        return refuse("Avval dalil taqdim etilişi kerak.");
      if (s.examined.includes(id))
        return refuse(`${id} allaqaçon tekşirilgan.`);
      if (s.challenged[id] === "sustained")
        return refuse(
          `${id} böyiça eʼtiroz qanoatlantirilgan; dalil tekşirilmaydi.`,
        );
      next.examined.push(id);
      next.phase = "evidence";
      return done(
        `${id} dalili sudda tekşirildi. Taraflar uni baholaşi mumkin.`,
        `${id}: sudda tekşirildi.`,
      );
    case "objection": {
      if (!inHearing)
        return refuse("Eʼtiroz faqat majlis davomida bildiriladi.");
      next.objections++;
      const r =
        ruling ||
        (id && !s.examined.includes(id) && s.submitted.includes(id)
          ? "sustained"
          : "overruled");
      if (id && validIds.includes(id)) next.challenged[id] = r;
      return done(
        r === "sustained"
          ? `Eʼtiroz qanoatlantiriladi${id ? `: ${id} hozirça dalil sifatida tekşirilmaydi` : ""}.`
          : "Eʼtiroz rad etiladi. Davom eting.",
        `Eʼtiroz${id ? ` (${id})` : ""}: ${r === "sustained" ? "qanoatlantirildi" : "rad etildi"}.`,
      );
    }
    case "request_break":
      if (!inHearing)
        return refuse("Tanaffus faqat majlis davomida eʼlon qilinadi.");
      next.resumeTo = s.phase;
      next.phase = "paused";
      return done(
        "Sud majlisida qisqa tanaffus eʼlon qilinadi.",
        "Tanaffus eʼlon qilindi.",
      );
    case "closing_argument":
      if (!["testimony", "evidence"].includes(s.phase))
        return refuse(
          "Taraflar nutqi dalillar tekşirilgandan keyin boşlanadi.",
        );
      if (!s.examined.length)
        return refuse("Kamida bitta dalil sudda tekşirilişi kerak.");
      next.phase = "arguments";
      return done(
        "Dalillar tekşirildi. Taraflar, nutqlaringizni eşitamiz.",
        "Taraflar nutqi bosqiçi oçildi.",
      );
    case "final_statement":
      if (courtType && courtType !== "criminal")
        return refuse(
          "Bu ishda jinoyat protsessidagi oxirgi so‘z bosqichi qo‘llanmaydi.",
        );
      if (s.phase !== "arguments")
        return refuse("Yakuniy söz taraflar nutqidan keyin beriladi.");
      next.phase = "final";
      return done("Taraflarga yakuniy söz beriladi.", "Yakuniy söz bosqiçi.");
    case "request_decision":
      if (courtType === "criminal" && s.phase !== "final")
        return refuse("Sudlanuvchining oxirgi so‘zi bosqichini yakunlang.");
      if (!["arguments", "final"].includes(s.phase))
        return refuse(
          "Qaror taraflar nutqi va yakuniy sözdan keyin çiqariladi.",
        );
      if (!s.examined.length)
        return refuse("Qaror uçun kamida bitta tekşirilgan dalil kerak.");
      next.phase = "decision";
      return done(
        "Sud maslahatlaşuv xonasiga ketadi. Ökuv qarori loyihasi tayyorlanmoqda.",
        "Ökuv qarori loyihasi sörandi.",
      );
  }
  return same();
}

/** Actions the learner can request in the current phase (drives the action bar and offline play). */
export function availableActions(
  s: CourtState,
  read: string[],
): { intent: string; label: string; needsEvidence?: boolean }[] {
  const a: { intent: string; label: string; needsEvidence?: boolean }[] = [];
  if (s.phase === "preparation" || s.phase === "paused")
    a.push({
      intent: "begin_hearing",
      label:
        s.phase === "paused"
          ? "Majlisni davom ettiriş"
          : "Majlisni boşlaşni sörash",
    });
  if (["opening", "testimony", "evidence"].includes(s.phase)) {
    if (!s.witnessCalled)
      a.push({ intent: "call_witness", label: "Guvohni çaqiriş" });
    if (read.some((id) => !s.submitted.includes(id)))
      a.push({
        intent: "submit_evidence",
        label: "Dalil taqdim etiş",
        needsEvidence: true,
      });
    if (s.submitted.some((id) => !s.examined.includes(id)))
      a.push({
        intent: "examine_evidence",
        label: "Dalilni tekşiriş",
        needsEvidence: true,
      });
    if (s.examined.length)
      a.push({ intent: "closing_argument", label: "Taraflar nutqiga ötiş" });
  }
  if (HEARING.includes(s.phase)) {
    a.push({ intent: "objection", label: "Eʼtiroz bildiriş" });
    a.push({ intent: "request_break", label: "Tanaffus sörash" });
  }
  if (s.phase === "arguments")
    a.push({ intent: "final_statement", label: "Yakuniy söz" });
  if (["arguments", "final"].includes(s.phase))
    a.push({ intent: "request_decision", label: "Qaror çiqarişni sörash" });
  return a;
}
