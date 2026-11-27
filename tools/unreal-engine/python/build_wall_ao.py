"""#2372: Generated-only ceiling-band source AO, composed by build_rug_pool.

Only named assets in DIR and the existing Generated interaction level may be saved.
Imported wall PBR, authored lighting and the web's source geometry are untouched.
"""
import hashlib
import json
from pathlib import Path

import unreal as u

import collection_ids
import wall_ao

DIR = '/Game/Lunden/Generated/Interaction/LivingWallAO'
MATERIAL = DIR+'/M_LivingWallCeilingAO'
BLUEPRINT = DIR+'/BP_LivingWallCeilingAO'
LEVEL = '/Game/Lunden/Generated/Interaction/Level_l1007_interaction'
TAG = 'lunden:living-wall-ceiling-ao'
STAMP = 'Lunden.LivingWallCeilingAO'
INPUTS = ('Scene', 'WPos', 'Cam')
PROPERTIES = {'material_domain': u.MaterialDomain.MD_POST_PROCESS,
              'blendable_location': u.BlendableLocation.BL_SCENE_COLOR_AFTER_TONEMAPPING,
              'blendable_priority': 10, 'disable_pre_exposure_scale': True, 'is_blendable': True}


def _asset(path, cls, factory):
    obj = u.EditorAssetLibrary.load_asset(path) if u.EditorAssetLibrary.does_asset_exist(path) else None
    if obj and not isinstance(obj, cls):
        raise RuntimeError('Wrong wall AO asset type: '+path)
    if obj:
        return obj
    folder, name = path.rsplit('/', 1)
    return u.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, cls, factory)


def _save(asset, stamp):
    if not asset or not asset.get_path_name().startswith(DIR+'/'):
        raise RuntimeError('Wall AO save escaped its Generated directory')
    u.EditorAssetLibrary.set_metadata_tag(asset, STAMP, stamp)
    if not u.EditorAssetLibrary.save_loaded_asset(asset, only_if_is_dirty=False):
        raise RuntimeError('Could not save '+asset.get_path_name())


def graph_matches(mat, data):
    if not isinstance(mat, u.Material) or any(mat.get_editor_property(k) != v for k, v in PROPERTIES.items()):
        return False
    mel = u.MaterialEditingLibrary
    node = mel.get_material_property_input_node(mat, u.MaterialProperty.MP_EMISSIVE_COLOR)
    if not isinstance(node, u.MaterialExpressionCustom) or node.get_editor_property('code') != wall_ao.code(data) \
            or node.get_editor_property('output_type') != u.CustomMaterialOutputType.CMOT_FLOAT3:
        return False
    names = list(mel.get_material_expression_input_names(node))
    sources = list(mel.get_inputs_for_material_expression(mat, node))
    if names != list(INPUTS) or len(sources) != 3 or any(s is None for s in sources) \
            or len(set(s.get_path_name() for s in sources)) != 3 \
            or {s.get_path_name() for s in mel.get_material_expressions(mat)} != {s.get_path_name() for s in [node, *sources]}:
        return False
    scene, position, camera = sources
    if not isinstance(scene, u.MaterialExpressionSceneTexture) \
            or scene.get_editor_property('scene_texture_id') != u.SceneTextureId.PPI_POST_PROCESS_INPUT0 \
            or scene.get_editor_property('filtered') \
            or not isinstance(position, u.MaterialExpressionWorldPosition) \
            or position.get_editor_property('world_position_shader_offset') != u.WorldPositionIncludedOffsets.WPT_DEFAULT \
            or not isinstance(camera, u.MaterialExpressionCameraPositionWS):
        return False
    for source, expected in zip(sources, ('Color', 'XYZ', '')):
        output = mel.get_input_node_output_name_for_material_expression(node, source)
        if isinstance(output, tuple):
            output = output[-1] if output and output[0] is not False else None
        if output != expected:
            return False
    return True


def _material(data, stamp):
    mat = _asset(MATERIAL, u.Material, u.MaterialFactoryNew())
    if u.EditorAssetLibrary.get_metadata_tag(mat, STAMP) == stamp and graph_matches(mat, data):
        return mat
    collection_ids.clear_graph(mat)
    for key, value in PROPERTIES.items():
        mat.set_editor_property(key, value)
    mel = u.MaterialEditingLibrary
    custom = mel.create_material_expression(mat, u.MaterialExpressionCustom, 0, 0)
    custom.set_editor_property('code', wall_ao.code(data))
    custom.set_editor_property('output_type', u.CustomMaterialOutputType.CMOT_FLOAT3)
    pins = []
    for name in INPUTS:
        pin = u.CustomInput()
        pin.set_editor_property('input_name', name)
        pins.append(pin)
    custom.set_editor_property('inputs', pins)
    for index, (name, cls, output) in enumerate(zip(INPUTS,
            (u.MaterialExpressionSceneTexture, u.MaterialExpressionWorldPosition, u.MaterialExpressionCameraPositionWS),
            ('Color', 'XYZ', ''))):
        node = mel.create_material_expression(mat, cls, -400, index*160)
        if name == 'Scene':
            node.set_editor_property('scene_texture_id', u.SceneTextureId.PPI_POST_PROCESS_INPUT0)
            node.set_editor_property('filtered', False)
        if name == 'WPos':
            node.set_editor_property('world_position_shader_offset', u.WorldPositionIncludedOffsets.WPT_DEFAULT)
        if not mel.connect_material_expressions(node, output, custom, name):
            raise RuntimeError('Could not connect wall AO '+name)
    if not mel.connect_material_property(custom, '', u.MaterialProperty.MP_EMISSIVE_COLOR):
        raise RuntimeError('Could not connect wall AO output')
    errors = list(mel.recompile_material(mat))
    if errors:
        raise RuntimeError('WALL_AO_COMPILE_FAILED: '+'; '.join(str(e) for e in errors))
    if not graph_matches(mat, data):
        raise RuntimeError('Wall AO material graph differs from actual source')
    _save(mat, stamp)
    return mat


def _component(bp):
    subsystem = u.get_engine_subsystem(u.SubobjectDataSubsystem)
    library = u.SubobjectDataBlueprintFunctionLibrary
    for handle in subsystem.k2_gather_subobject_data_for_blueprint(bp):
        data = subsystem.k2_find_subobject_data_from_handle(handle)
        if data is not None and str(library.get_variable_name(data)) == 'WallAO':
            return library.get_object(data)
    return None


def _bound(component, material):
    if not isinstance(component, u.PostProcessComponent) or not component.get_editor_property('enabled') \
            or not component.get_editor_property('unbound') or component.get_editor_property('blend_weight') != 1:
        return False
    blends = component.get_editor_property('settings').get_editor_property('weighted_blendables').array
    return len(blends) == 1 and blends[0].object == material and blends[0].weight == 1


def main(data):
    if data is None:
        # Optional older exports must not retain an actor from a newer AO sync.
        world = u.EditorLoadingAndSavingUtils.load_map(LEVEL)
        if not world:
            raise RuntimeError('Missing Generated level while retiring stale wall AO')
        actors = u.GameplayStatics.get_all_actors_with_tag(world, TAG)
        subsystem = u.get_editor_subsystem(u.EditorActorSubsystem)
        for actor in actors:
            if not subsystem.destroy_actor(actor):
                raise RuntimeError('Could not retire source AO absent from this export')
        if actors and not u.EditorLoadingAndSavingUtils.save_map(world, LEVEL):
            raise RuntimeError('Could not save retirement of stale Generated wall AO')
        return
    wall_ao.validate(data)
    stamp = hashlib.sha256(json.dumps(data, sort_keys=True).encode()+b''.join(
        Path(p).read_bytes().replace(b'\r\n', b'\n') for p in (__file__, wall_ao.__file__))).hexdigest()
    mat = _material(data, stamp)
    import build_lighting
    import player_parts as pp
    factory = u.BlueprintFactory()
    factory.set_editor_property('parent_class', u.Actor)
    bp = _asset(BLUEPRINT, u.Blueprint, factory)
    if u.EditorAssetLibrary.get_metadata_tag(bp, STAMP) != stamp or not _bound(_component(bp), mat):
        component = build_lighting.components(bp, {'WallAO': u.PostProcessComponent})['WallAO']
        for key, value in (('unbound', True), ('enabled', True), ('blend_weight', 1.0)):
            component.set_editor_property(key, value)
        settings = component.get_editor_property('settings').copy()
        settings.set_editor_property('weighted_blendables', u.WeightedBlendables(array=[u.WeightedBlendable(weight=1.0, object=mat)]), u.PropertyAccessChangeNotifyMode.NEVER)
        component.set_editor_property('settings', settings, u.PropertyAccessChangeNotifyMode.NEVER)
        pp.compiled(bp)
        if not _bound(_component(bp), mat):
            raise RuntimeError('Actual SCS wall AO template binding failed')
        _save(bp, stamp)
    world = u.EditorLoadingAndSavingUtils.load_map(LEVEL)
    if not world:
        raise RuntimeError('Build the actual Generated L1007 interaction level first')
    actors = u.GameplayStatics.get_all_actors_with_tag(world, TAG)
    if len(actors) > 1 or actors and actors[0].get_class() != bp.generated_class():
        raise RuntimeError('Unexpected existing wall AO actor')
    changed = False
    if not actors:
        actor = u.get_editor_subsystem(u.EditorActorSubsystem).spawn_actor_from_class(bp.generated_class(), u.Vector())
        actor.tags = [u.Name(TAG)]
        actor.set_actor_label('Source living-wall ceiling AO')
        changed = True
    else:
        actor = actors[0]
    components = actor.get_components_by_class(u.PostProcessComponent)
    if len(components) != 1 or not _bound(components[0], mat):
        raise RuntimeError('Actual level wall AO component differs from source template')
    if changed and not u.EditorLoadingAndSavingUtils.save_map(world, LEVEL):
        raise RuntimeError('Could not save Generated wall AO actor')
    u.log(f'LUNDEN_WALL_AO_OK {len(data["triangles"])} source triangles, changed={changed}')
