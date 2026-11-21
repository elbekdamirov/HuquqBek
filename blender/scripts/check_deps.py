"""Detect pipeline dependencies and print setup instructions for anything missing.

  python blender/scripts/check_deps.py [--blender "C:/path/to/blender.exe"] [--json]

Exit code 0 = everything needed for the FULL pipeline is present,
          2 = Blender missing (nothing can be built),
          3 = Blender present but MPFB / MakeHuman assets missing (environment + QonunAI only).
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

MIN_BLENDER = (4, 2)

PROBE = r"""
import sys, importlib, json, os
out = {"mpfb": False, "assets": False, "skins": [], "rig_mixamo": False}
for n in list(sys.modules):
    if n.endswith("mpfb.services.locationservice"):
        LS = importlib.import_module(n).LocationService
        out["mpfb"] = True
        sysd = LS.get_mpfb_data(); usr = LS.get_user_data()
        out["rig_mixamo"] = os.path.exists(os.path.join(sysd, "rigs", "standard", "rig.mixamo.json"))
        skins = os.path.join(usr, "skins")
        out["skins"] = sorted(os.listdir(skins)) if os.path.isdir(skins) else []
        out["assets"] = len(out["skins"]) > 5 and os.path.isdir(os.path.join(usr, "clothes"))
        out["user_data"] = usr
print("QVPROBE" + json.dumps(out))
"""


def find_blender(explicit=None):
    cands = []
    if explicit:
        cands.append(explicit)
    if os.environ.get("QV_BLENDER"):
        cands.append(os.environ["QV_BLENDER"])
    w = shutil.which("blender")
    if w:
        cands.append(w)
    if sys.platform == "win32":
        for base in [os.environ.get("ProgramFiles", r"C:\Program Files"), os.environ.get("LOCALAPPDATA", "")]:
            root = Path(base) / "Blender Foundation"
            if root.exists():
                cands += [str(p / "blender.exe") for p in sorted(root.glob("Blender*"), reverse=True)]
        cands.append(r"C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe")
    elif sys.platform == "darwin":
        cands.append("/Applications/Blender.app/Contents/MacOS/Blender")
    else:
        cands += ["/usr/bin/blender", "/snap/bin/blender"]
    for c in cands:
        if c and Path(c).exists():
            return c
    return None


def blender_version(exe):
    try:
        out = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=120).stdout
        m = re.search(r"Blender (\d+)\.(\d+)\.?(\d*)", out)
        return tuple(int(x or 0) for x in m.groups()) if m else None
    except Exception:  # noqa: BLE001
        return None


def probe_mpfb(exe):
    try:
        out = subprocess.run([exe, "-b", "--python-expr", PROBE], capture_output=True, text=True, timeout=300).stdout
        line = next((l for l in out.splitlines() if l.startswith("QVPROBE")), None)
        return json.loads(line[7:]) if line else {"mpfb": False}
    except Exception as exc:  # noqa: BLE001
        return {"mpfb": False, "error": str(exc)}


SETUP = {
    "blender": """Install Blender 4.2 LTS or newer: https://www.blender.org/download/lts/
  - or a portable zip; then set QV_BLENDER to the full path of blender.exe
  - Windows tip: keep the install path short (MPFB data paths can exceed 260 characters).""",
    "mpfb": """Install MPFB 2 (MakeHuman Plugin For Blender):
  blender -b --command extension install-file -r user_default --enable mpfb-<version>.zip
  (download: https://extensions.blender.org/add-ons/mpfb/ ) - or Edit > Preferences > Get Extensions > MPFB.""",
    "assets": """Install the MakeHuman system asset pack (CC0, ~280 MB):
  https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
  In Blender: MPFB sidebar > Apply Assets > Library Settings > 'Load pack from zip', or unzip into
  the MPFB user data folder printed by this script.""",
}


def main():
    args = sys.argv[1:]
    explicit = args[args.index("--blender") + 1] if "--blender" in args else None
    rep = {"python": sys.version.split()[0]}
    exe = find_blender(explicit)
    rep["blender"] = exe
    code = 0
    if not exe:
        rep["missing"] = ["blender", "mpfb", "assets"]
        code = 2
    else:
        ver = blender_version(exe)
        rep["blender_version"] = ".".join(map(str, ver)) if ver else None
        if not ver or ver[:2] < MIN_BLENDER:
            rep["missing"] = ["blender"]
            code = 2
        else:
            pr = probe_mpfb(exe)
            rep["mpfb"] = pr
            missing = []
            if not pr.get("mpfb"):
                missing += ["mpfb", "assets"]
            elif not pr.get("assets"):
                missing.append("assets")
            if pr.get("mpfb") and not pr.get("rig_mixamo"):
                missing.append("mpfb")
            rep["missing"] = sorted(set(missing))
            code = 3 if missing else 0
    rep["optional"] = {"node": shutil.which("node"), "npx": shutil.which("npx"),
                       "note": "Optional: npx @gltf-transform/cli for Draco/Meshopt/KTX2 post-compression."}
    rep["can_build"] = {"environment": code in (0, 3), "qonunai": code in (0, 3), "humans": code == 0}
    if "--json" in args:
        print(json.dumps(rep, indent=2))
    else:
        print("QonunVerse dependency check")
        print(f"  Python   : {rep['python']}")
        print(f"  Blender  : {rep.get('blender') or 'NOT FOUND'} {rep.get('blender_version') or ''}")
        if "mpfb" in rep:
            print(f"  MPFB     : {'ok' if rep['mpfb'].get('mpfb') else 'MISSING'}"
                  f"   assets: {'ok' if rep['mpfb'].get('assets') else 'MISSING'}"
                  f"   mixamo rig: {'ok' if rep['mpfb'].get('rig_mixamo') else '-'}")
        for m in rep.get("missing", []):
            print(f"\n[MISSING] {m}\n{SETUP[m]}")
        print("\nCan build:", ", ".join(k for k, v in rep["can_build"].items() if v) or "nothing")
    sys.exit(code)


if __name__ == "__main__":
    main()
