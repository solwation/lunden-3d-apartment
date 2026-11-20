"""Generate the Lunden first-person Character, GameMode and Enhanced Input assets in Unreal 5.8."""
import math
import sys
import unreal as u

DIR = "/Game/Lunden/Blueprints/Pilot"
BP_NAME = "BP_LundenWalker"
TOOLS = u.AssetToolsHelpers.get_asset_tools()
ASSETS = u.EditorAssetLibrary
BP = u.BlueprintEditorLibrary

# src/config.js PLAYER: web metres become Unreal centimetres.
WALK = 160.0
RUN = 320.0
# UE CharacterMovement walks with its capsule 1.9–2.4 cm above the floor.
FLOOR_CLEARANCE = (1.9 + 2.4) / 2
EYE = 162.0
CROUCHED_EYE = 95.0
LOOK_DEGREES = math.degrees(0.0013)
BINDINGS = {
    "Forward": "W", "Back": "S", "Left": "A", "Right": "D",
    "LookX": "MouseX", "LookY": "MouseY", "Jump": "SpaceBar",
    "Run": "LeftShift", "Crouch": "LeftControl",
}


def create(name, kind, factory):
    asset = TOOLS.create_asset(name, DIR, kind, factory)
    if not asset:
        raise RuntimeError(f"Could not create {DIR}/{name}")
    return asset


def save(asset):
    if not ASSETS.save_loaded_asset(asset, only_if_is_dirty=False):
        raise RuntimeError(f"Could not save {asset.get_path_name()}")


def new_blueprint(name, parent):
    factory = u.BlueprintFactory()
    factory.set_editor_property("parent_class", parent)
    return create(name, u.Blueprint, factory)


def connect(src, output, dst, input_name):
    out = BP.find_output_pin(src, output)
    inp = BP.find_input_pin(dst, input_name)
    if not out.is_valid() or not inp.is_valid() or not out.try_create_connection(inp):
        raise RuntimeError(f"Could not connect {src.get_name()}.{output} to {dst.get_name()}.{input_name}")


def constant(node, pin, value):
    p = BP.find_input_pin(node, pin)
    if not p.is_valid() or not p.set_pin_value(str(value)):
        raise RuntimeError(f"Could not set {node.get_name()}.{pin} to {value}")


def build():
    mapping = create("IMC_LundenPilot", u.InputMappingContext, u.InputMappingContext_Factory())
    for name, key_name in BINDINGS.items():
        action = create("IA_Lunden" + name, u.InputAction, u.InputAction_Factory())
        if name.startswith("Look"):
            action.set_editor_property("value_type", u.InputActionValueType.AXIS1D)
        key = u.Key()
        key.import_text(key_name)
        if key.export_text() != key_name:
            raise RuntimeError(f"Unreal did not recognize {key_name}")
        mapping.map_key(action, key)
        save(action)
    save(mapping)
    char = new_blueprint(BP_NAME, u.Character)
    graph = u.BlueprintGraphEditor.get_graph_editor_by_name(char, "EventGraph")

    def call(owner_and_name, x, y):
        node = graph.add_call_function_node("/Script/" + owner_and_name)
        if not node:
            raise RuntimeError(f"Could not create {owner_and_name}")
        BP.set_node_pos(node, u.IntPoint(x, y))
        return node

    # Attach the mapping to this pawn's lifetime; other maps can keep their own controls.
    for row, (event_name, method) in enumerate((("ReceiveBeginPlay", "AddMappingContext"),
                                                ("ReceiveEndPlay", "RemoveMappingContext"))):
        y = -800 + row * 350
        event = graph.find_event_node(event_name)
        if not event:
            menu = "AddEvent|Event" + event_name.removeprefix("Receive")
            event = graph.create_node_from_name(menu, u.Vector2D(0, y), [])
        BP.set_node_pos(event, u.IntPoint(0, y))
        subsystem = graph.create_node_from_name("LocalPlayerSubsystems|GetEnhancedInputLocalPlayerSubsystem",
                                                u.Vector2D(180, y + 130), [])
        valid = call("Engine.KismetSystemLibrary:IsValid", 410, y + 95)
        connect(subsystem, "ReturnValue", valid, "Object")
        branch = graph.add_branch_node()
        BP.set_node_pos(branch, u.IntPoint(620, y))
        connect(valid, "ReturnValue", branch, "Condition")
        connect(event, "then", branch, "execute")
        context = call("EnhancedInput.EnhancedInputSubsystemInterface:" + method, 850, y)
        connect(branch, "then", context, "execute")
        connect(subsystem, "ReturnValue", context, "self")
        constant(context, "MappingContext", mapping.get_path_name())

    for row, name in enumerate(BINDINGS):
        y = row * 400
        event = graph.create_node_from_name("Input|EnhancedActionEvents|IA_Lunden" + name, u.Vector2D(0, y), [])
        if not event:
            raise RuntimeError(f"Missing Enhanced Input event for {name}")
        if name in ("Forward", "Back", "Left", "Right"):
            direction = "Forward" if name in ("Forward", "Back") else "Right"
            vector = call(f"Engine.Actor:GetActor{direction}Vector", 260, y + 100)
            move = call("Engine.Pawn:AddMovementInput", 560, y)
            connect(event, "Triggered", move, "execute")
            connect(vector, "ReturnValue", move, "WorldDirection")
            constant(move, "ScaleValue", -1 if name in ("Back", "Left") else 1)
        elif name in ("LookX", "LookY"):
            scale = call("Engine.KismetMathLibrary:Multiply_DoubleDouble", 260, y + 100)
            connect(event, "ActionValue", scale, "A")
            constant(scale, "B", LOOK_DEGREES)
            axis = "Yaw" if name == "LookX" else "Pitch"
            look = call(f"Engine.Pawn:AddController{axis}Input", 560, y)
            connect(event, "Triggered", look, "execute")
            connect(scale, "ReturnValue", look, "Val")
        elif name == "Run":
            movement = graph.add_get_member_variable_node("CharacterMovement", "/Script/Engine.Character")
            BP.set_node_pos(movement, u.IntPoint(240, y + 120))
            for idx, (trigger, speed) in enumerate((("Started", RUN), ("Completed", WALK))):
                setter = graph.add_set_member_variable_node("MaxWalkSpeed", "/Script/Engine.CharacterMovementComponent")
                BP.set_node_pos(setter, u.IntPoint(560, y + idx * 180))
                connect(movement, "CharacterMovement", setter, "self")
                connect(event, trigger, setter, "execute")
                constant(setter, "MaxWalkSpeed", speed)
        else:
            stop = "StopJumping" if name == "Jump" else "UnCrouch"
            connect(event, "Started", call("Engine.Character:" + name, 560, y), "execute")
            connect(event, "Completed", call("Engine.Character:" + stop, 560, y + 180), "execute")
    BP.compile_blueprint(char)
    if graph.list_nodes_with_errors():
        raise RuntimeError("LundenWalker Blueprint failed to compile")
    default = u.get_default_object(char.generated_class())
    capsule = default.capsule_component
    capsule.set_capsule_size(22.0, 92.5)
    default.set_editor_property("base_eye_height", EYE - 92.5 - FLOOR_CLEARANCE)
    default.set_editor_property("crouched_eye_height", CROUCHED_EYE - 55.0 - FLOOR_CLEARANCE)
    default.set_editor_property("use_controller_rotation_yaw", True)
    movement = default.character_movement
    movement.set_editor_properties({"max_walk_speed": WALK, "max_walk_speed_crouched": 80.0,
                                   "max_step_height": 45.0, "jump_z_velocity": 370.0,
                                   "crouched_half_height": 55.0})
    nav = movement.get_editor_property("nav_agent_props")
    nav.set_editor_property("can_crouch", True)
    movement.set_editor_property("nav_agent_props", nav)
    save(char)
    mode = new_blueprint("BP_LundenPilotMode", u.GameModeBase)
    BP.compile_blueprint(mode)
    u.get_default_object(mode.generated_class()).set_editor_property("default_pawn_class", char.generated_class())
    save(mode)
    u.log("LUNDEN_PILOT_PLAYER_OK")


if "--link-door-controller" in sys.argv:
    mode = ASSETS.load_asset(f"{DIR}/BP_LundenPilotMode")
    controller = u.load_class(None, "/Game/Lunden/Blueprints/PilotDoors/BP_LundenDoorController.BP_LundenDoorController_C")
    if not mode or not controller:
        raise RuntimeError("Generate the pilot GameMode and door PlayerController before linking them.")
    u.get_default_object(mode.generated_class()).set_editor_property("player_controller_class", controller)
    save(mode)
    u.log("LUNDEN_PILOT_DOOR_CONTROLLER_LINKED")
else:
    if ASSETS.does_directory_exist(DIR) and ASSETS.list_assets(DIR):
        raise RuntimeError(f"{DIR} already contains assets. Generate in a clean scratch project.")
    build()
