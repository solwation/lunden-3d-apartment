"""#2424 opt-in Generated material-function builder and guarded material adapter.

No import-time engine access. Saves touch only owned Generated resources.
OFF is the versioned default. Preparation is not
activation: the global guard refuses incomplete native/source coverage before any
canonical builder writes. No Epic or authored material is modified by copy_material.
"""
import hashlib
import json
from pathlib import Path

import source_ambient as source

FUNCTION = '/Game/Lunden/Generated/SourceAmbient/MF_LundenAmbient'
FOLDER = '/Game/Lunden/Generated/SourceAmbient'
STAMP = 'Lunden.SourceAmbient'
PROVENANCE = STAMP+'.Provenance'
INPUTS = {'NormalWS': 'VECTOR3', 'BaseColor': 'VECTOR3', 'Metalness': 'SCALAR',
          'SourceAO': 'SCALAR', 'AmbientColor': 'VECTOR3', 'AmbientIntensity': 'SCALAR',
          'HemiSky': 'VECTOR3', 'HemiGround': 'VECTOR3', 'HemiIntensity': 'SCALAR',
          'WPos':'VECTOR3', 'CameraWS':'VECTOR3', 'SourceDayShare':'SCALAR',
          'WindowSkyStrength':'SCALAR', 'WindowSunStrength':'SCALAR', 'SunDir':'VECTOR3',
          'FillColor':'VECTOR3', 'FillIntensity':'SCALAR', 'FillDirection':'VECTOR3',
          'Clearcoat':'SCALAR', 'ClearcoatDotNV':'SCALAR', 'SheenColor':'VECTOR3', 'Transmission':'SCALAR'}


def guard(root):
    policy = source.policy()
    if not policy['enabled']:
        return False
    path = Path(root) / policy['coverageFile']
    if not path.is_file():
        raise RuntimeError('sourceAmbient activation refused: no actual coverage record')
    return source.require_activation(policy, json.loads(path.read_text(encoding='utf-8')))


def function_signature(window_data):
    return hashlib.sha256(source.material_hlsl(window_data).encode()+Path(__file__).read_bytes()).hexdigest()


def build_function(window_data):
    """Build only the shared source-radiance function, not a native unit conversion.

    API declaration: UE5.8.4 MaterialEditingLibrary.h CreateMaterialExpressionInFunction,
    UpdateMaterialFunction; caller owns the native compilation/acceptance gate.
    """
    import unreal as u
    mel, assets = u.MaterialEditingLibrary, u.EditorAssetLibrary
    code = source.material_hlsl(window_data)
    signature = function_signature(window_data)
    function = assets.load_asset(FUNCTION) if assets.does_asset_exist(FUNCTION) else None
    if function and assets.get_metadata_tag(function, STAMP) == signature:
        verify_saved_copy(function)
        return function
    if function:
        mel.delete_all_material_expressions_in_function(function)
    else:
        folder, name = FUNCTION.rsplit('/', 1)
        function = u.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, u.MaterialFunction, u.MaterialFunctionFactoryNew())
    if not function:
        raise RuntimeError('sourceAmbient: cannot create Generated function')
    def expr(cls, x, y):
        return mel.create_material_expression_in_function(function, cls, x, y)
    custom = expr(u.MaterialExpressionCustom, 0, 0)
    custom.set_editor_property('code', code)
    custom.set_editor_property('output_type', u.CustomMaterialOutputType.CMOT_FLOAT3)
    custom.set_editor_property('description', 'Source Ambient + Hemisphere / Lambert (no unit gain)')
    custom_inputs = []
    for i, name in enumerate(INPUTS):
        entry = u.CustomInput()
        entry.set_editor_property('input_name', name)
        custom_inputs.append(entry)
    custom.set_editor_property('inputs', custom_inputs)
    for i, (name, kind) in enumerate(INPUTS.items()):
        node = expr(u.MaterialExpressionFunctionInput, -400, i*130)
        node.set_editor_property('input_name', name)
        node.set_editor_property('input_type', getattr(u.FunctionInputType, 'FUNCTION_INPUT_'+kind))
        node.set_editor_property('sort_priority', i)
        if not mel.connect_material_expressions(node, '', custom, name):
            raise RuntimeError('sourceAmbient: cannot connect function input '+name)
    output = expr(u.MaterialExpressionFunctionOutput, 350, 0)
    output.set_editor_property('output_name', 'IndirectRadiance')
    if not mel.connect_material_expressions(custom, '', output, ''):
        raise RuntimeError('sourceAmbient: cannot connect function output')
    mel.update_material_function(function)
    assets.set_metadata_tag(function, STAMP, signature)
    persist_owned(function)
    return function


def copy_material(original, function, mpc, *, display_gain, source_physical=False, source_layer, contract_sha256):
    """DefaultLit and constant-layer Physical copy; preserve existing graph outputs.

    Physical variants cannot be inferred from shared M_Default: the source-key
    census MUST pass source_physical=True even if native shading_model says DefaultLit.
    Constant clearcoat/sheen use source inputs and exact source attenuation. Lost
    textured layers, nonzero transmission and clearcoat normal mismatch are rejected.
    Returned material is an owned, persisted Generated copy; caller owns slot assignment.
    """
    import unreal as u
    mel, assets = u.MaterialEditingLibrary, u.EditorAssetLibrary
    layers = source.layer_bindings(source_layer)
    if bool(source_layer['physical']) != source_physical:
        raise ValueError('sourceAmbient: source Physical identity mismatch')
    if (original.get_editor_property('material_domain') != u.MaterialDomain.MD_SURFACE
            or original.get_editor_property('shading_model') != u.MaterialShadingModel.MSM_DEFAULT_LIT
            or original.get_editor_property('use_material_attributes')):
        raise RuntimeError('sourceAmbient: unsupported model/attributes '+original.get_path_name())
    import math
    if not math.isfinite(display_gain) or display_gain <= 0:
        raise ValueError('sourceAmbient: positive source-to-native display gain required')
    record = provenance_record([original],contract_sha256,None)
    digest = source.binding_stamp(record)
    path = FOLDER+'/Masters/M_'+digest[:24]
    cached = assets.load_asset(path) if assets.does_asset_exist(path) else None
    if cached:
        verify_saved_copy(cached)
        if (assets.get_metadata_tag(cached,STAMP) != digest or read_provenance(cached) != record
                or feature_injections(cached) != 1):
            raise RuntimeError('sourceAmbient: foreign/corrupt Generated copy '+path)
        return cached
    material = u.AssetToolsHelpers.get_asset_tools().duplicate_asset('M_'+digest[:24], FOLDER+'/Masters', original)
    if not material:
        raise RuntimeError('sourceAmbient: duplicate failed '+original.get_path_name())
    call = mel.create_material_expression(material, u.MaterialExpressionMaterialFunctionCall, 100, 300)
    # UMaterialExpressionMaterialFunctionCall::SetMaterialFunction is BlueprintCallable.
    if not call.set_material_function(function):
        raise RuntimeError('sourceAmbient: cannot bind shared material function')
    def expr(cls):
        return mel.create_material_expression(material, cls, -300, 300)
    def prop_input(prop, default):
        node = mel.get_material_property_input_node(material, prop)
        if node:
            return node, str(mel.get_material_property_input_node_output_name(material, prop))
        node = expr(u.MaterialExpressionConstant3Vector if isinstance(default, tuple) else u.MaterialExpressionConstant)
        node.set_editor_property('constant' if isinstance(default, tuple) else 'r', u.LinearColor(*default, 1) if isinstance(default, tuple) else default)
        return node, ''
    source_ao = expr(u.MaterialExpressionConstant)
    source_ao.set_editor_property('r',1.0)  # source aoMap absence, validated by layer_bindings
    if mel.get_material_property_input_node(material,u.MaterialProperty.MP_BASE_COLOR) is None:
        raise RuntimeError('sourceAmbient: disconnected BaseColor needs explicit source binding')
    inputs = {'NormalWS': (expr(u.MaterialExpressionPixelNormalWS), ''),
              'BaseColor': prop_input(u.MaterialProperty.MP_BASE_COLOR, (0,0,0)),
              'Metalness': prop_input(u.MaterialProperty.MP_METALLIC, 0),
              'SourceAO': (source_ao, ''),
              'WPos': (expr(u.MaterialExpressionWorldPosition), ''),
              'CameraWS': (expr(u.MaterialExpressionCameraPositionWS), '')}
    # Ordinary DefaultLit uses no Physical layers; actual Physical source keys
    # are rejected above even when Interchange flattened them to DefaultLit.
    for name, default in (('Clearcoat',layers['Clearcoat']),('ClearcoatDotNV',1.),('Transmission',layers['Transmission']),('SheenColor',layers['SheenColor'])):
        node = expr(u.MaterialExpressionConstant3Vector if isinstance(default,tuple) else u.MaterialExpressionConstant)
        node.set_editor_property('constant' if isinstance(default,tuple) else 'r',u.LinearColor(*default,1) if isinstance(default,tuple) else default)
        inputs[name] = node, ''
    if layers['Clearcoat']:
        facing = expr(u.MaterialExpressionCustom)
        facing.set_editor_property('code','return saturate(dot(normalize(N),normalize(V)));')
        facing.set_editor_property('output_type',u.CustomMaterialOutputType.CMOT_FLOAT1)
        fields=[]
        for name in ('N','V'):
            field=u.CustomInput();field.set_editor_property('input_name',name);fields.append(field)
        facing.set_editor_property('inputs',fields)
        camera=expr(u.MaterialExpressionCameraVectorWS)
        if not (mel.connect_material_expressions(inputs['NormalWS'][0],'',facing,'N')
                and mel.connect_material_expressions(camera,'',facing,'V')):
            raise RuntimeError('sourceAmbient: cannot bind actual clearcoat view normal')
        inputs['ClearcoatDotNV']=facing,''
    for name, param in (('AmbientColor','SourceAmbientColor'),('AmbientIntensity','SourceAmbientIntensity'),
                        ('HemiSky','SourceHemiSky'),('HemiGround','SourceHemiGround'),('HemiIntensity','SourceHemiIntensity'),
                        ('SourceDayShare','SourceDayShare'),('WindowSkyStrength','SourceWindowSkyStrength'),
                        ('WindowSunStrength','WindowSunStrength'),('SunDir','SunDir'),
                        ('FillColor','SourceFillColor'),('FillIntensity','SourceFillIntensity'),('FillDirection','SourceFillDirection')):
        node = expr(u.MaterialExpressionCollectionParameter)
        node.set_editor_property('collection', mpc)
        node.set_editor_property('parameter_name', param)
        inputs[name] = node, ''
    for name, (node, pin) in inputs.items():
        if not mel.connect_material_expressions(node, pin, call, name):
            raise RuntimeError('sourceAmbient: cannot bind '+name)
    gain = expr(u.MaterialExpressionMultiply)
    gain.set_editor_property('const_b', display_gain)
    old, pin = prop_input(u.MaterialProperty.MP_EMISSIVE_COLOR, (0,0,0))
    add = expr(u.MaterialExpressionAdd)
    if not (mel.connect_material_expressions(call, 'IndirectRadiance', gain, 'A')
            and mel.connect_material_expressions(gain, '', add, 'A')
            and mel.connect_material_expressions(old, pin, add, 'B')
            and mel.connect_material_property(add, '', u.MaterialProperty.MP_EMISSIVE_COLOR)):
        raise RuntimeError('sourceAmbient: cannot add source radiance to existing emissive')
    mel.recompile_material(material)
    assets.set_metadata_tag(material,STAMP,digest)
    assets.set_metadata_tag(material,PROVENANCE,json.dumps(record,sort_keys=True))
    persist_owned(material)
    return material


def sky_parameters(g, e, chain, mpc, contract, constant, connect, *, active=False, direct_units=None):
    """Feed exact source MPC values, independently of old native fill/cube guesses."""
    source.validate(contract)
    # Live context has explicit BP inputs; activation requires proof they are driven.
    for name, value in (('RawSourceAmbientClear',contract['clear']['ambient']),
                        ('RawSourceAmbientOvercast',contract['overcast']['ambient']),
                        ('RawSourceHemiClear',contract['clear']['hemi']),('RawSourceHemiOvercast',contract['overcast']['hemi']),
                        ('RawSourceFillClear',contract['clear']['fill']),('RawSourceFillOvercast',contract['overcast']['fill']),
                        ('SourceNightAmbient',contract['nightAmbient']),('SourceFlashLight',contract['flashLight']),
                        ('SourceGarageCarLight',contract['garageCarLight'])):
        e.env[name] = float(value)
    for name in ('SourceDim', 'SourceUnder', 'SourceFlash', 'SourceGarageLit'):
        e.env[name] = g.get(name), name
    env = e.run('''
sourceClear = day * (1-oc) * (1-SourceUnder)
sourceInDay = day * (1-SourceDim) * (1-SourceUnder)
sourceAmbientI = ((RawSourceAmbientOvercast+(RawSourceAmbientClear-RawSourceAmbientOvercast)*sourceClear)*sourceInDay+SourceNightAmbient*0.5)*(1-0.25*oc)+SourceFlashLight*0.4*SourceFlash+SourceGarageLit*SourceGarageCarLight
sourceHemiI = ((RawSourceHemiOvercast+(RawSourceHemiClear-RawSourceHemiOvercast)*sourceClear)*sourceInDay+SourceNightAmbient)*(1-0.3*oc)+SourceFlashLight*SourceFlash
sourceFillI = (RawSourceFillOvercast+(RawSourceFillClear-RawSourceFillOvercast)*sourceClear)*sourceInDay
sourceDayShare = day*(1-SourceUnder)
sourceWindowSky = (RawSourceHemiOvercast+(RawSourceHemiClear-RawSourceHemiOvercast)*sourceClear)*sourceDayShare*(1-0.3*oc)
''')
    for name, key in (('SourceAmbientIntensity','sourceAmbientI'),('SourceHemiIntensity','sourceHemiI'),('SourceFillIntensity','sourceFillI'),('SourceDayShare','sourceDayShare'),('SourceWindowSkyStrength','sourceWindowSky')):
        node = g.call('KismetMaterialLibrary:SetScalarParameterValue', ParameterName=name)
        constant(node, 'Collection', mpc.get_path_name())
        e.feed(node, 'ParameterValue', env[key])
        chain.then(node)
    colors = contract['colors']
    for name, rgb in (('SourceAmbientColor',colors['ambient']),('SourceHemiGround',colors['ground']),
                      ('SourceFillColor',colors['fill']),('SourceFillDirection',[contract['fillDirection'][i] for i in (0,2,1)])):
        color = g.call('KismetMathLibrary:MakeColor', A=1.)
        for i, ch in enumerate('RGB'):
            e.feed(color, ch, float(rgb[i]))
        node = g.call('KismetMaterialLibrary:SetVectorParameterValue', ParameterName=name)
        constant(node, 'Collection', mpc.get_path_name())
        connect(color, 'ReturnValue', node, 'ParameterValue')
        chain.then(node)
    color = g.call('KismetMathLibrary:MakeColor', A=1.)
    for i, ch in enumerate('RGB'):
        e.env['SourceSkyNight'+ch], e.env['SourceSkyDay'+ch] = float(colors['skyNight'][i]), float(colors['skyDay'][i])
        e.run('sourceSky'+ch+' = SourceSkyNight'+ch+' + (SourceSkyDay'+ch+'-SourceSkyNight'+ch+')*day')
        e.feed(color, ch, env['sourceSky'+ch])
    node = g.call('KismetMaterialLibrary:SetVectorParameterValue', ParameterName='SourceHemiSky')
    constant(node, 'Collection', mpc.get_path_name())
    connect(color, 'ReturnValue', node, 'ParameterValue')
    chain.then(node)

    if active:
        if direct_units is None or direct_units <= 0:
            raise ValueError('sourceAmbient: same source-direct/native Sun unit conversion required')
        # Actual source shadowless DirectionalLight, not an ambient fill proxy.
        # Use the existing Sun/source intensity conversion, with no new gain.
        e.env['SourceDirectUnits'] = float(direct_units)
        e.run('sourceFillLux = sourceFillI*SourceDirectUnits')
        power = g.call('LightComponent:SetIntensity')
        connect(g.get('SourceFill'),'SourceFill',power,'self')
        e.feed(power,'NewIntensity',env['sourceFillLux'])
        chain.then(power)
        color = g.call('KismetMathLibrary:MakeColor',A=1.)
        for i,ch in enumerate('RGB'):
            e.feed(color,ch,float(contract['colors']['fill'][i]))
        tint = g.call('LightComponent:SetLightColor',bSRGB=True)
        connect(g.get('SourceFill'),'SourceFill',tint,'self')
        connect(color,'ReturnValue',tint,'NewLightColor')
        chain.then(tint)
        direction = g.call('KismetMathLibrary:MakeVector')
        for axis,value in zip(('X','Y','Z'),(-contract['fillDirection'][i] for i in (0,2,1))):
            e.feed(direction,axis,float(value))
        rotation = g.call('KismetMathLibrary:MakeRotFromX')
        connect(direction,'ReturnValue',rotation,'X')
        turn = g.call('SceneComponent:K2_SetWorldRotation')
        connect(g.get('SourceFill'),'SourceFill',turn,'self')
        connect(rotation,'ReturnValue',turn,'NewRotation')
        chain.then(turn)
        enabled = g.call('KismetMaterialLibrary:SetScalarParameterValue',ParameterName='SourceAmbientEnabled')
        constant(enabled,'Collection',mpc.get_path_name())
        e.feed(enabled,'ParameterValue',1.0)
        chain.then(enabled)



def package_bytes(asset):
    """Content-address copies from real saved package bytes, never path alone."""
    import unreal as u
    package = asset.get_path_name().split('.')[0]
    if any(p.get_path_name() == package for p in u.EditorLoadingAndSavingUtils.get_dirty_content_packages()):
        raise RuntimeError('sourceAmbient: save the source package before copying '+package)
    filename = u.PackageTools.package_name_to_filename(package,'.uasset')
    if not filename or not Path(filename).is_file():
        raise RuntimeError('sourceAmbient: cannot fingerprint actual package '+package)
    return Path(filename).read_bytes()


def receipt_file():
    import unreal as u
    content=Path(u.Paths.convert_relative_path_to_full(u.Paths.project_content_dir()))
    return content/'Lunden/Generated/SourceAmbient/saved-copies.json'


def read_receipts():
    path=receipt_file()
    if not path.is_file():
        return {'version':1,'copies':{}}
    try:
        data=json.loads(path.read_text(encoding='utf-8'))
    except (ValueError,OSError) as error:
        raise RuntimeError('sourceAmbient: unreadable saved-copy receipts') from error
    if not isinstance(data,dict) or data.get('version') != 1 or not isinstance(data.get('copies'),dict):
        raise RuntimeError('sourceAmbient: corrupt saved-copy receipt document')
    return data


def saved_copy_proof(asset):
    import unreal as u
    assets=u.EditorAssetLibrary
    package=asset.get_path_name().split('.')[0]
    dirty=any(p.get_path_name()==package for p in u.EditorLoadingAndSavingUtils.get_dirty_content_packages())
    raw=assets.get_metadata_tag(asset,PROVENANCE)
    return {'dirty':dirty,
            'packageSHA256':None if dirty else hashlib.sha256(package_bytes(asset)).hexdigest(),
            'stamp':assets.get_metadata_tag(asset,STAMP),
            'provenanceSHA256':hashlib.sha256(raw.encode()).hexdigest() if raw else None,
            'receipt':read_receipts()['copies'].get(asset.get_path_name())}


def verify_saved_copy(asset):
    proof=saved_copy_proof(asset)
    source.verify_bound_copy(proof)
    return proof


def persist_owned(asset):
    """Save then record exact output bytes externally; never a self-hash tag.

    Only newly built owned assets call this. A cached/dirty artifact cannot gain
    a fresh receipt merely because a later binding operation encounters it.
    """
    import unreal as u
    path=asset.get_path_name()
    if not path.startswith(source.BINDING_OWNER):
        raise RuntimeError('sourceAmbient: refusing to save non-owned asset '+path)
    assets=u.EditorAssetLibrary
    if not assets.save_loaded_asset(asset,only_if_is_dirty=False):
        raise RuntimeError('sourceAmbient: could not save owned copy '+path)
    raw=assets.get_metadata_tag(asset,PROVENANCE)
    data=read_receipts()
    data['copies'][path]={'packageSHA256':hashlib.sha256(package_bytes(asset)).hexdigest(),
                          'stamp':assets.get_metadata_tag(asset,STAMP),
                          'provenanceSHA256':hashlib.sha256(raw.encode()).hexdigest() if raw else None}
    target=receipt_file()
    target.parent.mkdir(parents=True,exist_ok=True)
    pending=target.with_suffix('.json.tmp')
    pending.write_text(json.dumps(data,sort_keys=True,indent=2)+'\n',encoding='utf-8')
    pending.replace(target)


def read_provenance(asset):
    import unreal as u
    raw=u.EditorAssetLibrary.get_metadata_tag(asset,PROVENANCE)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (ValueError,TypeError) as error:
        raise RuntimeError('sourceAmbient: malformed provenance '+asset.get_path_name()) from error


def feature_functions(material):
    import unreal as u
    if not isinstance(material,u.Material):
        return []
    functions=[]
    for expression in u.ObjectIterator(u.MaterialExpressionMaterialFunctionCall):
        if expression.get_outer() == material:
            function=expression.get_editor_property('material_function')
            if function and function.get_path_name().startswith(FOLDER+'/'):
                functions.append(function)
    return functions


def feature_injections(material):
    return len(feature_functions(material))


def chain_sha256(chain):
    rows=[(asset.get_path_name(),hashlib.sha256(package_bytes(asset)).hexdigest()) for asset in chain]
    return hashlib.sha256(json.dumps(rows,separators=(',',':')).encode()).hexdigest()


def provenance_record(chain,contract_sha256,parent):
    import unreal as u
    original=chain[0]
    return {'version':1,'kind':'master' if isinstance(original,u.Material) else 'instance',
            'original':original.get_path_name(),'originalPackageSHA256':hashlib.sha256(package_bytes(original)).hexdigest(),
            'originalChainSHA256':chain_sha256(chain),'contractSHA256':contract_sha256,'parent':parent}


def original_chain(interface,contract_sha256,visiting=None):
    """Validate copied ancestry, then resolve real originals, including hybrid chains.

    A new furnishing/profile MIC may inherit an already bound imported parent.
    Keep that new MIC's actual values, but unwrap its parent before copying it.
    Never use an injected root as the source of another material graph.
    """
    import unreal as u
    visiting=set() if visiting is None else visiting
    path=interface.get_path_name()
    if path in visiting:
        raise RuntimeError('sourceAmbient: cyclic original/provenance chain '+path)
    visiting.add(path)
    try:
        instance=isinstance(interface,u.MaterialInstanceConstant)
        if not instance and not isinstance(interface,u.Material):
            raise RuntimeError('sourceAmbient: runtime/nonconstant interface needs controller rebinding '+path)
        parent=interface.get_editor_property('parent') if instance else None
        parent_chain=None
        if parent:
            parent_chain,_=original_chain(parent,contract_sha256,visiting)
        record=read_provenance(interface)
        stamp=u.EditorAssetLibrary.get_metadata_tag(interface,STAMP)
        count=feature_injections(interface)
        if record is not None or stamp or path.startswith(source.BINDING_OWNER):
            # Validate saved copy bytes before following original metadata.
            proof=verify_saved_copy(interface)
            source.binding_decision(path=path,stamp=stamp,provenance=record,kind='instance' if instance else 'master',
                actual_parent=parent.get_path_name() if parent else None,injection_count=count,
                original_package_sha256=record.get('originalPackageSHA256') if isinstance(record,dict) else None,
                original_chain_sha256=record.get('originalChainSHA256') if isinstance(record,dict) else None,
                contract_sha256=contract_sha256,bound_copy_proof=proof)
            if parent:
                parent_record=read_provenance(parent)
                if not parent_record or parent_record['contractSHA256'] != record['contractSHA256']:
                    raise RuntimeError('sourceAmbient: foreign/mixed-context bound parent '+path)
            original=u.EditorAssetLibrary.load_asset(record['original'])
            if not original:
                raise RuntimeError('sourceAmbient: missing actual original '+record['original'])
            if isinstance(original,u.Material) != (not instance):
                raise RuntimeError('sourceAmbient: original class changed '+record['original'])
            chain,_=original_chain(original,contract_sha256,visiting)
            decision=source.binding_decision(path=path,stamp=stamp,provenance=record,kind='instance' if instance else 'master',
                actual_parent=parent.get_path_name() if parent else None,injection_count=count,
                original_package_sha256=hashlib.sha256(package_bytes(chain[0])).hexdigest(),
                original_chain_sha256=chain_sha256(chain),contract_sha256=contract_sha256,bound_copy_proof=proof)
            return chain,decision
        source.binding_decision(path=path,stamp=stamp,provenance=None,kind='instance' if instance else 'master',
            actual_parent=parent.get_path_name() if parent else None,injection_count=count,
            original_package_sha256=None,original_chain_sha256=None,contract_sha256=contract_sha256)
        return [interface]+(parent_chain or []),'build'
    finally:
        visiting.remove(path)


def copy_instance_chain(chain,replacement_master,contract_sha256):
    """Copy only resolved original nodes; no injected graph can enter this chain."""
    import unreal as u
    original=chain[0]
    if isinstance(original,u.Material):
        return replacement_master
    parent=copy_instance_chain(chain[1:],replacement_master,contract_sha256)
    record=provenance_record(chain,contract_sha256,parent.get_path_name())
    digest=source.binding_stamp(record)
    folder=FOLDER+'/Instances/'+digest[:24]
    path=folder+'/'+original.get_name()
    assets=u.EditorAssetLibrary
    cached=assets.load_asset(path) if assets.does_asset_exist(path) else None
    if cached:
        verify_saved_copy(cached)
        if (assets.get_metadata_tag(cached,STAMP) != digest or read_provenance(cached) != record
                or cached.get_editor_property('parent') != parent):
            raise RuntimeError('sourceAmbient: foreign/corrupt Generated instance '+path)
        return cached
    copied=u.AssetToolsHelpers.get_asset_tools().duplicate_asset(original.get_name(),folder,original)
    if not copied:
        raise RuntimeError('sourceAmbient: cannot duplicate instance '+original.get_path_name())
    u.MaterialEditingLibrary.set_material_instance_parent(copied,parent)
    assets.set_metadata_tag(copied,STAMP,digest)
    assets.set_metadata_tag(copied,PROVENANCE,json.dumps(record,sort_keys=True))
    persist_owned(copied)
    return copied


def prepare_interfaces(keyed_interfaces, source_materials, window_data, mpc, display_gain):
    """Prepare supported imported/leaf/translucent chains without changing slots.

    Input includes explicit source keys, not guesses from a common master path.
    All source coverage is checked before creating a function or copying assets.
    Canonical slot assignment/persistence is intentionally still an activation gate.
    """
    import unreal as u
    planned=[]
    for key,interface in keyed_interfaces:
        layer=source.layer_for_key(source_materials,key)
        payload={'function':function_signature(window_data),'layer':layer,'displayGain':display_gain,
                 'mpc':hashlib.sha256(package_bytes(mpc)).hexdigest()}
        context=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()
        chain,decision=original_chain(interface,context)
        root=chain[-1]
        if decision=='reuse':
            bound_root=interface
            while isinstance(bound_root,u.MaterialInstance):
                bound_root=bound_root.get_editor_property('parent')
            for function in feature_functions(bound_root):
                verify_saved_copy(function)
                if u.EditorAssetLibrary.get_metadata_tag(function,STAMP) != payload['function']:
                    raise RuntimeError('sourceAmbient: corrupt/stale bound function '+key)
        if layer.get('unlit'):
            if root.get_editor_property('shading_model') != u.MaterialShadingModel.MSM_UNLIT:
                raise RuntimeError('sourceAmbient: source Basic is not actually native unlit '+key)
            planned.append((key,interface,None,None,None,None,'reuse'));continue
        source.layer_bindings(layer)
        if (root.get_editor_property('material_domain') != u.MaterialDomain.MD_SURFACE
                or root.get_editor_property('shading_model') != u.MaterialShadingModel.MSM_DEFAULT_LIT
                or root.get_editor_property('use_material_attributes')):
            raise RuntimeError('sourceAmbient: unsupported actual master '+key)
        planned.append((key,interface,root,layer,chain,context,decision))
    function=None
    result={}
    for key,interface,root,layer,chain,context,decision in planned:
        if decision=='reuse':
            result[key,interface.get_path_name()]=interface;continue
        if function is None:
            function=build_function(window_data)
        master=copy_material(root,function,mpc,display_gain=display_gain,
                             source_physical=layer['physical'],source_layer=layer,contract_sha256=context)
        result[key,interface.get_path_name()]=copy_instance_chain(chain,master,context)
    return result


def bind_generated_meshes(meshes, measurements, mpc, display_gain):
    """Canonical import/foliage hook; alter ONLY supplied Generated mesh slots.

    Imported slot names retain the source material key after material-map replaces
    its interface with an authored Tile/Surface instance. Never guess source identity
    from that replacement's name. Preflight all keys before copying or assigning.
    The caller owns mesh saving; this function saves only its own Generated copies.
    """
    import unreal as u
    if not guard(Path(__file__).resolve().parents[3]):
        return 0
    plans=[]
    for mesh in meshes:
        if not mesh.get_path_name().startswith('/Game/Lunden/Generated/'):
            raise RuntimeError('sourceAmbient: refusing non-Generated mesh '+mesh.get_path_name())
        slots=list(mesh.get_editor_property('static_materials'))
        for slot in slots:
            interface=slot.get_editor_property('material_interface')
            if interface is None:
                raise RuntimeError('sourceAmbient: material-less slot requires explicit source binding')
            candidates=[]
            for field in ('imported_material_slot_name','material_slot_name'):
                name=str(slot.get_editor_property(field))
                if name in measurements['materials'] and name not in candidates:
                    candidates.append(name)
            if len(candidates) != 1:
                raise RuntimeError('sourceAmbient: absent/ambiguous original slot key on '+mesh.get_path_name())
            plans.append((mesh,slot,candidates[0],interface))
    replacements=prepare_interfaces([(key,mat) for _,_,key,mat in plans],measurements['materials'],
                                    measurements['site']['windowDaylight'],mpc,display_gain)
    count=0
    by_mesh={}
    for mesh,slot,key,material in plans:
        replacement=replacements[key,material.get_path_name()]
        if replacement != material:
            slot.set_editor_property('material_interface',replacement)
            count+=1
        by_mesh.setdefault(mesh,[]).append(slot)
    for mesh,slots in by_mesh.items():
        mesh.set_editor_property('static_materials',slots)
    return count
