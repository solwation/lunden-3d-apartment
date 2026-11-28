"""Private Root-only NullRHI, unsaved Blueprint/MPC CPU propagation smoke.
No canonical builder main, save, world load, policy activation or GPU claim.
"""
from pathlib import Path
import hashlib, importlib.util, json, math, os, stat, subprocess, sys, traceback
_KEEP=[]
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def files(base): return {p.relative_to(base).as_posix():sha(p) for p in sorted(base.rglob('*')) if p.is_file()}
def authored(root):
    return {p.relative_to(root).as_posix():{'sha256':sha(p),'mode':stat.S_IMODE(p.stat().st_mode)} for p in (root/'unreal/Lunden/Content').rglob('*') if p.suffix in ('.uasset','.umap') and 'Generated' not in p.relative_to(root).parts}
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path); m=importlib.util.module_from_spec(spec)
    sys.modules[name]=m;_KEEP.append(m);spec.loader.exec_module(m);return m

def main(config_path=None):
    import unreal as u
    cp=Path(config_path or os.environ['LUNDEN_2424_CONTEXT_CONFIG']);c=json.loads(cp.read_text())
    root,source,out=map(Path,(c['root'],c['sourceRoot'],c['out']));out.mkdir()
    r={'completed':False,'passed':False,'configSHA256':sha(cp),'scope':'CPU Blueprint/MPC propagation only; no saved assets, GPU/render/global activation proof','states':[]}
    actor=None
    exercise_fill=c.get('exerciseFill') is True
    def write(): (out/'result.json').write_text(json.dumps(r,indent=2)+'\n')
    def guard():
        for path,head in ((root,c['head']),(source,c['sourceHead'])):
            if subprocess.check_output(['git','rev-parse','HEAD'],cwd=path,text=True).strip()!=head:raise RuntimeError('HEAD changed')
        if any(sha(p)!=h for p,h in c['dependenciesSHA256'].items()):raise RuntimeError('Dependencies changed')
        if authored(root)!=c['authored'] or any(v['mode']&0o222 for v in c['authored'].values()):raise RuntimeError('Authored bytes/modes guard')
        for relative,key in (('unreal/Lunden/Content/Lunden/Generated','generated'),('unreal/Lunden/Import','exportFiles')):
            if files(root/relative)!=c[key]:raise RuntimeError(key+' disk changed: no saves allowed')
    def near(actual,expected,name):
        if not math.isfinite(actual) or abs(actual-expected)>1e-5:raise RuntimeError(f'{name}: actual {actual}, expected {expected}')
    write()
    try:
        guard()
        # Reuse actual Native Graph/Expr/Chain and player_parts. Candidate is explicitly loaded uniquely.
        sys.path.insert(0,str(root/'tools/unreal-engine/python'))
        lighting=load('lunden2424_context_native_lighting',root/'tools/unreal-engine/python/build_lighting.py')
        candidate=load('lunden2424_context_candidate',source/'tools/unreal-engine/python/build_source_ambient.py')
        src=candidate.source
        if src.policy()['enabled'] is not False or candidate.guard(source) is not False:raise RuntimeError('Policy not OFF')
        measurements=json.loads((root/'unreal/Lunden/Import/measurements.json').read_text())
        contract=src.validate(measurements['site']['sourceAmbient'])
        sun_lux=lighting.SUN_LUX
        sun_clear=measurements['site']['sky']['light']['sunClear']
        factor=candidate.source_direct_units(sun_lux,sun_clear)
        world=u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
        if not world or world.get_path_name().startswith('/Game/'):raise RuntimeError('Require initial transient blank editor world')
        r['worldPath']=world.get_path_name()
        prefix=c['fixturePrefix']
        for p in (prefix+'/BP_Context',prefix+'/MPC_Context'):
            if u.EditorAssetLibrary.does_asset_exist(p):raise RuntimeError('Scratch asset path exists')
        mpc=lighting.create(prefix+'/MPC_Context',u.MaterialParameterCollection,u.MaterialParameterCollectionFactoryNew())
        for prop,typ,names,value in (('scalar_parameters',u.CollectionScalarParameter,src.MPC_SCALARS,0.),('vector_parameters',u.CollectionVectorParameter,src.MPC_VECTORS,u.LinearColor(0,0,0,1))):
            entries=[]
            for name in names:
                entry=typ();entry.set_editor_property('parameter_name',name);entry.set_editor_property('default_value',value);entries.append(entry)
            mpc.set_editor_property(prop,entries)
        bp=lighting.load_or_create_blueprint(prefix+'/BP_Context',u.Actor)
        lighting.variables(bp,{name:('real',0.) for name in (*candidate.CONTEXT_INPUTS,'RuntimeDay','RuntimeOvercast','RuntimeFlash')})
        if exercise_fill:
            candidate.prepare_fill(bp,lighting.components)
            lighting.variables(bp,{'RuntimeSunLux':('real',sun_lux),'RuntimeSunClear':('real',sun_clear)})
        graph=lighting.Graph(bp);event=graph.custom('UpdateSky');chain=lighting.Chain(event)
        expr=lighting.Expr(graph,{key:(graph.get(member),member) for key,member in (('day','RuntimeDay'),('oc','RuntimeOvercast'),('flash','RuntimeFlash'))})
        if exercise_fill:
            expr.env.update({n:(graph.get('Runtime'+n),'Runtime'+n) for n in ('SunLux','SunClear')})
            expr.run('sourceDirectUnits = SunLux / SunClear')
        candidate.sky_parameters(graph,expr,chain,mpc,contract,lighting.constant,lighting.connect,
                                 active=exercise_fill,direct_units=expr.env.get('sourceDirectUnits'))
        u.BlueprintEditorLibrary.compile_blueprint(bp)
        candidate.context_function(bp);u.BlueprintEditorLibrary.compile_blueprint(bp)
        _KEEP.extend((lighting,candidate,src,world,mpc,bp,graph,expr,chain))
        actors=u.get_editor_subsystem(u.EditorActorSubsystem)
        actor=actors.spawn_actor_from_class(bp.generated_class(),u.Vector(0,0,0))
        if not actor:raise RuntimeError('Scratch actor not spawned')
        _KEEP.append(actor)
        states=[dict(day=1.,overcast=0.,dim=0.,under=0.,flash=0.,garage_lit=0.),dict(day=.25,overcast=.7,dim=.3,under=.5,flash=.2,garage_lit=.4),dict(day=.25,overcast=.7,dim=.3,under=.5,flash=0.,garage_lit=.4)]
        for state in states:
            for member,key in (('RuntimeDay','day'),('RuntimeOvercast','overcast'),('RuntimeFlash','flash')):actor.set_editor_property(member,state[key])
            actor.call_method('SetSourceAmbientContext',tuple(state[k] for k in ('dim','under','garage_lit')))
            expected=src.uniforms(contract,**state)
            clear=state['day']*(1-state['overcast'])*(1-state['under'])
            scalar_expected={'SourceAmbientIntensity':expected['ambientIntensity'],'SourceHemiIntensity':expected['hemiIntensity'],'SourceFillIntensity':expected['fillIntensity'],'SourceDayShare':state['day']*(1-state['under']),'SourceWindowSkyStrength':(contract['overcast']['hemi']+(contract['clear']['hemi']-contract['overcast']['hemi'])*clear)*state['day']*(1-state['under'])*(1-.3*state['overcast'])}
            vector_expected={'SourceAmbientColor':contract['colors']['ambient'],'SourceHemiSky':expected['skyColor'],'SourceHemiGround':contract['colors']['ground'],'SourceFillColor':expected['fillColor'],'SourceFillDirection':[expected['fillDirection'][i] for i in (0,2,1)]}
            actual_s={n:float(u.MaterialLibrary.get_scalar_parameter_value(world,mpc,n)) for n in src.MPC_SCALARS}
            actual_v={}
            for n in src.MPC_VECTORS:
                color=u.MaterialLibrary.get_vector_parameter_value(world,mpc,n);actual_v[n]=[float(getattr(color,ch)) for ch in 'rgb']
            row={'input':state,'actualScalars':actual_s,'expectedScalars':scalar_expected,'actualVectors':actual_v,'expectedVectors':vector_expected,'actualContext':{n:float(actor.get_editor_property(n)) for n in candidate.CONTEXT_INPUTS}}
            r['states'].append(row);write()
            for n,e in scalar_expected.items():near(actual_s[n],e,n)
            near(actual_s['SourceAmbientEnabled'],1. if exercise_fill else 0.,'SourceAmbientEnabled')
            for n,e in vector_expected.items():
                for i in range(3):near(actual_v[n][i],e[i],n+str(i))
            for n,key in zip(candidate.CONTEXT_INPUTS,('dim','under','garage_lit')):near(row['actualContext'][n],state[key],n)
            if exercise_fill:
                lights=list(actor.get_components_by_class(u.DirectionalLightComponent))
                if len(lights)!=1:raise RuntimeError('Exactly one scratch SourceFill required')
                fill=lights[0];f=fill.get_forward_vector();color=fill.get_light_color()
                flags={n:bool(fill.get_editor_property(n)) for n in ('atmosphere_sun_light','cast_shadows','cast_volumetric_shadow','cast_shadows_on_clouds','cast_shadows_on_atmosphere')}
                actual={'intensity':float(fill.get_editor_property('intensity')),'color':[float(getattr(color,ch)) for ch in 'rgb'],
                        'forward':[float(f.x),float(f.y),float(f.z)],'flags':flags,
                        'volumetricScattering':float(fill.get_editor_property('volumetric_scattering_intensity'))}
                row['fill']=actual;row['directUnits']={'SunLux':sun_lux,'SunClear':sun_clear,'ratio':factor};write()
                near(actual['intensity'],expected['fillIntensity']*factor,'Actual SourceFill intensity')
                for i in range(3):
                    near(actual['color'][i],expected['fillColor'][i],'Actual SourceFill colour'+str(i))
                    near(actual['forward'][i],-expected['fillDirection'][(0,2,1)[i]],'Actual SourceFill forward'+str(i))
                if any(flags.values()):raise RuntimeError('SourceFill atmosphere/shadow flags enabled')
                near(actual['volumetricScattering'],0.,'SourceFill volumetric scattering')
            row['passed']=True
        r.update(assertionsPassed=True,sourcePolicyEnabled=False,exerciseFill=exercise_fill,scratchPaths=[prefix+'/BP_Context',prefix+'/MPC_Context'])
    except BaseException:
        r['error']=traceback.format_exc();raise
    finally:
        try:
            if actor is not None:
                if not u.get_editor_subsystem(u.EditorActorSubsystem).destroy_actor(actor):raise RuntimeError('Scratch actor cleanup failed')
                r['scratchActorDestroyed']=True
            guard();r['diskAndSourceGuardsPassed']=True
            r['completed']=True;r['passed']=bool(r.get('assertionsPassed') and not r.get('error'))
            write()
        except BaseException:
            r['cleanupError']=traceback.format_exc();write();raise
    u.log('LUNDEN_2424_LIVE_CONTEXT_SMOKE_OK')

if __name__=='__main__':load('lunden2424_context_fill_retained_entry',Path(__file__)).main()
