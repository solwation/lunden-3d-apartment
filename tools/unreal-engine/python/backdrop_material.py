"""#2323. Original sRGB backdrop canvases on the web's UV0, PBR tint and optional COLOR_0."""
import hashlib
from pathlib import Path

import unreal as u

GRAPH = "backdrop-texture"
SOURCE = Path(__file__).resolve().parents[1] / "backdrop-textures"
FOLDER = "/Game/Lunden/Generated/BackdropMaterials/Textures"
TAG = "Lunden.CanvasSHA256"
eal, mel = u.EditorAssetLibrary, u.MaterialEditingLibrary


def canvas_hash(spec):
    return hashlib.sha256((SOURCE / (spec["canvas"] + ".png")).read_bytes()).hexdigest()


def correct_sampling(asset, spec):
    wrap = u.TextureAddress.TA_CLAMP if spec.get("clamp") else u.TextureAddress.TA_WRAP
    return (isinstance(asset, u.Texture2D) and asset.get_editor_property("srgb")
            and all(asset.get_editor_property(axis) == wrap for axis in ("address_x", "address_y")))


def texture(spec):
    name = spec["canvas"]
    path = FOLDER + "/" + name
    digest = canvas_hash(spec)
    asset = eal.load_asset(path) if eal.does_asset_exist(path) else None
    if correct_sampling(asset, spec) and eal.get_metadata_tag(asset, TAG) == digest:
        return asset
    task = u.AssetImportTask()
    task.filename = str(SOURCE / (name + ".png"))
    task.destination_path = FOLDER
    task.automated = True
    task.replace_existing = True
    task.save = False
    u.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    asset = eal.load_asset(path)
    if not isinstance(asset, u.Texture2D):
        raise RuntimeError(f"Expected an imported sRGB Texture2D at {path}")
    asset.set_editor_property("srgb", True)
    wrap = u.TextureAddress.TA_CLAMP if spec.get("clamp") else u.TextureAddress.TA_WRAP
    asset.set_editor_property("address_x", wrap)
    asset.set_editor_property("address_y", wrap)
    eal.set_metadata_tag(asset, TAG, digest)
    if not eal.save_loaded_asset(asset, only_if_is_dirty=False):
        raise RuntimeError(f"Could not save {path}")
    return asset


def build(m, spec, vector_param, scalar_param):
    m.set_editor_property("two_sided", spec["twoSided"])
    sample = mel.create_material_expression(m, u.MaterialExpressionTextureSample, -800, 0)
    sample.set_editor_property("texture", texture(spec))
    sample.set_editor_property("sampler_type", u.MaterialSamplerType.SAMPLERTYPE_COLOR)
    tint = vector_param(m, "BaseColor", "#ffffff", -800, 160)
    colour = mel.create_material_expression(m, u.MaterialExpressionMultiply, -520, 0)
    if not (mel.connect_material_expressions(sample, "RGB", colour, "A")
            and mel.connect_material_expressions(tint, "", colour, "B")):
        raise RuntimeError("Could not connect the backdrop atlas and its linear base colour")
    if spec["vertexColors"]:
        vc = mel.create_material_expression(m, u.MaterialExpressionVertexColor, -520, 180)
        shaded = mel.create_material_expression(m, u.MaterialExpressionMultiply, -270, 0)
        if not (mel.connect_material_expressions(colour, "", shaded, "A")
                and mel.connect_material_expressions(vc, "", shaded, "B")):
            raise RuntimeError("Could not multiply the backdrop colour by COLOR_0")
        colour = shaded
    for output, prop in ((colour, u.MaterialProperty.MP_BASE_COLOR),
                         (scalar_param(m, "Roughness", 0.95, -270, 250), u.MaterialProperty.MP_ROUGHNESS),
                         (scalar_param(m, "Metallic", 0.0, -270, 400), u.MaterialProperty.MP_METALLIC)):
        if not mel.connect_material_property(output, "", prop):
            raise RuntimeError(f"Could not connect the backdrop output {prop}")


def check(m, spec, uses_vertex_color):
    expected = FOLDER + "/" + spec["canvas"]
    tex = eal.load_asset(expected)
    root = mel.get_material_property_input_node(m, u.MaterialProperty.MP_BASE_COLOR)
    nodes, seen = [root], set()
    while nodes:
        node = nodes.pop()
        if node and node not in seen:
            seen.add(node)
            nodes.extend(mel.get_inputs_for_material_expression(m, node))
    valid_texture = (correct_sampling(tex, spec)
                     and eal.get_metadata_tag(tex, TAG) == canvas_hash(spec)
                     and any(isinstance(n, u.MaterialExpressionTextureSample) and n.get_editor_property("texture") == tex
                             for n in seen))
    valid_vc = uses_vertex_color(m, u.MaterialProperty.MP_BASE_COLOR) == spec["vertexColors"]
    return valid_texture and valid_vc and m.get_editor_property("two_sided") == spec["twoSided"]
