"""#2322: explicit furnishing profile guesses on local Generated child instances.

This is a calibration, not a color-space repair or a derived physical constant.
Source sRGB textures, UVs, vertex color, opacity, roughness, geometry and every
unoverridden parameter remain inherited from the real imported material chain.
"""
import hashlib
import json
from pathlib import Path
import re

import unreal as u

DIR = '/Game/Lunden/Generated/Interaction/FurnishingProfile'
LEVEL = '/Game/Lunden/Generated/Interaction/Level_l1007_interaction'
STAMP = 'Lunden.FurnishingProfile'
# Initial bounded guesses from the locked #2322 before batch at lighting2788460c.
# Blue-grey native environment highlights are absent on the web's unprobed wood.
# Setting SpecularFactor=0 also drops direct glints: an explicit approximation.
PROFILES = {
    'wood': {'rgb': [1.22, 1.06, .81], 'specular': 0.0,
             'keys': [r'^std_c69c6d_r50_m0_tex_', r'^std_b06a32_r50_m0_tex_',
                      r'^std_c07a3e_r60_m0$', r'^std_cfb48d_r60_m0_tex_', r'^std_c0a47c_r70_m0_tex_']},
    'upholstery': {'rgb': [1.08, 1.06, .98], 'specular': None,
                   'keys': [r'^std_ffffff_r96_m0_vc_tex_']},
}
ASSUMPTION = ('guess: per-material profile calibration against fixed #2322 day/evening views; '
              'not an sRGB/UV/vertex-color correction. Wood specular suppression approximates '
              'the web unprobed environment and also removes direct specular glints. '
              'Linux conventional shadows3, Lumen off; Windows full-profile behavior unverified.')


def child(original, profile, name):
    base = u.MaterialEditingLibrary.get_material_instance_vector_parameter_value(original, 'BaseColorFactor')
    rgb = [a*b for a, b in zip((base.r, base.g, base.b), profile['rgb'])]
    path = DIR+'/MI_'+original.get_name()
    payload = [original.get_path_name(), [base.r, base.g, base.b, base.a], profile,
               Path(__file__).read_text()]
    stamp = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    if u.EditorAssetLibrary.does_asset_exist(path):
        mi = u.EditorAssetLibrary.load_asset(path)
        if not isinstance(mi, u.MaterialInstanceConstant):
            raise RuntimeError('Wrong furnishing profile child type '+path)
    else:
        folder, leaf = path.rsplit('/', 1)
        mi = u.AssetToolsHelpers.get_asset_tools().create_asset(leaf, folder, u.MaterialInstanceConstant, u.MaterialInstanceConstantFactoryNew())
    existing = u.MaterialEditingLibrary.get_material_instance_vector_parameter_value(mi, 'BaseColorFactor')
    matches = (mi.get_editor_property('parent') == original
               and max(abs(a-b) for a, b in zip((existing.r, existing.g, existing.b, existing.a), (*rgb, base.a))) < 1e-6)
    if profile['specular'] is not None:
        matches = matches and abs(u.MaterialEditingLibrary.get_material_instance_scalar_parameter_value(mi, 'SpecularFactor')-profile['specular']) < 1e-6
    if u.EditorAssetLibrary.get_metadata_tag(mi, STAMP) != stamp or not matches:
        u.MaterialEditingLibrary.set_material_instance_parent(mi, original)
        # This builder owns these children; retired overrides must not survive a
        # profile revision. Clearing the child's arrays leaves its parent intact.
        mi.set_editor_property('vector_parameter_values', [])
        mi.set_editor_property('scalar_parameter_values', [])
        u.MaterialEditingLibrary.set_material_instance_vector_parameter_value(mi, 'BaseColorFactor', u.LinearColor(*rgb, base.a))
        if profile['specular'] is not None:
            u.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(mi, 'SpecularFactor', profile['specular'])
        u.MaterialEditingLibrary.update_material_instance(mi)
        actual = u.MaterialEditingLibrary.get_material_instance_vector_parameter_value(mi, 'BaseColorFactor')
        if max(abs(a-b) for a, b in zip((actual.r, actual.g, actual.b, actual.a), (*rgb, base.a))) > 1e-6:
            raise RuntimeError('Could not apply furnishing profile base factor')
        if profile['specular'] is not None and abs(u.MaterialEditingLibrary.get_material_instance_scalar_parameter_value(mi, 'SpecularFactor')-profile['specular']) > 1e-6:
            raise RuntimeError('Could not apply furnishing profile specular approximation')
        u.EditorAssetLibrary.set_metadata_tag(mi, STAMP, stamp)
        u.EditorAssetLibrary.set_metadata_tag(mi, 'Lunden.Source', original.get_path_name())
        u.EditorAssetLibrary.set_metadata_tag(mi, 'Lunden.Assumption', ASSUMPTION+' Profile='+name)
        if not u.EditorAssetLibrary.save_loaded_asset(mi, only_if_is_dirty=False):
            raise RuntimeError('Could not save '+path)
    return mi


def main():
    world = u.EditorLoadingAndSavingUtils.load_map(LEVEL)
    if not world:
        raise RuntimeError('Build the actual apartment interaction level first')
    patterns = [(name, re.compile(pattern), profile) for name, profile in PROFILES.items() for pattern in profile['keys']]
    materials, counts, changed = {}, {}, False
    for actor in u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors():
        comp = actor.get_component_by_class(u.StaticMeshComponent)
        if not comp or not comp.static_mesh:
            continue
        # The StaticMesh retains its real import even when the component already
        # carries this profile. Re-running therefore never compounds the tint.
        for index, slot in enumerate(comp.static_mesh.static_materials):
            original = slot.material_interface
            if not isinstance(original, u.MaterialInstanceConstant) or not original.get_path_name().startswith('/Game/Lunden/Generated/l1007/Materials/'):
                continue
            entry = next(((name, profile) for name, pattern, profile in patterns if pattern.search(original.get_name())), None)
            if entry is None:
                continue
            name, profile = entry
            key = original.get_path_name()
            if key not in materials:
                materials[key] = child(original, profile, name)
            if comp.get_material(index) != materials[key]:
                comp.set_material(index, materials[key])
                changed = True
            counts[name] = counts.get(name, 0)+1
    if not counts.get('wood') or not counts.get('upholstery'):
        raise RuntimeError('Actual L1007 wood/upholstery profile receivers are missing')
    if changed and not u.EditorLoadingAndSavingUtils.save_map(world, LEVEL):
        raise RuntimeError('Could not save Generated furnishing profile assignments')
    u.log(f'LUNDEN_FURNISHING_PROFILE_OK guesses={counts}, changed={changed}')
