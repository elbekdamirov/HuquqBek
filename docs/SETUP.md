# Setup: tools for the QonunVerse Blender pipeline

Run `python blender/scripts/check_deps.py` at any time. It finds Blender, checks the version, probes MPFB and the
MakeHuman asset pack inside Blender, and prints the fix for anything missing.

| Dependency | Needed for | Version | Licence |
|---|---|---|---|
| Python 3.9+ | dependency check, manifest, validator | tested with 3.14 | n/a |
| Blender | all Blender steps | 4.2 LTS or newer (tested 4.2.23 LTS) | GPL (tool only) |
| MPFB 2 extension | human characters | tested 2.0.18 | GPL (tool only) |
| MakeHuman system asset pack | skins, clothes, hair, eyes | `makehuman_system_assets_cc0.zip` | CC0 |
| Node / gltf-transform (optional) | extra Meshopt/WebP compression | any | MIT |

Without MPFB, the pipeline still builds the courtroom and QonunAI. It skips the humans and says so.

## 1. Blender
Install Blender from https://www.blender.org/download/lts/ or unzip the portable build.

Then either put `blender` on PATH, set `QV_BLENDER`, or pass `-Blender` to `run_pipeline.ps1`:

```powershell
$env:QV_BLENDER = "C:\Program Files\Blender Foundation\Blender 4.2\blender.exe"
```

**Windows path length:** MPFB data paths are deep. Keep Blender in a short folder such as `C:\Blender42`.
In testing, a portable Blender in a long temp path failed with "target does not exist", which is the
260-character `MAX_PATH` limit.

## 2. MPFB 2
Download the zip from https://extensions.blender.org/add-ons/mpfb/ and install it from the command line:

```powershell
& $env:QV_BLENDER -b --command extension install-file -r user_default --enable C:\Downloads\add-on-mpfb-v2.0.18.zip
```

Or use the UI: **Edit → Preferences → Get Extensions →** search "MPFB" → **Install**.

## 3. MakeHuman system assets (CC0)
Download https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
(about 280 MB). Then either:
* use the MPFB sidebar: **Apply assets → Library settings → Load pack from zip**; or
* unzip it into the MPFB **user data** folder. `check_deps.py` prints that folder. For a portable Blender it is
  `<blender>\portable\extensions\.user\user_default\mpfb\data`.

## 4. Run
```powershell
.\run_pipeline.ps1 -Render
```
A full run takes about 6–8 minutes on a laptop.

`-Render` also writes QA renders to `blender/renders/`:
* the courtroom from the reference camera;
* a per-character pose sheet;
* the assembled scene from the reference camera.

## Licensing reminder
No Mixamo clips are bundled: every clip is generated procedurally. If you add Mixamo clips later, keep them
inside the game build. Mixamo's terms forbid redistributing them as standalone files.
