"""Root-only #2442: three new authored instances, normal ten-zone import/check, Hus L Interaction and three source-camera captures."""
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
    parser.add_argument('--config', type=Path, default=os.environ.get('LUNDEN_2442_NATIVE_CONFIG'))
    args = parser.parse_args(argv)
    if not args.config:
        raise RuntimeError('Explicit Root config required')
    c = json.loads(args.config.read_text())
    root, out = Path(c['root']).resolve(), Path(c['out']).resolve()
    if not out.is_relative_to(Path('/home/devcontainers/.local/state/lunden-codex-20261127/2442')) or out.exists():
        raise RuntimeError('Require fresh output')
    out.mkdir(parents=True)
    result = {'completed': False, 'restored': False, 'sourceHead': c['head'], 'shots': [],
              'classification': 'Three new instances +normal tenzone import/check +Hus L Interaction +13slot audits/3views; no new20/stamp/releasegate/PBR'}
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
        builder=load_builder('build_materials')
        targets={
            'mesh_portikpaving_l0_xm1375_z635_y1':'MI_LundenPatioPaving',
            'mesh_l0_xm1973_z329_y127':'MI_LundenStandardTileSplash',
            'mesh_l1_xm3611_z609_y766':'MI_LundenStandardTileSplash',
            'mesh_l0_xm2366_z534_y0':'MI_LundenStandardTileWetFloor',
            'mesh_l1_xm2397_z637_y325':'MI_LundenStandardTileWetFloor',
            'mesh_l1_xm3658_z655_y940':'MI_LundenStandardTileWetFloor',
            'mesh_l1_xm4004_z625_y640':'MI_LundenStandardTileWetFloor',
            'mesh_l0_xm2369_z624_y125':'MI_LundenStandardTileWall',
            'mesh_l1_xm2398_z637_y450':'MI_LundenStandardTileWall',
            'mesh_l1_xm3653_z655_y1065':'MI_LundenStandardTileWall',
            'mesh_l1_xm4004_z628_y765':'MI_LundenStandardTileWall'}
        original_wall={'mesh_l0_x113_z624_y125':'MI_LundenTileWall','mesh_l1_x84_z637_y450':'MI_LundenTileWall'}
        materials='/Game/Lunden/Materials/'
        new_names={'MI_LundenStandardTileSplash','MI_LundenStandardTileWetFloor','MI_LundenStandardTileWall'}
        allowed_assets={materials+n for n in new_names}
        allowed_files={'unreal/Lunden/Content/Lunden/Materials/'+n+'.uasset' for n in new_names}
        if any(k in c['authored'] or (root/k).exists() for k in allowed_files):
            raise RuntimeError('Three new paths must be absent; never overwrite foreign/existing assets')
        table=json.loads((root/'tools/unreal-engine/material-map.json').read_text())
        data=json.loads((imported/'measurements.json').read_text())
        builder.set_river_data(table['materials'],data['site']['riverSurface']);builder.set_ground_data(table['materials'],data)
        subset={path:table['materials'][path] for path in allowed_assets}
        if any(spec.get('parent')!=materials+'M_LundenTiled' for spec in subset.values()):raise RuntimeError('Unexpected instance parent')
        source_contract=json.loads(Path(c['sourceContract']).read_text())
        if subset!=source_contract['newMaterials']:raise RuntimeError('New material specs differ from pinned source contract')
        rules=[(re.compile(r['match']),re.compile(r['mesh'])if r.get('mesh')else None,r['material'])for r in table['rules']]
        key='std_ffffff_r100_m0_tex';result['sourceRuleAudit']=[]
        for node_id,name in {**targets,**original_wall}.items():
            selected=next((material for rx,mx,material in rules if rx.search(key)and(mx is None or mx.search(node_id))),None)
            result['sourceRuleAudit'].append({'id':node_id,'key':key,'selectedObjectPath':selected,'selectedPackage':selected.split('.')[0]if selected else None,'expectedPackage':materials+name})
            if selected is not None:selected=selected.split('.')[0]
            if selected!=materials+name:raise RuntimeError('Wrong source selector/catchall before build '+node_id)
        # Existing master/texture/instance dependencies must already pass, with only the three absent new instances excluded.
        dependencies=dict(table);dependencies['materials']={k:v for k,v in table['materials'].items()if k not in allowed_assets}
        builder.check(dependencies)
        original_eal=builder.eal;result['buildSaveAttempts']=[]
        class SaveScope:
            def __getattr__(self,name):return getattr(original_eal,name)
            def save_loaded_asset(self,asset,*args,**kwargs):
                path=asset.get_path_name().split('.')[0];result['buildSaveAttempts'].append(path);write(out/'capture.json',result)
                if path not in allowed_assets:raise RuntimeError('Out-of-scope authored save '+path)
                return original_eal.save_loaded_asset(asset,*args,**kwargs)
        builder.eal=SaveScope()
        try:builder.build_entries(subset)
        finally:
            builder.eal=original_eal
            for path in allowed_files:
                if (root/path).exists():(root/path).chmod(0o444)
            after=authored(root);result['authoredAfterBuild']=after;write(out/'capture.json',result)
            if any(after.get(k)!=v for k,v in c['authored'].items())or set(after)-set(c['authored'])!=allowed_files or any(r['mode']&0o222 for r in after.values()):raise RuntimeError('Protected247/new3/readonly guard failed')
        expected_authored=after
        if len(after)!=250:raise RuntimeError('Expected exactly250 authored after three new assets')
        builder.main(['--check']);result['normalMaterialsCheckPassed']=True
        frozen();write(out/'authored-after-build.json',after)
        importer=load_builder('import_world');interaction=load_builder('build_interaction')
        result['normalOperations']=['build_materials.build_entries exactly3 new instances','build_materials --check']
        glb=importer.glb_json(str(imported/'hus-l.glb'));source_nodes={n['name']:n for n in glb['nodes']if n.get('name')in targets}
        if set(source_nodes)!=set(targets):raise RuntimeError('Eleven source mesh IDs absent from actual Hus L export')
        result['sourceTextureAudit']=[]
        for node_id,node in source_nodes.items():
            source_materials=[glb['materials'][prim['material']]for prim in glb['meshes'][node['mesh']]['primitives']]
            if not source_materials or any(m.get('name')!=key for m in source_materials):raise RuntimeError('Target mixed/changed source key '+node_id)
            result['sourceTextureAudit'].append({'id':node_id,'sourceMaterials':source_materials,'expectedNative':materials+targets[node_id]})
        write(out/'capture.json',result)

        manifest=json.loads((imported/'export-manifest.json').read_text())
        zones={e['zone']for e in manifest['files']if e['kind']=='glb'}
        if len(zones)!=10 or 'hus-l' not in zones:raise RuntimeError('Require actual ten-zone manifest')
        def generated_allowed(path):return path.split('/')[0]in zones or path=='Interaction/Level_hus-l_interaction.umap'
        def stage(label):
            nonlocal expected_generated
            observed=files(generated);changed=sorted(k for k in set(c['generated'])|set(observed)if c['generated'].get(k)!=observed.get(k))
            unexpected=[k for k in changed if not generated_allowed(k)]
            result.setdefault('generatedGuards',[]).append({'phase':label,'changed':changed,'unexpected':unexpected});write(out/'capture.json',result)
            if unexpected:raise RuntimeError('Unexpected Generated writes '+str(unexpected))
            expected_generated=observed;frozen()
        importer.main([str(imported)]);result['normalOperations'].append('import_world all10 zones');stage('import-all10')
        importer.main([str(imported),'--check']);result['normalOperations'].append('import_world --check all10');stage('import-check-all10')
        interaction.check()
        door=interaction.ASSETS.load_asset(interaction.DOOR);control=interaction.ASSETS.load_asset(interaction.garage_control.PATH)
        if not door or not control:raise RuntimeError('Existing normal interaction classes missing')
        pairs=interaction.ENTRANCE_LEVELS
        try:
            interaction.ENTRANCE_LEVELS={'hus-l':pairs['hus-l']}
            result['interactionCounts']=interaction.build_entrances(door.generated_class(),data,control.generated_class())
        finally:interaction.ENTRANCE_LEVELS=pairs
        result['normalOperations'].append('build_interaction.build_entrances only hus-l; existing classes reused');stage('interaction-hus-l')
        def audit(label,actors,composed=False):
            wanted=dict(targets)
            if composed:wanted.update(original_wall)
            rows=[];seen=set()
            for actor in actors:
                level=actor.get_outer().get_path_name()
                if composed and not any('/Interaction/Level_'+z+'_interaction.'in level for z in ('hus-l','l1007')):continue
                tags={str(t)for t in actor.tags};matches=set(wanted)&tags
                if not matches:continue
                if len(matches)!=1:raise RuntimeError('Ambiguous source ID tags')
                node_id=next(iter(matches));comp=actor.get_component_by_class(u.StaticMeshComponent)
                if comp is None or comp.static_mesh is None:raise RuntimeError('Missing target mesh component '+node_id)
                actual=[comp.get_material(i).get_path_name().split('.')[0]if comp.get_material(i)else None for i in range(comp.get_num_materials())]
                expected=materials+wanted[node_id]
                row={'id':node_id,'actor':actor.get_path_name(),'level':level,'mesh':comp.static_mesh.get_path_name(),'actualMaterials':actual,'expectedMaterial':expected,'bounds':str(actor.get_actor_bounds(False))}
                rows.append(row);result.setdefault('slotAudits',{})[label]={'rows':rows,'seen':sorted(seen|{node_id})};write(out/'capture.json',result)
                if node_id in seen or not actual or any(path!=expected for path in actual):raise RuntimeError('Wrong/duplicate actual target slots '+node_id+' '+str(actual))
                seen.add(node_id)
            if seen!=set(wanted):raise RuntimeError('Missing actual target IDs '+str(set(wanted)-seen))
            result['slotAudits'][label]['passed']=True;write(out/'capture.json',result)
        u.EditorLoadingAndSavingUtils.new_blank_map(False);u.SystemLibrary.collect_garbage()
        saved=u.EditorLoadingAndSavingUtils.load_map('/Game/Lunden/Generated/Interaction/Level_hus-l_interaction')
        if not saved:raise RuntimeError('Saved Hus L Interaction reload failed')
        audit('savedInteractionReload',list(u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()))
        saved=None
        result.update(buildersExecutedHere=['three new standard instances','normal tenzone import/check','normal scoped Hus L build_entrances'],canonicalStepsExecutedHere=0,freshSyncStampWrittenHere=False,releaseGateExecutedHere=False,sourceAmbientPolicyActivatedHere=False)
        write(out/'generated-after-build.json',expected_generated)

        import capture_light
        import screenshot_level
        import prepare_nanite_materials
        state = Path('/home/devcontainers/.local/state/lunden-codex-20261127')
        helper = load('lunden2442_flash_environment', c.get('environmentHelper', str(state/'2394/verify-production.py')))
        visibility = load('lunden2442_flash_visibility', c.get('visibilityHelper', str(state/'2394/season-visibility-only.py')))
        controls = load('lunden2442_patio_controls', c.get('runtimeControls', str(state/'2421/resumed-night-source/runtime-controls.py')))
        views=c['views']
        locked=json.loads(Path(c['cameraContract']).read_text())
        expected_views=[{'name':v['name'],'eyeWeb':[v['x'],v['feetY']+locked['standingEyeHeightM'],v['z']],'yaw':v['yawDeg'],'pitch':v['pitchDeg'],'verticalFov':locked['verticalFovDeg'],'date':v['date'],'hour':v['hour'],'lampsOn':v['lamps']=='all'}for v in locked['views']]
        if views!=expected_views:raise RuntimeError('Views differ from exact pre-Native locked camera contract')
        if len(views)!=3 or {v['name']for v in views}!={'portik','standard-wetroom','standard-splash'}:raise RuntimeError('Three locked source camera contracts required')
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
                if view['verticalFov']!=72 or view['lampsOn']!=(name!='portik') or hour!=14 or date!=[2026,6,21]:raise RuntimeError('Locked source daylight/normal lamp profile differs')
                for key,value in (('UseClock',False),('TimeScale',0.0),('Year',date[0]),('Month',date[1]),('Day',date[2]),('Hour',hour),('Hail',False),('Storm',False),('Rain',0.0),('Snow',0.0),('Wet',0.0),('FlashK',0.0),('FlashT',9.0)):
                    rig.sky.set_editor_property(key,value,u.PropertyAccessChangeNotifyMode.NEVER)
                hidden,seasons=visibility.apply_visibility_only(world,rig.seasons,date,hour)
                capture_light.update_sky_for_capture(world,rig.sky)
                for lamp,_ in lamps:lamp.call_method('TurnOn' if view['lampsOn'] else 'TurnOff')
                capture_light.settle_furnishing_lights(world);patio=controls.refresh(world);rig.skylight.recapture_sky()
                actual={'clock':{key:rig.sky.get_editor_property(key)for key in CLOCK},'MPC':{key:float(u.MaterialLibrary.get_scalar_parameter_value(world,mpc,key))for key in (*MPC_VALUES,'WindowAmbientFill','Daylight','Hour','Night','Rain','Snow')},'lamps':{lamp.get_path_name():bool(lamp.get_editor_property('IsOn'))for lamp,_ in lamps},'patio':patio,'gameBias':capture_light.game_bias(rig.sky)}
                if actual['clock']['Flash']!=0 or actual['MPC']['Flash']!=0 or not actual['lamps'] or any(on!=view['lampsOn'] for on in actual['lamps'].values()):raise RuntimeError('Actual clear/source-lamp fixture differs')
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
        result.update(completed=True, capturedImages=3, authored250Readonly=True, protectedOriginal247ExactReadonly=True, generatedExactAfterImportInteraction=True, sourceExportExact=True,
                      freshCanonicalExecutedHere=False, releaseGateExecutedHere=False, assetsSavedHere='Three new standard instances +Generated all10 imported zones +Interaction/Level_hus-l_interaction')
        write(out/'capture.json', result)
        u.log('LUNDEN_2442_IMPORT_INTERACTION_CAPTURE_OK')
    except BaseException:
        result['error'] = traceback.format_exc()
        write(out/'capture.json', result)
        raise

if __name__ == '__main__':
    load('lunden2442_flash_pair_retained', Path(__file__)).main()
