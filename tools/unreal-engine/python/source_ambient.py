"""#2424 source Ambient/Hemisphere contract, independent of Unreal.

E is Three's irradiance (WebGLLights has already multiplied colour by intensity).
Lambert divides by pi exactly once. No native sky/cube, material gains or AO guesses.
Final world normals include normal/bump mapping and the renderer's back-face flip.
"""
import json
import math
from pathlib import Path

POLICY = Path(__file__).parents[1] / 'source-ambient-policy.json'
MPC_SCALARS = ('SourceAmbientEnabled', 'SourceHemiIntensity', 'SourceAmbientIntensity', 'SourceFillIntensity', 'SourceDayShare', 'SourceWindowSkyStrength')
MPC_VECTORS = ('SourceAmbientColor', 'SourceHemiSky', 'SourceHemiGround', 'SourceFillColor', 'SourceFillDirection')


def validate(data):
    if data.get('version') != 1 or data.get('space') != 'linear-srgb':
        raise ValueError('sourceAmbient: expected linear-srgb version1')
    def finite(v):
        return not isinstance(v, bool) and isinstance(v, (int, float)) and math.isfinite(v)
    for name in ('ambient', 'skyDay', 'skyNight', 'ground', 'fill'):
        rgb = data['colors'][name]
        if len(rgb) != 3 or any(not finite(v) or v < 0 for v in rgb):
            raise ValueError('sourceAmbient: invalid colour ' + name)
    for state in ('clear', 'overcast'):
        for name in ('ambient', 'hemi', 'fill'):
            if not finite(data[state][name]) or data[state][name] < 0:
                raise ValueError('sourceAmbient: invalid intensity ' + name)
    for name in ('nightAmbient', 'flashLight', 'garageCarLight'):
        if not finite(data[name]) or data[name] < 0:
            raise ValueError('sourceAmbient: invalid ' + name)
    for name in ('hemiDirection', 'fillDirection'):
        v = data[name]
        if len(v) != 3 or any(not finite(x) for x in v) or abs(sum(x*x for x in v)-1) > 1e-6:
            raise ValueError('sourceAmbient: expected unit ' + name)
    if list(data['hemiDirection']) != [0,1,0]:
        raise ValueError('sourceAmbient: source main.js uses the default upward HemisphereLight')
    return data


def uniforms(data, *, day, overcast, dim=0, under=0, flash=0, garage_lit=0):
    """Actual daycycle.js update formulas; oc/flash are AFTER cloud-altitude attenuation.

    Under, dim, flash and garage_lit are live inputs, not silently assumed zero.
    Native ownership/propagation of these inputs is an activation prerequisite.
    """
    validate(data)
    for v in (day, overcast, dim, under, flash, garage_lit):
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0:
            raise ValueError('sourceAmbient: invalid runtime input')
    if any(x > 1 for x in (day, overcast, dim, under)):
        raise ValueError('sourceAmbient: day/overcast/dim/under outside0..1')
    clear = day * (1-overcast) * (1-under)
    base = {k: data['overcast'][k]+(data['clear'][k]-data['overcast'][k])*clear for k in ('ambient', 'hemi', 'fill')}
    in_day = day * (1-dim) * (1-under)
    hemi = (base['hemi']*in_day+data['nightAmbient'])*(1-.3*overcast)+data['flashLight']*flash
    ambient = (base['ambient']*in_day+data['nightAmbient']*.5)*(1-.25*overcast)+data['flashLight']*.4*flash+garage_lit*data['garageCarLight']
    colors = data['colors']
    return {'ambient': [v*ambient for v in colors['ambient']],
            'sky': [(n+(d-n)*day)*hemi for n,d in zip(colors['skyNight'],colors['skyDay'])],
            'ground': [v*hemi for v in colors['ground']], 'hemiIntensity': hemi,
            'ambientIntensity': ambient, 'skyColor': [n+(d-n)*day for n,d in zip(colors['skyNight'],colors['skyDay'])],
            'fillIntensity': base['fill']*in_day, 'fillColor': list(colors['fill']),
            'fillDirection': list(data['fillDirection']), 'hemiDirection': list(data['hemiDirection'])}


def irradiance(state, normal):
    if len(normal) != 3 or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in normal) or abs(sum(v*v for v in normal)-1) > 1e-6:
        raise ValueError('sourceAmbient: final world normal must be unit')
    k = .5 + .5*sum(a*b for a,b in zip(normal,state['hemiDirection']))
    return [a+g+(s-g)*k for a,g,s in zip(state['ambient'],state['ground'],state['sky'])]


def indirect_diffuse(irr, base_color, metalness, source_ao=1, *, clearcoat=0, clearcoat_dot_nv=1,
                     sheen_color=(0,0,0), transmission=0):
    """Only the added indirect term; source Physical's subsequent attenuation.

    Does not reconstruct transmitted light, direct glints, clearcoat highlights or
    object envmaps. Existing material paths retain those. Physical integration must
    supply the actual textured layer inputs; guessing them is forbidden.
    """
    if any(len(v) != 3 for v in (irr,base_color,sheen_color)):
        raise ValueError('sourceAmbient: expected RGB triples')
    if any(not math.isfinite(v) for v in (*irr, *base_color, metalness, source_ao, clearcoat,
                                          clearcoat_dot_nv, *sheen_color, transmission)):
        raise ValueError('sourceAmbient: nonfinite material input')
    if any(v < 0 or v > 1 for v in (metalness, source_ao, clearcoat, clearcoat_dot_nv, transmission)):
        raise ValueError('sourceAmbient: material input outside0..1')
    fresnel = 2**((-5.55473*clearcoat_dot_nv-6.98316)*clearcoat_dot_nv)
    fcc = .04*(1-fresnel)+fresnel
    layers = (1-transmission)*(1-.157*max(sheen_color))*(1-clearcoat*fcc)
    return [e*b*(1-metalness)*source_ao/math.pi*layers for e,b in zip(irr,base_color)]


def policy(path=POLICY):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    if data.get('version') != 1 or type(data.get('enabled')) is not bool:
        raise ValueError('sourceAmbient: invalid policy')
    return data


def require_activation(data, coverage):
    """No partial population may disable global native IBL."""
    if not data['enabled']:
        return False
    required = ('masterInventoryComplete', 'allLitMastersBound', 'physicalLayersBound',
                'liveSourceInputsBound', 'sourceFillDirectionalBound', 'windowFunctionBound',
                'curtainCompensationRetired', 'nativeReloadVerified', 'rootIntegrationApproved')
    missing = [k for k in required if coverage.get(k) is not True]
    # Only the independent supported preparation is implemented in this slice.
    # A hand-edited coverage JSON cannot enable an unwired global policy.
    missing.append('canonical-material/fill/window/curtain integration not implemented')
    if missing:
        raise RuntimeError('sourceAmbient activation refused: '+', '.join(missing))
    return True


# Reused verbatim in the material-function Custom expression. PixelNormalWS is the
# final renderer-normal, not VertexNormalWS. No extra TwoSidedSign multiplication.
HLSL = r'''
float k = 0.5 + 0.5 * dot(normalize(NormalWS), float3(0,0,1));
float3 E = AmbientColor * AmbientIntensity
         + lerp(HemiGround, HemiSky, k) * HemiIntensity;
return E * BaseColor * (1.0-Metalness) * SourceAO * (1.0/3.14159265358979323846);
'''


def glb_inventory(directory, source_materials=None):
    """Actual used primitive-material keys, never an allowlist inferred from a master name.

    Includes Physical source keys even when the GLTF exporter omitted their layer
    extension. Such loss is an explicit binding gap, not permission to treat them
    as ordinary DefaultLit. No GLB/export mutation.
    """
    import struct
    rows = []
    for path in sorted(Path(directory).glob('*.glb')):
        raw = path.read_bytes()
        magic, version, length = struct.unpack_from('<4sII', raw)
        if magic != b'glTF' or version != 2 or length != len(raw):
            raise ValueError('sourceAmbient: invalid GLB '+str(path))
        size, kind = struct.unpack_from('<I4s', raw, 12)
        if kind != b'JSON':
            raise ValueError('sourceAmbient: missing GLB JSON')
        data = json.loads(raw[20:20+size])
        used = {p['material'] for mesh in data.get('meshes', []) for p in mesh['primitives'] if 'material' in p}
        for index in sorted(used):
            m = data['materials'][index]
            key, ext = m.get('name',''), m.get('extensions', {})
            unlit = 'KHR_materials_unlit' in ext
            source_row = (source_materials or {}).get(key, {})
            layer = source_row.get('sourceAmbient')
            physical = key.startswith('phys_') or any(k in ext for k in ('KHR_materials_clearcoat','KHR_materials_transmission','KHR_materials_sheen'))
            rows.append({'zone': path.stem, 'index': index, 'key': key, 'unlit': unlit,
                         'sourcePhysical': physical, 'extensions': sorted(ext), 'sourceLayers': layer,
                         'sourceLayerVariants': source_row.get('sourceAmbientVariants'),
                         'material': m,
                         'adapter': 'unchanged-unlit' if unlit else 'physical-layer-binding-required' if physical else 'default-lit-candidate'})
    if not rows:
        raise ValueError('sourceAmbient: no actual primitive materials found')
    return rows


def material_hlsl(window_data):
    """Source material's OWN position/normal, including L1007 window transformation.

    No opaque GBuffer lookup: transparent surfaces receive their own irradiance.
    Native positions/directions are x-east,y-south,z-up centimetres.
    SourceFill is a separate direct light; this is only the source subtraction
    from indirect irradiance. It never substitutes an ambient/cubemap proxy.
    """
    import window_light
    window_light.validate(window_data)
    fill_cut = float(window_data['config']['fillCut'])
    if not math.isfinite(fill_cut) or fill_cut < 0:
        raise ValueError('sourceAmbient: invalid source fillCut')
    colors = window_data['runtimeColors']
    def rgb(name):
        values = colors[name]
        if len(values) != 3 or any(not math.isfinite(v) or v < 0 for v in values):
            raise ValueError('sourceAmbient: invalid runtime source colour '+name)
        return 'float3('+','.join(format(v,'.17g') for v in values)+')'
    sun_color = 'float3 sourceSunColor = sunWeb.y < -0.02 ? '+rgb('moon')+' : lerp('+rgb('sunLow')+','+rgb('sunHigh')+',smoothstep(0.05,0.4,sunWeb.y));'
    return window_light.hlsl(window_data) + HLSL[:HLSL.index('return E *')] + r'''
WebWindowDaylight win;
float3 p = float3(WPos.x,WPos.z,WPos.y)*0.01;
float3 camera = float3(CameraWS.x,CameraWS.z,CameraWS.y)*0.01;
float3 normal = normalize(NormalWS);
float3 nWeb = float3(normal.x,normal.z,normal.y);
float3 sunWeb = float3(SunDir.x,SunDir.z,SunDir.y);
''' + sun_color + r'''
if (win.active(p,camera,SourceDayShare))
{
    float3 fill = FillColor * FillIntensity * ''' + format(fill_cut,'.17g') + r''' * max(dot(normal,normalize(FillDirection)),0.0);
    E = max(E * win.base_factor(SourceDayShare) * win.tint(SourceDayShare) - fill
          + win.irradiance(p,nWeb,camera,SourceDayShare,WindowSkyStrength,HemiSky,sunWeb,WindowSunStrength,sourceSunColor), 0.0);
}
// Three layers attenuate the added diffuse term AFTER its Lambert/AO result.
float nv = saturate(ClearcoatDotNV);
float f = exp2((-5.55473*nv-6.98316)*nv);
float Fcc = 0.04*(1.0-f)+f;
float layers = (1.0-Transmission)*(1.0-0.157*max(SheenColor.r,max(SheenColor.g,SheenColor.b)))*(1.0-Clearcoat*Fcc);
return E * BaseColor * (1.0-Metalness) * SourceAO * (1.0/3.14159265358979323846) * layers;
'''


def layer_bindings(layer):
    """Constant Physical inputs supported by the material adapter; reject lost maps.

    Exported Physical materials were flattened to Standard. Source data, rather
    than the resulting Unreal shading-model name, decides the layer attenuation.
    """
    if not isinstance(layer, dict) or layer.get('version') != 1:
        raise ValueError('sourceAmbient: actual source layer contract required')
    if layer.get('unlit'):
        raise ValueError('sourceAmbient: unlit materials receive no diffuse injection')
    if layer.get('model') not in ('MeshStandardMaterial', 'MeshPhysicalMaterial'):
        raise ValueError('sourceAmbient: unsupported source material model '+str(layer.get('model')))
    for name in ('aoMap','clearcoatMap','clearcoatNormalMap','sheenColorMap','transmissionMap'):
        if layer['textures'][name]['present']:
            raise ValueError('sourceAmbient: actual texture input not bound: '+name)
    if layer.get('clearcoat',0) and any(layer['textures'][name]['present'] for name in ('normalMap','bumpMap')):
        raise ValueError('sourceAmbient: clearcoat nonPerturbedNormal differs from base PixelNormalWS')
    # Nonzero source transmission requires an actual transmitted-light adapter;
    # attenuation alone does not reconstruct a Standard-flattened refraction path.
    if layer.get('transmission',0) != 0:
        raise ValueError('sourceAmbient: actual transmitted-light path not bound')
    result={'Clearcoat':float(layer.get('clearcoat',0)), 'Transmission':0., 'SheenColor':tuple(layer.get('sheenColor',(0,0,0)))}
    if any(not math.isfinite(x) or x < 0 or x > 1 for x in (result['Clearcoat'],*result['SheenColor'])):
        raise ValueError('sourceAmbient: invalid Physical layer values')
    return result


def ambient_layer_projection(layer):
    """Version-specific equivalence for the current native ambient adapter.

    Every variant must independently support SourceAO=1 and the emitted constant
    Physical coefficients. The copied native BaseColor/Metalness graphs and final
    PixelNormalWS remain the inputs: this MF does not sample a source normal/bump
    texture by name. Only those two texture identities may therefore differ;
    their presence and the source facing mode still have to agree. This proves
    adapter equivalence, never missing source bump/normal parity. Raw descriptors
    stay in measurements; this canonical value alone becomes the binding context.
    """
    if not isinstance(layer, dict) or layer.get('version') != 1:
        raise ValueError('sourceAmbient: actual source layer contract required')
    model = layer.get('model')
    for name in ('unlit', 'physical', 'ownEnvironmentMap'):
        if type(layer.get(name)) is not bool:
            raise ValueError('sourceAmbient: invalid source identity '+name)
    if layer['physical'] != (model == 'MeshPhysicalMaterial'):
        raise ValueError('sourceAmbient: inconsistent Physical source identity')
    facing = layer.get('normalFacing')
    if facing not in ('front-sided', 'back-sided', 'double-sided'):
        raise ValueError('sourceAmbient: unknown source normal facing')
    textures = {}
    for name in ('aoMap', 'normalMap', 'bumpMap', 'clearcoatMap',
                 'clearcoatNormalMap', 'sheenColorMap', 'transmissionMap'):
        entry = layer.get('textures', {}).get(name)
        if not isinstance(entry, dict) or type(entry.get('present')) is not bool:
            raise ValueError('sourceAmbient: missing actual texture presence '+name)
        # Every other present map fails layer_bindings; absent maps have no identity.
        textures[name] = {'present': entry['present']}
    ao = layer.get('aoMapIntensity')
    if isinstance(ao, bool) or not isinstance(ao, (int, float)) or not math.isfinite(ao) or ao < 0:
        raise ValueError('sourceAmbient: invalid source AO intensity')
    sheen = layer.get('sheenColor')
    if not isinstance(sheen, (list, tuple)) or len(sheen) != 3:
        raise ValueError('sourceAmbient: invalid source sheen colour')
    values = (layer.get('clearcoat'), layer.get('transmission'), *sheen)
    if any(isinstance(v, bool) or not isinstance(v, (int, float))
           or not math.isfinite(v) or not 0 <= v <= 1 for v in values):
        raise ValueError('sourceAmbient: invalid source layer coefficients')
    if not layer['physical'] and any(values):
        raise ValueError('sourceAmbient: non-Physical source has Physical coefficients')
    coefficients = layer_bindings(layer)  # All variants must pass, even if equally unsupported.
    return {'ambientProjection': 1, 'version': 1, 'model': model,
            'unlit': layer['unlit'], 'physical': layer['physical'],
            'normalFacing': facing, 'ownEnvironmentMap': layer['ownEnvironmentMap'],
            'textures': textures, 'aoMapIntensity': float(ao),
            'clearcoat': coefficients['Clearcoat'], 'transmission': coefficients['Transmission'],
            'sheenColor': list(coefficients['SheenColor'])}


def layer_for_key(materials, key):
    row = materials.get(key)
    if not row or not row.get('sourceAmbient'):
        raise ValueError('sourceAmbient: missing actual source layer contract '+key)
    variants = row.get('sourceAmbientVariants')
    if variants:
        if not isinstance(variants, list):
            raise ValueError('sourceAmbient: invalid source variants '+key)
        projected = [ambient_layer_projection(layer) for layer in [row['sourceAmbient'], *variants]]
        if any(layer != projected[0] for layer in projected[1:]):
            raise ValueError('sourceAmbient: same exported key has ambiguous ambient layers '+key)
        return projected[0]
    layer = row['sourceAmbient']
    # Unambiguous Basic retains the existing no-injection branch. Every lit row
    # uses the same validated context, even when no collision was recorded.
    return layer if layer.get('unlit') is True else ambient_layer_projection(layer)


BINDING_OWNER = '/Game/Lunden/Generated/SourceAmbient/'
PROVENANCE_FIELDS = {'version','kind','original','originalPackageSHA256','originalChainSHA256','contractSHA256','parent'}


def binding_stamp(record):
    """Stable owned-artifact identity; metadata is never accepted by path alone."""
    import hashlib
    if not isinstance(record,dict) or set(record) != PROVENANCE_FIELDS or record['version'] != 1:
        raise ValueError('sourceAmbient: missing/corrupt binding provenance')
    if record['kind'] not in ('master','instance'):
        raise ValueError('sourceAmbient: invalid provenance kind')
    original=record['original']
    if not isinstance(original,str) or not original.startswith('/') or original.startswith(BINDING_OWNER):
        raise ValueError('sourceAmbient: provenance must name a real uninjected original')
    for name in ('originalPackageSHA256','originalChainSHA256','contractSHA256'):
        digest=record[name]
        if not isinstance(digest,str) or len(digest)!=64 or any(c not in '0123456789abcdef' for c in digest):
            raise ValueError('sourceAmbient: invalid provenance '+name)
    if record['kind']=='instance':
        if not isinstance(record['parent'],str) or not record['parent'].startswith(BINDING_OWNER):
            raise ValueError('sourceAmbient: foreign bound parent')
    elif record['parent'] is not None:
        raise ValueError('sourceAmbient: master cannot have an instance parent')
    return hashlib.sha256(json.dumps(record,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def binding_decision(*, path, stamp, provenance, kind, actual_parent, injection_count,
                     original_package_sha256, original_chain_sha256, contract_sha256, bound_copy_proof=None):
    """Actual lifecycle decision used by the adapter; engine-independent.

    Changed bytes at the same original path are a rebuild, not a licence to reuse
    the old copied graph. Missing/corrupt/foreign ownership is always an error.
    The engine adapter resolves and fingerprints the ORIGINAL chain before calling.
    """
    owned=path.startswith(BINDING_OWNER)
    if not stamp and provenance is None:
        if owned or injection_count:
            raise ValueError('sourceAmbient: injected/owned graph has missing provenance')
        return 'build'
    if not owned or not stamp or provenance is None:
        raise ValueError('sourceAmbient: foreign/incomplete binding provenance')
    verify_bound_copy(bound_copy_proof)
    if bound_copy_proof['stamp'] != stamp:
        raise ValueError('sourceAmbient: receipt belongs to a different binding stamp')
    if binding_stamp(provenance) != stamp or provenance['kind'] != kind:
        raise ValueError('sourceAmbient: corrupt binding stamp/kind')
    if actual_parent != provenance['parent'] or injection_count != (1 if kind=='master' else 0):
        raise ValueError('sourceAmbient: corrupt bound parent/function graph')
    if original_package_sha256 is None or original_chain_sha256 is None:
        raise ValueError('sourceAmbient: original source package/chain is missing')
    if (provenance['originalPackageSHA256']==original_package_sha256
            and provenance['originalChainSHA256']==original_chain_sha256
            and provenance['contractSHA256']==contract_sha256):
        return 'reuse'
    return 'rebuild'



def verify_bound_copy(proof):
    """A post-save external receipt proves unchanged persisted copy bytes.

    This is an integrity baseline from our successful save, not proof that the
    first build is visually correct or that its overrides match the source.
    Native save/reload/override equivalence remains an activation requirement.
    """
    if not isinstance(proof,dict) or proof.get('dirty') is not False:
        raise ValueError('sourceAmbient: dirty/unproved bound copy cannot be reused')
    receipt=proof.get('receipt')
    if not isinstance(receipt,dict) or set(receipt) != {'packageSHA256','stamp','provenanceSHA256'}:
        raise ValueError('sourceAmbient: missing/corrupt persisted-copy receipt')
    digest=proof.get('packageSHA256')
    if not isinstance(digest,str) or len(digest)!=64 or any(c not in '0123456789abcdef' for c in digest):
        raise ValueError('sourceAmbient: missing actual saved-copy package hash')
    if any(proof.get(name) != receipt[name] for name in ('packageSHA256','stamp','provenanceSHA256')):
        raise ValueError('sourceAmbient: bound copy changed after its recorded save')
    return True
