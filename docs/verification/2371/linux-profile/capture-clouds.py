"""Private #2371: existing production sky, actual Blueprint wind events and three START views.
Root owns launch, runtime source, editor reservation and external authored-byte/read-only guards.
No builder without --check, no asset save, no private lighting/MID, no shader or exposure overrides.
Direct ReceiveTick dispatch verifies the real compiled graph; it is explicitly not a PIE-timing test.
"""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import subprocess
import sys
from types import ModuleType
import unreal as u

STATE = Path('/home/devcontainers/.local/state/lunden-codex-20261127')
_KEEP = []

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    _KEEP.append(module)
    return module

def write(path, value):
    path.write_text(json.dumps(value, indent=2, allow_nan=False)+'\n')

def state(world, sky, mpc):
    scalar = lambda name: float(u.MaterialLibrary.get_scalar_parameter_value(world, mpc, name))
    vector = lambda name: u.MaterialLibrary.get_vector_parameter_value(world, mpc, name)
    sun, moon, ph = vector('SunDir'), vector('MoonDir'), vector('MoonPh')
    return {'year':int(sky.get_editor_property('Year')), 'month':int(sky.get_editor_property('Month')),
            'day':int(sky.get_editor_property('Day')), 'hour':float(sky.get_editor_property('Hour')),
            'sun':[sun.r,sun.g,sun.b], 'moon':[moon.r,moon.g,moon.b],
            'night':scalar('Night'), 'moonPh':[ph.r,ph.g,ph.b],
            'cloudCover':scalar('CloudCover'), 'cloudCoverage':scalar('CloudCoverage'),
            'skyThreshold':scalar('SkyThreshold'), 'overcast':scalar('Overcast'),
            'duskLight':scalar('DuskLight'),
            'offset':[scalar('CloudOffsetX'),scalar('CloudOffsetY')]}

def main(argv):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--expected-source',required=True)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args(argv)
    root,out=args.root.resolve(),args.out.resolve()
    if not out.is_relative_to(STATE/'2371') or (out.exists() and any(out.iterdir())):
        raise RuntimeError('Use a fresh private S/2371 output directory')
    if Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())).resolve()!=root/'unreal/Lunden':
        raise RuntimeError('Wrong actual native project')
    revision=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD']).decode().strip()
    if revision!=args.expected_source: raise RuntimeError('Native source changed before capture')
    sys.path[:0]=[str(root/'tools/unreal-engine/python'),str(root/'tools/unreal-engine/tests')]
    import build_lighting
    import capture_light
    import screenshot_level
    import prepare_nanite_materials
    helpers=load('lunden2371_verified_capture',STATE/'2394/verify-production.py')
    visibility=load('lunden2371_visibility',STATE/'2394/season-visibility-only.py')
    measurements=root/'unreal/Lunden/Import/measurements.json'
    # Read-only check: reject stale graph/material/MPC and never rebuild Lighting here.
    build_lighting.main([str(measurements),'--check'])
    world=u.EditorLoadingAndSavingUtils.load_map('/Game/Lunden/Maps/L_Lunden')
    if not world: raise RuntimeError('Missing real composed world')
    rig=capture_light.light_for(world)
    if not isinstance(rig,capture_light.MapLight):raise RuntimeError('Expected real production map lighting')
    _KEEP.extend([world,rig])
    mpc=u.load_asset('/Game/Lunden/Lighting/MPC_LundenWeather')
    material=u.load_asset('/Game/Lunden/Lighting/M_LundenPrecipitation')
    weather,blends=helpers.weather_component(rig.sky,material)
    _KEEP.extend([mpc,material,weather])
    out.mkdir(parents=True)
    result={'completed':False,'revision':revision,'measurementSHA256':sha(measurements),
            'sourceSha256':{str(p):sha(p) for p in [Path(__file__),Path(build_lighting.__file__),
                Path(screenshot_level.__file__),Path(capture_light.__file__),Path(helpers.__file__),Path(visibility.__file__)]},
            'profile':'Actual delivered Linux development CVars recorded; no full Windows claim',
            'weatherComponent':weather.get_path_name(),'blendables':[{'path':o.get_path_name(),'weight':w} for w,o in blends],
            'functionalMode':'Actual compiled BP_LundenSky.ReceiveTick explicit dt dispatch, not PIE wall-clock timing',
            'sun':[],'weather':[],'cloudDrift':[],'shots':[]}
    write(out/'capture.json',result)
    actors=list(u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors())
    excluded=[a for a in actors if 'kind:collision' in map(str,a.tags)]
    # Existing Linux capture contract, transient only. Root wraps exact authored-byte guards.
    for setting in ['r.Shadow.Virtual.Enable 0','r.SeparateTranslucency 1','r.ShadowQuality 3',
                    'r.Shadow.MaxResolution 1024','r.Shadow.MaxCSMResolution 1024','r.Shadow.CSM.MaxCascades 3','r.Shadow.DistanceScale 1']:
        u.SystemLibrary.execute_console_command(world,setting)
    result['actualCVars']={n:u.SystemLibrary.get_console_variable_int_value(n) for n in
        ['r.AntiAliasingMethod','r.PostProcessAAQuality','r.ShadowQuality','r.VolumetricCloud','r.SeparateTranslucency','r.LightFunctionQuality']}
    nanite=0
    for path in u.EditorAssetLibrary.list_assets('/Game/Lunden/Generated',recursive=True,include_folder=False):
        if '/StaticMeshes/' not in path:continue
        mesh=u.EditorAssetLibrary.load_asset(path)
        settings=mesh.get_editor_property('nanite_settings') if isinstance(mesh,u.StaticMesh) else None
        if settings and settings.get_editor_property('enabled'):
            settings.set_editor_property('enabled',False)
            prepare_nanite_materials.static_mesh_editor().set_nanite_settings(mesh,settings,True)
            nanite+=1
    result['naniteOffInMemory']=nanite
    # Expected values come from the real JS stepCloudDrift, including wrap and calm's retained heading.
    expected_path=STATE/'2371/expected-cloud-drift.json'
    expected=json.loads(expected_path.read_text())
    for path,digest in expected['sources'].items():
        if sha(root/path)!=digest:raise RuntimeError('Drift expectation source mismatch: '+path)
    if abs(float(rig.sky.get_editor_property('PlanNorth'))-expected['planNorth'])>1e-5:
        raise RuntimeError('Native PlanNorth differs from actual source drift input')
    result['driftExpectationSHA256']=sha(expected_path)
    # Exercise the production event at a tile boundary, preserving heading through calm.
    saved_wind={key:rig.sky.get_editor_property(key) for key in ('WindSpeed','WindFromDeg','CloudDirectionX','CloudDirectionY')}
    for key,value in [('UseClock',False),('TimeScale',0.0),('Year',2026),('Month',6),('Day',21),('Hour',14.0),
                      ('Rain',0.0),('Snow',0.0),('CloudOffsetX',5199.9),('CloudOffsetY',0.1)]:
        rig.sky.set_editor_property(key,value,u.PropertyAccessChangeNotifyMode.NEVER)
    capture_light.update_sky_for_capture(world,rig.sky)
    for target in expected['rows']:
        speed,heading,dt=target['speed'],target['heading'],target['dt']
        for key,value in [('WindSpeed',speed),('WindFromDeg',heading)]:
            rig.sky.set_editor_property(key,value,u.PropertyAccessChangeNotifyMode.NEVER)
        before=state(world,rig.sky,mpc)['offset']
        rig.sky.call_method('ReceiveTick',(dt,))
        after=state(world,rig.sky,mpc)
        if abs(after['hour']-14)>1e-6:raise RuntimeError('Cloud drift advanced frozen clock')
        direction=[float(rig.sky.get_editor_property(k)) for k in ('CloudDirectionX','CloudDirectionY')]
        for label,actual,want,tolerance in [('before',before,target['before'],1e-3),('after',after['offset'],target['after'],1e-3),('direction',direction,target['direction'],1e-5)]:
            for got,reference in zip(actual,want):
                delta=got-reference
                if label!='direction':delta-=round(delta/expected['period'])*expected['period']
                if abs(delta)>tolerance:raise RuntimeError('Actual Blueprint cloud '+label+' differs from real source stepCloudDrift')
        result['cloudDrift'].append({'speed':speed,'heading':heading,'dt':dt,'before':before,'after':after['offset'],
                                     'direction':direction,'expected':target,'sourceComparisonPassed':True})
    for key,value in saved_wind.items():
        rig.sky.set_editor_property(key,value,u.PropertyAccessChangeNotifyMode.NEVER)
    result['restoredCaptureWind']=saved_wind
    views=json.loads((root/'unreal/Lunden/Tests/views.json').read_text())
    pose=next(v for v in views['views'] if v['id']=='start')
    shots=json.loads((root/'tools/unreal-engine/tests/lighting-shots.json').read_text())['shots']
    for name in ['start-day','start-overcast','start-night']:
        shot=next(s for s in shots if s['name']==name)
        date,hour=shot['date'],shot['hour'];rain=1.0 if shot['weather']=='rain' else 0.0
        for key,value in [('UseClock',False),('TimeScale',0.0),('Year',date[0]),('Month',date[1]),('Day',date[2]),
                          ('Hour',hour),('Rain',rain),('Snow',0.0),('Wet',rain),('CloudOffsetX',0.0),('CloudOffsetY',0.0)]:
            rig.sky.set_editor_property(key,value,u.PropertyAccessChangeNotifyMode.NEVER)
        hidden,season=visibility.apply_visibility_only(world,rig.seasons,date,hour)
        capture_light.update_sky_for_capture(world,rig.sky)
        # Distant START sky is independent of facade lamp acceptance, but retain shot's canonical dusk policy.
        for lamp in rig.lamps:
            dark=rig.sky.get_editor_property('DuskLight')<(lamp.get_editor_property('DuskOn')+lamp.get_editor_property('DuskOff'))/2
            on=shot['lamps']=='all' or (shot['lamps']=='dusk' and dark and 'auto:dusk' in map(str,lamp.tags))
            lamp.call_method('TurnOn' if on else 'TurnOff')
        capture_light.settle_furnishing_lights(world)
        rig.skylight.recapture_sky()
        if not weather.is_visible() or rig.sky.is_temporarily_hidden_in_editor():
            raise RuntimeError('Actual production weather post process cannot render')
        current_weather,current_blends=helpers.weather_component(rig.sky,material)
        if current_weather!=weather or [(w,o.get_path_name()) for w,o in current_blends]!=[(w,o.get_path_name()) for w,o in blends]:
            raise RuntimeError('Production Weather identity or actual blend weights changed')
        weather_readback={'component':weather.get_path_name(),'enabled':bool(weather.get_editor_property('enabled')),
             'unbound':bool(weather.get_editor_property('unbound')),'visible':bool(weather.is_visible()),
             'ownerEditorHidden':bool(rig.sky.is_temporarily_hidden_in_editor()),
             'blendWeight':float(weather.get_editor_property('blend_weight')),
             'materials':[{'path':o.get_path_name(),'weight':w} for w,o in current_blends]}
        observed=state(world,rig.sky,mpc)
        if max(abs(x) for x in observed['offset'])>1e-6:raise RuntimeError('Wrong frozen source cloud phase')
        if rain:result['weather'].append({**observed,'event':'rain','rain':1,'snow':0})
        else:result['sun'].append(observed)
        fov=math.degrees(2*math.atan(math.tan(math.radians(views['verticalFovDeg'])/2)*640/360))
        bias=capture_light.game_bias(rig.sky)
        camera=helpers.render(screenshot_level,world,str(out),'unreal-'+name,
             u.Vector(pose['x']*100,pose['z']*100,(pose['feetY']+views['standingEyeHeightM'])*100),
             u.Rotator(roll=0,pitch=pose['pitchDeg'],yaw=270-pose['yawDeg']),640,360,fov,bias,excluded+hidden)
        path=out/('unreal-'+name+'.png')
        result['shots'].append({'id':name,'camera':camera,'exposureBias':bias,'state':observed,
                                'imageSHA256':helpers.png(path),'seasonVisibility':season,'actualWeather':weather_readback})
        write(out/'capture.json',result)
    result['completed']=True
    write(out/'capture.json',result)
    u.log('LUNDEN_2371_CLOUD_PROBE_OK')

if __name__=='__main__':
    context=ModuleType('lunden_private2371_cloud_probe');context.__file__=__file__;sys.modules[context.__name__]=context
    exec(compile(Path(__file__).read_text(),__file__,'exec'),context.__dict__)
    context.main(sys.argv[1:])
