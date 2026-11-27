"""#2394: source-owned ambient-diffuse window daylight material.

build() mutates only its named material graph in memory. Its caller owns asset locks,
transaction/save and the sky actor/MPC integration. No import-time main or asset writes.
Legacy default-lit opaque receivers only; visibility remains an export snapshot.
"""
import hashlib
import json
import math

import unreal as u

import collection_ids
import window_light

PATH = '/Game/Lunden/Lighting/M_LundenWindowDaylight'
CUBE = '/Game/Lunden/Lighting/T_LundenHemisphere'
STAMP = 'Lunden.WindowDaylight'
SCENES = {
    'Scene': 'PPI_POST_PROCESS_INPUT0', 'N': 'PPI_WORLD_NORMAL',
    'Diffuse': 'PPI_DIFFUSE_COLOR', 'MaterialAO': 'PPI_MATERIAL_AO',
    'ScreenAO': 'PPI_AMBIENT_OCCLUSION', 'ShadingModel': 'PPI_SHADING_MODEL_ID',
}
PARAMS = {
    'DayShare': 'Daylight', 'SkyStrength': 'WindowSkyStrength',
    'SunIntensity': 'WindowSunStrength', 'SunDirNative': 'SunDir',
    'AmbientFill': 'WindowAmbientFill',
}
INPUTS = (*SCENES, 'WPos', 'Cam', 'Cube', *PARAMS)


def _colors(data):
    window_light.validate(data)
    colors = data.get('runtimeColors')
    if not isinstance(colors, dict) or colors.get('space') != 'linear-srgb':
        raise ValueError('Window daylight production material requires runtimeColors in linear-srgb')
    for name in ('skyDay', 'skyNight', 'sunLow', 'sunHigh', 'moon'):
        value = colors.get(name)
        if not isinstance(value, (list, tuple)) or len(value) != 3 or any(
                isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0
                for v in value):
            raise ValueError('Window daylight requires finite nonnegative linear runtimeColors.' + name)
    return colors


def _float(value):
    text = format(float(value), '.17g')
    return text if '.' in text or 'e' in text.lower() else text + '.0'


def _rgb(value):
    return 'float3(' + ','.join(_float(v) for v in value) + ')'


def code(data):
    """Complete Custom expression, exact web source colours and initial 1/pi native conversion."""
    colors = _colors(data)
    return window_light.hlsl(data) + r'''
WebWindowDaylight win;
float3 p = float3(WPos.x,WPos.z,WPos.y)*0.01;
float3 camera = float3(Cam.x,Cam.z,Cam.y)*0.01;
// The legacy GBuffer's raw DEFAULT_LIT shading-model ID is 1.
if (ShadingModel.r < 0.5 || ShadingModel.r > 1.5 || !win.active(p,camera,DayShare)) return Scene.rgb;
float3 normal = normalize(N.rgb);
float3 nWeb = float3(normal.x,normal.z,normal.y);
float3 sunDirWeb = float3(SunDirNative.x,SunDirNative.z,SunDirNative.y);
float3 skyRgb = lerp(''' + _rgb(colors['skyNight']) + ',' + _rgb(colors['skyDay']) + r''',DayShare);
float3 sunRgb = sunDirWeb.y < -0.02 ? ''' + _rgb(colors['moon']) + ' : lerp(' + _rgb(colors['sunLow']) + ',' + _rgb(colors['sunHigh']) + r''',smoothstep(0.05,0.4,sunDirWeb.y));
uint width, height, mipCount;
Cube.GetDimensions(0,width,height,mipCount);
// SetupAmbientCubemapParameters: log2(surfaceWidth)+1-GDiffuseConvolveMipLevel(4).
float diffuseMip = log2((float)width)+1.0-4.0;
float3 H = TextureCubeSampleLevel(Cube,CubeSampler,normal,diffuseMip).rgb*AmbientFill;
float3 added = win.irradiance(p,nWeb,camera,DayShare,SkyStrength,skyRgb,sunDirWeb,SunIntensity,sunRgb);
// Initial Lambert irradiance-to-radiance conversion; no fitted RGB or exposure factor.
float3 desired = H*win.base_factor(DayShare)*win.tint(DayShare)+added*''' + _float(1 / math.pi) + r''';
// Remove the native cube with its screen occlusion, then add web window light.
// The web irradiance already includes window visibility; multiplying its result
// by native screen-space AO adds a second, screen-dependent halo absent on web.
return Scene.rgb + Diffuse.rgb*MaterialAO.r*(desired-H*ScreenAO.r)*View.OneOverPreExposure;
'''


def _ids(mpc):
    if not isinstance(mpc, u.MaterialParameterCollection):
        raise ValueError('Window daylight requires the real weather MaterialParameterCollection')
    # Read the supplied object, including unsaved new parameters created by the caller.
    # Parameter struct Id is protected; export_text is the established #2408 path.
    import re
    have = {}
    for prop in ('scalar_parameters', 'vector_parameters'):
        for parameter in mpc.get_editor_property(prop):
            name = str(parameter.get_editor_property('parameter_name'))
            match = re.search(r'Id=([0-9A-F]{32})', parameter.export_text())
            if match:
                have[name] = (prop, match.group(1))
    wanted = {}
    for name in PARAMS.values():
        kind = 'vector_parameters' if name == 'SunDir' else 'scalar_parameters'
        if name not in have or have[name][0] != kind:
            raise ValueError('Window daylight MPC missing/wrong parameter type: ' + name)
        wanted[name] = have[name][1]
    return wanted


def _stamp(data, mpc):
    payload = {'code': code(data), 'collection': mpc.get_path_name(), 'parameterIds': _ids(mpc)}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def _output_name(custom, source):
    value = u.MaterialEditingLibrary.get_input_node_output_name_for_material_expression(custom, source)
    # bool+out FString is normally exposed as str/None; accept the equivalent tuple
    # form as well, without treating a failed query as a valid unnamed output.
    if isinstance(value, tuple):
        return value[-1] if value and value[0] is not False else None
    return value


def graph_matches(material, data, mpc):
    """Strict read-only graph + current collection GUID check; no exists-only reuse."""
    expected = _stamp(data, mpc)  # invalid source/MPC is an error, not a reason to rebuild blindly
    if not isinstance(material, u.Material):
        return False
    props = {
        'material_domain': u.MaterialDomain.MD_POST_PROCESS,
        'blendable_location': u.BlendableLocation.BL_SCENE_COLOR_BEFORE_DOF,
        'blendable_priority': -10, 'disable_pre_exposure_scale': False, 'is_blendable': True,
    }
    if any(material.get_editor_property(name) != value for name, value in props.items()):
        return False
    if collection_ids.unresolved(material) or u.EditorAssetLibrary.get_metadata_tag(material, STAMP) != expected:
        return False
    mel = u.MaterialEditingLibrary
    custom = mel.get_material_property_input_node(material, u.MaterialProperty.MP_EMISSIVE_COLOR)
    if not isinstance(custom, u.MaterialExpressionCustom) or custom.get_editor_property('code') != code(data) \
            or custom.get_editor_property('output_type') != u.CustomMaterialOutputType.CMOT_FLOAT3:
        return False
    names = list(mel.get_material_expression_input_names(custom))
    nodes = list(mel.get_inputs_for_material_expression(material, custom))
    if names != list(INPUTS) or len(nodes) != len(INPUTS) or any(n is None for n in nodes):
        return False
    if len(set(n.get_path_name() for n in nodes)) != len(INPUTS):
        return False
    if {n.get_path_name() for n in mel.get_material_expressions(material)} != {
            n.get_path_name() for n in [custom, *nodes]}:
        return False
    pins = dict(zip(names, nodes))
    for name, enum in SCENES.items():
        node = pins[name]
        if not isinstance(node, u.MaterialExpressionSceneTexture) or node.get_editor_property('scene_texture_id') != getattr(u.SceneTextureId, enum) \
                or node.get_editor_property('filtered') or _output_name(custom, node) != 'Color':
            return False
    for name, cls, output in (('WPos', u.MaterialExpressionWorldPosition, 'XYZ'), ('Cam', u.MaterialExpressionCameraPositionWS, '')):
        if not isinstance(pins[name], cls) or _output_name(custom, pins[name]) != output:
            return False
    if pins['WPos'].get_editor_property('world_position_shader_offset') != u.WorldPositionIncludedOffsets.WPT_DEFAULT:
        return False
    cube = pins['Cube']
    if not isinstance(cube, u.MaterialExpressionTextureObject) or cube.get_editor_property('sampler_type') != u.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR:
        return False
    texture = cube.get_editor_property('texture')
    if not isinstance(texture, u.TextureCube) or texture.get_path_name().split('.')[0] != CUBE or texture.get_editor_property('srgb') \
            or _output_name(custom, cube) != '':
        return False
    for name, parameter in PARAMS.items():
        node = pins[name]
        if not isinstance(node, u.MaterialExpressionCollectionParameter) or node.get_editor_property('collection') != mpc \
                or str(node.get_editor_property('parameter_name')) != parameter or _output_name(custom, node) != '':
            return False
    return True


def build(data, mpc):
    """Create/rebuild only PATH, compile, return material. Caller saves under its locks."""
    shader, stamp = code(data), _stamp(data, mpc)
    cube = u.EditorAssetLibrary.load_asset(CUBE)
    if not isinstance(cube, u.TextureCube) or cube.get_editor_property('srgb'):
        raise RuntimeError('Window daylight requires the actual linear HDR hemisphere cube: ' + CUBE)
    mat = u.EditorAssetLibrary.load_asset(PATH) if u.EditorAssetLibrary.does_asset_exist(PATH) else None
    if mat is not None and not isinstance(mat, u.Material):
        raise RuntimeError('Window daylight destination is not a Material: ' + PATH)
    mel = u.MaterialEditingLibrary
    if not graph_matches(mat, data, mpc):
        if mat is None:
            folder, name = PATH.rsplit('/', 1)
            mat = u.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, u.Material, u.MaterialFactoryNew())
            if not isinstance(mat, u.Material) or mat.get_path_name().split('.')[0] != PATH:
                raise RuntimeError('Could not allocate exact window daylight material')
        else:
            collection_ids.clear_graph(mat)
        for name, value in {
            'material_domain': u.MaterialDomain.MD_POST_PROCESS,
            'blendable_location': u.BlendableLocation.BL_SCENE_COLOR_BEFORE_DOF,
            'blendable_priority': -10, 'disable_pre_exposure_scale': False, 'is_blendable': True,
        }.items():
            mat.set_editor_property(name, value)
        custom = mel.create_material_expression(mat, u.MaterialExpressionCustom, 300, 0)
        custom.set_editor_property('description', 'LundenWindowDaylightAmbientDiffuse')
        custom.set_editor_property('code', shader)
        custom.set_editor_property('output_type', u.CustomMaterialOutputType.CMOT_FLOAT3)
        inputs = []
        for name in INPUTS:
            pin = u.CustomInput()
            pin.set_editor_property('input_name', name)
            inputs.append(pin)
        custom.set_editor_property('inputs', inputs)

        def wire(name, cls, output='', **props):
            node = mel.create_material_expression(mat, cls, -400, list(INPUTS).index(name) * 80)
            for prop, value in props.items():
                node.set_editor_property(prop, value)
            if not mel.connect_material_expressions(node, output, custom, name):
                raise RuntimeError('Cannot connect window daylight input: ' + name)

        for name, enum in SCENES.items():
            wire(name, u.MaterialExpressionSceneTexture, 'Color', scene_texture_id=getattr(u.SceneTextureId, enum), filtered=False)
        wire('WPos', u.MaterialExpressionWorldPosition, 'XYZ', world_position_shader_offset=u.WorldPositionIncludedOffsets.WPT_DEFAULT)
        wire('Cam', u.MaterialExpressionCameraPositionWS)
        wire('Cube', u.MaterialExpressionTextureObject, texture=cube, sampler_type=u.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
        for name, parameter in PARAMS.items():
            wire(name, u.MaterialExpressionCollectionParameter, collection=mpc, parameter_name=parameter)
        if not mel.connect_material_property(custom, '', u.MaterialProperty.MP_EMISSIVE_COLOR):
            raise RuntimeError('Cannot connect window daylight emissive output')
        # Bind current actual GUIDs; unresolved() also rejects stale loaded nodes.
        u.EditorAssetLibrary.set_metadata_tag(mat, STAMP, stamp)
    errors = list(mel.recompile_material(mat))
    if errors:
        u.EditorAssetLibrary.remove_metadata_tag(mat, STAMP)
        raise RuntimeError('WINDOW_DAYLIGHT_MATERIAL_COMPILE_FAILED: ' + '\n'.join(str(e) for e in errors))
    if not graph_matches(mat, data, mpc):
        u.EditorAssetLibrary.remove_metadata_tag(mat, STAMP)
        raise RuntimeError('Window daylight graph verification failed after compile')
    return mat
