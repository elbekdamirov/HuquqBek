"""Character import + positioning + animation assignment.

Appends every built character (.blend) into the courtroom, places it on its SPAWN_ marker,
assigns its station clip and saves blender/courtroom_assembled.blend. With --render it renders
the reference camera so the composition can be compared against assets/references/courtroom.png.

Run: blender -b blender/courtroom.blend --python blender/scripts/assemble_scene.py -- [--render] [--frame 40]
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

import qv_common as C  # noqa: E402

STATION_CLIP = {
    # character id -> clip played at its station in the reference composition
    "sudya": "Idle_Seated", "advokat": "Address_Judge", "prokuror": "Idle_Seated", "davogar": "Idle_Seated",
    "javobgar": "Idle_Seated", "guvoh": "Idle_Seated_Lap", "kotib": "Typing", "qoriqchi": "Guard_Idle",
    "tomoshabin_ayol": "Idle_Seated_Lap", "tomoshabin_erkak": "Idle_Seated_Lap",
    "tomoshabin_yosh": "Idle_Seated_Lap", "qonunai": "Idle_Float",
}


def append_character(blend: Path, cid: str, col):
    with bpy.data.libraries.load(str(blend), link=False) as (src, dst):
        dst.objects = [n for n in src.objects]
    rig = None
    for o in dst.objects:
        if o is None:
            continue
        if o.type in {"CAMERA", "LIGHT"} or o.name.startswith(("QA_", "EXPORT")) or o.name.endswith(("_x", "_lod1",
                                                                                                      "_lod2")):
            bpy.data.objects.remove(o)
            continue
        col.objects.link(o)
        if o.type == "ARMATURE" and o.get("qv_character") == cid:
            rig = o
    return rig


def set_clip(rig, clip):
    ad = rig.animation_data
    if not ad:
        return False
    found = False
    for tr in ad.nla_tracks:
        tr.mute = tr.name != clip
        found |= tr.name == clip
    if not found:
        for tr in ad.nla_tracks:
            tr.mute = tr.name != ("Idle_Seated" if "Seated" in clip else "Idle_Stand")
    for o in rig.children:
        if o.type == "MESH" and o.data.shape_keys and o.data.shape_keys.animation_data:
            for tr in o.data.shape_keys.animation_data.nla_tracks:
                tr.mute = tr.name != ("Face_Talk" if clip in ("Address_Judge", "Speak", "Explain") else "Face_Idle")
    return found


def main():
    args = C.cli_args()
    cast = C.load_json(C.CONFIG / "cast.json")
    col = C.collection("QV_Characters")
    placed = {}
    entries = cast["characters"] + [cast["qonunai"]]
    for ch in entries:
        cid = ch["id"]
        blend = C.BLENDER_DIR / ("qonunai.blend" if cid == "qonunai" else f"characters/{cid}.blend")
        if not blend.exists():
            C.log("  [skip] not built:", cid)
            continue
        rig = append_character(blend, cid, C.collection(f"CHR_{cid}", col))
        if not rig:
            C.log("  [warn] rig not found in", blend.name)
            continue
        mk = bpy.data.objects.get(f"SPAWN_{cid}")
        rig.matrix_world = mk.matrix_world.copy() if mk else rig.matrix_world
        clip = STATION_CLIP.get(cid, "Idle_Stand")
        ok = set_clip(rig, clip)
        placed[cid] = {"clip": clip, "clip_found": ok}
    frame = int(args[args.index("--frame") + 1]) if "--frame" in args else 40
    bpy.context.scene.frame_set(frame)
    bpy.ops.wm.save_as_mainfile(filepath=str(C.BLENDER_DIR / "courtroom_assembled.blend"), compress=True)
    C.save_json(C.BLENDER_DIR / "assembled.report.json", placed)
    C.log("placed", len(placed), "characters")
    if "--render" in args:
        sc = bpy.context.scene
        sc.render.engine = "BLENDER_EEVEE_NEXT"
        sc.render.resolution_x, sc.render.resolution_y = 1672, 941
        for cam in ("CAM_reference", "CAM_overview"):
            sc.camera = bpy.data.objects[cam]
            sc.render.filepath = str(C.BLENDER_DIR / "renders" / f"assembled_{cam}.png")
            bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
