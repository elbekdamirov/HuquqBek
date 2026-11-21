"""Validate QonunVerse GLB assets without Blender (plain Python 3.9+ stdlib).

  python blender/scripts/validate_glb.py                 # validates everything in public/assets
  python blender/scripts/validate_glb.py path/to/x.glb   # one file

Checks: GLB container integrity, accessor bounds, triangles, primitives (≈ draw calls), materials,
texture resolution (PNG/JPEG headers), skins/joints, morph targets, animation names & durations,
character height sanity, budgets. Writes public/assets/validation_report.json and exits 1 on errors.
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "public" / "assets"

BUDGET = {
    "character_lod0_mb": 6.0, "character_lod1_mb": 3.0, "environment_mb": 6.0,
    "character_lod0_tris": 60000, "environment_tris": 80000,
    "max_texture_px": 2048, "character_draw_calls": 14, "environment_draw_calls": 40,
}
COMP = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_glb(path: Path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise ValueError("not a glTF 2.0 binary")
    if length != len(data):
        raise ValueError(f"length header {length} != file size {len(data)}")
    off = 12
    js, binc = None, b""
    while off < length:
        clen, ctype = struct.unpack_from("<II", data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk)
        elif ctype == 0x004E4942:
            binc = chunk
        off += 8 + clen
    return js, binc


def image_size(blob: bytes):
    if blob[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", blob[16:24])
    if blob[:2] == b"\xff\xd8":
        i = 2
        while i < len(blob):
            if blob[i] != 0xFF:
                i += 1
                continue
            marker = blob[i + 1]
            if marker in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack(">HH", blob[i + 5:i + 9])
                return w, h
            seglen = struct.unpack(">H", blob[i + 2:i + 4])[0]
            i += 2 + seglen
    if blob[:4] == b"RIFF" and blob[8:12] == b"WEBP":
        return (0, 0)
    return (0, 0)


def analyse(path: Path):
    js, binc = read_glb(path)
    rep = {"file": str(path.relative_to(ROOT)).replace("\\", "/"), "size_mb": round(path.stat().st_size / 1e6, 3),
           "errors": [], "warnings": []}
    acc = js.get("accessors", [])
    tris = prims = 0
    morphs = 0
    pos_min = [1e9] * 3
    pos_max = [-1e9] * 3
    for mesh in js.get("meshes", []):
        for p in mesh["primitives"]:
            prims += 1
            mode = p.get("mode", 4)
            if "indices" in p:
                n = acc[p["indices"]]["count"]
            else:
                n = acc[p["attributes"]["POSITION"]]["count"]
            tris += n // 3 if mode == 4 else 0
            a = acc[p["attributes"]["POSITION"]]
            if "min" not in a:
                rep["errors"].append(f"POSITION accessor without min/max in mesh {mesh.get('name')}")
            else:
                pos_min = [min(x, y) for x, y in zip(pos_min, a["min"])]
                pos_max = [max(x, y) for x, y in zip(pos_max, a["max"])]
            morphs = max(morphs, len(p.get("targets", [])))
            for k in p["attributes"]:
                if k.startswith("JOINTS_") and k != "JOINTS_0":
                    rep["warnings"].append(f"{mesh.get('name')}: more than 4 influences ({k})")
    rep["triangles"] = tris
    rep["primitives_draw_calls"] = prims
    rep["materials"] = len(js.get("materials", []))
    rep["morph_targets"] = morphs
    if pos_min[0] < 1e8:
        rep["bounds_m"] = {"min": [round(x, 3) for x in pos_min], "max": [round(x, 3) for x in pos_max],
                           "height": round(pos_max[1] - pos_min[1], 3)}
    textures = []
    bvs = js.get("bufferViews", [])
    for img in js.get("images", []):
        if "bufferView" in img:
            bv = bvs[img["bufferView"]]
            blob = binc[bv.get("byteOffset", 0): bv.get("byteOffset", 0) + bv["byteLength"]]
            w, h = image_size(blob)
            textures.append({"name": img.get("name"), "mime": img.get("mimeType"), "px": [w, h],
                             "kb": round(bv["byteLength"] / 1024, 1)})
            if max(w, h) > BUDGET["max_texture_px"]:
                rep["errors"].append(f"texture {img.get('name')} {w}x{h} exceeds {BUDGET['max_texture_px']}")
    rep["textures"] = textures
    skins = js.get("skins", [])
    rep["skins"] = [{"joints": len(s["joints"])} for s in skins]
    nodes = js.get("nodes", [])
    names = [n.get("name", "") for n in nodes]
    rep["has_mixamo_skeleton"] = any(n.startswith("mixamorig:") for n in names)
    anims = []
    for a in js.get("animations", []):
        dur = 0.0
        for s in a["samplers"]:
            dur = max(dur, acc[s["input"]].get("max", [0])[0])
        targets = {c["target"]["path"] for c in a["channels"]}
        anims.append({"name": a.get("name"), "duration_s": round(dur, 3), "channels": len(a["channels"]),
                      "morph": "weights" in targets})
    rep["animations"] = anims
    rep["extras_nodes"] = sum(1 for n in nodes if "extras" in n)
    import re
    prefixes = ("SPAWN_", "SEAT_", "WAYPOINT_", "POINT_", "PROP_", "CAM_", "INTERACT_")
    dup = [n for n in names if (n.startswith(prefixes) or n.endswith(("_body", "_root")) or n.endswith("_body.001"))
           and re.search(r"(\.\d{3}|__src)$", n)]
    dup += [n for n in names if re.search(r"_body\.?\d{3}$", n)]
    if dup:
        rep["errors"].append(f"node names carry Blender duplicate suffixes (app looks them up by exact name): {sorted(set(dup))[:5]}")
    # accessor sanity: no NaN in bounds
    for i, a in enumerate(acc):
        for k in ("min", "max"):
            if k in a and any(v != v for v in a[k]):
                rep["errors"].append(f"accessor {i} has NaN {k}")
    return rep


def check_budgets(rep):
    f = rep["file"]
    name = Path(f).stem
    if "/characters/" in f:
        lod0 = not name.endswith(("_lod1", "_lod2"))
        if lod0 and rep["size_mb"] > BUDGET["character_lod0_mb"]:
            rep["warnings"].append(f"size {rep['size_mb']} MB > budget {BUDGET['character_lod0_mb']} MB")
        if lod0 and rep["triangles"] > BUDGET["character_lod0_tris"]:
            rep["warnings"].append(f"{rep['triangles']} tris > budget")
        if rep["primitives_draw_calls"] > BUDGET["character_draw_calls"]:
            rep["warnings"].append(f"{rep['primitives_draw_calls']} primitives > {BUDGET['character_draw_calls']}")
        if not rep["skins"]:
            rep["errors"].append("character has no skin/skeleton")
        if name.startswith("qonunai"):
            pass
        else:
            if not rep["has_mixamo_skeleton"]:
                rep["errors"].append("expected mixamorig:* joint names")
            h = rep.get("bounds_m", {}).get("height", 0)
            if not 1.35 <= h <= 2.1:
                rep["errors"].append(f"implausible human height {h} m (scale/transform problem?)")
            if lod0 and not rep["animations"]:
                rep["errors"].append("LOD0 has no animation clips")
    elif "/environment/" in f and "colliders" not in f:
        if rep["size_mb"] > BUDGET["environment_mb"]:
            rep["warnings"].append("environment over size budget")
        if rep["primitives_draw_calls"] > BUDGET["environment_draw_calls"]:
            rep["warnings"].append("environment over draw-call budget")
        if rep["triangles"] > BUDGET["environment_tris"]:
            rep["warnings"].append("environment over triangle budget")
    return rep


def main():
    files = [Path(a) for a in sys.argv[1:]] or sorted(ASSETS.rglob("*.glb"))
    reports = []
    for p in files:
        try:
            r = check_budgets(analyse(p.resolve()))
        except Exception as exc:  # noqa: BLE001
            r = {"file": str(p), "errors": [f"unreadable: {exc}"], "warnings": []}
        reports.append(r)
        status = "FAIL" if r["errors"] else ("WARN" if r["warnings"] else "OK  ")
        print(f"[{status}] {r['file']:<55} {r.get('size_mb', 0):>6} MB  tris {r.get('triangles', 0):>6}  "
              f"draws {r.get('primitives_draw_calls', 0):>3}  clips {len(r.get('animations', [])):>3}  "
              f"h {r.get('bounds_m', {}).get('height', '-')}")
        for e in r["errors"]:
            print("       ERROR:", e)
        for w in r["warnings"]:
            print("       warn :", w)
    out = ASSETS / "validation_report.json"
    if not sys.argv[1:]:
        out.write_text(json.dumps({"budgets": BUDGET, "files": reports}, indent=2), encoding="utf-8")
        print("report ->", out.relative_to(ROOT))
    sys.exit(1 if any(r["errors"] for r in reports) else 0)


if __name__ == "__main__":
    main()
