"""#2322: Generated-only source ShadePools display compositor and live lamp fades.

Invoked by build_rug_pool for exports with furnishing.displayPools. No import-time
writes. The real rug keeps its imported PBR; no depth-biased native overlay exists.
"""
import hashlib
import base64
import json
from pathlib import Path

import unreal as u
import collection_ids
import display_pools

DIR = '/Game/Lunden/Generated/Interaction/DisplayPools'
MPC = DIR+'/MPC_DisplayPools'
MATERIAL = DIR+'/M_DisplayPools'
LEVEL = '/Game/Lunden/Generated/Interaction/Level_l1007_interaction'
TAG = 'lunden:display-pools'
DRIVER = 'lunden:display-pool-driver'
STAMP = 'Lunden.DisplayPools'


def _asset(path, cls, factory):
    if u.EditorAssetLibrary.does_asset_exist(path):
        obj = u.EditorAssetLibrary.load_asset(path)
        if not isinstance(obj, cls):
            raise RuntimeError('Wrong asset type: '+path)
        return obj
    folder, name = path.rsplit('/', 1)
    return u.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, cls, factory)


def _save(obj, stamp):
    if not obj.get_path_name().startswith(DIR+'/'):
        raise RuntimeError('Display pool save outside owned Generated directory')
    u.EditorAssetLibrary.set_metadata_tag(obj, STAMP, stamp)
    if not u.EditorAssetLibrary.save_loaded_asset(obj, only_if_is_dirty=False):
        raise RuntimeError('Could not save '+obj.get_path_name())


def _collection(lamps):
    mpc = _asset(MPC, u.MaterialParameterCollection, u.MaterialParameterCollectionFactoryNew())
    entries = list(mpc.get_editor_property('scalar_parameters'))
    names = {str(p.get_editor_property('parameter_name')) for p in entries}
    changed = False
    for i in range(len(lamps)):
        name = 'Lamp'+str(i)
        if name not in names:
            entry = u.CollectionScalarParameter()
            entry.set_editor_property('parameter_name', name)
            entry.set_editor_property('default_value', 0.0)
            entries.append(entry)
            changed = True
    if changed:
        mpc.set_editor_property('scalar_parameters', entries)
        _save(mpc, 'preserve-existing-parameter-ids')
    return mpc


def _stamp(data, lamps):
    body = [data, display_pools.code(data), collection_ids.ids({MPC: ['Lamp'+str(i) for i in range(len(lamps))]}),
            Path(__file__).read_text(), Path(display_pools.__file__).read_text()]
    return hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()


def _graph_matches(mat, data, count):
    if not isinstance(mat, u.Material) or collection_ids.unresolved(mat):
        return False
    for prop, expected in (('material_domain', u.MaterialDomain.MD_POST_PROCESS),
                           ('blendable_location', u.BlendableLocation.BL_SCENE_COLOR_AFTER_TONEMAPPING),
                           ('blendable_priority', 20), ('disable_pre_exposure_scale', True), ('is_blendable', True)):
        if mat.get_editor_property(prop) != expected:
            return False
    custom = u.MaterialEditingLibrary.get_material_property_input_node(mat, u.MaterialProperty.MP_EMISSIVE_COLOR)
    if not isinstance(custom, u.MaterialExpressionCustom) or custom.get_editor_property('code') != display_pools.code(data):
        return False
    expected = ['Scene', 'WPos', 'Cam', 'N', 'Mask']+['Lamp'+str(i) for i in range(count)]
    names = list(u.MaterialEditingLibrary.get_material_expression_input_names(custom))
    nodes = list(u.MaterialEditingLibrary.get_inputs_for_material_expression(mat, custom))
    if names != expected or len(nodes) != len(expected) or any(n is None for n in nodes):
        return False
    pins = dict(zip(names, nodes))
    if len(u.MaterialEditingLibrary.get_material_expressions(mat)) != len(nodes)+1:
        return False
    for name, enum in (('Scene', u.SceneTextureId.PPI_POST_PROCESS_INPUT0), ('N', u.SceneTextureId.PPI_WORLD_NORMAL)):
        node = pins[name]
        if not isinstance(node, u.MaterialExpressionSceneTexture) or node.get_editor_property('scene_texture_id') != enum or node.get_editor_property('filtered'):
            return False
    if not isinstance(pins['WPos'], u.MaterialExpressionWorldPosition) or not isinstance(pins['Cam'], u.MaterialExpressionCameraPositionWS):
        return False
    if not isinstance(pins['Mask'], u.MaterialExpressionTextureObject) or pins['Mask'].get_editor_property('sampler_type') != u.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR:
        return False
    texture = pins['Mask'].get_editor_property('texture')
    mask_hash = hashlib.sha256(base64.b64decode(data['maskPng'], validate=True)).hexdigest()
    if texture is None or texture.get_path_name().split('.')[0] != '/Game/Lunden/Generated/Interaction/RugPool/T_RugPoolMask' \
            or texture.get_editor_property('srgb') \
            or u.EditorAssetLibrary.get_metadata_tag(texture, 'Lunden.RugPoolHash') != mask_hash:
        return False
    for i in range(count):
        node = pins['Lamp'+str(i)]
        if not isinstance(node, u.MaterialExpressionCollectionParameter) or node.get_editor_property('collection').get_path_name().split('.')[0] != MPC or str(node.get_editor_property('parameter_name')) != 'Lamp'+str(i):
            return False
    return True


def _material(data, lamps, mpc, stamp):
    mat = _asset(MATERIAL, u.Material, u.MaterialFactoryNew())
    if u.EditorAssetLibrary.get_metadata_tag(mat, STAMP) == stamp and _graph_matches(mat, data, len(lamps)):
        return mat
    # Reuse the original mask importer, including exact source bytes and linear sampler.
    from build_rug_pool import mask_texture
    texture = mask_texture(data)
    collection_ids.clear_graph(mat)
    for prop, value in (('material_domain', u.MaterialDomain.MD_POST_PROCESS),
                        ('blendable_location', u.BlendableLocation.BL_SCENE_COLOR_AFTER_TONEMAPPING),
                        ('blendable_priority', 20), ('disable_pre_exposure_scale', True), ('is_blendable', True)):
        mat.set_editor_property(prop, value)
    custom = u.MaterialEditingLibrary.create_material_expression(mat, u.MaterialExpressionCustom, 0, 0)
    names = ['Scene', 'WPos', 'Cam', 'N', 'Mask']+['Lamp'+str(i) for i in range(len(lamps))]
    inputs = []
    for name in names:
        pin = u.CustomInput()
        pin.set_editor_property('input_name', name)
        inputs.append(pin)
    custom.set_editor_property('inputs', inputs)
    custom.set_editor_property('code', display_pools.code(data))
    custom.set_editor_property('output_type', u.CustomMaterialOutputType.CMOT_FLOAT3)
    for i, name in enumerate(names):
        output = ''
        if name in ('Scene', 'N'):
            cls = u.MaterialExpressionSceneTexture
        elif name == 'WPos':
            cls, output = u.MaterialExpressionWorldPosition, 'XYZ'
        elif name == 'Cam':
            cls = u.MaterialExpressionCameraPositionWS
        elif name == 'Mask':
            cls = u.MaterialExpressionTextureObject
        else:
            cls = u.MaterialExpressionCollectionParameter
        node = u.MaterialEditingLibrary.create_material_expression(mat, cls, -500, i*100)
        if name in ('Scene', 'N'):
            node.set_editor_property('scene_texture_id', u.SceneTextureId.PPI_POST_PROCESS_INPUT0 if name == 'Scene' else u.SceneTextureId.PPI_WORLD_NORMAL)
            output = 'Color'
        elif name == 'Mask':
            node.set_editor_property('texture', texture)
            node.set_editor_property('sampler_type', u.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
        elif name.startswith('Lamp'):
            node.set_editor_property('collection', mpc)
            node.set_editor_property('parameter_name', name)
        if not u.MaterialEditingLibrary.connect_material_expressions(node, output, custom, name):
            raise RuntimeError('Could not connect display pool input '+name)
    if not u.MaterialEditingLibrary.connect_material_property(custom, '', u.MaterialProperty.MP_EMISSIVE_COLOR):
        raise RuntimeError('Could not connect display pool output')
    errors = list(u.MaterialEditingLibrary.recompile_material(mat))
    if errors:
        raise RuntimeError('DISPLAY_POOL_MATERIAL_COMPILE_FAILED: '+'; '.join(str(e) for e in errors))
    _save(mat, stamp)
    if not _graph_matches(mat, data, len(lamps)):
        raise RuntimeError('Saved display pool graph is incomplete')
    return mat


def _blueprint(path):
    factory = u.BlueprintFactory()
    factory.set_editor_property('parent_class', u.Actor)
    return _asset(path, u.Blueprint, factory)


def _postprocess(mat, stamp):
    import build_lighting
    import player_parts as pp
    bp = _blueprint(DIR+'/BP_DisplayPools')
    if u.EditorAssetLibrary.get_metadata_tag(bp, STAMP) != stamp:
        comp = build_lighting.components(bp, {'DisplayPools': u.PostProcessComponent})['DisplayPools']
        comp.set_editor_property('unbound', True)
        comp.set_editor_property('enabled', True)
        comp.set_editor_property('blend_weight', 1.0)
        settings = comp.get_editor_property('settings').copy()
        settings.set_editor_property('weighted_blendables', u.WeightedBlendables(array=[u.WeightedBlendable(weight=1.0, object=mat)]), u.PropertyAccessChangeNotifyMode.NEVER)
        comp.set_editor_property('settings', settings, u.PropertyAccessChangeNotifyMode.NEVER)
        pp.compiled(bp)
        _save(bp, stamp)
    # SCS component templates are not Actor.OwnedComponents on the class CDO.
    # Use the same actual-template lookup as build_lighting.window_bound.
    actual = None
    subsystem = u.get_engine_subsystem(u.SubobjectDataSubsystem)
    library = u.SubobjectDataBlueprintFunctionLibrary
    for handle in subsystem.k2_gather_subobject_data_for_blueprint(bp):
        data = subsystem.k2_find_subobject_data_from_handle(handle)
        if data is not None and str(library.get_variable_name(data)) == 'DisplayPools':
            actual = library.get_object(data)
    blends = actual.get_editor_property('settings').get_editor_property('weighted_blendables').array if actual else []
    if not actual or not actual.get_editor_property('unbound') or not actual.get_editor_property('enabled') \
            or actual.get_editor_property('blend_weight') != 1 or len(blends) != 1 or blends[0].object != mat or blends[0].weight != 1:
        raise RuntimeError('Generated display pool component drift')
    return bp.generated_class()


def _driver(stamp):
    import player_parts as pp
    path = DIR+'/BP_DisplayPoolDriver'
    bp = _blueprint(path)
    if u.EditorAssetLibrary.get_metadata_tag(bp, STAMP) == stamp:
        return bp.generated_class()
    events = u.BlueprintGraphEditor.get_graph_editor_by_name(bp, 'EventGraph')
    events.remove_nodes(list(events.list_all_nodes()))
    for method in ('FindLamp', 'UpdateDisplayPool'):
        if u.BlueprintEditorLibrary.find_graph(bp, method):
            u.BlueprintEditorLibrary.remove_function_graph(bp, method)
    lamp = u.EditorAssetLibrary.load_asset('/Game/Lunden/Lighting/BP_LundenLamp').generated_class()
    weather = u.EditorAssetLibrary.load_asset('/Game/Lunden/Lighting/MPC_LundenWeather')
    collection = u.EditorAssetLibrary.load_asset(MPC)
    if not isinstance(weather, u.MaterialParameterCollection) or not isinstance(collection, u.MaterialParameterCollection):
        raise RuntimeError('Display pool driver needs the real weather and Generated fade collections')
    visible = _visibility(stamp)
    pp.variables(bp, {'LampTag': pp.NAME, 'Parameter': pp.NAME,
                      'SourceLamp': u.BlueprintEditorLibrary.get_object_reference_type(lamp), 'AppliedFade': pp.REAL})
    for name in ('LampTag', 'Parameter'):
        u.BlueprintEditorLibrary.set_blueprint_variable_instance_editable(bp, name, True)
    g, _ = pp.function(bp, 'FindLamp')
    g.branch(g.op('Not_PreBool', A=g.pure('KismetSystemLibrary:IsValid', Object=g.get('SourceLamp'))))
    found = g.run('GameplayStatics:GetAllActorsWithTag', Tag=g.get('LampTag'))
    actors = pp.out(found, 'OutActors')
    g.branch(g.op('EqualEqual_IntInt', A=g.pure('KismetArrayLibrary:Array_Length', TargetArray=actors), B=1))
    source = g.cast(g.item(actors, 0), ['CastToActor', 'Cast To Actor'], u.Actor.static_class(), lamp)
    g.set('SourceLamp', source)
    g, _ = pp.function(bp, 'UpdateDisplayPool')
    g.run(pp.class_path(path)+':FindLamp')
    source = g.get('SourceLamp')
    missing = g.branch(g.pure('KismetSystemLibrary:IsValid', Object=source))
    supply = g.pure('KismetMaterialLibrary:GetScalarParameterValue', Collection=weather.get_path_name(), ParameterName='PowerAvailable')
    fade = g.op('Multiply_DoubleDouble', A=g.get('K', lamp.get_path_name(), source), B=supply)
    fade = g.op('SelectFloat', A=fade, B='0', bPickA=g.pure(visible, result='Visible', Lamp=source))
    def apply(graph, value):
        graph.set('AppliedFade', value)
        graph.run('KismetMaterialLibrary:SetScalarParameterValue', Collection=collection.get_path_name(),
                  ParameterName=graph.get('Parameter'), ParameterValue=graph.get('AppliedFade'))
    apply(g, fade)
    apply(g.fork(missing, 800), 0)
    g = pp.events(bp)
    pp.event(g, bp, 'AddEvent|EventBeginPlay', 'ReceiveBeginPlay', 0)
    g.run('Actor:SetActorTickInterval', TickInterval='.1')
    g.run(pp.class_path(path)+':UpdateDisplayPool')
    pp.event(g, bp, 'AddEvent|EventTick', 'ReceiveTick', 550)
    g.run(pp.class_path(path)+':UpdateDisplayPool')
    pp.compiled(bp)
    _save(bp, stamp)
    return bp.generated_class()


def _visibility(stamp):
    # A function library exposes the target actor pin of bHidden. In an Actor
    # graph Unreal's member-variable spawner otherwise binds this getter to self.
    import player_parts as pp
    path = DIR+'/BFL_DisplayPoolVisibility'
    bp = _asset(path, u.Blueprint, u.BlueprintFunctionLibraryFactory())
    if u.EditorAssetLibrary.get_metadata_tag(bp, STAMP) != stamp:
        if u.BlueprintEditorLibrary.find_graph(bp, 'IsVisible'):
            u.BlueprintEditorLibrary.remove_function_graph(bp, 'IsVisible')
        actor = u.BlueprintEditorLibrary.get_object_reference_type(u.Actor.static_class())
        g, pins = pp.function(bp, 'IsVisible', [('Lamp', actor)], [('Visible', pp.BOOL)], pure=True)
        g.ret(Visible=g.op('Not_PreBool', A=g.get('bHidden', '/Script/Engine.Actor', pins['Lamp'])))
        pp.compiled(bp)
        _save(bp, stamp)
    return pp.class_path(path)+':IsVisible'


def main(data):
    """Called only with the actual new source export; save only owned Generated assets."""
    order = display_pools.lamps(data)
    mpc = _collection(order)
    stamp = _stamp(data, order)
    mat = _material(data, order, mpc, stamp)
    pp_class = _postprocess(mat, stamp)
    driver_class = _driver(stamp)
    world = u.EditorLoadingAndSavingUtils.load_map(LEVEL)
    if not world:
        raise RuntimeError('Build the real apartment interaction level first')
    subsystem = u.get_editor_subsystem(u.EditorActorSubsystem)
    actors = list(subsystem.get_all_level_actors())
    by_tag = {str(t): a for a in actors for t in a.tags}
    changed = False
    # Retire the old pre-tonemap receiver contribution and preserve its exact import.
    for receiver in data.get('rugReceivers', []):
        actor = by_tag.get(receiver['mesh'])
        original = u.EditorAssetLibrary.load_asset('/Game/Lunden/Generated/l1007/Materials/'+receiver['key'])
        comp = actor.get_component_by_class(u.StaticMeshComponent) if actor else None
        if not comp or not original:
            raise RuntimeError('Missing actual rug import '+receiver['mesh'])
        if comp.get_material(0) != original:
            comp.set_material(0, original)
            changed = True
    for old in u.GameplayStatics.get_all_actors_with_tag(world, 'lunden:rug-floor-pool'):
        if not subsystem.destroy_actor(old):
            raise RuntimeError('Could not retire old pre-tonemap rug receiver')
        changed = True
    pools = u.GameplayStatics.get_all_actors_with_tag(world, TAG)
    if len(pools) > 1:
        raise RuntimeError('Duplicate display pool postprocess actor')
    if pools and pools[0].get_class() != pp_class:
        raise RuntimeError('Wrong display pool actor class')
    if not pools:
        actor = subsystem.spawn_actor_from_class(pp_class, u.Vector(0, 0, 0))
        actor.tags = [u.Name(TAG)]
        actor.set_actor_label('Source floor and ceiling display pools')
        changed = True
    drivers = {str(a.tags[1]): a for a in u.GameplayStatics.get_all_actors_with_tag(world, DRIVER)}
    for index, lamp in enumerate(order):
        actor = drivers.pop(lamp, None)
        if actor and actor.get_class() != driver_class:
            raise RuntimeError('Wrong display pool driver class')
        if not actor:
            actor = subsystem.spawn_actor_from_class(driver_class, u.Vector(0, 0, 0))
            actor.tags = [u.Name(DRIVER), u.Name(lamp)]
            actor.set_actor_label('Display pool fade: '+lamp)
            changed = True
        for name, value in (('LampTag', u.Name('lamp:'+lamp)), ('Parameter', u.Name('Lamp'+str(index)))):
            if actor.get_editor_property(name) != value:
                actor.set_editor_property(name, value)
                changed = True
    for old in drivers.values():
        if not subsystem.destroy_actor(old):
            raise RuntimeError('Could not remove retired display pool driver')
        changed = True
    if changed and not u.EditorLoadingAndSavingUtils.save_map(world, LEVEL):
        raise RuntimeError('Could not save Generated display pool actors')
    u.log(f'LUNDEN_DISPLAY_POOLS_OK {len(data["fields"])} source fields, {len(order)} lamps, changed={changed}')
