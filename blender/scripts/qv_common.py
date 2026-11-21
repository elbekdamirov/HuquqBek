"""Shared helpers for the QonunVerse Blender pipeline.

Coordinate convention (all scripts):
  Blender: X = right (as seen from the public gallery), Y = towards the judge's
  bench, Z = up, 1 unit = 1 metre.
  glTF / Three.js (after the exporter's +Y-up conversion):
  X = right, Y = up, Z = towards the gallery / viewer.  Blender (x, y, z) -> three (x, z, -y).
  A Blender rotation about Z (yaw) equals the same rotation about Three.js Y.
  Characters face Blender -Y at yaw 0 (= Three.js +Z, towards the gallery).
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

SCRIPTS = Path(__file__).resolve().parent
BLENDER_DIR = SCRIPTS.parent
ROOT = BLENDER_DIR.parent
CONFIG = BLENDER_DIR / "config"
TEXTURES = BLENDER_DIR / "textures"
PUBLIC = ROOT / "public" / "assets"
REFERENCE = ROOT / "assets" / "references" / "courtroom.png"

for p in (TEXTURES, PUBLIC / "characters", PUBLIC / "environment", PUBLIC / "animations"):
    p.mkdir(parents=True, exist_ok=True)


def log(*args):
    print("[QV]", *args, flush=True)


def cli_args() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def load_json(path: Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save_json(path: Path, data):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


# --------------------------------------------------------------------- scene
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.fps = 30
    return scene


def collection(name: str, parent=None):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(col)
    return col


def link(obj, col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def empty(name, loc, col, yaw_deg=0.0, display="ARROWS", size=0.3, **props):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = display
    obj.empty_display_size = size
    obj.location = loc
    obj.rotation_euler = (0, 0, math.radians(yaw_deg))
    for k, v in props.items():
        obj[k] = v
    col.objects.link(obj)
    return obj


# ---------------------------------------------------------------- geometry
def box_uv(obj, metres_per_tile=1.0, rotate_grain=False):
    """World-scale box projection so every surface has consistent texel density."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.verify()
    mw = obj.matrix_world
    s = 1.0 / metres_per_tile
    for f in bm.faces:
        n = (mw.to_3x3() @ f.normal)
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            co = mw @ loop.vert.co
            if ax == 0:
                u, v = co.y, co.z
            elif ax == 1:
                u, v = co.x, co.z
            else:
                u, v = co.x, co.y
            if rotate_grain:
                u, v = v, u
            loop[uv].uv = (u * s, v * s)
    bm.to_mesh(me)
    bm.free()


def box(name, size, loc, mat, col, bevel=0.0, uv_tile=1.0, rotate_grain=False,
        parent=None, rot=(0, 0, 0)):
    """Axis-aligned box centred on loc (size = full dimensions)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    col.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = rot
    if parent:
        obj.parent = parent
    if mat:
        me.materials.append(mat)
    if bevel > 0:
        m = obj.modifiers.new("Bevel", "BEVEL")
        m.width = bevel
        m.segments = 1
        m.limit_method = "ANGLE"
        m.harden_normals = False
    bpy.context.view_layer.update()
    box_uv(obj, uv_tile, rotate_grain)
    for p in me.polygons:
        p.use_smooth = False
    return obj


def box_minmax(name, mn, mx, mat, col, **kw):
    size = [mx[i] - mn[i] for i in range(3)]
    loc = [(mx[i] + mn[i]) / 2 for i in range(3)]
    return box(name, size, loc, mat, col, **kw)


def cylinder(name, radius, depth, loc, mat, col, verts=16, rot=(0, 0, 0), smooth=True,
             radius2=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=radius,
                          radius2=radius if radius2 is None else radius2, depth=depth)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    col.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = rot
    if mat:
        me.materials.append(mat)
    bpy.context.view_layer.update()
    box_uv(obj, 0.5)
    if smooth:
        for p in me.polygons:
            p.use_smooth = abs(p.normal.z) < 0.5
    return obj


def sphere(name, radius, loc, mat, col, segments=16, rings=8, scale=(1, 1, 1)):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    col.objects.link(obj)
    obj.location = loc
    if mat:
        me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    bpy.context.view_layer.update()
    box_uv(obj, 0.5)
    return obj


def plane(name, w, h, loc, mat, col, rot=(0, 0, 0), uv_full=True):
    """Vertical-friendly plane: w along local X, h along local Y; UV 0..1."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)],
                   [], [(0, 1, 2, 3)])
    uvl = me.uv_layers.new(name="UVMap")
    for i, uvv in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uvl.data[i].uv = uvv
    obj = bpy.data.objects.new(name, me)
    col.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = rot
    if mat:
        me.materials.append(mat)
    return obj


def evaluated_to_mesh(obj, name=None, keep_original=False):
    """Convert a curve/text/modified object to a plain mesh object in place."""
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    me = bpy.data.meshes.new_from_object(ev)
    new = bpy.data.objects.new(name or obj.name, me)
    new.matrix_world = obj.matrix_world.copy()
    for c in obj.users_collection:
        c.objects.link(new)
    for k in obj.keys():
        if not k.startswith("_"):
            new[k] = obj[k]
    if not keep_original:
        bpy.data.objects.remove(obj, do_unlink=True)
    return new


def text_mesh(name, body, size, loc, mat, col, rot=(math.radians(90), 0, 0),
              extrude=0.002, align="CENTER"):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.align_x = align
    cu.align_y = "CENTER"
    cu.resolution_u = 3
    cu.fill_mode = "BOTH"
    obj = bpy.data.objects.new(name, cu)
    col.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = rot
    if mat:
        cu.materials.append(mat)
    bpy.context.view_layer.update()
    return evaluated_to_mesh(obj, name)


def tube_curve(name, points, radius, mat, col, resolution=8):
    """Poly-bezier tube through points -> mesh (microphone goosenecks, rails)."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 2
    cu.resolution_u = resolution
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, cu)
    col.objects.link(obj)
    if mat:
        cu.materials.append(mat)
    bpy.context.view_layer.update()
    return evaluated_to_mesh(obj, name)


def set_parent_keep(child, parent):
    mw = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = mw


def blender_to_three(v):
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]
