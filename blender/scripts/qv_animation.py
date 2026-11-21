"""Procedural animation library for Mixamo-named MPFB skeletons.

Poses are authored by AIMING limbs at directions in character space
(character faces -Y, left = +X, up = +Z) and by small rotations about
character axes, then solved with a forward-kinematics pass so every
character gets clips fitted to its own proportions (seat height, leg length).

Axis conventions for 'rot' (rotation about character axes, degrees):
  X+  : pitch forward (spine/head bend forward, nod down)
  Y+  : roll towards character's left side
  Z+  : yaw towards character's left
Right-side limbs are mirrored automatically with mirror().

The clips are ORIGINAL procedural motion (no Mixamo data). Because the skeleton uses
Mixamo bone names, licensed Mixamo FBX clips can later replace any clip 1:1
(see docs/CODEX_INTEGRATION.md).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import bpy
from mathutils import Matrix, Quaternion, Vector

FPS = 30
P = "mixamorig:"
FINGERS = ["Index", "Middle", "Ring", "Pinky"]
SPINE = [P + "Spine", P + "Spine1", P + "Spine2"]


def v(*a):
    return Vector(a).normalized()


def rot_m(axis, deg):
    return Matrix.Rotation(math.radians(deg), 3, axis)


def mirror_spec(spec):
    """Mirror a left-side spec to the right side."""
    out = {}
    for k, val in spec.items():
        nk = k.replace("Left", "Right")
        if isinstance(val, tuple) and isinstance(val[0], Vector):
            d, tw, fr = val
            out[nk] = (Vector((-d.x, d.y, d.z)), -tw, fr)
        else:
            out[nk] = [(ax, -deg if ax in "YZ" else deg) for ax, deg in val]
    return out


# ============================================================ pose model
@dataclass
class Pose:
    hips_loc: Vector = field(default_factory=lambda: Vector((0, 0, 0)))
    rot: dict = field(default_factory=dict)       # bone -> [(axis, deg)]   (additive)
    aim: dict = field(default_factory=dict)       # bone -> (dir, twist_deg, frame)
    curl: dict = field(default_factory=lambda: {"L": 0.35, "R": 0.35})
    point: dict = field(default_factory=dict)     # side -> True: index finger extended

    def copy(self):
        return Pose(self.hips_loc.copy(), {k: list(v_) for k, v_ in self.rot.items()}, dict(self.aim),
                    dict(self.curl), dict(self.point))

    def add_rot(self, bone, *rots):
        self.rot.setdefault(P + bone if not bone.startswith(P) else bone, []).extend(rots)
        return self

    def set_aim(self, bone, d, twist=0.0, frame="chest", mirror=False):
        name = P + bone
        self.aim[name] = (Vector(d).normalized(), twist, frame)
        if mirror:
            self.aim[name.replace("Left", "Right")] = (Vector((-d[0], d[1], d[2])).normalized(), -twist, frame)
        return self


def blend(a: Pose, b: Pose, t: float) -> Pose:
    """Linear blend of two poses' parameters (aims slerped as directions)."""
    t = max(0.0, min(1.0, t))
    out = Pose()
    out.hips_loc = a.hips_loc.lerp(b.hips_loc, t)
    for bone in set(a.rot) | set(b.rot):
        ra = dict()
        for ax, d in a.rot.get(bone, []):
            ra[ax] = ra.get(ax, 0) + d
        rb = dict()
        for ax, d in b.rot.get(bone, []):
            rb[ax] = rb.get(ax, 0) + d
        out.rot[bone] = [(ax, ra.get(ax, 0) * (1 - t) + rb.get(ax, 0) * t) for ax in "XYZ"
                         if ra.get(ax, 0) or rb.get(ax, 0)]
    for bone in set(a.aim) | set(b.aim):
        if bone in a.aim and bone in b.aim:
            da, ta, fa = a.aim[bone]
            db, tb, fb = b.aim[bone]
            out.aim[bone] = (da.slerp(db, t) if da.angle(db, 0) > 1e-4 else da.copy(), ta * (1 - t) + tb * t, fb)
        else:
            out.aim[bone] = (a.aim.get(bone) or b.aim.get(bone))
    for s in "LR":
        out.curl[s] = a.curl.get(s, 0.35) * (1 - t) + b.curl.get(s, 0.35) * t
        out.point[s] = (a.point if t < 0.5 else b.point).get(s, False)
    return out


# ============================================================ solver
class RigSolver:
    def __init__(self, arm_obj):
        self.obj = arm_obj
        bones = arm_obj.data.bones
        self.rest = {b.name: b.matrix_local.copy() for b in bones}
        self.rest3 = {k: m.to_3x3() for k, m in self.rest.items()}
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in bones}
        depth = {}

        def d(n):
            if n not in depth:
                depth[n] = 0 if self.parent[n] is None else d(self.parent[n]) + 1
            return depth[n]
        self.order = sorted(self.rest, key=d)
        head = lambda n: Vector(bones[P + n].head_local)  # noqa: E731
        tail = lambda n: Vector(bones[P + n].tail_local)  # noqa: E731
        self.hips_z = head("Hips").z
        self.hip_joint = {"L": head("LeftUpLeg"), "R": head("RightUpLeg")}
        self.thigh = (head("LeftLeg") - head("LeftUpLeg")).length
        self.shin = (head("LeftFoot") - head("LeftLeg")).length
        self.ankle_z = head("LeftFoot").z
        self.shoulder_z = head("LeftArm").z
        self.upper_arm = (head("LeftForeArm") - head("LeftArm")).length
        self.forearm = (head("LeftHand") - head("LeftForeArm")).length
        self.height = max(tail("Head").z, 1.0) + 0.06
        for pb in arm_obj.pose.bones:
            pb.rotation_mode = "QUATERNION"

    # --- seated leg directions so the feet reach the floor
    def seated_legs(self, pose: Pose, seat_h, spread=0.1, foot_forward=0.0):
        hips_dz = pose.hips_loc.z
        for s, sign in (("L", 1), ("R", -1)):
            hip = self.hip_joint[s] + pose.hips_loc
            thigh_dir = v(sign * spread, -1.0, 0.03)
            knee = hip + thigh_dir * self.thigh
            dz = (self.ankle_z + 0.005) - knee.z
            dz = max(-0.999, min(0.0, dz / self.shin))
            fwd = math.sqrt(max(0.0, 1 - dz * dz))
            shin_dir = v(sign * 0.03, -fwd * (0.55 + foot_forward), dz)
            side = "Left" if s == "L" else "Right"
            pose.aim[P + f"{side}UpLeg"] = (thigh_dir, 0.0, "yaw")
            pose.aim[P + f"{side}Leg"] = (shin_dir, 0.0, "yaw")
            pose.aim[P + f"{side}Foot"] = (v(sign * 0.08, -0.94, -0.3), 0.0, "yaw")
        return pose

    def solve(self, pose: Pose):
        """Returns {bone: (Quaternion basis, Vector loc_or_None)}."""
        out = {}
        posed = {}
        yaw = 0.0
        for ax, deg in pose.rot.get(P + "Hips", []):
            if ax == "Z":
                yaw += deg
        frames = {"world": Matrix.Identity(3), "yaw": rot_m("Z", yaw)}
        for name in self.order:
            Rb = self.rest3[name]
            par = self.parent[name]
            if par:
                O0 = posed[par] @ (self.rest3[par].inverted() @ Rb)
            else:
                O0 = Rb.copy()
            basis = Matrix.Identity(3)
            if name in pose.aim and pose.aim[name] is not None:
                d, twist, frame = pose.aim[name]
                F = frames.get(frame)
                if F is None:
                    F = frames.get("chest", Matrix.Identity(3))
                d = (F @ d).normalized()
                y0 = O0.col[1].normalized()
                q = y0.rotation_difference(d)
                D = q.to_matrix() @ O0
                basis = O0.inverted() @ D
                if twist:
                    basis = basis @ rot_m("Y", twist)
            if name in pose.rot:
                R = Matrix.Identity(3)
                for ax, deg in pose.rot[name]:
                    R = rot_m(ax, deg) @ R
                basis = basis @ (Rb.inverted() @ R @ Rb)
            # fingers: curl about the bone's own X axis
            fing = self._finger_curl(name, pose)
            if fing:
                basis = basis @ rot_m("X", fing)
            P_b = O0 @ basis
            posed[name] = P_b
            if name == P + "Spine2":
                frames["chest"] = P_b @ Rb.inverted()
            loc = None
            if par is None:
                loc = Rb.inverted() @ pose.hips_loc
            out[name] = (basis.to_quaternion(), loc)
        return out

    def _finger_curl(self, name, pose):
        if "Hand" not in name or name.endswith("Hand"):
            return 0.0
        side = "L" if "Left" in name else "R"
        amt = pose.curl.get(side, 0.35)
        seg = int(name[-1]) if name[-1].isdigit() else 1
        if "Thumb" in name:
            return amt * [10, 18, 14][seg - 1] * CURL_SIGN
        if "Index" in name and pose.point.get(side):
            return 3.0 * CURL_SIGN
        base = [38, 48, 30][seg - 1]
        spread = {"Index": 0.85, "Middle": 1.0, "Ring": 1.08, "Pinky": 1.15}
        f = next((s for k, s in spread.items() if k in name), 1.0)
        return amt * base * f * CURL_SIGN


CURL_SIGN = 1.0  # verified by the pose-sheet render (see validate step)


# ============================================================ action writing
def write_action(solver: RigSolver, name, keys, loop=False):
    """keys: list of (time_s, Pose). Writes a Blender action with Bezier keys."""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    solved = [(t, solver.solve(p)) for t, p in keys]
    for bone in solver.order:
        path = f'pose.bones["{bone}"].rotation_quaternion'
        fcs = [act.fcurves.new(path, index=i, action_group=bone) for i in range(4)]
        prev = None
        qs = []
        for t, s in solved:
            q = s[bone][0].copy()
            if prev is not None:
                q.make_compatible(prev)
            prev = q
            qs.append((t, q))
        for i, fc in enumerate(fcs):
            fc.keyframe_points.add(len(qs))
            for kp, (t, q) in zip(fc.keyframe_points, qs):
                kp.co = (1 + t * FPS, q[i])
                kp.interpolation = "BEZIER"
                kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
            fc.update()
        if solver.parent[bone] is None:
            path = f'pose.bones["{bone}"].location'
            for i in range(3):
                fc = act.fcurves.new(path, index=i, action_group=bone)
                fc.keyframe_points.add(len(solved))
                for kp, (t, s) in zip(fc.keyframe_points, solved):
                    kp.co = (1 + t * FPS, s[bone][1][i])
                    kp.interpolation = "BEZIER"
                    kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
                fc.update()
    if loop:
        for fc in act.fcurves:
            m = fc.modifiers.new("CYCLES")
    act["qv_loop"] = bool(loop)
    act["qv_duration_s"] = keys[-1][0]
    return act


def write_shape_action(key_datablock, name, tracks, duration, all_names):
    """tracks: {shape_key_name: [(t, value), ...]}; all_names: every morph to define (others -> 0)"""
    act = bpy.data.actions.new(name + "__face")
    act.use_fake_user = True
    kbs = key_datablock.key_blocks
    for kname, pts in tracks.items():
        if kname not in kbs:
            continue
        fc = act.fcurves.new(f'key_blocks["{kname}"].value')
        fc.keyframe_points.add(len(pts))
        for kp, (t, val) in zip(fc.keyframe_points, pts):
            kp.co = (1 + t * FPS, val)
            kp.interpolation = "BEZIER"
        fc.update()
    # make sure every key has a channel so a face clip fully defines the face state
    for kname in all_names:
        if kname in tracks or kname not in kbs:
            continue
        fc = act.fcurves.new(f'key_blocks["{kname}"].value')
        fc.keyframe_points.add(2)
        fc.keyframe_points[0].co = (1, 0.0)
        fc.keyframe_points[1].co = (1 + duration * FPS, 0.0)
        fc.update()
    act["qv_duration_s"] = duration
    return act


def push_nla(idb, action, track_name):
    ad = idb.animation_data or idb.animation_data_create()
    tr = ad.nla_tracks.new()
    tr.name = track_name
    tr.mute = False
    st = tr.strips.new(track_name, int(action.frame_range[0]), action)
    st.extrapolation = "NOTHING"
    return tr


# ============================================================ base poses
def stand_base(s: RigSolver) -> Pose:
    p = Pose()
    p.set_aim("LeftArm", (0.2, 0.03, -1), twist=0, frame="chest", mirror=True)
    p.set_aim("LeftForeArm", (0.1, -0.22, -1), frame="chest", mirror=True)
    p.set_aim("LeftHand", (0.06, -0.12, -1), frame="chest", mirror=True)
    p.curl = {"L": 0.4, "R": 0.4}
    return p


def seated_base(s: RigSolver, seat_h=0.48, hands="desk") -> Pose:
    p = Pose()
    p.hips_loc = Vector((0, 0.05, (seat_h + 0.085) - s.hips_z))
    p.add_rot("Hips", ("X", -6))
    p.add_rot("Spine", ("X", 3))
    p.add_rot("Spine1", ("X", 3))
    s.seated_legs(p, seat_h)
    if hands == "desk":
        p.set_aim("LeftArm", (0.18, -0.5, -1), frame="chest", mirror=True)
        p.set_aim("LeftForeArm", (-0.3, -1, 0.06), frame="chest", mirror=True)
        p.set_aim("LeftHand", (-0.2, -1, -0.05), twist=0, frame="chest", mirror=True)
    else:  # lap
        p.set_aim("LeftArm", (0.15, -0.35, -1), frame="chest", mirror=True)
        p.set_aim("LeftForeArm", (-0.35, -1, -0.45), frame="chest", mirror=True)
        p.set_aim("LeftHand", (-0.2, -1, -0.5), frame="chest", mirror=True)
    p.curl = {"L": 0.45, "R": 0.45}
    return p


def breathe(p: Pose, t, period=4.0, amt=1.0):
    ph = math.sin(2 * math.pi * t / period)
    p.add_rot("Spine1", ("X", -0.8 * ph * amt))
    p.add_rot("Spine2", ("X", -1.2 * ph * amt))
    p.add_rot("LeftShoulder", ("Y", -0.8 * ph * amt))
    p.add_rot("RightShoulder", ("Y", 0.8 * ph * amt))
    p.add_rot("Neck", ("X", 0.9 * ph * amt))
    return p


def look(p: Pose, yaw=0.0, pitch=0.0, roll=0.0):
    p.add_rot("Neck", ("Z", yaw * 0.4), ("X", pitch * 0.4))
    p.add_rot("Head", ("Z", yaw * 0.6), ("X", pitch * 0.6), ("Y", roll))
    return p


def sampled(duration, step, fn):
    n = max(2, int(round(duration / step)))
    return [(i * duration / n, fn(i * duration / n)) for i in range(n + 1)]


# ============================================================ arm gestures
def open_hands(p: Pose, amt=1.0, side="both", height=0.0):
    sides = ["Left", "Right"] if side == "both" else [side]
    for sd in sides:
        sg = 1 if sd == "Left" else -1
        p.aim[P + f"{sd}Arm"] = (v(sg * 0.35, -0.35 * amt, -1 + 0.2 * amt + height), 0.0, "chest")
        p.aim[P + f"{sd}ForeArm"] = (v(sg * 0.25, -1.0, 0.25 + height), sg * -35 * amt, "chest")
        p.aim[P + f"{sd}Hand"] = (v(sg * 0.5, -1.0, 0.1 + height), 0.0, "chest")
        p.curl["L" if sd == "Left" else "R"] = 0.15
    return p


def point_forward(p: Pose, side="Right", up=0.0):
    sg = 1 if side == "Left" else -1
    p.aim[P + f"{side}Arm"] = (v(sg * 0.1, -1.0, -0.15 + up), 0.0, "chest")
    p.aim[P + f"{side}ForeArm"] = (v(sg * 0.05, -1.0, 0.0 + up), 0.0, "chest")
    p.aim[P + f"{side}Hand"] = (v(sg * 0.05, -1.0, 0.02 + up), 0.0, "chest")
    p.curl["L" if side == "Left" else "R"] = 0.9
    p.point["L" if side == "Left" else "R"] = True
    return p


def hold_document(p: Pose, extend=0.0, height=0.0):
    """Both hands holding a folder in front of the chest; extend 0..1 reaches forward."""
    for sd, sg in (("Left", 1), ("Right", -1)):
        p.aim[P + f"{sd}Arm"] = (v(sg * 0.12, -0.45 - 0.9 * extend, -1 + 0.6 * extend + height), 0.0, "chest")
        p.aim[P + f"{sd}ForeArm"] = (v(-sg * 0.45 * (1 - extend), -1.0, 0.25 + 0.1 * extend + height), sg * -60,
                                     "chest")
        p.aim[P + f"{sd}Hand"] = (v(-sg * 0.25, -1.0, 0.25), 0.0, "chest")
    p.curl = {"L": 0.55, "R": 0.55}
    return p


def hands_clasped(p: Pose):
    for sd, sg in (("Left", 1), ("Right", -1)):
        p.aim[P + f"{sd}Arm"] = (v(sg * 0.1, -0.3, -1), 0.0, "chest")
        p.aim[P + f"{sd}ForeArm"] = (v(-sg * 0.75, -0.55, -0.45), 0.0, "chest")
        p.aim[P + f"{sd}Hand"] = (v(-sg * 0.8, -0.3, -0.4), 0.0, "chest")
    p.curl = {"L": 0.6, "R": 0.6}
    return p


# ============================================================ clip library
def clip_library(s: RigSolver, seat_h=0.48):
    """Returns {name: dict(keys=[(t, Pose)], loop=bool, meta={})}"""
    C = {}
    ST = lambda: stand_base(s)  # noqa: E731
    SE = lambda hands="desk": seated_base(s, seat_h, hands)  # noqa: E731

    def idle_stand(t):
        p = ST()
        breathe(p, t)
        sway = math.sin(2 * math.pi * t / 8.0)
        p.hips_loc.x += 0.008 * sway
        p.add_rot("Hips", ("Y", -0.8 * sway))
        look(p, yaw=4 * math.sin(2 * math.pi * t / 8.0 + 1.0), pitch=1.5 * math.sin(2 * math.pi * t / 4.0))
        return p
    C["Idle_Stand"] = dict(keys=sampled(8.0, 0.5, idle_stand), loop=True)

    def idle_seated(t, hands="desk"):
        p = SE(hands)
        breathe(p, t)
        look(p, yaw=5 * math.sin(2 * math.pi * t / 8.0), pitch=2 * math.sin(2 * math.pi * t / 4.0 + 0.5))
        return p
    C["Idle_Seated"] = dict(keys=sampled(8.0, 0.5, idle_seated), loop=True)
    C["Idle_Seated_Lap"] = dict(keys=sampled(8.0, 0.5, lambda t: idle_seated(t, "lap")), loop=True)

    # ---- walk (in place). Root motion speed reported in meta.
    cycle = 32 / FPS  # even frame count: exporter samples every 2nd frame, loop end must be sampled
    amp = 22.0

    def walk(t):
        ph = 2 * math.pi * t / cycle
        p = Pose()
        p.hips_loc = Vector((0.012 * math.sin(ph), 0, -0.02 + 0.018 * math.cos(2 * ph)))
        p.add_rot("Hips", ("Z", 5 * math.sin(ph)), ("Y", 2.5 * math.sin(ph)))
        p.add_rot("Spine2", ("Z", -7 * math.sin(ph)), ("X", 3))
        p.add_rot("Spine", ("X", 2))
        for sd, sg, off in (("Left", 1, 0.0), ("Right", -1, math.pi)):
            q = ph + off
            th = amp * math.sin(q)
            knee = 6 + 52 * max(0.0, math.cos(q + math.pi / 4)) ** 1.6
            th_r, kn = math.radians(th), math.radians(th - knee)
            p.aim[P + f"{sd}UpLeg"] = (v(sg * 0.04, -math.sin(th_r), -math.cos(th_r)), 0.0, "yaw")
            p.aim[P + f"{sd}Leg"] = (v(sg * 0.02, -math.sin(kn), -math.cos(kn)), 0.0, "yaw")
            toe = 20 + 22 * max(0.0, -math.sin(q)) * max(0.0, math.cos(q))
            p.aim[P + f"{sd}Foot"] = (v(sg * 0.06, -math.cos(math.radians(toe)), -math.sin(math.radians(toe))), 0.0,
                                      "yaw")
            arm = -18 * math.sin(q)
            a = math.radians(arm)
            p.aim[P + f"{sd}Arm"] = (v(sg * 0.17, -math.sin(a), -math.cos(a)), 0.0, "chest")
            fa = math.radians(arm + 18)
            p.aim[P + f"{sd}ForeArm"] = (v(sg * 0.08, -math.sin(fa), -math.cos(fa)), 0.0, "chest")
            p.aim[P + f"{sd}Hand"] = (v(sg * 0.06, -math.sin(fa) - 0.1, -math.cos(fa)), 0.0, "chest")
        p.curl = {"L": 0.45, "R": 0.45}
        look(p, pitch=2)
        return p
    leg = s.thigh + s.shin
    speed = 2 * 2 * leg * math.sin(math.radians(amp)) / cycle * 0.92
    C["Walk"] = dict(keys=sampled(cycle, cycle / 16, walk), loop=True,
                     meta={"root_motion": "in_place", "speed_mps": round(speed, 3)})

    # ---- turns (in place, hips yaw +-90 baked; app adds yaw to the root at the end)
    for name, sgn in (("Turn_Left_90", 1), ("Turn_Right_90", -1)):
        def turn(t, sgn=sgn):
            k = t / 1.0
            e = k * k * (3 - 2 * k)
            p = ST()
            p.add_rot("Hips", ("Z", 90 * sgn * e))
            look(p, yaw=12 * sgn * math.sin(math.pi * k))
            for sd, sg, off in (("Left", 1, 0.0), ("Right", -1, 0.5)):
                lift = max(0.0, math.sin(math.pi * min(1, max(0, (k - off * 0.5) * 2))))
                th = math.radians(14 * lift)
                kn = math.radians(14 * lift - 30 * lift)
                p.aim[P + f"{sd}UpLeg"] = (v(sg * 0.04, -math.sin(th), -math.cos(th)), 0.0, "yaw")
                p.aim[P + f"{sd}Leg"] = (v(sg * 0.02, -math.sin(kn), -math.cos(kn)), 0.0, "yaw")
            return p
        C[name] = dict(keys=sampled(1.0, 1 / 12, turn), loop=False,
                       meta={"root_yaw_delta_deg": 90 * sgn,
                             "note": "Hips rotate 90 deg in-clip; on finish add the yaw to the root and play an idle"})

    # ---- sit down / stand up (station origin = seat centre; standing start 0.32 m in front)
    stand_front = ST()
    stand_front.hips_loc = Vector((0, -0.32, 0))
    stand_front.aim.update({P + f"{sd}UpLeg": (v(sg * 0.03, 0, -1), 0.0, "yaw") for sd, sg in (("Left", 1), ("Right", -1))})
    stand_front.aim.update({P + f"{sd}Leg": (v(sg * 0.02, 0.02, -1), 0.0, "yaw") for sd, sg in (("Left", 1), ("Right", -1))})
    mid = SE("lap")
    mid.hips_loc = Vector((0, -0.12, (seat_h + 0.2) - s.hips_z))
    mid.add_rot("Spine", ("X", 14))
    mid.add_rot("Spine1", ("X", 12))
    mid.add_rot("Hips", ("X", 14))
    s.seated_legs(mid, seat_h + 0.1, foot_forward=-0.1)
    open_hands(mid, 0.3)
    seated = SE("lap")
    C["Sit_Down"] = dict(keys=[(0.0, stand_front), (0.7, mid), (1.3, seated), (1.6, SE("desk"))], loop=False,
                         meta={"start_offset_m": [0, -0.32, 0],
                               "note": "Root sits at the seat origin; clip starts standing 0.32 m in front"})
    C["Stand_Up"] = dict(keys=[(0.0, SE("desk")), (0.3, seated), (0.9, mid), (1.6, stand_front)], loop=False,
                         meta={"end_offset_m": [0, -0.32, 0]})

    # ---- talking (gestures; mouth via face clip Face_Talk)
    def talk(t, seated_flag):
        p = SE() if seated_flag else ST()
        breathe(p, t, 3.0, 0.7)
        g = 0.5 + 0.5 * math.sin(2 * math.pi * t / 2.0)
        if seated_flag:
            gp = SE()
            open_hands(gp, 0.6, side="Right", height=0.05)
            p = blend(p, gp, g * 0.8)
        else:
            gp = ST()
            open_hands(gp, 0.8, side="both" if int(t / 2) % 2 == 0 else "Right")
            p = blend(p, gp, g)
            breathe(p, t, 3.0, 0.7)
        look(p, yaw=6 * math.sin(2 * math.pi * t / 4.0), pitch=-3 + 3 * math.sin(2 * math.pi * t / 1.3))
        return p
    C["Talk_Standing"] = dict(keys=sampled(4.0, 0.25, lambda t: talk(t, False)), loop=True,
                              meta={"face_clip": "Face_Talk"})
    C["Talk_Seated"] = dict(keys=sampled(4.0, 0.25, lambda t: talk(t, True)), loop=True,
                            meta={"face_clip": "Face_Talk"})

    def address_judge(t):
        p = ST()
        p.add_rot("Spine2", ("X", -2))
        g = 0.5 + 0.5 * math.sin(2 * math.pi * t / 2.6)
        a = ST()
        open_hands(a, 1.0, side="both", height=0.05)
        b = ST()
        open_hands(b, 0.5, side="Right", height=0.1)
        q = blend(p, blend(a, b, 0.5 + 0.5 * math.sin(2 * math.pi * t / 5.2)), g)
        breathe(q, t, 3.2, 0.8)
        look(q, yaw=4 * math.sin(2 * math.pi * t / 5.2), pitch=-4 + 3 * math.sin(2 * math.pi * t / 1.7))
        return q
    C["Address_Judge"] = dict(keys=sampled(5.2, 0.26, address_judge), loop=True, meta={"face_clip": "Face_Talk"})

    # ---- evidence & documents
    hold = ST()
    hold_document(hold, 0.0)
    look(hold, pitch=18)
    present = ST()
    hold_document(present, 1.0, height=0.1)
    present.add_rot("Spine1", ("X", 8))
    present.add_rot("Spine2", ("X", 6))
    look(present, pitch=-4)
    C["Present_Evidence"] = dict(keys=[(0.0, ST()), (0.6, hold), (1.2, hold), (2.0, present), (2.8, present),
                                       (3.6, ST())], loop=False,
                                 meta={"prop_socket": "mixamorig:RightHand", "prop": "evidence_folder",
                                       "events": {"grab": 0.5, "handover": 2.3}})

    def read_standing(t):
        p = ST()
        hold_document(p, 0.0, height=0.05)
        look(p, pitch=22 + 2 * math.sin(2 * math.pi * t / 2.0), yaw=6 * math.sin(2 * math.pi * t / 4.0))
        breathe(p, t)
        return p
    C["Read_Document_Standing"] = dict(keys=sampled(4.0, 0.5, read_standing), loop=True,
                                       meta={"prop_socket": "mixamorig:RightHand"})

    def read_seated(t):
        p = SE()
        for sd, sg in (("Left", 1), ("Right", -1)):
            p.aim[P + f"{sd}ForeArm"] = (v(-sg * 0.5, -1, 0.12), 0.0, "chest")
        p.add_rot("Spine2", ("X", 6))
        flip = max(0.0, math.sin(2 * math.pi * (t - 2.6) / 1.6)) if 2.6 < t < 3.4 else 0.0
        if flip:
            p.aim[P + "RightForeArm"] = (v(0.3 * flip + 0.5 * (1 - flip), -1, 0.12 + 0.2 * flip), 0.0, "chest")
        look(p, pitch=26, yaw=8 * math.sin(2 * math.pi * t / 4.0))
        breathe(p, t)
        return p
    C["Read_Document_Seated"] = dict(keys=sampled(4.0, 0.2, read_seated), loop=True)

    # ---- generic gestures, generated in standing and seated stances
    def make_variants(base_name, fn, duration, step=0.2, loop=False):
        C[base_name] = dict(keys=sampled(duration, step, lambda t: fn(t, False)), loop=loop)
        C[base_name + "_Seated"] = dict(keys=sampled(duration, step, lambda t: fn(t, True)), loop=loop)

    def env(t, d, a=0.25, r=0.3):
        if t < a:
            k = t / a
        elif t > d - r:
            k = (d - t) / r
        else:
            k = 1.0
        k = max(0.0, min(1.0, k))
        return k * k * (3 - 2 * k)

    def g_open(t, seated):
        b = SE() if seated else ST()
        g = (SE() if seated else ST())
        open_hands(g, 1.0, height=0.05)
        return breathe(blend(b, g, env(t, 2.0, 0.45, 0.6)), t)
    make_variants("Gesture_OpenHand", g_open, 2.0)

    def g_point(t, seated):
        b = SE() if seated else ST()
        g = SE() if seated else ST()
        point_forward(g, "Right", up=0.05)
        g.add_rot("Spine2", ("Z", -8))
        return breathe(blend(b, g, env(t, 2.2, 0.4, 0.6)), t)
    make_variants("Gesture_Point", g_point, 2.2)

    def g_objection(t, seated):
        b = SE() if seated else ST()
        g = SE() if seated else ST()
        point_forward(g, "Right", up=0.9)
        look(g, pitch=-6)
        return blend(b, g, env(t, 2.0, 0.3, 0.6))
    make_variants("Objection", g_objection, 2.0)

    def g_nod(t, seated):
        p = SE() if seated else ST()
        look(p, pitch=12 * math.sin(2 * math.pi * t / 0.6) * env(t, 1.2, 0.1, 0.3))
        return breathe(p, t)
    make_variants("Head_Nod", g_nod, 1.2, step=0.1)

    def g_shake(t, seated):
        p = SE() if seated else ST()
        look(p, yaw=16 * math.sin(2 * math.pi * t / 0.7) * env(t, 1.4, 0.1, 0.3))
        return breathe(p, t)
    make_variants("Head_Shake", g_shake, 1.4, step=0.1)

    for nm, sgn in (("Look_Left", 1), ("Look_Right", -1)):
        def g_look(t, seated, sgn=sgn):
            p = SE() if seated else ST()
            k = env(t, 2.5, 0.5, 0.6)
            look(p, yaw=45 * sgn * k, pitch=-2 * k)
            p.add_rot("Spine2", ("Z", 10 * sgn * k))
            return breathe(p, t)
        make_variants(nm, g_look, 2.4)

    def g_surprised(t, seated):
        b = SE() if seated else ST()
        g = SE() if seated else ST()
        g.add_rot("Spine2", ("X", -8))
        look(g, pitch=-10)
        open_hands(g, 0.5, height=0.25)
        return blend(b, g, env(t, 1.6, 0.15, 0.8))
    make_variants("React_Surprised", g_surprised, 1.6, step=0.1)

    def g_concerned(t, seated):
        b = SE() if seated else ST()
        g = SE() if seated else ST()
        g.aim[P + "RightArm"] = (v(-0.05, -0.6, -1), 0.0, "chest")
        g.aim[P + "RightForeArm"] = (v(0.35, -0.5, 1), 40, "chest")
        g.aim[P + "RightHand"] = (v(0.4, -0.3, 1), 0.0, "chest")
        g.curl["R"] = 0.7
        look(g, pitch=10, roll=8)
        return breathe(blend(b, g, env(t, 3.0, 0.5, 0.7)), t)
    make_variants("React_Concerned", g_concerned, 3.0)

    # ---- role specific
    def verdict(t):
        p = SE()
        p.add_rot("Spine2", ("X", -4))
        g = SE()
        open_hands(g, 0.6, side="Right", height=0.2)
        k = env(t, 4.0, 0.6, 0.8)
        q = blend(p, g, k * (0.6 + 0.4 * math.sin(2 * math.pi * t / 2.0)))
        look(q, pitch=-3 + 3 * math.sin(2 * math.pi * t / 1.5))
        return breathe(q, t)
    C["Deliver_Verdict"] = dict(keys=sampled(4.0, 0.25, verdict), loop=False, meta={"face_clip": "Face_Talk"})

    def typing(t):
        p = SE()
        for sd, sg, off in (("Left", 1, 0.0), ("Right", -1, 0.37)):
            w = math.sin(2 * math.pi * (t + off) / 0.33)
            p.aim[P + f"{sd}ForeArm"] = (v(-sg * 0.35, -1, 0.05 + 0.02 * w), 0.0, "chest")
            p.aim[P + f"{sd}Hand"] = (v(-sg * 0.25, -1, -0.15 + 0.08 * w), 0.0, "chest")
        p.curl = {"L": 0.55, "R": 0.55}
        look(p, pitch=14, yaw=-10)
        return breathe(p, t)
    C["Typing"] = dict(keys=sampled(2.0, 1 / 15, typing), loop=True)

    def announce(t):
        p = SE()
        p.add_rot("Spine2", ("X", -3))
        g = SE()
        open_hands(g, 0.5, side="Left", height=0.1)
        q = blend(p, g, env(t, 3.0, 0.5, 0.7))
        look(q, pitch=-4)
        return breathe(q, t)
    C["Announce"] = dict(keys=sampled(3.0, 0.25, announce), loop=False, meta={"face_clip": "Face_Talk"})

    def testify(t):
        p = SE("lap")
        g = SE("lap")
        g.aim[P + "RightArm"] = (v(0.0, -0.35, -1), 0.0, "chest")
        g.aim[P + "RightForeArm"] = (v(0.9, -0.3, 0.45), 0.0, "chest")
        g.aim[P + "RightHand"] = (v(0.9, -0.2, 0.3), 0.0, "chest")
        g.curl["R"] = 0.2
        k = env(t, 1.8, 0.4, 0.4) if t < 1.8 else 0.0
        q = blend(p, g, k)
        if t >= 1.8:
            h = SE("lap")
            open_hands(h, 0.4, side="Right")
            q = blend(q, h, 0.5 + 0.5 * math.sin(2 * math.pi * (t - 1.8) / 1.6))
        look(q, pitch=-2 + 3 * math.sin(2 * math.pi * t / 1.4))
        return breathe(q, t)
    C["Testify"] = dict(keys=sampled(5.0, 0.2, testify), loop=False, meta={"face_clip": "Face_Talk"})

    def nervous(t):
        p = SE("lap")
        for sd, sg in (("Left", 1), ("Right", -1)):
            p.aim[P + f"{sd}ForeArm"] = (v(-sg * 0.7, -1, -0.2 + 0.05 * math.sin(2 * math.pi * t / 0.8)), 0.0, "chest")
        p.curl = {"L": 0.6 + 0.2 * math.sin(2 * math.pi * t / 0.7), "R": 0.6}
        look(p, yaw=20 * math.sin(2 * math.pi * t / 3.0), pitch=8)
        p.hips_loc.z += 0.0
        return breathe(p, t, 2.5, 1.4)
    C["Nervous_Idle"] = dict(keys=sampled(6.0, 0.2, nervous), loop=True)

    def guard(t):
        p = ST()
        hands_clasped(p)
        sway = math.sin(2 * math.pi * t / 6.0)
        p.hips_loc.x += 0.015 * sway
        p.add_rot("Hips", ("Y", -1.2 * sway))
        p.add_rot("Spine2", ("X", -2))
        look(p, yaw=25 * math.sin(2 * math.pi * t / 12.0))
        return breathe(p, t)
    C["Guard_Idle"] = dict(keys=sampled(12.0, 0.5, guard), loop=True)
    return C


# ============================================================ face clips
def face_clips(available):
    """Morph-only clips. Each is complete (drives every morph) and includes blinks."""
    def blinks(duration, times):
        tr = []
        for b in times:
            tr += [(max(0, b - 0.06), 0.0), (b, 1.0), (b + 0.1, 0.0)]
        tr = [(0.0, 0.0)] + tr + [(duration, 0.0)]
        return {"Blink_L": tr, "Blink_R": tr}

    def hold(val, d):
        return [(0.0, val), (d, val)]

    F = {}
    F["Face_Idle"] = (4.0, blinks(4.0, [0.8, 3.2]), True)
    talk = blinks(3.0, [1.4])
    mouth = [(0.0, 0.0)]
    pattern = [0.55, 0.15, 0.7, 0.3, 0.6, 0.1, 0.45, 0.65, 0.2, 0.5, 0.05, 0.6, 0.35, 0.0]
    for i, a in enumerate(pattern):
        mouth.append((0.2 + i * 0.2, a))
    mouth.append((3.0, 0.0))
    talk["Mouth_Open"] = mouth
    talk["Mouth_Pursing"] = [(0.0, 0), (0.6, 0.4), (0.8, 0), (1.8, 0.35), (2.0, 0), (3.0, 0)]
    talk["Mouth_Wide"] = [(0.0, 0), (1.0, 0.3), (1.2, 0), (2.4, 0.3), (2.6, 0), (3.0, 0)]
    talk["Brow_Up_L"] = talk["Brow_Up_R"] = [(0.0, 0), (0.9, 0.35), (1.6, 0), (3.0, 0)]
    F["Face_Talk"] = (3.0, talk, True)
    sm = blinks(4.0, [1.5])
    sm["Smile"] = hold(0.7, 4.0)
    sm["Eye_Squint_L"] = sm["Eye_Squint_R"] = hold(0.25, 4.0)
    F["Face_Smile"] = (4.0, sm, True)
    co = blinks(4.0, [1.1, 3.0])
    co["Brow_Inner_Up_L"] = co["Brow_Inner_Up_R"] = hold(0.8, 4.0)
    co["Frown"] = hold(0.45, 4.0)
    F["Face_Concerned"] = (4.0, co, True)
    su = blinks(3.0, [2.4])
    su["Brow_Up_L"] = su["Brow_Up_R"] = [(0, 0), (0.15, 1.0), (2.5, 0.6), (3.0, 0.6)]
    su["Eye_Wide_L"] = su["Eye_Wide_R"] = [(0, 0), (0.15, 0.8), (3.0, 0.4)]
    su["Mouth_Open"] = [(0, 0), (0.2, 0.35), (3.0, 0.15)]
    F["Face_Surprised"] = (3.0, su, False)
    stn = blinks(4.0, [2.0])
    stn["Brow_Down_L"] = stn["Brow_Down_R"] = hold(0.6, 4.0)
    stn["Mouth_Compress"] = hold(0.4, 4.0)
    F["Face_Stern"] = (4.0, stn, True)
    F["Face_Blink"] = (0.4, {"Blink_L": [(0, 0), (0.1, 1), (0.25, 0), (0.4, 0)],
                             "Blink_R": [(0, 0), (0.1, 1), (0.25, 0), (0.4, 0)]}, False)
    out = {}
    for k, (d, tr, loop) in F.items():
        out[k] = (d, {n: pts for n, pts in tr.items() if n in available}, loop)
    return out


EXPRESSION_UNITS = {
    # exported morph name : MakeHuman expression unit target
    "Blink_L": "eye-left-closure", "Blink_R": "eye-right-closure",
    "Eye_Wide_L": "eye-left-opened-up", "Eye_Wide_R": "eye-right-opened-up",
    "Eye_Squint_L": "eye-left-slit", "Eye_Squint_R": "eye-right-slit",
    "Brow_Up_L": "eyebrows-left-up", "Brow_Up_R": "eyebrows-right-up",
    "Brow_Down_L": "eyebrows-left-down", "Brow_Down_R": "eyebrows-right-down",
    "Brow_Inner_Up_L": "eyebrows-left-inner-up", "Brow_Inner_Up_R": "eyebrows-right-inner-up",
    "Mouth_Open": "mouth-open", "Smile": "mouth-corner-puller", "Frown": "mouth-depression",
    "Mouth_Pursing": "mouth-pursing", "Mouth_Wide": "mouth-retraction", "Mouth_Compress": "mouth-compression",
}
