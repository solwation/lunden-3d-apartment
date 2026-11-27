"""#2322: add the source Silvia field to a Generated copy of the rug's original material.

The web uses a depth-biased quad. A coplanar UE overlay disappeared at one real camera;
the receiver now draws its original PBR surface plus the source emission in one pass.
No extra geometry, height bias, imported material edit or authored Lighting edit.
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


def add_emission(mat, spec):
    """Keep the copied master graph intact; add only the source field to existing emission."""
    texture = mask_texture(spec)
    if mat.get_editor_property("use_material_attributes"):
        raise RuntimeError("The source rug master no longer exposes its direct emissive input")
    previous = MEL.get_material_property_input_node(mat, u.MaterialProperty.MP_EMISSIVE_COLOR)
    output = MEL.get_material_property_input_node_output_name(mat, u.MaterialProperty.MP_EMISSIVE_COLOR)
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
    uv.set_editor_property("code", code + "return uv;")
    uv.set_editor_property("output_type", u.CustomMaterialOutputType.CMOT_FLOAT2)
    coverage = MEL.create_material_expression(mat, u.MaterialExpressionCustom, -600, -250)
    pin = u.CustomInput()
    pin.set_editor_property("input_name", "UV")
    coverage.set_editor_property("inputs", [pin])
    # Zero only the new emission outside the finite quad; never clip the original rug.
    coverage.set_editor_property("code", "return (UV.x>=0 && UV.x<=1 && UV.y>=0 && UV.y<=1) ? 1.0 : 0.0;")
    coverage.set_editor_property("output_type", u.CustomMaterialOutputType.CMOT_FLOAT1)
    normal = MEL.create_material_expression(mat, u.MaterialExpressionVertexNormalWS, -850, -550)
    up = MEL.create_material_expression(mat, u.MaterialExpressionComponentMask, -600, -550)
    for key in ("r", "g", "a"):
        up.set_editor_property(key, False)
    up.set_editor_property("b", True)
    top = MEL.create_material_expression(mat, u.MaterialExpressionMax, -350, -550)
    top.set_editor_property("const_b", 0)
    # VertexNormalWS is a vertex-only input. Interpolate the geometric face weight,
    # keeping PBR normal maps independent of which real rug surface receives light.
    face = MEL.create_material_expression(mat, u.MaterialExpressionVertexInterpolator, -100, -550)
    weight = MEL.create_material_expression(mat, u.MaterialExpressionMultiply, -100, -250)
    colour = MEL.create_material_expression(mat, u.MaterialExpressionConstant3Vector, -600, 200)
    colour.set_editor_property("constant", u.LinearColor(*(v * spec["opacity"] for v in spec["colour"]), 1))
    product = MEL.create_material_expression(mat, u.MaterialExpressionMultiply, -300, 0)
    fade = MEL.create_material_expression(mat, u.MaterialExpressionScalarParameter, -600, 400)
    fade.set_editor_property("parameter_name", FADE)
    fade.set_editor_property("default_value", 0)
    faded = MEL.create_material_expression(mat, u.MaterialExpressionMultiply, -100, 200)
    contribution = MEL.create_material_expression(mat, u.MaterialExpressionMultiply, 150, 0)
    emission = MEL.create_material_expression(mat, u.MaterialExpressionAdd, 400, 0)
    if not all((MEL.connect_material_expressions(position, "XYZ", uv, "WorldCm"),
                MEL.connect_material_expressions(uv, "", sample, "UVs"),
                MEL.connect_material_expressions(uv, "", coverage, "UV"),
                MEL.connect_material_expressions(normal, "", up, "Input"),
                MEL.connect_material_expressions(up, "", top, "A"),
                MEL.connect_material_expressions(top, "", face, "Input"),
                MEL.connect_material_expressions(face, "", weight, "A"),
                MEL.connect_material_expressions(coverage, "", weight, "B"),
                MEL.connect_material_expressions(sample, "RGB", product, "A"),
                MEL.connect_material_expressions(colour, "", product, "B"),
                MEL.connect_material_expressions(product, "", faded, "A"),
                MEL.connect_material_expressions(fade, "", faded, "B"),
                MEL.connect_material_expressions(faded, "", contribution, "A"),
                MEL.connect_material_expressions(weight, "", contribution, "B"),
                MEL.connect_material_expressions(contribution, "", emission, "B"),
                MEL.connect_material_property(emission, "", u.MaterialProperty.MP_EMISSIVE_COLOR))):
        raise RuntimeError("Could not wire the source rug floor pool")
    if previous and not MEL.connect_material_expressions(previous, output, emission, "A"):
        raise RuntimeError("Could not retain the rug's original emission")
    MEL.recompile_material(mat)


def receiver_material(original, spec, stamp):
    """Copy the complete MIC inheritance chain, including every existing parameter/override."""
    chain, parent = [], original
    while isinstance(parent, u.MaterialInstanceConstant):
        chain.append(parent)
        parent = parent.get_editor_property("parent")
    if not isinstance(parent, u.Material) or not chain:
        raise RuntimeError("Expected the imported rug's material-instance chain")
    if FADE in [str(name) for name in MEL.get_scalar_parameter_names(original)]:
        raise RuntimeError("The source rug already owns the reserved " + FADE + " parameter")
    # The imported name/pool spec can stay unchanged when Interchange or the master
    # changes PBR overrides. Bind reuse to every source package, not only our code.
    digest = hashlib.sha256(stamp.encode())
    dirty = u.EditorLoadingAndSavingUtils.get_dirty_content_packages()
    for source in [*chain, parent]:
        if source.get_outermost() in dirty:
            raise RuntimeError("Save the source material before copying " + source.get_path_name())
        package = source.get_path_name().split(".")[0]
        filename = u.PackageTools.package_name_to_filename(package, ".uasset")
        file = Path(u.Paths.convert_relative_path_to_full(filename)) if filename else None
        if not file or not file.is_file():
            raise RuntimeError("Missing source material package " + package)
        digest.update(package.encode())
        for suffix in (".uasset", ".uexp", ".ubulk"):
            part = file.with_suffix(suffix)
            if part.is_file():
                digest.update(suffix.encode())
                digest.update(part.read_bytes())
    stamp = digest.hexdigest()
    folder = DIR + "/Surface_" + stamp[:12]
    leaf = folder + "/" + original.get_name()
    if EAL.does_asset_exist(leaf):
        result = EAL.load_asset(leaf)
        if EAL.get_metadata_tag(result, HASH) != stamp:
            raise RuntimeError("Incomplete rug material copy " + leaf)
        return result
    EAL.make_directory(folder)
    copied = EAL.duplicate_asset(parent.get_path_name(), folder + "/M_RugReceiver")
    if not isinstance(copied, u.Material):
        raise RuntimeError("Could not copy the original rug master")
    add_emission(copied, spec)
    save(copied, stamp)
    for i, source in enumerate(reversed(chain)):
        target = leaf if source == original else folder + "/MI_Parent_" + str(i)
        child = EAL.duplicate_asset(source.get_path_name(), target)
        if not isinstance(child, u.MaterialInstanceConstant):
            raise RuntimeError("Could not copy " + source.get_path_name())
        MEL.set_material_instance_parent(child, copied)
        MEL.update_material_instance(child)
        save(child, stamp)
        copied = child
    return copied


def controller(lamp_tag):
    import player_parts as pp
    lib = u.BlueprintEditorLibrary
    path = DIR + "/BP_LundenRugPoolReceiver"
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
        factory.set_editor_property("parent_class", u.Actor)
        bp = TOOLS.create_asset("BP_LundenRugPoolReceiver", DIR, u.Blueprint, factory)
    pp.variables(bp, {"SourceLamp": lib.get_object_reference_type(lamp),
                      "Receiver": lib.get_object_reference_type(u.Actor.static_class()), "AppliedFade": pp.REAL})
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
        mesh = graph.pure("Actor:GetComponentByClass", target=graph.get("Receiver"), ComponentClass="/Script/Engine.StaticMeshComponent")
        graph.branch(graph.pure("KismetSystemLibrary:IsValid", Object=mesh))
        graph.set("AppliedFade", value)
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
    save(bp, stamp)
    return bp.generated_class()


def main():
    project = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
    spec = json.loads((project / "Import/measurements.json").read_text(encoding="utf-8"))["furnishing"].get("rugFloorPool")
    if not spec:
        u.log("LUNDEN_RUG_POOL: no rug floor field in this export")
        return
    stamp = hashlib.sha256(Path(__file__).read_bytes().replace(b"\r\n", b"\n") + json.dumps(spec, sort_keys=True).encode()).hexdigest()
    cls = controller("lamp:" + spec["lamp"])
    surfaces = {}
    for receiver in spec["receivers"]:
        original = EAL.load_asset("/Game/Lunden/Generated/l1007/Materials/" + receiver["key"])
        if not isinstance(original, u.MaterialInstanceConstant):
            raise RuntimeError("Missing imported rug material " + receiver["key"])
        surfaces[receiver["mesh"]] = (original, receiver_material(original, spec, stamp))
    world = u.EditorLoadingAndSavingUtils.load_map(LEVEL)
    if not world:
        raise RuntimeError("Build the L1007 interaction level before its rug pool")
    actors = u.get_editor_subsystem(u.EditorActorSubsystem)
    by_tag = {str(t): a for a in actors.get_all_level_actors() for t in a.tags}
    existing = {str(a.tags[1]): a for a in u.GameplayStatics.get_all_actors_with_tag(world, TAG)}
    changed = False
    for receiver in spec["receivers"]:
        source = by_tag.get(receiver["mesh"])
        comp = source.get_component_by_class(u.StaticMeshComponent) if source else None
        original, mat = surfaces[receiver["mesh"]]
        if not comp or not comp.static_mesh or comp.get_material(0).get_name() != receiver["key"]:
            raise RuntimeError("Missing original rug receiver " + receiver["mesh"])
        if comp.get_material(0) != mat:
            comp.set_material(0, mat)
            changed = True
        name = receiver["mesh"] + ":rug-pool"
        actor = existing.pop(name, None)
        if actor and actor.get_class() != cls:
            if not actors.destroy_actor(actor):
                raise RuntimeError("Could not retire the previous coplanar rug overlay")
            actor = None
            changed = True
        if not actor:
            actor = actors.spawn_actor_from_class(cls, source.get_actor_location())
            actor.set_actor_label("Vardagsrumsmattans pendelljus")
            actor.tags = [u.Name(TAG), u.Name(name)]
            changed = True
        if actor.get_editor_property("Receiver") != source:
            actor.set_editor_property("Receiver", source)
            changed = True
    for old in existing.values():
        if not actors.destroy_actor(old):
            raise RuntimeError("Could not retire a rug pool")
        changed = True
    if changed and not u.EditorLoadingAndSavingUtils.save_map(world, LEVEL):
        raise RuntimeError("Could not save " + LEVEL)
    u.log(f"LUNDEN_RUG_POOL_OK: {len(spec['receivers'])} original surfaces with copied PBR and source emission, changed={changed}")


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    main()
