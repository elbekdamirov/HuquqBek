// VoiceLab: the only STT and TTS provider (https://docs.voicelab.uz/api/stt, /realtime-stt, /tts).
import { randomUUID, createHash } from 'node:crypto';
import { toTtsLatin, normalizeTranscript } from '../src/alphabet.mjs';
import { languageCode } from './language.mjs';
import { ApiError, remote, usage } from './runtime.mjs';

const API = 'https://api.voicelab.uz';
const auth = key => ({ Authorization: `Bearer ${key}` });

// Preferred voice character per role (used when the catalog exposes gender/name hints).
const ROLE_VOICE = {
  CH_OPPOSING_COUNSEL:'male', CH_JUDGE: 'male', CH_PROSECUTOR: 'male', CH_RESPONDENT: 'male', CH_SECURITY: 'male', CH_PUBLIC_2: 'male',
  CH_ADVOCATE: 'female', CH_WITNESS: 'female', CH_VICTIM: 'female', CH_PLAINTIFF: 'female', CH_CLERK: 'female', CH_PUBLIC_1: 'female', CH_PUBLIC_3: 'female',
  CH_QONUNAI: 'any',
};
const ORDER = ['CH_JUDGE', 'CH_ADVOCATE', 'CH_PROSECUTOR', 'CH_OPPOSING_COUNSEL', 'CH_QONUNAI', 'CH_RESPONDENT', 'CH_WITNESS', 'CH_CLERK', 'CH_VICTIM', 'CH_PLAINTIFF', 'CH_SECURITY', 'CH_PUBLIC_1', 'CH_PUBLIC_2', 'CH_PUBLIC_3'];

let catalog = new Map(); // { model_id, voices:[{id,name,gender}], assignment:{actor:voiceId} }
export function resetVoices() { catalog.clear(); cache.clear(); }

function genderOf(v) {
  const s = `${v.gender || v.sex || ''} ${(v.labels && JSON.stringify(v.labels)) || ''} ${v.name || ''} ${v.description || ''}`.toLowerCase();
  if (/\b(female|woman|ayol|qiz|f)\b/.test(s)) return 'female';
  if (/\b(male|man|erkak|m)\b/.test(s)) return 'male';
  return 'unknown';
}

export async function voices(key, language='uz') {
  languageCode(language);
  const catalogKey=createHash('sha256').update(key||'').digest('hex')+':'+language;
  if (catalog.has(catalogKey)) return catalog.get(catalogKey);
  if (!key) throw new ApiError(503, 'VoiceLab kaliti serverga kiritilmagan.');
  const langs = await (await remote('voicelab', `${API}/v1/tts/languages`, { headers: auth(key) }, 12000, 1)).json();
  const models = langs.models || langs.data?.models || [];
  const compatible=models.filter(m=>(m.languages||[]).some(l=>(l.code||l)===language));
  const model = compatible.find(m=>m.id===process.env.VOICELAB_MODEL) || compatible.find(m=>m.recommended) || compatible[0];
  if (!model?.id) throw new ApiError(503, `VoiceLab: no compatible model for ${language}.`);
  const list = await (await remote('voicelab', `${API}/v1/voices?language=${language}&model_id=${encodeURIComponent(model.id)}`, { headers: auth(key) }, 12000, 1)).json();
  const all = (list.data || []).filter(v => v?.id).map(v => ({ id: v.id, name: v.name || v.display_name || v.id, gender: genderOf(v) }));
  if (!all.length) throw new ApiError(503, `VoiceLab: no compatible voice for ${language}.`);
  const assignment = {}; const used = new Map();
  for (const actor of ORDER) {
    const env = process.env[`VOICELAB_VOICE_${language.toUpperCase()}_${actor.replace('CH_', '')}`] || process.env[`VOICELAB_VOICE_${actor.replace('CH_', '')}`];
    if (env && all.some(v => v.id === env)) { assignment[actor] = env; continue; }
    const want = ROLE_VOICE[actor];
    const pool = all.filter(v => want === 'any' || v.gender === want || v.gender === 'unknown');
    const candidates = (pool.length ? pool : all).slice().sort((a, b) => (used.get(a.id) || 0) - (used.get(b.id) || 0));
    assignment[actor] = candidates[0].id; used.set(candidates[0].id, (used.get(candidates[0].id) || 0) + 1);
  }
  const result = { language, model_id: model.id, voices: all, assignment };
  catalog.set(catalogKey,result);
  return result;
}

// ------------------------------------------------------------------ TTS
const cache = new Map(); // sha1(actor+text) -> Buffer, LRU 60
export async function tts(key, text, actor = 'CH_QONUNAI', language='uz') {
  if (typeof text !== 'string' || !text.trim() || text.length > 1800) throw new ApiError(400, 'Ovoz matni 1–1800 belgi bölsin.');
  languageCode(language);
  const spoken = language==='uz'?toTtsLatin(text.trim()):text.trim(); // pronunciation adapter; the displayed text keeps the revised alphabet
  const cat = await voices(key,language);
  const voice_id = cat.assignment[actor] || cat.assignment.CH_QONUNAI;
  const speed={CH_JUDGE:0.94,CH_PROSECUTOR:1.06,CH_ADVOCATE:1,CH_QONUNAI:1.02}[actor]||1;
  const id = createHash('sha256').update(JSON.stringify([actor,speed,createHash('sha256').update(key).digest('hex'),cat.model_id,voice_id,language,spoken])).digest('hex');
  if (cache.has(id)) { const b = cache.get(id); cache.delete(id); cache.set(id, b); return b; }
  const started = Date.now();
  const response = await remote('voicelab', `${API}/v1/tts`, {
    method: 'POST', headers: { ...auth(key), 'Content-Type': 'application/json', 'Idempotency-Key': `hb-${id.slice(0, 32)}` },
    body: JSON.stringify({ text: spoken, language, model_id: cat.model_id, voice_id, speed }),
  }, 60000, 1);
  let bytes;
  if (response.status === 202) {
    const job = await response.json();
    const statusUrl = job.status_url ? new URL(job.status_url, API).href : job.id ? `${API}/v1/tts/generations/${encodeURIComponent(job.id)}` : null;
    if (!statusUrl || new URL(statusUrl).origin!==API) throw new ApiError(502, 'Ovoz vazifasi aniqlanmadi.');
    for (let i = 0; i < 30 && !bytes; i++) {
      await new Promise(r => setTimeout(r, Math.min(700 + i * 150, 2000)));
      const g = await (await remote('voicelab', statusUrl, { headers: auth(key) }, 15000)).json();
      if (g.status === 'failed') throw new ApiError(502, 'Ovoz yaratilmadi. Matnli javob mavjud.');
      if (g.status === 'completed' && g.audio_url) {
        const url = new URL(g.audio_url);
        if (url.protocol !== 'https:' || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname)) throw new ApiError(502, 'Ovoz manzili qabul qilinmadi.');
        bytes = Buffer.from(await (await remote('voicelab', url.href, {}, 30000)).arrayBuffer());
      }
    }
    if (!bytes) throw new ApiError(504, 'Ovoz kutiş vaqti tugadi. Matnli javobni öqing.');
  } else {
    if (!response.headers.get('content-type')?.includes('audio/')) throw new ApiError(502, 'Ovoz javobi notöğri.');
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (bytes.length > 12_000_000 || bytes.subarray(0, 4).toString() !== 'RIFF') throw new ApiError(502, 'WAV tekşiruvi bajarilmadi.');
  usage.record('voicelab', { model: `tts:${cat.model_id}`, chars: spoken.length, ms: Date.now() - started });
  cache.set(id, bytes); if (cache.size > 60) cache.delete(cache.keys().next().value);
  return bytes;
}

// ------------------------------------------------------------------ STT (upload fallback)
export async function sttUpload(key, base64, language='uz') {
  languageCode(language);
  if (!key) throw new ApiError(503, 'VoiceLab ulanmagan.');
  if (typeof base64 !== 'string' || base64.length > 2_000_000) throw new ApiError(400, 'Ovoz hajmi notöğri (60 soniyagaça).');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.subarray(0, 4).toString() !== 'RIFF' || bytes.subarray(8, 12).toString() !== 'WAVE') throw new ApiError(400, 'Faqat WAV yozuvi qabul qilinadi.');
  if (bytes.length < 16044) throw new ApiError(400, 'Kamida yarim soniya gapiring.');
  const audioMs = Math.round((bytes.length - 44) / 32); // 16 kHz mono PCM16
  const idem = randomUUID();
  const send = () => { const form = new FormData(); form.append('audio', new Blob([bytes], { type: 'audio/wav' }), 'utterance.wav'); form.append('language', language); form.append('include_speakers', 'false'); return form; };
  // Same Idempotency-Key on retry after a timeout, per the STT docs.
  const upload = await remote('voicelab', `${API}/v1/stt`, { method: 'POST', headers: { ...auth(key), 'Idempotency-Key': idem, 'X-Audio-Duration-Ms': String(audioMs) }, body: send() }, 45000, 1);
  const job = await upload.json();
  const id = job.id || job.data?.id;
  if (!id) throw new ApiError(502, 'Nutq vazifasi topilmadi.');
  let transcript = null;
  try {
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      const r = await remote('voicelab', `${API}/v1/stt/transcriptions/${encodeURIComponent(id)}`, { headers: auth(key) }, 15000);
      const data = await r.json();
      if (data.status === 'failed') throw new ApiError(422, data.error?.code === 'no_speech_detected' ? 'Nutq aniqlanmadi. Qayta gapiring.' : 'Nutqni tanib bölmadi.');
      if (data.status === 'completed') { transcript = data.transcript ?? data.text ?? ''; break; }
      const wait = Math.min(10, Math.max(1, Number(r.headers.get('retry-after')) || 1)) * 1000;
      await new Promise(res => setTimeout(res, wait));
    }
  } finally {
    // Delete the transcription and retained audio; this app stores no recordings.
    void fetch(`${API}/v1/stt/transcriptions/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth(key), signal: AbortSignal.timeout(10000) }).catch(() => {});
  }
  if (transcript === null) throw new ApiError(504, 'Nutqni kutiş vaqti tugadi.');
  usage.record('voicelab', { model: 'stt:upload', audioMs });
  return { text: language==='uz'?normalizeTranscript(transcript):transcript, raw: transcript, mode: 'upload',language };
}

// ------------------------------------------------------------------ realtime STT ticket (browser connects directly)
export async function sttTicket(key) {
  if (!key) throw new ApiError(503, 'VoiceLab kalitini serverga kiriting.');
  const r = await remote('voicelab', `${API}/v1/ticket`, { method: 'POST', headers: { ...auth(key), 'Content-Type': 'application/json' }, body: JSON.stringify({ transport: 'websocket', service: 'stt' }) }, 10000);
  const t = await r.json();
  if (!t.ticket || !String(t.websocket_url || '').startsWith('wss://api.voicelab.uz/')) throw new ApiError(502, 'STT çiptasi şakli notöğri.');
  usage.record('voicelab', { model: 'stt:ticket' });
  return { ticket: t.ticket, websocket_url: t.websocket_url, expires_at: t.expires_at || null };
}

export { normalizeTranscript };
