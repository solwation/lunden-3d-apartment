"""#2284: build the production first-person player in /Game/Lunden/Player/ (succeeds the #2246 build_pilot_player.py).

    run-python.ps1 tools/unreal-engine/python/build_player.py [<measurements.json>] [--force | --check] [--extensions <file>]

Assets (one owner, #2284):
  Player/BP_LundenPlayer            Character: walk, sprint, crouch, jump, mouse look, fall damage
  Player/BP_LundenPlayerController  PlayerController (the pilot's door controller: E / left mouse use a pilot door
                                    until #2285 hooks its own door use in through player-extensions.json)
  Player/BP_LundenGameMode          GameMode: the pawn and controller above
  Player/Input/IMC_LundenPlayer, Player/Input/IA_Lunden*   Enhanced Input mapping and actions

Every number comes from the #2245 export (unreal/Lunden/Import/measurements.json `spawn.player` and `spawn.fall`, which
export-scene.js reads from src/config.js PLAYER, FALL and COMBAT.lives): the builder writes them into Blueprint variable
defaults and movement settings, and the graphs read the variables, never literal web numbers.

Steps:
1. Move the #2246 pilot assets (Blueprints/Pilot/*, Blueprints/PilotDoors/BP_LundenDoorController) to Player/ with
   their references fixed, and delete the redirectors once nothing references them.
2. Create whatever is still missing (a fresh project gets the same graphs the pilot generator made).
3. Rebuild the character's event graph and defaults from the export, and the extension components from
   tools/unreal-engine/player-extensions.json (or --extensions <file>).
A run whose inputs (export values, extension rows, this script) match the hash stored on BP_LundenPlayer saves nothing.
--force rebuilds anyway; --check verifies without saving. Ends with LUNDEN_PLAYER_OK.
Take `git lfs lock` on every Player/*.uasset (and the old pilot paths during the move) before a run that may save.
"""
import hashlib
import json
import math
from pathlib import Path
import sys

import unreal as u

REPO = Path(__file__).resolve().parents[3]
DIR = "/Game/Lunden/Player"
INPUT = DIR + "/Input"
CHARACTER = DIR + "/BP_LundenPlayer"
CONTROLLER = DIR + "/BP_LundenPlayerController"
GAME_MODE = DIR + "/BP_LundenGameMode"
MAPPING = INPUT + "/IMC_LundenPlayer"
DOOR = "/Game/Lunden/Blueprints/PilotDoors/BP_LundenSwingDoor"
SPEC_TAG = "Lunden.SpecHash"
EXTENSION_TAG = "Lunden.PlayerExtensions"

TOOLS = u.AssetToolsHelpers.get_asset_tools()
ASSETS = u.EditorAssetLibrary
BP = u.BlueprintEditorLibrary
GRAPH = u.BlueprintGraphEditor

BINDINGS = {
    "Forward": "W", "Back": "S", "Left": "A", "Right": "D",
    "LookX": "MouseX", "LookY": "MouseY", "Jump": "SpaceBar",
    "Run": "LeftShift", "Crouch": "LeftControl",
}
PILOT = "/Game/Lunden/Blueprints/Pilot"
MOVES = {  # leaves first, so each referencer is still loaded when its dependency moves
    **{f"{PILOT}/IA_Lunden{name}": f"{INPUT}/IA_Lunden{name}" for name in BINDINGS},
    PILOT + "/IMC_LundenPilot": MAPPING,
    "/Game/Lunden/Blueprints/PilotDoors/BP_LundenDoorController": CONTROLLER,
    PILOT + "/BP_LundenWalker": CHARACTER,
    PILOT + "/BP_LundenPilotMode": GAME_MODE,
}
# UE CharacterMovement walks with its capsule 1.9-2.4 cm above the floor (measured in the #2246 pilot), so the eye
# offsets subtract the mean to put the eye at the web height above the floor.
FLOOR_CLEARANCE = (1.9 + 2.4) / 2
# Blueprint variables the graph reads; their defaults are written from the export by player_values().
VARIABLES = {
    "WalkSpeed": "real", "RunSpeed": "real", "LookDegrees": "real",
    "MaxLives": "int", "Lives": "int", "Deaths": "int",
    "FallHurt": "real", "FallFatal": "real", "FallMaxReport": "real",
    "FallFromZ": "real", "LastFallDrop": "real", "LastFallDamage": "int",
}


def player_values(measurements):
    """Export values (web metres, m/s, rad) as Unreal centimetres, cm/s and degrees."""
    spawn = measurements["spawn"]
    p, f = spawn["player"], spawn["fall"]
    for key in ("eye", "crouchEye", "radius", "walk", "run", "stepUp", "headroom", "jump", "crouchSpeed", "mouseSens"):
        if p.get(key) is None:
            raise RuntimeError(f"measurements.json spawn.player.{key} is missing: re-export with this commit")
    half = 50 * p["headroom"]
    # Crouched capsule: the crouched eye plus the same headroom over the eye as standing (assumption, the web has no
    # crouched body height).
    crouched_half = 50 * (p["crouchEye"] + p["headroom"] - p["eye"])
    return {
        "radius": 100 * p["radius"], "half_height": half, "crouched_half_height": crouched_half,
        "base_eye_height": 100 * p["eye"] - half - FLOOR_CLEARANCE,
        "crouched_eye_height": 100 * p["crouchEye"] - crouched_half - FLOOR_CLEARANCE,
        "max_step_height": 100 * p["stepUp"], "jump_z_velocity": 100 * p["jump"],
        "max_walk_speed_crouched": 100 * p["walk"] * p["crouchSpeed"],
        "vars": {
            "WalkSpeed": 100 * p["walk"], "RunSpeed": 100 * p["run"], "LookDegrees": math.degrees(p["mouseSens"]),
            "MaxLives": int(f["lives"]), "Lives": int(f["lives"]), "Deaths": 0,
            "FallHurt": 100 * f["hurt"], "FallFatal": 100 * f["fatal"], "FallMaxReport": 100 * f["maxReport"],
            "FallFromZ": 0.0, "LastFallDrop": 0.0, "LastFallDamage": 0,
        },
    }


def save(asset):
    if not ASSETS.save_loaded_asset(asset, only_if_is_dirty=False):
        raise RuntimeError(f"Could not save {asset.get_path_name()} (is its .uasset locked with git lfs lock?)")


def create(path, kind, factory):
    folder, name = path.rsplit("/", 1)
    asset = TOOLS.create_asset(name, folder, kind, factory)
    if not asset:
        raise RuntimeError(f"Could not create {path}")
    return asset


def new_blueprint(path, parent):
    factory = u.BlueprintFactory()
    factory.set_editor_property("parent_class", parent)
    return create(path, u.Blueprint, factory)


def connect(src, output, dst, input_name):
    out = BP.find_output_pin(src, output)
    inp = BP.find_input_pin(dst, input_name)
    if not out.is_valid() or not inp.is_valid() or not out.try_create_connection(inp):
        pins = lambda n, f: [str(p.get_pin_name()) for p in f(n)]
        raise RuntimeError(f"Could not connect {src.get_name()}.{output} {pins(src, BP.list_output_pins)} to "
                           f"{dst.get_name()}.{input_name} {pins(dst, BP.list_input_pins)}")


def constant(node, pin, value):
    p = BP.find_input_pin(node, pin)
    if not p.is_valid() or not p.set_pin_value(str(value)):
        raise RuntimeError(f"Could not set {node.get_name()}.{pin} to {value}")


# 1. Move the pilot assets ------------------------------------------------------------------------------------------

def registry_class(path):
    """Class name of the asset or redirector in package `path`, or None (quietly; find_asset_data logs errors)."""
    found = u.AssetRegistryHelpers.get_asset_registry().get_assets_by_package_name(path)
    return str(found[0].asset_class_path.asset_name) if found else None


def listed(path):
    """True for an asset or a redirector at `path` (does_asset_exist ignores redirectors)."""
    return registry_class(path) is not None


def is_redirector(path):
    return registry_class(path) == "ObjectRedirector"


def resave(package):
    """Load and save a package that still points at a redirector, so it stores the new path."""
    if registry_class(package) == "World":
        world = u.EditorLoadingAndSavingUtils.load_map(package)
        if not world or not u.EditorLoadingAndSavingUtils.save_map(world, package):
            raise RuntimeError(f"Could not re-save {package} (is it locked with git lfs lock?)")
    else:
        asset = ASSETS.load_asset(package)
        if not asset:
            raise RuntimeError("Could not load " + package)
        save(asset)
    u.log("LUNDEN_PLAYER_RESAVED " + package)


def migrate(check_only):
    moved, left = [], []
    for old, new in MOVES.items():
        if not listed(old):
            continue
        if is_redirector(old):
            left.append(old)
            continue
        if ASSETS.does_asset_exist(new):
            raise RuntimeError(f"Both {old} and {new} exist: remove one before building")
        if check_only:
            raise RuntimeError(f"{old} has not been moved to {new}")
        if not ASSETS.rename_asset(old, new):
            raise RuntimeError(f"Could not move {old} to {new}")
        moved.append(old)
    if moved:
        # Referencing packages that the rename loaded were fixed in memory; unloaded ones keep a redirector (below).
        u.EditorLoadingAndSavingUtils.save_dirty_packages(True, True)
        u.log(f"LUNDEN_PLAYER_MOVED {json.dumps({old: MOVES[old] for old in moved})}")
    stuck = []
    for old in moved + left:
        if not listed(old):
            continue
        referencers = [r for r in ASSETS.find_package_referencers_for_asset(old, False) if r != old]
        if referencers and not check_only:
            for package in referencers:
                resave(package)
            referencers = [r for r in ASSETS.find_package_referencers_for_asset(old, False) if r != old]
        if referencers:
            stuck.append(f"{old} <- {referencers}")
        elif not check_only:
            # Nothing references it any more (EditorAssetLibrary.delete_asset would force-delete without that check).
            package = u.find_package(old)
            if package:
                u.EditorLoadingAndSavingUtils.unload_packages([package])
            target = Path(u.Paths.project_content_dir()) / (old.removeprefix("/Game/") + ".uasset")
            try:
                target.unlink()
            except PermissionError:
                if not ASSETS.delete_asset(old) or target.exists():
                    raise RuntimeError("Could not delete the redirector " + old)
            u.log("LUNDEN_PLAYER_REDIRECTOR_REMOVED " + old)
    if stuck:
        raise RuntimeError("Redirectors still referenced: " + "; ".join(stuck))
    return moved


# 2. Create missing assets ------------------------------------------------------------------------------------------

def input_assets():
    """The Enhanced Input actions and mapping, created only when missing (their contents never depend on the export)."""
    actions = {}
    for name in BINDINGS:
        path = f"{INPUT}/IA_Lunden{name}"
        if ASSETS.does_asset_exist(path):
            actions[name] = ASSETS.load_asset(path)
            continue
        action = create(path, u.InputAction, u.InputAction_Factory())
        if name.startswith("Look"):
            action.set_editor_property("value_type", u.InputActionValueType.AXIS1D)
        save(action)
        actions[name] = action
    if ASSETS.does_asset_exist(MAPPING):
        return actions, ASSETS.load_asset(MAPPING)
    mapping = create(MAPPING, u.InputMappingContext, u.InputMappingContext_Factory())
    for name, key_name in BINDINGS.items():
        key = u.Key()
        key.import_text(key_name)
        if key.export_text() != key_name:
            raise RuntimeError(f"Unreal did not recognize {key_name}")
        mapping.map_key(actions[name], key)
    save(mapping)
    return actions, mapping


def controller_asset():
    if ASSETS.does_asset_exist(CONTROLLER):
        return ASSETS.load_asset(CONTROLLER)
    if ASSETS.does_asset_exist(DOOR):
        # The pilot door use (E / left mouse) until #2285 replaces it with a player extension.
        sys.path.insert(0, str(Path(__file__).parent))
        from build_pilot_doors import controller_class
        controller_class(u.load_class(None, DOOR + ".BP_LundenSwingDoor_C"), CONTROLLER)
        return ASSETS.load_asset(CONTROLLER)
    bp = new_blueprint(CONTROLLER, u.PlayerController)
    BP.compile_blueprint(bp)
    save(bp)
    return bp


# 3. Character graph and defaults -----------------------------------------------------------------------------------

def character_graph(char, mapping):
    graph = GRAPH.get_graph_editor_by_name(char, "EventGraph")
    graph.remove_nodes(list(graph.list_all_nodes()))
    names = {str(n) for n in BP.list_member_variable_names(char)} if hasattr(BP, "list_member_variable_names") else set()
    for name, kind in VARIABLES.items():
        if name not in names and not BP.add_member_variable(char, name, BP.get_basic_type_by_name(kind)):
            if name not in {str(n) for n in BP.list_member_variable_names(char)}:
                raise RuntimeError("Could not add the variable " + name)
    BP.compile_blueprint(char)

    def call(owner_and_name, x, y):
        node = graph.add_call_function_node("/Script/" + owner_and_name)
        if not node:
            raise RuntimeError(f"Could not create {owner_and_name}")
        BP.set_node_pos(node, u.IntPoint(x, y))
        return node

    def get(name, x, y):
        node = graph.add_get_member_variable_node(name)
        BP.set_node_pos(node, u.IntPoint(x, y))
        return node

    def put(name, x, y):
        node = graph.add_set_member_variable_node(name)
        BP.set_node_pos(node, u.IntPoint(x, y))
        return node

    def event(name, x, y, function=None):
        node = graph.create_node_from_name(name, u.Vector2D(x, y), [])
        if not node and function:
            node = BP.add_event_override(char, function, u.IntPoint(x, y))
        if not node:
            raise RuntimeError("Could not create the event " + name)
        BP.set_node_pos(node, u.IntPoint(x, y))
        return node

    # Attach the mapping to this pawn's lifetime; other maps can keep their own controls.
    for row, (event_name, method) in enumerate((("BeginPlay", "AddMappingContext"), ("EndPlay", "RemoveMappingContext"))):
        y = -800 + row * 350
        start = event("AddEvent|Event" + event_name, 0, y)
        subsystem = graph.create_node_from_name("LocalPlayerSubsystems|GetEnhancedInputLocalPlayerSubsystem",
                                                u.Vector2D(180, y + 130), [])
        valid = call("Engine.KismetSystemLibrary:IsValid", 410, y + 95)
        connect(subsystem, "ReturnValue", valid, "Object")
        branch = graph.add_branch_node()
        BP.set_node_pos(branch, u.IntPoint(620, y))
        connect(valid, "ReturnValue", branch, "Condition")
        connect(start, "then", branch, "execute")
        context = call("EnhancedInput.EnhancedInputSubsystemInterface:" + method, 850, y)
        connect(branch, "then", context, "execute")
        connect(subsystem, "ReturnValue", context, "self")
        constant(context, "MappingContext", mapping.get_path_name())

    for row, name in enumerate(BINDINGS):
        y = row * 400
        action = graph.create_node_from_name("Input|EnhancedActionEvents|IA_Lunden" + name, u.Vector2D(0, y), [])
        if not action:
            raise RuntimeError(f"Missing Enhanced Input event for {name}")
        if name in ("Forward", "Back", "Left", "Right"):
            direction = "Forward" if name in ("Forward", "Back") else "Right"
            vector = call(f"Engine.Actor:GetActor{direction}Vector", 260, y + 100)
            move = call("Engine.Pawn:AddMovementInput", 560, y)
            connect(action, "Triggered", move, "execute")
            connect(vector, "ReturnValue", move, "WorldDirection")
            constant(move, "ScaleValue", -1 if name in ("Back", "Left") else 1)
        elif name in ("LookX", "LookY"):
            # Raw mouse counts (Enhanced Input does not apply the legacy axis sensitivity) times LookDegrees: MouseX
            # right turns right, MouseY up looks up, the web's PLAYER.mouseSens per pixel on both axes.
            scale = call("Engine.KismetMathLibrary:Multiply_DoubleDouble", 260, y + 100)
            connect(action, "ActionValue", scale, "A")
            connect(get("LookDegrees", 60, y + 220), "LookDegrees", scale, "B")
            look = call(f"Engine.Pawn:AddController{'Yaw' if name == 'LookX' else 'Pitch'}Input", 560, y)
            connect(action, "Triggered", look, "execute")
            connect(scale, "ReturnValue", look, "Val")
        elif name == "Run":
            for idx, (trigger, speed) in enumerate((("Started", "RunSpeed"), ("Completed", "WalkSpeed"))):
                movement = graph.add_get_member_variable_node("CharacterMovement", "/Script/Engine.Character")
                BP.set_node_pos(movement, u.IntPoint(240, y + idx * 180 + 120))
                setter = graph.add_set_member_variable_node("MaxWalkSpeed", "/Script/Engine.CharacterMovementComponent")
                BP.set_node_pos(setter, u.IntPoint(560, y + idx * 180))
                connect(movement, "CharacterMovement", setter, "self")
                connect(action, trigger, setter, "execute")
                connect(get(speed, 300, y + idx * 180 + 60), speed, setter, "MaxWalkSpeed")
        else:
            stop = "StopJumping" if name == "Jump" else "UnCrouch"
            connect(action, "Started", call("Engine.Character:" + name, 560, y), "execute")
            connect(action, "Completed", call("Engine.Character:" + stop, 560, y + 180), "execute")

    # Fall damage, src/player.js + src/falldamage.js: a fall starts where the feet leave the ground (a jump counts from
    # its take-off, a walk off a ledge from the ledge) and its drop is that height minus the landing height. Unreal only
    # falls in free drops (stairs and steps up to max_step_height stay in walking), so the web's gap under the feet is
    # at least the drop and the rule reduces to: drop > FallMaxReport -> none; > FallFatal -> MaxLives;
    # > FallHurt -> ceil(MaxLives / 2); else none. Lives drop by the damage; a death (damage >= Lives) refills them.
    y = len(BINDINGS) * 400 + 200
    changed = event("AddEvent|EventOnMovementModeChanged", 0, y, "K2_OnMovementModeChanged")
    movement = graph.add_get_member_variable_node("CharacterMovement", "/Script/Engine.Character")
    BP.set_node_pos(movement, u.IntPoint(200, y + 160))
    falling = None
    for owner in ("NavMovementComponent", "PawnMovementComponent", "MovementComponent", "CharacterMovementComponent"):
        falling = graph.add_call_function_node(f"/Script/Engine.{owner}:IsFalling")
        if falling:
            break
    if not falling:
        raise RuntimeError("Could not create IsFalling")
    BP.set_node_pos(falling, u.IntPoint(420, y + 160))
    connect(movement, "CharacterMovement", falling, "self")
    branch = graph.add_branch_node()
    BP.set_node_pos(branch, u.IntPoint(640, y))
    connect(changed, "then", branch, "execute")
    connect(falling, "ReturnValue", branch, "Condition")
    where = call("Engine.Actor:K2_GetActorLocation", 640, y + 220)
    split = call("Engine.KismetMathLibrary:BreakVector", 860, y + 220)
    connect(where, "ReturnValue", split, "InVec")
    setter = put("FallFromZ", 1100, y)
    connect(branch, "then", setter, "execute")
    connect(split, "Z", setter, "FallFromZ")

    y += 600
    landed = event("AddEvent|EventOnLanded", 0, y, "OnLanded")
    where = call("Engine.Actor:K2_GetActorLocation", 200, y + 200)
    split = call("Engine.KismetMathLibrary:BreakVector", 420, y + 200)
    connect(where, "ReturnValue", split, "InVec")
    drop = call("Engine.KismetMathLibrary:Subtract_DoubleDouble", 640, y + 160)
    connect(get("FallFromZ", 420, y + 100), "FallFromZ", drop, "A")
    connect(split, "Z", drop, "B")

    def compare(function, a, b_var, x, yy):
        node = call("Engine.KismetMathLibrary:" + function, x, yy)
        connect(a, "ReturnValue", node, "A")
        connect(get(b_var, x - 220, yy + 80), b_var, node, "B")
        return node

    hurt = compare("Greater_DoubleDouble", drop, "FallHurt", 900, y + 300)
    fatal = compare("Greater_DoubleDouble", drop, "FallFatal", 900, y + 450)
    reported = compare("LessEqual_DoubleDouble", drop, "FallMaxReport", 900, y + 600)
    plus = call("Engine.KismetMathLibrary:Add_IntInt", 900, y + 750)
    connect(get("MaxLives", 700, y + 750), "MaxLives", plus, "A")
    constant(plus, "B", 1)
    half = call("Engine.KismetMathLibrary:Divide_IntInt", 1100, y + 750)  # ceil(n / 2) for whole lives
    connect(plus, "ReturnValue", half, "A")
    constant(half, "B", 2)

    def select(a, a_pin, b, b_pin, pick, x, yy):
        node = call("Engine.KismetMathLibrary:SelectInt", x, yy)
        if a is None:
            constant(node, "A", a_pin)
        else:
            connect(a, a_pin, node, "A")
        if b is None:
            constant(node, "B", b_pin)
        else:
            connect(b, b_pin, node, "B")
        connect(pick, "ReturnValue", node, "bPickA")
        return node

    hurt_damage = select(half, "ReturnValue", None, 0, hurt, 1350, y + 350)
    fatal_damage = select(get("MaxLives", 1150, y + 500), "MaxLives", hurt_damage, "ReturnValue", fatal, 1600, y + 400)
    damage = select(fatal_damage, "ReturnValue", None, 0, reported, 1850, y + 450)

    lives = get("Lives", 1850, y + 650)
    harmed = call("Engine.KismetMathLibrary:Greater_IntInt", 2100, y + 600)
    connect(damage, "ReturnValue", harmed, "A")
    constant(harmed, "B", 0)
    lethal = call("Engine.KismetMathLibrary:LessEqual_IntInt", 2100, y + 750)
    connect(lives, "Lives", lethal, "A")
    connect(damage, "ReturnValue", lethal, "B")
    dead = call("Engine.KismetMathLibrary:BooleanAND", 2350, y + 650)
    connect(harmed, "ReturnValue", dead, "A")
    connect(lethal, "ReturnValue", dead, "B")
    left = call("Engine.KismetMathLibrary:Subtract_IntInt", 2350, y + 850)
    connect(lives, "Lives", left, "A")
    connect(damage, "ReturnValue", left, "B")
    floor = call("Engine.KismetMathLibrary:Max", 2550, y + 850)
    connect(left, "ReturnValue", floor, "A")
    constant(floor, "B", 0)
    new_lives = select(get("MaxLives", 2550, y + 700), "MaxLives", floor, "ReturnValue", dead, 2800, y + 700)
    death = select(None, 1, None, 0, dead, 2800, y + 900)
    deaths = call("Engine.KismetMathLibrary:Add_IntInt", 3050, y + 900)
    connect(get("Deaths", 2850, y + 1050), "Deaths", deaths, "A")
    connect(death, "ReturnValue", deaths, "B")

    chain = [("LastFallDrop", drop), ("LastFallDamage", damage), ("Deaths", deaths), ("Lives", new_lives)]
    previous, pin = landed, "then"
    for index, (name, value) in enumerate(chain):
        setter = put(name, 2400 + index * 300, y)
        connect(previous, pin, setter, "execute")
        connect(value, "ReturnValue", setter, name)
        previous = setter

    BP.compile_blueprint(char)
    broken = graph.list_nodes_with_errors()
    if broken:
        raise RuntimeError("BP_LundenPlayer failed to compile: " + ", ".join(n.get_name() for n in broken))


def character_defaults(char, values):
    default = u.get_default_object(char.generated_class())
    default.capsule_component.set_capsule_size(values["radius"], values["half_height"])
    default.set_editor_property("base_eye_height", values["base_eye_height"])
    default.set_editor_property("crouched_eye_height", values["crouched_eye_height"])
    default.set_editor_property("use_controller_rotation_yaw", True)
    movement = default.character_movement
    movement.set_editor_properties({
        "max_walk_speed": values["vars"]["WalkSpeed"], "max_walk_speed_crouched": values["max_walk_speed_crouched"],
        "max_step_height": values["max_step_height"], "jump_z_velocity": values["jump_z_velocity"],
        "crouched_half_height": values["crouched_half_height"],
        # Floor checks with a flat base: the round capsule bottom would otherwise sink up to its radius down a ledge
        # before it falls, so the fall would start (and its drop be measured) up to 22 cm low. The web's player is a
        # point over the ground (src/player.js), which never balances on an edge either.
        "use_flat_base_for_floor_checks": True})
    nav = movement.get_editor_property("nav_agent_props")
    nav.set_editor_property("can_crouch", True)
    movement.set_editor_property("nav_agent_props", nav)
    for name, value in values["vars"].items():
        default.set_editor_property(name, value)


def extensions(bp, target, rows):
    """Add the rows' components to `bp`; remove components an earlier run added whose row is gone."""
    subsystem = u.get_engine_subsystem(u.SubobjectDataSubsystem)
    handles = subsystem.k2_gather_subobject_data_for_blueprint(bp)
    lib = u.SubobjectDataBlueprintFunctionLibrary
    by_name = {}
    for handle in handles:
        data = subsystem.k2_find_subobject_data_from_handle(handle)
        if data is not None:
            by_name[str(lib.get_variable_name(data))] = handle
    previous = json.loads(ASSETS.get_metadata_tag(bp, EXTENSION_TAG) or "[]")
    wanted = [r for r in rows if r["target"] == target]
    for name in previous:
        if name in by_name and name not in {r["name"] for r in wanted}:
            subsystem.delete_subobject(handles[0], by_name[name], bp)
            u.log(f"LUNDEN_PLAYER_EXTENSION removed {target}.{name}")
    added = []
    for row in wanted:
        cls = u.load_class(None, row["class"])
        if not cls:
            raise RuntimeError(f"player-extensions.json: cannot load {row['class']} ({row['owner']})")
        if row["name"] not in by_name:
            params = u.AddNewSubobjectParams(parent_handle=handles[0], new_class=cls, blueprint_context=bp)
            handle, reason = subsystem.add_new_subobject(params)
            if not lib.is_handle_valid(handle):
                raise RuntimeError(f"Could not add {row['name']} to {target}: {reason}")
            if not subsystem.rename_subobject(handle, u.Text(row["name"])):
                raise RuntimeError(f"Could not name the {target} component {row['name']}")
            u.log(f"LUNDEN_PLAYER_EXTENSION added {target}.{row['name']} ({row['class']}, {row['owner']})")
        added.append(row["name"])
    ASSETS.set_metadata_tag(bp, EXTENSION_TAG, json.dumps(added))
    BP.compile_blueprint(bp)


def load_rows(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("formatVersion") != 1:
        raise RuntimeError(f"{path}: formatVersion {data.get('formatVersion')} is not 1")
    seen = set()
    for row in data["components"]:
        missing = {"target", "name", "class", "owner", "what"} - row.keys()
        if missing or row["target"] not in ("character", "controller"):
            raise RuntimeError(f"{path}: bad row {row} (missing {sorted(missing)}; target is character or controller)")
        if (row["target"], row["name"]) in seen:
            raise RuntimeError(f"{path}: {row['target']}.{row['name']} is listed twice")
        seen.add((row["target"], row["name"]))
    return data["components"]


def check_input_settings():
    """#2294: with the legacy input scales on, APlayerController multiplies yaw by 2.5 and pitch by -2.5 (BaseGame.ini
    InputYawScale / InputPitchScale), so the mouse looked down when moved up and turned 2.5 times faster than the web.
    The look graph alone scales the raw mouse counts by LookDegrees, as src/main.js does with PLAYER.mouseSens.
    The template's mouse axis sensitivity (0.07 in DefaultInput.ini AxisConfig) also reached the look actions and made
    it 14 times slower, so MouseX and MouseY keep sensitivity 1: one mouse count is one web pixel."""
    settings = u.InputSettings.get_input_settings()
    if settings.get_editor_property("enable_legacy_input_scales"):
        raise RuntimeError("unreal/Lunden/Config/DefaultInput.ini must set bEnableLegacyInputScales=False (#2294)")
    axes = {str(c.get_editor_property("axis_key_name")): c.get_editor_property("axis_properties")
            for c in settings.get_editor_property("axis_config")}
    for key in ("MouseX", "MouseY"):
        props = axes.get(key)
        if props is None or abs(props.get_editor_property("sensitivity") - 1.0) > 1e-6 or props.get_editor_property("invert"):
            raise RuntimeError(f"DefaultInput.ini AxisConfig {key} must have Sensitivity=1 and bInvert=False (#2294)")


def check_defaults(values):
    check_input_settings()
    cls = u.load_class(None, CHARACTER + ".BP_LundenPlayer_C")
    default = u.get_default_object(cls)
    got = {name: default.get_editor_property(name) for name in values["vars"]}
    got["base_eye_height"] = default.base_eye_height
    got["jump_z_velocity"] = default.character_movement.jump_z_velocity
    want = {**values["vars"], "base_eye_height": values["base_eye_height"], "jump_z_velocity": values["jump_z_velocity"]}
    wrong = {k: (got[k], want[k]) for k in want if abs(float(got[k]) - float(want[k])) > 0.01}
    if wrong:
        raise RuntimeError(f"BP_LundenPlayer defaults differ from the export: {wrong}")
    mode = u.get_default_object(u.load_class(None, GAME_MODE + ".BP_LundenGameMode_C"))
    if (mode.get_editor_property("default_pawn_class") != cls or mode.get_editor_property("player_controller_class")
            != u.load_class(None, CONTROLLER + ".BP_LundenPlayerController_C")):
        raise RuntimeError("BP_LundenGameMode does not use BP_LundenPlayer and BP_LundenPlayerController")


def main(argv):
    flags = {a for a in argv if a.startswith("--")}
    args = [a for a in argv if not a.startswith("--")]
    ext_file = REPO / "tools/unreal-engine/player-extensions.json"
    if "--extensions" in argv:
        ext_file = Path(argv[argv.index("--extensions") + 1])
        args.remove(str(argv[argv.index("--extensions") + 1]))
    measurements_file = Path(args[0]) if args else REPO / "unreal/Lunden/Import/measurements.json"
    measurements = json.loads(measurements_file.read_text(encoding="utf-8"))
    values = player_values(measurements)
    rows = load_rows(ext_file)
    check_only = "--check" in flags
    spec = hashlib.sha256(json.dumps({"values": values, "rows": rows, "script": Path(__file__).read_text(encoding="utf-8")},
                                     sort_keys=True).encode()).hexdigest()

    migrate(check_only)
    present = all(ASSETS.does_asset_exist(p) for p in (CHARACTER, CONTROLLER, GAME_MODE, MAPPING))
    char = ASSETS.load_asset(CHARACTER) if present else None
    stored = ASSETS.get_metadata_tag(char, SPEC_TAG) if char else ""
    if check_only:
        if not present or stored != spec:
            raise RuntimeError(f"/Game/Lunden/Player is not built from these inputs (stored {stored[:16]}, want {spec[:16]})")
        check_defaults(values)
        u.log(f"LUNDEN_PLAYER {DIR}: check passed, spec {spec[:16]}")
        u.log("LUNDEN_PLAYER_OK")
        return
    if present and stored == spec and "--force" not in flags:
        check_defaults(values)
        u.log(f"LUNDEN_PLAYER {DIR}: unchanged, nothing saved; spec {spec[:16]}")
        u.log("LUNDEN_PLAYER_OK")
        return

    _, mapping = input_assets()
    controller = controller_asset()
    char = ASSETS.load_asset(CHARACTER) if ASSETS.does_asset_exist(CHARACTER) else new_blueprint(CHARACTER, u.Character)
    character_graph(char, mapping)
    character_defaults(char, values)
    extensions(char, "character", rows)
    extensions(controller, "controller", rows)
    save(controller)
    mode = ASSETS.load_asset(GAME_MODE) if ASSETS.does_asset_exist(GAME_MODE) else new_blueprint(GAME_MODE, u.GameModeBase)
    BP.compile_blueprint(mode)
    mode_default = u.get_default_object(mode.generated_class())
    mode_default.set_editor_property("default_pawn_class", char.generated_class())
    mode_default.set_editor_property("player_controller_class", controller.generated_class())
    save(mode)
    ASSETS.set_metadata_tag(char, SPEC_TAG, spec)
    save(char)
    check_defaults(values)
    u.log(f"LUNDEN_PLAYER {DIR}: saved; spec {spec[:16]}; {len(rows)} extension rows; values "
          + json.dumps({k: round(v, 3) if isinstance(v, float) else v for k, v in values.items() if k != "vars"}))
    u.log("LUNDEN_PLAYER_OK")


main(sys.argv[1:])
