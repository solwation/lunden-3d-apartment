"""Root-only #2388 unsaved copied-master graphOpacity0 control: same original patio/35slots, no product edits/saves."""
import argparse
import hashlib
import importlib.util
import json
import math
import os
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
    parser.add_argument('--config', type=Path, default=os.environ.get('LUNDEN_2388_COPY_OPACITY_CONFIG'))
    args = parser.parse_args(argv)
    if not args.config:
        raise RuntimeError('Explicit Root config required')
    c = json.loads(args.config.read_text())
    root, out = Path(c['root']).resolve(), Path(c['out']).resolve()
    if not out.is_relative_to(Path('/home/devcontainers/.local/state/lunden-codex-20261127/2388')) or out.exists():
        raise RuntimeError('Require fresh output')
    out.mkdir(parents=True)
    result = {'completed': False, 'restored': False, 'sourceHead': c['head'], 'shots': [],
              'classification': 'Diagnostic unsaved copied-master graphOpacity0 positive control; no builders/import/save/canonical/releasegate/PMREM parity/product acceptance'}
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
        if len(c['authored'])!=250:raise RuntimeError('Require actual current public250 readonly baseline')
        sys.path[:0]=[str(root/'tools/unreal-engine/python'),str(root/'tools/unreal-engine/tests')]
        import capture_light
        import screenshot_level
        import prepare_nanite_materials
        state = Path('/home/devcontainers/.local/state/lunden-codex-20261127')
        helper = load('lunden2388_flash_environment', c.get('environmentHelper', str(state/'2394/verify-production.py')))
        visibility = load('lunden2388_flash_visibility', c.get('visibilityHelper', str(state/'2394/season-visibility-only.py')))
        controls = load('lunden2388_patio_controls', c.get('runtimeControls', str(state/'2421/resumed-night-source/runtime-controls.py')))
        source_view=next(v for v in capture_light.VIEWS['views']if v['id']=='patio')
        if {k:source_view[k]for k in ('x','z','feetY','yawDeg','pitchDeg','lighting')}!={'x':2.3,'z':16.1,'feetY':0,'yawDeg':-8,'pitchDeg':12,'lighting':'day'}:raise RuntimeError('Original2388 source patio camera changed')
        reference=json.loads(Path(c['webCapture']).read_text())
        web=next(v for v in reference['shots']if v['name']=='patio-day')
        if reference['viewport']!={'width':640,'height':360}or web['eye']!=[2.3,1.62,16.1]or web['yaw']!=-8 or web['pitch']!=12 or web['day']!=[2026,6,21,14,True]or web['profile']['verticalFov']!=72:raise RuntimeError('Pinned original2388 web pose/date/profile differs')
        result['cameraBasis']={'webCapture':c['webCapture'],'webCaptureSHA256':sha(c['webCapture']),'sourceView':source_view,'date':[2026,6,21],'hour':14,'lampsOn':False,'webEye':[2.3,1.62,16.1],'nativeXYZ':[230,1610,162],'nativeYaw':278,'nativePitch':12,'verticalFov':72,'width':640,'height':360}
        ao=load('lunden2388_copy_opacity_probe',c['probe'])
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
        values = {key: float(u.MaterialLibrary.get_scalar_parameter_value(world, mpc, key)) for key in MPC_VALUES}
        commands = {'r.DeferUpdateRenderStates':0,'r.SeparateTranslucency':1,'r.CustomDepth':3,'r.Shadow.Virtual.Enable':0,'r.ShadowQuality':3,'r.Shadow.MaxResolution':1024,'r.Shadow.MaxCSMResolution':1024,'r.Shadow.CSM.MaxCascades':3,'r.Shadow.DistanceScale':1}
        if c.get('captureCVars') and c['captureCVars']!=commands:raise RuntimeError('Explicit captureCVars differ from fixed profile')
        before_cvars = {key: u.SystemLibrary.get_console_variable_int_value(key) for key in commands}
        result['entryState'] = {'clock': clock, 'weatherMPC': values, 'calendarMonth': month,
                                'lamps': {lamp.get_path_name(): on for lamp, on in lamps}, 'CVars': before_cvars}
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
            excluded=[a for a in actors if 'kind:collision' in [str(tag)for tag in a.tags]]
            hfov=math.degrees(2*math.atan(math.tan(math.radians(72)/2)*640/360))
            date=[2026,6,21];hour=14;xyz=[230,1610,162];yaw=278;pitch=12
            for key,value in (('UseClock',False),('TimeScale',0.0),('Year',date[0]),('Month',date[1]),('Day',date[2]),('Hour',hour),('Hail',False),('Storm',False),('Rain',0.0),('Snow',0.0),('Wet',0.0),('FlashK',0.0),('FlashT',9.0)):
                rig.sky.set_editor_property(key,value,u.PropertyAccessChangeNotifyMode.NEVER)
            hidden,seasons=visibility.apply_visibility_only(world,rig.seasons,date,hour)
            capture_light.update_sky_for_capture(world,rig.sky)
            for lamp,_ in lamps:lamp.call_method('TurnOff')
            capture_light.settle_furnishing_lights(world);controls.refresh(world);rig.skylight.recapture_sky()
            def runtime():
                return {'clock':{key:rig.sky.get_editor_property(key)for key in CLOCK},'MPC':{key:float(u.MaterialLibrary.get_scalar_parameter_value(world,mpc,key))for key in (*MPC_VALUES,'WindowAmbientFill','Daylight','Hour','Night','Rain','Snow')},'lamps':{lamp.get_path_name():bool(lamp.get_editor_property('IsOn'))for lamp,_ in lamps},'gameBias':capture_light.game_bias(rig.sky),'SSRQuality':u.SystemLibrary.get_console_variable_int_value('r.SSR.Quality')}
            fixture=runtime()
            if fixture['clock']['Flash']!=0 or fixture['MPC']['Flash']!=0 or any(fixture['lamps'].values())or fixture['SSRQuality']!=0:raise RuntimeError('Actual clear/day/off/SSR fixture differs')
            original=u.load_asset('/Game/Lunden/Materials/MI_LundenWindowGlass');master=u.load_asset('/Game/Lunden/Materials/M_LundenGlass')
            mel=u.MaterialEditingLibrary
            opacity_input=mel.get_material_property_input_node(master,u.MaterialProperty.MP_OPACITY)
            if not isinstance(opacity_input,u.MaterialExpressionScalarParameter)or str(opacity_input.get_editor_property('parameter_name'))!='Opacity':raise RuntimeError('Original Opacity scalar input premise changed')
            if abs(float(mel.get_material_instance_scalar_parameter_value(original,'Opacity'))-0.1)>1e-6:raise RuntimeError('Original effective Opacity differs from saved0.1')
            original_opacity_input=opacity_input.get_path_name()

            bindings=[(comp,i)for actor in actors for comp in actor.get_components_by_class(u.StaticMeshComponent)for i in range(comp.get_num_materials())if comp.get_material(i)==original]
            if len(bindings)!=35:raise RuntimeError('Actual35 original glass slots required')
            source_state=ao.instance_state(original)
            bind,restore,report=ao.prepare(world);result['copyOpacityProbe']=report;write(out/'capture.json',result)
            try:
                copied=u.find_object(None,report['copy'])
                if copied is None:raise RuntimeError('Actual prepared unsaved copy unavailable')
                zero=mel.get_material_property_input_node(copied.get_base_material(),u.MaterialProperty.MP_OPACITY)
                if not isinstance(zero,u.MaterialExpressionConstant)or float(zero.get_editor_property('r'))!=0:raise RuntimeError('GraphOpacity0 not actually connected to copied master')
                for name,mode in [('patio-original-before','original'),('patio-copy-opacity-zero','copygraph-opacity-zero'),('patio-original-after','original')]:
                    bind(mode);bound=original if mode=='original'else copied
                    current=runtime()
                    if current!=fixture:raise RuntimeError('Actual runtime/exposure changed across copied graphOpacity modes')
                    if ao.instance_state(original)!=source_state or ao.instance_state(bound)!=source_state:raise RuntimeError('Actual source/copy PBR, local overrides, textures or static switches changed')
                    if abs(float(mel.get_material_instance_scalar_parameter_value(bound,'Opacity'))-0.1)>1e-6:raise RuntimeError('Source Opacity parameter changed; graph-only control required')
                    actual_input=mel.get_material_property_input_node(master if mode=='original'else copied.get_base_material(),u.MaterialProperty.MP_OPACITY)
                    input_state={'path':actual_input.get_path_name(),'class':type(actual_input).__name__,'effectiveParameterOpacity':float(mel.get_material_instance_scalar_parameter_value(bound,'Opacity'))}
                    if mode=='original':
                        if actual_input.get_path_name()!=original_opacity_input or str(actual_input.get_editor_property('parameter_name'))!='Opacity':raise RuntimeError('Original Opacity graph input changed')
                        input_state['parameterName']='Opacity';input_state['defaultValue']=float(actual_input.get_editor_property('default_value'))
                    else:
                        if not isinstance(actual_input,u.MaterialExpressionConstant)or float(actual_input.get_editor_property('r'))!=0.0:raise RuntimeError('Copied graph Opacity0 lost')
                        input_state['constant']=0.0

                    readback=[{'component':comp.get_path_name(),'slot':i,'actualMaterial':comp.get_material(i).get_path_name()}for comp,i in bindings]
                    if any(comp.get_material(i)!=bound for comp,i in bindings):raise RuntimeError('Actual35 material bindings differ from mode')
                    camera=helper.render(screenshot_level,world,str(out),'unreal-'+name,u.Vector(*xyz),u.Rotator(roll=0,pitch=pitch,yaw=yaw),640,360,hfov,current['gameBias'],excluded+hidden)
                    if camera['width']!=640 or camera['height']!=360 or any(abs(a-b)>1e-3 for a,b in zip(camera['xyz'],xyz))or any(abs((camera[key]-value+180)%360-180)>1e-3 for key,value in [('pitch',pitch),('yaw',yaw),('roll',0)])or abs(camera['horizontalFov']-hfov)>1e-3:raise RuntimeError('Actual original source camera differs')
                    result['shots'].append({'name':name,'copyOpacityMode':mode,'actualRuntime':current,'seasonVisibility':seasons,'camera':camera,'effectiveBindings':readback,'sourceInstanceState':source_state,'opacityGraphInput':input_state,'image':'unreal-'+name+'.png','imageSHA256':helper.png(out/('unreal-'+name+'.png'))});write(out/'capture.json',result);frozen()
            finally:
                result['copyOpacityProbe']=restore();result['effective35BindingsRestored']=all(comp.get_material(i)==original for comp,i in bindings)
                if ao.instance_state(original)!=source_state or not result['effective35BindingsRestored']or mel.get_material_property_input_node(master,u.MaterialProperty.MP_OPACITY).get_path_name()!=original_opacity_input:raise RuntimeError('Original source materials/effective35 bindings not restored')
                write(out/'capture.json',result)
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
            capture_light.settle_furnishing_lights(world)
            result['patioAfterRestore']=controls.refresh(world)

            for comp, value in rtcs:
                comp.set_editor_property('real_time_capture', value, u.PropertyAccessChangeNotifyMode.NEVER)
            if u.SystemLibrary.is_valid(rig.seasons.holder):
                rig.seasons.holder.destroy_actor()
            for key, value in before_cvars.items():
                u.SystemLibrary.execute_console_command(world, key+' '+str(value))
            after = {'clock': {key: rig.sky.get_editor_property(key) for key in CLOCK},
                     'weatherMPC': {key: float(u.MaterialLibrary.get_scalar_parameter_value(world, mpc, key)) for key in MPC_VALUES},
                     'calendarMonth': u.MaterialLibrary.get_scalar_parameter_value(world, calendar, 'Month'),
                     'lamps': {lamp.get_path_name(): bool(lamp.get_editor_property('IsOn')) for lamp, _ in lamps},
                     'CVars': {key: u.SystemLibrary.get_console_variable_int_value(key) for key in commands}}
            result['afterRestore'] = after
            result['restored'] = after == result['entryState'] and all(bool(comp.get_editor_property('real_time_capture'))==value for comp,value in rtcs) and all(bool(actor.get_editor_property('hidden'))==h and actor.is_temporarily_hidden_in_editor()==e for actor,h,e in visible if u.SystemLibrary.is_valid(actor))
            write(out/'capture.json', result)
            if not result['restored']:
                raise RuntimeError('Actual storm/flash/clock/lamps/RTC/calendar/visibility/offset/CVar restore failed')
        frozen()
        result.update(completed=True, capturedImages=3, all250ExactReadonly=True, generatedExact=True, sourceExportExact=True,
                      freshCanonicalExecutedHere=False, releaseGateExecutedHere=False, assetsSavedHere=False,productAccepted=False,
                      pixelResponseNotAssessedHere=True,overrideArrayExactRequired=False,limits='Unsaved object/package/override-array state may differ; effective bindings, original parameters and all disk bytes must restore. Copied graphOpacity0 is causal isolation only, sourcePMREM not supplied.')
        write(out/'capture.json', result)
        u.log('LUNDEN_2388_COPY_OPACITY_CAPTURE_OK')
    except BaseException:
        result['error'] = traceback.format_exc()
        write(out/'capture.json', result)
        raise

if __name__ == '__main__':
    load('lunden2388_copy_opacity_pair_retained', Path(__file__)).main()
