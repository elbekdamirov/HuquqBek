# QonunVerse Blender pipeline: handoff

_Last updated: 2026-11-20 (final rebuild). For the next person or agent continuing this work. Codex: start with `AGENTS.md`._

## State: final rebuild complete
* The full pipeline has run end to end.
* **All 40 GLBs pass `validate_glb.py` with 0 errors and 0 warnings**: 3 environment files, 35 character files and 2 clip libraries.
* The assets were also verified in a real browser with three.js r160 GLTFLoader, through `tools/asset_viewer.html`:
  * every character loads, with a 52-bone `mixamorigHips` skeleton, 18 morphs and correct heights (for example, advokat 1.567 m);
  * body and face clips play together;
  * LOD2 plays LOD0's clips, and LOD0 plays the shared library clips;
  * QonunAI loads with 9 clips and 5 morphs;
  * markers and interactive nodes resolve by their exact names;
  * the whole cast at `CAM_reference` matches the Blender composition;
  * there were no console errors.

Fixes in the final rebuild:
1. **Defendant hair:** `short03` (a fringe over one eye) is now `short02`.
2. **Judge's bench:** the top is lowered from 1.60 m to 1.22 m, so the seated judge is visible as in the reference. The evidence hand-over point moved down to match.
3. **Loop timing:** Walk is 32 frames and Look is 2.4 s, so both loop ends are sampled at the 15 fps export.
4. **Exact node names:** export copies used to collide with their source objects, producing `SPAWN_advokat.001` and `advokat_body.001`. The exporters now free the names first. `validate_glb.py` treats suffixed marker or body names as an **error**, so this can't regress.
5. **LOD1 naming:** the environment LOD1 export deletes the LOD0 copies before reusing names.
6. **Viewer height stat:** the viewer now measures skinned bounds precisely.
7. **Runner hardening:** `run_pipeline.ps1` accepts `-Steps a,b` via `powershell -File`, rejects unknown steps, and ignores Blender's harmless stderr.

Rebuild everything:
```powershell
.\run_pipeline.ps1 -Blender "<path to blender.exe>" -Render
```

## Where things are
The permanent project root is `C:\Users\miron\QonunVerse`. All paths below are relative to it. The
`.claude/launch.json` viewer-server config was not carried over in the move. Start the viewer server by hand,
as shown below.

| What | Path |
|---|---|
| Codex entry point | `AGENTS.md`, then `docs/CODEX_INTEGRATION.md` |
| Brief / reference | `assets/references/courtroom.png`. The original cast brief is in `blender/config/cast_brief_original.json`. |
| Source of truth for the cast | `blender/config/cast.json` |
| Scripts | `blender/scripts/` (table in `README.md`); packaging is `package_project.py` |
| Outputs | `public/assets/{environment,characters,animations}/`, `manifest.json`, `LICENSES.json`, `validation_report.json` |
| Editable sources | `blender/courtroom.blend`, `blender/courtroom_assembled.blend`, `blender/characters/<id>.blend`, `blender/qonunai.blend` |
| QA renders | `blender/renders/` (`assembled_CAM_reference.png` is the final composition) |
| Browser viewer | `tools/asset_viewer.html`. Run `python -m http.server 8765` in the root, then open `/tools/asset_viewer.html`. |
| Portable package | `dist/QonunVerse_3D/` and `dist/QonunVerse_3D_<date>.zip`, with `PACKAGE_INVENTORY.json` (sha256 of every file) |

## Tooling
Blender, MPFB and the MakeHuman asset pack are **not** part of the package. During this work they lived in a
session temp folder that may be wiped:
* Blender 4.2.23 LTS (portable): `...\Temp\claude\...\scratchpad\b\blender.exe`
* MPFB 2.0.18 and the CC0 asset pack were installed inside that portable Blender.

On another machine, install them as described in `docs/SETUP.md`. Then run `python blender/scripts/check_deps.py`, which reports what is missing.
Keep Blender in a **short path**, because MPFB data paths can exceed the Windows 260-character limit.

## Remaining issues (not blockers for integration)
**Art and fidelity.** These are art-pass items; see `docs/ASSET_STATUS.md`.
* Humans are MPFB base models (parametric bodies, CC0 clothing recoloured), not sculpted likenesses. Faces read young and similar.
* The judge's robe is a procedural shell plus skirt. It has no real ornamented placket, and its legs can clip when seated (hidden behind the bench).
* The advocate, witness, clerk and spectator women wear the CC0 suit with a **skirt**. The brief asks for trousers for the advocate and the witness. There are no white blouse collars.
* The prosecutor's and security officer's uniforms and insignia are approximations, not checked against official regulations.
* The headscarf is a shrink-wrapped hood, not a cloth-simulated drape.
* Male eyebrow textures look sparse up close.
* In the lap pose (`Idle_Seated_Lap`) the forearms float slightly above the thighs. This affects the witness and the spectators.

**Placeholders and legal.**
* The **State Emblem is a stylised placeholder**. Replace it with official artwork and confirm permitted use.
* Flag colours are approximated. Verify them against the official specification.

**Animation.**
* All clips are procedural: clean, but less natural than motion capture. Mixamo or mocap clips can replace any clip (same bone names).
* There is no audio-driven lip-sync. `Face_Talk` is a generic loop; drive `Mouth_Open`/`Mouth_Pursing`/`Mouth_Wide` from audio at runtime.

**Web.**
* The GLBs carry no lights. With plain three.js lights the room reads darker than the Blender renders, and the placeholder emblem looks dark. Use the manifest's `recommended_lighting` plus bloom and tone mapping.
* Eyebrows use alpha blending. If sorting artefacts appear, set `depthWrite = false` on that material.
* Human LOD0 files are 2.6–4.7 MB each. Optional: `gltf-transform optimize` with Meshopt and WebP for roughly 50–70% savings. Not applied, to keep the loader setup simple.

**Tooling.** The exporter logs "Draco ... not available". This is harmless, because Draco isn't used.

## Key design decisions
* **Coordinates:**
  * Blender is Z-up. X points right as seen from the gallery, and +Y points toward the judge.
  * three.js receives (x, z, −y).
  * Characters face +Z in three.js at yaw 0.
* **Rig:** MPFB `mixamo` rig. Bones are named `mixamorig:*`; GLTFLoader turns them into `mixamorigHips`.
* **Clothing:** CC0 garments recoloured in numpy, keeping their fold detail. Top and bottom get separate materials, split at the waist.
* **Morphs:** 18 shape keys from MakeHuman expression units, transferred to the brows and lashes via MHCLO. Face meshes are joined into the body.
* **Clips:**
  * Clips come from a custom FK "aim" solver. All are procedural and original.
  * Export uses `NLA_TRACKS`.
  * The scene runs at 30 fps and export samples every 2nd frame, so loop durations must be an even number of frames.
* **Environment:**
  * Merged by material: 29 draw calls and 31k triangles.
  * Interactive nodes are prefixed `INTERACT_*`.
  * Markers carry extras (userData) and use these prefixes: `SPAWN_`, `SEAT_`, `WAYPOINT_`, `POINT_`, `PROP_`, `CAM_`.
  * Colliders are exported as a separate GLB.

## Final numbers
| File | Size | Triangles | Draw calls | Clips |
|---|---|---|---|---|
| `courtroom.glb` | 2.6 MB | 30.7k | 29 | – |
| `courtroom_lod1.glb` | 2.4 MB | 27.4k | – | – |
| Human LOD0 | 2.6–4.7 MB | 34–50k | 9–13 | 22–39 (+7 face clips) |
| Human LOD1 / LOD2 | 1.0–2.3 MB / 0.7–1.9 MB | – | – | none (reuse LOD0 clips by bone name) |
| `qonunai.glb` / `_lod1.glb` | 1.0 / 0.4 MB | – | – | 9 |
| `qv_{female,male}_clips.glb` | 2.1 MB each | – | – | 38 |

## Gotchas
* Windows `MAX_PATH`: keep Blender in a short folder.
* PowerShell 5.1 wraps Blender's stderr as `NativeCommandError`/`RemoteException`, so judge steps by exit code only.
* After creating an armature object in a script, call `view_layer.update()` before using `pose.bones`.
* Call `co.copy()` on bmesh coordinates before freeing the bmesh. Otherwise Blender crashes with an access violation.
* Export copies must not share names with live objects, or Blender appends `.001`. The validator now enforces this.
