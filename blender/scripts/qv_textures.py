"""Deterministic, tileable PBR texture generation with numpy (bundled with Blender).

Every texture is written to blender/textures/ as JPEG/PNG so the glTF exporter can
embed real images (procedural shader nodes do not survive glTF export).
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import bpy

from qv_common import TEXTURES, log


# ------------------------------------------------------------------ noise
def _periodic_interp(grid, h, w):
    gh, gw = grid.shape
    ys = np.arange(h) * gh / h
    xs = np.arange(w) * gw / w
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = ys - y0
    fx = xs - x0
    fy = fy * fy * (3 - 2 * fy)
    fx = fx * fx * (3 - 2 * fx)
    y1 = (y0 + 1) % gh
    x1 = (x0 + 1) % gw
    a = grid[y0][:, x0]
    b = grid[y0][:, x1]
    c = grid[y1][:, x0]
    d = grid[y1][:, x1]
    fx = fx[None, :]
    fy = fy[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(h, w, cells=(4, 4), octaves=5, seed=0, gain=0.5):
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    amp, total = 1.0, 0.0
    cy, cx = cells
    for o in range(octaves):
        grid = rng.random((cy * 2 ** o, cx * 2 ** o)).astype(np.float32)
        out += amp * _periodic_interp(grid, h, w)
        total += amp
        amp *= gain
    return out / total


def normal_from_height(hgt, strength=2.0):
    dx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * strength
    dy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * strength
    n = np.stack([-dx, dy, np.ones_like(hgt)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def _srgb(c):
    return np.array(c, np.float32) / 255.0


def lerp_col(a, b, t):
    return a[None, None, :] * (1 - t[..., None]) + b[None, None, :] * t[..., None]


# ------------------------------------------------------------------ IO
def save_image(name, rgb, fmt="JPEG", non_color=False, quality=88):
    """rgb: HxWx3 or HxWx4 float array in 0..1, row 0 = TOP of the image."""
    TEXTURES.mkdir(parents=True, exist_ok=True)
    ext = ".jpg" if fmt == "JPEG" else ".png"
    path = TEXTURES / f"{name}{ext}"
    path.parent.mkdir(parents=True, exist_ok=True)
    h, w = rgb.shape[:2]
    if rgb.shape[2] == 3:
        rgba = np.concatenate([rgb, np.ones((h, w, 1), np.float32)], -1)
    else:
        rgba = rgb
    img = bpy.data.images.new(name + "_tmp", w, h, alpha=(fmt == "PNG"), float_buffer=False)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(np.ascontiguousarray(np.clip(rgba[::-1], 0, 1), np.float32).ravel())
    img.filepath_raw = str(path)
    img.file_format = fmt
    scene = bpy.context.scene
    scene.render.image_settings.quality = quality
    try:
        img.save(filepath=str(path), quality=quality)
    except TypeError:
        img.save()
    bpy.data.images.remove(img)
    return path


def load_image(path, non_color=False):
    img = bpy.data.images.load(str(path), check_existing=True)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def pbr_set(name, albedo, rough, height=None, metal=None, normal_strength=2.0, size=None):
    """Write albedo / ORM (R=1 AO, G=roughness, B=metallic) / normal maps."""
    out = {"albedo": save_image(f"{name}_albedo", albedo)}
    h, w = rough.shape
    orm = np.stack([np.ones((h, w), np.float32), rough,
                    metal if metal is not None else np.zeros((h, w), np.float32)], -1)
    out["orm"] = save_image(f"{name}_orm", orm, non_color=True)
    if height is not None:
        out["normal"] = save_image(f"{name}_normal", normal_from_height(height, normal_strength),
                                   non_color=True)
    return out


# ------------------------------------------------------------------ recipes
def wood(name="wood_walnut", res=1024, seed=3, dark=(58, 27, 15), light=(104, 54, 31),
         rings=38, gloss=0.3):
    """Quarter-sawn mahogany/walnut veneer; straight grain runs along U (horizontal)."""
    n1 = fbm(res, res, (1, 6), 5, seed)
    n2 = fbm(res, res, (6, 1), 4, seed + 1)
    v = np.linspace(0, 1, res, endpoint=False)[:, None]
    grain = np.sin((v * rings + n1 * 0.9 + n2 * 0.12) * 2 * math.pi)
    grain = (grain * 0.5 + 0.5) ** 3.0
    streak = fbm(res, res, (48, 1), 3, seed + 2)
    t = np.clip(grain * 0.3 + streak * 0.45 + (n2 - 0.5) * 0.35 + 0.1, 0, 1)
    albedo = lerp_col(_srgb(dark) ** 2.2, _srgb(light) ** 2.2, t) ** (1 / 2.2)
    pores = (fbm(res, res, (64, 4), 2, seed + 3) > 0.72).astype(np.float32) * 0.08
    albedo *= (1 - pores)[..., None]
    rough = np.clip(gloss + (1 - t) * 0.12 + pores * 1.5, 0, 1).astype(np.float32)
    height = t * 0.15 - pores * 2
    return pbr_set(name, albedo.astype(np.float32), rough, height, normal_strength=1.5)


def stone_tiles(name="floor_stone", res=1024, tiles=2, seed=11):
    """Warm grey honed stone, 2x2 tiles per texture (texture covers 1.2 m)."""
    n = fbm(res, res, (6, 6), 6, seed)
    vein = np.abs(np.sin((fbm(res, res, (3, 3), 5, seed + 1) * 9) * math.pi)) ** 8
    base = _srgb((176, 170, 160))
    alt = _srgb((150, 144, 134))
    t = np.clip(n * 0.8 + vein * 0.4, 0, 1)
    albedo = lerp_col(base, alt, t)
    yy, xx = np.mgrid[0:res, 0:res] / res * tiles
    gx = np.minimum(xx % 1, 1 - xx % 1)
    gy = np.minimum(yy % 1, 1 - yy % 1)
    grout = (np.minimum(gx, gy) < 0.004).astype(np.float32)
    # per tile tint variation
    tile_id = (np.floor(xx) + np.floor(yy) * 7).astype(int)
    rng = np.random.default_rng(seed)
    tint = rng.uniform(0.94, 1.04, 64)[tile_id % 64]
    albedo = albedo * tint[..., None]
    albedo = albedo * (1 - grout[..., None] * 0.45)
    rough = np.clip(0.38 + n * 0.15 + grout * 0.5, 0, 1).astype(np.float32)
    height = n * 0.05 - grout
    return pbr_set(name, albedo.astype(np.float32), rough, height, normal_strength=3)


def plaster(name="wall_plaster", res=512, seed=21, col=(214, 202, 182)):
    n = fbm(res, res, (4, 4), 6, seed)
    albedo = lerp_col(_srgb(col), _srgb(col) * 0.93, n)
    rough = np.full((res, res), 0.85, np.float32) - n * 0.08
    return pbr_set(name, albedo.astype(np.float32), rough.astype(np.float32), n * 0.4,
                   normal_strength=1.0)


def leather(name="leather_black", res=512, seed=31, col=(18, 17, 17)):
    n = fbm(res, res, (48, 48), 3, seed)
    cells = np.abs(n - 0.5) * 2
    albedo = lerp_col(_srgb(col), _srgb(col) * 1.6, cells)
    rough = (0.42 + cells * 0.2).astype(np.float32)
    return pbr_set(name, albedo.astype(np.float32), rough, cells * 0.6, normal_strength=2.5)


def fabric(name, col, res=256, seed=41, rough=0.9):
    yy, xx = np.mgrid[0:res, 0:res]
    weave = (np.sin(xx * math.pi / 2) * np.sin(yy * math.pi / 2)) * 0.5 + 0.5
    n = fbm(res, res, (8, 8), 3, seed)
    albedo = lerp_col(_srgb(col), _srgb(col) * 0.8, weave * 0.4 + n * 0.3)
    r = np.full((res, res), rough, np.float32)
    return pbr_set(name, albedo.astype(np.float32), r, weave * 0.2, normal_strength=1.5)


def paper(name="paper", res=256, seed=51):
    n = fbm(res, res, (8, 8), 4, seed)
    albedo = lerp_col(_srgb((238, 236, 228)), _srgb((222, 218, 206)), n)
    # faint printed lines
    yy = np.arange(res)[:, None]
    lines = ((yy % 12) < 2) & (yy > 30) & (yy < res - 30)
    xx = np.arange(res)[None, :]
    lines = lines & (xx > 24) & (xx < res - 24)
    albedo = albedo * (1 - lines[..., None] * 0.35)
    return pbr_set(name, albedo.astype(np.float32), np.full((res, res), 0.92, np.float32))


def book_covers(name="book_covers", res=512, seed=61):
    """Atlas of 4 cloth-bound legal volumes (dark blue, maroon, green, black)."""
    cols = [(24, 36, 70), (82, 22, 26), (24, 58, 40), (20, 20, 22)]
    albedo = np.zeros((res, res, 3), np.float32)
    n = fbm(res, res, (32, 32), 3, seed)
    q = res // 2
    for i, c in enumerate(cols):
        y, x = divmod(i, 2)
        tile = lerp_col(_srgb(c), _srgb(c) * 1.3, n[y * q:(y + 1) * q, x * q:(x + 1) * q])
        # gold spine bands
        for b in (0.15, 0.22, 0.78, 0.85):
            r0 = int(b * q)
            tile[r0:r0 + 4] = _srgb((176, 140, 64))
        albedo[y * q:(y + 1) * q, x * q:(x + 1) * q] = tile
    return pbr_set(name, albedo, np.full((res, res), 0.7, np.float32))


def uzbek_flag(name="flag_uzbekistan", w=1024, h=512):
    """Flag of Uzbekistan (ratio 1:2). Bands per the 1991 law: blue, white, green
    with thin red fimbriations; white crescent + 12 stars (3/4/5 rows) on the hoist.
    Colours approximate the official specification (verify for print-grade use)."""
    blue = _srgb((0, 153, 181))
    white = _srgb((255, 255, 255))
    green = _srgb((30, 181, 58))
    red = _srgb((206, 17, 38))
    img = np.zeros((h, w, 3), np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    v = yy / h
    img[:] = white
    img[v < 0.32] = blue
    img[(v >= 0.32) & (v < 0.34)] = red
    img[(v >= 0.66) & (v < 0.68)] = red
    img[v >= 0.68] = green
    # crescent
    cx, cy, r = 0.135 * w, 0.16 * h, 0.105 * h
    c1 = (xx - cx) ** 2 + (yy - cy) ** 2 < r * r
    c2 = (xx - cx - 0.035 * h) ** 2 + (yy - cy) ** 2 < (r * 0.86) ** 2
    img[c1 & ~c2] = white

    def star(sx, sy, R):
        pts = []
        for k in range(10):
            ang = -math.pi / 2 + k * math.pi / 5
            rr = R if k % 2 == 0 else R * 0.38
            pts.append((sx + rr * math.cos(ang), sy + rr * math.sin(ang)))
        inside = np.zeros((h, w), bool)
        j = len(pts) - 1
        for i in range(len(pts)):
            xi, yi = pts[i]
            xj, yj = pts[j]
            cond = ((yi > yy) != (yj > yy)) & (xx < (xj - xi) * (yy - yi) / (yj - yi + 1e-9) + xi)
            inside ^= cond
            j = i
        img[inside] = white

    R = 0.024 * h
    rows = [(0.075, 3), (0.155, 4), (0.235, 5)]
    for ry, count in rows:
        for k in range(count):
            star(0.40 * w - (count - 1 - k) * 0.052 * w, ry * h, R)
    n = fbm(h, w, (4, 8), 3, 7)
    img *= (0.94 + n * 0.08)[..., None]
    path = save_image(name, img, quality=92)
    return {"albedo": path}


def emblem_placeholder(name="emblem_placeholder", res=1024):
    """STYLISED PLACEHOLDER medallion evoking the State Emblem's palette and layout
    (sun, mountains, river, wheat & cotton wreath, star). It is NOT the official
    emblem artwork; replace with an officially sourced vector before release."""
    img = np.zeros((res, res, 4), np.float32)
    yy, xx = np.mgrid[0:res, 0:res].astype(np.float32)
    c = res / 2
    x = (xx - c) / c
    y = (yy - c) / c
    r = np.sqrt(x * x + y * y)
    ang = np.arctan2(y, x)
    gold = _srgb((214, 172, 74))
    disc = r < 0.62
    img[disc, :3] = _srgb((238, 236, 226))
    sky = disc & (y < 0.05)
    img[sky, :3] = lerp_col(_srgb((40, 120, 200)), _srgb((150, 200, 235)), (y + 0.62) / 0.7)[sky]
    sun = ((x) ** 2 + (y + 0.02) ** 2 < 0.06) & disc
    img[sun, :3] = _srgb((250, 200, 60))
    rays = disc & (y < 0.0) & (np.cos(ang * 24) > 0.6) & (r > 0.28) & (r < 0.55)
    img[rays, :3] = img[rays, :3] * 0.6 + _srgb((250, 210, 90)) * 0.4
    mountain = disc & (y > -0.05) & (y < 0.25) & (y > 0.18 - 0.6 * (0.5 - np.abs(x)))
    img[mountain, :3] = _srgb((70, 140, 80))
    river = disc & (y > 0.25) & (y < 0.35)
    img[river, :3] = _srgb((60, 130, 210))
    field = disc & (y >= 0.35)
    img[field, :3] = _srgb((90, 160, 70))
    ring = (r > 0.62) & (r < 0.66)
    img[ring, :3] = gold
    wreath = (r > 0.66) & (r < 0.95) & (y > -0.75)
    leaf = (np.sin(ang * 36 + r * 20) > 0.1)
    img[wreath & leaf, :3] = gold * 0.95
    img[wreath & ~leaf, :3] = gold * 0.7
    cotton = wreath & (np.sin(ang * 9) > 0.92) & (np.abs(r - 0.8) < 0.07)
    img[cotton, :3] = _srgb((250, 250, 245))
    star_mask = (np.abs(x) < 0.09) & (y < -0.72) & (y > -0.95) & \
                (np.abs(x) < (0.09 - np.abs(y + 0.835) * 0.6))
    img[star_mask, :3] = _srgb((40, 120, 200))
    ribbon = (np.abs(y - 0.88) < 0.06) & (np.abs(x) < 0.55)
    img[ribbon, :3] = np.where((x < -0.18)[..., None], _srgb((0, 153, 181)),
                               np.where((x < 0.18)[..., None], _srgb((255, 255, 255)),
                                        _srgb((30, 181, 58))))[ribbon]
    alpha = ((r < 0.95) & (y > -0.95)) | ribbon | star_mask
    img[..., 3] = alpha.astype(np.float32)
    path = save_image(name, img, fmt="PNG")
    return {"albedo": path}


def screen_qonunverse(name="screen_qonunverse", w=1024, h=576):
    """Background gradient for the courtroom display (text is real geometry)."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    t = np.clip((xx / w) * 0.6 + (yy / h) * 0.4, 0, 1)
    img = lerp_col(_srgb((10, 40, 120)), _srgb((4, 18, 70)), t)
    glow = np.exp(-(((xx - w * 0.5) / (w * 0.35)) ** 2 + ((yy - h * 0.35) / (h * 0.35)) ** 2))
    img += glow[..., None] * _srgb((30, 70, 160)) * 0.6
    return {"albedo": save_image(name, img, quality=90)}


def recolor_texture(src_path, name, rgb, keep_detail=0.85):
    """Re-tint a MakeHuman clothing/hair diffuse while keeping its fold shading.

    Uses the luminance of the source as a detail layer multiplied over the target colour.
    Alpha (if any) is preserved, output is PNG when alpha is present.
    """
    src = bpy.data.images.load(str(src_path), check_existing=False)
    w, h = src.size
    px = np.empty(w * h * 4, np.float32)
    src.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)[::-1]
    has_alpha = bool(px[..., 3].min() < 0.99)
    lum = px[..., 0] * 0.2126 + px[..., 1] * 0.7152 + px[..., 2] * 0.0722
    mean = max(float(np.median(lum[px[..., 3] > 0.5])) if has_alpha else float(np.median(lum)), 1e-3)
    detail = np.clip(lum / mean, 0, 2.0)
    detail = 1 + (detail - 1) * keep_detail
    target = _srgb(rgb) ** 2.2
    out = np.clip(target[None, None, :] * detail[..., None], 0, 1) ** (1 / 2.2)
    if has_alpha:
        out = np.concatenate([out, px[..., 3:4]], -1)
    bpy.data.images.remove(src)
    # cap resolution for web
    path = save_image(name, out.astype(np.float32), fmt="PNG" if has_alpha else "JPEG")
    return path


def adjust_texture(src_path, name, saturation=1.0, multiply=(1, 1, 1), gamma=1.0):
    """Saturation / multiply / gamma adjustment in sRGB space (skin tone, eye colour)."""
    src = bpy.data.images.load(str(src_path), check_existing=False)
    w, h = src.size
    px = np.empty(w * h * 4, np.float32)
    src.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)[::-1]
    rgb = px[..., :3]
    lum = (rgb * np.array([0.2126, 0.7152, 0.0722], np.float32)).sum(-1, keepdims=True)
    rgb = lum + (rgb - lum) * saturation
    rgb = np.clip(rgb * np.array(multiply, np.float32), 0, 1) ** gamma
    bpy.data.images.remove(src)
    return save_image(name, rgb.astype(np.float32), quality=90)


def build_environment_set():
    log("generating environment textures ...")
    return {
        "wood": wood(),
        "wood_light": wood("wood_oak_trim", res=512, seed=8, dark=(92, 54, 30), light=(140, 88, 50),
                           rings=14, gloss=0.38),
        "floor": stone_tiles(),
        "plaster": plaster(),
        "leather": leather(),
        "carpet": fabric("fabric_bench_green", (40, 58, 48), seed=44),
        "paper": paper(),
        "books": book_covers(),
        "flag": uzbek_flag(),
        "emblem": emblem_placeholder(),
        "screen": screen_qonunverse(),
    }
