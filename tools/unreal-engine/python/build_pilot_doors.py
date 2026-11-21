"""Build the content-only pilot's playable door Blueprints and derived L1007 sublevel using the stock editor."""
import json
import math
from pathlib import Path
import sys
import unreal as u

ASSETS = u.EditorAssetLibrary
BP = u.BlueprintEditorLibrary
GRAPH = u.BlueprintGraphEditor
DIR = "/Game/Lunden/Blueprints/PilotDoors"
SOURCE = "/Game/Lunden/Generated/l1007/Level_l1007"
TARGET = "/Game/Lunden/Generated/PilotDoors/Level_l1007_doors"


def blueprint(path, parent):
    if ASSETS.does_asset_exist(path):
        return ASSETS.load_asset(path), False
    factory = u.BlueprintFactory()
    factory.set_editor_property("parent_class", parent)
    folder, name = path.rsplit("/", 1)
    return u.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, u.Blueprint, factory), True


def connect(src, output, dst, name):
    a, b = BP.find_output_pin(src, output), BP.find_input_pin(dst, name)
    if not a.is_valid() or not b.is_valid() or not a.try_create_connection(b):
        raise RuntimeError(f"Cannot connect {src.get_name()}.{output} to {dst.get_name()}.{name}")


def value(node, name, text):
    p = BP.find_input_pin(node, name)
    if not p.is_valid() or not p.set_pin_value(str(text)):
        raise RuntimeError(f"Cannot set {node.get_name()}.{name} to {text}")


def pos(node, x, y):
    if not node:
        raise RuntimeError(f"Could not create graph node at {x},{y}")
    BP.set_node_pos(node, u.IntPoint(x, y))
    return node


def call(graph, path, x, y):
    return pos(graph.add_call_function_node(path if path.startswith("/") else "/Script/Engine." + path), x, y)


def compile_save(bp, graph):
    BP.compile_blueprint(bp)
    if graph.list_nodes_with_errors() or not ASSETS.save_loaded_asset(bp, only_if_is_dirty=False):
        raise RuntimeError("Failed to compile/save " + bp.get_name())


def door_class():
    door, fresh = blueprint(DIR + "/BP_LundenSwingDoor", u.Actor)
    if not fresh:
        return door.generated_class()
    graph = GRAPH.get_graph_editor_by_name(door, "EventGraph")
    for name, typ in [("OpenRotation", BP.get_struct_type(u.Rotator.static_struct())),
                      ("ClosedRotation", BP.get_struct_type(u.Rotator.static_struct())),
                      ("TargetOpen", BP.get_basic_type_by_name("bool"))]:
        if not BP.add_member_variable(door, name, typ):
            raise RuntimeError("Could not create " + name)
        BP.set_blueprint_variable_instance_editable(door, name, True)
    BP.compile_blueprint(door)
    toggle = pos(graph.add_custom_event_node("ToggleDoor"), 0, 0)
    read = pos(graph.add_get_member_variable_node("TargetOpen"), 0, 180)
    flip = call(graph, "KismetMathLibrary:Not_PreBool", 225, 180)
    connect(read, "TargetOpen", flip, "A")
    write = pos(graph.add_set_member_variable_node("TargetOpen"), 450, 0)
    connect(toggle, "then", write, "execute")
    connect(flip, "ReturnValue", write, "TargetOpen")
    pick = call(graph, "KismetMathLibrary:SelectRotator", 740, 250)
    for index, (name, pin) in enumerate((("OpenRotation", "A"), ("ClosedRotation", "B"), ("TargetOpen", "bPickA"))):
        read = pos(graph.add_get_member_variable_node(name), 450, 250 + index * 90)
        connect(read, name, pick, pin)
    root = call(graph, "Actor:K2_GetRootComponent", 740, 480)
    location = call(graph, "Actor:K2_GetActorLocation", 740, 590)
    move = call(graph, "KismetSystemLibrary:MoveComponentTo", 1030, 0)
    connect(write, "then", move, "Move")
    connect(root, "ReturnValue", move, "Component")
    connect(location, "ReturnValue", move, "TargetRelativeLocation")
    connect(pick, "ReturnValue", move, "TargetRelativeRotation")
    value(move, "OverTime", 1 / 1.8)  # src/doors.js SPEED * 0.6
    for name in ("bEaseIn", "bEaseOut", "bForceShortestRotationPath"):
        value(move, name, "true")
    compile_save(door, graph)
    return door.generated_class()


def controller_class(door, path):
    """The door use (E / left mouse) on a PlayerController. Since #2284 the controller is the production
    /Game/Lunden/Player/BP_LundenPlayerController, which build_player.py creates through this function."""
    bp, fresh = blueprint(path, u.PlayerController)
    if not fresh:
        return bp.generated_class()
    BP.add_function_graph(bp, "UseDoor")
    graph = GRAPH.get_graph_editor_by_name(bp, "UseDoor")
    trace = call(graph, "KismetSystemLibrary:LineTraceSingle", 850, 0)
    if not graph.find_graph_entry_pin().try_create_connection(BP.find_input_pin(trace, "execute")):
        raise RuntimeError("Could not wire UseDoor")
    camera = pos(graph.add_get_member_variable_node("PlayerCameraManager", "/Script/Engine.PlayerController"), 0, 260)
    eye = call(graph, "PlayerCameraManager:GetCameraLocation", 240, 185)
    aim = call(graph, "PlayerCameraManager:GetCameraRotation", 240, 370)
    for n in (eye, aim):
        connect(camera, "PlayerCameraManager", n, "self")
    view = call(graph, "KismetMathLibrary:MakeTransform", 485, 350)
    connect(eye, "ReturnValue", view, "Location")
    connect(aim, "ReturnValue", view, "Rotation")
    end = call(graph, "KismetMathLibrary:TransformLocation", 665, 270)
    connect(view, "ReturnValue", end, "T")
    value(end, "Location", "(X=220.0,Y=0.0,Z=0.0)")  # 2.2 metres, src/main.js
    connect(eye, "ReturnValue", trace, "Start")
    connect(end, "ReturnValue", trace, "End")
    pawn = call(graph, "Controller:K2_GetPawn", 260, 580)
    ignore = graph.create_node_from_name("Utilities|Array|MakeArray", u.Vector2D(535, 565), [])
    connect(ignore, "Array", trace, "ActorsToIgnore")
    connect(pawn, "ReturnValue", ignore, "[0]")
    hit = call(graph, "GameplayStatics:BreakHitResult", 1090, 250)
    connect(trace, "OutHit", hit, "Hit")
    blocked = pos(graph.add_branch_node(), 1090, 0)
    connect(trace, "then", blocked, "execute")
    connect(trace, "ReturnValue", blocked, "Condition")
    # The movable blocking box is parented directly to the Blueprint hinge.
    owner = call(graph, "Actor:GetAttachParentActor", 1350, 270)
    connect(hit, "HitActor", owner, "self")
    cast = graph.create_node_from_name("Utilities|Casting|CastToActor", u.Vector2D(1580, 0), [])
    if not cast or not graph.retarget_node_class(cast, u.Actor, door):
        raise RuntimeError("Could not configure the pilot door cast")
    connect(blocked, "then", cast, "execute")
    connect(owner, "ReturnValue", cast, "Object")
    toggle = call(graph, door.get_path_name() + ":ToggleDoor", 1860, 0)
    connect(cast, "then", toggle, "execute")
    result, = [str(pin.get_pin_name()) for pin in BP.list_output_pins(cast) if str(pin.get_pin_name()).startswith("As")]
    connect(cast, result, toggle, "self")
    BP.compile_blueprint(bp)
    events = GRAPH.get_graph_editor_by_name(bp, "EventGraph")
    for row, key in enumerate(("Input|KeyboardEvents|E", "Input|MouseEvents|LeftMouseButton")):
        pressed = events.create_node_from_name(key, u.Vector2D(0, row * 220), [])
        use = call(events, bp.generated_class().get_path_name() + ":UseDoor", 310, row * 220)
        connect(pressed, "Pressed", use, "execute")
    compile_save(bp, graph)
    if events.list_nodes_with_errors():
        raise RuntimeError("Controller input failed to compile")
    return bp.generated_class()


def yaw(degrees):
    return u.Rotator(roll=0, pitch=0, yaw=degrees)


def near(a, b):
    return abs((a - b + 180) % 360 - 180) < 0.1


def attach(actor, hinge):
    keep = u.AttachmentRule.KEEP_WORLD
    actor.attach_to_actor(hinge, "", keep, keep, keep, False)
    if actor.get_attach_parent_actor() != hinge:
        raise RuntimeError("Failed to attach " + actor.get_actor_label() + " to its hinge")


def build_level(door, measurements):
    data = json.loads(Path(measurements).read_text(encoding="utf8"))
    entries = [d for d in data["doors"] if d["zone"] == "l1007" and d["kind"] == "swing"]
    if not any(d["id"] == "door_l0_x80_z0" for d in entries):
        raise RuntimeError("Missing L1007 entrance")
    levels = u.EditorLoadingAndSavingUtils
    world = levels.load_map(SOURCE)
    if not world or not levels.save_map(world, TARGET):
        raise RuntimeError("Could not create the pilot copy of " + SOURCE)
    world = levels.load_map(TARGET)
    actors = u.get_editor_subsystem(u.EditorActorSubsystem)
    by_id = {str(a.tags[0]): a for a in actors.get_all_level_actors() if a.tags}
    for entry in entries:
        leaf = by_id[entry["id"]]
        xyz = entry["hinge"]["unreal"]
        pivot = u.Vector(*xyz)
        placed = leaf.get_actor_location()
        if math.dist((placed.x, placed.y, placed.z), xyz) > 1.0:
            raise RuntimeError("Imported hinge differs from source: " + entry["id"])
        # The imported leaf's local +Y points from the hinge to the latch.
        heading = leaf.get_actor_rotation().yaw + 90
        closed, opened = entry["closed"]["unrealYaw"], entry["open"]["unrealYaw"]
        if not (near(heading, closed) or near(heading, opened)):
            raise RuntimeError(f"Unexpected initial pose {entry['id']}: {heading}")
        hinge = actors.spawn_actor_from_class(door, pivot, yaw(heading))
        hinge.set_actor_label(entry["id"] + " hinge")
        hinge.tags = [u.Name("pilot-door:" + entry["id"])]
        hinge.root_component.set_mobility(u.ComponentMobility.MOVABLE)
        hinge.set_editor_property("OpenRotation", yaw(opened))
        hinge.set_editor_property("ClosedRotation", yaw(closed))
        hinge.set_editor_property("TargetOpen", near(heading, opened))
        # Keep the original imported panels, glass and fittings. The strike stays on the jamb.
        parts = [leaf] + list(leaf.get_attached_actors(recursively_include_attached_actors=True))
        for part in parts:
            for comp in part.get_components_by_class(u.SceneComponent):
                comp.set_mobility(u.ComponentMobility.MOVABLE)
                if isinstance(comp, u.PrimitiveComponent):
                    comp.set_collision_enabled(u.CollisionEnabled.NO_COLLISION)
        attach(leaf, hinge)
        width, height = 100 * entry["width"], 100 * entry["height"]
        radians = math.radians(heading)
        centre = u.Vector(xyz[0] + width * math.cos(radians) / 2, xyz[1] + width * math.sin(radians) / 2, xyz[2] + height / 2)
        box = actors.spawn_actor_from_class(u.TriggerBox, centre, yaw(heading))
        box.set_actor_label(entry["id"] + " collision")
        box.tags = [u.Name("pilot-door-leaf:" + entry["id"])]
        comp = box.get_component_by_class(u.BoxComponent)
        comp.set_mobility(u.ComponentMobility.MOVABLE)
        comp.set_box_extent(u.Vector(width / 2, 2.5, height / 2))
        comp.set_collision_profile_name("BlockAllDynamic")
        comp.set_editor_property("generate_overlap_events", False)
        attach(box, hinge)
    if not levels.save_map(world, TARGET):
        raise RuntimeError("Could not save the playable door sublevel")
    u.log(f"LUNDEN_PILOT_DOORS_OK {len(entries)} hinges in {TARGET}")


if __name__ == "__main__":
    # The door controller moved to /Game/Lunden/Player/BP_LundenPlayerController (#2284); build_player.py builds it.
    build_level(door_class(), sys.argv[1])
