# HuquqBek 0.4: development report

_2026-11-20. Continues 0.3 in place. Nothing was rebuilt from scratch. A full pre-change backup is at `C:\Users\miron\QonunVerse\game_backup_before_v0.4_2026-11-20.zip`._

## Launch (localhost)
1. Stop the old 0.3 server if it is running: `powershell -ExecutionPolicy Bypass -File Stop-HuquqBek.ps1` (or `Stop-QonunVerse.ps1`).
2. Start the new server: double-click `Start-HuquqBek.cmd`, or run `node scripts/start.mjs`.
3. Open **http://127.0.0.1:4189/**.

Requires Node.js 24+. To rebuild after code changes, run `npm run build`. To run the tests, run `npm test`.

Keys come from the Windows-encrypted store `.local/providers.dpapi`, or from the env vars `GROQ_API_KEY`, `GEMINI_API_KEY` and `VOICELAB_API_KEY`. Env vars take priority. You can replace keys in-app: **Ovoz va AI → Server xotirasiga yuboriş**.

## Bugs fixed (from `HUQUQBEK_BUG_REPORT.md`)
| # | Fix |
|---|---|
| 1 | All 48 mojibake strings repaired, and the build is clean. The test suite now fails on any `â€` / `Â·` / `Ã…` pattern. |
| 2 | **Offline courtroom works.** The new action bar ("Sud harakatlari") and an offline intent parser drive the state machine without AI. The judge answers with scripted lines. The misleading "practice works locally" text was replaced. |
| 3 | Voice playback and the microphone are gated on VoiceLab, so there are no repeated voice errors and no 30-second dead recording. |
| 4 | Unknown evidence/source IDs from the AI are dropped instead of rejecting the whole reply. Unverified article numbers are flagged to the learner. |
| 5 | **Criminal cases:** the dock stays, the defendant is a separate character, the prosecutor has his own desk, and the plaques are case-aware (JABRLANUVÇI / SUDLANUVÇI / PROKUROR). |
| 6 | No duplicate key characters (unique-model cast resolver). Reused audience bodies get tinted clothing. |
| 7 | QonunAI moved to its manifest marker beside the flag, off the advocate's table. |
| 8 | Stable LODs: characters no longer vanish and download mid-sentence. Speaking roles preload LOD0 (LOD1 on low quality). |
| 9 | Server sends ETag/Last-Modified with 304 revalidation, immutable caching for hashed JS/CSS, and gzip for text. |
| 10 | Empty key submission is rejected. The response states truthfully whether keys were persisted (the old `sessionOnly` flag was wrong). |
| 11 | **Mobile:** participant drawer, touch joystick, full-width subtitles, no horizontal scroll. Low quality is used on touch devices. |
| 12 | Category tab counts follow the search and role filter. |
| 13 | Uzbek status labels replace the raw codes `read` / `submitted` / `examined`. |
| 14–27 | Decision phase label, audio overlap race (token-guarded speech manager), orphan message after a failed send, safe key handler, dead legacy teleport removed from the new world, per-role voices (13 roles), correct min-length message, per-endpoint rate limits, Gemini thinking config, labelled teacher-room functions (export all, notes), "Tahliliy maşq" button name, overlap and scroll fixes. The outputs-folder launcher is unchanged; the in-project launcher is relative. |

Found and fixed during this work:
* **Gemini never worked, in 0.3 or initially in 0.4.** Google retired `gemini-2.5-flash` for new keys (404 "no longer available"). The router now prefers measured-fast Gemini 3 models, permanently skips retired models, and puts overloaded ones (503 / timeout) on a 2-minute cooldown. Total wait is capped.
* **Groq `gpt-oss` classifier truncation:** reasoning tokens exhausted a 120-token budget. Fixed with a larger budget and `reasoning_effort: low`.
* **Explicit action buttons were overridden** by the model's intent guess. The learner's explicit court action now always wins.
* **Name lookups:** stale `.001` marker names in the environment GLB are now an error in the asset validator. The GLBs were re-exported with exact names earlier.

## Features implemented
* **Revised alphabet** (OʻRQ-1184: Ö Ğ Ş Ç + tutuq) — see `src/alphabet.mjs`:
  * Shared converter, used by the browser and the server. Idempotent, and protects URLs, IDs and code.
  * All 5 content files converted on display fields only, from an allow-list, so grammar strings and IDs are untouched.
  * The alphabet selector was removed.
  * A runtime normaliser covers the remaining UI, AI replies and the legacy screen.
  * STT transcripts are normalised, including legal-vocabulary fixes.
  * A TTS pronunciation adapter exists. The A/B test showed VoiceLab also reads the revised alphabet correctly.
* **AI architecture:**
  * **Router** (`server/ai.mjs`): Groq handles fast replies, intent classification and history summaries. Gemini handles legal reasoning, evidence comparison and decision drafts; Groq classifies in parallel and is the labelled fallback.
  * **Shared validated case context** (facts, evidence state, court state, summary plus recent history).
  * **Structured JSON** with enum validation: speaker, text, emotion, animation, gesture, nextAction, intent, evidenceIds, ruling, contradiction.
  * **Grounding check** for article numbers and evidence IDs.
  * **Runtime** (`server/runtime.mjs`): timeouts, bounded retries, per-provider circuit breaker, health, usage and cost tracking (`GET /api/usage`, persisted to `.local/usage.json`), per-endpoint rate limits.
  * Only `src/court.ts` can change case state.
* **VoiceLab** (`server/voicelab.mjs`, `src/voice.ts`, `src/speech.ts`):
  * Documented endpoints only.
  * Voice discovery: 20 voices, with distinct voices assigned to 13 roles (`GET /api/voices`).
  * TTS with cache and idempotency; one voice at a time; replay/skip; word-synced subtitles; amplitude lip-sync.
  * **Realtime STT:** a ticket opens the WebSocket, audio streams as PCM16 at 16 kHz, then `commit` returns the final transcript.
  * **Automatic upload fallback**, followed by deletion of the provider-side transcription.
  * Recording indicator with a level meter, cancel, retry, an editable transcript, permission-specific errors and duplicate-submit guards.
* **Court cycle:** Tayyorgarlik → Majlis oçildi → Guvoh körsatmasi → Dalillar → Taraflar nutqi → Yakuniy söz → Ökuv qarori (+ tanaffus, eʼtirozlar). It includes a phase stepper, an action bar and a decision panel, then the structured assessment.
* **Characters** (`src/Scene.tsx`):
  * Event-driven state machine: seated → stand up (chair pushed back to clear the desk) → turn to the listener → role gesture → talk with lip-sync and emotion face → sit down.
  * Head look-at toward the speaker for the whole cast.
  * Desynchronised idles.
  * The judge is a fixed actor with no navigation. A player-judge is locked at the bench.
  * The witness walks from the gallery through the bar gate to the stand on an A* path (`src/navigation.ts`), with the walk speed matched to the stride. On resume she is placed at the stand.
  * Audience of 6, including relatives and a visitor.
* **Evidence gameplay:**
  * Inventory with type tags and status.
  * Document viewer with zoom, and rotate for photos and objects.
  * Side-by-side compare, plus AI contradiction, gap and witness-question analysis.
  * Present, examine, admissibility objection, and "ask the witness".
  * Presented evidence appears on the courtroom display, with a camera cut.
* **Courtroom details:**
  * Case-aware nameplates placed on the real desk fronts.
  * A HuquqBek display that shows the current phase and presented evidence.
  * A working wall clock.
  * The placeholder emblem stays hidden; no fake official emblem is shown.
* **Rebrand and UI:**
  * HuquqBek everywhere users look: title, meta, loader, logo, legacy screen, 3D display, PWA manifest and icons.
  * Walnut, gold, cream and charcoal theme with a subtle ornament.
  * Cinematic speaker close-ups.

## AI integration status (live tests, this machine)
| Provider | Status | Measured |
|---|---|---|
| Groq | ✅ working — `openai/gpt-oss-120b` (reply), `gpt-oss-20b` (classify), discovered from the API | about 1.5–2.7 s per turn |
| Gemini | ✅ working **after the model fix** — `gemini-3-flash-preview` (catalog-selected; retired 2.5 models skipped) | complex turn about 10 s (with parallel Groq classify); evidence analysis about 7 s; decision draft about 3.3 s. Availability fluctuates (503 "high demand") and the failover handles it. |
| VoiceLab TTS | ✅ working — model `lison`, 20 voices, 13 role voices | about 1.7 s first request, about 0.08 s cached |
| VoiceLab STT (upload) | ✅ working — round trip reproduced the sentence word-for-word | about 1.7 s |
| VoiceLab realtime STT | ⚠️ **provider-side unavailable.** Ticket minting works, but the WebSocket returns `503 realtime_stt_unavailable` for every origin. The client falls back to upload automatically. | n/a |

## Tests performed
* `npm test` passes 22/22: court state machine, migration, alphabet, content conversion, mojibake detector, router, reply validation and grounding, A* paths, plus the 0.3 domain tests.
* `tsc -b` is clean. `npm run build` is clean. No key-like strings in `dist/` or the source.
* **Browser playthrough** on the new server (port 4192, live keys):
  * the library, branding and alphabet;
  * opening the hearing;
  * reading and presenting E1;
  * examining it;
  * calling the witness (A* walk reached exactly (4.75, −0.12));
  * comparing E1 and E2 with the Gemini analysis;
  * arguments, final statements and the decision panel;
  * save, reload and resume.

  No console errors.
* **Credential-free copy** (port 4193):
  * offline scripted play through the phases;
  * the microphone is disabled;
  * no voice errors.
* **Player-judge** stays at (0, 0.45, −7.62) after movement keys. **Advocate** collision stops correctly at the table and the dais.
* **Phone layout** (375×812): drawer, joystick, subtitles, no horizontal scroll.

**Not performed:**
* A real human voice through a real microphone (the STT path was verified with VoiceLab-generated audio).
* Frame-rate measurement: the in-app browser pane was hidden and throttled.
* Testing on a physical phone.

## Remaining limitations
* **Realtime STT** is blocked by VoiceLab right now. It switches on automatically when their service returns.
* **Characters** are MPFB base models from the asset pipeline: rigged and animated, but not artist-finished likenesses. The procedural clips (stand, sit, walk, talk, gestures) are clean but less natural than motion capture. Lip-sync is amplitude-driven, not visemes; the rig has no viseme morphs.
* **Witness at the stand:** she stands to testify (Uzbek practice). Only the witness walks. Security escort and the lawyer's walk to the bench are not automated.
* **Render load:** about 725k triangles and about 266 draw calls on "balanced" quality (desktop). Low quality, on touch devices, uses LOD1/LOD2.
* **Physical evidence:** shown as 2D documents with zoom/rotate. There are no 3D inspectable props yet, and no video/audio evidence media (the case data has no media).
* **Legal content:** grounding checks article numbers and evidence IDs only. Legal substance still needs educator and lawyer review. The OʻRQ-1184 alphabet mapping follows your brief; I did not open lex.uz to verify the law text.
* **Your running 0.3 server** on port 4189 was not restarted: I wasn't permitted to stop it. Use the launch steps above.
* **Key rotation:** the API keys pasted in chat should be rotated. They were not written anywhere by this work.

## Important files
`server/ai.mjs` (new) · `server/runtime.mjs` (new) · `server/voicelab.mjs` (new) · `server/api.mjs` · `server/index.mjs` · `src/alphabet.mjs` (new) · `src/normalize.ts` (new) · `src/speech.ts` (new) · `src/voice.ts` · `src/court.ts` · `src/navigation.ts` · `src/Scene.tsx` · `src/Immersive.tsx` · `src/immersive.css` · `src/theme.css` (new) · `src/LibraryApp.tsx` · `src/services.tsx` · `src/CourtView.tsx` · `src/LegacyApp.tsx` · `src/main.tsx` · `index.html` · `public/manifest.webmanifest`, `public/icon*.{svg,png}` (new) · `src/content/*.json` (alphabet) · `tests/court.test.mjs`, `tests/v04.test.mjs` (new), `tests/huquqbek.test.mjs` · `scripts/start.mjs` · `Stop-HuquqBek.ps1` (new)
