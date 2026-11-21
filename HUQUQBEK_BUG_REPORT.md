# HuquqBek 0.3: bug report

> **Status (2026-11-20, HuquqBek 0.4):** all items below were addressed in `game/` — see `game/docs/HUQUQBEK_0.4_REPORT.md` for what changed, how it was verified, and remaining limitations.


_Tested 2026-11-20. Package: `HuquqBek_Playable.zip`. Live source: `C:\Users\miron\QonunVerse\game` (identical `src/` and `server/`). Fix in `game/src` and `game/server`, rebuild `dist`, then repackage._

## How it was tested
* **Fresh install, no AI keys:** the extracted zip was served on port 4190. This is what a new PC or a teacher gets.
* **Live AI path:** the running copy on port 4189 with your configured keys. Two judge turns only (Groq + VoiceLab).
* **Flows exercised in the built-in browser:** library, search and filters, case dialog, start as advocate, 3D courtroom, documents, chat, the full structured exercise through to the report, history, teacher room, the legacy exercise, and the phone layout (375×812).
* **Code and data review:** all of `src/`, `server/`, and the 50-case library.
* **Project tests:** `node --test` passes 14/14. None of the issues below are covered by tests.

**What works well**
* The library has 50 distinct cases (17 consumer, 17 employment, 16 criminal). There are no broken evidence or source references, and the prosecutor role appears only in criminal cases.
* Search and filters work.
* The structured exercise scores and saves correctly (e.g. 48/100, matching the 15/31 dimension totals).
* The 3D courtroom loads without console errors.
* With keys configured, the judge replies in about 2 s, and its intents correctly move the court from preparation to hearing and record evidence as submitted.
* The server blocks path traversal and other origins.

---

## Critical / high

### 1. Garbled Uzbek text everywhere (mojibake), visible on the first screen
* **Where:**
  * `src/LibraryApp.tsx`: 46 strings, including line 14 (`document.title`)
  * `src/Scene.tsx`: lines 235 and 237
  * `dist/assets/index-*.js` and `Scene-*.js`: shipped
* **Symptoms:**
  * The tab title reads `HuquqBek Â· Huquqni amalda oâ€˜rganing`.
  * The hero reads `Sud zaliga tayyor boâ€˜ling`, and the alphabet picker reads `Oâ€˜zbek lotin`.
  * Separators show `Â·`, the 3D plaque reads `DAâ€™VOGAR`, and the NPC label reads `E Â· Gaplashish`.
* **Cause:** UTF-8 text was decoded as Windows-1252 and saved again. The other files (`training.ts`, `services.tsx`, JSON content) are fine.
* **Fix:**
  * Repair each string. A cp1252→utf-8 round trip restores them; check each string before saving.
  * Rebuild `dist`.
  * Add a test that fails if `â€`, `Â·` or `Ã` appears in `src/` or `dist/`.

### 2. Without AI keys the 3D courtroom is a dead end
* **Where:** `src/Immersive.tsx:51` (`send`) → `server/api.mjs:193`
* **Symptom:**
  * On any PC without Groq/Gemini keys, every message to the judge or any participant returns "AI ulanmagan…", and the court can never leave "Tayyorgarlik".
  * The error also says "Mashq va mahalliy mezonlar ishlaydi" (practice still works locally), which is false in this mode.
  * Starting a case opens this mode directly, so a teacher who unzips the package meets a non-working simulator first.
* **Fix:**
  * Add a scripted, offline path for the core judge intents: buttons such as "Majlisni boshlash so'rash" and "E1 ni taqdim etish" that call `courtAction` directly.
  * Or detect "no AI" and route the learner to the structured exercise with a clear message.
  * Correct the message either way.

### 3. Every reply shows a voice error when VoiceLab isn't configured
* **Where:** `src/Immersive.tsx:51`. `send` always calls `say(f.reply)`, and `say` (`:43`) calls `/api/tts` regardless of `services.voicelab.configured`.
* **Effect:** with a Groq key but no VoiceLab key, every NPC reply is followed by "Ovoz: VoiceLab kaliti serverga kiritilmagan."
* **Related:** the courtroom "Gapirish" (speak) button (`:53`) isn't disabled without VoiceLab either, unlike `SpeechTurn`. The user records for up to 30 s and only then gets an error.
* **Fix:** gate `say()` and `mic()` on `services.voicelab.configured`.

### 4. One invalid ID from the AI discards the whole reply
* **Where:** `server/api.mjs:123` (`validateFeedback`)
* **Effect:** if the model cites a single source or evidence ID that doesn't exist, the entire NPC reply is rejected with 502 "AI javobida mavjud bo'lmagan manba bor…".
* **Fix:** in conversation mode (`body.actor`), drop unknown IDs and keep the reply. Only reject in grading mode.

### 5. Criminal cases show the wrong courtroom
* **Where:** `src/Scene.tsx`
* **Symptoms:**
  * `civilGeometry` (`:59-84`) always cuts the defendant dock out of the room, including in criminal cases. `Courtroom` never receives the `criminal` flag.
  * In criminal cases `CH_RESPONDENT` is replaced by the prosecutor (`:144`), so **there is no defendant character at all**.
  * The prosecutor sits behind a hard-coded "JAVOBGAR" plaque (`:235`).
* **Fix:**
  * Pass `criminal` to `Courtroom` and keep the dock.
  * Add the defendant (`javobgar` model at the `javobgar` station) as a separate cast member.
  * Choose plaque text by case type.

---

## Medium

### 6. Duplicate characters in the 3D scene
* **Witness, always:** the `guvoh` model is used for both `CH_PUBLIC_3` (`Scene.tsx:57`) and `CH_WITNESS` (`:145`), so the same woman sits in the gallery and at the witness stand.
* **Avatar "Jasur":** this advocate avatar uses `tomoshabin_erkak` (`training.ts`), which spectator `CH_PUBLIC_2` also uses. The player walks past their own twin.
* **Fix:** give each spectator slot a model that isn't used elsewhere in that session, or skip a spectator whose model equals the player's or the witness's.

### 7. QonunAI floats inside the advocate's table
* **Where:** `src/Scene.tsx:239`
* **Cause:** QonunAI is hard-coded at `[-1.3, .7, -2.8]`, which is inside the table's footprint, so it overlaps the desk and laptop.
* **Fix:** use the manifest marker `SPAWN_qonunai`, which is placed beside the flag and clear of furniture.

### 8. NPCs swap model and pop when they start talking
* **Where:** `src/Scene.tsx:104-105`
* **Cause:** `full = talking || …`, so an NPC switches from LOD2 to LOD0 the moment it speaks.
* **Effect:** `useGLTF` suspends, the character vanishes (`Suspense` fallback is `null`) and a 2–4 MB file downloads mid-conversation.
* **Fix:** don't let `talking` change the LOD. Preload the LOD0 of conversational NPCs, or keep LOD2 and drive only the mouth morph.

### 9. No caching for about 31 MB of assets per courtroom visit
* **Where:** `server/index.mjs:16`
* **Measured:** 14 GLBs, about 29 MB, plus code: about 31 MB per courtroom entry.
* **Cause:** the server sends `Cache-Control: no-cache` with no `ETag`/`Last-Modified`, so browsers re-download everything each visit. There's also no compression.
* **Fix:**
  * Send an ETag (or mtime+size) and answer `If-None-Match` with 304.
  * Use `max-age=31536000, immutable` for hashed `/assets/*.js`.
  * Gzip or brotli JS and JSON.

### 10. "Save keys" button is misleading
* **Where:** `src/services.tsx` (`save`) → `server/api.mjs:19-29, 297`
* **Symptoms:**
  * Submitting the form with all fields empty still reports "Kalitlar … shifrlangan … saqlashga olindi" (keys saved) and rewrites the DPAPI file.
  * The API answers `sessionOnly: true` although the keys are persisted to disk.
* **Fix:** reject an empty submission, and drop or correct `sessionOnly`.

### 11. Phone layout is unusable in the 3D courtroom
* **Measured at 375×812:** the chat panel, participant list and QonunAI button overlap and cover the scene.
* **No touch movement:** movement is keyboard-only (WASD/arrows) with no touch controls, so phone users can't walk. They can still talk through the participant list.
* **Fix:**
  * Collapse the participant list into a drawer on narrow screens.
  * Add a virtual joystick or tap-to-walk. A floor-click handler exists in `Courtroom`; make sure it works with touch.

### 12. Tab counts ignore filters
* **Where:** `src/LibraryApp.tsx:22`
* **Symptom:** "Barcha ishlar" is hard-coded to `50`, and the category counts don't follow the role filter or search. With the prosecutor filter, "16 ish topildi" is shown while the tabs still say 50/17/17/16.

### 13. Internal status codes shown to users
* **Where:** `Immersive.tsx:59` and the `Practice` documents list in `LibraryApp.tsx`.
* **Symptom:** document status shows the raw codes `read` / `submitted` / `examined` instead of Uzbek labels.

---

## Low / polish

| # | Where | Issue |
|---|---|---|
| 14 | `Immersive.tsx:55` | The header phase label has no case for `decision`; it shows "Yakuniy fikr" for both closing and decision. |
| 15 | `Immersive.tsx:43` | Two quick `say()` calls can overlap. `stopAudio` runs before the fetch, so the earlier response still plays. |
| 16 | `Immersive.tsx:51` | After a failed send, the user's message stays in the chat with no reply. Resending duplicates it. |
| 17 | `Scene.tsx:151` | The keydown handler calls `e.target?.closest`, which throws if the event target isn't an Element (seen with a window-level event). Use `e.target instanceof Element && …`. |
| 18 | `Scene.tsx:174, 227-228` | Dead legacy logic: `session` never advances in the courtroom view, so the "hearing" teleport (always to the advocate spot, whatever the role) and `showWitness` never run. Remove it, or wire it to `court.phase`. |
| 19 | `server/api.mjs:227` | Security officer and spectators fall back to index 0, so they speak with QonunAI's voice. |
| 20 | `server/api.mjs:139` | The error says "15–6000 belgi" (characters), but conversation mode accepts 3. |
| 21 | `server/api.mjs:61-73` | One rate limit (24/min) covers converse + TTS + STT. A fast dialogue (about 12 turns/min) hits it. Limit each endpoint separately. |
| 22 | `server/api.mjs:179` | `thinkingConfig.thinkingBudget: 0` is rejected by some Gemini models. This is a likely reason Gemini generation fell back to Groq in your own notes. |
| 23 | Library nav (phone) | "O'qituvchi xonasi" shrinks to an unlabeled icon. |
| 24 | Teacher room | Same list as "Mening mashqlarim", with no teacher-specific function yet. |
| 25 | "Baholash va hisobot" button | It opens the 7-step decision exercise, not a report. Rename it, or open the report when the attempt is complete. |
| 26 | Courtroom at 1024×768 | The page scrolls about 40 px vertically, and the chat panel overlaps the participant list. |
| 27 | `outputs/Start-HuquqBek.cmd` | Hard-codes `C:\Users\miron\QonunVerse\game\scripts\start.mjs`, so it breaks if the folder moves. The copy inside the zip is relative and fine. |

## Suggested order
1. **#1 mojibake:** first impression, a one-pass fix plus a regression test.
2. **#2 and #3:** offline and no-voice behaviour, so the package works on any PC.
3. **#5 and #6:** correct cast and room per case type.
4. **#4, #8, #9:** reliability and load time.
5. **The rest.**
