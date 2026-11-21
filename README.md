# QonunVerse

## Run the website locally

From the repository root, run `npm ci` once to install dependencies. Then run
`npm run dev` and open [HuquqBek](http://127.0.0.1:5173/). Vite serves the
website, 3D assets and local learning API from the same address.

QonunAI defaults to Groq's `openai/gpt-oss-20b`. On Windows, API settings in
the app use the current user's encrypted credential store. You can also set
`GROQ_API_KEY` in the server environment.

## Blender asset pipeline

A reproducible pipeline that builds the 3D Uzbek courtroom from `assets/references/courtroom.png`, plus the full
cast and the QonunAI mascot. It exports web-ready GLBs for React Three Fiber.

```powershell
.\run_pipeline.ps1 -Render
```
* Optional: add `-Blender "C:\Blender42\blender.exe"` to point at a specific Blender.
* A full run takes about 8 minutes. Steps can be run on their own. See the header of `run_pipeline.ps1`.
* Before the first run, see [docs/SETUP.md](docs/SETUP.md). It needs Blender 4.2+, MPFB 2 and the CC0 MakeHuman asset pack. `python blender/scripts/check_deps.py` tells you what is missing.

## What it produces
| Deliverable | Where |
|---|---|
| Editable Blender sources | `blender/courtroom.blend`, `blender/courtroom_assembled.blend` (cast at stations), `blender/characters/<id>.blend`, `blender/qonunai.blend` |
| Environment GLBs | `public/assets/environment/courtroom.glb`, `courtroom_lod1.glb`, `courtroom_colliders.glb` |
| Character GLBs (11 humans + QonunAI) | `public/assets/characters/<id>.glb`, `_lod1.glb`, `_lod2.glb`, `qonunai_portrait.png` |
| Shared clip libraries | `public/assets/animations/qv_female_clips.glb`, `qv_male_clips.glb` |
| Character + animation manifest | `public/assets/manifest.json` |
| Licensing manifest | `public/assets/LICENSES.json` |
| Validation report | `public/assets/validation_report.json` |
| Codex entry point | [AGENTS.md](AGENTS.md), then [docs/CODEX_INTEGRATION.md](docs/CODEX_INTEGRATION.md) |
| Handoff + remaining issues | [HANDOFF.md](HANDOFF.md) |
| Portable package | `dist/QonunVerse_3D/` + zip, built with `python blender/scripts/package_project.py` |
| Completed vs placeholder | [docs/ASSET_STATUS.md](docs/ASSET_STATUS.md) |
| QA renders | `blender/renders/` |
| Asset viewer (three.js) | `tools/asset_viewer.html`. Serve the repo root (`python -m http.server`) and open `/tools/asset_viewer.html`. |

## Scripts (`blender/scripts/`)
| Script | Purpose |
|---|---|
| `check_deps.py` | Finds Blender, checks the version, probes MPFB and its assets, and prints setup steps (plain Python) |
| `qv_common.py`, `qv_textures.py`, `qv_materials.py` | Coordinate conventions, geometry helpers, numpy PBR textures, glTF-safe materials |
| `build_courtroom.py` | Scene construction: room, furniture, symbols, props, lights, cameras, markers |
| `export_environment.py` | Merges by material, exports GLB with markers, LOD1 and colliders |
| `qv_animation.py` | FK "aim" pose solver and the procedural clip and face-clip library |
| `build_characters.py` | MPFB humans: macros, skin, Mixamo rig, clothing recolour, procedural garments, morphs, clips, LODs, GLB |
| `build_qonunai.py` | Mascot model, rig, morphs, clips, GLB and portrait |
| `export_animation_library.py` | Skeleton-only clip libraries |
| `assemble_scene.py` | Character import, positioning on markers, and station animation assignment |
| `export_manifest.py` | Writes manifest.json and LICENSES.json |
| `validate_glb.py` | Stdlib GLB validator: budgets, scale, skeleton, clips, textures, exact node names |
| `package_project.py` | Builds the portable `dist/QonunVerse_3D` folder, zip and sha256 inventory |

The single source of truth for roles, stations, looks and clip lists is `blender/config/cast.json`.

## Honest status
* The courtroom and QonunAI are production candidates.
* The 11 humans are rigged, animated and optimised **MPFB base models**. They are not sculpted likenesses and still need an art pass.
* The State Emblem is a **placeholder**.

Details are in [docs/ASSET_STATUS.md](docs/ASSET_STATUS.md).
