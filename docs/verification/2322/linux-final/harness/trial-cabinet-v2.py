"""Private #2322 four fixed existing-cabinet-MID radiance guesses; Root alone launches, no saves/builds.
--root NATIVE_ROOT --out FRESH_S_2322_FINAL_CHILD. Original crop/reference unchanged.
"""
import argparse
import json
import math
from pathlib import Path
import sys
from types import ModuleType
import unreal as u
S=Path('/home/devcontainers/.local/state/lunden-codex-20261127/2322-final')
_KEEP=[]
TRIALS=[('blue390',(7.35,4.95,3.9)),('blue420',(7.35,4.95,4.2)),
        ('green520-blue420',(7.35,5.2,4.2)),('red780-green520-blue420',(7.8,5.2,4.2))]
def load(name,path):
    m=ModuleType(name);m.__file__=str(path);sys.modules[name]=m;_KEEP.append(m)
    exec(compile(path.read_text(),str(path),'exec'),m.__dict__);return m
def write(path,data):path.write_text(json.dumps(data,indent=2,allow_nan=False)+'\n')
def vec(v):return [v.x,v.y,v.z]
def rgb(v):return [v.r,v.g,v.b]
def near(a,b):
    if max(abs(x-y) for x,y in zip(a,b))>1e-5:raise RuntimeError('Actual parameter mismatch: '+str((a,b)))
def main(argv):
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--reuse-current-world',action='store_true')
    args=p.parse_args(argv);root=args.root.resolve();out=args.out.resolve()
    if out.exists() or not out.is_relative_to(S) or out==S:raise RuntimeError('Fresh private child required')
    project=Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())).resolve()
    if project!=root/'unreal/Lunden':raise RuntimeError('Wrong actual project')
    sys.path[:0]=[str(root/'tools/unreal-engine/tests'),str(root/'tools/unreal-engine/python')]
    import capture_light,screenshot_level,prepare_nanite_materials
    helper=load('lunden2322_cabinet_verified_capture',S.parent/'2394/verify-production.py')
    probe=load('lunden2322_cabinet_shared_probe',S/'probe-after-production-v2.py')
    visibility=load('lunden2322_cabinet_visibility',S.parent/'2394/season-visibility-only.py')
    data=json.loads((project/'Import/measurements.json').read_text())
    row=next(r for r in data['lights'] if 'cabinetWashes' in r)
    original=u.load_asset('/Game/Lunden/Generated/l1007/Materials/'+row['cabinetWashes']['veneerKey'])
    base=u.MaterialEditingLibrary.get_material_instance_vector_parameter_value(original,'BaseColorFactor')
    world=(u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world() if args.reuse_current_world
           else u.EditorLoadingAndSavingUtils.load_map('/Game/Lunden/Maps/L_Lunden'))
    if not world or world.get_path_name()!='/Game/Lunden/Maps/L_Lunden.L_Lunden':raise RuntimeError('Expected exact actual full L_Lunden world')
    rig=capture_light.light_for(world)
    if not isinstance(rig,capture_light.MapLight):raise RuntimeError('Expected actual production sky')
    _KEEP.extend([world,rig])
    controllers=list(u.GameplayStatics.get_all_actors_with_tag(world,'lunden:cabinet-washes'))
    if len(controllers)!=5:raise RuntimeError('Expected exact five source wash controllers')
    owners=[a for a in controllers if len(a.get_editor_property('VeneerPanels'))]
    if len(owners)!=1 or len(owners[0].get_editor_property('VeneerPanels'))!=4:raise RuntimeError('Expected exact four-leaf owner')
    owner=owners[0];savednight=u.Vector(*vec(owner.get_editor_property('NightVeneer')))
    dayvector=vec(owner.get_editor_property('DayVeneer'));near(dayvector,[x*k for x,k in zip(rgb(base),(1.265,1.259,1.267))])
    for cmd in ('r.Shadow.Virtual.Enable 0','r.SeparateTranslucency 1','r.ShadowQuality 3','r.Shadow.MaxResolution 1024','r.Shadow.MaxCSMResolution 1024','r.Shadow.CSM.MaxCascades 3','r.Shadow.DistanceScale 1'):
        u.SystemLibrary.execute_console_command(world,cmd)
    count=0
    for path in u.EditorAssetLibrary.list_assets('/Game/Lunden/Generated',recursive=True,include_folder=False):
        if '/StaticMeshes/' not in path:continue
        mesh=u.EditorAssetLibrary.load_asset(path);settings=mesh.get_editor_property('nanite_settings') if isinstance(mesh,u.StaticMesh) else None
        if settings and settings.get_editor_property('enabled'):
            if args.reuse_current_world:raise RuntimeError('Reused actual world still has enabled Nanite mesh '+path)
            settings.set_editor_property('enabled',False);prepare_nanite_materials.static_mesh_editor().set_nanite_settings(mesh,settings,True);count+=1
    refs=json.loads((S.parent/'2394/runtime-web-env.json').read_text())['views']
    actors=list(u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors())
    excluded=[a for a in actors if 'kind:collision' in [str(t) for t in a.tags]]
    out.mkdir(parents=True);result={'completed':False,'scriptSha256':probe.digest(Path(__file__)),'naniteOffOnce':count,'reuseCurrentWorld':args.reuse_current_world,'world':world.get_path_name(),'dayVeneerUnchanged':dayvector,'sourceOriginalBase':rgb(base),'assumption':'four fixed actual existing-wash-MID radiance guesses only; source/veneer/endpoints/light/exposure/texture/UV preserved','trials':[]};write(out/'trials.json',result)
    fov=math.degrees(2*math.atan(math.tan(math.radians(72)/2)*640/360));mpc=u.load_asset('/Game/Lunden/Lighting/MPC_LundenWeather')
    def state(reference,lamps):
        hidden,season=helper.set_clock(rig,reference,lamps,capture_light,visibility)
        return hidden,helper.probe(world,rig,mpc,reference,data['site']['sky']['light']),season
    def render(label,hidden):
        camera=helper.render(screenshot_level,world,str(out),'unreal-'+label,u.Vector(250,820,162),u.Rotator(roll=0,pitch=-4,yaw=97),640,360,fov,capture_light.game_bias(rig.sky),excluded+hidden)
        return {'camera':camera,'imageSHA256':helper.png(out/('unreal-'+label+'.png'))}
    # Settle the actual production controllers first: their existing scalar-update
    # path creates the five real wash MIDs. Never parent a new MID to an MID.
    hidden,runtime,season=state(refs['evening22-clear'],True)
    mats=[]
    for actor in controllers:
        comp=actor.get_component_by_class(u.StaticMeshComponent);mid=comp.get_material(0)
        if not isinstance(mid,u.MaterialInstanceDynamic):raise RuntimeError('Expected existing actual production wash MID after settle')
        colour=mid.get_vector_parameter_value('Radiance')
        mats.append((comp,mid,rgb(colour),colour.a));_KEEP.append(mid)
    if len(mats)!=5:raise RuntimeError('Expected five real wash MIDs')
    original_radiance=(7.35,4.95,3.525)
    result['originalActualWashMID']=[{'component':c.get_path_name(),'Radiance':v} for c,m,v,a in mats]
    result['unchangedNightVeneer']=vec(savednight)
    write(out/'trials.json',result)
    try:
        for label,wash in TRIALS:
            actualwash=[]
            for comp,mid,colour,alpha in mats:
                if comp.get_material(0)!=mid:raise RuntimeError('Actual production wash MID replaced unexpectedly')
                wanted=[v*k/o for v,k,o in zip(colour,wash,original_radiance)]
                mid.set_vector_parameter_value('Radiance',u.LinearColor(*wanted,alpha));near(rgb(mid.get_vector_parameter_value('Radiance')),wanted)
                actualwash.append({'component':comp.get_path_name(),'material':mid.get_path_name(),'Radiance':wanted})
            hidden,runtime,season=state(refs['evening22-clear'],True)
            near(vec(owner.get_editor_property('NightVeneer')),vec(savednight))
            expected=[a+(b-a)*runtime['Daylight'] for a,b in zip(vec(savednight),dayvector)]
            actual=[]
            for panel in owner.get_editor_property('VeneerPanels'):
                m=panel.get_component_by_class(u.StaticMeshComponent).get_material(0)
                if not isinstance(m,u.MaterialInstanceDynamic):raise RuntimeError('Expected real veneer MID')
                colour=m.get_vector_parameter_value('BaseColorFactor');near(rgb(colour),expected)
                if abs(colour.a-base.a)>1e-6:raise RuntimeError('Original veneer alpha changed')
                actual.append({'actor':panel.get_path_name(),'BaseColorFactor':probe.value(colour)})
            result['trials'].append({'id':label,'WASH_RADIANCE':wash,'VENEER_NIGHT_FACTOR':(.755,.560,.155),
                'actualNightVeneerUnchanged':True,'runtime':runtime,'actualWash':actualwash,'actualVeneer':actual,**render(label,hidden)})
            write(out/'trials.json',result)
        hidden,dayruntime,_=state(refs['day14-clear'],False)
        if abs(dayruntime['Daylight']-1)>1e-6:raise RuntimeError('Day reference did not reach Daylight1')
        for panel in owner.get_editor_property('VeneerPanels'):
            near(rgb(panel.get_component_by_class(u.StaticMeshComponent).get_material(0).get_vector_parameter_value('BaseColorFactor')),dayvector)
        result['actualDayVeneerUnchanged']=True
        result['dayControl']={**render('day-control',hidden),'runtime':dayruntime}
        result['completed']=True;write(out/'trials.json',result);u.log('LUNDEN_2322_FIXED_CABINET_RADIANCE_TRIALS_OK')
    finally:
        restored=[]
        for comp,mid,colour,alpha in mats:
            mid.set_vector_parameter_value('Radiance',u.LinearColor(*colour,alpha))
            near(rgb(mid.get_vector_parameter_value('Radiance')),colour)
            restored.append({'component':comp.get_path_name(),'Radiance':rgb(mid.get_vector_parameter_value('Radiance'))})
        near(vec(owner.get_editor_property('NightVeneer')),vec(savednight))
        result['restoredOriginalNightVeneer']=vec(savednight);result['restoredOriginalWashRadiance']=restored
        write(out/'trials.json',result)
if __name__=='__main__':
    module=load('lunden2322_fixed_cabinet_radiance_trials_v2',Path(__file__));module.main(sys.argv[1:])
