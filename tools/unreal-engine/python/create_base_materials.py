"""Lunden (#2245): create the hand-made base materials listed in tools/unreal-engine/material-map.json `materials`.

A minimal stub for the material-key mapping (#2246 owns the real look): each material is a plain opaque PBR material
with constant base colour, roughness and metallic. Existing materials are left untouched unless --force is given (then
they are rebuilt). Run headless:
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/run-python.ps1 tools/unreal-engine/python/create_base_materials.py [--force]
"""
import json
import os
import sys

import unreal

eal = unreal.EditorAssetLibrary
mel = unreal.MaterialEditingLibrary


def colour(hex_text):
    """An sRGB hex colour (as the web writes it) as a linear colour for a Constant3Vector."""
    v = hex_text.lstrip("#")
    def linear(c):
        c = int(c, 16) / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return unreal.LinearColor(linear(v[0:2]), linear(v[2:4]), linear(v[4:6]), 1.0)


def build(path, spec):
    folder, name = path.rsplit("/", 1)
    material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, unreal.Material, unreal.MaterialFactoryNew())
    base = mel.create_material_expression(material, unreal.MaterialExpressionConstant3Vector, -400, 0)
    base.set_editor_property("constant", colour(spec["baseColor"]))
    mel.connect_material_property(base, "", unreal.MaterialProperty.MP_BASE_COLOR)
    for prop, key, y in ((unreal.MaterialProperty.MP_ROUGHNESS, "roughness", 200), (unreal.MaterialProperty.MP_METALLIC, "metallic", 300)):
        c = mel.create_material_expression(material, unreal.MaterialExpressionConstant, -400, y)
        c.set_editor_property("r", float(spec[key]))
        mel.connect_material_property(c, "", prop)
    mel.recompile_material(material)
    eal.save_loaded_asset(material, only_if_is_dirty=False)
    return material


def main(argv):
    force = "--force" in argv
    root = os.path.normpath(os.path.join(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()), "..", ".."))
    with open(os.path.join(root, "tools", "unreal-engine", "material-map.json"), encoding="utf-8") as f:
        table = json.load(f)
    for path, spec in sorted(table["materials"].items()):
        if eal.does_asset_exist(path):
            if not force:
                unreal.log(f"LUNDEN_MATERIAL {path}: exists, kept")
                continue
            eal.delete_asset(path)
        build(path, spec)
        unreal.log(f"LUNDEN_MATERIAL {path}: created ({spec['baseColor']}, roughness {spec['roughness']}, metallic {spec['metallic']})")
    unreal.log("LUNDEN_MATERIALS_OK")


main(sys.argv[1:])
