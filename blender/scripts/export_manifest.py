"""Write public/assets/manifest.json and public/assets/LICENSES.json (plain Python, no Blender).

Run after the Blender steps:  python blender/scripts/export_manifest.py
"""
from __future__ import annotations

import json
import math
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BL = ROOT / "blender"
PUB = ROOT / "public" / "assets"


def load(p):
    p = Path(p)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def to_three(v):
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def url(rel):
    return "/" + rel.replace("public/", "", 1) if rel and rel.startswith("public/") else rel


# Semantic actions -> clip names, so gameplay code never hard-codes clip strings.
ACTION_MAP = {
    "idle": {"standing": "Idle_Stand", "seated": "Idle_Seated"},
    "walk": "Walk", "turn_left": "Turn_Left_90", "turn_right": "Turn_Right_90",
    "sit_down": "Sit_Down", "stand_up": "Stand_Up",
    "talk": {"standing": "Talk_Standing", "seated": "Talk_Seated"},
    "nod": {"standing": "Head_Nod", "seated": "Head_Nod_Seated"},
    "shake_head": {"standing": "Head_Shake", "seated": "Head_Shake_Seated"},
    "look_left": {"standing": "Look_Left", "seated": "Look_Left_Seated"},
    "look_right": {"standing": "Look_Right", "seated": "Look_Right_Seated"},
    "gesture": {"standing": "Gesture_OpenHand", "seated": "Gesture_OpenHand_Seated"},
    "point": {"standing": "Gesture_Point", "seated": "Gesture_Point_Seated"},
    "objection": {"standing": "Objection", "seated": "Objection_Seated"},
    "surprised": {"standing": "React_Surprised", "seated": "React_Surprised_Seated"},
    "concerned": {"standing": "React_Concerned", "seated": "React_Concerned_Seated"},
    "address_judge": "Address_Judge", "present_evidence": "Present_Evidence",
    "read_document": {"standing": "Read_Document_Standing", "seated": "Read_Document_Seated"},
    "deliver_verdict": "Deliver_Verdict", "typing": "Typing", "announce": "Announce",
    "testify": "Testify", "nervous": "Nervous_Idle", "guard_idle": "Guard_Idle",
    "face": {"neutral": "Face_Idle", "talk": "Face_Talk", "smile": "Face_Smile", "concerned": "Face_Concerned",
             "surprised": "Face_Surprised", "stern": "Face_Stern", "blink": "Face_Blink"},
}
QONUNAI_MAP = {"idle": "Idle_Float", "greet": "Greet", "point": "Point", "explain": "Explain",
               "positive": "Positive", "concerned": "Concerned", "speak": "Speak", "appear": "Appear",
               "disappear": "Disappear"}


def main():
    cast = load(BL / "config" / "cast.json")
    env = load(BL / "environment.report.json") or {}
    chars = []
    for ch in cast["characters"] + [cast["qonunai"]]:
        cid = ch["id"]
        rep = load(BL / "characters" / f"{cid}.report.json") or {"status": "not_built"}
        st = ch["station"]
        ex = rep.get("exports", {})
        entry = {
            "id": cid, "role": ch["role"], "label_uz": ch["label_uz"], "label_en": ch["label_en"],
            "status": rep.get("status"),
            "asset_quality": ("stylised_final_candidate" if cid == "qonunai" else
                              "mpfb_base_needs_art_pass" if rep.get("status") == "built" else "missing"),
            "files": {k: url(v) for k, v in ex.items()},
            "source_blend": rep.get("blend"),
            "height_m": rep.get("dims", {}).get("height_m"),
            "spawn": {"position": to_three(st["pos"]), "yaw_rad": round(math.radians(st["yaw_deg"]), 4),
                      "pose": st["pose"], "marker": f"SPAWN_{cid}"},
            "seat_marker": (f"SEAT_Chair_{cid}" if f"SEAT_Chair_{cid}" in env.get("markers", {}) else
                            (f"SPAWN_{cid}" if st["pose"] == "seated" else None)),
            "clips": rep.get("clips", {}),
            "morph_targets": rep.get("morphs", []),
            "outfit_brief": ch.get("outfit_brief"),
            "procedural_garments": rep.get("garments", []),
            "warnings": rep.get("warnings", []),
        }
        if "error" in rep:
            entry["error"] = rep["error"]
        chars.append(entry)
    libs = {}
    for sex in ("female", "male"):
        lib = load(BL / "characters" / f"_library_{sex}.report.json")
        if lib:
            libs[sex] = {"file": url(lib["file"]), "source_character": lib["source_character"],
                         "clips": sorted(lib["clips"])}
    markers = env.get("markers", {})
    manifest = {
        "project": "QonunVerse",
        "generated": date.today().isoformat(),
        "coordinates": {
            "units": "metres", "up": "+Y", "forward_of_room": "-Z points from the gallery towards the judge",
            "character_facing": "+Z at yaw 0 (towards the gallery); yaw_rad rotates about +Y",
            "note": "Positions are already converted from Blender (x, y, z) to three.js (x, z, -y)."},
        "threejs_notes": {
            "bone_names": "GLTFLoader sanitises 'mixamorig:Hips' to 'mixamorigHips' (same as Mixamo FBX in three.js).",
            "face_layer": "Clips with layer=='face' only animate morph weights; play them on a second AnimationAction "
                          "alongside a body clip.",
            "in_place": "Walk/turn clips are in place. Move the root yourself (Walk speed_mps in clip meta).",
            "lods": "LOD1/LOD2 GLBs contain no clips; play LOD0 clips on them via AnimationMixer (same bone names).",
        },
        "environment": {
            "files": {k: url(v["file"]) for k, v in env.items() if isinstance(v, dict) and "file" in v},
            "draw_calls_est": env.get("lod0", {}).get("draw_calls_est"),
            "triangles": env.get("lod0", {}).get("triangles"),
            "interactive_nodes": env.get("lod0", {}).get("interactive", []),
            "markers": markers,
            "lights_reference": env.get("lights_reference", []),
            "recommended_lighting": {
                "hemisphere": {"sky": "#fff4e6", "ground": "#3a2a20", "intensity": 0.6},
                "directional_sun": {"color": "#fff1dd", "intensity": 2.2, "position": [8, 6, -2],
                                    "castShadow": True},
                "fill_points": "use lights_reference sconces (warm #ffd19a) at 2-4 cd; ceiling panels as RectAreaLights",
                "tone_mapping": "ACESFilmic or AgX, exposure 1.0, sRGB output",
            },
            "source_blend": "blender/courtroom.blend",
        },
        "characters": chars,
        "animation_libraries": libs,
        "action_map": {"humans": ACTION_MAP, "qonunai": QONUNAI_MAP},
    }
    (PUB / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    write_licenses(chars)
    print("manifest ->", (PUB / "manifest.json").relative_to(ROOT))


def write_licenses(chars):
    lic = {
        "summary": "All shipped geometry/textures are either CC0 (MakeHuman/MPFB system assets) or original work "
                   "generated by this repository's scripts. No Mixamo, Sketchfab or other third-party clips/models "
                   "are included.",
        "entries": [
            {"asset": "Human base meshes, shape targets, expression units, skins, eyes, eyebrows, eyelashes, teeth, "
                      "tongue, hair, clothes, shoes, Mixamo-compatible rig + weights",
             "used_in": [f"public/assets/characters/{c['id']}*.glb" for c in chars if c["id"] != "qonunai"],
             "source": "MakeHuman system assets pack + MPFB 2 bundled data",
             "url": "https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html",
             "license": "CC0 1.0 Universal",
             "license_url": "https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.md",
             "attribution_required": False,
             "notes": "Clothing/hair/skin textures were recoloured and resized by the pipeline (derivatives, CC0)."},
            {"asset": "MPFB 2 add-on (tool only, not shipped)", "license": "GPL-3.0-or-later",
             "notes": "GPL applies to the add-on source, not to generated meshes or exported files."},
            {"asset": "Blender (tool only)", "license": "GPL-2.0-or-later",
             "notes": "Output files are not covered by Blender's licence."},
            {"asset": "Courtroom geometry, procedural PBR textures (wood, stone, plaster, leather, fabric, paper, "
                      "book atlas, display), QonunAI mascot, all animation clips, procedural garments "
                      "(robe, headscarf, cap, insignia, bun)",
             "source": "Generated by blender/scripts/*.py in this repository", "license": "Project-owned original work",
             "attribution_required": False},
            {"asset": "Flag of the Republic of Uzbekistan (texture)", "file": "blender/textures/flag_uzbekistan.jpg",
             "license": "National symbol (not copyrighted); use must respect the Law of the Republic of Uzbekistan "
                        "'On the State Flag'",
             "notes": "Colours/proportions approximated procedurally; verify against the official specification "
                      "before marketing use."},
            {"asset": "State Emblem of Uzbekistan", "file": "blender/textures/emblem_placeholder.png",
             "status": "PLACEHOLDER - stylised medallion, NOT the official emblem",
             "license": "Official emblem use is regulated by law; obtain official vector artwork and confirm "
                        "permitted use in a simulation before replacing the placeholder."},
            {"asset": "Nameplate / display lettering font", "license": "Bitstream Vera / DejaVu (Blender built-in font)",
             "notes": "Text converted to meshes; permissive licence."},
            {"asset": "Reference image assets/references/courtroom.png", "license": "Project-provided concept art",
             "notes": "Used only as visual reference; not shipped in public/assets."},
            {"asset": "Optional future: Mixamo clips", "license": "Adobe Mixamo terms (royalty-free in projects, "
                                                                  "no redistribution as standalone assets)",
             "notes": "Not used. Skeleton is Mixamo-named, so licensed clips can be dropped in later."},
        ],
    }
    (PUB / "LICENSES.json").write_text(json.dumps(lic, indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
