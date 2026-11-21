"""QonunAI - stylised floating legal-assistant mascot (original design).

Deliberately non-human so it reads as a guide, not a court participant:
turquoise + gold palette from the Uzbek flag / court brass, a dark visor face with
emissive eyes and mouth, a gold scales-of-justice chest emblem and a soft hover ring.
Silhouette stays readable at 96 px for the UI overlay.

Run: blender -b --python blender/scripts/build_qonunai.py -- [--render]
Out: blender/qonunai.blend, public/assets/characters/qonunai.glb (+ _lod1),
     public/assets/characters/qonunai_portrait.png (transparent UI fallback)
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import qv_common as C  # noqa: E402
import qv_materials as MAT  # noqa: E402
import qv_animation as A  # noqa: E402

R = math.radians
FPS = 30
BONES = {
    # name: (head, tail, parent)
    "root": ((0, 0, 0), (0, 0, 0.15), None),
    "body": ((0, 0, 0.30), (0, 0, 0.62), "root"),
    "head": ((0, 0, 0.66), (0, 0, 0.92), "body"),
    "arm_L": ((0.16, 0, 0.56), (0.30, 0, 0.47), "body"),
    "forearm_L": ((0.30, 0, 0.47), (0.40, -0.02, 0.38), "arm_L"),
    "hand_L": ((0.40, -0.02, 0.38), (0.45, -0.03, 0.33), "forearm_L"),
    "arm_R": ((-0.16, 0, 0.56), (-0.30, 0, 0.47), "body"),
    "forearm_R": ((-0.30, 0, 0.47), (-0.40, -0.02, 0.38), "arm_R"),
    "hand_R": ((-0.40, -0.02, 0.38), (-0.45, -0.03, 0.33), "forearm_R"),
    "ring": ((0, 0, 0.18), (0, 0, 0.26), "root"),
}


def mats():
    return {
        "shell": MAT.solid("QAI_Shell_Turquoise", (0.02, 0.42, 0.42), 0.25, coat=0.6),
        "white": MAT.solid("QAI_Shell_Pearl", (0.82, 0.86, 0.86), 0.3, coat=0.4),
        "gold": MAT.solid("QAI_Gold", (0.83, 0.62, 0.22), 0.25, 1.0),
        "visor": MAT.solid("QAI_Visor", (0.006, 0.012, 0.02), 0.08, emission=(0.02, 0.08, 0.12),
                           emission_strength=0.6),
        "glow": MAT.solid("QAI_Glow_Cyan", (0.3, 1.0, 0.95), 0.4, emission=(0.25, 1.0, 0.92),
                          emission_strength=5.0),
    }


def part(name, bm, mat, col, bone, groups=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    col.objects.link(o)
    for p in me.polygons:
        p.use_smooth = True
    vg = o.vertex_groups.new(name=bone)
    vg.add(list(range(len(me.vertices))), 1.0, "REPLACE")
    for g in groups or []:
        o.vertex_groups.new(name=g).add(list(range(len(me.vertices))), 1.0, "REPLACE")
    C.box_uv(o, 0.2)
    return o


def ellipsoid(r, scale, loc, seg=32, rings=16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return bm


def segment(a, b, r, seg=20, rings=12):
    """Ellipsoid whose long axis spans bone head a -> tail b (so limbs stay connected)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    half = d.length / 2 + r * 0.6
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    bmesh.ops.scale(bm, vec=Vector((r, r, half)), verts=bm.verts)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=q.to_matrix())
    bmesh.ops.translate(bm, vec=(a + b) / 2, verts=bm.verts)
    return bm


def torus(R_, r, loc, rot=(0, 0, 0), seg=40, rs=10):
    bm = bmesh.new()
    verts = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ring = []
        for j in range(rs):
            b = 2 * math.pi * j / rs
            p = Vector(((R_ + r * math.cos(b)) * math.cos(a), (R_ + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
            ring.append(bm.verts.new(p))
        verts.append(ring)
    for i in range(seg):
        for j in range(rs):
            bm.faces.new((verts[i][j], verts[(i + 1) % seg][j], verts[(i + 1) % seg][(j + 1) % rs],
                          verts[i][(j + 1) % rs]))
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rot[0], 3, "X"))
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return bm


def box_bm(size, loc, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=3, affect="EDGES")
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return bm


def build_mesh(col, M):
    parts = []
    # torso: pearl egg with turquoise jacket panels
    parts.append(part("torso", ellipsoid(0.17, (1.0, 0.82, 1.15), (0, 0, 0.47)), M["white"], col, "body"))
    parts.append(part("jacket", ellipsoid(0.172, (1.02, 0.84, 0.8), (0, 0.004, 0.43)), M["shell"], col, "body"))
    parts.append(part("collar", torus(0.1, 0.018, (0, 0, 0.63)), M["gold"], col, "body"))
    # chest emblem: scales of justice
    e = Vector((0, -0.148, 0.5))
    parts.append(part("emblem_disc", ellipsoid(0.05, (1, 0.25, 1), e), M["gold"], col, "body"))
    for name, size, off in [("emblem_post", (0.006, 0.01, 0.055), (0, -0.012, 0)),
                            ("emblem_beam", (0.06, 0.01, 0.006), (0, -0.012, 0.02)),
                            ("emblem_panL", (0.02, 0.01, 0.006), (0.026, -0.012, -0.006)),
                            ("emblem_panR", (0.02, 0.01, 0.006), (-0.026, -0.012, -0.006))]:
        parts.append(part(name, box_bm(size, e + Vector(off)), M["glow"], col, "body"))
    # hover base + ring
    parts.append(part("skirt", ellipsoid(0.12, (1, 0.85, 0.55), (0, 0, 0.29)), M["shell"], col, "body"))
    parts.append(part("thruster", ellipsoid(0.06, (1, 1, 0.5), (0, 0, 0.24)), M["glow"], col, "body"))
    parts.append(part("hover_ring", torus(0.14, 0.012, (0, 0, 0.2)), M["glow"], col, "ring"))
    # head: rounded pearl helmet + dark visor + gold ear discs + antenna
    parts.append(part("head", ellipsoid(0.15, (1.12, 0.95, 0.9), (0, 0, 0.8)), M["white"], col, "head"))
    parts.append(part("visor", ellipsoid(0.128, (1.12, 0.6, 0.72), (0, -0.08, 0.795)), M["visor"], col, "head"))
    for s in (1, -1):
        parts.append(part(f"ear_{s}", ellipsoid(0.045, (0.4, 1, 1), (s * 0.165, 0, 0.8)), M["gold"], col, "head"))
    parts.append(part("antenna", box_bm((0.008, 0.008, 0.06), (0, 0.02, 0.96)), M["gold"], col, "head"))
    parts.append(part("antenna_tip", ellipsoid(0.018, (1, 1, 1), (0, 0.02, 0.995), 12, 8), M["glow"], col, "head"))
    # face features (emissive) - morph targets act on these vertex groups
    for s, g in ((1, "eyeL"), (-1, "eyeR")):
        parts.append(part(f"eye_{g}", ellipsoid(0.024, (0.9, 0.35, 1.35), (s * 0.052, -0.1495, 0.815), 16, 10),
                          M["glow"], col, "head", [g]))
    parts.append(part("mouth", box_bm((0.05, 0.012, 0.008), (0, -0.152, 0.758), bevel=0.003), M["glow"], col,
                      "head", ["mouth"]))
    # arms: rounded segments + mitten hands
    for s, side in ((1, "L"), (-1, "R")):
        parts.append(part(f"shoulder_{side}", ellipsoid(0.045, (1, 1, 1), (s * 0.16, 0, 0.56)), M["gold"], col,
                          f"arm_{side}"))
        bh = {k: (Vector(v[0]), Vector(v[1])) for k, v in BONES.items()}
        ua, ub = bh[f"arm_{side}"]
        la, lb = bh[f"forearm_{side}"]
        ha, hb = bh[f"hand_{side}"]
        parts.append(part(f"upper_{side}", segment(ua, ub, 0.04), M["shell"], col, f"arm_{side}"))
        parts.append(part(f"elbow_{side}", ellipsoid(0.036, (1, 1, 1), la), M["gold"], col, f"forearm_{side}"))
        parts.append(part(f"lower_{side}", segment(la, lb, 0.035), M["white"], col, f"forearm_{side}"))
        parts.append(part(f"hand_{side}", ellipsoid(0.042, (1, 0.8, 1.15), (ha + hb) / 2), M["shell"], col,
                          f"hand_{side}"))
        parts.append(part(f"thumb_{side}", ellipsoid(0.017, (1, 1, 1.3), (ha + hb) / 2 + Vector((-s * 0.012, -0.03, 0.012))),
                          M["shell"], col, f"hand_{side}"))
    body = parts[0]
    with bpy.context.temp_override(active_object=body, selected_editable_objects=parts, object=body):
        bpy.ops.object.join()
    body.name = body.data.name = "qonunai_body"
    add_face_keys(body)
    return body


def add_face_keys(o):
    me = o.data
    idx = {g.name: g.index for g in o.vertex_groups}

    def members(gname):
        gi = idx[gname]
        return [v for v in me.vertices if any(g.group == gi for g in v.groups)]
    o.shape_key_add(name="Basis")
    eyes = {g: members(g) for g in ("eyeL", "eyeR")}
    mouth = members("mouth")
    centers = {g: sum((v.co for v in vs), Vector()) / len(vs) for g, vs in eyes.items()}
    mc = sum((v.co for v in mouth), Vector()) / len(mouth)

    def key(name, fn):
        k = o.shape_key_add(name=name, from_mix=False)
        for g, vs in eyes.items():
            for v in vs:
                k.data[v.index].co = fn("eye", g, v.co.copy(), centers[g])
        for v in mouth:
            k.data[v.index].co = fn("mouth", None, v.co.copy(), mc)

    def blink(kind, g, co, c):
        if kind == "eye":
            co.z = c.z + (co.z - c.z) * 0.08
        return co

    def happy(kind, g, co, c):
        if kind == "eye":
            dx = (co.x - c.x) / 0.022
            co.z = c.z + (co.z - c.z) * 0.35 + 0.012 * (1 - min(1, dx * dx))
        return co

    def concerned(kind, g, co, c):
        if kind == "eye":
            sgn = 1 if g == "eyeL" else -1
            co.z += -(co.x - c.x) * sgn * 0.45
            co.z = c.z + (co.z - c.z) * 0.8
        else:
            co.x = c.x + (co.x - c.x) * 0.7
            co.z -= 0.004 * (1 - ((co.x - c.x) / 0.025) ** 2)
        return co

    def mouth_open(kind, g, co, c):
        if kind == "mouth":
            co.z = c.z + (co.z - c.z) * 3.5
            co.x = c.x + (co.x - c.x) * 0.8
        return co

    def smile(kind, g, co, c):
        if kind == "mouth":
            dx = (co.x - c.x) / 0.025
            co.z += 0.008 * dx * dx - 0.002
            co.x = c.x + (co.x - c.x) * 1.15
        return co
    key("Blink", blink)
    key("Happy", happy)
    key("Concerned", concerned)
    key("Mouth_Open", mouth_open)
    key("Smile", smile)


def build_rig(col):
    arm = bpy.data.armatures.new("qonunai_skeleton")
    rig = bpy.data.objects.new("qonunai", arm)
    col.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (h, t, par) in BONES.items():
        b = arm.edit_bones.new(name)
        b.head, b.tail = Vector(h), Vector(t)
        b.roll = 0
        if par:
            b.parent = arm.edit_bones[par]
            b.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return rig


# --------------------------------------------------------------- animation
def basis(rig, bone, rots):
    Rb = rig.data.bones[bone].matrix_local.to_3x3()
    Rm = Matrix.Identity(3)
    for ax, deg in rots:
        Rm = Matrix.Rotation(R(deg), 3, ax) @ Rm
    return (Rb.inverted() @ Rm @ Rb).to_quaternion()


def write(rig, key_db, name, duration, pose_fn, face_fn, loop=True, step=1 / 15):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    n = max(2, int(round(duration / step)))
    times = [i * duration / n for i in range(n + 1)]
    poses = [pose_fn(t) for t in times]
    for bone in BONES:
        prev = None
        qs = []
        for p in poses:
            q = basis(rig, bone, p.get(bone, []))
            if prev is not None:
                q.make_compatible(prev)
            prev = q
            qs.append(q)
        for i in range(4):
            fc = act.fcurves.new(f'pose.bones["{bone}"].rotation_quaternion', index=i, action_group=bone)
            fc.keyframe_points.add(len(times))
            for kp, t, q in zip(fc.keyframe_points, times, qs):
                kp.co = (1 + t * FPS, q[i])
            fc.update()
    for attr, key in (("location", "root_loc"), ("scale", "root_scale")):
        for i in range(3):
            fc = act.fcurves.new(f'pose.bones["root"].{attr}', index=i, action_group="root")
            fc.keyframe_points.add(len(times))
            for kp, t, p in zip(fc.keyframe_points, times, poses):
                default = (0, 0, 0) if attr == "location" else (1, 1, 1)
                val = p.get(key, default)
                # bone-local: root points +Z, so local Y = world Z
                vec = Vector(val)
                if attr == "location":
                    vec = rig.data.bones["root"].matrix_local.to_3x3().inverted() @ vec
                kp.co = (1 + t * FPS, vec[i])
            fc.update()
    A.push_nla(rig, act, name)
    fa = bpy.data.actions.new(name + "__face")
    fa.use_fake_user = True
    faces = [face_fn(t) for t in times]
    for k in ("Blink", "Happy", "Concerned", "Mouth_Open", "Smile"):
        fc = fa.fcurves.new(f'key_blocks["{k}"].value')
        fc.keyframe_points.add(len(times))
        for kp, t, f in zip(fc.keyframe_points, times, faces):
            kp.co = (1 + t * FPS, f.get(k, 0.0))
        fc.update()
    A.push_nla(key_db, fa, name)
    return {"duration_s": round(duration, 3), "loop": loop}


def blink_at(t, times):
    return max([max(0.0, 1 - abs(t - b) / 0.08) for b in times] + [0.0])


def talk(t):
    return max(0.0, 0.55 * math.sin(2 * math.pi * t * 3.1) * (0.6 + 0.4 * math.sin(2 * math.pi * t * 0.7)))


def env(t, d, a=0.3, r=0.4):
    k = min(1.0, t / a if a else 1.0, (d - t) / r if r else 1.0)
    k = max(0.0, k)
    return k * k * (3 - 2 * k)


def idle_pose(t, amt=1.0):
    s = math.sin(2 * math.pi * t / 4.0)
    return {
        "root_loc": (0, 0, 0.03 * s * amt),
        "body": [("Y", 2.5 * math.sin(2 * math.pi * t / 8.0)), ("X", 1.5 * s)],
        "head": [("Z", 6 * math.sin(2 * math.pi * t / 8.0 + 1)), ("X", -2 * s)],
        "arm_L": [("Y", 4 * s)], "arm_R": [("Y", -4 * s)],
        "forearm_L": [("X", -10)], "forearm_R": [("X", -10)],
        "ring": [("Z", 360 * t / 4.0)],
    }


def clips(rig, key_db):
    out = {}
    out["Idle_Float"] = write(rig, key_db, "Idle_Float", 4.0, idle_pose,
                              lambda t: {"Blink": blink_at(t, [1.2, 3.4]), "Smile": 0.3})

    def greet(t):
        p = idle_pose(t)
        k = env(t, 2.4, 0.35, 0.5)
        p["arm_R"] = [("Y", 115 * k), ("X", -15 * k)]
        p["forearm_R"] = [("Y", 25 * k + 22 * k * math.sin(2 * math.pi * t / 0.45))]
        p["hand_R"] = [("Y", 15 * k * math.sin(2 * math.pi * t / 0.45 + 0.5))]
        p["head"] = [("Y", -8 * k), ("X", -4 * k)]
        return p
    out["Greet"] = write(rig, key_db, "Greet", 2.4, greet,
                         lambda t: {"Happy": env(t, 2.4, 0.2, 0.4), "Smile": 0.9 * env(t, 2.4, 0.2, 0.4)}, loop=False)

    def point(t):
        p = idle_pose(t, 0.5)
        k = env(t, 2.0, 0.3, 0.5)
        p["arm_R"] = [("Y", 40 * k), ("X", -70 * k)]
        p["forearm_R"] = [("X", -5 * k)]
        p["head"] = [("Z", -18 * k), ("X", 4 * k)]
        p["body"] = [("Z", -10 * k)]
        return p
    out["Point"] = write(rig, key_db, "Point", 2.0, point, lambda t: {"Smile": 0.4}, loop=False)

    def explain(t):
        p = idle_pose(t)
        a = 0.5 + 0.5 * math.sin(2 * math.pi * t / 2.0)
        b = 0.5 + 0.5 * math.sin(2 * math.pi * t / 2.0 + math.pi)
        p["arm_L"] = [("Y", -30 * a), ("X", -45 * a)]
        p["forearm_L"] = [("X", -40 * a), ("Z", 20 * a)]
        p["arm_R"] = [("Y", 30 * b), ("X", -45 * b)]
        p["forearm_R"] = [("X", -40 * b), ("Z", -20 * b)]
        p["head"] = [("Y", 6 * (a - b)), ("X", -3)]
        return p
    out["Explain"] = write(rig, key_db, "Explain", 4.0, explain,
                           lambda t: {"Mouth_Open": talk(t), "Blink": blink_at(t, [2.6]), "Smile": 0.3})

    def positive(t):
        p = idle_pose(t, 0.3)
        k = env(t, 2.0, 0.25, 0.5)
        hop = max(0.0, math.sin(math.pi * min(1.0, t / 0.7)))
        p["root_loc"] = (0, 0, 0.12 * hop)
        p["body"] = [("Z", 360 * min(1.0, t / 1.2) * (1 - min(1.0, t / 1.2)) * 0)]
        p["arm_L"] = [("Y", -130 * k)]
        p["arm_R"] = [("Y", 130 * k)]
        p["forearm_L"] = [("Y", -20 * k)]
        p["forearm_R"] = [("Y", 20 * k)]
        p["head"] = [("X", -10 * k)]
        p["ring"] = [("Z", 720 * t / 2.0)]
        return p
    out["Positive"] = write(rig, key_db, "Positive", 2.0, positive,
                            lambda t: {"Happy": env(t, 2.0, 0.15, 0.4), "Smile": env(t, 2.0, 0.15, 0.4)}, loop=False)

    def concerned(t):
        p = idle_pose(t, 0.4)
        k = env(t, 3.0, 0.5, 0.6) if t < 3.0 else 1.0
        p["head"] = [("Y", 12 * k), ("X", 8 * k)]
        p["arm_L"] = [("Y", -25 * k), ("X", -30 * k)]
        p["arm_R"] = [("Y", 25 * k), ("X", -30 * k)]
        p["forearm_L"] = [("Z", 50 * k), ("X", -30 * k)]
        p["forearm_R"] = [("Z", -50 * k), ("X", -30 * k)]
        p["root_loc"] = (0, 0, -0.03 * k + 0.01 * math.sin(2 * math.pi * t / 3))
        return p
    out["Concerned"] = write(rig, key_db, "Concerned", 3.0, concerned,
                             lambda t: {"Concerned": env(t, 3.0, 0.3, 0.6), "Blink": blink_at(t, [1.8])}, loop=False)
    out["Speak"] = write(rig, key_db, "Speak", 3.0, lambda t: idle_pose(t, 0.6),
                         lambda t: {"Mouth_Open": talk(t), "Blink": blink_at(t, [1.5]), "Smile": 0.25})

    def appear(t):
        p = idle_pose(t, 0)
        k = min(1.0, t / 0.8)
        s = 1 + 0.15 * math.sin(math.pi * k) if k > 0.5 else 2 * k * k * 1.0
        s = max(0.001, s if k < 1 else 1.0)
        p["root_scale"] = (s, s, s)
        p["ring"] = [("Z", 540 * k)]
        return p
    out["Appear"] = write(rig, key_db, "Appear", 1.0, appear, lambda t: {"Happy": 0.5 * min(1, t)}, loop=False)

    def disappear(t):
        p = idle_pose(t, 0)
        k = min(1.0, t / 0.8)
        s = max(0.001, 1 - k * k)
        p["root_scale"] = (s, s, s)
        p["ring"] = [("Z", -540 * k)]
        return p
    out["Disappear"] = write(rig, key_db, "Disappear", 0.8, disappear, lambda t: {"Blink": min(1, t * 2)},
                             loop=False)
    return out


def build(render=False):
    C.reset_scene()
    col = C.collection("QonunAI")
    M = mats()
    body = build_mesh(col, M)
    rig = build_rig(col)
    body.parent = rig
    body.modifiers.new("Armature", "ARMATURE").object = rig
    for g in list(body.vertex_groups):
        if g.name not in BONES:
            body.vertex_groups.remove(g)
    info = clips(rig, body.data.shape_keys)
    rig.animation_data.action = None
    rig["qv_character"] = "qonunai"
    rig["qv_role"] = "guide"
    bpy.ops.wm.save_as_mainfile(filepath=str(C.BLENDER_DIR / "qonunai.blend"), compress=True)
    from build_characters import export_glb, duplicate_hierarchy
    export_glb(rig, C.PUBLIC / "characters" / "qonunai.glb", animations=True)
    lod_root, meshes = duplicate_hierarchy(rig, "_lod1")
    for m in meshes:
        m.shape_key_clear()
        d = m.modifiers.new("Decimate", "DECIMATE")
        d.ratio = 0.4
        with bpy.context.temp_override(object=m, active_object=m):
            bpy.ops.object.modifier_move_to_index(modifier="Decimate", index=0)
            bpy.ops.object.modifier_apply(modifier="Decimate")
    export_glb(lod_root, C.PUBLIC / "characters" / "qonunai_lod1.glb", animations=False)
    for o in [lod_root] + meshes:
        bpy.data.objects.remove(o)
    portrait()
    C.save_json(C.BLENDER_DIR / "characters" / "qonunai.report.json",
                {"id": "qonunai", "status": "built", "clips": info,
                 "morphs": ["Blink", "Happy", "Concerned", "Mouth_Open", "Smile"],
                 "dims": {"height_m": 1.0},
                 "exports": {"lod0": "public/assets/characters/qonunai.glb",
                             "lod1": "public/assets/characters/qonunai_lod1.glb",
                             "portrait": "public/assets/characters/qonunai_portrait.png"},
                 "blend": "blender/qonunai.blend"})


def portrait():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.view_settings.view_transform = "AgX"
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    scene.world = w
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 75
    scene.collection.objects.link(cam)
    cam.location = (0.35, -2.3, 0.8)
    cam.rotation_euler = (Vector((0, 0, 0.6)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    for i, (loc, e) in enumerate([((1.5, -2, 2), 300), ((-2, -1, 1), 120), ((0, 2, 2), 200)]):
        L = bpy.data.objects.new(f"L{i}", bpy.data.lights.new(f"L{i}", "AREA"))
        L.data.energy, L.data.size = e, 1.5
        L.location = loc
        L.rotation_euler = (Vector((0, 0, 0.6)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(L)
    rig = bpy.data.objects["qonunai"]
    for tr in rig.animation_data.nla_tracks:
        tr.mute = tr.name != "Greet"
    key = bpy.data.objects["qonunai_body"].data.shape_keys
    for tr in key.animation_data.nla_tracks:
        tr.mute = tr.name != "Greet"
    scene.frame_set(30)
    scene.render.filepath = str(C.PUBLIC / "characters" / "qonunai_portrait.png")
    bpy.ops.render.render(write_still=True)
    for tr in list(rig.animation_data.nla_tracks) + list(key.animation_data.nla_tracks):
        tr.mute = False


if __name__ == "__main__":
    build(render="--render" in C.cli_args())
