"""#2322: layer the source Silvia floor field on the original living-room rug, Generated only.

The source floor quad sits below the rug and uses polygonOffset. The derived UE plane
is exactly coplanar with the exported rug top, with depth testing on and no height bias.
Native distance/occlusion captures must validate this depth strategy before visual acceptance.
No imported material, source light intensity or versioned Lighting asset is changed.
"""
import base64
import hashlib
import json
from pathlib import Path

import unreal as u

DIR = "/Game/Lunden/Generated/Interaction/RugPool"
LEVEL = "/Game/Lunden/Generated/Interaction/Level_l1007_interaction"
TAG = "lunden:rug-floor-pool"
HASH = "Lunden.RugPoolHash"
FADE = "LampFade"
EAL = u.EditorAssetLibrary
MEL = u.MaterialEditingLibrary
TOOLS = u.AssetToolsHelpers.get_asset_tools()


def asset(name, cls, factory):
    path = DIR + "/" + name
    return EAL.load_asset(path) if EAL.does_asset_exist(path) else TOOLS.create_asset(name, DIR, cls, factory)


def save(obj, stamp):
    EAL.set_metadata_tag(obj, HASH, stamp)
    if not EAL.save_loaded_asset(obj, only_if_is_dirty=False):
        raise RuntimeError("Could not save " + obj.get_path_name())


def mask_texture(spec):
    if spec["mask"] != {"width": 128, "height": 128, "colorSpace": "linear", "flipY": True}:
        raise RuntimeError("Changed source floor-pool mask contract")
    png = base64.b64decode(spec["maskPng"], validate=True)
    stamp = hashlib.sha256(png).hexdigest()
    name = "T_RugPoolMask"
    path = DIR + "/" + name
    texture = EAL.load_asset(path) if EAL.does_asset_exist(path) else None
    if texture and EAL.get_metadata_tag(texture, HASH) == stamp:
        return texture
    file = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_intermediate_dir())) / (name + ".png")
    file.write_bytes(png)
    task = u.AssetImportTask()
    task.filename, task.destination_path = str(file), DIR
    task.automated, task.replace_existing, task.save = True, True, False
    TOOLS.import_asset_tasks([task])
    texture = EAL.load_asset(path)
    if not isinstance(texture, u.Texture2D):
        raise RuntimeError("Could not import the source floor-pool mask")
    texture.set_editor_property("srgb", False)  # CanvasTexture has NoColorSpace: never decode as sRGB.
    for axis in ("address_x", "address_y"):
        texture.set_editor_property(axis, u.TextureAddress.TA_CLAMP)
    save(texture, stamp)
    return texture


def pool_uv(point, corners):
    """Source quad UV from an Unreal world point, also used by the non-render native test."""
    origin = corners["0,0"]
    delta = [p - o for p, o in zip(point, origin)]
    edges = [[p - o for p, o in zip(corners[key], origin)] for key in ("1,0", "0,1")]
    return [sum(d * e for d, e in zip(delta, edge)) / sum(e * e for e in edge) for edge in edges]


def material(spec, stamp):
    texture = mask_texture(spec)
    mat = asset("M_RugPool", u.Material, u.MaterialFactoryNew())
    if EAL.get_metadata_tag(mat, HASH) == stamp:
        return mat
    MEL.delete_all_material_expressions(mat)
    mat.set_editor_property("shading_model", u.MaterialShadingModel.MSM_UNLIT)
    mat.set_editor_property("blend_mode", u.BlendMode.BLEND_ADDITIVE)
    mat.set_editor_property("disable_depth_test", False)
    mat.set_editor_property("two_sided", True)
    mat.set_editor_property("use_translucency_vertex_fog", False)  # Source glowMaterial.fog=false.
    sample = MEL.create_material_expression(mat, u.MaterialExpressionTextureSample, -600, 0)
    sample.set_editor_property("texture", texture)
    sample.set_editor_property("sampler_type", u.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
    position = MEL.create_material_expression(mat, u.MaterialExpressionWorldPosition, -1100, 0)
    uv = MEL.create_material_expression(mat, u.MaterialExpressionCustom, -850, 0)
    pin = u.CustomInput()
    pin.set_editor_property("input_name", "WorldCm")
    uv.set_editor_property("inputs", [pin])
    origin = spec["corners"]["0,0"]
    vector = lambda values: "float3(" + ",".join(format(v, ".12g") for v in values) + ")"
    edges = [[p - o for p, o in zip(spec["corners"][key], origin)] for key in ("1,0", "0,1")]
    code = "float3 p = WorldCm - " + vector(origin) + ";\n"
    terms = ["dot(p," + vector(e) + ")/" + format(sum(v * v for v in e), ".12g") for e in edges]
    # Three flipY=true maps V=0 to the PNG's bottom; UE's imported PNG starts at the top.
    code += "float2 uv = float2(" + terms[0] + ",1-(" + terms[1] + "));\n"
    # The web has an actual finite quad. Clamp sampling alone would smear its edge texel
    # across parts of the rug outside that quad (the edge texel need not be exactly black).
    uv.set_editor_property("code", code + "clip(min(min(uv.x,uv.y),min(1-uv.x,1-uv.y))); return uv;")
    uv.set_editor_property("output_type", u.CustomMaterialOutputType.CMOT_FLOAT2)
    colour = MEL.create_material_expression(mat, u.MaterialExpressionConstant3Vector, -600, 200)
    colour.set_editor_property("constant", u.LinearColor(*spec["colour"], 1))
    product = MEL.create_material_expression(mat, u.MaterialExpressionMultiply, -300, 0)
    fade = MEL.create_material_expression(mat, u.MaterialExpressionScalarParameter, -600, 400)
    fade.set_editor_property("parameter_name", FADE)
    fade.set_editor_property("default_value", 0)
    opacity = MEL.create_material_expression(mat, u.MaterialExpressionMultiply, -300, 250)
    opacity.set_editor_property("const_b", spec["opacity"])
    if not all((MEL.connect_material_expressions(position, "XYZ", uv, "WorldCm"),
                MEL.connect_material_expressions(uv, "", sample, "UVs"),
                MEL.connect_material_expressions(sample, "RGB", product, "A"),
                MEL.connect_material_expressions(colour, "", product, "B"),
                MEL.connect_material_expressions(fade, "", opacity, "A"),
                MEL.connect_material_property(product, "", u.MaterialProperty.MP_EMISSIVE_COLOR),
                MEL.connect_material_property(opacity, "", u.MaterialProperty.MP_OPACITY))):
        raise RuntimeError("Could not wire the source rug floor pool")
    MEL.recompile_material(mat)
    save(mat, stamp)
    return mat


def controller(lamp_tag):
    import player_parts as pp
    lib = u.BlueprintEditorLibrary
    path = DIR + "/BP_LundenRugPool"
    lamp = EAL.load_asset("/Game/Lunden/Lighting/BP_LundenLamp").generated_class()
    mpc = EAL.load_asset("/Game/Lunden/Lighting/MPC_LundenWeather")
    stamp = hashlib.sha256(Path(__file__).read_bytes().replace(b"\r\n", b"\n") + lamp_tag.encode()).hexdigest()
    if EAL.does_asset_exist(path):
        bp = EAL.load_asset(path)
        if EAL.get_metadata_tag(bp, HASH) == stamp:
            return bp.generated_class()
        events = u.BlueprintGraphEditor.get_graph_editor_by_name(bp, "EventGraph")
        events.remove_nodes(list(events.list_all_nodes()))
        for method in ("FindLamp", "UpdateRugPool"):
            if lib.find_graph(bp, method):
                lib.remove_function_graph(bp, method)
    else:
        factory = u.BlueprintFactory()
        factory.set_editor_property("parent_class", u.StaticMeshActor)
        bp = TOOLS.create_asset("BP_LundenRugPool", DIR, u.Blueprint, factory)
    pp.variables(bp, {"SourceLamp": lib.get_object_reference_type(lamp), "AppliedFade": pp.REAL})
    g, _ = pp.function(bp, "FindLamp")
    g.branch(g.op("Not_PreBool", A=g.pure("KismetSystemLibrary:IsValid", Object=g.get("SourceLamp"))))
    found = g.run("GameplayStatics:GetAllActorsWithTag", Tag=lamp_tag)
    lamps = pp.out(found, "OutActors")
    g.branch(g.op("EqualEqual_IntInt", A=g.pure("KismetArrayLibrary:Array_Length", TargetArray=lamps), B=1))
    typed = g.cast(g.item(lamps, 0), ["CastToActor", "Cast To Actor"], u.Actor.static_class(), lamp)
    g.set("SourceLamp", typed)
    g, _ = pp.function(bp, "UpdateRugPool")
    g.run(pp.class_path(path) + ":FindLamp")
    source = g.get("SourceLamp")
    missing = g.branch(g.pure("KismetSystemLibrary:IsValid", Object=source))
    supply = g.pure("KismetMaterialLibrary:GetScalarParameterValue", Collection=mpc.get_path_name(), ParameterName="PowerAvailable")
    fade = g.op("Multiply_DoubleDouble", A=g.get("K", lamp.get_path_name(), source), B=supply)

    def apply(graph, value):
        graph.branch(graph.op("NotEqual_DoubleDouble", A=graph.get("AppliedFade"), B=value))
        graph.set("AppliedFade", value)
        mesh = graph.get("StaticMeshComponent", "/Script/Engine.StaticMeshActor")
        graph.run("MeshComponent:SetScalarParameterValueOnMaterials", target=mesh, ParameterName=FADE,
                  ParameterValue=graph.get("AppliedFade"))

    apply(g, fade)
    apply(g.fork(missing, 800), 0)
    g = pp.events(bp)
    pp.event(g, bp, "AddEvent|EventBeginPlay", "ReceiveBeginPlay", 0)
    g.run("Actor:SetActorTickInterval", TickInterval=".05")
    g.run(pp.class_path(path) + ":UpdateRugPool")
    pp.event(g, bp, "AddEvent|EventTick", "ReceiveTick", 550)
    g.run(pp.class_path(path) + ":UpdateRugPool")
    pp.compiled(bp)
    comp = u.get_default_object(bp.generated_class()).static_mesh_component
    comp.set_collision_profile_name("NoCollision")
    comp.set_editor_property("cast_shadow", False)
    save(bp, stamp)
    return bp.generated_class()


def main():
    project = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
    spec = json.loads((project / "Import/measurements.json").read_text(encoding="utf-8"))["furnishing"].get("rugFloorPool")
    if not spec:
        u.log("LUNDEN_RUG_POOL: no rug floor field in this export")
        return
    stamp = hashlib.sha256(Path(__file__).read_bytes().replace(b"\r\n", b"\n") + json.dumps(spec, sort_keys=True).encode()).hexdigest()
    mat = material(spec, stamp)
    cls = controller("lamp:" + spec["lamp"])
    world = u.EditorLoadingAndSavingUtils.load_map(LEVEL)
    if not world:
        raise RuntimeError("Build the L1007 interaction level before its rug pool")
    actors = u.get_editor_subsystem(u.EditorActorSubsystem)
    by_tag = {str(t): a for a in actors.get_all_level_actors() for t in a.tags}
    existing = {str(a.tags[1]): a for a in u.GameplayStatics.get_all_actors_with_tag(world, TAG)}
    plane = u.load_asset("/Engine/BasicShapes/Plane.Plane")
    changed = False
    for receiver in spec["receivers"]:
        source = by_tag.get(receiver["mesh"])
        comp = source.get_component_by_class(u.StaticMeshComponent) if source else None
        if not comp or not comp.static_mesh or comp.get_material(0).get_name() != receiver["key"]:
            raise RuntimeError("Missing unmodified rug receiver " + receiver["mesh"])
        corners = {key: u.Vector(*xyz) for key, xyz in receiver["corners"].items()}
        start = corners["0,0"]
        horizontal, vertical = corners["1,0"] - start, corners["0,1"] - start
        centre = (start + corners["1,1"]) * .5
        rotation = u.MathLibrary.make_rot_from_xy(horizontal, vertical)
        scale = u.Vector(horizontal.length() / 100, vertical.length() / 100, 1)
        name = receiver["mesh"] + ":rug-pool"
        actor = existing.pop(name, None)
        if actor:
            comp = actor.static_mesh_component
            if (comp.static_mesh == plane and comp.get_material(0) == mat
                    and (actor.get_actor_location() - centre).length() < .00001
                    and (actor.get_actor_scale3d() - scale).length() < .00001
                    and actor.get_actor_rotation() == rotation):
                continue
        else:
            actor = actors.spawn_actor_from_class(cls, centre, rotation)
            actor.set_actor_label("Vardagsrumsmattans pendelljus")
            actor.tags = [u.Name(TAG), u.Name(name)]
        actor.set_actor_location_and_rotation(centre, rotation, False, False)
        actor.set_actor_scale3d(scale)
        comp = actor.static_mesh_component
        comp.set_static_mesh(plane)
        comp.set_material(0, mat)
        comp.set_collision_profile_name("NoCollision")
        comp.set_collision_enabled(u.CollisionEnabled.NO_COLLISION)
        comp.set_editor_property("cast_shadow", False)
        comp.set_editor_property("translucency_sort_priority", spec["depth"]["renderOrder"])
        changed = True
    for old in existing.values():
        if not actors.destroy_actor(old):
            raise RuntimeError("Could not retire a rug pool")
        changed = True
    if changed and not u.EditorLoadingAndSavingUtils.save_map(world, LEVEL):
        raise RuntimeError("Could not save " + LEVEL)
    u.log(f"LUNDEN_RUG_POOL_OK: {len(spec['receivers'])} coplanar receivers, changed={changed}")


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    main()
