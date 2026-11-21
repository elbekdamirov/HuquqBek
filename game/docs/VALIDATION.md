# Verification — 20 November 2026

## Checks completed

- The original design package's `node handoff/verify-package.mjs`: **16 checks passed**, 58 dialogue nodes, 10 evidence items, 12 characters, 39 requested clips, 12 legal claims.
- The original asset package's `python blender/scripts/validate_glb.py`: **40 GLBs passed**.
- `npm.cmd run verify:assets`: 40 GLB containers and all character URLs valid. SHA-256 comparison: **40 GLBs plus the asset manifest match the originals**. The copied asset package totals 91.6 MB.
- `npm.cmd test`: **10 tests passed**. They exercise the complete refund flow, insufficient-record outcome after clarification, evidence interval, canceled inspection, oral alternatives, idempotent events, closure restrictions, save/restore, isolated replay, all authored choices and navigation collision behavior. The evaluator matches the supplied reference across **all 1,024 examined-document subsets**, including selected oral alternatives.
- `npm.cmd run build`: TypeScript and the Vite production build passed. Entry/runtime JavaScript approximately 103 kB gzip in total, lazy scene bundle approximately 272 kB gzip, CSS approximately 6 kB gzip. The final build also passed a production-server Chrome smoke test with the asset manifest fetched through its runtime URL.

## Real-browser checks

Automated headless tests used the installed **Chrome 157.0.8103.80** and the installed **Brave executable (Chromium 158.0.8127.42)**. Both used the actual AMD Direct3D11 renderer, not SwiftShader.

The complete refund playthrough passed in both browsers: menu, role selection, initial dialogue, WASD advocate movement, mouse camera drag, document inspection, 200% document text, intake-record acquisition, hearing, individual evidence submission and examination, closing argument, refund, reasons, debrief and completion. A page reload restored completion. The prosecutor model was not downloaded. A 390 × 844 viewport had no horizontal document overflow. Switching to text mode worked. Simulated WebGL context loss preserved a functioning text playthrough. **No JavaScript page errors or failed local requests were recorded.**

A separate **keyboard-only Chrome playthrough** used Tab, Shift+Tab, Enter, Space and Escape to enable text mode, reach the insufficient-record outcome after clarification, review reasons, and replay the hearing checkpoint. Focus stayed inside the dialog. Replay disclosure was present. This proves a complete keyboard/text route; it does not claim that free third-person movement or mouse camera control is accessible through those same controls.

The browser-control connector and desktop screenshot controls timed out. Browser verification instead used Playwright against the local application. Screenshots were captured and visually inspected for the menu, role selection, hearing, enlarged document, findings and mobile completion.

## Performance measurement

Machine: **AMD Ryzen 7 8845HS, Radeon 780M Graphics, 13.8 GiB reported physical RAM**. Chrome headless; 1280 × 720 viewport and internal resolution, device pixel ratio 1. Performance was sampled from a stationary, animated room after a **15-second warmup**. This is not an 8 GB reference-laptop test or a whole-mission percentile benchmark.

| Setting | Sampled fps | Renderer draw calls | Rendered triangles | Estimated active texture memory |
| --- | --- | --- | --- | --- |
| Balanced, five samples | 60 each | 160 | 262,774 | ~229 MB |
| Low, three samples | 60 each | 147 | 95,312 | ~158 MB |

The frame counter uses a rolling 120-frame average. Initial asset decoding and shader compilation produced much lower averages (7–11 fps in the initial browser samples). Those cold-load stalls remain an optimization item. The steady-state measurements above must not be presented as a guarantee of startup smoothness or all mission scenes.

Triangle/draw counts come from `WebGLRenderer.info` and include renderer passes. Texture figures estimate RGBA allocation plus generated mipmaps from currently attached scene textures; they exclude renderer caches, CPU copies, render targets and driver overhead. Quality changes can retain cached GLTF resources; these figures are not measured total GPU process memory. Peak witness/QonunAI scenes have not received a separate performance profile.

The unique GLBs actually requested during the tested mission total **29.1 MB** on disk. This is file-size accounting, not a measured compressed network trace. The 91.6 MB package includes optional assets and unused LODs that are not all streamed at startup.

## Remaining production work

Humans are preliminary MPFB bases, not final Uzbek character likenesses. Official clothing/symbol review, the final mascot choice, natural mocap, recorded Uzbek voice, timed voice captions, audio-driven lip sync, an accessible architectural ramp, IK hand/foot contacts, prop handover animation and fuller camera/scene profiling remain. Judge/prosecutor/citizen missions have introductions only. Legal content retains its supplied pending local-review status. No live voice API or credentials were used and no deployment occurred.

Raw browser reports accompany this document under `verification/`. Test scripts are in `scripts/` and `tests/`. Browser scripts expect the development server at http://127.0.0.1:5173/ and an installed Chrome; Brave can be selected with `QONUNVERSE_BROWSER_PATH` for the playthrough script.
