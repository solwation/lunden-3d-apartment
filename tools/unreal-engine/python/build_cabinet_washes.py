"""Build the display cabinet's three door washes and two glass-compartment washes from its exported web quads."""

import base64
import hashlib
import json
from pathlib import Path

import unreal as u

DIR = "/Game/Lunden/Generated/Interaction/CabinetWashes"
EAL = u.EditorAssetLibrary
MEL = u.MaterialEditingLibrary
TOOLS = u.AssetToolsHelpers.get_asset_tools()
HASH = "Lunden.CabinetWashHash"
LEVEL = "/Game/Lunden/Generated/Interaction/Level_l1007_interaction"
TAG = "lunden:cabinet-washes"
FADE = "LampFade"
PLANE = "/Engine/BasicShapes/Plane.Plane"
# Native profile guesses; source walnut colour, textures and UVs are not altered.
# Initial revision from the locked #2322 lighting2788460c batch. The former blue
# factor .32 left the real day crop at 1/255 versus the source's 19.6/255.
VENEER_FACTOR = (1.265, 1.259, 1.267)
# Guess: separate day/night native reflectance endpoints. The single static
# factor could not match both the day veneer and its warm spotlit evening view.
# Interpolate with the real weather collection; retain original texture/UV/alpha.
VENEER_NIGHT_FACTOR = (.755, .560, .155)
# Guess: 1.5 times the previous wash radiance to include the first cone centre.
WASH_RADIANCE = (7.35, 4.95, 3.525)
WASH_PROFILE = .55
POINT_GAIN = 3.65


def asset(name, cls, factory):
    path = DIR + "/" + name
    return EAL.load_asset(path) if EAL.does_asset_exist(path) else TOOLS.create_asset(name, DIR, cls, factory)


def save(obj, stamp):
    EAL.set_metadata_tag(obj, HASH, stamp)
    if not EAL.save_loaded_asset(obj, only_if_is_dirty=False):
        raise RuntimeError("Could not save " + obj.get_path_name())


def mask_texture(png):
    name = "T_CabinetWash"
    png = base64.b64decode(png, validate=True)
    fingerprint = hashlib.sha256(png).hexdigest()
    path = DIR + "/" + name
    texture = EAL.load_asset(path) if EAL.does_asset_exist(path) else None
    if texture and EAL.get_metadata_tag(texture, HASH) == fingerprint:
        return texture
    # Import the real 128x256 sRGB CanvasTexture; its RGB carries the fan's intensity.
    file = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_intermediate_dir())) / (name + ".png")
    file.write_bytes(png)
    task = u.AssetImportTask()
    task.filename = str(file)
    task.destination_path = DIR
    task.automated = True
    task.replace_existing = True
    task.save = False
    TOOLS.import_asset_tasks([task])
    texture = EAL.load_asset(path)
    if not isinstance(texture, u.Texture2D):
        raise RuntimeError("Could not import " + str(file))
    texture.set_editor_property("srgb", True)
    for axis in ("address_x", "address_y"):
        texture.set_editor_property(axis, u.TextureAddress.TA_CLAMP)
    save(texture, fingerprint)
    return texture


def material(texture, stamp):
    mat = asset("M_CabinetWash", u.Material, u.MaterialFactoryNew())
    if EAL.get_metadata_tag(mat, HASH) == stamp:
        return mat
    MEL.delete_all_material_expressions(mat)
    mat.set_editor_property("shading_model", u.MaterialShadingModel.MSM_UNLIT)
    mat.set_editor_property("blend_mode", u.BlendMode.BLEND_ADDITIVE)
    sample = MEL.create_material_expression(mat, u.MaterialExpressionTextureSample, -750, 0)
    sample.set_editor_property("texture", texture)
    sample.set_editor_property("sampler_type", u.MaterialSamplerType.SAMPLERTYPE_COLOR)
    # Local X follows the measured canvas U edge, local Y follows V. Both edges of the
    # stock UE plane are 100 cm before scaling. This also preserves the web half-turn.
    position = MEL.create_material_expression(mat, u.MaterialExpressionLocalPosition, -1300, 0)
    uv = MEL.create_material_expression(mat, u.MaterialExpressionCustom, -1020, 0)
    pin = u.CustomInput()
    pin.set_editor_property("input_name", "LocalCm")
    uv.set_editor_property("inputs", [pin])
    uv.set_editor_property("code", "return LocalCm.xy * 0.01 + 0.5;")
    uv.set_editor_property("output_type", u.CustomMaterialOutputType.CMOT_FLOAT2)
    if not (MEL.connect_material_expressions(position, "XYZ", uv, "LocalCm")
            and MEL.connect_material_expressions(uv, "", sample, "UVs")):
        raise RuntimeError("Could not connect web UV to the cabinet wash texture")
    # Three fades and blends a tone-mapped sRGB fragment. Native additive light is blended
    # in scene-linear space; this exponent allows the same measured penumbra in both views.
    exponent = MEL.create_material_expression(mat, u.MaterialExpressionScalarParameter, -730, -210)
    exponent.set_editor_property("parameter_name", "ProfileExponent")
    exponent.set_editor_property("default_value", WASH_PROFILE)
    profile = MEL.create_material_expression(mat, u.MaterialExpressionPower, -525, -170)
    if not (MEL.connect_material_expressions(sample, "R", profile, "Base")
            and MEL.connect_material_expressions(exponent, "", profile, "Exp")):
        raise RuntimeError("Could not connect cabinet wash profile")
    colour = MEL.create_material_expression(mat, u.MaterialExpressionVectorParameter, -750, 200)
    colour.set_editor_property("parameter_name", "Radiance")
    product = MEL.create_material_expression(mat, u.MaterialExpressionMultiply, -400, 0)
    fade = MEL.create_material_expression(mat, u.MaterialExpressionScalarParameter, -400, 220)
    fade.set_editor_property("parameter_name", FADE)
    fade.set_editor_property("default_value", 0.0)
    if not (MEL.connect_material_expressions(profile, "", product, "A")
            and MEL.connect_material_expressions(colour, "", product, "B")
            and MEL.connect_material_property(product, "", u.MaterialProperty.MP_EMISSIVE_COLOR)
            and MEL.connect_material_property(fade, "", u.MaterialProperty.MP_OPACITY)):
        raise RuntimeError("Could not wire the cabinet wash material")
    MEL.recompile_material(mat)
    save(mat, stamp)
    return mat


def geometry(row):
    spec = row["cabinetWashes"]
    stamp = hashlib.sha256(Path(__file__).read_bytes().replace(b"\r\n", b"\n") +
                           json.dumps(spec, sort_keys=True).encode()).hexdigest()
    parent = material(mask_texture(spec["maskPng"]), stamp)
    result, instances = [], {}
    for fan in spec["fans"]:
        key = (tuple(fan["colour"]), fan["opacity"])
        if key not in instances:
            name = "MI_CabinetWash" + str(len(instances))
            mi = asset(name, u.MaterialInstanceConstant, u.MaterialInstanceConstantFactoryNew())
            if EAL.get_metadata_tag(mi, HASH) != stamp:
                MEL.set_material_instance_parent(mi, parent)
                tint = [c * k * fan["opacity"] for c, k in zip(fan["colour"], WASH_RADIANCE)]
                # A freshly compiled parent exposes parameter names on the next commandlet run.
                info = u.MaterialParameterInfo()
                info.set_editor_property("name", "Radiance")
                value = u.VectorParameterValue()
                value.set_editor_property("parameter_info", info)
                value.set_editor_property("parameter_value", u.LinearColor(*tint, 1.0))
                mi.set_editor_property("vector_parameter_values", [value])
                MEL.update_material_instance(mi)
                save(mi, stamp)
            instances[key] = mi
        corners = {key: u.Vector(*xyz) for key, xyz in fan["corners"].items()}
        start = corners["0,0"]
        horizontal = corners["1,0"] - start
        vertical = corners["0,1"] - start
        centre = (start + corners["1,1"]) * .5
        scale = u.Vector(horizontal.length() / 100, vertical.length() / 100, 1)
        result.append((centre, u.MathLibrary.make_rot_from_xy(horizontal, vertical), scale, instances[key]))
    return result


def place(actor, surface, template):
    centre, rotation, scale, material = surface
    actor.set_actor_location_and_rotation(centre, rotation, False, False)
    actor.set_actor_scale3d(scale)
    comp = actor.static_mesh_component
    comp.set_static_mesh(template)
    comp.set_material(0, material)
    comp.set_editor_property("cast_shadow", False)
    comp.set_collision_profile_name("NoCollision")
    comp.set_collision_enabled(u.CollisionEnabled.NO_COLLISION)
    comp.set_editor_property("translucency_sort_priority", 2)
    return comp


def controller(lamp_tag):
    import player_parts as pp
    bp_lib = u.BlueprintEditorLibrary
    name = "BP_LundenCabinetWashes"
    path = DIR + "/" + name
    lamp = EAL.load_asset("/Game/Lunden/Lighting/BP_LundenLamp").generated_class()
    mpc = EAL.load_asset("/Game/Lunden/Lighting/MPC_LundenWeather")
    stamp = hashlib.sha256(Path(__file__).read_bytes().replace(b"\r\n", b"\n") + lamp_tag.encode()).hexdigest()
    if EAL.does_asset_exist(path):
        bp = EAL.load_asset(path)
        if EAL.get_metadata_tag(bp, HASH) == stamp:
            return bp.generated_class()
        events = u.BlueprintGraphEditor.get_graph_editor_by_name(bp, "EventGraph")
        events.remove_nodes(list(events.list_all_nodes()))
        for method in ("UpdateWashes", "ApplyPoint", "ApplyVeneer", "FindLamp"):
            if bp_lib.find_graph(bp, method):
                bp_lib.remove_function_graph(bp, method)
    else:
        factory = u.BlueprintFactory()
        factory.set_editor_property("parent_class", u.StaticMeshActor)
        bp = TOOLS.create_asset(name, DIR, u.Blueprint, factory)
    pp.variables(bp, {"SourceLamp": bp_lib.get_object_reference_type(lamp), "AppliedFade": pp.REAL, "PointCandela": pp.REAL,
                      "VeneerPanels": pp.array(bp_lib.get_object_reference_type(u.StaticMeshActor.static_class())),
                      "DayVeneer": pp.VEC, "NightVeneer": pp.VEC, "AppliedVeneer": pp.VEC, "VeneerApplied": pp.BOOL})
    for field in ("PointCandela", "VeneerPanels", "DayVeneer", "NightVeneer"):
        bp_lib.set_blueprint_variable_instance_editable(bp, field, True)
    g, _ = pp.function(bp, "FindLamp")
    g.branch(g.op("Not_PreBool", A=g.pure("KismetSystemLibrary:IsValid", Object=g.get("SourceLamp"))))
    found = g.run("GameplayStatics:GetAllActorsWithTag", Tag=lamp_tag)
    lamps = pp.out(found, "OutActors")
    g.branch(g.op("EqualEqual_IntInt", A=g.pure("KismetArrayLibrary:Array_Length", TargetArray=lamps), B=1))
    typed = g.cast(g.item(lamps, 0), ["CastToActor", "Cast To Actor"], u.Actor.static_class(), lamp)
    g.set("SourceLamp", typed)
    g, pins = pp.function(bp, "ApplyPoint", [("Fade", pp.REAL), ("Grid", pp.REAL)])
    # One surface drives the original point source. Its own TurnOn/TurnOff still uses the
    # source's Candela and Supply, including between the material controller's updates.
    candela, source = g.get("PointCandela"), g.get("SourceLamp")
    g.branch(g.op("Greater_DoubleDouble", A=candela, B=0))
    g.set("Candela", candela, lamp.get_path_name(), source)
    g.set("Supply", pins["Grid"], lamp.get_path_name(), source)
    light = g.pure("Actor:GetComponentByClass", target=source, ComponentClass="/Script/Engine.PointLightComponent")
    g.run("LightComponent:SetIntensity", target=light, NewIntensity=g.op("Multiply_DoubleDouble", A=candela, B=pins["Fade"]))
    g, _ = pp.function(bp, "ApplyVeneer")
    day = g.pure("KismetMaterialLibrary:GetScalarParameterValue", Collection=mpc.get_path_name(), ParameterName="Daylight")
    colour = g.op("VLerp", A=g.get("NightVeneer"), B=g.get("DayVeneer"),
                  Alpha=g.op("FClamp", Value=day, Min="0", Max="1"))
    same = g.op("EqualExactly_VectorVector", A=colour, B=g.get("AppliedVeneer"))
    g.branch(g.op("Not_PreBool", A=g.op("BooleanAND", A=same, B=g.get("VeneerApplied"))))
    g.set("AppliedVeneer", colour)
    g.set("VeneerApplied", True)
    panel, _, _ = g.loop(g.get("VeneerPanels"))
    # This Blueprint itself derives from StaticMeshActor: its member getter
    # binds to self and has no target pin. Resolve each source panel explicitly.
    mesh = g.pure("Actor:GetComponentByClass", target=panel,
                  ComponentClass="/Script/Engine.StaticMeshComponent")
    g.run("MeshComponent:SetVectorParameterValueOnMaterials", target=mesh,
          ParameterName="BaseColorFactor", ParameterValue=g.get("AppliedVeneer"))
    g, _ = pp.function(bp, "UpdateWashes")
    # Daylight may change while the lamp's fade is unchanged. Refresh the local
    # veneer profile independently, before the existing fade-change fast path.
    g.run(pp.class_path(path) + ":ApplyVeneer")
    g.run(pp.class_path(path) + ":FindLamp")
    source = g.get("SourceLamp")
    missing = g.branch(g.pure("KismetSystemLibrary:IsValid", Object=source))
    supply = g.pure("KismetMaterialLibrary:GetScalarParameterValue", Collection=mpc.get_path_name(), ParameterName="PowerAvailable")
    fade = g.op("Multiply_DoubleDouble", A=g.get("K", lamp.get_path_name(), source), B=supply)

    g.run(pp.class_path(path) + ":ApplyPoint", Fade=fade, Grid=supply)

    def apply(graph, value):
        different = graph.op("NotEqual_DoubleDouble", A=graph.get("AppliedFade"), B=value)
        graph.branch(different)
        graph.set("AppliedFade", value)
        mesh = graph.get("StaticMeshComponent", "/Script/Engine.StaticMeshActor")
        graph.run("MeshComponent:SetScalarParameterValueOnMaterials", target=mesh, ParameterName=FADE,
                  ParameterValue=graph.get("AppliedFade"))

    apply(g, fade)
    apply(g.fork(missing, 800), 0)
    g = pp.events(bp)
    pp.event(g, bp, "AddEvent|EventBeginPlay", "ReceiveBeginPlay", 0)
    g.run("Actor:SetActorTickInterval", TickInterval=".05")
    g.run(pp.class_path(path) + ":UpdateWashes")
    pp.event(g, bp, "AddEvent|EventTick", "ReceiveTick", 550)
    g.run(pp.class_path(path) + ":UpdateWashes")
    pp.compiled(bp)
    template = u.get_default_object(bp.generated_class()).static_mesh_component
    template.set_collision_profile_name("NoCollision")
    template.set_editor_property("cast_shadow", False)
    save(bp, stamp)
    return bp.generated_class()


def veneer_material(key):
    # The web only assigns room reflections to tagged glossy surfaces. This matte door
    # has no environment map. UE's ambient cubemap produced neutral highlights even with
    # black diffuse RGB. The cabinet's four components share this local child override.
    original = EAL.load_asset("/Game/Lunden/Generated/l1007/Materials/" + key)
    if not isinstance(original, u.MaterialInstanceConstant):
        raise RuntimeError("Missing imported cabinet veneer " + key)
    base = MEL.get_material_instance_vector_parameter_value(original, "BaseColorFactor")
    tint = [c * k for c, k in zip((base.r, base.g, base.b), VENEER_FACTOR)]
    mi = asset("MI_CabinetWalnut", u.MaterialInstanceConstant, u.MaterialInstanceConstantFactoryNew())
    stamp = hashlib.sha256(json.dumps([original.get_path_name(), tint, 0]).encode()).hexdigest()
    if EAL.get_metadata_tag(mi, HASH) != stamp:
        MEL.set_material_instance_parent(mi, original)
        MEL.set_material_instance_vector_parameter_value(mi, "BaseColorFactor", u.LinearColor(*tint, base.a))
        MEL.set_material_instance_scalar_parameter_value(mi, "SpecularFactor", 0)
        MEL.update_material_instance(mi)
        # UE 5.8's scalar setter returns false even after setting the parameter. Read the effective values.
        result = MEL.get_material_instance_vector_parameter_value(mi, "BaseColorFactor")
        if (max(abs(a - b) for a, b in zip((result.r, result.g, result.b), tint)) > .00001
                or abs(MEL.get_material_instance_scalar_parameter_value(mi, "SpecularFactor")) > .00001):
            raise RuntimeError("The imported veneer does not expose glTF base colour and specular factors")
        EAL.set_metadata_tag(mi, "Lunden.Assumption", "guess: day/night native veneer profile with original imported texture, UVs and alpha; runtime Daylight interpolation on four cabinet leaves; Windows full profile unverified")
        save(mi, stamp)
    return original, mi


def main():
    project = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
    spec = json.loads((project / "Import/measurements.json").read_text(encoding="utf-8"))
    sources = [row for row in spec["lights"] if "cabinetWashes" in row]
    if not sources:  # Partial zones and exports from before the rendered surfaces were recorded.
        u.log("LUNDEN_CABINET_WASHES: no cabinet fields in this export")
        return
    [row] = sources
    surfaces = geometry(row)
    veneer_key = row["cabinetWashes"].get("veneerKey")
    veneer = veneer_material(veneer_key) if veneer_key else None
    cls = controller("lamp:" + row["id"])
    import build_lighting
    # Use the builder's current intensity units. Only the measured display cabinet gets this conversion.
    candela = next(l["candela"] for l in build_lighting.lamp_rows(spec) if l["id"] == row["id"]) * POINT_GAIN
    world = u.EditorLoadingAndSavingUtils.load_map(LEVEL)
    if not world:
        raise RuntimeError("Build the L1007 interaction level before its cabinet washes")
    template = u.load_asset(PLANE)
    actors = u.get_editor_subsystem(u.EditorActorSubsystem)
    existing = {str(a.tags[1]): a for a in u.GameplayStatics.get_all_actors_with_tag(world, TAG)}
    changed = False
    panels, day_veneer, night_veneer = [], u.Vector(0, 0, 0), u.Vector(0, 0, 0)
    if veneer:
        original, finish = veneer
        doors = []
        for actor in actors.get_all_level_actors():
            if not actor.tags or not str(actor.tags[0]).startswith(row["id"] + "__"):
                continue
            comp = actor.get_component_by_class(u.StaticMeshComponent)
            if comp and comp.static_mesh and comp.static_mesh.get_material(0) == original:
                doors.append(comp)
        if len(doors) != 4:
            raise RuntimeError(f"Expected four display-cabinet veneer leaves, found {len(doors)}")
        for comp in doors:
            if comp.get_material(0) != finish:
                comp.set_material(0, finish)
                changed = True
        panels = [comp.get_owner() for comp in doors]
        base = MEL.get_material_instance_vector_parameter_value(original, "BaseColorFactor")
        day_veneer = u.Vector(*[c*k for c, k in zip((base.r, base.g, base.b), VENEER_FACTOR)])
        night_veneer = u.Vector(*[c*k for c, k in zip((base.r, base.g, base.b), VENEER_NIGHT_FACTOR)])
    for i, surface in enumerate(surfaces):
        name = row["id"] + ":wash:" + str(i)
        centre, rotation, scale, material = surface
        point = candela if i == 0 else 0
        actor = existing.pop(name, None)
        if actor:
            comp = actor.static_mesh_component
            if (abs(actor.get_editor_property("PointCandela") - point) < .00001
                    and list(actor.get_editor_property("VeneerPanels")) == (panels if i == 0 else [])
                    and actor.get_editor_property("DayVeneer") == day_veneer
                    and actor.get_editor_property("NightVeneer") == night_veneer
                    and comp.static_mesh == template and comp.get_material(0) == material
                    and comp.get_collision_enabled() == u.CollisionEnabled.NO_COLLISION
                    and not comp.get_editor_property("cast_shadow")
                    and (actor.get_actor_location() - centre).length() < .01
                    and (actor.get_actor_scale3d() - scale).length() < .00001
                    and actor.get_actor_rotation() == rotation):
                continue
        else:
            actor = actors.spawn_actor_from_class(cls, centre, rotation)
            actor.set_actor_label("Vitrinskåpets ljusfält " + str(i + 1))
            actor.tags = [u.Name(TAG), u.Name(name)]
        actor.set_editor_property("PointCandela", point)
        actor.set_editor_property("VeneerPanels", panels if i == 0 else [])
        actor.set_editor_property("DayVeneer", day_veneer)
        actor.set_editor_property("NightVeneer", night_veneer)
        place(actor, surface, template)
        changed = True
    for old in existing.values():
        if not actors.destroy_actor(old):
            raise RuntimeError("Could not retire a cabinet wash")
        changed = True
    if changed and not u.EditorLoadingAndSavingUtils.save_map(world, LEVEL):
        raise RuntimeError("Could not save " + LEVEL)
    u.log(f"LUNDEN_CABINET_WASHES_OK: {len(surfaces)} fields in the L1007 interaction level, changed={changed}")


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    main()
