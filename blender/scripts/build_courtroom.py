"""Procedural QonunVerse courtroom ("Adolat zali") reconstructed from
assets/references/courtroom.png.

Run:  blender -b --python blender/scripts/build_courtroom.py -- [--render]
Output: blender/courtroom.blend (editable source, collections per furniture group)
        blender/renders/courtroom_reference_cam.png (with --render)

Layout (Blender metres, X right as seen from the gallery, Y towards the bench):
  room X -7.5..7.5, Y -6..9, ceiling 5.6
  judge dais + bench centred at X 0 against the panelled back wall (Y 9)
  flag left of the bench, clerk station right, security door on the right wall
  advocate/plaintiff table front-left, prosecutor desk centre-right,
  defendant desk right, witness stand front-right, bar rail at Y -0.9,
  three rows of spectator benches behind it.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import qv_common as C  # noqa: E402
import qv_textures as T  # noqa: E402
import qv_materials as MAT  # noqa: E402

R = math.radians
ROOM = dict(x0=-7.5, x1=7.5, y0=-6.0, y1=9.0, h=5.6)
WALL_T = 0.25

M = {}
COL = {}


# ======================================================================= utils
def bx(name, mn, mx, mat, col, bevel=0.0, tile=1.2, grain_v=False):
    return C.box_minmax(name, mn, mx, M[mat] if isinstance(mat, str) else mat, COL[col],
                        bevel=bevel, uv_tile=tile, rotate_grain=grain_v)


def tag(obj, **props):
    for k, v in props.items():
        obj[k] = v
    return obj


class Frame:
    """Local frame (origin + yaw) so furniture can be authored facing -Y and rotated."""

    def __init__(self, origin, yaw_deg=0.0):
        self.o = Vector(origin)
        self.yaw = R(yaw_deg)

    def p(self, x, y, z):
        c, s = math.cos(self.yaw), math.sin(self.yaw)
        return Vector((self.o.x + x * c - y * s, self.o.y + x * s + y * c, self.o.z + z))

    def box(self, name, mn, mx, mat, col, bevel=0.0, tile=1.2, grain_v=False):
        size = [mx[i] - mn[i] for i in range(3)]
        ctr = self.p(*[(mx[i] + mn[i]) / 2 for i in range(3)])
        o = C.box(name, size, ctr, M[mat], COL[col], bevel=bevel, uv_tile=tile,
                  rotate_grain=grain_v, rot=(0, 0, self.yaw))
        bpy.context.view_layer.update()
        C.box_uv(o, tile, grain_v)
        return o


# ======================================================================= room
def build_shell():
    x0, x1, y0, y1, h = ROOM["x0"], ROOM["x1"], ROOM["y0"], ROOM["y1"], ROOM["h"]
    t = WALL_T
    f = bx("Floor", (x0, y0, -0.1), (x1, y1, 0.0), "floor", "shell", tile=1.2)
    tag(f, qv_collider="floor")
    bx("Ceiling", (x0, y0, h), (x1, y1, h + 0.15), "ceiling", "shell", tile=2)
    # ceiling coffers + light panels
    for ix in range(-2, 3):
        for iy in range(0, 4):
            cx, cy = ix * 2.8, -4.0 + iy * 3.6
            bx(f"CeilingBeam_{ix}_{iy}", (cx - 1.32, cy - 1.72, h - 0.12), (cx + 1.32, cy - 1.62, h),
               "wood", "shell")
            lp = bx(f"CeilingLight_{ix}_{iy}", (cx - 0.45, cy - 0.45, h - 0.02), (cx + 0.45, cy + 0.45, h),
                    "ceiling_light", "lights_geo")
    # crown moulding
    for name, mn, mx in [
        ("Crown_Left", (x0, y0, h - 0.25), (x0 + 0.12, y1, h)),
        ("Crown_Right", (x1 - 0.12, y0, h - 0.25), (x1, y1, h)),
        ("Crown_Back", (x0, y1 - 0.12, h - 0.25), (x1, y1, h)),
        ("Crown_Front", (x0, y0, h - 0.25), (x1, y0 + 0.12, h)),
    ]:
        bx(name, mn, mx, "wood", "shell")

    # ---- back wall (behind judge): full-height walnut paneling centre section
    bx("BackWall_Structure", (x0, y1, 0), (x1, y1 + t, h), "plaster", "shell", tile=2)
    paneling_back(-3.7, 3.7, 0.0, 4.95)
    # flanking back wall: wainscot + plaster pilasters
    for side, (a0, a1) in {"L": (x0, -3.7), "R": (3.7, x1)}.items():
        wainscot_y(f"BackWainscot_{side}", a0, a1, y1, -1)
        for i, px in enumerate([a0 + 0.15, a1 - 0.25]):
            bx(f"BackPilaster_{side}{i}", (px, y1 - 0.12, 0), (px + 0.3 if side == "L" else px + 0.25, y1, h - 0.25),
               "wood", "walls", bevel=0.01)
    # big wood frame around the flag niche (left) like the reference
    bx("FlagNiche_FrameTop", (-7.3, y1 - 0.08, 4.15), (-3.8, y1, 4.3), "wood", "walls")
    bx("FlagNiche_Panel", (-7.2, y1 - 0.03, 1.25), (-3.9, y1 - 0.01, 4.15), "plaster", "walls", tile=2)

    # ---- left wall: solid, wainscot + pilasters
    bx("LeftWall_Structure", (x0 - t, y0, 0), (x0, y1, h), "plaster", "shell", tile=2)
    wainscot_x("LeftWainscot", y0, y1, x0, +1)
    for i, py in enumerate(range(-5, 9, 3)):
        bx(f"LeftPilaster_{i}", (x0, py - 0.15, 0), (x0 + 0.12, py + 0.15, h - 0.25), "wood", "walls",
           bevel=0.01)

    # ---- right wall: tall windows + security door
    windows = [-3.6, -0.6, 2.4, 5.0]
    build_right_wall(windows, door_y=7.55)

    # ---- gallery wall with double entrance door
    bx("FrontWall_L", (x0, y0 - t, 0), (-0.9, y0, h), "plaster", "shell", tile=2)
    bx("FrontWall_R", (0.9, y0 - t, 0), (x1, y0, h), "plaster", "shell", tile=2)
    bx("FrontWall_Top", (-0.9, y0 - t, 2.6), (0.9, y0, h), "plaster", "shell", tile=2)
    wainscot_y("FrontWainscot_L", x0, -1.0, y0, +1)
    wainscot_y("FrontWainscot_R", 1.0, x1, y0, +1)
    door("MainDoor", Frame((0, y0, 0), 180), 1.8, 2.6, double=True)


def paneling_back(a0, a1, z0, z1):
    """Raised-panel walnut wall behind the bench (faces -Y)."""
    y = ROOM["y1"]
    bx("BackPanel_Slab", (a0, y - 0.04, z0), (a1, y, z1), "wood", "walls", tile=1.2, grain_v=True)
    n_cols = 6
    w = (a1 - a0) / n_cols
    for i in range(n_cols + 1):
        x = a0 + i * w
        bx(f"BackStile_{i}", (x - 0.06, y - 0.08, z0), (x + 0.06, y - 0.04, z1), "wood", "walls",
           bevel=0.008, grain_v=True)
    for j, z in enumerate([0.12, 1.2, 1.32, 4.75]):
        bx(f"BackRail_{j}", (a0, y - 0.08, z), (a1, y - 0.04, z + 0.12), "wood", "walls", bevel=0.008)
    for i in range(n_cols):
        xa, xb = a0 + i * w + 0.12, a0 + (i + 1) * w - 0.12
        bx(f"BackPanelRaised_{i}_lo", (xa, y - 0.065, 0.32), (xb, y - 0.04, 1.12), "wood", "walls",
           bevel=0.012, grain_v=True)
        bx(f"BackPanelRaised_{i}_hi", (xa, y - 0.065, 1.52), (xb, y - 0.04, 4.6), "wood", "walls",
           bevel=0.012, grain_v=True)
    bx("BackCornice", (a0 - 0.1, y - 0.18, z1), (a1 + 0.1, y, z1 + 0.18), "wood", "walls", bevel=0.02)


def wainscot_y(name, a0, a1, y, inward, h=1.3):
    """Dado paneling along a wall at fixed Y (inward = +1 or -1)."""
    d = lambda v: y + inward * v  # noqa: E731
    lo, hi = sorted([d(0.0), d(0.05)])
    bx(f"{name}_Slab", (a0, lo, 0), (a1, hi, h), "wood", "walls", grain_v=True)
    lo2, hi2 = sorted([d(0.0), d(0.09)])
    bx(f"{name}_Cap", (a0, lo2, h), (a1, hi2, h + 0.07), "wood", "walls", bevel=0.01)
    bx(f"{name}_Base", (a0, lo2, 0), (a1, hi2, 0.14), "wood", "walls", bevel=0.005)
    n = max(1, int((a1 - a0) / 1.1))
    w = (a1 - a0) / n
    lo3, hi3 = sorted([d(0.05), d(0.07)])
    for i in range(n):
        bx(f"{name}_Panel{i}", (a0 + i * w + 0.1, lo3, 0.26), (a0 + (i + 1) * w - 0.1, hi3, h - 0.12),
           "wood", "walls", bevel=0.01, grain_v=True)


def wainscot_x(name, a0, a1, x, inward, h=1.3, skip=()):
    d = lambda v: x + inward * v  # noqa: E731
    lo, hi = sorted([d(0.0), d(0.05)])
    bx(f"{name}_Slab", (lo, a0, 0), (hi, a1, h), "wood", "walls", grain_v=True)
    lo2, hi2 = sorted([d(0.0), d(0.09)])
    bx(f"{name}_Cap", (lo2, a0, h), (hi2, a1, h + 0.07), "wood", "walls", bevel=0.01)
    bx(f"{name}_Base", (lo2, a0, 0), (hi2, a1, 0.14), "wood", "walls", bevel=0.005)
    n = max(1, int((a1 - a0) / 1.1))
    w = (a1 - a0) / n
    lo3, hi3 = sorted([d(0.05), d(0.07)])
    for i in range(n):
        c0, c1 = a0 + i * w + 0.1, a0 + (i + 1) * w - 0.1
        if any(s0 < c1 and c0 < s1 for s0, s1 in skip):
            continue
        bx(f"{name}_Panel{i}", (lo3, c0, 0.26), (hi3, c1, h - 0.12), "wood", "walls", bevel=0.01,
           grain_v=True)


def build_right_wall(windows, door_y):
    x1, y0, y1, h, t = ROOM["x1"], ROOM["y0"], ROOM["y1"], ROOM["h"], WALL_T
    win_w, sill, head = 1.5, 1.35, 4.7
    openings = sorted([(wy - win_w / 2, wy + win_w / 2, sill, head) for wy in windows] +
                      [(door_y - 0.6, door_y + 0.6, 0.0, 2.45)])
    cursor = y0
    for i, (a, b, z0, z1) in enumerate(openings):
        bx(f"RightWall_Pier{i}", (x1, cursor, 0), (x1 + t, a, h), "plaster", "shell", tile=2)
        if z0 > 0:
            bx(f"RightWall_Below{i}", (x1, a, 0), (x1 + t, b, z0), "plaster", "shell", tile=2)
        bx(f"RightWall_Above{i}", (x1, a, z1), (x1 + t, b, h), "plaster", "shell", tile=2)
        cursor = b
    bx("RightWall_PierEnd", (x1, cursor, 0), (x1 + t, y1, h), "plaster", "shell", tile=2)
    wainscot_x("RightWainscot", y0, y1, x1, -1,
               skip=[(door_y - 0.65, door_y + 0.65)])
    for i, wy in enumerate(windows):
        window(f"Window{i}", wy, win_w, sill, head)
    # pilasters between windows
    for i, py in enumerate([-5.1, -2.1, 0.9, 3.7, 6.4, 8.6]):
        bx(f"RightPilaster_{i}", (x1 - 0.12, py - 0.15, 0), (x1, py + 0.15, h - 0.25), "wood", "walls",
           bevel=0.01)
    door("SecurityDoor", Frame((x1, door_y, 0), -90), 1.0, 2.4)
    # brass wall sconces (reference: lamp on the right pilaster)
    for i, py in enumerate([3.7, 6.4]):
        sconce(f"Sconce_R{i}", Vector((x1 - 0.14, py, 2.9)), facing=Vector((-1, 0, 0)))
    for i, px in enumerate([-3.95, 3.95]):
        sconce(f"Sconce_B{i}", Vector((px, ROOM["y1"] - 0.2, 3.1)), facing=Vector((0, -1, 0)))


def window(name, cy, w, z0, z1):
    x1 = ROOM["x1"]
    a, b = cy - w / 2, cy + w / 2
    fr = 0.07
    for part, mn, mx in [
        ("Sill", (x1 - 0.12, a - 0.05, z0 - 0.06), (x1 + 0.05, b + 0.05, z0)),
        ("Head", (x1 - 0.02, a, z1 - fr), (x1 + 0.08, b, z1)),
        ("JambL", (x1 - 0.02, a, z0), (x1 + 0.08, a + fr, z1)),
        ("JambR", (x1 - 0.02, b - fr, z0), (x1 + 0.08, b, z1)),
        ("Mullion", (x1 - 0.01, cy - 0.03, z0), (x1 + 0.07, cy + 0.03, z1)),
        ("Transom", (x1 - 0.01, a, z1 - 0.95), (x1 + 0.07, b, z1 - 0.89)),
    ]:
        bx(f"{name}_{part}", mn, mx, "window_frame", "windows", bevel=0.005)
    g = C.plane(f"{name}_Glass", w, z1 - z0, (x1 + 0.03, cy, (z0 + z1) / 2), M["glass"], COL["windows"],
                rot=(R(90), 0, R(90)))
    tag(g, qv_transparent=True)
    sky = C.plane(f"{name}_DaylightCard", w + 0.4, z1 - z0 + 0.4, (x1 + 0.6, cy, (z0 + z1) / 2), M["sky"],
                  COL["windows"], rot=(R(90), 0, R(-90)))
    tag(sky, qv_note="Emissive exterior card faking bright daylight; swap for an HDRI/backplate if desired")


def door(name, fr: Frame, w, h, double=False):
    t = 0.06
    fr.box(f"{name}_FrameL", (-w / 2 - 0.1, -0.06, 0), (-w / 2, 0.08, h + 0.1), "wood", "doors", bevel=0.01)
    fr.box(f"{name}_FrameR", (w / 2, -0.06, 0), (w / 2 + 0.1, 0.08, h + 0.1), "wood", "doors", bevel=0.01)
    fr.box(f"{name}_FrameTop", (-w / 2 - 0.1, -0.06, h), (w / 2 + 0.1, 0.08, h + 0.12), "wood", "doors", bevel=0.01)
    leaves = [(-w / 2, 0.0), (0.0, w / 2)] if double else [(-w / 2, w / 2)]
    for i, (a, b) in enumerate(leaves):
        leaf = fr.box(f"{name}_Leaf{i}", (a + 0.005, 0.0, 0.0), (b - 0.005, t, h), "wood", "doors", bevel=0.008,
                      grain_v=True)
        tag(leaf, qv_keep_separate=True, qv_interactive="door", qv_hinge="left" if i == 0 else "right")
        for j, (z0, z1) in enumerate([(0.2, 1.1), (1.3, h - 0.2)]):
            fr.box(f"{name}_Leaf{i}_Panel{j}", (a + 0.12, -0.012, z0), (b - 0.12, 0.0, z1), "wood", "doors",
                   bevel=0.006, grain_v=True)
        hx = b - 0.12 if i == 0 else a + 0.12
        if not double:
            hx = b - 0.12
        fr.box(f"{name}_Leaf{i}_Handle", (hx - 0.012, -0.07, 1.0), (hx + 0.012, -0.012, 1.2), "gold", "doors")


def sconce(name, p: Vector, facing: Vector):
    side = Vector((-facing.y, facing.x, 0))
    C.box(f"{name}_Plate", (0.12 if facing.y else 0.03, 0.03 if facing.y else 0.12, 0.22), p, M["gold"],
          COL["lights_geo"])
    arm = p + facing * 0.12
    C.cylinder(f"{name}_Arm", 0.012, 0.14, (p + facing * 0.06) + Vector((0, 0, 0.0)), M["gold"],
               COL["lights_geo"], verts=8,
               rot=(R(90), 0, 0) if facing.y else (0, R(90), 0))
    C.cylinder(f"{name}_Shade", 0.07, 0.24, arm + Vector((0, 0, 0.1)), M["lamp"], COL["lights_geo"],
               verts=12, radius2=0.08)
    C.cylinder(f"{name}_Cap", 0.075, 0.02, arm + Vector((0, 0, 0.23)), M["gold"], COL["lights_geo"], verts=12)
    lamp = bpy.data.lights.new(f"{name}_Light", "POINT")
    lamp.energy = 60
    lamp.color = (1.0, 0.82, 0.6)
    lamp.shadow_soft_size = 0.08
    o = bpy.data.objects.new(f"{name}_Light", lamp)
    o.location = arm + Vector((0, 0, 0.1)) + facing * 0.05
    COL["lights"].objects.link(o)


# ================================================================= furniture
def desk(name, fr: Frame, w, d, h, col, plaque=None, plaque_face=-1, modesty=True, top_overhang=0.04,
         plaque_on_top=False):
    """Panelled walnut desk authored facing -Y in its local frame."""
    ov = top_overhang
    fr.box(f"{name}_Top", (-w / 2 - ov, -d / 2 - ov, h - 0.045), (w / 2 + ov, d / 2 + ov, h), "wood", col,
           bevel=0.012)
    fr.box(f"{name}_SideL", (-w / 2, -d / 2, 0), (-w / 2 + 0.05, d / 2, h - 0.045), "wood", col, bevel=0.006,
           grain_v=True)
    fr.box(f"{name}_SideR", (w / 2 - 0.05, -d / 2, 0), (w / 2, d / 2, h - 0.045), "wood", col, bevel=0.006,
           grain_v=True)
    if modesty:
        fr.box(f"{name}_Front", (-w / 2, -d / 2, 0.06), (w / 2, -d / 2 + 0.035, h - 0.045), "wood", col,
               bevel=0.006)
        fr.box(f"{name}_Plinth", (-w / 2 - 0.01, -d / 2 - 0.01, 0), (w / 2 + 0.01, -d / 2 + 0.04, 0.08),
               "wood", col, bevel=0.004)
        n = max(1, round(w / 0.9))
        pw = (w - 0.1) / n
        for i in range(n):
            a = -w / 2 + 0.05 + i * pw
            fr.box(f"{name}_FrontPanel{i}", (a + 0.06, -d / 2 - 0.015, 0.18), (a + pw - 0.06, -d / 2, h - 0.16),
                   "wood", col, bevel=0.008, grain_v=True)
    if plaque:
        if plaque_on_top:
            nameplate(f"{name}_Plaque", fr, plaque, (0.0 if isinstance(plaque_on_top, bool) else plaque_on_top,
                                                     -d / 2 + 0.08, h), col, on_top=True)
        else:
            nameplate(f"{name}_Plaque", fr, plaque, (0.0, -d / 2 - 0.02, h - 0.2), col)
    tag(fr.box(f"{name}_Collider", (-w / 2, -d / 2, 0), (w / 2, d / 2, h), "wood", "colliders"),
        qv_collider="box")


def nameplate(name, fr: Frame, text, at, col, on_top=False):
    x, y, z = at
    tw = max(0.42, 0.075 * len(text) + 0.1)
    if on_top:
        # tent-style brass nameplate standing on the desktop
        o = fr.box(f"{name}_Body", (x - tw / 2, y - 0.012, z), (x + tw / 2, y + 0.012, z + 0.12), "plaque", col,
                   bevel=0.003)
        o.rotation_euler.x = R(-12)
        tz = z + 0.06
        ty = y - 0.03
    else:
        fr.box(f"{name}_Body", (x - tw / 2, y - 0.012, z - 0.07), (x + tw / 2, y + 0.008, z + 0.07), "plaque", col,
               bevel=0.004)
        tz, ty = z, y - 0.0125
    p = fr.p(x, ty, tz)
    txt = C.text_mesh(f"{name}_Text", text, 0.068, p, M["plaque_text"], COL[col],
                      rot=(R(90) + (R(-12) if on_top else 0), 0, fr.yaw), extrude=0.0015)
    tag(txt, qv_text=text)


def office_chair(name, fr: Frame, high_back=False, col="chairs"):
    seat_h = 0.48
    fr.box(f"{name}_Seat", (-0.25, -0.24, seat_h - 0.08), (0.25, 0.24, seat_h), "leather", col, bevel=0.03)
    bh = 0.95 if high_back else 0.55
    fr.box(f"{name}_Back", (-0.24, 0.2, seat_h + 0.04), (0.24, 0.28, seat_h + bh), "leather", col, bevel=0.04)
    if high_back:
        fr.box(f"{name}_Headrest", (-0.2, 0.19, seat_h + bh - 0.25), (0.2, 0.27, seat_h + bh + 0.05), "leather",
               col, bevel=0.04)
    for s in (-1, 1):
        fr.box(f"{name}_Arm{s}", (s * 0.27 - 0.03, -0.15, seat_h + 0.18), (s * 0.27 + 0.03, 0.18, seat_h + 0.21),
               "black_plastic", col, bevel=0.01)
        fr.box(f"{name}_ArmPost{s}", (s * 0.27 - 0.015, 0.05, seat_h - 0.05), (s * 0.27 + 0.015, 0.08,
                                                                                 seat_h + 0.18),
               "black_plastic", col)
    p = fr.p(0, 0, 0)
    C.cylinder(f"{name}_Gas", 0.03, seat_h - 0.12, (p.x, p.y, (seat_h - 0.12) / 2 + 0.06), M["chrome"],
               COL[col], verts=10)
    for k in range(5):
        a = fr.yaw + k * 2 * math.pi / 5
        leg = C.box(f"{name}_Leg{k}", (0.32, 0.04, 0.03), (p.x + math.cos(a) * 0.16, p.y + math.sin(a) * 0.16, 0.07),
                    M["black_plastic"], COL[col], rot=(0, 0, a))
        C.cylinder(f"{name}_Caster{k}", 0.025, 0.03, (p.x + math.cos(a) * 0.3, p.y + math.sin(a) * 0.3, 0.025),
                   M["black_plastic"], COL[col], verts=8, rot=(R(90), 0, a))
    seat = C.empty(f"SEAT_{name}", fr.p(0, 0, seat_h), COL["markers"], math.degrees(fr.yaw), size=0.2,
                   qv_marker="seat", seat_height=seat_h)
    return seat


def bench_row(name, x0, x1, y, col="gallery"):
    """Wooden public bench, occupants face +Y (the judge)."""
    seat_h = 0.45
    bx(f"{name}_Seat", (x0, y - 0.22, seat_h - 0.05), (x1, y + 0.22, seat_h), "wood", col, bevel=0.01)
    bx(f"{name}_Cushion", (x0 + 0.05, y - 0.2, seat_h), (x1 - 0.05, y + 0.18, seat_h + 0.035), "bench_fabric",
       col, bevel=0.012)
    bx(f"{name}_Back", (x0, y - 0.3, seat_h + 0.05), (x1, y - 0.24, seat_h + 0.5), "wood", col, bevel=0.01)
    bx(f"{name}_BackCap", (x0 - 0.02, y - 0.32, seat_h + 0.5), (x1 + 0.02, y - 0.22, seat_h + 0.54), "wood", col,
       bevel=0.01)
    for i, x in enumerate([x0, x1 - 0.06]):
        bx(f"{name}_End{i}", (x, y - 0.32, 0), (x + 0.06, y + 0.24, seat_h + 0.42), "wood", col, bevel=0.01,
           grain_v=True)
    tag(bx(f"{name}_Collider", (x0, y - 0.32, 0), (x1, y + 0.24, seat_h + 0.54), "wood", "colliders"),
        qv_collider="box")


def monitor(name, fr: Frame, at, col):
    x, y, z = at
    fr.box(f"{name}_Base", (x - 0.11, y - 0.08, z), (x + 0.11, y + 0.08, z + 0.015), "black_plastic", col)
    fr.box(f"{name}_Neck", (x - 0.02, y + 0.02, z), (x + 0.02, y + 0.05, z + 0.2), "black_plastic", col)
    fr.box(f"{name}_Bezel", (x - 0.28, y - 0.01, z + 0.12), (x + 0.28, y + 0.02, z + 0.46), "black_plastic", col,
           bevel=0.004)
    # screen faces the user (local +Y side)
    fr.box(f"{name}_Screen", (x - 0.26, y + 0.02, z + 0.14), (x + 0.26, y + 0.024, z + 0.44), "monitor_screen", col)


def laptop(name, fr: Frame, at, col):
    x, y, z = at
    fr.box(f"{name}_Base", (x - 0.17, y - 0.12, z), (x + 0.17, y + 0.12, z + 0.018), "chrome", col, bevel=0.004)
    lid = fr.box(f"{name}_Lid", (x - 0.17, y - 0.01, z), (x + 0.17, y + 0.005, z + 0.23), "chrome", col,
                 bevel=0.004)
    lid.location = fr.p(x, y - 0.13, z + 0.115)
    lid.rotation_euler = (R(-15), 0, fr.yaw)


def microphone(name, fr: Frame, at, col, reach=0.35, toward=1):
    x, y, z = at
    fr.box(f"{name}_Base", (x - 0.05, y - 0.07, z), (x + 0.05, y + 0.07, z + 0.03), "black_plastic", col,
           bevel=0.01)
    pts = [fr.p(x, y, z + 0.03), fr.p(x, y, z + 0.18), fr.p(x, y + toward * reach * 0.5, z + 0.36),
           fr.p(x, y + toward * reach, z + 0.38)]
    C.tube_curve(f"{name}_Gooseneck", pts, 0.006, M["black_plastic"], COL[col])
    tip = pts[-1]
    C.cylinder(f"{name}_Capsule", 0.012, 0.06, tip, M["black_plastic"], COL[col], verts=8,
               rot=(R(90), 0, fr.yaw))
    led = C.cylinder(f"{name}_Ring", 0.0125, 0.006, tip + (tip - pts[-2]).normalized() * 0.03, M["lamp"],
                     COL[col], verts=8, rot=(R(90), 0, fr.yaw))
    tag(led, qv_note="Microphone tally ring; can be toggled red/green in the web app")


def paper_stack(name, fr: Frame, at, col, n=6, rot=0.0):
    x, y, z = at
    for i in range(n):
        o = fr.box(f"{name}_{i}", (x - 0.105, y - 0.148, z + i * 0.004), (x + 0.105, y + 0.148, z + i * 0.004 + 0.003),
                   "paper", col)
        o.rotation_euler.z += rot + (i % 3 - 1) * 0.04
        _uv_full(o)


def _uv_full(o):
    """Map paper texture once across the sheet's top."""
    me = o.data
    uv = me.uv_layers.active
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = ((co.x - min(xs)) / (max(xs) - min(xs) + 1e-9),
                              (co.y - min(ys)) / (max(ys) - min(ys) + 1e-9))


def books(name, fr: Frame, at, col, count=3, stacked=True):
    x, y, z = at
    for i in range(count):
        th = 0.045 + (i % 2) * 0.012
        o = fr.box(f"{name}_{i}", (x - 0.16, y - 0.12, z), (x + 0.16, y + 0.12, z + th), "books", col, bevel=0.004)
        o.rotation_euler.z += (i - 1) * 0.06
        q = i % 4
        me = o.data
        uv = me.uv_layers.active
        u0, v0 = (q % 2) * 0.5, (q // 2) * 0.5
        for li, l in enumerate(me.loops):
            c = me.vertices[l.vertex_index].co
            uv.data[li].uv = (u0 + (c.x / 0.32 + 0.5) * 0.48, v0 + (c.z / 0.06 + 0.5) * 0.48)
        z += th


def evidence_folder(name, fr: Frame, at, col):
    x, y, z = at
    o = fr.box(name, (x - 0.12, y - 0.16, z), (x + 0.12, y + 0.16, z + 0.012), "books", col)
    tag(o, qv_keep_separate=True, qv_interactive="evidence",
        qv_note="Evidence folder the advocate picks up in Present_Evidence")
    C.empty(f"PROP_{name}", fr.p(x, y, z + 0.02), COL["markers"], math.degrees(fr.yaw), size=0.15,
            qv_marker="prop", prop="evidence_folder")


# ================================================================ areas
def build_judge_area():
    y1 = ROOM["y1"]
    dais_h = 0.45
    bx("JudgeDais", (-3.4, 6.35, 0), (3.4, y1, dais_h), "wood", "bench", bevel=0.01)
    bx("JudgeDais_Nosing", (-3.42, 6.33, dais_h - 0.04), (3.42, 6.4, dais_h), "wood", "bench", bevel=0.01)
    for i, z in enumerate([0.15, 0.3]):
        bx(f"JudgeDais_Step{i}", (-3.9, 6.6, 0), (-3.4, 7.6, z + 0.15 - 0.15 * i), "wood", "bench", bevel=0.01)
    tag(bx("JudgeDais_Collider", (-3.4, 6.35, 0), (3.4, y1, dais_h), "wood", "colliders"), qv_collider="box")
    fr = Frame((0, 6.78, 0))
    desk("JudgeBench", fr, 5.2, 0.8, 1.22, "bench", plaque="SUDYA", top_overhang=0.08)
    # bench upper modesty board between bench top and dais
    office_chair("Chair_sudya", Frame((0, 7.72, dais_h), 0), high_back=True, col="bench")
    top = 1.22
    monitor("JudgeMonitor", Frame((0, 6.78, 0), 0), (1.4, 0.12, top), "bench")
    microphone("JudgeMic", Frame((0, 6.78, 0), 0), (0.75, 0.05, top), "bench", reach=0.3, toward=1)
    paper_stack("JudgeDocs", Frame((0, 6.78, 0), 0), (-0.5, 0.1, top), "bench", n=8, rot=0.1)
    books("JudgeCodes", Frame((0, 6.78, 0), 0), (-1.5, 0.05, top), "bench", count=2)
    # emblem + flag
    em = C.plane("StateEmblem_PLACEHOLDER", 1.55, 1.55, (0, y1 - 0.075, 3.75), M["emblem"], COL["symbols"],
                 rot=(R(90), 0, 0))
    tag(em, qv_placeholder=True,
        qv_note="Stylised placeholder - replace with officially sourced State Emblem artwork")
    C.cylinder("EmblemBacking", 0.84, 0.03, (0, y1 - 0.06, 3.75), M["gold"], COL["symbols"], verts=48,
               rot=(R(90), 0, 0))
    flag_pole(Vector((-4.75, 8.35, 0)))
    # Clerk station (right of the bench)
    bx("ClerkDais", (3.5, 6.55, 0), (6.9, y1, 0.25), "wood", "clerk", bevel=0.01)
    tag(bx("ClerkDais_Collider", (3.5, 6.55, 0), (6.9, y1, 0.25), "wood", "colliders"), qv_collider="box")
    cf = Frame((4.9, 6.9, 0))
    desk("ClerkDesk", cf, 2.6, 0.7, 1.12, "clerk", plaque="SUD MAJLISI KOTIBI")
    office_chair("Chair_kotib", Frame((4.9, 7.6, 0.25), 0), col="clerk")
    monitor("ClerkMonitor", cf, (0.55, 0.08, 1.12), "clerk")
    cf.box("ClerkKeyboard", (-0.05, 0.1, 1.12), (0.4, 0.25, 1.135), "black_plastic", "clerk", bevel=0.003)
    paper_stack("ClerkDocs", cf, (-0.7, 0.05, 1.12), "clerk", n=10)
    microphone("ClerkMic", cf, (-0.25, 0.05, 1.12), "clerk", reach=0.25)
    # Court display screen (reference: QonunVerse screen top right)
    screen_display(Vector((5.5, y1 - 0.1, 3.55)))


def flag_pole(base: Vector):
    col = "symbols"
    C.cylinder("FlagPole_Base", 0.22, 0.06, base + Vector((0, 0, 0.03)), M["gold"], COL[col], verts=20)
    C.cylinder("FlagPole_Shaft", 0.022, 3.2, base + Vector((0, 0, 1.63)), M["gold"], COL[col], verts=12)
    C.sphere("FlagPole_Finial", 0.06, base + Vector((0, 0, 3.28)), M["gold"], COL[col], scale=(1, 1, 1.4))
    C.cylinder("FlagPole_Crossbar", 0.012, 1.0, base + Vector((0.5, 0, 3.1)), M["gold"], COL[col], verts=8,
               rot=(0, R(90), 0))
    # draped flag: hangs from the crossbar, hoist (blue band + crescent) next to the pole
    W, H = 0.95, 1.85
    nx, nz = 24, 36
    verts, faces, uvs = [], [], []
    for j in range(nz + 1):
        for i in range(nx + 1):
            u, v = i / nx, j / nz
            fold = math.sin(u * math.pi * 5.0) * 0.045 * (0.4 + v) + math.sin(u * math.pi * 2 + v * 3) * 0.02
            x = base.x + 0.04 + u * W * (1 - 0.18 * v)
            y = base.y + fold
            z = base.z + 3.08 - v * H
            verts.append((x, y, z))
    for j in range(nz):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    me = bpy.data.meshes.new("Flag_Uzbekistan")
    me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        poly.use_smooth = True
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            j, i = divmod(vi, nx + 1)
            # texture X (fly direction) runs down the drape; texture Y (bands) runs across
            uvl.data[li].uv = (j / nz, 1 - i / nx)
    o = bpy.data.objects.new("Flag_Uzbekistan", me)
    me.materials.append(M["flag"])
    COL[col].objects.link(o)
    sol = o.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = 0.004
    tag(o, qv_keep_separate=True, qv_note="Flag of the Republic of Uzbekistan, draped; can receive a cloth "
                                            "vertex shader in the web app")


def screen_display(c: Vector):
    col = "symbols"
    C.box("CourtDisplay_Bezel", (1.95, 0.06, 1.14), c, M["black_plastic"], COL[col], bevel=0.01)
    scr = C.plane("CourtDisplay_Screen", 1.86, 1.05, c + Vector((0, -0.031, 0)), M["screen"], COL[col],
                  rot=(R(90), 0, 0))
    tag(scr, qv_keep_separate=True, qv_interactive="screen",
        qv_note="Swap this material's map for a CanvasTexture/VideoTexture at runtime")
    f = c + Vector((0, -0.035, 0))
    t1 = C.text_mesh("CourtDisplay_Title", "QonunVerse", 0.2, f + Vector((0, 0, -0.07)), M["screen_text"],
                     COL[col], extrude=0.001)
    t2 = C.text_mesh("CourtDisplay_Sub", "Interaktiv sud simulyatori", 0.075, f + Vector((0, 0, -0.27)),
                     M["screen_text"], COL[col], extrude=0.001)
    # scales of justice icon
    sc = f + Vector((0, -0.002, 0.27))
    C.box("CourtDisplay_ScalePost", (0.012, 0.004, 0.2), sc, M["screen_gold"], COL[col])
    C.box("CourtDisplay_ScaleBeam", (0.26, 0.004, 0.012), sc + Vector((0, 0, 0.09)), M["screen_gold"], COL[col])
    for s in (-1, 1):
        C.box(f"CourtDisplay_ScalePan{s}", (0.08, 0.004, 0.012), sc + Vector((s * 0.12, 0, 0.0)), M["screen_gold"],
              COL[col])
    C.box("CourtDisplay_ScaleBase", (0.1, 0.004, 0.012), sc + Vector((0, 0, -0.1)), M["screen_gold"], COL[col])
    C.box("CourtDisplay_Mount", (0.3, 0.06, 0.3), c + Vector((0, 0.06, 0)), M["black_plastic"], COL[col])


def build_parties():
    # Advocate + plaintiff table (front-left), plaques face the gallery like the reference
    af = Frame((-2.75, 2.5, 0))
    desk("AdvocateTable", af, 3.9, 0.95, 0.78, "advocate", plaque="ADVOKAT", plaque_on_top=0.55)
    office_chair("Chair_advokat", Frame((-2.3, 3.32, 0), 0), col="advocate")
    office_chair("Chair_davogar", Frame((-4.75, 2.75, 0), 62), col="advocate")
    top = 0.78
    books("AdvocateBooks", af, (-0.9, 0.12, top), "advocate", count=3)
    paper_stack("AdvocateDocs", af, (0.15, 0.2, top), "advocate", n=12, rot=-0.15)
    laptop("AdvocateLaptop", af, (1.3, 0.15, top), "advocate")
    microphone("AdvocateMic", af, (0.85, 0.05, top), "advocate", reach=0.32)
    evidence_folder("EvidenceFolder_A", af, (0.45, 0.25, top + 0.05), "advocate")
    nameplate("PlaintiffPlaque", af, "DA’VOGAR", (-1.45, -0.475 + 0.08, top), "advocate", on_top=True)

    # Prosecutor desk (centre-right, faces the gallery)
    pf = Frame((1.9, 5.05, 0))
    desk("ProsecutorDesk", pf, 2.5, 0.85, 0.8, "prosecutor", plaque="PROKUROR")
    office_chair("Chair_prokuror", Frame((1.9, 5.72, 0), 0), col="prosecutor")
    books("ProsecutorBooks", pf, (-0.85, 0.1, 0.8), "prosecutor", count=2)
    paper_stack("ProsecutorDocs", pf, (-0.1, 0.12, 0.8), "prosecutor", n=8)
    microphone("ProsecutorMic", pf, (0.35, 0.0, 0.8), "prosecutor", reach=0.3)
    evidence_folder("EvidenceFolder_P", pf, (0.75, 0.15, 0.8), "prosecutor")

    # Defendant desk (right) - plaque "AYBLANUVCHI"
    df = Frame((5.0, 3.05, 0), -12)
    desk("DefendantDesk", df, 2.6, 0.8, 0.8, "defendant", plaque="AYBLANUVCHI")
    office_chair("Chair_javobgar", Frame((5.0, 3.78, 0), -28), col="defendant")
    microphone("DefendantMic", df, (-0.4, 0.0, 0.8), "defendant", reach=0.3)
    bx("DefendantRail", (3.55, 2.3, 0.0), (3.62, 4.6, 1.0), "wood", "defendant", bevel=0.01)

    # Witness stand (front right) - occupant faces the judge
    wf = Frame((4.65, 0.85, 0), 180)
    desk("WitnessStand", wf, 2.0, 0.7, 0.8, "witness", plaque=None)
    nameplate("WitnessPlaque", Frame((4.65, 0.85, 0), 0), "GUVOH", (-0.45, -0.28, 0.8), "witness", on_top=True)
    office_chair("Chair_guvoh", Frame((4.75, 0.2, 0), 180), col="witness")
    microphone("WitnessMic", wf, (0.35, 0.05, 0.8), "witness", reach=0.32)
    paper_stack("WitnessDocs", wf, (-0.2, 0.0, 0.8), "witness", n=3)


def build_gallery():
    y = -0.95
    for side, (a, b) in {"L": (-7.25, -0.6), "R": (0.6, 7.25)}.items():
        bx(f"Bar_{side}_Wall", (a, y - 0.04, 0), (b, y + 0.04, 0.92), "wood", "gallery", bevel=0.006)
        bx(f"Bar_{side}_Cap", (a - 0.02, y - 0.07, 0.92), (b + 0.02, y + 0.07, 0.97), "wood", "gallery", bevel=0.01)
        n = max(1, int((b - a) / 1.0))
        w = (b - a) / n
        for i in range(n):
            bx(f"Bar_{side}_Panel{i}", (a + i * w + 0.08, y - 0.055, 0.12), (a + (i + 1) * w - 0.08, y - 0.04, 0.8),
               "wood", "gallery", bevel=0.006, grain_v=True)
        tag(bx(f"Bar_{side}_Collider", (a, y - 0.07, 0), (b, y + 0.07, 0.97), "wood", "colliders"),
            qv_collider="box")
    for i, py in enumerate([-0.6, 0.6]):
        bx(f"Bar_GatePost{i}", (py - 0.05, y - 0.06, 0), (py + 0.05, y + 0.06, 1.05), "wood", "gallery", bevel=0.01)
    for r, yy in enumerate([-2.1, -3.4, -4.7]):
        bench_row(f"BenchL{r}", -7.0, -0.55, yy)
        bench_row(f"BenchR{r}", 0.75, 7.0, yy)


# ============================================================ lights/cameras
def build_lighting():
    scene = bpy.context.scene
    world = bpy.data.worlds.new("QV_World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.42, 0.38, 0.34, 1)
    bg.inputs["Strength"].default_value = 0.35
    sun = bpy.data.lights.new("Sun_Windows", "SUN")
    sun.energy = 4.5
    sun.angle = R(3)
    sun.color = (1.0, 0.95, 0.88)
    so = bpy.data.objects.new("Sun_Windows", sun)
    so.rotation_euler = (R(52), R(0), R(-62))  # enters through the right-wall windows
    COL["lights"].objects.link(so)
    for ix in range(-2, 3):
        for iy in range(0, 4):
            cx, cy = ix * 2.8, -4.0 + iy * 3.6
            a = bpy.data.lights.new(f"Area_{ix}_{iy}", "AREA")
            a.shape = "SQUARE"
            a.size = 0.9
            a.energy = 140
            a.color = (1.0, 0.94, 0.86)
            o = bpy.data.objects.new(f"Area_{ix}_{iy}", a)
            o.location = (cx, cy, ROOM["h"] - 0.05)
            COL["lights"].objects.link(o)
    # warm fill bouncing off the back paneling
    f = bpy.data.lights.new("Fill_Bench", "AREA")
    f.size = 4
    f.energy = 300
    f.color = (1.0, 0.88, 0.72)
    fo = bpy.data.objects.new("Fill_Bench", f)
    fo.location = (0, 4.5, 3.6)
    fo.rotation_euler = (R(-70), 0, 0)
    COL["lights"].objects.link(fo)
    eevee = scene.eevee
    for attr, val in [("use_raytracing", True), ("use_shadows", True), ("taa_render_samples", 48),
                      ("use_gtao", True)]:
        if hasattr(eevee, attr):
            setattr(eevee, attr, val)
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.0


def build_cameras():
    def cam(name, loc, target, lens):
        c = bpy.data.cameras.new(name)
        c.lens = lens
        c.clip_start = 0.05
        c.clip_end = 60
        o = bpy.data.objects.new(name, c)
        o.location = loc
        d = Vector(target) - Vector(loc)
        o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        COL["cameras"].objects.link(o)
        o["qv_marker"] = "camera"
        o["target"] = list(target)
        o["fov_deg"] = math.degrees(2 * math.atan(36 / (2 * lens)))
        return o
    ref = cam("CAM_reference", (-0.3, -3.1, 1.32), (0.55, 6.5, 1.7), 19)
    cam("CAM_overview", (0, -5.6, 4.3), (0, 4.5, 0.6), 18)
    cam("CAM_judge_pov", (0, 7.4, 1.65), (0, 0, 1.0), 26)
    cam("CAM_advocate_closeup", (-0.6, 1.2, 1.55), (-2.05, 3.45, 1.5), 50)
    cam("CAM_witness", (2.6, 2.6, 1.5), (4.75, 0.2, 1.1), 40)
    bpy.context.scene.camera = ref


def build_markers(cast):
    for ch in cast["characters"]:
        st = ch["station"]
        C.empty(f"SPAWN_{ch['id']}", st["pos"], COL["markers"], st["yaw_deg"], size=0.4,
                qv_marker="spawn", role=ch["role"], pose=st["pose"], character=ch["id"])
    q = cast["qonunai"]["station"]
    C.empty("SPAWN_qonunai", q["pos"], COL["markers"], q["yaw_deg"], size=0.4, qv_marker="spawn",
            role="guide", pose="floating", character="qonunai")
    # advocate blocking: table -> well -> bench, used by the Address_Judge / Present_Evidence beats
    for i, (p, yaw) in enumerate([((-2.05, 3.45, 0), 152), ((-0.9, 4.4, 0), 170), ((-0.3, 5.9, 0), 180),
                                  ((-0.3, 6.05, 0), 180)]):
        C.empty(f"WAYPOINT_advokat_{i}", p, COL["markers"], yaw, size=0.25, qv_marker="waypoint",
                path="advokat_to_bench", index=i)
    C.empty("POINT_evidence_handover", (-0.3, 6.25, 1.24), COL["markers"], 180, size=0.2,
            qv_marker="interaction", action="present_evidence")
    C.empty("POINT_witness_stand_entry", (3.4, 0.2, 0), COL["markers"], 90, size=0.25,
            qv_marker="waypoint", path="witness_entry", index=0)
    C.empty("POINT_security_door", (6.9, 7.55, 0), COL["markers"], -90, size=0.25,
            qv_marker="interaction", action="door")
    C.empty("POINT_gallery_gate", (0.0, -0.95, 0), COL["markers"], 180, size=0.25,
            qv_marker="waypoint", path="gallery_gate", index=0)


# ================================================================== main
def build(render=False):
    C.reset_scene()
    tx = T.build_environment_set()
    M.update(MAT.environment_library(tx))
    env = C.collection("QV_Environment")
    for name in ["shell", "walls", "windows", "doors", "lights_geo", "bench", "clerk", "symbols", "advocate",
                 "prosecutor", "defendant", "witness", "gallery", "chairs"]:
        COL[name] = C.collection(f"ENV_{name}", env)
    COL["colliders"] = C.collection("QV_Colliders")
    COL["markers"] = C.collection("QV_Markers")
    COL["lights"] = C.collection("QV_Lights")
    COL["cameras"] = C.collection("QV_Cameras")
    cast = C.load_json(C.CONFIG / "cast.json")

    build_shell()
    build_judge_area()
    build_parties()
    build_gallery()
    build_lighting()
    build_cameras()
    build_markers(cast)
    COL["colliders"].hide_render = True
    for o in COL["colliders"].objects:
        o.display_type = "WIRE"
        o.hide_set(True)
    # reference image as a camera background for side-by-side matching in the UI
    cam = bpy.data.objects["CAM_reference"].data
    if C.REFERENCE.exists():
        cam.show_background_images = True
        bgi = cam.background_images.new()
        bgi.image = bpy.data.images.load(str(C.REFERENCE))
        bgi.alpha = 0.5
        bgi.display_depth = "FRONT"
    scene = bpy.context.scene
    scene["qv_coordinate_system"] = "Blender Z-up metres; X right, +Y towards the bench. glTF export -> Y-up."
    out = C.BLENDER_DIR / "courtroom.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(out), compress=True)
    C.log("saved", out)
    if render:
        render_previews()


def render_previews(res=(1280, 720)):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y = res
    out_dir = C.BLENDER_DIR / "renders"
    out_dir.mkdir(exist_ok=True)
    for cam_name in ["CAM_reference", "CAM_overview"]:
        scene.camera = bpy.data.objects[cam_name]
        scene.render.filepath = str(out_dir / f"courtroom_{cam_name}.png")
        bpy.ops.render.render(write_still=True)
        C.log("render", scene.render.filepath)
    scene.camera = bpy.data.objects["CAM_reference"]


if __name__ == "__main__":
    args = C.cli_args()
    build(render="--render" in args)
