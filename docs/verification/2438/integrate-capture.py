"""Root-only #2438 normal kvarteret import +scoped Interaction copy +three composed-world captures; authored readonly."""
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
    parser.add_argument('--config', type=Path, default=os.environ.get('LUNDEN_2438_NATIVE_CONFIG'))
    args = parser.parse_args(argv)
    if not args.config:
        raise RuntimeError('Explicit Root config required')
    c = json.loads(args.config.read_text())
    root, out = Path(c['root']).resolve(), Path(c['out']).resolve()
    if not out.is_relative_to(Path('/home/devcontainers/.local/state/lunden-codex-20261127/2438')) or out.exists():
        raise RuntimeError('Require fresh output')
    out.mkdir(parents=True)
    result = {'completed': False, 'restored': False, 'sourceHead': c['head'], 'shots': [],
              'classification': 'Actual onezone import/check +normal scoped Interaction build +saved/composed shadow audit/3views; no new20/releasegate/PBR'}
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
        if len(c['authored'])!=247:raise RuntimeError('Require restored public247 baseline, no Grass trial assets')
        sys.path[:0]=[str(root/'tools/unreal-engine/python'),str(root/'tools/unreal-engine/tests')]
        def load_builder(name):
            if name in sys.modules:raise RuntimeError('Builder already imported '+name)
            path=root/'tools/unreal-engine/python'/(name+'.py');tree=ast.parse(path.read_text(),filename=str(path));body=[]
            for node in tree.body:
                direct=isinstance(node,ast.Expr)and isinstance(node.value,ast.Call)and isinstance(node.value.func,ast.Name)and node.value.func.id=='main'
                guarded=isinstance(node,ast.If)and ast.dump(node.test)==ast.dump(ast.parse("__name__ == '__main__'").body[0].value)
                if not(direct or guarded):body.append(node)
            tree.body=body;module=types.ModuleType(name);module.__file__=str(path);sys.modules[name]=module;_KEEP.append(module);exec(compile(tree,str(path),'exec'),module.__dict__);return module
        importer=load_builder('import_world');interaction=load_builder('build_interaction')
        result['normalOperations']=[]
        def generated_allowed(path):return path.startswith('kvarteret/')or path=='Interaction/Level_kvarteret_interaction.umap'
        def stage(label):
            nonlocal expected_generated
            observed=files(generated);changed=sorted(k for k in set(c['generated'])|set(observed)if c['generated'].get(k)!=observed.get(k))
            unexpected=[k for k in changed if not generated_allowed(k)]
            result.setdefault('generatedGuards',[]).append({'phase':label,'changed':changed,'unexpected':unexpected});write(out/'capture.json',result)
            if unexpected:raise RuntimeError('Unexpected Generated writes '+str(unexpected))
            expected_generated=observed;frozen()
        importer.main([str(imported),'--zones','kvarteret']);result['normalOperations'].append('import_world --zones kvarteret');stage('import')
        importer.main([str(imported),'--zones','kvarteret','--check']);result['normalOperations'].append('import_world --zones kvarteret --check');stage('import-check')
        data=json.loads((imported/'measurements.json').read_text())
        interaction.check() # verifies existing class hashes/graphs; no build/save.
        door=interaction.ASSETS.load_asset(interaction.DOOR);control=interaction.ASSETS.load_asset(interaction.garage_control.PATH)
        if not door or not control:raise RuntimeError('Existing normal interaction classes missing')
        pairs=interaction.ENTRANCE_LEVELS
        try:
            interaction.ENTRANCE_LEVELS={'kvarteret':pairs['kvarteret']}
            result['interactionCounts']=interaction.build_entrances(door.generated_class(),data,control.generated_class())
        finally:interaction.ENTRANCE_LEVELS=pairs
        result['normalOperations'].append('build_interaction.build_entrances only kvarteret; existing classes reused')
        stage('interaction-kvarteret')
        overrides={'mesh_l0_xm3059_z3497_y600','mesh_l0_xm3059_z3497_y600_2','mesh_loggiarails_l0_xm3059_z3498_y653','mesh_l1_xm3059_z3497_y1307'}
        extras={zone:importer.node_extras(str(imported/(zone+'.glb')))for zone in ('kvarteret','hus-l')}
        if {k for k,v in extras['kvarteret'].items()if v.get('unrealArchitectureShadow') is True}!=overrides:raise RuntimeError('Actual four explicit source overrides differ')
        def audit(label,actors,composed=False):
            rows=[];seen=set();counts={'markedSourceFalse':0,'unmarkedSourceFalse':0,'sourceTrueOrDefault':0};houses={}
            for actor in actors:
                package=actor.get_outer().get_path_name()
                zone='kvarteret'
                if composed:
                    if '/Interaction/Level_kvarteret_interaction.'in package:zone='kvarteret'
                    elif '/Interaction/Level_hus-l_interaction.'in package:zone='hus-l'
                    else:continue
                tags=[str(t)for t in actor.tags];matches=[t for t in tags if t in extras[zone]]
                if len(matches)!=1:continue
                node_id=matches[0];ex=extras[zone][node_id];comp=actor.get_component_by_class(u.StaticMeshComponent)
                if not comp:continue
                actual=bool(comp.get_editor_property('cast_shadow'));expected=importer.casts_shadow(ex)
                key='markedSourceFalse'if ex.get('castShadow') is False and ex.get('unrealArchitectureShadow') is True else'unmarkedSourceFalse'if ex.get('castShadow') is False else'sourceTrueOrDefault'
                counts[key]+=1
                for tag in tags:
                    if tag.startswith('house:'):houses[tag]=houses.get(tag,0)+1
                rows.append({'id':node_id,'zone':zone,'actor':actor.get_path_name(),'level':package,'sourceCastShadow':ex.get('castShadow',True),'unrealArchitectureShadow':ex.get('unrealArchitectureShadow',False),'actualCastShadow':actual,'expected':expected,'class':comp.get_class().get_name()})
                if actual!=expected:raise RuntimeError('Actual shadow flag differs: '+node_id)
                if node_id in overrides:seen.add(node_id)
            if seen!=overrides:raise RuntimeError('Actual saved/composed four override actors missing '+str(overrides-seen))
            result.setdefault('shadowAudits',{})[label]={'rows':rows,'counts':counts,'houseTagCounts':houses,'allFourOverridesPresent':True};write(out/'capture.json',result)
        # Actual reload of the saved Interaction map before the final composed map.
        u.EditorLoadingAndSavingUtils.new_blank_map(False);u.SystemLibrary.collect_garbage()
        saved=u.EditorLoadingAndSavingUtils.load_map('/Game/Lunden/Generated/Interaction/Level_kvarteret_interaction')
        if not saved:raise RuntimeError('Saved Interaction reload failed')
        audit('savedInteractionReload',list(u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()))
        saved=None
        result.update(buildersExecutedHere=['normal onezone import','normal scoped build_entrances'],canonicalStepsExecutedHere=0,freshSyncStampWrittenHere=False,releaseGateExecutedHere=False,sourceAmbientPolicyActivatedHere=False)
        write(out/'generated-after-build.json',expected_generated)

        import capture_light
        import screenshot_level
        import prepare_nanite_materials
        state = Path('/home/devcontainers/.local/state/lunden-codex-20261127')
        helper = load('lunden2438_flash_environment', c.get('environmentHelper', str(state/'2394/verify-production.py')))
        visibility = load('lunden2438_flash_visibility', c.get('visibilityHelper', str(state/'2394/season-visibility-only.py')))
        controls = load('lunden2438_patio_controls', c.get('runtimeControls', str(state/'2421/resumed-night-source/runtime-controls.py')))
        views=c['views']
        if len(views)!=3 or {v['name']for v in views}!={'entrance-a','courtyard','facade-c-day'}:raise RuntimeError('Three locked source camera contracts required')
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
            audit('actualComposedWorld',actors,composed=True)
            excluded=[a for a in actors if 'kind:collision' in [str(tag)for tag in a.tags]]
            hfov=math.degrees(2*math.atan(math.tan(math.radians(72)/2)*640/360))
            for view in views:
                name=view['name'];date=view['date'];hour=view['hour'];eye=view['eyeWeb'];xyz=[eye[0]*100,eye[2]*100,eye[1]*100];yaw=270-view['yaw'];pitch=view['pitch']
                if view['verticalFov']!=72 or view['lampsOn'] or hour!=14 or date not in([2026,6,21],[2026,11,16]):raise RuntimeError('Locked source daylight profile differs')
                for key,value in (('UseClock',False),('TimeScale',0.0),('Year',date[0]),('Month',date[1]),('Day',date[2]),('Hour',hour),('Hail',False),('Storm',False),('Rain',0.0),('Snow',0.0),('Wet',0.0),('FlashK',0.0),('FlashT',9.0)):
                    rig.sky.set_editor_property(key,value,u.PropertyAccessChangeNotifyMode.NEVER)
                hidden,seasons=visibility.apply_visibility_only(world,rig.seasons,date,hour)
                capture_light.update_sky_for_capture(world,rig.sky)
                for lamp,_ in lamps:lamp.call_method('TurnOff')
                capture_light.settle_furnishing_lights(world);patio=controls.refresh(world);rig.skylight.recapture_sky()
                actual={'clock':{key:rig.sky.get_editor_property(key)for key in CLOCK},'MPC':{key:float(u.MaterialLibrary.get_scalar_parameter_value(world,mpc,key))for key in (*MPC_VALUES,'WindowAmbientFill','Daylight','Hour','Night','Rain','Snow')},'lamps':{lamp.get_path_name():bool(lamp.get_editor_property('IsOn'))for lamp,_ in lamps},'patio':patio,'gameBias':capture_light.game_bias(rig.sky)}
                if actual['clock']['Flash']!=0 or actual['MPC']['Flash']!=0 or any(actual['lamps'].values()):raise RuntimeError('Actual clear/off fixture differs')
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
        result.update(completed=True, capturedImages=3, all247ExactReadonly=True, protected247ExactReadonly=True, generatedExactAfterImportInteraction=True, sourceExportExact=True,
                      freshCanonicalExecutedHere=False, releaseGateExecutedHere=False, assetsSavedHere='Generated kvarteret +Interaction/Level_kvarteret_interaction only')
        write(out/'capture.json', result)
        u.log('LUNDEN_2438_IMPORT_INTERACTION_CAPTURE_OK')
    except BaseException:
        result['error'] = traceback.format_exc()
        write(out/'capture.json', result)
        raise

if __name__ == '__main__':
    load('lunden2438_flash_pair_retained', Path(__file__)).main()
