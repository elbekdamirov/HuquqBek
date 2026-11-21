"""Export the courtroom for React Three Fiber.

Run: blender -b blender/courtroom.blend --python blender/scripts/export_environment.py

Outputs (public/assets/environment/):
  courtroom.glb            static meshes merged by material (1 draw call per material),
                           interactive props as separate named nodes (INTERACT_*),
                           markers (SPAWN_*, SEAT_*, WAYPOINT_*, POINT_*, PROP_*, CAM_*) as empty nodes with extras
  courtroom_lod1.glb       same room without small props (< 25 cm) for low-end / mobile
  courtroom_colliders.glb  invisible box colliders (walls, furniture) for physics / navigation
  environment.report.json  draw calls, triangles, markers (consumed by export_manifest.py)
"""
from __future__ import annotations

import math
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import qv_common as C  # noqa: E402

OUT = C.PUBLIC / "environment"


def env_meshes():
    root = bpy.data.collections["QV_Environment"]
    return [o for o in root.all_objects if o.type == "MESH"]


def baked_copy(o, col, name=None):
    deps = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(deps))
    me.transform(o.matrix_world)
    me.name = name or o.name
    c = bpy.data.objects.new(name or o.name, me)
    col.objects.link(c)
    for k in o.keys():
        if k.startswith("qv_"):
            c[k] = o[k]
    return c


def join(objs, name):
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, object=objs[0]):
            bpy.ops.object.join()
    objs[0].name = objs[0].data.name = name
    return objs[0]


def small(o):
    return max(o.dimensions) < 0.25


def build_export(lod=0):
    col = bpy.data.collections.new(f"EXPORT_ENV_{lod}")
    bpy.context.scene.collection.children.link(col)
    groups = defaultdict(list)
    separate = []
    for o in env_meshes():
        if lod and small(o) and not o.get("qv_keep_separate"):
            continue
        if o.get("qv_keep_separate"):
            separate.append(o)
            continue
        mat = o.active_material.name if o.active_material else "none"
        groups[mat].append(o)
    out = []
    for mat, objs in groups.items():
        copies = [baked_copy(o, col) for o in objs]
        out.append(join(copies, f"ENV_{mat.replace('QV_', '')}"))
    for o in separate:
        c = baked_copy(o, col, f"INTERACT_{o.name}")
        # keep a pivot so doors can swing: put the origin at the hinge side / object origin
        piv = o.matrix_world.translation.copy()
        c.data.transform(Matrix.Translation(-piv))
        c.location = piv
        out.append(c)
    # markers & cameras as empties with extras
    for src in list(bpy.data.collections["QV_Markers"].objects) + list(bpy.data.collections["QV_Cameras"].objects):
        e = bpy.data.objects.new(src.get("qv_export_name", src.name), None)
        e.matrix_world = src.matrix_world.copy()
        if src.type == "CAMERA":
            e.rotation_euler = src.rotation_euler
            e["qv_marker"] = "camera"
            e["fov_deg"] = round(math.degrees(src.data.angle_y), 2)
        for k in src.keys():
            if not k.startswith("_") and k != "qv_export_name":
                e[k] = src[k] if not hasattr(src[k], "to_list") else src[k].to_list()
        col.objects.link(e)
        out.append(e)
    root = bpy.data.objects.new("courtroom", None)
    col.objects.link(root)
    root["qv_asset"] = "courtroom"
    root["qv_units"] = "metres, +Y up (glTF)"
    for o in out:
        o.parent = root
    return root, col, out


def export(root, path):
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for c in root.children_recursive:
        c.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True, export_extras=True,
                              export_yup=True, export_apply=False, export_animations=False, export_lights=False,
                              export_cameras=False, export_image_format="AUTO", export_jpeg_quality=85,
                              export_texcoords=True, export_normals=True)
    C.log("exported", path.name, f"{path.stat().st_size / 1e6:.2f} MB")


def colliders():
    col = bpy.data.collections.new("EXPORT_COLLIDERS")
    bpy.context.scene.collection.children.link(col)
    root = bpy.data.objects.new("courtroom_colliders", None)
    col.objects.link(root)
    items = []
    for o in bpy.data.collections["QV_Colliders"].objects:
        c = baked_copy(o, col, f"COL_{o.name.replace('_Collider', '')}")
        c.data.materials.clear()
        c.parent = root
        items.append(c.name)
    # room walls as thin boxes
    import qv_common as Q
    for name, mn, mx in [("COL_Wall_Back", (-7.5, 9.0, 0), (7.5, 9.3, 5.6)),
                         ("COL_Wall_Front", (-7.5, -6.3, 0), (7.5, -6.0, 5.6)),
                         ("COL_Wall_Left", (-7.8, -6, 0), (-7.5, 9, 5.6)),
                         ("COL_Wall_Right", (7.5, -6, 0), (7.8, 9, 5.6))]:
        o = Q.box_minmax(name, mn, mx, None, col)
        o.parent = root
        items.append(name)
    return root, items


def tri_count(objs):
    t = 0
    deps = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if o.type == "MESH":
            t += sum(len(p.vertices) - 2 for p in o.data.polygons)
    return t


def free_marker_names():
    """Export empties must carry the exact marker names (SPAWN_advokat, not SPAWN_advokat.001),
    so the in-memory source objects are renamed first. The .blend on disk is not saved."""
    for src in list(bpy.data.collections["QV_Markers"].objects) + list(bpy.data.collections["QV_Cameras"].objects):
        src["qv_export_name"] = src.name
        src.name = src.name + "__src"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    free_marker_names()
    report = {}
    for lod in (0, 1):
        root, col, objs = build_export(lod)
        meshes = [o for o in objs if o.type == "MESH"]
        name = "courtroom.glb" if lod == 0 else "courtroom_lod1.glb"
        export(root, OUT / name)
        report[f"lod{lod}"] = {
            "file": f"public/assets/environment/{name}",
            "draw_calls_est": sum(len(o.data.materials) or 1 for o in meshes),
            "triangles": tri_count(meshes),
            "mesh_nodes": len(meshes),
            "interactive": [o.name for o in meshes if o.name.startswith("INTERACT_")],
        }
        for o in list(col.objects):  # delete the export copies so the next LOD can reuse exact names
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(col)
    root, items = colliders()
    export(root, OUT / "courtroom_colliders.glb")
    report["colliders"] = {"file": "public/assets/environment/courtroom_colliders.glb", "boxes": items}
    markers = {}
    for src in list(bpy.data.collections["QV_Markers"].objects) + list(bpy.data.collections["QV_Cameras"].objects):
        m = src.matrix_world
        entry = {"position": C.blender_to_three(m.translation),
                 "yaw_rad": round(m.to_euler().z, 4),
                 "type": src.get("qv_marker", "marker")}
        for k in ("role", "pose", "character", "path", "index", "action", "prop", "seat_height"):
            if k in src.keys():
                entry[k] = src[k]
        if src.type == "CAMERA":
            entry["fov_deg"] = round(math.degrees(src.data.angle_y), 2)
            entry["target"] = C.blender_to_three(src["target"])
        markers[src.get("qv_export_name", src.name)] = entry
    report["markers"] = markers
    lights = []
    for L in bpy.data.collections["QV_Lights"].objects:
        lights.append({"name": L.name, "type": L.data.type, "color": list(L.data.color),
                       "blender_energy": L.data.energy, "position": C.blender_to_three(L.matrix_world.translation)})
    report["lights_reference"] = lights
    C.save_json(C.BLENDER_DIR / "environment.report.json", report)
    C.log("environment draw calls (lod0):", report["lod0"]["draw_calls_est"], "tris:", report["lod0"]["triangles"])


if __name__ == "__main__":
    main()
