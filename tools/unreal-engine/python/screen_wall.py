"""#2443: the source screen-wall canvas on its existing normalized UV0; no geometry change."""
import hashlib
from pathlib import Path

import unreal as u

GRAPH = "screen-wall"
SOURCE = Path(__file__).resolve().parents[1] / "screenwall-textures"
FOLDER = "/Game/Lunden/Generated/ScreenWallMaterials"
TAG = "Lunden.CanvasSHA256"
eal, mel = u.EditorAssetLibrary, u.MaterialEditingLibrary


def hashes():
    return {name: hashlib.sha256((SOURCE / (name + ".png")).read_bytes()).hexdigest()
            for name in ("Colour", "Surface")}


def sampling_ok(asset, name):
    return (isinstance(asset, u.Texture2D) and bool(asset.get_editor_property("srgb")) == (name == "Colour")
            and asset.get_editor_property("compression_settings") == (u.TextureCompressionSettings.TC_DEFAULT
                 if name == "Colour" else u.TextureCompressionSettings.TC_MASKS)
            and asset.get_editor_property("address_x") == u.TextureAddress.TA_WRAP
            and asset.get_editor_property("address_y") == u.TextureAddress.TA_CLAMP
            and asset.get_editor_property("mip_gen_settings") == u.TextureMipGenSettings.TMGS_FROM_TEXTURE_GROUP)


def texture(name):
    path = FOLDER + "/T_ScreenWall" + name
    digest = hashes()[name]
    asset = eal.load_asset(path) if eal.does_asset_exist(path) else None
    if sampling_ok(asset, name) and eal.get_metadata_tag(asset, TAG) == digest:
        return asset
    task = u.AssetImportTask()
    task.filename = str(SOURCE / (name + ".png"))
    task.destination_path = FOLDER
    task.destination_name = path.rsplit("/", 1)[1]
    task.automated, task.replace_existing, task.save = True, True, False
    u.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    asset = eal.load_asset(path)
    if not isinstance(asset, u.Texture2D):
        raise RuntimeError("Missing screen-wall Texture2D " + path)
    asset.set_editor_property("srgb", name == "Colour")
    asset.set_editor_property("compression_settings", u.TextureCompressionSettings.TC_DEFAULT
                              if name == "Colour" else u.TextureCompressionSettings.TC_MASKS)
    asset.set_editor_property("address_x", u.TextureAddress.TA_WRAP)
    asset.set_editor_property("address_y", u.TextureAddress.TA_CLAMP)
    asset.set_editor_property("mip_gen_settings", u.TextureMipGenSettings.TMGS_FROM_TEXTURE_GROUP)
    eal.set_metadata_tag(asset, TAG, digest)
    if not eal.save_loaded_asset(asset, only_if_is_dirty=False):
        raise RuntimeError("Could not save " + path)
    return asset


def build(material, spec):
    uv = mel.create_material_expression(material, u.MaterialExpressionTextureCoordinate, -650, 0)
    uv.set_editor_property("coordinate_index", 0)
    for name, output, prop in (("Colour", "RGB", u.MaterialProperty.MP_BASE_COLOR),
                               ("Surface", "G", u.MaterialProperty.MP_ROUGHNESS)):
        sample = mel.create_material_expression(material, u.MaterialExpressionTextureSample, -400, 0 if name == "Colour" else 200)
        sample.set_editor_property("texture", texture(name))
        sample.set_editor_property("sampler_type", u.MaterialSamplerType.SAMPLERTYPE_COLOR
                                   if name == "Colour" else u.MaterialSamplerType.SAMPLERTYPE_MASKS)
        if not (mel.connect_material_expressions(uv, "", sample, "UVs")
                and mel.connect_material_property(sample, output, prop)):
            raise RuntimeError("Could not connect screen-wall " + name)


def check(material):
    for name, output, prop in (("Colour", "RGB", u.MaterialProperty.MP_BASE_COLOR),
                              ("Surface", "G", u.MaterialProperty.MP_ROUGHNESS)):
        sample = mel.get_material_property_input_node(material, prop)
        if not isinstance(sample, u.MaterialExpressionTextureSample):
            return False
        coordinates = [node for node in mel.get_inputs_for_material_expression(material, sample)
                       if isinstance(node, u.MaterialExpressionTextureCoordinate)]
        if (str(mel.get_material_property_input_node_output_name(material, prop)) != output
                or len(coordinates) != 1 or coordinates[0].get_editor_property("coordinate_index") != 0):
            return False
        asset = sample.get_editor_property("texture")
        if (not sampling_ok(asset, name) or asset.get_path_name().split(".")[0] != FOLDER + "/T_ScreenWall" + name
                or eal.get_metadata_tag(asset, TAG) != hashes()[name]):
            return False
    return True
