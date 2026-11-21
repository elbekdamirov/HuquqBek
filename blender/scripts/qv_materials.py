"""glTF-compatible Principled BSDF material library.

Only node patterns the Blender glTF exporter understands are used:
Image Texture -> Base Color; ORM image -> Separate Color (G -> Roughness, B -> Metallic);
Image -> Normal Map -> Normal; Emission colour/strength; Alpha with blend mode.
"""
from __future__ import annotations

import bpy

from qv_textures import load_image


def _new(name):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat, False
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    return mat, True


def _bsdf(mat):
    return mat.node_tree.nodes.get("Principled BSDF")


def solid(name, color, roughness=0.5, metallic=0.0, emission=None, emission_strength=0.0,
          alpha=1.0, coat=0.0):
    mat, created = _new(name)
    if not created:
        return mat
    b = _bsdf(mat)
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = roughness
    b.inputs["Metallic"].default_value = metallic
    if coat:
        b.inputs["Coat Weight"].default_value = coat
    if emission:
        b.inputs["Emission Color"].default_value = (*emission, 1.0)
        b.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        _blend(mat)
    mat.diffuse_color = (*color, 1.0)
    return mat


def _blend(mat):
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED"
    if hasattr(mat, "blend_method"):
        mat.blend_method = "BLEND"
    if hasattr(mat, "use_backface_culling"):
        mat.use_backface_culling = False


def textured(name, tex: dict, roughness_scale=None, metallic=0.0, normal_strength=1.0,
             alpha_blend=False, alpha_clip=False, emission_strength=0.0, tint=None):
    mat, created = _new(name)
    if not created:
        return mat
    nt = mat.node_tree
    b = _bsdf(mat)
    nodes, links = nt.nodes, nt.links
    x = -700
    if "albedo" in tex:
        n = nodes.new("ShaderNodeTexImage")
        n.image = load_image(tex["albedo"])
        n.location = (x, 300)
        links.new(n.outputs["Color"], b.inputs["Base Color"])
        if alpha_blend or alpha_clip:
            links.new(n.outputs["Alpha"], b.inputs["Alpha"])
            if alpha_blend:
                _blend(mat)
            else:
                if hasattr(mat, "blend_method"):
                    mat.blend_method = "CLIP"
                if hasattr(mat, "surface_render_method"):
                    mat.surface_render_method = "DITHERED"
        if emission_strength:
            links.new(n.outputs["Color"], b.inputs["Emission Color"])
            b.inputs["Emission Strength"].default_value = emission_strength
    if "orm" in tex:
        n = nodes.new("ShaderNodeTexImage")
        n.image = load_image(tex["orm"], non_color=True)
        n.location = (x, 0)
        sep = nodes.new("ShaderNodeSeparateColor")
        sep.location = (x + 300, 0)
        links.new(n.outputs["Color"], sep.inputs["Color"])
        links.new(sep.outputs["Green"], b.inputs["Roughness"])
        links.new(sep.outputs["Blue"], b.inputs["Metallic"])
    else:
        b.inputs["Metallic"].default_value = metallic
    if "normal" in tex:
        n = nodes.new("ShaderNodeTexImage")
        n.image = load_image(tex["normal"], non_color=True)
        n.location = (x, -300)
        nm = nodes.new("ShaderNodeNormalMap")
        nm.location = (x + 300, -300)
        nm.inputs["Strength"].default_value = normal_strength
        links.new(n.outputs["Color"], nm.inputs["Color"])
        links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return mat


def environment_library(tx):
    """All courtroom materials, keyed by short name. One material = one draw call
    after the exporter's merge-by-material pass, so keep this list short."""
    M = {}
    M["wood"] = textured("QV_Wood_Walnut", tx["wood"], normal_strength=0.6)
    M["wood_trim"] = textured("QV_Wood_OakTrim", tx["wood_light"], normal_strength=0.5)
    M["floor"] = textured("QV_Floor_Stone", tx["floor"], normal_strength=0.8)
    M["plaster"] = textured("QV_Wall_Plaster", tx["plaster"], normal_strength=0.4)
    M["leather"] = textured("QV_Leather_Black", tx["leather"], normal_strength=0.6)
    M["bench_fabric"] = textured("QV_Fabric_Bench", tx["carpet"], normal_strength=0.5)
    M["paper"] = textured("QV_Paper", tx["paper"])
    M["books"] = textured("QV_Book_Covers", tx["books"])
    M["flag"] = textured("QV_Flag_Uzbekistan", tx["flag"])
    M["emblem"] = textured("QV_Emblem_PLACEHOLDER", tx["emblem"], alpha_clip=True)
    M["screen"] = textured("QV_Screen_Display", tx["screen"], emission_strength=1.5)
    M["gold"] = solid("QV_Brass_Gold", (0.80, 0.60, 0.25), 0.28, 1.0)
    M["plaque"] = solid("QV_Nameplate_Gold", (0.86, 0.70, 0.36), 0.35, 1.0)
    M["plaque_text"] = solid("QV_Nameplate_Text", (0.03, 0.025, 0.02), 0.5)
    M["chrome"] = solid("QV_Metal_Chrome", (0.75, 0.75, 0.76), 0.18, 1.0)
    M["black_plastic"] = solid("QV_Plastic_Black", (0.012, 0.012, 0.014), 0.45)
    M["monitor_screen"] = solid("QV_Monitor_Screen", (0.02, 0.03, 0.05), 0.15,
                                emission=(0.25, 0.35, 0.55), emission_strength=0.4)
    M["glass"] = solid("QV_Window_Glass", (0.85, 0.92, 0.95), 0.05, alpha=0.18)
    M["window_frame"] = solid("QV_Window_Frame", (0.85, 0.84, 0.80), 0.5)
    M["sky"] = solid("QV_Exterior_Daylight", (1, 1, 1), 1.0, emission=(1.0, 0.97, 0.92),
                     emission_strength=3.0)
    M["lamp"] = solid("QV_Lamp_Emissive", (1, 0.95, 0.85), 0.5, emission=(1.0, 0.86, 0.66),
                      emission_strength=6.0)
    M["ceiling_light"] = solid("QV_CeilingPanel_Emissive", (1, 1, 1), 0.5,
                               emission=(1.0, 0.97, 0.92), emission_strength=4.0)
    M["ceiling"] = solid("QV_Ceiling_Paint", (0.86, 0.84, 0.80), 0.9)
    M["screen_text"] = solid("QV_Screen_Text", (1, 1, 1), 0.5, emission=(1, 1, 1),
                             emission_strength=2.0)
    M["screen_gold"] = solid("QV_Screen_Gold", (0.95, 0.75, 0.35), 0.5,
                             emission=(0.95, 0.72, 0.30), emission_strength=1.6)
    return M
