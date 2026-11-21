# HuquqBek — exams, pricing, Premium gates, certificates, case-file redesign

## What changed

**Server**
- `server/commerce.mjs` (new) has the price catalog: 15 USD role/level SKUs and 2 UZS Premium plans. It also covers orders, signed and idempotent webhooks, subscriptions, entitlements, exam attempt credits (2 per covered level) and the shared `requireLesson`/`requireLab` access gates.
- `server/exams.mjs` (new) is the exam engine:
  - question banks, prechecks (identity, rules, camera)
  - atomic `start`, server-side deadlines, server grading and proctor signals
  - human review and appeals
  - certificate issuance gated on a passed exam, and public verification
- `server/learning.mjs` now wires in the gates and the new `/api/learning/*` routes. Completing rooms no longer issues level certificates. Older certificates are kept and labelled `legacy`.
- `server/api.mjs` adds `POST /api/billing/webhook` (raw body, HMAC header `x-huquqbek-signature`). Error responses now include `code` and `details`.
- `server/runtime.mjs` gives `ApiError` a `details` field.

**Frontend**
- `src/casefile.css` is the new theme: Forest Green `#1F3D2B` for the chambers, Sand Beige `#E8DCC4` for case paper, Electric Purple `#8B5CF6` for seals and focus. It uses Fraunces, Inter and IBM Plex Mono, bundled through @fontsource.
- `src/Select.tsx` is an accessible custom dropdown with GSAP animation. It replaces the language and tutor selects and is used in the certificate generator.
- `src/vendor/react-bits/Effects.tsx` reimplements the React Bits components SplitText, CountUp, Magnet, ClickSpark, ShinyText and ScrollReveal on GSAP and ScrollTrigger.
- New pages:
  - `src/Pricing.tsx` → `#/pricing`
  - `src/Exams.tsx` → `#/exams` and `#/exam/:role/:level`
  - `src/Certificates.tsx` → `#/certificates`, `#/certificates/:role/:level` and `#/verify/:id`
  - `src/exams.css` styles these pages.
- `src/components/HuquqBekCertificate*.tsx|css` is the spec's Appendix A/B generator, typed. PDF export works only for a certificate the backend has issued.
- `LearningApp.tsx` gets the routes, Bepul/Premium chips, paywalls, the certificate board, and hides QonunAI on exam pages. `AcademyHeader.tsx` gets the Imtihonlar and Narxlar nav items.
- Tests: `tests/exams.test.mjs` is new (10 tests). `tests/learning.test.mjs` was updated for the new certificate rule.

## Database (node:sqlite, created automatically, no data deleted)
New tables:
- Commerce: `products`, `orders`, `payment_events`, `subscriptions`, `entitlements`, `exam_credits`, `commerce_audit`
- Exams: `exam_identity`, `exam_prechecks`, `exam_attempts` (one active per owner/role/level), `exam_proctor_events`, `exam_review_decisions`, `exam_appeals`, `exam_audit`
- Certificates: `exam_certificates` (one issued per owner/role/level)

## Environment variables (server only)
| Variable | Purpose |
|---|---|
| `HUQUQBEK_PAYMENT_PROVIDER` | Name of the real provider. Without one, checkout returns `PAYMENTS_NOT_CONFIGURED` and no charge is ever simulated. |
| `HUQUQBEK_BILLING_WEBHOOK_SECRET` | HMAC-SHA256 secret used to verify provider webhooks |
| `HUQUQBEK_ADMIN_TOKEN` | Enables manual identity review and the `admin/exam-reviews` endpoints (header `x-huquqbek-admin`) |
| `HUQUQBEK_DEV_MODE=1` | Development only; ignored when `NODE_ENV=production`. Turns on the sandbox payment provider, self-attested identity and a practice exam bank. Certificates issued in this mode get a `DEV-` prefix and verify as not genuine. |

## Commands
```
npm test            # 58 tests
npm run build       # tsc + vite build
npm run dev:demo    # Vite + API in dev mode, uses .local/demo.sqlite (real progress untouched)
```

## Honest status / outstanding
- **Payments:** no real provider is integrated. The UI says "To‘lovlar sozlanmagan". To go live, map your provider's checkout and webhook to `commerce.checkout` / `commerce.webhook`.
- **Exam banks:** the curriculum gives each role and level about 19 source-backed questions and 2 case labs. None of them are marked as reviewed for certification. A production exam therefore shows **"Imtihon materiallari tayyor emas"** until reviewed content is added at `server/content/exam-banks/<role>-<level>.json`, with at least 50 questions and 2 cases, each marked `"reviewed": true`.
- **Identity:** there is no automated ID or biometric provider. Production uses manual admin review, and only when `HUQUQBEK_ADMIN_TOKEN` is set. Without it, the exam start is blocked.
- **Proctoring:**
  - Implemented: browser camera checks (real frames, track ended/muted, 15 s heartbeats), page visibility/blur, multiple tabs and network events. These only **flag a result for human review**. Nothing is recorded and no face analysis is done.
  - Not implemented: AI cheating detection.
- **Admin:** review is API only (`GET /api/learning/admin/exam-reviews`, `POST …/:id/decision`, `POST /api/learning/admin/identity/:owner/decision`). There is no admin UI.
- **Premium gates:** room lessons with order 1–2 in each path are free. Exactly three labs are free: A-B01, S-B01 and P-B01. Everything else needs active Premium. Rooms already completed stay completed, but their content locks without Premium.

## Login, onboarding and active path
- **Google sign-in:** set `GOOGLE_CLIENT_ID` to your OAuth Web client ID. In Google Cloud, add the authorized JavaScript origins you serve from, for example `http://localhost:5173` and `http://127.0.0.1:4197`.
  - `server/auth.mjs` verifies the Google ID token against Google's keys: RS256 signature, audience, issuer and expiry.
  - Progress is linked to the account. Signing in on a new browser restores it and merges any guest progress (completed rooms, reading checks, test result).
  - No client secret is needed.
- **Without `GOOGLE_CLIENT_ID`:** the login page says that Google sign-in is not configured. Learners can still continue as a guest. `npm run dev:demo` adds a demo-account button.
- **First visit:** login page (or guest) → 6-question interest test → result ("Sizning yo‘nalishingiz: …") → dashboard.
  - The dashboard continues from the active path.
  - Choosing a path on the Yo‘nalishlar page, or pressing "Asosiy yo‘nalish qilish" on a path page, makes it the new default.
- **Free lessons rule fixed:** only Beginner rooms 1–2 of each path are free (6 lessons in total). Room order restarts at each level.
- **Scenarios (36 in total):**
  - `scripts/original-scenarios.mjs` adds 8 scenarios written for HuquqBek.
  - `scripts/import-adolat.mjs <adolat/reference/data/uz>` imports 19 more cases from `adolat.zip` (the owner confirmed rights on 2026-11-21): 5 defence (himoya), 5 prosecutor supervision (nazorat), 5 investigation (tergov) and 4 case paths (yol). They sit alongside the 5 earlier adolat imports.
  - Each imported case keeps its facts, documents, evidence, suspects and practice questions. Each is labelled as an adaptation awaiting legal review.
  - The archive's answer keys were written by the clone's author, not the original site's, and have no legal review. They were not imported as graded keys.
