"""Build the QonunVerse human cast with MPFB 2 (MakeHuman) and export game-ready GLBs.

Requires: Blender 4.2+, MPFB 2 extension enabled, MakeHuman system asset pack (CC0) installed.
Run:
  blender -b --python blender/scripts/build_characters.py -- --all
  blender -b --python blender/scripts/build_characters.py -- --only advokat [--no-export] [--render]

Per character outputs:
  blender/characters/<id>.blend                editable MPFB human + rig + all actions (NLA)
  public/assets/characters/<id>.glb            LOD0: skinned mesh, morphs, all clips
  public/assets/characters/<id>_lod1.glb       ~45 % triangles, skeleton only (reuse LOD0 clips)
  public/assets/characters/<id>_lod2.glb       ~18 % triangles, skeleton only
  blender/characters/<id>.report.json          build facts consumed by export_manifest.py
"""
from __future__ import annotations

import importlib
import math
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

import qv_common as C  # noqa: E402
import qv_textures as T  # noqa: E402
import qv_materials as MAT  # noqa: E402
import qv_animation as A  # noqa: E402

OUT_CHAR = C.PUBLIC / "characters"
SRC_CHAR = C.BLENDER_DIR / "characters"
TEX_CHAR = C.TEXTURES / "characters"
P = A.P


# ===================================================================== MPFB
def svc(suffix, symbol):
    for name in list(sys.modules):
        if name.endswith(suffix):
            mod = importlib.import_module(name)
            if hasattr(mod, symbol):
                return getattr(mod, symbol)
    raise RuntimeError(
        "MPFB is not loaded. Install the MPFB extension (Blender > Preferences > Get Extensions > MPFB), "
        "enable it, install the MakeHuman system asset pack, then rerun. See docs/SETUP.md.")


class MPFB:
    def __init__(self):
        self.HS = svc("mpfb.services.humanservice", "HumanService")
        self.TS = svc("mpfb.services.targetservice", "TargetService")
        self.AS = svc("mpfb.services.assetservice", "AssetService")
        self.ES = svc("mpfb.services.exportservice", "ExportService")
        self.OS = svc("mpfb.services.objectservice", "ObjectService")
        self.CS = svc("mpfb.services.clothesservice", "ClothesService")
        self.LS = svc("mpfb.services.locationservice", "LocationService")
        self.HOP = svc("mpfb.entities.objectproperties", "HumanObjectProperties")
        self.Mhclo = svc("mpfb.entities.clothes.mhclo", "Mhclo")

    def find(self, subdir, names):
        for n in names if isinstance(names, (list, tuple)) else [names]:
            p = self.AS.find_asset_absolute_path(n, asset_subdir=subdir)
            if p:
                return p, n
        return None, None


# ================================================================== helpers
def set_blend(mat, mode):
    if hasattr(mat, "blend_method"):
        mat.blend_method = mode
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "DITHERED" if mode != "BLEND" else "BLENDED"
    if mode == "CLIP" and hasattr(mat, "alpha_threshold"):
        mat.alpha_threshold = 0.45
    if mode == "OPAQUE":
        b = mat.node_tree.nodes.get("Principled BSDF") if mat.use_nodes else None
        if b:
            for link in list(mat.node_tree.links):
                if link.to_node == b and link.to_socket.name == "Alpha":
                    mat.node_tree.links.remove(link)
            b.inputs["Alpha"].default_value = 1.0


def image_nodes(mat):
    return [n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image] if mat and mat.use_nodes else []


def save_scaled(img, out_path: Path, cap):
    """Copy an image to the project texture folder, downscaled to <= cap px."""
    w, h = img.size
    if w > cap or h > cap:
        f = cap / max(w, h)
        img.scale(max(1, int(w * f)), max(1, int(h * f)))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    has_alpha = img.alpha_mode != "NONE" and img.depth in (32, 64, 128) and out_path.suffix == ".png"
    img.filepath_raw = str(out_path)
    img.file_format = "PNG" if out_path.suffix == ".png" else "JPEG"
    img.save()
    img.filepath = str(out_path)
    img.reload()
    return img


def mesh_children(rig):
    return [c for c in rig.children if c.type == "MESH"]


def rigid_attach(obj, rig, bone):
    obj.parent = rig
    vg = obj.vertex_groups.new(name=bone)
    vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    m = obj.modifiers.new("Armature", "ARMATURE")
    m.object = rig
    return obj


def bm_object(name, bm, mat_list, col):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mat_list:
        me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    col.objects.link(o)
    return o


def ray_down(objs, x, y, z_from=3.0):
    deps = bpy.context.evaluated_depsgraph_get()
    best = None
    for o in objs:
        ok, loc, nrm, _ = o.ray_cast(Vector((x, y, z_from)), Vector((0, 0, -1)), depsgraph=deps)
        if ok and (best is None or loc.z > best.z):
            best = loc
    return best


def ray_dir(objs, origin, direction):
    deps = bpy.context.evaluated_depsgraph_get()
    best, bd = None, 1e9
    for o in objs:
        ok, loc, nrm, _ = o.ray_cast(origin, direction, depsgraph=deps)
        if ok and (loc - origin).length < bd:
            best, bd = (loc, nrm), (loc - origin).length
    return best


# ============================================================ facial morphs
def add_expression_keys(mp: MPFB, basemesh, ethnic="asian"):
    base_dir = Path(mp.LS.get_mpfb_data("targets")) / "expression" / "units"
    loaded = []
    for key, unit in A.EXPRESSION_UNITS.items():
        path = base_dir / ethnic / f"{unit}.target.gz"
        if not path.exists():
            path = base_dir / "caucasian" / f"{unit}.target.gz"
        if path.exists():
            mp.TS.load_target(basemesh, str(path), weight=0.0, name=key)
            loaded.append(key)
        else:
            C.log("  [warn] expression unit missing:", unit)
    return loaded


def interpolate_keys(mp: MPFB, basemesh, children, names):
    """Transfer basemesh expression keys to proxies (brows, lashes) via MHCLO vertex binding."""
    kb = basemesh.data.shape_keys.key_blocks
    basis = np.empty(len(basemesh.data.vertices) * 3, np.float32)
    kb["Basis"].data.foreach_get("co", basis)
    basis = basis.reshape(-1, 3)
    deltas = {}
    for n in names:
        a = np.empty_like(basis.ravel())
        kb[n].data.foreach_get("co", a)
        deltas[n] = a.reshape(-1, 3) - basis
    for child in children:
        path = mp.CS.find_clothes_absolute_path(child)
        if not path:
            continue
        cl = mp.Mhclo()
        cl.load(path)
        nv = len(child.data.vertices)
        idx = np.zeros((nv, 3), np.int64)
        wts = np.zeros((nv, 3), np.float32)
        valid = np.zeros(nv, bool)
        for vi, mapping in cl.verts.items():
            if vi < nv:
                idx[vi] = mapping["verts"]
                wts[vi] = mapping["weights"]
                valid[vi] = True
        co = np.empty(nv * 3, np.float32)
        child.data.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        if not child.data.shape_keys:
            child.shape_key_add(name="Basis", from_mix=False)
        for n, d in deltas.items():
            off = (d[idx] * wts[..., None]).sum(1) * valid[:, None]
            if np.abs(off).max() < 1e-5:
                continue
            k = child.shape_key_add(name=n, from_mix=False)
            k.data.foreach_set("co", (co + off).ravel())


def flatten_macro_keys(obj, keep):
    """Bake modelling (macro) shape keys into the mesh, keep only expression morphs."""
    if not obj.data.shape_keys:
        return
    kb = obj.data.shape_keys.key_blocks
    for k in kb:
        if k.name in keep:
            k.value = 0.0
    nv = len(obj.data.vertices)
    basis = np.empty(nv * 3, np.float32)
    kb[0].data.foreach_get("co", basis)
    deltas = {}
    for n in keep:
        if n in kb:
            a = np.empty(nv * 3, np.float32)
            kb[n].data.foreach_get("co", a)
            rel = np.empty(nv * 3, np.float32)
            kb[n].relative_key.data.foreach_get("co", rel)
            deltas[n] = a - rel
    mix = obj.shape_key_add(name="__mix", from_mix=True)
    mixed = np.empty(nv * 3, np.float32)
    mix.data.foreach_get("co", mixed)
    obj.shape_key_clear()
    obj.data.vertices.foreach_set("co", mixed)
    obj.data.update()
    if deltas:
        obj.shape_key_add(name="Basis", from_mix=False)
        for n in keep:
            if n in deltas:
                k = obj.shape_key_add(name=n, from_mix=False)
                k.data.foreach_set("co", mixed + deltas[n])


# ============================================================ garments
class Garments:
    def __init__(self, ch, mp, basemesh, rig, col, mats):
        self.ch, self.mp, self.base, self.rig, self.col, self.M = ch, mp, basemesh, rig, col, mats
        self.bones = rig.data.bones
        self.objs = []

    def head(self, n):
        return Vector(self.bones[P + n].head_local)

    def tail(self, n):
        return Vector(self.bones[P + n].tail_local)

    def _body_bm(self):
        """Evaluated basemesh with helpers hidden but clothes delete-masks disabled."""
        states = {}
        for m in self.base.modifiers:
            states[m.name] = m.show_viewport
            if m.type == "MASK" and m.vertex_group != "body":
                m.show_viewport = False
            if m.type == "ARMATURE":
                m.show_viewport = False
        deps = bpy.context.evaluated_depsgraph_get()
        ev = self.base.evaluated_get(deps)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=deps)
        for m in self.base.modifiers:
            m.show_viewport = states[m.name]
        bm = bmesh.new()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        bm.verts.ensure_lookup_table()
        bm.normal_update()
        return bm

    def _weights(self, bm):
        deform = bm.verts.layers.deform.active
        names = {i: g.name for i, g in enumerate(self.base.vertex_groups)}
        return deform, names

    def shell(self, name, keep_fn, offset_fn, mats, mat_fn=None, smooth=True):
        bm = self._body_bm()
        deform, names = self._weights(bm)
        kill = []
        for vtx in bm.verts:
            w = {names[i]: x for i, x in vtx[deform].items() if i in names}
            if not keep_fn(vtx.co, w):
                kill.append(vtx)
        bmesh.ops.delete(bm, geom=kill, context="VERTS")
        bm.normal_update()
        for vtx in bm.verts:
            vtx.co = vtx.co + vtx.normal * offset_fn(vtx.co)
        if mat_fn:
            for f in bm.faces:
                f.material_index = mat_fn(f.calc_center_median())
        for f in bm.faces:
            f.smooth = smooth
        o = bm_object(name, bm, mats, self.col)
        for g in self.base.vertex_groups:
            o.vertex_groups.new(name=g.name)
        # drop helper/non-bone groups so the exporter only sees joints
        for g in list(o.vertex_groups):
            if not g.name.startswith(P):
                o.vertex_groups.remove(g)
        o.parent = self.rig
        m = o.modifiers.new("Armature", "ARMATURE")
        m.object = self.rig
        C.box_uv(o, 0.25)
        self.objs.append(o)
        return o

    # ---- judge robe: torso/arm shell + skirt with leg-following front
    def judge_robe(self):
        M = self.M
        bm_groups = {P + n for n in ["Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder",
                                     "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "Neck"]}
        neck_z = self.head("Neck").z
        hips_z = self.head("Hips").z
        cy = self.head("Spine1").y

        def keep(co, w):
            s = sum(x for g, x in w.items() if g in bm_groups)
            if co.z > neck_z + 0.03:
                return False
            if co.z < hips_z - 0.06:
                return False
            if w.get(P + "Neck", 0) > 0.5 and co.y < cy:
                return False  # leave the throat open (shirt collar shows)
            return s > 0.5

        def off(co):
            return 0.034 if co.z < neck_z - 0.05 else 0.02

        def trim(c):
            return 1 if (0.035 < abs(c.x) < 0.075 and c.y < cy and c.z > hips_z - 0.1) else 0
        self.shell(f"{self.ch['id']}_Robe", keep, off, [M["robe"]])
        self._skirt(hips_z, cy)

    def _skirt(self, hips_z, cy):
        M = self.M
        bm = self._body_bm()
        top = hips_z + 0.02
        ring = [v.co.copy() for v in bm.verts if abs(v.co.z - top) < 0.025 and abs(v.co.x) < 0.2]
        bm.free()
        xs = [c.x for c in ring] or [-0.17, 0.17]
        ys = [c.y for c in ring] or [-0.12, 0.1]
        rx0, ry0 = (max(xs) - min(xs)) / 2 + 0.035, (max(ys) - min(ys)) / 2 + 0.04
        cyc = (max(ys) + min(ys)) / 2
        bottom = 0.32
        seg, rows = 32, 10
        bm = bmesh.new()
        grid = []
        for r in range(rows + 1):
            k = r / rows
            z = top + (bottom - top) * k
            rx, ry = rx0 + 0.05 * k, ry0 + 0.06 * k
            row = []
            for s in range(seg):
                a = 2 * math.pi * s / seg
                row.append(bm.verts.new((rx * math.sin(a), cyc - ry * math.cos(a), z)))
            grid.append(row)
        for r in range(rows):
            for s in range(seg):
                a, b = grid[r][s], grid[r][(s + 1) % seg]
                c, d = grid[r + 1][(s + 1) % seg], grid[r + 1][s]
                f = bm.faces.new((a, b, c, d))
                ctr = (a.co + c.co) / 2
                f.material_index = 1 if 0.03 < abs(ctr.x) < 0.05 and ctr.y < cyc - ry0 * 0.6 else 0
                f.smooth = True
        bm.normal_update()
        # face normals outward
        for f in bm.faces:
            if f.normal.dot(f.calc_center_median() - Vector((0, cyc, f.calc_center_median().z))) < 0:
                f.normal_flip()
        o = bm_object(f"{self.ch['id']}_RobeSkirt", bm, [M["robe"], M["robe_trim"]], self.col)
        hips = o.vertex_groups.new(name=P + "Hips")
        lg = o.vertex_groups.new(name=P + "LeftUpLeg")
        rg = o.vertex_groups.new(name=P + "RightUpLeg")
        for vtx in o.data.vertices:
            k = (top - vtx.co.z) / (top - bottom)
            front = max(0.0, (cyc - vtx.co.y) / ry0)
            side = max(0.0, min(1.0, 0.5 + vtx.co.x / (2 * rx0)))
            leg = min(0.85, k * 1.1) * min(1.0, 0.25 + front)
            hips.add([vtx.index], 1 - leg, "REPLACE")
            if leg > 0:
                lg.add([vtx.index], leg * side, "REPLACE")
                rg.add([vtx.index], leg * (1 - side), "REPLACE")
        o.parent = self.rig
        o.modifiers.new("Armature", "ARMATURE").object = self.rig
        C.box_uv(o, 0.25)
        self.objs.append(o)

    # ---- headscarf (ro'mol): hood + cape shrink-wrapped over head and shoulders, open face oval
    def headscarf(self):
        hd, tl = self.head("Head"), self.tail("Head")
        sh_z = self.head("LeftArm").z
        hc = Vector((0, hd.y + 0.012, (hd.z + tl.z) / 2 + 0.005))
        face_c = Vector((0, hd.y, hd.z + 0.06))
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=0.14)
        for vtx in bm.verts:
            co = vtx.co.copy()
            if co.z < 0:  # lower hemisphere becomes a cape down to the shoulders
                k = -co.z / 0.14
                r = Vector((co.x, co.y, 0))
                r = r.normalized() if r.length > 1e-6 else Vector((0, 1, 0))
                rad = 0.10 + 0.11 * k
                z = -0.02 - k * (hc.z - (sh_z + 0.01) - 0.02)
                co = Vector((r.x * rad * 1.05, r.y * rad, z))
            vtx.co = hc + co
        kill = [x for x in bm.verts
                if x.co.y < hd.y - 0.01 and ((x.co.x / 0.072) ** 2 + ((x.co.z - face_c.z) / 0.088) ** 2) < 1.0]
        bmesh.ops.delete(bm, geom=kill, context="VERTS")
        for f in bm.faces:
            f.smooth = True
        o = bm_object(f"{self.ch['id']}_Headscarf", bm, [self.M["scarf"]], self.col)
        head_vg = o.vertex_groups.new(name="_wrap_head")
        cape_vg = o.vertex_groups.new(name="_wrap_cape")
        for x in o.data.vertices:
            (head_vg if x.co.z > hd.z + 0.01 else cape_vg).add([x.index], 1.0, "REPLACE")
        for vg, off in ((head_vg, 0.016), (cape_vg, 0.035)):
            sw = o.modifiers.new(f"Shrink{vg.name}", "SHRINKWRAP")
            sw.target = self.base
            sw.wrap_method = "NEAREST_SURFACEPOINT"
            sw.wrap_mode = "OUTSIDE_SURFACE"
            sw.offset = off
            sw.vertex_group = vg.name
        sm = o.modifiers.new("Smooth", "SMOOTH")
        sm.iterations = 4
        sm.factor = 0.5
        o = C.evaluated_to_mesh(o, f"{self.ch['id']}_Headscarf")
        for vg in list(o.vertex_groups):
            o.vertex_groups.remove(vg)
        g_head = o.vertex_groups.new(name=P + "Head")
        g_neck = o.vertex_groups.new(name=P + "Neck")
        g_chest = o.vertex_groups.new(name=P + "Spine2")
        for x in o.data.vertices:
            z = x.co.z
            wh = max(0.0, min(1.0, (z - (hd.z - 0.05)) / 0.07))
            wc = max(0.0, min(1.0, ((hd.z - 0.04) - z) / 0.08)) * (1 - wh)
            wn = max(0.0, 1 - wh - wc)
            for g, w in ((g_head, wh), (g_neck, wn), (g_chest, wc)):
                if w > 0:
                    g.add([x.index], w, "REPLACE")
        o.parent = self.rig
        o.modifiers.new("Armature", "ARMATURE").object = self.rig
        C.box_uv(o, 0.09)
        self.objs.append(o)

    # ---- rigid accessories
    def hair_bun(self):
        """Low chignon: trims a ponytail's hanging tail and adds a coiled bun at the nape."""
        hd, tl = self.head("Head"), self.tail("Head")
        c = Vector((0, hd.y + 0.085, hd.z + 0.055))
        for hair in [o for o in mesh_children(self.rig) if "ponytail" in o.name.lower()]:
            bm = bmesh.new()
            bm.from_mesh(hair.data)
            cut = [x for x in bm.verts if x.co.z < hd.z + 0.03 and x.co.y > hd.y + 0.02]
            bmesh.ops.delete(bm, geom=cut, context="VERTS")
            bm.to_mesh(hair.data)
            bm.free()
        hit = ray_dir([o for o in mesh_children(self.rig) if "hair" in o.name.lower() or o == self.base],
                      Vector((0, hd.y + 0.4, c.z)), Vector((0, -1, 0)))
        if hit:
            c.y = hit[0].y + 0.02
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=0.048)
        bmesh.ops.scale(bm, vec=Vector((1.05, 0.75, 0.85)), verts=bm.verts)
        # coiled look: a twisted torus ring around the bun
        for f in bm.faces:
            f.smooth = True
        bmesh.ops.translate(bm, vec=c, verts=bm.verts)
        o = bm_object(f"{self.ch['id']}_HairBun", bm, [self.M["hair_solid"]], self.col)
        C.box_uv(o, 0.08)
        rigid_attach(o, self.rig, P + "Head")
        self.objs.append(o)

    def shoulder_boards(self):
        cloth = [o for o in mesh_children(self.rig) if o != self.base] + [self.base]
        for side, sg in (("Left", 1), ("Right", -1)):
            a = self.head(f"{side}Arm")
            x = a.x - sg * 0.055
            hit = ray_down(cloth, x, a.y, 2.5)
            z = (hit.z if hit else a.z + 0.06) + 0.004
            o = C.box(f"{self.ch['id']}_Epaulette_{side}", (0.11, 0.055, 0.008), (x, a.y, z), self.M["uniform_gold"],
                      self.col, rot=(0, math.radians(sg * -14), 0))
            stripe = C.box(f"{self.ch['id']}_EpauletteStripe_{side}", (0.1, 0.012, 0.009), (x, a.y, z + 0.001),
                           self.M["navy_dark"], self.col, rot=(0, math.radians(sg * -14), 0))
            for ob in (o, stripe):
                rigid_attach(ob, self.rig, P + f"{side}Shoulder")
                self.objs.append(ob)

    def badge(self):
        cloth = [o for o in mesh_children(self.rig) if o != self.base and "hair" not in o.name.lower()]
        sp = self.head("Spine2")
        org = Vector((0.085, sp.y - 0.5, sp.z + 0.04))
        hit = ray_dir(cloth or [self.base], org, Vector((0, 1, 0)))
        loc = hit[0] - Vector((0, 0.004, 0)) if hit else Vector((0.085, sp.y - 0.12, sp.z + 0.04))
        o = C.box(f"{self.ch['id']}_Badge", (0.05, 0.006, 0.06), loc, self.M["uniform_gold"], self.col)
        rigid_attach(o, self.rig, P + "Spine2")
        self.objs.append(o)

    def peaked_cap(self):
        hd, tl = self.head("Head"), self.tail("Head")
        hair = [o for o in mesh_children(self.rig) if "hair" in o.name.lower()] + [self.base]
        hit = ray_down(hair, 0.0, hd.y + 0.005, tl.z + 0.5)
        top_z = hit.z if hit else tl.z + 0.02
        base_z = top_z - 0.085
        cy = hd.y + 0.008
        parts = []
        parts.append(C.cylinder(f"{self.ch['id']}_CapBand", 0.086, 0.04, (0, cy, base_z + 0.022),
                                self.M["navy_dark"], self.col, verts=24))
        parts.append(C.cylinder(f"{self.ch['id']}_CapCrown", 0.088, 0.035, (0, cy + 0.006, base_z + 0.055),
                                self.M["uniform_cap"], self.col, verts=24, radius2=0.104))
        parts.append(C.cylinder(f"{self.ch['id']}_CapTop", 0.105, 0.008, (0, cy + 0.01, base_z + 0.074),
                                self.M["uniform_cap"], self.col, verts=24))
        visor = C.cylinder(f"{self.ch['id']}_CapVisor", 0.075, 0.005, (0, cy - 0.075, base_z + 0.008),
                           self.M["black_gloss"], self.col, verts=16)
        visor.scale = (1.0, 0.6, 1.0)
        visor.rotation_euler = (math.radians(-14), 0, 0)
        parts.append(visor)
        parts.append(C.box(f"{self.ch['id']}_CapBadge", (0.025, 0.006, 0.028), (0, cy - 0.097, base_z + 0.042),
                           self.M["uniform_gold"], self.col))
        for p_ in parts:
            rigid_attach(p_, self.rig, P + "Head")
            self.objs.append(p_)

    def build(self, names):
        for n in names:
            fn = getattr(self, n, None)
            if fn is None:
                C.log("  [warn] unknown garment", n)
                continue
            fn()
        return self.objs


def garment_materials(ch):
    gid = ch["id"]
    hair = ch["mpfb"].get("hair_color", [20, 16, 14])
    lin = lambda c: tuple((x / 255.0) ** 2.2 for x in c)  # noqa: E731
    M = Lazy({
        "robe": lambda: MAT.textured(f"QV_{gid}_Robe", T.fabric(f"fabric_{gid}_robe", (14, 14, 17), seed=71, rough=0.75),
                             normal_strength=0.6),
        "robe_trim": lambda: MAT.textured(f"QV_{gid}_RobeTrim", T.fabric(f"fabric_{gid}_trim", (205, 205, 200), seed=72,
                                                                rough=0.5), normal_strength=0.8),
        "scarf": lambda: MAT.textured(f"QV_{gid}_Scarf", scarf_texture(gid), normal_strength=0.5),
        "hair_solid": lambda: MAT.solid(f"QV_{gid}_HairBun", lin(hair), 0.55),
        "uniform_gold": lambda: MAT.solid("QV_Uniform_Gold", (0.78, 0.58, 0.22), 0.3, 1.0),
        "navy_dark": lambda: MAT.solid("QV_Uniform_NavyDark", lin((16, 22, 44)), 0.6),
        "uniform_cap": lambda: MAT.solid(f"QV_{gid}_CapCloth", lin(ch["mpfb"]["clothes_color"]), 0.7),
        "black_gloss": lambda: MAT.solid("QV_Black_Gloss", (0.01, 0.01, 0.012), 0.2),
    })
    return M


class Lazy(dict):
    """Materials/textures are generated only when a garment actually uses them."""

    def __getitem__(self, k):
        val = dict.__getitem__(self, k)
        if callable(val):
            val = val()
            dict.__setitem__(self, k, val)
        return val


def scarf_texture(gid):
    """Muted paisley-like pattern for the headscarf."""
    res = 256
    yy, xx = np.mgrid[0:res, 0:res].astype(np.float32)
    n = T.fbm(res, res, (8, 8), 3, 91)
    base = T.lerp_col(T._srgb((168, 150, 128)), T._srgb((140, 122, 102)), n)
    for cx, cy, r in [(64, 64, 26), (192, 192, 26), (192, 64, 18), (64, 192, 18), (128, 128, 12)]:
        for dx in (-res, 0, res):
            for dy in (-res, 0, res):
                d = np.sqrt((xx - cx - dx) ** 2 + (yy - cy - dy) ** 2)
                ring = (np.abs(d - r) < 3) | (d < r * 0.35)
                base[ring] = T._srgb((96, 66, 50))
    return T.pbr_set(f"fabric_{gid}_scarf", base.astype(np.float32), np.full((res, res), 0.85, np.float32),
                     n * 0.3, normal_strength=1)


# ============================================================ build one
def build_character(mp: MPFB, ch, do_export=True, render=False):
    t0 = time.time()
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.context.scene.render.fps = A.FPS  # clips are keyed at 30 fps; glTF times derive from this
    cid = ch["id"]
    cfg = ch["mpfb"]
    background = cfg.get("background", False)
    report = {"id": cid, "status": "building", "warnings": [], "assets": {}}

    base = mp.HS.create_human()
    base.name = f"{cid}_body"
    for k in ["gender", "age", "weight", "muscle", "height", "proportions", "african", "asian", "caucasian"]:
        val = (1.0 if ch["sex"] == "male" else 0.0) if k == "gender" else cfg[k]
        mp.HOP.set_value(k, val, entity_reference=base)
    mp.TS.reapply_macro_details(base)

    skin, skin_name = mp.find("skins", cfg["skin"])
    if not skin:
        raise RuntimeError(f"No skin from {cfg['skin']} - install the MakeHuman system asset pack")
    mp.HS.set_character_skin(skin, base, skin_type="GAMEENGINE")
    report["assets"]["skin"] = skin_name
    rig = mp.HS.add_builtin_rig(base, "mixamo")
    rig.name = cid
    rig.data.name = f"{cid}_skeleton"

    def add(subdir, names, cat, required=False):
        path, nm = mp.find(subdir, names)
        if not path:
            msg = f"{subdir} asset missing: {names}"
            if required:
                raise RuntimeError(msg)
            report["warnings"].append(msg)
            return None
        mp.HS.add_mhclo_asset(path, base, asset_type=cat, material_type="GAMEENGINE", subdiv_levels=0)
        report["assets"].setdefault(subdir, []).append(nm)
        return nm

    add("eyes", ["low-poly.mhclo"], "Eyes", required=True)
    add("eyebrows", [cfg["eyebrows"], "eyebrow001.mhclo"], "Eyebrows")
    add("eyelashes", [cfg["eyelashes"], "eyelashes01.mhclo"], "Eyelashes")
    add("teeth", ["teeth_base.mhclo"], "Teeth")
    if not background:
        add("tongue", ["tongue01.mhclo"], "Tongue")
    if "headscarf" not in ch.get("garments", []):
        add("hair", [cfg["hair"]], "Hair")
    add("clothes", cfg["clothes"], "Clothes")
    add("clothes", [cfg["shoes"]], "Clothes")

    # ---- expression morphs
    ethnic = "asian" if cfg["asian"] >= cfg["caucasian"] else "caucasian"
    morphs = add_expression_keys(mp, base, ethnic)
    face_parts = [o for o in mesh_children(rig) if any(k in o.name.lower() for k in ("eyebrow", "eyelash"))]
    interpolate_keys(mp, base, face_parts, morphs)
    report["morphs"] = morphs

    # ---- two-tone outfits: faces below the waist get their own material (trousers / skirt)
    if cfg.get("bottom_color"):
        waist = Vector(rig.data.bones[P + "Spine"].head_local).z + 0.02
        for o in mesh_children(rig):
            ln = o.name.lower()
            if not any(c.split(".")[0] in ln for c in cfg["clothes"]):
                continue
            top_mat = o.material_slots[0].material
            bot = top_mat.copy()
            bot["qv_part"] = "bottom"
            o.data.materials.append(bot)
            for poly in o.data.polygons:
                if poly.center.z < waist:
                    poly.material_index = 1

    # ---- materials: recolour clothes/hair, cap texture sizes, set alpha modes
    tex_dir = TEX_CHAR / cid
    caps = {"skin": 1024 if background else 2048, "default": 512 if background else 1024, "eyes": 256,
            "teeth": 256, "tongue": 256, "brows": 512}
    for o in mesh_children(rig):
        lname = o.name.lower()
        for slot in o.material_slots:
            mat = slot.material
            if not mat:
                continue
            kind = ("skin" if o == base else "eyes" if "low-poly" in lname else "teeth" if "teeth" in lname else
                    "tongue" if "tongue" in lname else "brows" if ("eyebrow" in lname or "eyelash" in lname) else
                    "hair" if any(h in lname for h in ("short", "long", "bob", "ponytail", "braid", "afro")) else
                    "shoes" if "shoes" in lname else "clothes")
            part = "_bottom" if mat.get("qv_part") == "bottom" else ""
            mat.name = f"QV_{cid}_{kind}{part}"
            set_blend(mat, "BLEND" if kind == "brows" else "CLIP" if kind == "hair" else "OPAQUE")
            color = {"clothes": cfg.get("bottom_color") if part else cfg.get("clothes_color"),
                     "shoes": cfg.get("shoes_color"), "hair": cfg.get("hair_color")}.get(kind)
            done = {}
            for n in image_nodes(mat):
                img = n.image
                if img.name in done:
                    n.image = done[img.name]
                    continue
                is_normal = "normal" in img.name.lower()
                cap = caps.get(kind, caps["default"])
                adjust = None
                if kind == "skin" and not is_normal:
                    adjust = dict(saturation=1.05, multiply=cfg.get("skin_tint", [0.94, 0.83, 0.72]))
                elif kind == "eyes":
                    adjust = dict(saturation=0.45, multiply=[0.78, 0.72, 0.66])
                if adjust:
                    path = T.adjust_texture(bpy.path.abspath(img.filepath), f"characters/{cid}/{kind}_albedo", **adjust)
                    new = save_scaled(bpy.data.images.load(str(path)), path, cap)
                elif color and not is_normal:
                    path = T.recolor_texture(bpy.path.abspath(img.filepath), f"characters/{cid}/{kind}{part}_albedo", color,
                                             keep_detail=0.6 if kind == "hair" else
                                             cfg.get("clothes_detail", 0.8) if kind == "clothes" else 0.8)
                    new = bpy.data.images.load(str(path))
                    new = save_scaled(new, path, cap)
                else:
                    has_alpha = kind in ("brows", "hair")
                    ext = ".png" if has_alpha else ".jpg"
                    new = save_scaled(img, tex_dir / f"{kind}{part}_{'normal' if is_normal else 'albedo'}{ext}",
                                      min(cap, 1024) if is_normal else cap)
                if is_normal:
                    new.colorspace_settings.name = "Non-Color"
                done[img.name] = new
                n.image = new
        o.name = f"{cid}_{o.name.split('.')[-1]}" if o != base else base.name

    # ---- procedural garments
    col = bpy.context.scene.collection
    gm = garment_materials(ch)
    gar = Garments(ch, mp, base, rig, col, gm).build(ch.get("garments", []))
    report["garments"] = [g.name for g in gar]

    # ---- animation
    solver = A.RigSolver(rig)
    lib = A.clip_library(solver, seat_h=0.485)
    wanted = list(dict.fromkeys(["Idle_Stand", "Idle_Seated", "Idle_Seated_Lap", "Walk"] + ch["animations"]))
    for nm in list(wanted):
        if nm + "_Seated" in lib:
            wanted.append(nm + "_Seated")
    clips = {}
    for nm in wanted:
        if nm not in lib:
            report["warnings"].append(f"clip {nm} not in library")
            continue
        spec = lib[nm]
        act = A.write_action(solver, nm, spec["keys"], loop=spec["loop"])
        A.push_nla(rig, act, nm)
        clips[nm] = {"duration_s": round(spec["keys"][-1][0], 3), "loop": spec["loop"], **spec.get("meta", {})}
    face = A.face_clips(set(morphs))
    face_actions = {}
    for nm, (dur, tracks, loop) in face.items():
        face_actions[nm] = (A.write_shape_action(base.data.shape_keys, nm, tracks, dur, morphs), dur, loop)
        clips[nm] = {"duration_s": dur, "loop": loop, "layer": "face"}
    rig.animation_data.action = None
    report["clips"] = clips
    report["dims"] = {"height_m": round(solver.height, 3), "hips_z": round(solver.hips_z, 3),
                      "leg_m": round(solver.thigh + solver.shin, 3)}

    # ---- save editable source
    SRC_CHAR.mkdir(parents=True, exist_ok=True)
    rig["qv_character"] = cid
    rig["qv_role"] = ch["role"]
    for k, val in [("qv_outfit_brief", ch["outfit_brief"]), ("qv_status", "mpfb_generated_needs_art_pass")]:
        rig[k] = val
    blend_path = SRC_CHAR / f"{cid}.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=True)
    report["blend"] = str(blend_path.relative_to(C.ROOT)).replace("\\", "/")

    if render:
        render_contact(rig, base, cid)
    if do_export:
        report["exports"] = export_character(mp, ch, rig, base, morphs, face_actions, background)
    report["status"] = "built"
    report["build_seconds"] = round(time.time() - t0, 1)
    C.save_json(SRC_CHAR / f"{cid}.report.json", report)
    return report


# ============================================================ export
def export_character(mp: MPFB, ch, rig, base, morphs, face_actions, background):
    cid = ch["id"]
    exp_col = C.collection("EXPORT")
    copy_root = mp.ES.create_character_copy(base, name_suffix="_x", place_in_collection=exp_col)
    xbody = mp.OS.find_object_of_type_amongst_nearest_relatives(copy_root, "Basemesh")
    mp.ES.bake_modifiers_remove_helpers(xbody, bake_masks=True, bake_subdiv=False, remove_helpers=True,
                                        also_proxy=True)
    flatten_macro_keys(xbody, morphs)
    xr = copy_root  # MPFB copies every child of the rig, procedural garments included
    # free the clean names held by the editable originals (in memory only; the .blend is already saved)
    for o in [rig] + list(rig.children):
        o.name = o.name + "__src"
    # join face parts with morphs into the body (single weights channel for face clips)
    kids = [c for c in xr.children if c.type == "MESH"]
    face = [c for c in kids if any(k in c.name.lower() for k in ("eyebrow", "eyelash", "low-poly", "teeth",
                                                                 "tongue"))]
    join(xbody, face)
    # join rigid/shell garments into one accessories mesh
    gnames = ("robe", "headscarf", "hairbun", "epaulette", "badge", "cap")
    acc = [c for c in xr.children if c.type == "MESH" and any(g in c.name.lower() for g in gnames)]
    if acc:
        join(acc[0], acc[1:])
        acc[0].name = f"{cid}_accessories"
    for c in xr.children:
        if c.type != "MESH":
            continue
        lname = c.name.lower()
        if c == xbody:
            c.name = f"{cid}_body"
        elif "accessories" in lname:
            pass
        elif "shoes" in lname:
            c.name = f"{cid}_shoes"
        elif any(h in lname for h in ("short", "long", "bob", "ponytail", "braid", "afro")):
            c.name = f"{cid}_hair"
        else:
            c.name = f"{cid}_clothes"
        c.data.name = c.name
        for m in list(c.modifiers):
            if m.type != "ARMATURE":
                c.modifiers.remove(m)
    xr.name = f"{cid}_root"
    xr.data.name = f"{cid}_skeleton"
    xr["qv_character"] = cid
    xr["qv_role"] = ch["role"]
    # NLA tracks for the export copy (actions are shared datablocks)
    if xr.animation_data:
        for tr in list(xr.animation_data.nla_tracks):
            xr.animation_data.nla_tracks.remove(tr)
        xr.animation_data.action = None
    for tr in rig.animation_data.nla_tracks:
        A.push_nla(xr, tr.strips[0].action, tr.name)
    key = xbody.data.shape_keys
    if key:
        for nm, (act, dur, loop) in face_actions.items():
            A.push_nla(key, act, nm)
    xr.location = (0, 0, 0)

    out = {}
    path = OUT_CHAR / f"{cid}.glb"
    export_glb(xr, path, animations=True)
    out["lod0"] = rel(path)
    # ---- LODs: decimated, no morphs, no clips (clips are shared by bone name)
    for lvl, ratio in ((1, 0.45), (2, 0.18)):
        lod_root, lod_meshes = duplicate_hierarchy(xr, f"_lod{lvl}")
        for m in lod_meshes:
            if m.data.shape_keys:
                m.shape_key_clear()
            dec = m.modifiers.new("Decimate", "DECIMATE")
            dec.ratio = ratio
            dec.use_collapse_triangulate = True
            arm = [x for x in m.modifiers if x.type == "ARMATURE"]
            if arm:
                bpy.context.view_layer.objects.active = m
                with bpy.context.temp_override(object=m, active_object=m):
                    bpy.ops.object.modifier_move_to_index(modifier="Decimate", index=0)
                    bpy.ops.object.modifier_apply(modifier="Decimate")
        p = OUT_CHAR / f"{cid}_lod{lvl}.glb"
        export_glb(lod_root, p, animations=False)
        out[f"lod{lvl}"] = rel(p)
    return out


def rel(p):
    return str(Path(p).relative_to(C.ROOT)).replace("\\", "/")


def join(target, others):
    others = [o for o in others if o and o != target]
    if not others:
        return target
    with bpy.context.temp_override(active_object=target, selected_editable_objects=[target] + others,
                                   object=target):
        bpy.ops.object.join()
    return target


def duplicate_hierarchy(root, suffix):
    col = C.collection("EXPORT_LOD")
    r = root.copy()
    r.data = root.data.copy()
    r.animation_data_clear()
    r.name = root.name.replace("_root", "") + suffix + "_root"
    col.objects.link(r)
    meshes = []
    for c in root.children:
        d = c.copy()
        d.data = c.data.copy()
        d.animation_data_clear()
        if d.data.shape_keys:
            d.data.shape_keys.animation_data_clear()
        d.name = c.name + suffix
        col.objects.link(d)
        d.parent = r
        for m in d.modifiers:
            if m.type == "ARMATURE":
                m.object = r
        meshes.append(d)
    return r, meshes


def export_glb(root, path: Path, animations=True):
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.context.scene.objects:
        o.select_set(False)
    root.select_set(True)
    for c in root.children_recursive:
        c.select_set(True)
    bpy.context.view_layer.objects.active = root
    path.parent.mkdir(parents=True, exist_ok=True)
    kw = dict(filepath=str(path), export_format="GLB", use_selection=True, export_apply=False,
              export_yup=True, export_texcoords=True, export_normals=True, export_extras=True,
              export_skins=True, export_morph=animations, export_morph_normal=False,
              export_try_sparse_sk=True, export_animations=animations, export_image_format="AUTO",
              export_jpeg_quality=85, export_def_bones=False, export_leaf_bone=False,
              export_optimize_animation_size=True, export_lights=False, export_cameras=False)
    if animations:
        kw.update(export_animation_mode="NLA_TRACKS", export_force_sampling=True, export_frame_step=2,
                  export_reset_pose_bones=True, export_rest_position_armature=True,
                  export_anim_slide_to_zero=True)
    bpy.ops.export_scene.gltf(**kw)
    C.log("  exported", path.name, f"{path.stat().st_size / 1e6:.2f} MB")


# ============================================================ preview
def render_contact(rig, base, cid):
    """Front/3-4 render of the character in a few clip poses for visual QA."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y = 640, 900
    scene.view_settings.view_transform = "AgX"
    world = bpy.data.worlds.new("qa") if not scene.world else scene.world
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.35, 0.35, 0.37, 1)
    cam = bpy.data.objects.new("QA_Cam", bpy.data.cameras.new("QA_Cam"))
    scene.collection.objects.link(cam)
    cam.data.lens = 50
    h = A.RigSolver(rig).height
    def aim_cam(loc):
        cam.location = loc
        cam.rotation_euler = (Vector((0, 0, h * 0.5)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    aim_cam((1.4, -3.6, h * 0.62))
    scene.camera = cam
    for i, (loc, energy) in enumerate([((2, -3, 3), 600), ((-3, -1, 2), 250), ((0, 3, 3), 300)]):
        L = bpy.data.objects.new(f"QA_L{i}", bpy.data.lights.new(f"QA_L{i}", "AREA"))
        L.data.energy = energy
        L.data.size = 2
        L.location = loc
        L.rotation_euler = (Vector((0, 0, 1)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(L)
    out = C.BLENDER_DIR / "renders" / "characters"
    out.mkdir(parents=True, exist_ok=True)
    ad = rig.animation_data
    saved = [(t, t.mute) for t in ad.nla_tracks]
    for clip, frame in [("Idle_Stand", 1), ("Idle_Seated", 1), ("Walk", 8), ("Address_Judge", 40),
                        ("Present_Evidence", 66), ("Gesture_Point", 30)]:
        tr = ad.nla_tracks.get(clip)
        if not tr:
            continue
        for t in ad.nla_tracks:
            t.mute = t != tr
        scene.frame_set(frame)
        scene.render.filepath = str(out / f"{cid}_{clip}.png")
        bpy.ops.render.render(write_still=True)
    # back three-quarter + face close-up for hair / garment QA
    for t in ad.nla_tracks:
        t.mute = t.name != "Idle_Stand"
    scene.frame_set(1)
    aim_cam((-2.2, 3.0, h * 0.75))
    scene.render.filepath = str(out / f"{cid}_back.png")
    bpy.ops.render.render(write_still=True)
    cam.data.lens = 120
    cam.location = (0.35, -1.6, h * 0.93)
    cam.rotation_euler = (Vector((0, 0, h * 0.92)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(out / f"{cid}_face.png")
    bpy.ops.render.render(write_still=True)
    for t, m in saved:
        t.mute = m
    for name in [o.name for o in scene.objects if o.name.startswith("QA_")]:
        bpy.data.objects.remove(bpy.data.objects[name])


# ============================================================ main
def main():
    args = C.cli_args()
    cast = C.load_json(C.CONFIG / "cast.json")["characters"]
    if "--only" in args:
        ids = args[args.index("--only") + 1].split(",")
        cast = [c for c in cast if c["id"] in ids]
    elif "--all" not in args:
        cast = [c for c in cast if c["id"] == "advokat"]
        C.log("No --all: building the advokat only (setup check)")
    try:
        mp = MPFB()
    except RuntimeError as e:
        C.log("[ERROR]", e)
        C.save_json(SRC_CHAR / "_mpfb_missing.json", {"error": str(e)})
        sys.exit(2)
    results = []
    for ch in cast:
        C.log(f"=== {ch['id']} ({ch['role']})")
        try:
            results.append(build_character(mp, ch, do_export="--no-export" not in args, render="--render" in args))
        except Exception as exc:  # keep going, report failure
            traceback.print_exc()
            results.append({"id": ch["id"], "status": "failed", "error": str(exc)})
            C.save_json(SRC_CHAR / f"{ch['id']}.report.json", results[-1])
    ok = sum(r["status"] == "built" for r in results)
    C.log(f"characters built: {ok}/{len(results)}")
    if ok < len(results):
        sys.exit(1)


if __name__ == "__main__":
    main()
