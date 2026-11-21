# AGENTS.md: QonunVerse 3D asset package

You are integrating finished 3D assets into the QonunVerse React Three Fiber website.

## Read first
1. `docs/CODEX_INTEGRATION.md`: how to load the courtroom, characters, clips, morphs, LODs, markers and QonunAI. It includes code snippets.
2. `public/assets/manifest.json`: runtime source of truth: file URLs, spawn positions and yaw (three.js space), clip lists with durations and loop flags, morph names, `action_map`.
3. `docs/ASSET_STATUS.md`: what is final, what is a base model, what is a placeholder.

## Rules
* Copy `public/assets/` into the website's `public/` folder unchanged. URLs in the manifest start with `/assets/...`.
* **Do not hand-edit** GLBs, the manifest or anything in `blender/`. To change assets, edit `blender/config/cast.json` or the scripts in `blender/scripts/` and run `run_pipeline.ps1` (needs Blender + MPFB; see `docs/SETUP.md`).
* Look nodes up by their exact names. Examples: `SPAWN_advokat`, `SEAT_Chair_advokat`, `WAYPOINT_advokat_0`, `INTERACT_CourtDisplay_Screen`, bone `mixamorigRightHand`. Never hard-code clip strings: use `manifest.action_map`.
* Body clips and face clips (`layer: "face"`) run as two simultaneous actions on the same mixer.
* `Walk` and the turn clips are in place. Gameplay code moves and rotates the root.
* The GLBs contain no lights. Use `manifest.environment.recommended_lighting`.
* Do not present the human characters as final likenesses. The State Emblem is a placeholder.

## Verify your integration
* `python blender/scripts/validate_glb.py` checks every GLB, using only the Python standard library.
* To see every asset loading through GLTFLoader, serve the package root (`python -m http.server 8765`) and open `http://localhost:8765/tools/asset_viewer.html`.
