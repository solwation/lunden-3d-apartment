"""Private Root-only #2437 normal Grass master build/check and two source-bound outdoor captures."""
import argparse
import ast
import types
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
    parser.add_argument('--config', type=Path, default=os.environ.get('LUNDEN_2437_NATIVE_CONFIG'))
    args = parser.parse_args(argv)
    if not args.config:
        raise RuntimeError('Explicit Root config required')
    c = json.loads(args.config.read_text())
    root, out = Path(c['root']).resolve(), Path(c['out']).resolve()
    if not out.is_relative_to(Path('/home/devcontainers/.local/state/lunden-codex-20261127/2437')) or out.exists():
        raise RuntimeError('Require fresh output')
    out.mkdir(parents=True)
    result = {'completed': False, 'restored': False, 'sourceHead': c['head'], 'shots': [],
              'classification': 'Actual singleton Grass build/check and2views; no new20/releasegate/PBR claimed'}
    write(out/'capture.json', result)
    generated, imported = root/'unreal/Lunden/Content/Lunden/Generated', root/'unreal/Lunden/Import'
    expected_authored = c['authored']
    def frozen():
        if subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip() != c['head']:
            raise RuntimeError('Frozen native HEAD changed')
        if files(imported) != c['exportFiles'] or files(generated) != c['generated']:
            raise RuntimeError('Frozen import/Generated changed')
        actual = authored(root)
        if actual != expected_authored or len(actual) != 247 or any(row['mode'] & 0o222 for row in actual.values()):
            raise RuntimeError('Actual authored baseline/readonly changed')
        if any(sha(path) != expected for path, expected in c['dependenciesSHA256'].items()):
            raise RuntimeError('Pinned capture dependencies changed')
    try:
        frozen()
        if Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())).resolve() != root/'unreal/Lunden':
            raise RuntimeError('Wrong active native project')
        # Normal builder API, scoped to exactly the existing authored Grass master.
        target_asset = 'unreal/Lunden/Content/Lunden/Materials/M_LundenGrass.uasset'
        master = root/target_asset
        if target_asset not in c['authored']: raise RuntimeError('Grass master absent from baseline')
        sys.path[:0] = [str(root/'tools/unreal-engine/python'), str(root/'tools/unreal-engine/tests')]
        path=root/'tools/unreal-engine/python/build_materials.py'
        tree=ast.parse(path.read_text(),filename=str(path));tree.body=[n for n in tree.body if not(isinstance(n,ast.If) and ast.dump(n.test)==ast.dump(ast.parse("__name__ == '__main__'").body[0].value))]
        if 'build_materials' in sys.modules:raise RuntimeError('Builder imported before controlled load')
        builder=types.ModuleType('build_materials');builder.__file__=str(path);sys.modules[builder.__name__]=builder;_KEEP.append(builder);exec(compile(tree,str(path),'exec'),builder.__dict__)
        original_eal=builder.eal;result['buildSaveAttempts']=[]
        class GuardedAssets:
            def __getattr__(self,name):return getattr(original_eal,name)
            def save_loaded_asset(self,asset,*a,**kw):
                package=asset.get_path_name().split('.')[0]
                result['buildSaveAttempts'].append(package);write(out/'capture.json',result)
                if package!='/Game/Lunden/Materials/M_LundenGrass':raise RuntimeError('Out-of-scope material save '+package)
                return original_eal.save_loaded_asset(asset,*a,**kw)
        builder.eal=GuardedAssets()
        try:
            master.chmod(0o644)
            table=json.loads((root/'tools/unreal-engine/material-map.json').read_text());data=json.loads((imported/'measurements.json').read_text())
            builder.set_river_data(table['materials'],data['site']['riverSurface']);builder.set_ground_data(table['materials'],data)
            builder.build_entries({'/Game/Lunden/Materials/M_LundenGrass':table['materials']['/Game/Lunden/Materials/M_LundenGrass']})
        finally:
            master.chmod(0o444);builder.eal=original_eal
            after_build=authored(root)
            changed=[k for k in set(c['authored'])|set(after_build)if c['authored'].get(k)!=after_build.get(k)]
            result['authoredAfterBuild']=after_build;result['changedAuthored']=changed;write(out/'capture.json',result)
            if set(changed)-{target_asset} or len(after_build)!=247 or any(r['mode']&0o222 for r in after_build.values()):raise RuntimeError('Grass build protected246/readonly guard failed')
            if files(generated)!=c['generated']:raise RuntimeError('Grass build changed Generated')
        expected_authored=after_build
        builder.main(['--check']);result['normalMaterialsCheckPassed']=True;frozen()
        write(out/'authored-after-build.json',after_build)

        import capture_light
        import screenshot_level
        import prepare_nanite_materials
        state = Path('/home/devcontainers/.local/state/lunden-codex-20261127')
        helper = load('lunden2437_flash_environment', c.get('environmentHelper', str(state/'2394/verify-production.py')))
        visibility = load('lunden2437_flash_visibility', c.get('visibilityHelper', str(state/'2394/season-visibility-only.py')))
        controls = load('lunden2437_patio_controls', c.get('runtimeControls', str(state/'2421/resumed-night-source/runtime-controls.py')))
        reference_path=Path(c.get('referenceReuse', str(state/'2437/reference-reuse-check.json')))
        reference=json.loads(reference_path.read_text())
        if set(reference['cameras'])!={'entrance-a','courtyard'}:raise RuntimeError('Exact two source-bound cameras required')
        result['referenceReuseSHA256']=sha(reference_path)
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
            for key,value in (('UseClock',False),('TimeScale',0.0),('Year',2026),('Month',6),('Day',21),('Hour',14.0),('Hail',False),('Storm',False),('Rain',0.0),('Snow',0.0),('Wet',0.0),('FlashK',0.0),('FlashT',9.0)):
                rig.sky.set_editor_property(key,value,u.PropertyAccessChangeNotifyMode.NEVER)
            hidden,seasons=visibility.apply_visibility_only(world,rig.seasons,[2026,6,21],14.0)
            capture_light.update_sky_for_capture(world,rig.sky)
            for lamp,_ in lamps:lamp.call_method('TurnOff')
            capture_light.settle_furnishing_lights(world);patio=controls.refresh(world);rig.skylight.recapture_sky()
            excluded=[a for a in actors if 'kind:collision' in [str(tag)for tag in a.tags]]
            result['seasonVisibility']=seasons
            hfov=math.degrees(2*math.atan(math.tan(math.radians(72)/2)*640/360))
            for name in ('entrance-a','courtyard'):
                view=reference['cameras'][name]
                if view['date']!=[2026,6,21]or view['hour']!=14 or view['lampsOn'] or view['verticalFov']!=72 or view['width']!=1440 or view['height']!=810:raise RuntimeError('Reference view/time profile differs')
                eye=view['eyeWeb'];xyz=[eye[0]*100,eye[2]*100,eye[1]*100];yaw=270-view['yaw'];pitch=view['pitch']
                actual={'clock':{key:rig.sky.get_editor_property(key)for key in CLOCK},'MPC':{key:float(u.MaterialLibrary.get_scalar_parameter_value(world,mpc,key))for key in (*MPC_VALUES,'WindowAmbientFill','Daylight','Hour','Night','Rain','Snow')},'lamps':{lamp.get_path_name():bool(lamp.get_editor_property('IsOn'))for lamp,_ in lamps},'patio':patio,'gameBias':capture_light.game_bias(rig.sky)}
                if actual['clock']['Flash']!=0 or actual['MPC']['Flash']!=0 or any(actual['lamps'].values()):raise RuntimeError('Actual clear/off fixture differs')
                camera=helper.render(screenshot_level,world,str(out),'unreal-'+name,u.Vector(*xyz),u.Rotator(roll=0,pitch=pitch,yaw=yaw),640,360,hfov,actual['gameBias'],excluded+hidden)
                if camera['width']!=640 or camera['height']!=360 or any(abs(a-b)>1e-3 for a,b in zip(camera['xyz'],xyz))or any(abs((camera[key]-value+180)%360-180)>1e-3 for key,value in [('pitch',pitch),('yaw',yaw),('roll',0)])or abs(camera['horizontalFov']-hfov)>1e-3:raise RuntimeError('Actual source camera differs')
                shot={'name':name,'sourceCamera':view,'sourceReferenceSize':[1440,810],'actualRuntime':actual,'camera':camera,'image':'unreal-'+name+'.png','imageSHA256':helper.png(out/('unreal-'+name+'.png'))}
                result['shots'].append(shot);write(out/'capture.json',result)
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
        result.update(completed=True, capturedImages=2, all247ExactReadonly=True, generatedExact=True, sourceExportExact=True,
                      freshCanonicalExecutedHere=False, releaseGateExecutedHere=False, assetsSavedHere=bool(result['buildSaveAttempts']))
        write(out/'capture.json', result)
        u.log('LUNDEN_2437_GRASS_PAIR_OK')
    except BaseException:
        result['error'] = traceback.format_exc()
        write(out/'capture.json', result)
        raise

if __name__ == '__main__':
    load('lunden2437_flash_pair_retained', Path(__file__)).main()
