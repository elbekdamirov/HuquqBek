HUQUQBEK 0.5.0 — LEARNING PATHS AND 45 GUIDED 3D LABS

Run Start-HuquqBek.cmd. Updated local URL: http://127.0.0.1:4197/. Node.js 24+ required.
Six-question interest questionnaire; three paths; 45 theory rooms and scenario labs; Groq/VoiceLab helper; server-verified keys and local progress. Training-completion certificates can be printed or saved as PDF.
Full verification and limits: docs/HUQUQBEK_0.5_REPORT.txt. Curriculum and structured assessments still require educator/legal review.

--- Historical release notes ---

HUQUQBEK 0.4.1 — GROQ-ONLY AI AND COURTROOM FIXES

Double-click Start-HuquqBek.cmd. Updated local URL: http://127.0.0.1:4196/. The older process on 4189 is left running separately.
Groq handles all AI tasks; VoiceLab handles speech. Hearing reports use actual hearing records and learner reasons, separately from the optional quiz. Scores describe preparation criteria; educator legal review is required.
Fixes, verification and limitations: docs/HUQUQBEK_0.4.1_FIXES.txt.

--- Historical release notes below; use the 0.4.1 instructions above ---

HUQUQBEK 0.4 — FULL COURTROOM CYCLE, AI ROUTER, REVISED ALPHABET

Start: run Stop-HuquqBek.ps1 if an older server is running, then double-click Start-HuquqBek.cmd (Node.js 24+). Opens http://127.0.0.1:4189/.
Full change log, AI status, tests and limitations: docs/HUQUQBEK_0.4_REPORT.md. Pre-0.4 backup: ..\game_backup_before_v0.4_2026-11-20.zip.

--- Previous release notes (0.3) ---
HUQUQBEK 0.3 — IMMERSIVE COURTROOM UPDATE

Run Start-HuquqBek.cmd after extracting the package. Node.js 24+ is required.
Local URL: http://127.0.0.1:4189/.

A case now opens the 3D courtroom directly. WASD / arrows walk; drag mouse to look; approach a participant and press E to talk. The participant list is an accessible equivalent. Close the conversation to move again.
QonunAI gives a spoken introduction and case-aware chatbot advice. NPC conversations use the active case and recent conversation; VoiceLab speaks replies. Audio amplitude drives human mouth motion alongside speech gestures. This is generic audio-driven animation, not phoneme-perfect acting or finished character art.
Gapirish captures one utterance, VoiceLab returns its transcript, and the learner reviews/edits it before Yuborish. Voice uploads use server-side credentials; no audio files are saved by this application. A deletion request is issued for uploaded provider transcription jobs after polling; provider retention terms still apply.
Speak to the judge to request a hearing, submit an already-read document, examine a submitted document, call a witness, request a break, present a closing argument or request a teaching decision draft. The state reducer checks the actor, stage and evidence prerequisites. QonunAI cannot make judicial actions. A player acting as judge gives instructions through the clerk.
All 50 case adaptations, role/character selection, original detailed advocate mission, structured assessment, local history, teacher comments and source links remain available. Baholash va hisobot opens the structured assessment; conversation observations and teaching decision drafts require educator review.

DEFAULT CREDENTIAL CONFIGURATION
On the current computer, the supplied credentials have been configured and encrypted with Windows DPAPI for this Windows user. They load automatically after restart. Encrypted storage is .local/providers.dpapi, excluded from Git and every downloadable package. Plaintext keys are never in frontend code or reports.
An extracted package on a different computer requires that computer's server credentials. Configure Ovoz va AI once; Windows stores them encrypted for subsequent launches. Environment variables remain supported on other systems.

VERIFICATION
Production build passed. 14 automated tests passed. 40 GLBs validated; 41 asset/manifest hashes match originals.
Browser: direct courtroom entry, QonunAI introduction, walking position change, participant conversation and a LIVE free-text judge request advancing to hearing passed without page errors.
Browser microphone: a generated synthetic WAV was fed into the browser microphone; transcription returned to the chat without errors.
Groq: live case-aware NPC completions passed.
VoiceLab: live WAV TTS and uploaded STT roundtrip passed; transcript review is necessary (the test omitted one spoken word).
Gemini: authentication/model catalog passed, but generation requests fell back to Groq during testing. Gemini inference is not confirmed; the configured Groq fallback works.
Realtime WebSocket connection failed in this environment. The working browser path captures an utterance and uses the uploaded STT API. This is turn-based voice interaction, not simultaneous word-by-word analysis.

CONTENT LIMITS
All case adaptations await qualified Uzbek legal and educator review. Synthetic teaching exhibits and dialogue are labelled; they are not 50 complete trial-record reconstructions. The opaque LexUZ Offline full-text corpus has not been imported. Legal editions need case-date review.
AI interpretations are fallible. Current court actions cover the bounded workflow listed above, not arbitrary changes to facts, charges or the law. The structured learning score does not validate the substance of an unrestricted legal opinion.
