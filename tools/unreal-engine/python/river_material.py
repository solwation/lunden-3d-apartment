"""Höje å: the near river frame and masked far-water planes exported from src/riversurface.js."""
import ast
import math
from pathlib import Path

WEATHER = "/Game/Lunden/Lighting/MPC_LundenWeather"
CALENDAR = "/Game/Lunden/Seasons/MPC_LundenVegetation"
# Unreal's specular input of a dielectric (F0 = 0.08 x Specular); 0.5 is the engine default, the web's 0.04.
DEFAULT_SPECULAR = 0.5


WATER_SPECULAR = f"return Frame.x > 0.5 && SnowLies < 0.5 ? 0.0 : {DEFAULT_SPECULAR};"


def display_gain():
    """#2410: the web adds its reflected sky in its own radiance units, shown at three's toneMappingExposure. The game's
    locked exposure is that exposure times 2^EXPOSURE_BIAS (build_lighting.py, #2313), and an emissive value E renders as
    three.js renders E at exposure 1 (#2396's probe), so the same picture needs E x 2^-EXPOSURE_BIAS at any hour. Read
    from build_lighting.py's source so the two never drift (that module needs the editor to import)."""
    tree = ast.parse((Path(__file__).with_name("build_lighting.py")).read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "EXPOSURE_BIAS" for t in node.targets):
            return 2.0 ** -float(ast.literal_eval(node.value))
    raise RuntimeError("build_lighting.py has no EXPOSURE_BIAS")


def number(n):
    value = float(n)
    if not math.isfinite(value):
        raise ValueError("Non-finite river material coefficient")
    literal = format(value, ".10g")
    return literal if "." in literal or "e" in literal else literal + ".0"


def vec(values):
    return f"float{len(values)}({', '.join(number(x) for x in values)})"


def shaders(data, flowing):
    """World axes are Unreal XY horizontally, Z up; camera and positions enter in cm. Colours are linear."""
    distance, footprint = data["distance"], data["footprint"]
    if flowing:
        init = ("float2 d = normalize(FlowDir + float2(0.00001, 0.00001));\n"
                f"float2 p = float2(8.0 * (Frame.x + Frame.y) - {number(data['flowSpeed'])} * RiverTime, CrossShore.x);")
        waves = data["flow"]["waves"]
    else:
        init = "if (Frame.x <= 0.5 || SnowLies > 0.5) return Face * normalize(BaseNormal);\nfloat2 p = WorldCm.xy * 0.01;"
        waves = data["waves"]
    terms = []
    for a, b, c, d, bend, gain in waves:
        n = math.hypot(a, b)
        terms.append(f"slope += {vec([a/n, b/n])} * {number(gain)} * cos(dot({vec([a,b])}, p)"
                     f" + {number(bend)} * sin(dot({vec([c,d])}, p)));")
    normal = f"""
float2 fw = fwidth(WorldCm.xy * 0.01);
float fade = (1.0 - smoothstep({number(distance[0])}, {number(distance[1])}, length(EyeCm - WorldCm) * 0.01))
           * (1.0 - smoothstep({number(footprint[0])}, {number(footprint[1])}, max(fw.x, fw.y)));
{init}
float2 slope = float2(0.0, 0.0);
{chr(10).join(terms)}
{'slope = d * slope.x + float2(-d.y, d.x) * slope.y;' if flowing else ''}
return Face * normalize(normalize(BaseNormal) - float3(slope * fade, 0.0));
"""
    palette, dusk, fresnel, bank = data["palette"], data["dusk"], data["sky"], data["bank"]
    a, b, c, d = map(number, dusk["sun"])
    reflection = f"""
if (Face < 0.0 {'|| Frame.x <= 0.5 || SnowLies > 0.5' if not flowing else ''}) return float3(0.0, 0.0, 0.0);
float sun = SunDir.z;
float day = smoothstep(-0.08, 0.18, sun);
float oc = max(Rain, 0.7 * Snow);
float glow = (1.0 - smoothstep(0.0, 0.35, abs(sun))) * smoothstep(-0.15, 0.05, sun);
float3 horizon = lerp({vec(palette['nightHorizon'])}, {vec(palette['dayHorizon'])}, day);
horizon = lerp(horizon, {vec(palette['duskHorizon'])}, glow * 0.6);
horizon = lerp(horizon, {vec(palette['overcast'])} * (0.2 + 0.8 * day), oc * 0.7);
float tw = smoothstep({a}, {b}, sun) * (1.0 - smoothstep({c}, {d}, sun));
float3 zenith = lerp({vec(palette['nightZenith'])}, {vec(palette['dayZenith'])}, day);
zenith = lerp(zenith, {vec(dusk['zenith']['color'])}, {number(dusk['zenith']['amount'])} * tw * (1.0 - {number(dusk['overcast'])} * oc));
zenith = lerp(zenith, {vec(palette['overcast'])} * (0.15 + 0.85 * day), oc * 0.85);
float3 V = normalize(EyeVector);
float3 N = normalize(SurfaceNormal);
float3 reflected = reflect(-V, N);
float3 sky = lerp(horizon, zenith, sqrt(saturate(reflected.z)));
{f"sky = lerp(sky, {vec(bank['tint'])}, {number(bank['mix'])} * smoothstep({number(bank['from'])}, 1.0, CrossShore.y));" if flowing else ''}
float F0 = {number(fresnel['f0'])};
return sky * ((F0 + (1.0 - F0) * pow(1.0 - saturate(dot(N, V)), {number(fresnel['power'])})) * {number(fresnel['gain'])});
"""
    return normal.strip(), reflection.strip()


def reads(spec):
    """#2408: the collection parameters the material reads, {collection: names} (build_materials.py hashes their GUIDs)."""
    out = {WEATHER: ("SunDir", "Rain", "Snow")}
    if spec["mode"] != "flow":
        out[CALENDAR] = ("Month",)
    return out


def build(material, spec):
    import unreal as u
    mel = u.MaterialEditingLibrary
    data, flowing = spec["river"], spec["mode"] == "flow"
    normal_code, reflection_code = shaders(data, flowing)
    mpc = u.EditorAssetLibrary.load_asset(WEATHER)
    if not mpc:
        raise RuntimeError("Generate MPC_LundenWeather with build_lighting.py before building river materials")

    def expr(kind, x, y, **props):
        node = mel.create_material_expression(material, kind, x, y)
        for key, value in props.items():
            node.set_editor_property(key, value)
        return node

    def custom(label, code, inputs, x, y, output=u.CustomMaterialOutputType.CMOT_FLOAT3):
        node = expr(u.MaterialExpressionCustom, x, y, description=label, code=code,
                    output_type=output)
        pins = []
        for name in inputs:
            pin = u.CustomInput()
            pin.set_editor_property("input_name", name)
            pins.append(pin)
        node.set_editor_property("inputs", pins)
        for name, source in inputs.items():
            if not mel.connect_material_expressions(source, "", node, name):
                raise RuntimeError(f"{label}: cannot connect {name}")
        return node

    def uv(index, y):
        return expr(u.MaterialExpressionTextureCoordinate, -1000, y, coordinate_index=index)

    material.set_editor_property("two_sided", True)
    material.set_editor_property("tangent_space_normal", False)
    normal_inputs = {"WorldCm": expr(u.MaterialExpressionWorldPosition, -1000, 0),
                     "EyeCm": expr(u.MaterialExpressionCameraPositionWS, -1000, 120),
                     "BaseNormal": expr(u.MaterialExpressionVertexNormalWS, -1000, 240), "Frame": uv(0, 360),
                     "Face": expr(u.MaterialExpressionTwoSidedSign, -1000, 840)}
    if flowing:
        normal_inputs.update(FlowDir=uv(1, 480), CrossShore=uv(2, 600),
                             RiverTime=expr(u.MaterialExpressionTime, -1000, 720, override_period=True, period=data["clockPeriod"]))
    else:
        seasons = u.EditorAssetLibrary.load_asset(CALENDAR)
        if not seasons:
            raise RuntimeError("Generate the vegetation collection with build_seasons.py before building river materials")
        month = expr(u.MaterialExpressionCollectionParameter, -1300, 630, collection=seasons, parameter_name="Month")
        condition = " || ".join(f"Month == {number(m)}" for m in data["snowMonths"])
        snow_lies = custom("Web edge-land calendar snow", "return " + condition + " ? 1.0 : 0.0;",
                           {"Month": month}, -1050, 630, u.CustomMaterialOutputType.CMOT_FLOAT1)
        normal_inputs["SnowLies"] = snow_lies
    norm = custom("Web river ripple normal (world space)", normal_code, normal_inputs, -540, 0)
    sky_inputs = {"SurfaceNormal": norm, "EyeVector": expr(u.MaterialExpressionCameraVectorWS, -750, 850),
                  "Face": normal_inputs["Face"]}
    for i, name in enumerate(("SunDir", "Rain", "Snow")):
        sky_inputs[name] = expr(u.MaterialExpressionCollectionParameter, -750, 1100 + i*140, collection=mpc, parameter_name=name)
    if flowing:
        sky_inputs["CrossShore"] = normal_inputs["CrossShore"]
    else:
        sky_inputs.update(Frame=normal_inputs["Frame"], SnowLies=snow_lies)
    sky = custom("Web river sky reflection", reflection_code, sky_inputs, -260, 450)
    # #2410: the web has no environment map, so its water reflects only the sky added above and the sun; its indirect
    # light reaches the diffuse colour, which three scales by (1 - metalness). Unreal would reflect its own sky on top
    # (Lumen / sky light, the whole sky at grazing angles): a second, grey reflection that made the far water pale. The
    # water therefore takes the web's diffuse colour, Metallic 0 and Specular 0, and the added sky is the only reflection.
    # The sun's glint on the ripples goes with it (#2362). The edge mesh's land and lying snow keep the engine default.
    if flowing:
        color = u.LinearColor()
        rgb = bytes.fromhex(data["color"].lstrip("#"))
        color.set_from_srgb(u.Color(r=rgb[0], g=rgb[1], b=rgb[2], a=255))
        k = 1.0 - float(spec["metallic"])
        base = expr(u.MaterialExpressionConstant3Vector, -500, -200, constant=u.LinearColor(color.r * k, color.g * k, color.b * k, 1.0))
        specular = expr(u.MaterialExpressionConstant, -500, -560, r=0.0)
    else:
        base = custom("Web edge-land vertex colours and lying snow",
                      f"return lerp(Land.rgb, {vec(data['snowGround'])}, SnowLies);",
                      {"Land": expr(u.MaterialExpressionVertexColor, -780, -200), "SnowLies": snow_lies}, -500, -200)
        if float(spec["metallic"]) != 0.0:
            raise ValueError("The edge-land water is a plain diffuse surface on the web (metalness 0)")
        specular = custom("Web edge-land: no engine reflection on the water", WATER_SPECULAR,
                          {"Frame": normal_inputs["Frame"], "SnowLies": snow_lies}, -500, -560, u.CustomMaterialOutputType.CMOT_FLOAT1)
    shown = expr(u.MaterialExpressionMultiply, -60, 450, const_b=display_gain())
    if not mel.connect_material_expressions(sky, "", shown, "A"):
        raise RuntimeError("Cannot scale the river sky to display units")
    # UE flips tangent-space normals automatically. This graph supplies the signed world normal itself.
    for source, prop in ((base, u.MaterialProperty.MP_BASE_COLOR), (norm, u.MaterialProperty.MP_NORMAL),
                         (shown, u.MaterialProperty.MP_EMISSIVE_COLOR), (specular, u.MaterialProperty.MP_SPECULAR),
                         (expr(u.MaterialExpressionConstant, -500, -320, r=spec["roughness"]), u.MaterialProperty.MP_ROUGHNESS),
                         (expr(u.MaterialExpressionConstant, -500, -440, r=0.0), u.MaterialProperty.MP_METALLIC)):
        if not mel.connect_material_property(source, "", prop):
            raise RuntimeError(f"Cannot wire river material output {prop}")


def check(material, spec):
    """Check the compiled graph wiring on an actual saved UE material in build_materials.py --check."""
    import unreal as u
    mel = u.MaterialEditingLibrary
    normal, sky = shaders(spec["river"], spec["mode"] == "flow")
    problems = []
    shown = mel.get_material_property_input_node(material, u.MaterialProperty.MP_EMISSIVE_COLOR)
    gain = display_gain()
    if not isinstance(shown, u.MaterialExpressionMultiply) or abs(shown.get_editor_property("const_b") - gain) > 1e-4 * gain:
        problems.append(f"river sky is not scaled to display units (x {gain:.4f}, #2410)")
        shown = None
    sky_node = (mel.get_inputs_for_material_expression(material, shown) or [None])[0] if shown else None
    for prop, node, expected in ((u.MaterialProperty.MP_NORMAL, mel.get_material_property_input_node(material, u.MaterialProperty.MP_NORMAL), normal),
                                 (u.MaterialProperty.MP_EMISSIVE_COLOR, sky_node, sky)):
        if not isinstance(node, u.MaterialExpressionCustom) or node.get_editor_property("code") != expected:
            problems.append(f"missing or stale river shader on {prop}")
    specular = mel.get_material_property_input_node(material, u.MaterialProperty.MP_SPECULAR)
    if spec["mode"] == "flow":
        if not isinstance(specular, u.MaterialExpressionConstant) or specular.get_editor_property("r") != 0.0:
            problems.append("the near water must not take Unreal's own reflection (Specular 0, #2410)")
    elif not isinstance(specular, u.MaterialExpressionCustom) or specular.get_editor_property("code") != WATER_SPECULAR:
        problems.append("the edge-land water must not take Unreal's own reflection (#2410)")
    metallic = mel.get_material_property_input_node(material, u.MaterialProperty.MP_METALLIC)
    if not isinstance(metallic, u.MaterialExpressionConstant) or metallic.get_editor_property("r") != 0.0:
        problems.append("expected Metallic 0 (the web's metalness is in the base colour, #2410)")
    if not material.get_editor_property("two_sided") or material.get_editor_property("tangent_space_normal"):
        problems.append("expected a two-sided material with world-space normals")
    if spec["mode"] == "edge":
        base = mel.get_material_property_input_node(material, u.MaterialProperty.MP_BASE_COLOR)
        if not base or not any(isinstance(node, u.MaterialExpressionVertexColor)
                               for node in mel.get_inputs_for_material_expression(material, base)):
            problems.append("edge-land has lost its vertex colours")
    return problems
