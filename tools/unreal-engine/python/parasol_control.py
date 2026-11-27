"""#2403: source-owned canopy poses and automatic/manual fold state on the patio lamp.

The importer already tags each actual GLB part with its stable ID. Bind that ID,
never a material name, and use its unbaked local cone transform verified at build time.
"""
import math

FUNCTIONS = ('AdvanceParasol', 'UpdatePatioParasol', 'ToggleParasol')


def validate(rows):
    if not rows:
        return
    if len(rows) != 1:
        raise RuntimeError('The single patio string driver needs exactly one exported parasol')
    row = rows[0]
    if row['zone'] != 'l1007-uteplats' or not row['mesh'].startswith(row['id'] + '__'):
        raise RuntimeError('Parasol contract does not bind a patio GLB part')
    rule = row['rule']
    if (rule['sunComparison'], rule['overcastComparison'], rule['easing'], rule['first'], rule['manual']) != (
            '>', '<=', 'f*f*(3-2*f)', 'snap to target', 'holds until automatic state changes'):
        raise RuntimeError('Unsupported source parasol rule')
    if not rule['months'] or any(not 1 <= m <= 12 for m in rule['months']):
        raise RuntimeError('Invalid exported parasol months')
    for fraction, name in ((0, 'folded'), (1, 'opened')):
        pose = source_pose(row, fraction)
        if max(abs(a-b) for a,b in zip(pose['scale'], row[name]['scale'])) > 1e-8 or abs(pose['rotationX']-row[name]['rotationX']) > 1e-8:
            raise RuntimeError('Exported parasol endpoints differ from source rule')


def source_pose(row, fraction):
    e = fraction * fraction * (3 - 2 * fraction)
    r = row['rule']['radius'] + (row['radius'] - row['rule']['radius']) * e
    h = row['rule']['height'] + (row['rule']['openHeight'] - row['rule']['height']) * e
    return {'scale': [r, h, r], 'rotationX': row['tilt'] * e}


def validate_import(rows):
    """Read only: refuse baked/flattened transforms before building the live controller."""
    if not rows:
        return
    import unreal as u
    world = u.EditorLoadingAndSavingUtils.load_map('/Game/Lunden/Generated/l1007-uteplats/Level_l1007-uteplats')
    if not world:
        raise RuntimeError('Import the exported patio before building parasol lighting')
    actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
    for row in rows:
        found = [a for a in actors if row['mesh'] in [str(t) for t in a.tags]]
        if len(found) != 1:
            raise RuntimeError('Expected exactly one imported canopy tag: ' + row['mesh'])
        actor = found[0];parent = actor.get_attach_parent_actor();comp = actor.root_component
        if not parent or row['id'] not in [str(t) for t in parent.tags] or not isinstance(comp, u.StaticMeshComponent):
            raise RuntimeError('Parasol canopy must retain its actual furniture parent and mesh root')
        pose = source_pose(row, row['exportedOpen'])
        location = comp.get_editor_property('relative_location');scale = comp.get_editor_property('relative_scale3d');rotation = comp.get_editor_property('relative_rotation')
        expected_location = [100*row['position'][0], 100*row['position'][2], 100*row['position'][1]]
        expected_scale = [pose['scale'][0], pose['scale'][2], pose['scale'][1]]
        if max(abs(a-b) for a,b in zip((location.x,location.y,location.z),expected_location)) > .01 or max(abs(a-b) for a,b in zip((scale.x,scale.y,scale.z),expected_scale)) > 1e-5:
            raise RuntimeError('Imported canopy transform was baked or differs from the exported local cone')
        if max(abs(rotation.pitch),abs(rotation.yaw),abs(rotation.roll-math.degrees(pose['rotationX']))) > .001:
            raise RuntimeError('Imported canopy tilt does not match the source-to-Unreal local axis conversion')
        bounds = comp.static_mesh.get_bounding_box()
        # Unit source cone: apex0, baseY-1. Interchange converts metres to centimetres.
        expected_min,expected_max = [-100,-100,-100],[100,100,0]
        if max(abs(a-b) for a,b in zip((bounds.min.x,bounds.min.y,bounds.min.z),expected_min)) > .01 or max(abs(a-b) for a,b in zip((bounds.max.x,bounds.max.y,bounds.max.z),expected_max)) > .01:
            raise RuntimeError('Imported canopy is not the unbaked source unit-cone mesh')
        u.log('LUNDEN_PARASOL_IMPORT local cone/parent/pose verified: ' + row['mesh'])


def build(bp, rows, mpc, path):
    """Add functions; caller owns existing event graph, defaults, compile and save."""
    if not rows:
        return
    import unreal as u
    import player_parts as pp
    validate(rows);row=rows[0];rule=row['rule'];lib=u.BlueprintEditorLibrary
    for name in FUNCTIONS:
        if lib.find_graph(bp,name):lib.remove_function_graph(bp,name)
    pp.variables(bp, {'ParasolCanopy':lib.get_object_reference_type(u.Actor.static_class()),
                      'ParasolOpen':pp.REAL,'ParasolAuto':pp.BOOL,'ParasolReady':pp.BOOL,
                      'ParasolManual':pp.BOOL,'ParasolManualTarget':pp.BOOL,'ParasolManualAuto':pp.BOOL})
    lib.compile_blueprint(bp)
    default=u.get_default_object(bp.generated_class())
    for name,value in {'ParasolOpen':row['exportedOpen'],'ParasolAuto':False,'ParasolReady':False,'ParasolManual':False,'ParasolManualTarget':False,'ParasolManualAuto':False}.items():default.set_editor_property(name,value)
    me=pp.class_path(path)

    g,p=pp.function(bp,'AdvanceParasol',[('Elapsed',pp.REAL),('Month',pp.INT),('SunHeight',pp.REAL),('Overcast',pp.REAL),('First',pp.BOOL)])
    g.branch(g.pure('Actor:ActorHasTag',Tag='patio:string-driver'))
    missing=g.branch(g.pure('KismetSystemLibrary:IsValid',Object=g.get('ParasolCanopy')))
    # Resolve once. A missing streamed patio remains retryable; unrelated lamps do nothing.
    resolve=g.fork(missing,700)
    found=resolve.node_of('GameplayStatics:GetAllActorsWithTag',Tag=row['mesh']);items=pp.out(found,'OutActors')
    resolve.branch(resolve.op('EqualEqual_IntInt',A=resolve.pure('KismetArrayLibrary:Array_Length',TargetArray=items),B=1))
    resolve.set('ParasolCanopy',resolve.item(items,0))
    mesh=resolve.pure('Actor:GetComponentByClass',target=resolve.get('ParasolCanopy'),ComponentClass='/Script/Engine.StaticMeshComponent')
    resolve.run('SceneComponent:SetMobility',target=mesh,NewMobility='Movable')
    # The resolved branch joins before state changes; no duplicated mutation or map reload.
    joined=g.g.add_branch_node();g.at(joined);pp.link(g.exec,pp.inp(joined,'execute'));pp.link(resolve.exec,pp.inp(joined,'execute'));pp.feed(joined,'Condition',True);g.exec=pp.out(joined,'then')
    season=None
    for month in rule['months']:
        hit=g.op('EqualEqual_IntInt',A=p['Month'],B=month)
        season=hit if season is None else g.op('BooleanOR',A=season,B=hit)
    auto=g.op('BooleanAND',A=season,B=g.op('Greater_DoubleDouble',A=p['SunHeight'],B=rule['sunThreshold']))
    auto=g.op('BooleanAND',A=auto,B=g.op('LessEqual_DoubleDouble',A=p['Overcast'],B=rule['maxOvercast']))
    manual=g.op('BooleanAND',A=g.get('ParasolManual'),B=g.op('EqualEqual_BoolBool',A=auto,B=g.get('ParasolManualAuto')))
    g.set('ParasolManual',manual);g.set('ParasolAuto',auto)
    target=g.op('SelectFloat',A=g.op('SelectFloat',A=1,B=0,bPickA=g.get('ParasolManualTarget')),B=g.op('SelectFloat',A=1,B=0,bPickA=g.get('ParasolAuto')),bPickA=g.get('ParasolManual'))
    speed=g.op('SelectFloat',A=rule['manualSpeed'],B=rule['automaticSpeed'],bPickA=g.get('ParasolManual'))
    step=g.op('Multiply_DoubleDouble',A=p['Elapsed'],B=speed)
    higher=g.op('Greater_DoubleDouble',A=target,B=g.get('ParasolOpen'))
    signed=g.op('SelectFloat',A=step,B=g.op('Multiply_DoubleDouble',A=step,B=-1),bPickA=higher)
    moving=g.op('Add_DoubleDouble',A=g.get('ParasolOpen'),B=signed)
    advanced=g.op('SelectFloat',A=g.op('FMin',A=target,B=moving),B=g.op('FMax',A=target,B=moving),bPickA=higher)
    first=g.op('BooleanOR',A=p['First'],B=g.op('Not_PreBool',A=g.get('ParasolReady')))
    g.set('ParasolOpen',g.op('SelectFloat',A=target,B=advanced,bPickA=first));g.set('ParasolReady',True)
    f=g.get('ParasolOpen');e=g.op('Multiply_DoubleDouble',A=g.op('Multiply_DoubleDouble',A=f,B=f),B=g.op('Subtract_DoubleDouble',A=3,B=g.op('Multiply_DoubleDouble',A=2,B=f)))
    def mix(a,b):return g.op('Add_DoubleDouble',A=a,B=g.op('Multiply_DoubleDouble',A=b-a,B=e))
    radius=mix(rule['radius'],row['radius']);height=mix(rule['height'],rule['openHeight'])
    scale=g.op('MakeVector',X=radius,Y=radius,Z=height)
    rotation=g.op('MakeRotator',Roll=g.op('Multiply_DoubleDouble',A=math.degrees(row['tilt']),B=e),Pitch=0,Yaw=0)
    g.run('Actor:SetActorRelativeScale3D',target=g.get('ParasolCanopy'),NewRelativeScale=scale)
    g.run('Actor:K2_SetActorRelativeRotation',target=g.get('ParasolCanopy'),NewRelativeRotation=rotation,bSweep=False,bTeleport=True)

    g,p=pp.function(bp,'ToggleParasol')
    g.branch(g.pure('Actor:ActorHasTag',Tag='patio:string-driver'))
    current=g.op('BooleanOR',A=g.op('BooleanAND',A=g.get('ParasolManual'),B=g.get('ParasolManualTarget')),B=g.op('BooleanAND',A=g.op('Not_PreBool',A=g.get('ParasolManual')),B=g.get('ParasolAuto')))
    g.set('ParasolManualTarget',g.op('Not_PreBool',A=current));g.set('ParasolManualAuto',g.get('ParasolAuto'));g.set('ParasolManual',True)

    g,p=pp.function(bp,'UpdatePatioParasol',[('Elapsed',pp.REAL)])
    g.branch(g.pure('Actor:ActorHasTag',Tag='patio:string-driver'))
    def scalar(name):return g.pure('KismetMaterialLibrary:GetScalarParameterValue',Collection=mpc.get_path_name(),ParameterName=name)
    g.branch(g.op('GreaterEqual_DoubleDouble',A=scalar('Daylight'),B=0))
    month=g.op('FTrunc',A=scalar('Month'))
    sun=g.node_of('KismetMathLibrary:BreakColor',InColor=g.pure('KismetMaterialLibrary:GetVectorParameterValue',Collection=mpc.get_path_name(),ParameterName='SunDir'))
    g.run(me+':AdvanceParasol',Elapsed=p['Elapsed'],Month=month,SunHeight=pp.out(sun,'B'),Overcast=scalar('Overcast'),First=False)
    pp.compiled(bp)
