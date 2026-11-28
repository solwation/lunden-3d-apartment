"""#2396: the web's tone mapping in Unreal. The web renders with THREE.NeutralToneMapping (Khronos PBR Neutral, src/main.js)
and writes sRGB; Unreal's default filmic tonemapper made every room paler, colder and less saturated (#2394, #2390).
M_LundenNeutralTonemap replaces Unreal's tonemapper (BL_ReplacingTonemapper) with a transcription of three.js r170's
`NeutralToneMapping` and its `sRGBTransferOETF` (the version pinned in index.html's import map: three@0.170.0, shader
chunks `tonemapping_pars_fragment` and `colorspace_pars_fragment`).

The scene colour reaches a post-process material with Unreal's pre-exposure already taken out, so the exposure
(EyeAdaptation) x PostProcessInput0 is the exposed linear colour: what three.js has after `color *= toneMappingExposure`
(the web's exposure is Unreal's locked manual exposure, build_lighting.EXPOSURE_BIAS). Measured with
tests/neutral_tonemap_probe.py: at bias -2 this gives exposure 0.2475 (x 0.99 at bias 0); also dividing by
View.PreExposure, as Unreal's own tonemapper does with its raw input, left the picture at bias 0's brightness. The output is display-encoded sRGB, as
the tonemapper writes it. Not carried: Unreal's bloom, vignette, film grain, colour grading LUT and local exposure, none
of which the web has. #2409 retains a frontmost-opaque patio-bulb exception for the source
MeshBasicMaterial toneMapped:false: raw de-pre-exposed Scene bypasses exposure and Neutral,
then uses the same OETF. Its identity/depth/stencil contract is checked by test_patio_strings.
Cost: one full-screen pass with a few ALU per pixel, in place of the tonemapper's own pass.
"""
import unreal as u

import patio_tone

MATERIAL = "/Game/Lunden/Lighting/M_LundenNeutralTonemap"

# three.js r170, src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js (NeutralToneMapping) and
# colorspace_pars_fragment.glsl.js (sRGBTransferOETF), in HLSL. `toneMappingExposure` is 1 here: Unreal's exposure is
# already in `Exposed`. tests/check-neutral-tonemap.cjs compares the result with three.js 0.170.0 itself.
NEUTRAL_HLSL = """
float3 color = Exposed;
const float StartCompression = 0.8 - 0.04;
const float Desaturation = 0.15;
float x = min(color.r, min(color.g, color.b));
float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
color -= offset;
float peak = max(color.r, max(color.g, color.b));
if (peak >= StartCompression)
{
    float d = 1. - StartCompression;
    float newPeak = 1. - d * d / (peak + d - StartCompression);
    color *= newPeak / peak;
    float g = 1. - 1. / (Desaturation * (peak - newPeak) + 1.);
    color = lerp(color, float3(newPeak, newPeak, newPeak), g);
}
return color;
"""
OETF_HLSL = """
float3 v = max(Linear, 0.0);
return lerp(pow(v, 0.41666) * 1.055 - 0.055, v * 12.92, float3(v <= 0.0031308));
"""


def _custom(mat, x, y, code, inputs, description):
    node = u.MaterialEditingLibrary.create_material_expression(mat, u.MaterialExpressionCustom, x, y)
    pins = []
    for name in inputs:
        pin = u.CustomInput()
        pin.set_editor_property("input_name", name)
        pins.append(pin)
    node.set_editor_property("inputs", pins)
    node.set_editor_property("output_type", u.CustomMaterialOutputType.CMOT_FLOAT3)
    node.set_editor_property("description", description)
    node.set_editor_property("code", code)
    return node


def build(path=MATERIAL, encode=True):
    """The post-process material at `path` (made or rebuilt in place). `encode` False leaves the result linear (only for
    the numerical check of the curve; the game uses the encoded output)."""
    assets, mel = u.EditorAssetLibrary, u.MaterialEditingLibrary
    if assets.does_asset_exist(path):
        mat = assets.load_asset(path)
        mel.delete_all_material_expressions(mat)
    else:
        folder, name = path.rsplit("/", 1)
        mat = u.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, u.Material, u.MaterialFactoryNew())
    mat.set_editor_property("material_domain", u.MaterialDomain.MD_POST_PROCESS)
    mat.set_editor_property("blendable_location", u.BlendableLocation.BL_REPLACING_TONEMAPPER)
    scene = mel.create_material_expression(mat, u.MaterialExpressionSceneTexture, -1100, 0)
    scene.set_editor_property("scene_texture_id", u.SceneTextureId.PPI_POST_PROCESS_INPUT0)
    exposure = mel.create_material_expression(mat, u.MaterialExpressionEyeAdaptation, -1100, 160)
    expose = _custom(mat, -800, 0, "return Scene.rgb * Exposure;", ["Scene", "Exposure"],
                     "Exposed linear colour (Unreal's exposure applied)")
    if not (mel.connect_material_expressions(scene, "Color", expose, "Scene")
            and mel.connect_material_expressions(exposure, "", expose, "Exposure")):
        raise RuntimeError(path + ": could not wire the scene colour")
    neutral = _custom(mat, -500, 0, NEUTRAL_HLSL, ["Exposed"], "three.js r170 NeutralToneMapping")
    mel.connect_material_expressions(expose, "", neutral, "Exposed")
    # Only certified frontmost opaque patio bulbs bypass Neutral AND exposure.
    selected = _custom(mat, -360, 0, patio_tone.SELECT_HLSL,
                       ["Scene", "Neutral", "SceneDepth", "CustomDepth", "CustomStencil", "Expected"],
                       "Source patio bulbs: toneMapped false (no exposure)")
    mel.connect_material_expressions(scene, "Color", selected, "Scene")
    mel.connect_material_expressions(neutral, "", selected, "Neutral")
    for index, (name, enum) in enumerate((("SceneDepth", u.SceneTextureId.PPI_SCENE_DEPTH),
                                         ("CustomDepth", u.SceneTextureId.PPI_CUSTOM_DEPTH),
                                         ("CustomStencil", u.SceneTextureId.PPI_CUSTOM_STENCIL))):
        node = mel.create_material_expression(mat, u.MaterialExpressionSceneTexture, -1100, 320+index*120)
        node.set_editor_property("scene_texture_id", enum)
        node.set_editor_property("filtered", False)
        if not mel.connect_material_expressions(node, "Color", selected, name):
            raise RuntimeError(path + ": could not wire source bulb visibility "+name)
    expected = mel.create_material_expression(mat, u.MaterialExpressionCollectionParameter, -1100, 700)
    expected.set_editor_property("collection", assets.load_asset("/Game/Lunden/Lighting/MPC_LundenWeather"))
    expected.set_editor_property("parameter_name", patio_tone.EXPECTED_PARAMETER)
    if not mel.connect_material_expressions(expected, "", selected, "Expected"):
        raise RuntimeError(path + ": could not bind actual source bulb colour")
    last = selected
    if encode:
        oetf = _custom(mat, -250, 0, OETF_HLSL, ["Linear"], "three.js r170 sRGBTransferOETF")
        mel.connect_material_expressions(selected, "", oetf, "Linear")
        last = oetf
    if not mel.connect_material_property(last, "", u.MaterialProperty.MP_EMISSIVE_COLOR):
        raise RuntimeError(path + ": could not wire the output")
    errors = list(mel.recompile_material(mat))
    if errors:
        raise RuntimeError(path + ": tone-map material compilation failed: " + str(errors))
    return mat
