"""Root-only #2424/#2453: normal import/check, actual Basic readback and two original dusk captures +one original-glass patio day baseline; no authored writes."""
import argparse
import ast
import types
import hashlib
import importlib.util
import json
import math
import os
import re
from pathlib import Path
import stat
import subprocess
import sys
import traceback
import unreal as u

_KEEP = []
CLOCK = ('UseClock', 'TimeScale', 'Year', 'Month', 'Day', 'Hour', 'Rain', 'Snow', 'Wet',
         'Hail', 'Storm', 'FlashT', 'FlashK', 'Flash')
MPC_VALUES = ('CloudOffsetX', 'CloudOffsetY', 'Flash')
WORLD = '/Game/Lunden/Maps/L_Lunden'

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def files(path):
    return {p.relative_to(path).as_posix(): sha(p) for p in sorted(path.rglob('*')) if p.is_file()}

def authored(root):
    return {p.relative_to(root).as_posix(): {'sha256': sha(p), 'mode': stat.S_IMODE(p.stat().st_mode)}
            for p in (root/'unreal/Lunden/Content').rglob('*')
            if p.suffix in ('.uasset', '.umap') and 'Generated' not in p.relative_to(root).parts}

def write(path, value):
    Path(path).write_text(json.dumps(value, indent=2, allow_nan=False)+'\n')

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    _KEEP.append(module)
    spec.loader.exec_module(module)
    return module

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=os.environ.get('LUNDEN_2424_BASIC_CONFIG'))
    args = parser.parse_args(argv)
    if not args.config:
        raise RuntimeError('Explicit Root config required')
    c = json.loads(args.config.read_text())
    root, out = Path(c['root']).resolve(), Path(c['out']).resolve()
    if not out.is_relative_to(Path('/home/devcontainers/.local/state/lunden-codex-20261127/2424')) or out.exists():
        raise RuntimeError('Require fresh output')
    out.mkdir(parents=True)
    result = {'completed': False, 'restored': False, 'sourceHead': c['head'], 'shots': [],
              'classification': 'Normal tenzone import/check +effective Basic model/graph readback +two dusk views +original patio baseline; no full20/stamp/releasegate/cook/global policy'}
    write(out/'capture.json', result)
    generated, imported = root/'unreal/Lunden/Content/Lunden/Generated', root/'unreal/Lunden/Import'
    expected_authored = c['authored']
    expected_generated = c['generated']
    def frozen():
        if subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip() != c['head']:
            raise RuntimeError('Frozen native HEAD changed')
        if files(imported) != c['exportFiles'] or files(generated) != expected_generated:
            raise RuntimeError('Frozen import/Generated changed')
        actual = authored(root)
        if actual != expected_authored or len(actual) != len(expected_authored) or any(row['mode'] & 0o222 for row in actual.values()):
            raise RuntimeError('Actual authored baseline/count/readonly changed')
        if any(sha(path) != expected for path, expected in c['dependenciesSHA256'].items()):
            raise RuntimeError('Pinned capture dependencies changed')
    try:
        frozen()
        if Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())).resolve() != root/'unreal/Lunden':
            raise RuntimeError('Wrong active native project')
        if len(c['authored'])!=250:raise RuntimeError('Require exact actual public250 authored baseline')
        sys.path[:0]=[str(root/'tools/unreal-engine/python'),str(root/'tools/unreal-engine/tests')]
        def load_builder(name):
            if name in sys.modules:raise RuntimeError('Builder already imported '+name)
            path=root/'tools/unreal-engine/python'/(name+'.py');tree=ast.parse(path.read_text(),filename=str(path));body=[]
            for node in tree.body:
                direct=isinstance(node,ast.Expr)and isinstance(node.value,ast.Call)and isinstance(node.value.func,ast.Name)and node.value.func.id=='main'
                guarded=isinstance(node,ast.If)and ast.dump(node.test)==ast.dump(ast.parse("__name__ == '__main__'").body[0].value)
                if not(direct or guarded):body.append(node)
            tree.body=body;module=types.ModuleType(name);module.__file__=str(path);sys.modules[name]=module;_KEEP.append(module);exec(compile(tree,str(path),'exec'),module.__dict__);return module
        manifest=json.loads((imported/'export-manifest.json').read_text())
        if manifest['sourceHash']!=c['exportSourceHash'] or manifest['sourceDirty']:
            raise RuntimeError('Wrong or dirty actual export source')
        zones={e['zone'] for e in manifest['files'] if e['kind']=='glb'}
        if len(zones)!=10:raise RuntimeError('Actual full tenzone export required')
        # Exact existing importer output scopes; no Interaction/world/authored or unrelated Generated writes.
        allowed=zones|{'LabelMaterials','GarageMaterials','StairwellMaterials','ImportMaterials','BackdropMaterials','RiverMaterials'}
        def stage(label):
            nonlocal expected_generated
            observed=files(generated)
            changed=sorted(k for k in set(c['generated'])|set(observed) if c['generated'].get(k)!=observed.get(k))
            unexpected=[k for k in changed if k.split('/')[0] not in allowed]
            result.setdefault('generatedGuards',[]).append({'phase':label,'changed':changed,'unexpected':unexpected})
            write(out/'capture.json',result)
            if unexpected:raise RuntimeError('Unexpected Generated writes '+str(unexpected))
            expected_generated=observed;frozen()
        importer=load_builder('import_world')
        importer.main([str(imported)]);stage('normal-import-all10')
        importer.main([str(imported),'--check']);stage('normal-import-check-all10')
        result['normalOperations']=['import_world all10 actual zones','import_world --check all10 actual zones']
        result.update(normalImportCheckPassed=True,canonicalStepsExecutedHere=0,
                      freshSyncStampWrittenHere=False,releaseGateExecutedHere=False,sourceAmbientPolicyActivatedHere=False)
        write(out/'generated-after-import.json',expected_generated)

        import capture_light
        import screenshot_level
        import prepare_nanite_materials
        state = Path('/home/devcontainers/.local/state/lunden-codex-20261127')
        helper = load('lunden2424basic_flash_environment', c.get('environmentHelper', str(state/'2394/verify-production.py')))
        visibility = load('lunden2424basic_flash_visibility', c.get('visibilityHelper', str(state/'2394/season-visibility-only.py')))
        controls = load('lunden2424basic_patio_controls', c.get('runtimeControls', str(state/'2421/resumed-night-source/runtime-controls.py')))
        readback=load('lunden2424_basic_readback',c['basicReadback'])
        plan=json.loads(Path(c['cameraContract']).read_text())
        views=plan['shots']
        if len(views)!=3 or {v['name'] for v in views}!={'facade-a-dusk','portik-l-dusk','patio-baseline'}:
            raise RuntimeError('Exactly two original dusk cameras plus original patio baseline required')
        for view in views:
            expected=([2026,6,21],14,'none') if view['name']=='patio-baseline' else ([2026,11,16],18.25,'dusk')
            if (view['width']!=640 or view['height']!=360 or view['weather']!='clear' or view['verticalFov']!=72
                    or (view['date'],view['hour'],view['lamps'])!=expected):
                raise RuntimeError('Locked original capture state/resolution changed')
        world = u.EditorLoadingAndSavingUtils.load_map(WORLD)
        if not world or world.get_path_name() != WORLD+'.L_Lunden':
            raise RuntimeError('Actual final composed world required')
        actors = list(u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors())
        rtcs = [(comp, bool(comp.get_editor_property('real_time_capture'))) for actor in actors
                for comp in actor.get_components_by_class(u.SkyLightComponent)]
        visible = [(a, bool(a.get_editor_property('hidden')), a.is_temporarily_hidden_in_editor()) for a in actors]
        rig = capture_light.light_for(world)
        _KEEP.extend([world, rig, *actors])
        clock = {key: rig.sky.get_editor_property(key) for key in CLOCK}

        lamps = [(lamp, bool(lamp.get_editor_property('IsOn'))) for lamp in rig.lamps]
        calendar = u.load_asset('/Game/Lunden/Seasons/MPC_LundenVegetation')
        month = u.MaterialLibrary.get_scalar_parameter_value(world, calendar, 'Month')
        mpc = u.load_asset('/Game/Lunden/Lighting/MPC_LundenWeather')
        scalar_names=[str(p.get_editor_property('parameter_name')) for p in mpc.get_editor_property('scalar_parameters')]
        vector_names=[str(p.get_editor_property('parameter_name')) for p in mpc.get_editor_property('vector_parameters')]
        values={key:float(u.MaterialLibrary.get_scalar_parameter_value(world,mpc,key)) for key in scalar_names}
        def vectors():
            data={}
            for key in vector_names:
                value=u.MaterialLibrary.get_vector_parameter_value(world,mpc,key)
                data[key]=[value.r,value.g,value.b,value.a]
            return data
        vector_values=vectors()
        commands = {'r.DeferUpdateRenderStates':0,'r.SeparateTranslucency':1,'r.CustomDepth':3,'r.Shadow.Virtual.Enable':0,'r.ShadowQuality':3,'r.Shadow.MaxResolution':1024,'r.Shadow.MaxCSMResolution':1024,'r.Shadow.CSM.MaxCascades':3,'r.Shadow.DistanceScale':1}
        if c.get('captureCVars') and c['captureCVars']!=commands:raise RuntimeError('Explicit captureCVars differ from fixed profile')
        before_cvars = {key: u.SystemLibrary.get_console_variable_int_value(key) for key in commands}
        result['entryState'] = {'clock': clock, 'weatherMPC': values, 'calendarMonth': month,
                                'weatherVectors':vector_values,'lamps': {lamp.get_path_name(): on for lamp, on in lamps}, 'CVars': before_cvars}
        try:
            for key, value in commands.items():
                u.SystemLibrary.execute_console_command(world, key+' '+str(value))
            during = {key: u.SystemLibrary.get_console_variable_int_value(key) for key in commands}
            if during != commands:
                raise RuntimeError('Actual capture CVar differs from requested')
            result['actualCVars'] = during
            # One usual in-memory SM5 Nanite preparation, no save; no canonical rebuild.
            count = 0
            for path in u.EditorAssetLibrary.list_assets('/Game/Lunden/Generated', recursive=True, include_folder=False):
                if '/StaticMeshes/' not in path:
                    continue
                mesh = u.EditorAssetLibrary.load_asset(path)
                if isinstance(mesh, u.StaticMesh):
                    settings = mesh.get_editor_property('nanite_settings')
                    if settings.get_editor_property('enabled'):
                        settings.set_editor_property('enabled', False)
                        prepare_nanite_materials.static_mesh_editor().set_nanite_settings(mesh, settings, True)
                        count += 1
            result['naniteDisabledInMemory'] = count
            readback.verify_basic_import(root,out/'basic-readback.json',world,run_import_check=False)
            result['actualBasicReadbackPassed']=True
            frozen()
            excluded=[a for a in actors if 'kind:collision' in [str(tag)for tag in a.tags]]
            hfov=math.degrees(2*math.atan(math.tan(math.radians(72)/2)*640/360))
            for view in views:
                name=view['name'];date=view['date'];hour=view['hour'];eye=view['eyeWeb'];xyz=[eye[0]*100,eye[2]*100,eye[1]*100];yaw=270-view['yawWeb'];pitch=view['pitchWeb']
                for key,value in (('UseClock',False),('TimeScale',0.0),('Year',date[0]),('Month',date[1]),('Day',date[2]),('Hour',hour),('Hail',False),('Storm',False),('Rain',0.0),('Snow',0.0),('Wet',0.0),('FlashK',0.0),('FlashT',9.0)):
                    rig.sky.set_editor_property(key,value,u.PropertyAccessChangeNotifyMode.NEVER)
                hidden,seasons=visibility.apply_visibility_only(world,rig.seasons,date,hour)
                capture_light.update_sky_for_capture(world,rig.sky)
                dusk_mid=(rig.lamps[0].get_editor_property('DuskOn')+rig.lamps[0].get_editor_property('DuskOff'))/2
                dark=rig.sky.get_editor_property('DuskLight')<dusk_mid
                expected_lamps={}
                for lamp,_ in lamps:
                    on=view['lamps']=='dusk' and dark and 'auto:dusk' in [str(t) for t in lamp.tags]
                    lamp.call_method('TurnOn' if on else 'TurnOff')
                    expected_lamps[lamp.get_path_name()]=on
                capture_light.settle_furnishing_lights(world);patio=controls.refresh(world);rig.skylight.recapture_sky()
                actual={'clock':{key:rig.sky.get_editor_property(key)for key in CLOCK},'MPC':{key:float(u.MaterialLibrary.get_scalar_parameter_value(world,mpc,key))for key in (*MPC_VALUES,'WindowAmbientFill','Daylight','Hour','Night','Rain','Snow')},'lamps':{lamp.get_path_name():bool(lamp.get_editor_property('IsOn'))for lamp,_ in lamps},'patio':patio,'gameBias':capture_light.game_bias(rig.sky)}
                if actual['clock']['Flash']!=0 or actual['MPC']['Flash']!=0 or not actual['lamps'] or actual['lamps']!=expected_lamps:raise RuntimeError('Actual clear/source-lamp fixture differs')
                if name=='patio-baseline':
                    # Exact original #2388 fixture only: no copy, MID, new shader or material override.
                    original=u.load_asset('/Game/Lunden/Materials/MI_LundenWindowGlass')
                    master=u.load_asset('/Game/Lunden/Materials/M_LundenGlass')
                    opacity=u.MaterialEditingLibrary.get_material_property_input_node(master,u.MaterialProperty.MP_OPACITY)
                    if (not isinstance(opacity,u.MaterialExpressionScalarParameter)
                            or str(opacity.get_editor_property('parameter_name'))!='Opacity'
                            or abs(float(u.MaterialEditingLibrary.get_material_instance_scalar_parameter_value(original,'Opacity'))-.1)>1e-6):
                        raise RuntimeError('Original saved glass Opacity premise changed')
                    bindings=[{'component':comp.get_path_name(),'slot':i,'material':comp.get_material(i).get_path_name()}
                        for actor in actors for comp in actor.get_components_by_class(u.StaticMeshComponent)
                        for i in range(comp.get_num_materials()) if comp.get_material(i)==original]
                    if len(bindings)!=35:raise RuntimeError('Original35 glass bindings required for patio baseline')
                    actual['originalGlass']={'master':master.get_path_name(),'material':original.get_path_name(),
                        'opacity':.1,'bindings':bindings,'privateCandidateAttached':False}
                camera=helper.render(screenshot_level,world,str(out),'unreal-'+name,u.Vector(*xyz),u.Rotator(roll=0,pitch=pitch,yaw=yaw),640,360,hfov,actual['gameBias'],excluded+hidden)
                if camera['width']!=640 or camera['height']!=360 or any(abs(a-b)>1e-3 for a,b in zip(camera['xyz'],xyz))or any(abs((camera[key]-value+180)%360-180)>1e-3 for key,value in [('pitch',pitch),('yaw',yaw),('roll',0)])or abs(camera['horizontalFov']-hfov)>1e-3:raise RuntimeError('Actual source camera differs')
                result['shots'].append({'name':name,'sourceCamera':view,'actualRuntime':actual,'seasonVisibility':seasons,'camera':camera,'image':'unreal-'+name+'.png','imageSHA256':helper.png(out/('unreal-'+name+'.png'))});write(out/'capture.json',result)
        finally:
            for key, value in clock.items():
                rig.sky.set_editor_property(key, value, u.PropertyAccessChangeNotifyMode.NEVER)
            capture_light.update_sky_for_capture(world, rig.sky)
            # Flash is derived by UpdateSky; restore raw original values as well,
            # even if an editor's initial stored Flash was stale relative to FlashT.
            rig.sky.set_editor_property('Flash', clock['Flash'], u.PropertyAccessChangeNotifyMode.NEVER)
            for lamp, on in lamps:
                lamp.call_method('TurnOn' if on else 'TurnOff')
            for actor, hidden_game, hidden_editor in visible:
                if u.SystemLibrary.is_valid(actor):
                    actor.set_actor_hidden_in_game(hidden_game)
                    actor.set_is_temporarily_hidden_in_editor(hidden_editor)
            u.MaterialLibrary.set_scalar_parameter_value(world, calendar, 'Month', month)
            for key, value in values.items():
                u.MaterialLibrary.set_scalar_parameter_value(world, mpc, key, value)
            for key,value in vector_values.items():
                u.MaterialLibrary.set_vector_parameter_value(world,mpc,key,u.LinearColor(*value))
            capture_light.settle_furnishing_lights(world)
            result['patioAfterRestore']=controls.refresh(world)
            for key,value in values.items():u.MaterialLibrary.set_scalar_parameter_value(world,mpc,key,value)
            for key,value in vector_values.items():u.MaterialLibrary.set_vector_parameter_value(world,mpc,key,u.LinearColor(*value))

            for comp, value in rtcs:
                comp.set_editor_property('real_time_capture', value, u.PropertyAccessChangeNotifyMode.NEVER)
            if u.SystemLibrary.is_valid(rig.seasons.holder):
                rig.seasons.holder.destroy_actor()
            for key, value in before_cvars.items():
                u.SystemLibrary.execute_console_command(world, key+' '+str(value))
            after = {'clock': {key: rig.sky.get_editor_property(key) for key in CLOCK},
                     'weatherMPC': {key: float(u.MaterialLibrary.get_scalar_parameter_value(world, mpc, key)) for key in scalar_names},
                     'weatherVectors':vectors(),
                     'calendarMonth': u.MaterialLibrary.get_scalar_parameter_value(world, calendar, 'Month'),
                     'lamps': {lamp.get_path_name(): bool(lamp.get_editor_property('IsOn')) for lamp, _ in lamps},
                     'CVars': {key: u.SystemLibrary.get_console_variable_int_value(key) for key in commands}}
            result['afterRestore'] = after
            result['restored'] = after == result['entryState'] and all(bool(comp.get_editor_property('real_time_capture'))==value for comp,value in rtcs) and all(bool(actor.get_editor_property('hidden'))==h and actor.is_temporarily_hidden_in_editor()==e for actor,h,e in visible if u.SystemLibrary.is_valid(actor))
            write(out/'capture.json', result)
            if not result['restored']:
                raise RuntimeError('Actual storm/flash/clock/lamps/RTC/calendar/visibility/offset/CVar restore failed')
        frozen()
        result.update(completed=True, capturedImages=3, authored250Readonly=True, generatedExactAfterImport=True, sourceExportExact=True,
                      freshCanonicalExecutedHere=False, releaseGateExecutedHere=False, assetsSavedHere='Only normal Generated importer outputs; no authored assets')
        write(out/'capture.json', result)
        u.log('LUNDEN_2424_BASIC_IMPORT_CAPTURE_OK')
    except BaseException:
        result['error'] = traceback.format_exc()
        write(out/'capture.json', result)
        raise

if __name__ == '__main__':
    load('lunden2424basic_flash_pair_retained', Path(__file__)).main()
