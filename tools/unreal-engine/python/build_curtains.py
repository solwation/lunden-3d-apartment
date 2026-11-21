"""Drive the printed L1007 cloth's imported emissive factor from its own room lamps and weather."""
import hashlib
import json
import sys
from pathlib import Path

PATH = "/Game/Lunden/Generated/Interaction/BP_LundenCurtainLight"
LAMP = "/Game/Lunden/Lighting/BP_LundenLamp"
WEATHER = "/Game/Lunden/Lighting/MPC_LundenWeather"
LEVEL = "/Game/Lunden/Generated/Interaction/Level_l1007_interaction"
TAG = "lunden:curtain-light"
APPLY = "UpdateCurtainLight"


def emission(g, day, dusk, supply, lit, daylight_colour, lamp_colour):
    # Native DuskLight = Daylight * (1 - 0.6 * overcast). The blind's daylight factor uses 0.5.
    sky = g.op("Add_DoubleDouble", A=day, B=g.op("Multiply_DoubleDouble", A="0.8333333333333333",
               B=g.op("Subtract_DoubleDouble", A=dusk, B=day)))
    sky = g.op("FClamp", Value=sky, Min="0", Max="1")
    powered = g.op("BooleanAND", A=lit, B=g.op("Greater_DoubleDouble", A=supply, B="0.5"))
    lamp = g.op("SelectVector", A=lamp_colour, B="0,0,0", bPickA=powered)
    return g.op("Add_VectorVector", A=g.op("Multiply_VectorFloat", A=daylight_colour, B=sky), B=lamp)


def lamp_visibility(signature):
    # UE's variable spawner uses the declaring class of bHidden. In an Actor graph that
    # getter always means self. A function library exposes the real target actor pin.
    import unreal as u
    import player_parts as pp
    path = "/Game/Lunden/Generated/Interaction/BFL_LundenCurtainLighting"
    method = "IsLampVisible"
    assets = u.EditorAssetLibrary
    if assets.does_asset_exist(path):
        bp = assets.load_asset(path)
        if assets.get_metadata_tag(bp, "Lunden.SpecHash") == signature:
            return pp.class_path(path) + ":" + method
        if u.BlueprintEditorLibrary.find_graph(bp, method):
            u.BlueprintEditorLibrary.remove_function_graph(bp, method)
    else:
        folder, name = path.rsplit("/", 1)
        bp = u.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, u.Blueprint, u.BlueprintFunctionLibraryFactory())
    actor = u.BlueprintEditorLibrary.get_object_reference_type(u.Actor.static_class())
    g, pins = pp.function(bp, method, [("Lamp", actor)], [("Visible", pp.BOOL)], pure=True)
    g.ret(Visible=g.op("Not_PreBool", A=g.get("bHidden", "/Script/Engine.Actor", pins["Lamp"])))
    pp.compiled(bp)
    assets.set_metadata_tag(bp, "Lunden.SpecHash", signature)
    if not assets.save_loaded_asset(bp, only_if_is_dirty=False):
        raise RuntimeError("Could not save " + path)
    return pp.class_path(path) + ":" + method


def controller():
    import unreal as u
    import player_parts as pp
    assets, bp_lib = u.EditorAssetLibrary, u.BlueprintEditorLibrary
    signature = hashlib.sha256(Path(__file__).read_bytes().replace(b"\r\n", b"\n")).hexdigest()
    visible = lamp_visibility(signature)
    lamp = assets.load_asset(LAMP)
    weather = assets.load_asset(WEATHER)
    if not lamp or not weather:
        raise RuntimeError("Build the Lunden lighting assets before building the curtain controller")
    if assets.does_asset_exist(PATH):
        bp = assets.load_asset(PATH)
        if assets.get_metadata_tag(bp, "Lunden.SpecHash") == signature:
            return bp.generated_class()
        if APPLY in map(str, bp_lib.list_graph_names(bp)):
            bp_lib.remove_function_graph(bp, APPLY)
    else:
        factory = u.BlueprintFactory()
        factory.set_editor_property("parent_class", u.Actor)
        folder, name = PATH.rsplit("/", 1)
        bp = u.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, u.Blueprint, factory)
    fields = {"LampTags": pp.array(pp.NAME), "Panels": pp.array(bp_lib.get_object_reference_type(u.StaticMeshActor.static_class())),
              "DaylightColour": pp.VEC, "LampColour": pp.VEC}
    pp.variables(bp, {**fields, "RoomLit": pp.BOOL, "AppliedColour": pp.VEC, "Applied": pp.BOOL})
    for name in fields:
        bp_lib.set_blueprint_variable_instance_editable(bp, name, True)
    g, _ = pp.function(bp, APPLY)
    g.set("RoomLit", False)
    # Using the lamp class index also finds a lighting sublevel that streamed in after this actor.
    lamp_class = lamp.generated_class().get_path_name()
    found = g.run("GameplayStatics:GetAllActorsOfClass", ActorClass=lamp_class)
    actor, _, complete = g.loop(pp.out(found, "OutActors"))
    typed = g.cast(actor, ["CastToActor", "Cast To Actor"], u.Actor.static_class(), lamp.generated_class())
    g.branch(g.get("IsOn", lamp_class, typed))
    g.branch(g.pure(visible, result="Visible", Lamp=typed))
    # Seasonal lamps and regular lamps carry the same stable lamp:<id> tag.
    id_tag, _, _ = g.loop(g.get("LampTags"))
    g.branch(g.pure("Actor:ActorHasTag", target=typed, Tag=id_tag))
    g.set("RoomLit", True)
    g = g.fork(complete, 750)

    def read(name):
        return g.pure("KismetMaterialLibrary:GetScalarParameterValue", Collection=weather.get_path_name(), ParameterName=name)

    colour = emission(g, read("Daylight"), read("DuskLight"), read("PowerAvailable"),
                      g.get("RoomLit"), g.get("DaylightColour"), g.get("LampColour"))
    same = g.op("EqualExactly_VectorVector", A=colour, B=g.get("AppliedColour"))
    g.branch(g.op("Not_PreBool", A=g.op("BooleanAND", A=same, B=g.get("Applied"))))
    g.set("AppliedColour", colour)
    g.set("Applied", True)
    panel, _, _ = g.loop(g.get("Panels"))
    mesh = g.get("StaticMeshComponent", "/Script/Engine.StaticMeshActor", panel)
    g.run("MeshComponent:SetVectorParameterValueOnMaterials", target=mesh, ParameterName="EmissiveFactor", ParameterValue=g.get("AppliedColour"))
    g = pp.events(bp)
    pp.event(g, bp, "AddEvent|EventBeginPlay", "ReceiveBeginPlay", 0)
    g.run("Actor:SetActorTickInterval", TickInterval=".2")
    g.run(pp.class_path(PATH) + ":" + APPLY)
    pp.event(g, bp, "AddEvent|EventTick", "ReceiveTick", 550)
    g.run(pp.class_path(PATH) + ":" + APPLY)
    pp.compiled(bp)
    assets.set_metadata_tag(bp, "Lunden.SpecHash", signature)
    if not assets.save_loaded_asset(bp, only_if_is_dirty=False):
        raise RuntimeError("Could not save " + PATH)
    return bp.generated_class()


def main():
    import unreal as u
    project = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
    rows = json.loads((project / "Import/measurements.json").read_text(encoding="utf-8")).get("furnishing", {}).get("curtains")
    if rows is None:  # earlier exports and partial exports still build the original interaction level
        u.log("LUNDEN_CURTAINS: no exported cloth profiles")
        return
    levels = u.EditorLoadingAndSavingUtils
    cls = controller()  # finish compiling/saving before obtaining any instance references
    world = levels.load_map(LEVEL)
    if not world:
        raise RuntimeError("Build the L1007 interaction level before its curtain controllers")
    actors = u.get_editor_subsystem(u.EditorActorSubsystem)
    all_actors = actors.get_all_level_actors()
    by_id = {str(a.tags[0]): a for a in all_actors if a.tags}
    existing = {str(a.tags[1]): a for a in all_actors if len(a.tags) == 2 and str(a.tags[0]) == TAG}
    changed = False
    for row in rows:
        panels = [by_id[node] for node in row["nodes"]]
        for panel in panels:
            materials = panel.static_mesh_component.get_materials()
            if len(materials) != 1 or not materials[0] or materials[0].get_name() != row["key"]:
                raise RuntimeError("Curtain print or material slots changed: " + row["id"])
        a = existing.pop(row["id"], None)
        if not a:
            a = actors.spawn_actor_from_class(cls, panels[0].get_actor_location())
            a.set_actor_label(row["id"] + " light")
            a.tags = [u.Name(TAG), u.Name(row["id"])]
            changed = True
        for name, expected in {"LampTags": [u.Name("lamp:" + i) for i in row["lamps"]], "Panels": panels,
                               "DaylightColour": u.Vector(*row["daylight"]), "LampColour": u.Vector(*row["lamp"])}.items():
            actual = a.get_editor_property(name)
            if (list(actual) if isinstance(expected, list) else actual) != expected:
                a.set_editor_property(name, expected)
                changed = True
    for old in existing.values():
        if not actors.destroy_actor(old):
            raise RuntimeError("Could not remove a retired curtain controller")
        changed = True
    if changed and not levels.save_map(world, LEVEL):
        raise RuntimeError("Could not save the generated curtain controllers in " + LEVEL)
    u.log(f"LUNDEN_CURTAINS_OK {len(rows)} controllers in {LEVEL}, changed={changed}")


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    main()
