// HuquqBek writing system: the revised Uzbek Latin alphabet (OʻRQ-1184, 21.10.2026; in force 22.04.2027).
// A B D E F G Ğ H I J K L M N O Ö P Q R S Ş Ç T U V X Y Z + tutuq (ʼ).
// Shared by the browser (UI, STT transcripts, AI replies) and the server (normalisation, TTS adapter).

const APOS = "[ʻ‘’'`ʼ]"; // ʻ ‘ ’ ' ` ʼ written after o/g in the current Latin script
const O_RE = new RegExp(`([Oo])${APOS}`, 'g');
const G_RE = new RegExp(`([Gg])${APOS}`, 'g');
// Protected spans: URLs, e-mails, file paths, ids such as E1 / M01 / CH_JUDGE, code-like tokens.
const PROTECT = /(https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w-]+\.[\w.]+|\b[A-Z]{1,4}_[A-Z0-9_]+\b|\/[\w./-]+\.\w+|\b[A-Za-z]+\d+[A-Za-z\d]*\b)/g;

function convertPlain(s) {
  return s
    .replace(O_RE, (_, o) => (o === 'O' ? 'Ö' : 'ö'))
    .replace(G_RE, (_, g) => (g === 'G' ? 'Ğ' : 'ğ'))
    .replace(/S[Hh]|sh/g, m => (m[0] === 'S' ? 'Ş' : 'ş'))
    .replace(/C[Hh]|ch/g, m => (m[0] === 'C' ? 'Ç' : 'ç'));
}

/** Current Uzbek Latin (oʻ, gʻ, sh, ch) -> revised alphabet (ö, ğ, ş, ç). Idempotent. */
export function toRevised(text) {
  if (typeof text !== 'string' || !text) return text;
  let out = '';
  let last = 0;
  for (const m of text.matchAll(PROTECT)) {
    out += convertPlain(text.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + convertPlain(text.slice(last));
}

/** Revised alphabet -> current Latin spelling, for VoiceLab TTS pronunciation only. Never displayed. */
export function toTtsLatin(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/Ş(?=[A-ZÖĞŞÇ])/g, 'SH').replace(/Ç(?=[A-ZÖĞŞÇ])/g, 'CH')
    // VoiceLab's catalog spells Uzbek with an ASCII apostrophe (O'zbek); modifier letters were skipped in tests.
    .replace(/Ö/g, "O'").replace(/ö/g, "o'")
    .replace(/Ğ/g, "G'").replace(/ğ/g, "g'")
    .replace(/[ʼʻ’‘`]/g, "'")
    .replace(/Ş/g, 'Sh').replace(/ş/g, 'sh')
    .replace(/Ç/g, 'Ch').replace(/ç/g, 'ch');
}

// Frequent STT confusions for courtroom vocabulary (applied after toRevised, whole words, case-preserving).
const LEGAL_FIXES = [
  [/\bsutya\b/giu, 'sudya'], [/\bprakuror\b/giu, 'prokuror'], [/\badvakat\b/giu, 'advokat'],
  [/\bdaliyl\b/giu, 'dalil'], [/\bguvox\b/giu, 'guvoh'], [/\bsut\s+majlisi\b/giu, 'sud majlisi'],
  [/\bmaçlis\b/giu, 'majlis'], [/\bekspertiza\s+xulosa\b/giu, 'ekspertiza xulosasi'],
  [/\bxurmatli\b/giu, 'hurmatli'], [/\be['ʼ]?tiroz\b/giu, 'eʼtiroz'], [/\bda['ʼ]?vogar\b/giu, 'daʼvogar'],
];

/** Normalises a speech transcript: revised alphabet + legal vocabulary + whitespace. */
export function normalizeTranscript(text) {
  let t = toRevised(String(text || '')).replace(/\s+/g, ' ').trim();
  for (const [re, word] of LEGAL_FIXES) {
    t = t.replace(re, m => (m[0] === m[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word));
  }
  return t;
}

// Only human-readable fields are converted; ids, urls, grammar strings and enums stay untouched.
export const DISPLAY_KEYS = new Set(['answer', 'ask', 'body', 'facts', 'feedback', 'finalTask', 'goal', 'helps', 'issue', 'label',
  'locator', 'name', 'note', 'opening', 'outcome', 'position', 'privateFact', 'prompt', 'region', 'settlement', 'stakes', 'subtitle',
  'summary', 'text', 'title', 'difficulty', 'sourceNote', 'roleUz', 'personality', 'appearance', 'wardrobe']);

/** Deep-convert JSON content: strings under display keys (or keys ending in "Uz") only. */
export function convertContent(value, key = '') {
  if (Array.isArray(value)) return value.map(v => convertContent(v, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convertContent(v, k)]));
  }
  if (typeof value === 'string' && (DISPLAY_KEYS.has(key) || /Uz$/.test(key))) return toRevised(value);
  return value;
}
