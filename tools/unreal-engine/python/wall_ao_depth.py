"""Actual source-depth-writing cloth geometry, in CustomDepth only (#2372).

Persistent SCS components, not transient Python-created actor components. The
imported mesh/materials remain untouched. Only our Generated assets/map are saved.
"""
import hashlib
from pathlib import Path

import unreal as u

DIR = '/Game/Lunden/Generated/Interaction/LivingWallAO'
PROXY = DIR+'/BP_WallAOClothDepth'
VISIBLE = DIR+'/BFL_WallAOClothVisibility'
MATERIAL = DIR+'/M_WallAOClothDepth'
TAG = 'lunden:wall-ao-cloth-depth'
UPDATE = 'UpdateProxyVisibility'
STAMP = 'Lunden.WallAOClothDepth'
MATERIAL_FLAGS = {'material_domain': u.MaterialDomain.MD_SURFACE,
                  'blend_mode': u.BlendMode.BLEND_OPAQUE, 'two_sided': True}
FLAGS = {'render_in_main_pass': False, 'render_in_depth_pass': False,
         'render_custom_depth': True, 'cast_shadow': False,
         'affect_distance_field_lighting': False, 'receives_decals': False,
         'visible_in_ray_tracing': False, 'affect_dynamic_indirect_lighting': False,
         'visible_in_reflection_captures': False, 'visible_in_real_time_sky_captures': False}


def _two_sided(material):
    while isinstance(material, u.MaterialInstance):
        overrides = material.get_editor_property('base_property_overrides')
        if overrides.get_editor_property('override_two_sided'):
            return bool(overrides.get_editor_property('two_sided'))
        material = material.get_editor_property('parent')
    return bool(material.get_editor_property('two_sided'))


def _component(bp):
    subsystem = u.get_engine_subsystem(u.SubobjectDataSubsystem)
    lib = u.SubobjectDataBlueprintFunctionLibrary
    for handle in subsystem.k2_gather_subobject_data_for_blueprint(bp):
        data = subsystem.k2_find_subobject_data_from_handle(handle)
        if data is not None and str(lib.get_variable_name(data)) == 'ClothDepth':
            return lib.get_object(data)
    return None


def assets():
    import build_wall_ao as ao
    import build_lighting
    import player_parts as pp
    stamp = hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n', b'\n')).hexdigest()
    mat = ao._asset(MATERIAL, u.Material, u.MaterialFactoryNew())
    if u.EditorAssetLibrary.get_metadata_tag(mat, STAMP) != stamp or any(mat.get_editor_property(k) != v for k, v in MATERIAL_FLAGS.items()):
        # No material expression is needed: only this two-sided opaque depth is drawn.
        for key, value in MATERIAL_FLAGS.items():
            mat.set_editor_property(key, value)
        errors = list(u.MaterialEditingLibrary.recompile_material(mat))
        if errors:
            raise RuntimeError('Cloth depth material compile failed: '+str(errors))
        u.EditorAssetLibrary.set_metadata_tag(mat, STAMP, stamp)
        ao._save(mat, stamp)
    factory = u.BlueprintFactory()
    factory.set_editor_property('parent_class', u.Actor)
    bp = ao._asset(PROXY, u.Blueprint, factory)
    template = _component(bp)
    if u.EditorAssetLibrary.get_metadata_tag(bp, STAMP) == stamp and template \
            and all(template.get_editor_property(k) == v for k, v in FLAGS.items()):
        return bp.generated_class(), mat
    if u.BlueprintEditorLibrary.find_graph(bp, UPDATE):
        events = u.BlueprintGraphEditor.get_graph_editor_by_name(bp, 'EventGraph')
        events.remove_nodes(list(events.list_all_nodes()))
        u.BlueprintEditorLibrary.remove_function_graph(bp, UPDATE)
    # Retire callers before rebuilding a warm function library (no transient errors).
    lib = ao._asset(VISIBLE, u.Blueprint, u.BlueprintFunctionLibraryFactory())
    if u.BlueprintEditorLibrary.find_graph(lib, 'PanelIsVisible'):
        u.BlueprintEditorLibrary.remove_function_graph(lib, 'PanelIsVisible')
    panel_type = u.BlueprintEditorLibrary.get_object_reference_type(u.StaticMeshActor.static_class())
    g, pins = pp.function(lib, 'PanelIsVisible', [('Panel', panel_type)], [('Visible', pp.BOOL)], pure=True)
    mesh = g.get('StaticMeshComponent', '/Script/Engine.StaticMeshActor', pins['Panel'])
    visible = g.op('BooleanAND', A=g.op('Not_PreBool', A=g.get('bHidden', '/Script/Engine.Actor', pins['Panel'])),
                   B=g.pure('SceneComponent:IsVisible', target=mesh))
    g.ret(Visible=visible)
    pp.compiled(lib)
    ao._save(lib, stamp)
    components = build_lighting.components(bp, {'ClothDepth': u.StaticMeshComponent})
    component = components['ClothDepth']
    for key, value in FLAGS.items():
        component.set_editor_property(key, value)
    component.set_editor_property('mobility', u.ComponentMobility.MOVABLE)
    component.set_collision_enabled(u.CollisionEnabled.NO_COLLISION)
    component.set_material(0, mat)
    pp.variables(bp, {'SourcePanel': panel_type})
    u.BlueprintEditorLibrary.set_blueprint_variable_instance_editable(bp, 'SourcePanel', True)
    g, _ = pp.function(bp, UPDATE)
    visible = g.pure(pp.class_path(VISIBLE)+':PanelIsVisible', result='Visible', Panel=g.get('SourcePanel'))
    g.run('SceneComponent:SetVisibility', target=g.get('ClothDepth'), bNewVisibility=visible, bPropagateToChildren=False)
    events = pp.events(bp)
    for event, name, y in [('AddEvent|EventBeginPlay', 'ReceiveBeginPlay', 0), ('AddEvent|EventTick', 'ReceiveTick', 500)]:
        pp.event(events, bp, event, name, y)
        events.run(pp.class_path(PROXY)+':'+UPDATE)
    pp.compiled(bp)
    u.EditorAssetLibrary.set_metadata_tag(bp, STAMP, stamp)
    ao._save(bp, stamp)
    return bp.generated_class(), mat


def sync_visibility(world):
    """Also mirror temporary editor visibility in our editor/capture integration."""
    for actor in u.GameplayStatics.get_all_actors_with_tag(world, TAG):
        panel = actor.get_editor_property('SourcePanel')
        if not isinstance(panel, u.StaticMeshActor):
            raise RuntimeError('Cloth depth proxy lost its actual source panel')
        actor.set_is_temporarily_hidden_in_editor(panel.is_hidden_ed())
        actor.call_method(UPDATE)


def inventory(world):
    """No other users may silently change the foreground buffer used by this pass."""
    import patio_tone
    certified_bulbs = patio_tone.depth_users(world)
    owned, foreign = [], []
    for actor in u.GameplayStatics.get_all_actors_of_class(world, u.Actor):
        for component in actor.get_components_by_class(u.PrimitiveComponent):
            if component.get_editor_property('render_custom_depth'):
                if component.get_path_name() in certified_bulbs:
                    continue
                (owned if TAG in [str(t) for t in actor.tags] else foreign).append(component.get_path_name())
    if foreign:
        raise RuntimeError('Wall AO CustomDepth conflicts with existing users: '+str(foreign))
    return owned


def validate(world, rows):
    expected = {node for row in rows for node in row['nodes']}
    actors = list(u.GameplayStatics.get_all_actors_with_tag(world, TAG))
    found = set()
    for actor in actors:
        panel = actor.get_editor_property('SourcePanel')
        if not isinstance(panel, u.StaticMeshActor):
            raise RuntimeError('Missing actual source cloth panel')
        node = str(actor.tags[1]) if len(actor.tags) == 2 else ''
        if node not in expected or node in found or node not in [str(t) for t in panel.tags]:
            raise RuntimeError('Unexpected/duplicate actual source cloth depth proxy')
        found.add(node)
        [component] = actor.get_components_by_class(u.StaticMeshComponent)
        source = panel.static_mesh_component
        root = actor.get_editor_property('root_component')
        material = component.get_material(0)
        if component.static_mesh != source.static_mesh or root.get_attach_parent() != source \
                or any(c.get_editor_property('relative_location') != u.Vector() or c.get_editor_property('relative_rotation') != u.Rotator() \
                       or c.get_editor_property('relative_scale3d') != u.Vector(1, 1, 1) for c in (root, component)) \
                or any(component.get_editor_property(key) != value for key, value in FLAGS.items()) \
                or component.get_collision_enabled() != u.CollisionEnabled.NO_COLLISION \
                or component.get_num_materials() != 1 or not material or material.get_path_name() != MATERIAL+'.'+MATERIAL.rsplit('/', 1)[1] \
                or any(material.get_editor_property(k) != v for k, v in MATERIAL_FLAGS.items()):
            raise RuntimeError('Actual cloth depth geometry/attachment/render flags differ: '+node)
    if found != expected:
        raise RuntimeError('Actual source cloth depth proxy set differs')
    owned = inventory(world)
    if len(owned) != len(expected):
        raise RuntimeError('Actual custom-depth component set differs')
    return {'panels': sorted(expected), 'ownedCustomDepthComponents': owned, 'foreignCustomDepthComponents': [],
            'renderFlags': FLAGS, 'twoSided': True, 'source': 'src/curtains.js MeshStandardMaterial depthWrite=true/DoubleSide',
            'runtimeVisibility': 'actual panel component visibility and Actor.bHidden; attached actual transform',
            'editorVisibility': 'temporary editor visibility synchronized by build/capture'}


def build(world, rows):
    """Only existing actual curtain meshes from canonical furnishing metadata."""
    # Current src/curtains.js sets depthWrite=true and DoubleSide for every row.
    cls, mat = assets()
    subsystem = u.get_editor_subsystem(u.EditorActorSubsystem)
    actors = list(subsystem.get_all_level_actors())
    by_id = {str(a.tags[0]): a for a in actors if a.tags}
    existing = {str(a.tags[1]): a for a in actors if len(a.tags) == 2 and str(a.tags[0]) == TAG}
    changed = False
    for row in rows:
        for node in row['nodes']:
            panel = by_id.get(node)
            if not isinstance(panel, u.StaticMeshActor):
                raise RuntimeError('Missing actual source curtain node: '+node)
            source = panel.static_mesh_component
            if source.get_num_materials() != 1 or source.get_material(0).get_name() != row['key'] \
                    or source.get_material(0).get_blend_mode() != u.BlendMode.BLEND_TRANSLUCENT \
                    or not _two_sided(source.get_material(0)):
                raise RuntimeError('Changed source cloth material contract: '+node)
            actor = existing.pop(node, None)
            if actor and actor.get_class() != cls:
                raise RuntimeError('Wrong cloth depth proxy class')
            if not actor:
                actor = subsystem.spawn_actor_from_class(cls, panel.get_actor_location())
                actor.tags = [u.Name(TAG), u.Name(node)]
                actor.set_actor_label(node+' source depth only')
                changed = True
            actor.set_editor_property('SourcePanel', panel)
            [component] = actor.get_components_by_class(u.StaticMeshComponent)
            component.set_static_mesh(source.static_mesh)
            component.set_material(0, mat)
            if not actor.attach_to_component(source, 'None', u.AttachmentRule.SNAP_TO_TARGET,
                                             u.AttachmentRule.SNAP_TO_TARGET, u.AttachmentRule.SNAP_TO_TARGET, False):
                raise RuntimeError('Could not attach actual cloth depth geometry')
            changed = True  # persisted mesh/attachment/SourcePanel instance properties
    for actor in existing.values():
        if not subsystem.destroy_actor(actor):
            raise RuntimeError('Could not retire stale cloth depth proxy')
        changed = True
    sync_visibility(world)
    validate(world, rows)
    return changed
