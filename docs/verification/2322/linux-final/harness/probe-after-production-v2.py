"""Private #2322: source/texture properties + original day/evening/upper views.
Root alone launches, owns readonly package guards and reserves the editor.
Called after the separate full canonical Generated build. No implicit builds/saves; all light, visibility and Nanite mutations are transient.
--root NATIVE_CHECKOUT --out NEW_PRIVATE_DIRECTORY [--upper]
"""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys
from types import ModuleType
import unreal as u

STATE = Path('/home/devcontainers/.local/state/lunden-codex-20261127')
_KEEP = []


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    sys.modules[name] = result
    spec.loader.exec_module(result)
    _KEEP.append(result)
    return result


def write(path, data):
    path.write_text(json.dumps(data, indent=2, allow_nan=False) + '\n')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def value(x):
    if x is None or isinstance(x, (int, float, str, bool)):
        return x
    if isinstance(x, u.Vector):
        return [x.x, x.y, x.z]
    if isinstance(x, u.LinearColor):
        return [x.r, x.g, x.b, x.a]
    if isinstance(x, u.Object):
        return x.get_path_name()
    return str(x)


def material(mat):
    result = {'path': mat.get_path_name(), 'class': mat.get_class().get_name(),
              'effectiveBlendMode': str(mat.get_blend_mode()), 'parameters': {}, 'chain': []}
    if isinstance(mat, u.MaterialInstance):
        for kind in ('scalar', 'vector', 'texture', 'static_switch'):
            params = {}
            for name in getattr(u.MaterialEditingLibrary, 'get_' + kind + '_parameter_names')(mat):
                if isinstance(mat, u.MaterialInstanceDynamic) and kind != 'static_switch':
                    actual = getattr(mat, 'get_' + kind + '_parameter_value')(name)
                else:
                    source = mat.get_editor_property('parent') if isinstance(mat, u.MaterialInstanceDynamic) else mat
                    actual = getattr(u.MaterialEditingLibrary, 'get_material_instance_' + kind + '_parameter_value')(source, name)
                if isinstance(actual, u.Texture):
                    actual = {'path': actual.get_path_name(),
                              **{p: value(actual.get_editor_property(p)) for p in ('srgb', 'compression_settings', 'filter')}}
                else:
                    actual = value(actual)
                params[str(name)] = actual
            result['parameters'][kind] = params
    seen = set()
    while isinstance(mat, u.MaterialInstance):
        if mat.get_path_name() in seen:
            raise RuntimeError('Cyclic material inheritance')
        seen.add(mat.get_path_name())
        overrides = mat.get_editor_property('base_property_overrides')
        result['chain'].append({'path': mat.get_path_name(), 'baseOverrides':
            {p: value(overrides.get_editor_property(p)) for p in ('override_blend_mode', 'blend_mode',
                    'override_two_sided', 'two_sided', 'override_shading_model', 'shading_model')}})
        mat = mat.get_editor_property('parent')
    if not isinstance(mat, u.Material):
        raise RuntimeError('Material chain lacks master')
    result['master'] = {'path': mat.get_path_name(), **{p: value(mat.get_editor_property(p)) for p in
                       ('shading_model', 'blend_mode', 'two_sided', 'translucency_lighting_mode', 'translucency_pass')}}
    return result


def actual_pools(world):
    import build_display_pools as display
    import display_pools
    project = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
    data = json.loads((project/'Import/measurements.json').read_text())['furnishing']['displayPools']
    order = display_pools.lamps(data)
    mpc = u.load_asset(display.MPC)
    drivers = {str(a.tags[1]): a for a in u.GameplayStatics.get_all_actors_with_tag(world, display.DRIVER)}
    if set(drivers) != set(order):
        raise RuntimeError('Actual pool controllers differ from real source lamp IDs')
    result = []
    for index, lamp_id in enumerate(order):
        driver = drivers[lamp_id]
        driver.call_method('UpdateDisplayPool')
        lamp = driver.get_editor_property('SourceLamp')
        if not lamp:
            raise RuntimeError('No real source lamp resolved for '+lamp_id)
        fade = float(driver.get_editor_property('AppliedFade'))
        scalar = float(u.MaterialLibrary.get_scalar_parameter_value(world, mpc, 'Lamp'+str(index)))
        if abs(fade-scalar) > 1e-6:
            raise RuntimeError('Controller fade/MPC mismatch')
        result.append({'sourceLampId': lamp_id, 'sourceLamp': lamp.get_path_name(),
                       'K': float(lamp.get_editor_property('K')),
                       'isOn': bool(lamp.get_editor_property('IsOn')),
                       'hidden': bool(lamp.get_editor_property('hidden')),
                       'AppliedFade': fade, 'collectionParameter': 'Lamp'+str(index), 'actualMPC': scalar})
    return result


def fade_controls(world, out):
    import build_display_pools as display
    import display_pools
    project = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
    data = json.loads((project/'Import/measurements.json').read_text())['furnishing']['displayPools']
    order = display_pools.lamps(data)
    by_tag = {str(t): a for a in u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors() for t in a.tags}
    drivers = {str(a.tags[1]): a for a in u.GameplayStatics.get_all_actors_with_tag(world, display.DRIVER)}
    weather = u.load_asset('/Game/Lunden/Lighting/MPC_LundenWeather')
    power = float(u.MaterialLibrary.get_scalar_parameter_value(world, weather, 'PowerAvailable'))
    report = []
    for index, lamp_id in enumerate(order):
        lamp = by_tag['lamp:'+lamp_id]
        saved = {p: lamp.get_editor_property(p) for p in ('K', 'IsOn', 'Candela', 'Supply')}
        hidden = bool(lamp.get_editor_property('hidden'))
        try:
            lamp.set_actor_hidden_in_game(False)
            for k, supply in ((1.,1.),(.25,1.),(0.,1.),(.1,1.),(1.,0.)):
                lamp.set_editor_property('K', k, u.PropertyAccessChangeNotifyMode.NEVER)
                u.MaterialLibrary.set_scalar_parameter_value(world, weather, 'PowerAvailable', supply)
                actual = actual_pools(world)[index]
                if abs(actual['actualMPC']-k*supply) > 1e-6:
                    raise RuntimeError('Actual native source K/power control failed')
                report.append({'K': k, 'power': supply, 'expected': k*supply, **actual})
            if lamp.get_editor_property('Candela') != saved['Candela'] or lamp.get_editor_property('Supply') != saved['Supply']:
                raise RuntimeError('Fade fixture changed real source light units')
        finally:
            lamp.set_actor_hidden_in_game(hidden)
            for key, val in saved.items():
                lamp.set_editor_property(key, val, u.PropertyAccessChangeNotifyMode.NEVER)
            u.MaterialLibrary.set_scalar_parameter_value(world, weather, 'PowerAvailable', power)
            drivers[lamp_id].call_method('UpdateDisplayPool')
    write(out/'fade-controls.json', {'checks': report, 'passed': True,
                                    'scope': 'actual Blueprint K/power/MPC state; pixel acceptance is separate'})
    return {'checks': len(report), 'passed': True, 'scope': 'actual source controller state, not rendered fade image proof'}


def cabinet_profile(world):
    import build_cabinet_washes as cabinet
    project = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
    data = json.loads((project/'Import/measurements.json').read_text())
    [row] = [r for r in data['lights'] if 'cabinetWashes' in r]
    original = u.load_asset('/Game/Lunden/Generated/l1007/Materials/'+row['cabinetWashes']['veneerKey'])
    base = u.MaterialEditingLibrary.get_material_instance_vector_parameter_value(original, 'BaseColorFactor')
    weather = u.load_asset('/Game/Lunden/Lighting/MPC_LundenWeather')
    day = float(u.MaterialLibrary.get_scalar_parameter_value(world, weather, 'Daylight'))
    if not 0 <= day <= 1:
        raise RuntimeError('Invalid actual Daylight for cabinet profile')
    expected = [c*(n+(d-n)*day) for c,d,n in zip((base.r,base.g,base.b),cabinet.VENEER_FACTOR,cabinet.VENEER_NIGHT_FACTOR)]
    found=[]
    for actor in u.GameplayStatics.get_all_actors_with_tag(world, cabinet.TAG):
        panels=list(actor.get_editor_property('VeneerPanels'))
        if not panels:
            continue
        if len(panels)!=4 or not actor.get_editor_property('VeneerApplied'):
            raise RuntimeError('Actual veneer controller did not apply to all four leaves')
        for panel in panels:
            if not any(str(t).startswith(row['id']+'__') for t in panel.tags):
                raise RuntimeError('Veneer profile escaped the source display cabinet')
            mat=panel.get_component_by_class(u.StaticMeshComponent).get_material(0)
            if not isinstance(mat,u.MaterialInstanceDynamic):
                raise RuntimeError('Expected real applied veneer MID')
            colour=mat.get_vector_parameter_value('BaseColorFactor')
            if max(abs(a-b) for a,b in zip((colour.r,colour.g,colour.b),expected))>1e-5 or abs(colour.a-base.a)>1e-6:
                raise RuntimeError('Actual cabinet MID differs from source base times declared day/night guess or changed alpha')
            found.append({'actor':panel.get_path_name(),'material':mat.get_path_name(),'actualBaseColor':value(colour)})
    if len(found)!=4:
        raise RuntimeError('Expected exactly one source veneer controller and four target panels')
    return {'passed':True,'Daylight':day,'expectedRGB':expected,'panels':found,
            'assumption':'guess: day/night interpolation; texture, UVs, original material and alpha inherited'}


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--upper', action='store_true')
    args = parser.parse_args(argv)
    root, out = args.root.resolve(), args.out.resolve()
    if not out.is_relative_to(STATE / '2322-final') or (out.exists() and any(out.iterdir())):
        raise RuntimeError('Output must be a fresh private S/2322-final child')
    if Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())).resolve() != root / 'unreal/Lunden':
        raise RuntimeError('Wrong native project')
    sys.path[:0] = [str(root / 'tools/unreal-engine/tests'), str(root / 'tools/unreal-engine/python')]
    import capture_light
    import screenshot_level
    import prepare_nanite_materials
    helper = load('lunden2322_verified_capture', STATE / '2394/verify-production.py')
    visibility = load('lunden2322_visibility', STATE / '2394/season-visibility-only.py')
    runtime_path = STATE / '2394/runtime-web-env.json'
    runtime = json.loads(runtime_path.read_text())
    measurement_path = root / 'unreal/Lunden/Import/measurements.json'
    measurements = json.loads(measurement_path.read_text())
    historical = json.loads((STATE / '2322/furnishing-measurement-contract.json').read_text())
    names = set()
    for row in historical['families'].values():
        for item in row.get('materials', []):
            names.update(item['meshes'])
    for row in measurements['furnishing']['curtains']:
        names.update(row['nodes'])
    world = u.EditorLoadingAndSavingUtils.load_map('/Game/Lunden/Maps/L_Lunden')
    if not world:
        raise RuntimeError('Missing real composed L_Lunden')
    rig = capture_light.light_for(world)
    if not isinstance(rig, capture_light.MapLight):
        raise RuntimeError('Expected composed production light')
    _KEEP.extend([world, rig])
    actors = list(u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors())
    targets = [a for a in actors if any(str(t) in names for t in a.tags)]
    found = {str(t) for a in targets for t in a.tags if str(t) in names}
    if found != names:
        raise RuntimeError('Missing exact target meshes: ' + repr(sorted(names - found)))
    excluded = [a for a in actors if 'kind:collision' in [str(t) for t in a.tags]]
    for setting in ('r.Shadow.Virtual.Enable 0', 'r.SeparateTranslucency 1', 'r.ShadowQuality 3',
                    'r.Shadow.MaxResolution 1024', 'r.Shadow.MaxCSMResolution 1024',
                    'r.Shadow.CSM.MaxCascades 3', 'r.Shadow.DistanceScale 1'):
        u.SystemLibrary.execute_console_command(world, setting)
    nanite = 0
    # Same in-memory fallback as the delivered #2394 baseline; #2478 owns optimizing this cost.
    for path in u.EditorAssetLibrary.list_assets('/Game/Lunden/Generated', recursive=True, include_folder=False):
        if '/StaticMeshes/' not in path:
            continue
        mesh = u.EditorAssetLibrary.load_asset(path)
        settings = mesh.get_editor_property('nanite_settings') if isinstance(mesh, u.StaticMesh) else None
        if settings and settings.get_editor_property('enabled'):
            settings.set_editor_property('enabled', False)
            prepare_nanite_materials.static_mesh_editor().set_nanite_settings(mesh, settings, True)
            nanite += 1
    out.mkdir(parents=True)
    result = {'completed': False, 'sourceSha256': {str(p): digest(p) for p in
              (Path(__file__), Path(capture_light.__file__), Path(screenshot_level.__file__),
               Path(helper.__file__), Path(visibility.__file__))},
              'measurementsSHA256': digest(measurement_path), 'runtimeWebEnvSHA256': digest(runtime_path),
              'contractSHA256': digest(STATE / '2322-final/locked-crop-contract.json'),
              'loadedLevels': rig.seasons.loaded_levels, 'naniteOffInMemory': nanite,
              'profile': 'LinuxCPU, conventional shadows3,1024,3cascades, SeparateTranslucency1, LumenFalse; FXAA method1, AAquality not recorded',
              'shots': [], 'targetMeshCount': len(targets)}
    result['actualCVars'] = {n: u.SystemLibrary.get_console_variable_int_value(n) for n in ('r.AntiAliasingMethod', 'r.PostProcessAAQuality', 'r.ShadowQuality', 'r.LightFunctionQuality', 'r.SeparateTranslucency')}
    write(out / 'capture.json', result)
    result['fadeControls'] = fade_controls(world, out)
    controls = [('living-room-day', 'day14-clear', [2.5, 1.62, 8.2], 173, -4, False),
                ('living-room-evening', 'evening22-clear', [2.5, 1.62, 8.2], 173, -4, True)]
    if args.upper:
        controls.append(('upper-floor-evening', 'evening22-clear', [1.75, 4.87, 7.95], 170, -3, True))
    for name, key, eye, yaw, pitch, lamps in controls:
        hidden, season = helper.set_clock(rig, runtime['views'][key], lamps, capture_light, visibility)
        mpc = u.load_asset('/Game/Lunden/Lighting/MPC_LundenWeather')
        actual_runtime = helper.probe(world, rig, mpc, runtime['views'][key], measurements['site']['sky']['light'])
        controllers = []
        for actor in u.GameplayStatics.get_all_actors_with_tag(world, 'lunden:rug-floor-pool'):
            lamp = actor.get_editor_property('SourceLamp')
            controllers.append({'path': actor.get_path_name(), 'receiver': value(actor.get_editor_property('Receiver')),
                                'appliedFade': float(actor.get_editor_property('AppliedFade')), 'sourceLamp': value(lamp),
                                'lampK': float(lamp.get_editor_property('K')) if lamp else None})
        capture_light.settle_furnishing_lights(world)
        pool_state = actual_pools(world)
        cabinet_state = cabinet_profile(world)
        # Record actual dynamic curtain/rug parameters after canonical settle, before capture.
        materials = {}
        meshes = []
        for actor in targets:
            comp = actor.get_component_by_class(u.StaticMeshComponent)
            if not comp or not comp.static_mesh:
                raise RuntimeError('Target lacks its original StaticMeshComponent')
            actual = list(comp.get_materials())
            for mat in actual:
                if mat.get_path_name() not in materials:
                    materials[mat.get_path_name()] = material(mat)
            meshes.append({'tags': [str(t) for t in actor.tags], 'mesh': comp.static_mesh.get_path_name(),
                           'materials': [m.get_path_name() for m in actual],
                           'castShadow': bool(comp.get_editor_property('cast_shadow'))})
        write(out / (name + '-materials.json'), {'meshes': meshes, 'materials': materials})
        fov = math.degrees(2 * math.atan(math.tan(math.radians(72) / 2) * 640 / 360))
        camera = helper.render(screenshot_level, world, str(out), 'unreal-' + name,
                               u.Vector(eye[0] * 100, eye[2] * 100, eye[1] * 100),
                               u.Rotator(roll=0, pitch=pitch, yaw=270-yaw), 640, 360, fov,
                               capture_light.game_bias(rig.sky), excluded + hidden)
        image = out / ('unreal-' + name + '.png')
        result['shots'].append({'id': name, 'camera': camera, 'imageSHA256': helper.png(image),
                                'seasonVisibility': season, 'actualRuntime': actual_runtime, 'rugControllers': controllers, 'displayPoolControllers': pool_state, 'cabinetProfile': cabinet_state, 'exposureBias': capture_light.game_bias(rig.sky)})
        write(out / 'capture.json', result)
    result['completed'] = True
    write(out / 'capture.json', result)
    u.log('LUNDEN_2322_CURRENT_PRODUCTION_PROBE_OK')


if __name__ == '__main__':
    context = ModuleType('lunden_private2322_current_production')
    context.__file__ = __file__
    sys.modules[context.__name__] = context
    exec(compile(Path(__file__).read_text(), __file__, 'exec'), context.__dict__)
    context.main(sys.argv[1:])
