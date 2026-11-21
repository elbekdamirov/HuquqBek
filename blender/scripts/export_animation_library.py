"""Shared clip libraries (skeleton + every procedural clip, no mesh).

Any character with Mixamo bone names (all MPFB cast members, or a Mixamo-rigged replacement)
can play these clips via THREE.AnimationMixer, because tracks bind by bone name.

Run: blender -b blender/characters/advokat.blend --python blender/scripts/export_animation_library.py -- female
     blender -b blender/characters/davogar.blend --python blender/scripts/export_animation_library.py -- male
Out: public/assets/animations/qv_<sex>_clips.glb
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

import qv_common as C  # noqa: E402
import qv_animation as A  # noqa: E402
from build_characters import export_glb  # noqa: E402


def main():
    sex = (C.cli_args() or ["female"])[0]
    bpy.context.scene.render.fps = A.FPS
    rig = next(o for o in bpy.data.objects if o.type == "ARMATURE" and o.get("qv_character"))
    src = rig.get("qv_character")
    solver = A.RigSolver(rig)
    lib = A.clip_library(solver, seat_h=0.485)
    new = bpy.data.objects.new(f"qv_{sex}_skeleton", rig.data.copy())
    bpy.context.scene.collection.objects.link(new)
    bpy.context.view_layer.update()  # builds the pose for the new armature object
    for pb in new.pose.bones:
        pb.rotation_mode = "QUATERNION"
    meta = {}
    for name, spec in lib.items():
        act = A.write_action(solver, f"lib_{name}", spec["keys"], loop=spec["loop"])
        A.push_nla(new, act, name)
        meta[name] = {"duration_s": round(spec["keys"][-1][0], 3), "loop": spec["loop"], **spec.get("meta", {})}
    out = C.PUBLIC / "animations" / f"qv_{sex}_clips.glb"
    export_glb(new, out, animations=True)
    C.save_json(C.BLENDER_DIR / "characters" / f"_library_{sex}.report.json",
                {"file": f"public/assets/animations/qv_{sex}_clips.glb", "source_character": src,
                 "clips": meta})


if __name__ == "__main__":
    main()
