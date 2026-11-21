"""Package the QonunVerse 3D pipeline into a portable folder (+ zip) for Codex / other machines.

  python blender/scripts/package_project.py [--no-zip]

Creates dist/QonunVerse_3D/ containing everything needed to USE the assets (public/assets, manifests,
docs, viewer) and to REBUILD them (blender/ sources + scripts + config + textures, run_pipeline.ps1),
plus PACKAGE_INVENTORY.json with sha256 of every file. Logs, caches and scratch files are left out.
Blender itself, MPFB and the MakeHuman asset pack are NOT bundled (see docs/SETUP.md).
"""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = "QonunVerse_3D"
DIST = ROOT / "dist"
OUT = DIST / NAME

INCLUDE = [
    "README.md", "HANDOFF.md", "AGENTS.md", "run_pipeline.ps1",
    "docs", "tools", "assets/references", "public/assets",
    "blender/scripts", "blender/config", "blender/textures", "blender/characters", "blender/renders",
    "blender/courtroom.blend", "blender/courtroom_assembled.blend", "blender/qonunai.blend",
    "blender/environment.report.json", "blender/assembled.report.json",
]
SKIP_PARTS = {"__pycache__", ".git", "dist"}
SKIP_SUFFIX = {".pyc", ".blend1", ".log", ".tmp"}


def wanted(p: Path):
    return not (set(p.parts) & SKIP_PARTS) and p.suffix not in SKIP_SUFFIX


def sha256(p: Path):
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    missing = [i for i in INCLUDE if not (ROOT / i).exists()]
    if missing:
        print("[warn] not found (skipped):", missing)
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    files = []
    for item in INCLUDE:
        src = ROOT / item
        if not src.exists():
            continue
        paths = [src] if src.is_file() else [p for p in src.rglob("*") if p.is_file()]
        for p in paths:
            rel = p.relative_to(ROOT)
            if not wanted(rel):
                continue
            dst = OUT / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, dst)
            files.append(rel)
    inventory = {
        "package": NAME, "created": date.today().isoformat(),
        "entry_points": {"codex": "AGENTS.md", "humans": "README.md", "integration": "docs/CODEX_INTEGRATION.md",
                         "status": "docs/ASSET_STATUS.md", "manifest": "public/assets/manifest.json",
                         "rebuild": "run_pipeline.ps1", "viewer": "tools/asset_viewer.html"},
        "not_included": ["Blender 4.2+", "MPFB 2 extension", "MakeHuman system asset pack (CC0)",
                         "pipeline logs", "Python caches"],
        "files": [{"path": str(r).replace("\\", "/"), "bytes": (OUT / r).stat().st_size, "sha256": sha256(OUT / r)}
                  for r in sorted(files)],
    }
    inventory["total_mb"] = round(sum(f["bytes"] for f in inventory["files"]) / 1e6, 1)
    (OUT / "PACKAGE_INVENTORY.json").write_text(json.dumps(inventory, indent=2), encoding="utf-8")
    print(f"packaged {len(files)} files, {inventory['total_mb']} MB -> {OUT.relative_to(ROOT)}")
    if "--no-zip" not in sys.argv:
        zpath = DIST / f"{NAME}_{date.today().isoformat()}.zip"
        with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for p in sorted(OUT.rglob("*")):
                if p.is_file():
                    z.write(p, Path(NAME) / p.relative_to(OUT))
        # integrity check: reopen and test every member
        with zipfile.ZipFile(zpath) as z:
            bad = z.testzip()
            n = len(z.namelist())
        if bad:
            raise SystemExit(f"zip integrity check failed at {bad}")
        print(f"zip {zpath.relative_to(ROOT)}  {zpath.stat().st_size / 1e6:.1f} MB  ({n} entries, integrity ok)")


if __name__ == "__main__":
    main()
