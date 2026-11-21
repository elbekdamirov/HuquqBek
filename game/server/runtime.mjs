// Shared server runtime: errors, resilient fetch, provider health (circuit breaker), usage/cost tracking, rate limits.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export class ApiError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ------------------------------------------------------------------ health / circuit breaker
const H = {};
export const health = {
  ok(name, ms) {
    const h = (H[name] ||= { failures: 0 });
    h.failures = 0;
    h.lastOkAt = new Date().toISOString();
    h.latencyMs = Math.round(h.latencyMs ? h.latencyMs * 0.7 + ms * 0.3 : ms);
    h.openUntil = 0;
  },
  fail(name, message) {
    const h = (H[name] ||= { failures: 0 });
    h.failures++;
    h.lastErrorAt = new Date().toISOString();
    h.lastError = message;
    if (h.failures >= 3) h.openUntil = Date.now() + 60000;
  },
  available(name) {
    const h = H[name];
    return !h || !h.openUntil || Date.now() > h.openUntil;
  },
  snapshot() {
    return Object.fromEntries(
      Object.entries(H).map(([k, v]) => [
        k,
        { ...v, circuitOpen: !!v.openUntil && Date.now() < v.openUntil },
      ]),
    );
  },
};

function upstreamMessage(status, code) {
  if (status === 401 || status === 403)
    return "Kalit yoki xizmat ruxsati tekşirilmadi. API sozlamalarini tekşiring.";
  if (status === 402) return "Provayder krediti yetmadi.";
  if (status === 429)
    return "Provayder limiti: biroz kutib qayta urinib köring.";
  if (code === "no_speech_detected")
    return "Nutq aniqlanmadi. Mikrofonga yaqinroq gapiring.";
  return "Provayder vaqtinça javob bermadi. Qayta urinib köring.";
}

/** fetch with timeout, provider health tracking and bounded retries for transient failures (never for 4xx). */
export async function remote(
  name,
  url,
  options = {},
  timeout = 20000,
  retries = 0,
) {
  let attempt = 0;
  for (;;) {
    const started = Date.now();
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) {
        let code;
        try {
          code = (await response.json())?.error?.code;
        } catch {
          /* body not JSON */
        }
        const transient = response.status >= 500 || response.status === 429;
        if (transient && attempt < retries) {
          const wait = Math.min(
            4000,
            Number(response.headers.get("retry-after")) * 1000 ||
              600 * (attempt + 1),
          );
          attempt++;
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        health.fail(name, `HTTP ${response.status}${code ? " " + code : ""}`);
        const error = new ApiError(
          response.status === 429 ? 429 : response.status === 422 ? 422 : 502,
          upstreamMessage(response.status, code),
          code,
        );
        error.retryAfterMs = Math.min(
          3600000,
          Math.max(0, Number(response.headers.get("retry-after")) || 0) * 1000,
        );
        throw error;
      }
      health.ok(name, Date.now() - started);
      return response;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if (attempt < retries) {
        attempt++;
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      health.fail(name, e?.name === "TimeoutError" ? "timeout" : "network");
      throw new ApiError(
        504,
        e?.name === "TimeoutError"
          ? `${name}: javob kutiş vaqti tugadi.`
          : `${name}: ulanib bölmadi.`,
      );
    }
  }
}

// ------------------------------------------------------------------ usage / cost tracking
const file = fileURLToPath(new URL("../.local/usage.json", import.meta.url));
// USD per 1M tokens / per unit; override with env vars. Defaults are 0 so nothing is invented.
const RATES = {
  groq: {
    in: Number(process.env.GROQ_USD_PER_MTOK_IN || 0),
    out: Number(process.env.GROQ_USD_PER_MTOK_OUT || 0),
  },
};
let U = { since: new Date().toISOString(), providers: {} };
try {
  if (existsSync(file)) U = JSON.parse(readFileSync(file, "utf8"));
} catch {
  /* fresh */
}
let dirty = false;
export const usage = {
  record(
    name,
    { model, input = 0, output = 0, ms = 0, chars = 0, audioMs = 0 } = {},
  ) {
    const p = (U.providers[name] ||= {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      ttsCharacters: 0,
      sttAudioMs: 0,
      totalMs: 0,
      models: {},
      estimatedUsd: 0,
    });
    p.requests++;
    p.inputTokens += input || 0;
    p.outputTokens += output || 0;
    p.ttsCharacters += chars || 0;
    p.sttAudioMs += audioMs || 0;
    p.totalMs += ms || 0;
    if (model) p.models[model] = (p.models[model] || 0) + 1;
    const r = RATES[name];
    if (r)
      p.estimatedUsd = +(
        (p.inputTokens / 1e6) * r.in +
        (p.outputTokens / 1e6) * r.out
      ).toFixed(4);
    dirty = true;
  },
  snapshot() {
    return U;
  },
};
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  try {
    mkdirSync(fileURLToPath(new URL("../.local/", import.meta.url)), {
      recursive: true,
    });
    writeFileSync(file, JSON.stringify(U, null, 2));
  } catch {
    /* best effort */
  }
}, 5000).unref();

// ------------------------------------------------------------------ rate limits (per client, per endpoint)
const LIMITS = {
  converse: 40,
  analyze: 20,
  tts: 60,
  stt: 20,
  ticket: 20,
  admin: 10,
  learning: 100,
  default: 30,
};
const calls = new Map();
export function rateLimit(req, bucket = "default") {
  const key = `${req.socket.remoteAddress || "local"}:${bucket}`,
    now = Date.now();
  const list = (calls.get(key) || []).filter((t) => now - t < 60000);
  if (list.length >= (LIMITS[bucket] || LIMITS.default))
    throw new ApiError(429, "Bir daqiqada juda köp sörov. Biroz kuting.");
  list.push(now);
  calls.set(key, list);
}
