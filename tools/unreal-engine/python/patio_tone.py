"""#2409 source toneMapped:false for the actual opaque patio string bulbs.

No Unreal access at import. The ReplacingTonemapper receives de-pre-exposed Scene;
this selected source colour bypasses BOTH Neutral and tone-mapping exposure, then
uses the same OETF. No gains, inverse-curve fit, or guessed colour constants.
"""
import json
import struct
from pathlib import Path

STENCIL = 239  # reserved only for exported patioStringBulb components
TAG = 'patio:string-bulb'
MASTER = '/InterchangeAssets/gltf/M_Unlit.M_Unlit'

EXPECTED_PARAMETER = 'PatioBulbLinear'
SELECT_HLSL = f'''
// Scene is de-pre-exposed, never Exposed/Neutral output. Reconstruct and compare
// the actual RGBA16F scene storage; no fit tolerance. A transparent/fog mixture
// must not inherit the bulb's tone-map exemption just from opaque depth.
bool pristine = View.PreExposure > 0.0 && all(isfinite(Scene.rgb)) && all(isfinite(Expected.rgb))
    && all(f32tof16(Scene.rgb * View.PreExposure) == f32tof16(Expected.rgb * View.PreExposure));
bool sourceBulb = round(CustomStencil.r) == {STENCIL}.0
    && CustomDepth.r > 0.0 && CustomDepth.r <= SceneDepth.r && pristine;
return sourceBulb ? Expected.rgb : Neutral.rgb;
'''



def validate_source(data):
    if data.get('toneMapped') is not False:
        raise ValueError('Re-export the actual patio bulb toneMapped:false contract (#2409)')
    return data


def source_ids(path):
    with Path(path).open('rb') as f:
        magic, version, total = struct.unpack('<III', f.read(12))
        size, kind = struct.unpack('<I4s', f.read(8))
        if magic != 0x46546c67 or version != 2 or kind != b'JSON' or size+20 > total:
            raise RuntimeError('Invalid actual patio GLB')
        nodes = json.loads(f.read(size))['nodes']
    rows = [n['extras']['id'] for n in nodes if n.get('extras', {}).get('patioStringBulb')]
    if not rows or len(rows) != len(set(rows)):
        raise RuntimeError('Missing/duplicate actual source bulb identities')
    return set(rows)


def depth_users(world):
    """Certify the exact extra CustomDepth population, not an arbitrary new user.

    Opaque main-pass bulb depth cannot change #2372's cloth test: its AO already
    requires 0<t<=1, hence t*SceneDepth<=SceneDepth<=bulbDepth. A nearer cloth still
    wins CustomDepth. Unknown users remain errors in wall_ao_depth.inventory.
    """
    import unreal as u
    bulbs = list(u.GameplayStatics.get_all_actors_with_tag(world, TAG))
    components = [a.get_component_by_class(u.StaticMeshComponent) for a in bulbs]
    if not any(c and c.get_editor_property('render_custom_depth') for c in components):
        return set()  # editor before the driver's first ApplyPatioBulbs
    expected = source_ids(Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))/'Import/l1007-uteplats.glb')
    ids = [str(a.tags[0]) if a.tags else '' for a in bulbs]
    drivers = list(u.GameplayStatics.get_all_actors_with_tag(world, 'patio:string-driver'))
    if set(ids) != expected or len(ids) != len(expected) or len(drivers) != 1:
        raise RuntimeError('Patio tone-map depth users differ from exported IDs/driver')
    mid = drivers[0].get_editor_property('StringMaterial')
    if not isinstance(mid, u.MaterialInstanceDynamic):
        raise RuntimeError('Patio tone-map depth users have no actual driver MID')
    material = mid
    while isinstance(material, u.MaterialInstance):
        material = material.get_editor_property('parent')
    if (not material or material.get_path_name() != MASTER
            or material.get_editor_property('shading_model') != u.MaterialShadingModel.MSM_UNLIT):
        raise RuntimeError('Patio tone-map depth user lost the original unlit master')
    paths = set()
    for c in components:
        if (not c or c.get_num_materials() != 1 or c.get_material(0) != mid
                or mid.get_blend_mode() != u.BlendMode.BLEND_OPAQUE
                or not c.get_editor_property('render_in_main_pass')
                or not c.get_editor_property('render_in_depth_pass')
                or not c.get_editor_property('render_custom_depth')
                or c.get_editor_property('custom_depth_stencil_value') != STENCIL
                or c.get_editor_property('custom_depth_stencil_write_mask') != u.RendererStencilMask.ERSM_DEFAULT):
            raise RuntimeError('Patio depth user is not an exact source opaque bulb/MID')
        paths.add(c.get_path_name())
    return paths
