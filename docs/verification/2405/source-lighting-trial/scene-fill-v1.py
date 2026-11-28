"""Private unsaved source Fill for already-loaded L_Lunden, no canonical activation.
prepare(world,c,out) -> set_enabled(bool), restore(), mutable JSON report.
Only source-ambient mode may enable this GLOBAL shadowless direct light.
Caller owns world/profile/disk guards, source-reference provenance and try/finally.
"""
from pathlib import Path
import hashlib,importlib.util,json,math,subprocess,sys
KEEP=[]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec)
    sys.modules[name]=m;KEEP.append(m);spec.loader.exec_module(m);return m

def prepare(world,c,out):
    import unreal as u
    root,source=Path(c['root']),Path(c['sourceRoot'])
    if world.get_path_name()!='/Game/Lunden/Maps/L_Lunden.L_Lunden':raise RuntimeError('Actual L_Lunden required')
    for path,head in ((root,c['nativeHead']),(source,c['sourceHead'])):
        if subprocess.check_output(['git','rev-parse','HEAD'],cwd=path,text=True).strip()!=head:raise RuntimeError('SourceFill source HEAD drift')
    native_dir=root/'tools/unreal-engine/python';source_dir=source/'tools/unreal-engine/python'
    if (native_dir/'source_ambient.py').read_bytes()!=(source_dir/'source_ambient.py').read_bytes():raise RuntimeError('SourceFill oracle differs from Native')
    sys.path.insert(0,str(native_dir))
    lighting=load('private2424_scene_fill_native_lighting',native_dir/'build_lighting.py')
    candidate=load('private2424_scene_fill_candidate',source_dir/'build_source_ambient.py')
    src=candidate.source
    if src.policy()['enabled']is not False or candidate.guard(source)is not False:raise RuntimeError('Global SourceAmbient must remain OFF')
    contract=src.validate(json.loads((root/'unreal/Lunden/Import/measurements.json').read_text())['site']['sourceAmbient'])
    actors=u.get_editor_subsystem(u.EditorActorSubsystem)
    roster=lambda:sorted(a.get_path_name()for a in actors.get_all_level_actors())
    before_roster=roster()
    skies=[a for a in actors.get_all_level_actors() if a.get_class().get_path_name()=='/Game/Lunden/Lighting/BP_LundenSky.BP_LundenSky_C']
    if len(skies)!=1:raise RuntimeError('Exactly one actual Native sky required')
    sky=skies[0];sun_lux=float(sky.get_editor_property('SunLux'));sun_clear=float(sky.get_editor_property('SunClear'))
    factor=candidate.source_direct_units(sun_lux,sun_clear)
    ref=c['sourceReference']
    if ref['date']!=[2026,6,21] or ref['hour']!=14 or any(float(ref[k])!=v for k,v in (('dayShare',1),('overcast',0),('dim',0),('under',0))):raise RuntimeError('Only actual frozen outdoor June21/14 source reference supported')
    if float(sky.get_editor_property('Flash'))!=0 or float(ref.get('flash',0))!=0:raise RuntimeError('Only actual no-flash outdoor premise supported')
    state={'day':float(ref['dayShare']),'overcast':float(ref['overcast']),'dim':float(ref['dim']),'under':float(ref['under']),'flash':0.,'garage_lit':0.}
    expected=src.uniforms(contract,**state)
    if abs(float(ref['fill'])-expected['fillIntensity'])>1e-6 or max(abs(float(x)-y)for x,y in zip(ref['fillRgb'],expected['fillColor']))>1e-6:raise RuntimeError('Actual source Fill reference mismatch')
    report={'scope':'GLOBAL transient source Directional Fill during only source-ambient frame; no canonical policy activation',
            'sourceHead':c['sourceHead'],'nativeHead':c['nativeHead'],'sourceReference':ref,'uniformInputs':state,
            'fixedPremise':'Actual outdoor June21/14 clear source reference: dim0/under0, Flash0, garage_lit0. Not a general context producer.',
            'sourceFormula':'source.uniforms.fillIntensity * actualNativeSky.SunLux / actualNativeSky.SunClear',
            'nativeSun':{'actor':sky.get_path_name(),'SunLux':sun_lux,'SunClear':sun_clear,'ratio':factor},
            'sourceUniforms':expected,'preExposure':'No manual preExposure or exposure gain; real component uses existing native direct-light units',
            'noDoubleFill':'Glass helper must not add Fill itself; shared kernel retains source window Fill subtraction. Existing native scene light unchanged.',
            'sourcePolicyEnabled':False,'history':[],'restored':False}
    actor=None
    def near(a,b,name):
        if not math.isfinite(a)or abs(a-b)>1e-5:raise RuntimeError(name+f': {a} != {b}')
    def snapshot(enabled):
        light=actor.get_components_by_class(u.DirectionalLightComponent)
        if len(light)!=1:raise RuntimeError('Exactly one own SourceFill component required')
        light=light[0];color=light.get_light_color();forward=light.get_forward_vector()
        actual={'enabled':enabled,'actor':actor.get_path_name(),'component':light.get_path_name(),
                'intensity':float(light.get_editor_property('intensity')),'color':[float(getattr(color,k))for k in'rgb'],
                'forward':[float(forward.x),float(forward.y),float(forward.z)],
                'flags':{n:bool(light.get_editor_property(n))for n in('atmosphere_sun_light','cast_shadows','cast_volumetric_shadow','cast_shadows_on_clouds','cast_shadows_on_atmosphere')},
                'volumetricScattering':float(light.get_editor_property('volumetric_scattering_intensity'))}
        near(actual['intensity'],expected['fillIntensity']*factor if enabled else 0.,'Actual Fill intensity')
        if any(actual['flags'].values()):raise RuntimeError('Own SourceFill has atmosphere/shadows')
        near(actual['volumetricScattering'],0.,'Own Fill volumetric')
        if enabled:
            for i in range(3):
                near(actual['color'][i],expected['fillColor'][i],'Own Fill color')
                near(actual['forward'][i],-expected['fillDirection'][(0,2,1)[i]],'Own Fill forward')
        report['history'].append(actual);return actual
    def restore():
        nonlocal actor
        if actor is not None:
            actor.get_components_by_class(u.DirectionalLightComponent)[0].set_intensity(0.)
            if not actors.destroy_actor(actor):raise RuntimeError('Cannot destroy own SourceFill actor')
            actor=None
        if roster()!=before_roster:raise RuntimeError('SourceFill actor roster not restored')
        report['restored']=True;report['actorRosterExact']=True;return report
    try:
        # Unique unsaved packages only. No imported graph/instance/global MPC is modified.
        prefix='/Game/Lunden/Generated/SourceAmbientSceneFill/Trial_'+hashlib.sha256(str(out).encode()).hexdigest()[:16]
        for path in(prefix+'/MPC_Fill',prefix+'/BP_Fill'):
            if u.EditorAssetLibrary.does_asset_exist(path):raise RuntimeError('Own unsaved SourceFill prefix collision')
        mpc=lighting.create(prefix+'/MPC_Fill',u.MaterialParameterCollection,u.MaterialParameterCollectionFactoryNew())
        for prop,typ,names,value in(('scalar_parameters',u.CollectionScalarParameter,src.MPC_SCALARS,0.),('vector_parameters',u.CollectionVectorParameter,src.MPC_VECTORS,u.LinearColor(0,0,0,1))):
            entries=[]
            for name in names:
                e=typ();e.set_editor_property('parameter_name',name);e.set_editor_property('default_value',value);entries.append(e)
            mpc.set_editor_property(prop,entries)
        bp=lighting.load_or_create_blueprint(prefix+'/BP_Fill',u.Actor)
        candidate.prepare_fill(bp,lighting.components)
        lighting.variables(bp,{**{n:('real',0.)for n in candidate.CONTEXT_INPUTS},'RuntimeDay':('real',state['day']),'RuntimeOvercast':('real',state['overcast']),'RuntimeFlash':('real',state['flash']),'RuntimeSunLux':('real',sun_lux),'RuntimeSunClear':('real',sun_clear)})
        graph=lighting.Graph(bp);chain=lighting.Chain(graph.custom('UpdateSky'))
        expr=lighting.Expr(graph,{key:(graph.get(member),member)for key,member in(('day','RuntimeDay'),('oc','RuntimeOvercast'),('flash','RuntimeFlash'),('SunLux','RuntimeSunLux'),('SunClear','RuntimeSunClear'))})
        expr.run('sourceDirectUnits = SunLux / SunClear')
        candidate.sky_parameters(graph,expr,chain,mpc,contract,lighting.constant,lighting.connect,active=True,direct_units=expr.env['sourceDirectUnits'])
        u.BlueprintEditorLibrary.compile_blueprint(bp);candidate.context_function(bp);u.BlueprintEditorLibrary.compile_blueprint(bp)
        actor=actors.spawn_actor_from_class(bp.generated_class(),u.Vector(0,0,0))
        if not actor:raise RuntimeError('Own SourceFill actor spawn failed')
        report['privateAssets']={'blueprint':bp.get_path_name(),'MPC':mpc.get_path_name(),'saved':False}
        def set_enabled(enabled):
            if type(enabled)is not bool:raise TypeError('SourceFill mode must be bool')
            if report['restored']:raise RuntimeError('Own SourceFill already destroyed')
            if float(sky.get_editor_property('SunLux'))!=sun_lux or float(sky.get_editor_property('SunClear'))!=sun_clear:raise RuntimeError('Native direct-light conversion changed')
            if enabled:actor.call_method('SetSourceAmbientContext',(state['dim'],state['under'],state['garage_lit']))
            else:actor.get_components_by_class(u.DirectionalLightComponent)[0].set_intensity(0.)
            return snapshot(enabled)
        set_enabled(False)
        KEEP.extend((lighting,candidate,src,bp,mpc,graph,expr,chain,actor,sky))
        return set_enabled,restore,report
    except BaseException:
        restore();raise
