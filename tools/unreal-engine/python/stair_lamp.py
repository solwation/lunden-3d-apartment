"""L1007 stair receivers: light functions from the web lamp-wash profiles exported with the room and furnishing lamps."""
import hashlib
import math

FOLDER = "/Game/Lunden/Generated/Lighting/StairLightFunctions"


def number(value):
    value = float(value)
    if not math.isfinite(value):
        raise ValueError("Non-finite stair lamp coefficient")
    return format(value, ".10f").rstrip("0").rstrip(".") or "0"


def shader(bounds, profiles):
    """LightFunctionCommon.ush reconstructs the receiver's world position. Unreal XY = plan x/z, Z = web height."""
    code = ["float3 P = WorldCm * 0.01, C = EyeCm * 0.01;", "float shaft = 0.0;"]
    for box in bounds:
        lo, hi = (", ".join(number(n) for n in box[i:i+3]) for i in (0, 3))
        code.append(f"""{{
    float3 outside = max(float3({lo}) - P, P - float3({hi}));
    shaft = max(shaft, 1.0 - smoothstep(0.0, 0.05, max(outside.x, max(outside.y, outside.z))));
}}""")
    code.extend(["if (shaft == 0.0) return 1.0;", "float visible = 0.0;"])
    total = sum(p["weight"] for p in profiles)
    if total <= 0:
        raise ValueError("A lamp visibility profile needs a positive anchor weight")
    for profile in profiles:
        weight = number(profile["weight"] / total)
        if "rays" not in profile:
            code.append(f"visible += {weight};")
            continue
        rays = profile["rays"]
        count = len(rays)
        if count < 2:
            raise ValueError("An angular visibility profile needs at least two rays")
        origin = ", ".join(number(x) for x in profile["origin"])
        split = number(profile["split"])
        code.append(f"""{{
    static const float rays[{count}] = {{ {", ".join(number(r) for r in rays)} }};
    float2 origin = float2({origin});
    float2 offsets[2] = {{ P.xy - origin, C.xy - origin }};
    bool seen[2];
    [unroll] for (uint j = 0; j < 2; ++j) {{
        float2 o = offsets[j];
        float t = frac(atan2(o.y, o.x) / 6.28318530718 + 1.0) * {count};
        uint k = min((uint)floor(t), {count - 1}u);
        float reach = lerp(rays[k], rays[(k + 1u) % {count}u], frac(t));
        seen[j] = length(o) <= reach + 0.05;
    }}
    bool onFloor = (P.z > {split}) == {str(bool(profile["level"])).lower()};
    // An unshaded light visible from the visitor's own floor can be a direct web pool light.
    // Preserve its direct contribution. Shaded or obscured lights get the web wash cutoff.
    bool direct = {str(profile["canPool"]).lower()} && seen[1] && ((C.z > {number(profile["viewerSplit"])}) == {str(bool(profile["level"])).lower()});
    visible += (direct || (onFloor && seen[0])) ? {weight} : 0.0;
}}""")
    code.append("return lerp(1.0, visible, shaft);")
    return "\n".join(code)


def path_for(row):
    return FOLDER + "/M_" + row["id"]


def graph_matches(material, code):
    import unreal as u
    if not material or material.get_editor_property("material_domain") != u.MaterialDomain.MD_LIGHT_FUNCTION:
        return False
    mel = u.MaterialEditingLibrary
    node = mel.get_material_property_input_node(material, u.MaterialProperty.MP_EMISSIVE_COLOR)
    if not isinstance(node, u.MaterialExpressionCustom) or node.get_editor_property("code") != code:
        return False
    inputs = mel.get_inputs_for_material_expression(material, node)
    return (any(isinstance(source, u.MaterialExpressionWorldPosition) for source in inputs)
            and any(isinstance(source, u.MaterialExpressionCameraPositionWS) for source in inputs))


def build(row, bounds):
    import unreal as u
    code = shader(bounds, row["stairVisibility"])
    digest = hashlib.sha256(code.encode()).hexdigest()
    path = path_for(row)
    eal, mel = u.EditorAssetLibrary, u.MaterialEditingLibrary
    mat = eal.load_asset(path) if eal.does_asset_exist(path) else None
    if mat and eal.get_metadata_tag(mat, "Lunden.StairVisibility") == digest and graph_matches(mat, code):
        return mat
    if mat:
        mel.delete_all_material_expressions(mat)
    else:
        mat = u.AssetToolsHelpers.get_asset_tools().create_asset(path.rsplit("/", 1)[1], FOLDER, u.Material, u.MaterialFactoryNew())
    mat.set_editor_property("material_domain", u.MaterialDomain.MD_LIGHT_FUNCTION)
    node = mel.create_material_expression(mat, u.MaterialExpressionCustom, -300, 0)
    node.set_editor_property("description", "Stair lamp visibility from the web wash")
    node.set_editor_property("code", code)
    node.set_editor_property("output_type", u.CustomMaterialOutputType.CMOT_FLOAT1)
    inputs = [("WorldCm", u.MaterialExpressionWorldPosition), ("EyeCm", u.MaterialExpressionCameraPositionWS)]
    pins = []
    for name, _ in inputs:
        pin = u.CustomInput()
        pin.set_editor_property("input_name", name)
        pins.append(pin)
    node.set_editor_property("inputs", pins)
    for i, (name, cls) in enumerate(inputs):
        source = mel.create_material_expression(mat, cls, -680, i*130)
        if not mel.connect_material_expressions(source, "", node, name):
            raise RuntimeError(f"{path}: cannot connect {name}")
    if not mel.connect_material_property(node, "", u.MaterialProperty.MP_EMISSIVE_COLOR):
        raise RuntimeError(f"{path}: cannot connect the light function")
    mel.recompile_material(mat)
    eal.set_metadata_tag(mat, "Lunden.StairVisibility", digest)
    if not eal.save_loaded_asset(mat, only_if_is_dirty=False):
        raise RuntimeError(f"Could not save {path}")
    return mat
