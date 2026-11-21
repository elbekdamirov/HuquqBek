// HuquqBek backend AI proxy. Secrets stay on the server (env vars or DPAPI-encrypted .local store).
import "./env.mjs";
import { loadSecrets, saveSecrets } from "./secrets.mjs";
import { readFile } from "node:fs/promises";
import { ApiError, health, usage, rateLimit } from "./runtime.mjs";
import { converse, analyzeEvidence, feedback, discoverModels } from "./ai.mjs";
import { tts, sttUpload, sttTicket, voices, resetVoices } from "./voicelab.mjs";
import { requestLanguage } from "./language.mjs";
import { handleLearning, billingWebhook } from "./learning.mjs";

const libraryPath = new URL(
  "../src/content/case_library.json",
  import.meta.url,
);
const credentials = {
  groq: process.env.GROQ_API_KEY || "",
  voicelab: process.env.VOICELAB_API_KEY || "",
};
// Environment variables win over the encrypted local store.
for (const [k, v] of Object.entries(loadSecrets()))
  if (Object.hasOwn(credentials, k) && !credentials[k] && typeof v === "string")
    credentials[k] = v;
const checked = { groq: {}, voicelab: {} };

export function setRuntimeCredentials(values) {
  const changed = [];
  for (const name of Object.keys(credentials)) {
    const v = typeof values?.[name] === "string" ? values[name].trim() : "";
    if (!v) continue;
    if (v.length > 4096 || /\s/.test(v))
      throw new ApiError(400, "Kalit şakli notöğri.");
    credentials[name] = v;
    checked[name] = {};
    changed.push(name);
    if (name === "voicelab") resetVoices();
  }
  if (!changed.length)
    throw new ApiError(400, "Hech qanday yangi kalit kiritilmadi.");
  saveSecrets(credentials);
  return changed;
}

export function services() {
  const h = health.snapshot();
  return Object.fromEntries(
    Object.keys(credentials).map((name) => [
      name,
      {
        configured: !!credentials[name],
        ...checked[name],
        health: h[name] || null,
      },
    ]),
  );
}

let library;
async function caseById(id) {
  library ||= [
    ...JSON.parse(await readFile(libraryPath, "utf8")),
    ...JSON.parse(
      await readFile(
        new URL("../src/content/scenarios.json", import.meta.url),
        "utf8",
      ),
    ),
  ];
  const c = library.find((x) => x.id === id);
  if (!c) throw new ApiError(400, "Ish topilmadi.");
  return c;
}
function checkRole(c, role) {
  if (
    !c.rolePrompts?.[role] ||
    (role === "prokuror" && c.category !== "criminal" && !c.independent)
  )
    throw new ApiError(400, "Ish yoki rol mos emas.");
}

async function jsonBody(req, limit = 120000) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new ApiError(415, "JSON sörovi kerak.");
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new ApiError(413, "Sörov juda katta.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "JSON notöğri.");
  }
}
function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(body));
}
function checkOrigin(req) {
  const host = req.headers.host || "";
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))
    throw new ApiError(403, "Faqat mahalliy server.");
  if (
    req.headers.origin &&
    ![
      `http://${host}`,
      "http://127.0.0.1:5173",
      "http://localhost:5173",
    ].includes(req.headers.origin)
  )
    throw new ApiError(403, "Manba ruxsat etilmagan.");
}

async function checkProvider(name) {
  if (!Object.hasOwn(credentials, name) || !credentials[name])
    throw new ApiError(503, "Avval server kalitini kiriting.");
  try {
    const result =
      name === "voicelab"
        ? await voices(credentials.voicelab).then((c) => ({
            models: { tts: c.model_id },
            voices: c.voices.length,
          }))
        : await discoverModels(name, credentials);
    const activeModels = [
      ...new Set(Object.values(result.models).filter(Boolean)),
    ];
    checked[name] = {
      verified: true,
      message: "Xizmat katalogi tekşirildi.",
      model: activeModels.join(" / "),
    };
    return { ...checked[name], ...result };
  } catch (e) {
    checked[name] = {
      verified: false,
      message: e instanceof ApiError ? e.message : "Ulanish bajarilmadi.",
    };
    throw e;
  }
}

export async function handleApi(req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (!pathname.startsWith("/api/")) return false;
  try {
    if (pathname === "/api/billing/webhook") {
      // Provider callbacks are verified by HMAC signature over the exact raw body, not by cookie/origin.
      if (req.method !== "POST") throw new ApiError(405, "POST kerak.");
      rateLimit(req, "admin");
      let total = 0;
      const chunks = [];
      for await (const chunk of req) {
        total += chunk.length;
        if (total > 64000) throw new ApiError(413, "Juda katta.");
        chunks.push(chunk);
      }
      return (
        send(
          res,
          200,
          billingWebhook(
            Buffer.concat(chunks).toString("utf8"),
            req.headers["x-huquqbek-signature"],
          ),
        ),
        true
      );
    }
    checkOrigin(req);
    if (pathname.startsWith("/api/learning/")) {
      if (!["GET", "POST"].includes(req.method))
        throw new ApiError(405, "GET yoki POST kerak.");
      if (req.method === "POST")
        rateLimit(req, pathname.endsWith("/tutor") ? "converse" : "learning");
      await handleLearning(
        req,
        res,
        req.method === "POST" ? await jsonBody(req) : {},
        credentials,
      );
      return true;
    }
    if (req.method === "GET") {
      if (pathname === "/api/status")
        return (
          send(res, 200, {
            ...services(),
            storage: process.platform === "win32" ? "dpapi" : "env",
          }),
          true
        );
      if (pathname === "/api/usage")
        return (
          send(res, 200, {
            usage: usage.snapshot(),
            health: health.snapshot(),
          }),
          true
        );
      if (pathname === "/api/voices") {
        const c = await voices(credentials.voicelab, requestLanguage(req));
        return (
          send(res, 200, {
            language: c.language,
            model: c.model_id,
            assignment: Object.fromEntries(
              Object.entries(c.assignment).map(([a, id]) => [
                a,
                c.voices.find((v) => v.id === id)?.name || id,
              ]),
            ),
            count: c.voices.length,
          }),
          true
        );
      }
      throw new ApiError(405, "POST kerak.");
    }
    if (req.method !== "POST") throw new ApiError(405, "POST kerak.");
    const bucket =
      pathname === "/api/tts"
        ? "tts"
        : pathname.startsWith("/api/stt/ticket")
          ? "ticket"
          : pathname === "/api/stt"
            ? "stt"
            : pathname === "/api/converse"
              ? "converse"
              : ["/api/analyze", "/api/evidence/analyze"].includes(pathname)
                ? "analyze"
                : "admin";
    rateLimit(req, bucket);
    const body = await jsonBody(
      req,
      pathname === "/api/stt" ? 2_200_000 : 120000,
    );

    if (pathname === "/api/runtime-secrets") {
      const changed = setRuntimeCredentials(body);
      send(res, 200, {
        ...services(),
        changed,
        persisted: process.platform === "win32",
      });
    } else if (pathname === "/api/provider/check")
      send(res, 200, await checkProvider(body.provider));
    else if (pathname === "/api/converse") {
      const c = await caseById(body.caseId);
      checkRole(c, body.role);
      if (
        typeof body.text !== "string" ||
        body.text.trim().length < 2 ||
        body.text.length > 6000
      )
        throw new ApiError(400, "Xabar 2–6000 belgi bölsin.");
      send(
        res,
        200,
        await converse(credentials, c, {
          ...body,
          language: requestLanguage(req, body),
        }),
      );
    } else if (pathname === "/api/analyze") {
      const c = await caseById(body.caseId);
      checkRole(c, body.role);
      send(
        res,
        200,
        await feedback(credentials, c, {
          ...body,
          language: requestLanguage(req, body),
        }),
      );
    } else if (pathname === "/api/evidence/analyze") {
      const c = await caseById(body.caseId);
      send(
        res,
        200,
        await analyzeEvidence(credentials, c, {
          ...body,
          language: requestLanguage(req, body),
        }),
      );
    } else if (pathname === "/api/stt")
      send(
        res,
        200,
        await sttUpload(
          credentials.voicelab,
          body.audio,
          requestLanguage(req, body),
        ),
      );
    else if (pathname === "/api/stt/ticket")
      send(res, 200, await sttTicket(credentials.voicelab));
    else if (pathname === "/api/tts") {
      const bytes = await tts(
        credentials.voicelab,
        body.text,
        String(body.actor || "CH_QONUNAI"),
        requestLanguage(req, body),
      );
      res.writeHead(200, {
        "Content-Type": "audio/wav",
        "Content-Length": bytes.length,
        "Cache-Control": "no-store",
      });
      res.end(bytes);
    } else throw new ApiError(404, "API manzili topilmadi.");
  } catch (e) {
    // Upstream bodies, tickets and secrets never enter logs or responses.
    send(res, e instanceof ApiError ? e.status : 502, {
      error:
        e instanceof ApiError
          ? e.message
          : "Xizmat bilan ulaniş bajarilmadi. Matn bilan davom eting.",
      ...(e instanceof ApiError && e.code ? { code: e.code } : {}),
      ...(e instanceof ApiError && e.details ? { details: e.details } : {}),
    });
  }
  return true;
}
