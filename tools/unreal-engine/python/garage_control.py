"""#2328. Build the garage's single timer and opening sensor in the generated interaction level."""

PATH = "/Game/Lunden/Generated/Interaction/BP_LundenGarageControl"
STEP = "AdvanceGarage"
VEHICLE = "SetVehicleState"
VISITOR = "VisitorInOpening"


def gate_step(g, p, door_path):
    """Build the web's update branches for a single gate and its exported timeout."""
    gate = g.get("Gate")
    g.branch(g.pure("KismetSystemLibrary:IsValid", Object=gate))
    target = g.get("TargetOpen", door_path, target=gate)
    changes = g.get("ChangeCount", door_path, target=gate)
    changed = g.op("NotEqual_IntInt", A=changes, B=g.get("LastGateChange"))
    # Two button presses can close and reopen between ticks. Opening always grants the whole 25 s.
    g.set("IdleSeconds", g.op("SelectFloat", A="0", B=g.get("IdleSeconds"), bPickA=changed))
    g.set("LastGateChange", changes)
    rotation = g.pure("Actor:K2_GetActorRotation", target=gate)
    current = g.op("Conv_RotatorToQuaternion", InRot=rotation)

    def at(name):
        # At a vertical pitch Unreal can express the same orientation with different yaw/roll values.
        wanted = g.op("Conv_RotatorToQuaternion", InRot=g.get(name, door_path, target=gate))
        delta = g.op("Quat_AngularDistance", A=current, B=wanted)
        return g.op("Less_DoubleDouble", A=delta, B="0.00001745")  # 0.001 degree

    busy = g.op("BooleanOR", A=p["VisitorInside"], B=g.get("VehicleInside"))
    # Opening or fully open: the web starts counting only when the door has reached its open stop.
    closing = g.branch(target)
    hold = g.op("BooleanOR", A=busy, B=g.get("VehicleHolds"))
    hold = g.op("BooleanOR", A=hold, B=g.get("VehicleRequestsOpen"))
    count = g.op("BooleanAND", A=at("OpenRotation"), B=g.op("Not_PreBool", A=hold))
    reset = g.branch(count)
    g.set("IdleSeconds", g.op("Add_DoubleDouble", A=g.get("IdleSeconds"), B=p["Elapsed"]))
    g.branch(g.op("GreaterEqual_DoubleDouble", A=g.get("IdleSeconds"), B=g.get("AutoSeconds")))
    g.run(door_path + ":CloseDoor", target=gate)
    g.fork(reset, 550).set("IdleSeconds", "0")

    g = g.fork(closing, 950)
    g.set("IdleSeconds", "0")
    obstructed = g.op("BooleanAND", A=busy, B=g.op("Not_PreBool", A=at("ClosedRotation")))
    g.branch(g.op("BooleanOR", A=g.get("VehicleRequestsOpen"), B=obstructed))
    g.run(door_path + ":OpenDoor", target=gate)


def controller(door_type, spec_hash):
    import unreal as u
    import player_parts as pp
    assets, bp_lib = u.EditorAssetLibrary, u.BlueprintEditorLibrary
    if assets.does_asset_exist(PATH):
        bp = assets.load_asset(PATH)
        if assets.get_metadata_tag(bp, "Lunden.SpecHash") == spec_hash:
            return bp.generated_class()
        for name in (STEP, VEHICLE, VISITOR):
            if name in map(str, bp_lib.list_graph_names(bp)):
                bp_lib.remove_function_graph(bp, name)
    else:
        factory = u.BlueprintFactory()
        factory.set_editor_property("parent_class", u.Actor)
        folder, name = PATH.rsplit("/", 1)
        bp = u.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, u.Blueprint, factory)
    pp.variables(bp, {"Gate": bp_lib.get_object_reference_type(door_type), "VehicleInside": pp.BOOL,
                      "VehicleHolds": pp.BOOL, "VehicleRequestsOpen": pp.BOOL, "AutoSeconds": pp.REAL, "LastGateChange": pp.INT,
                      "IdleSeconds": pp.REAL, "MinX": pp.REAL, "MaxX": pp.REAL, "MinY": pp.REAL, "MaxY": pp.REAL,
                      "TopZ": pp.REAL})
    for name in ("Gate", "AutoSeconds", "MinX", "MaxX", "MinY", "MaxY", "TopZ"):
        bp_lib.set_blueprint_variable_instance_editable(bp, name, True)
    # The route-following vehicle (#2357) can request opening ahead and hold while in/past the opening, independently.
    g, p = pp.function(bp, VEHICLE, [("InOpening", pp.BOOL), ("WantsDoor", pp.BOOL), ("RequestOpen", pp.BOOL)])
    for var, arg in (("VehicleInside", "InOpening"), ("VehicleHolds", "WantsDoor"), ("VehicleRequestsOpen", "RequestOpen")):
        g.set(var, p[arg])

    g, p = pp.function(bp, STEP, [("Elapsed", pp.REAL), ("VisitorInside", pp.BOOL)])
    gate_step(g, p, door_type.get_path_name())

    g, p = pp.function(bp, VISITOR, [("Feet", pp.VEC)], [("Inside", pp.BOOL)], pure=True)
    point = g.node_of("KismetMathLibrary:BreakVector", InVec=p["Feet"])
    x, y, z = (pp.out(point, axis) for axis in ("X", "Y", "Z"))

    def between(v, axis):
        return g.op("BooleanAND", A=g.op("Greater_DoubleDouble", A=v, B=g.get("Min" + axis)),
                    B=g.op("Less_DoubleDouble", A=v, B=g.get("Max" + axis)))
    inside = g.op("BooleanAND", A=between(x, "X"), B=between(y, "Y"))
    inside = g.op("BooleanAND", A=inside, B=g.op("Less_DoubleDouble", A=z, B=g.get("TopZ")))
    g.ret(Inside=inside)

    g = pp.events(bp)
    tick = pp.event(g, bp, "AddEvent|EventTick", "ReceiveTick", 0)
    delta = pp.out(tick, "DeltaSeconds")
    who = g.pure("GameplayStatics:GetPlayerCharacter", PlayerIndex="0")
    absent = g.branch(g.pure("KismetSystemLibrary:IsValid", Object=who))
    point = g.node_of("KismetMathLibrary:BreakVector", InVec=g.pure("Actor:K2_GetActorLocation", target=who))
    x, y, z = (pp.out(point, axis) for axis in ("X", "Y", "Z"))
    capsule = g.get("CapsuleComponent", "/Script/Engine.Character", target=who)
    feet = g.op("Subtract_DoubleDouble", A=z, B=g.pure("CapsuleComponent:GetScaledCapsuleHalfHeight", target=capsule))
    position = g.op("MakeVector", X=x, Y=y, Z=feet)
    inside = g.pure(bp.generated_class().get_path_name() + ":" + VISITOR, result="Inside", Feet=position)
    g.run(bp.generated_class().get_path_name() + ":" + STEP, Elapsed=delta, VisitorInside=inside)
    g.fork(absent, 700).run(bp.generated_class().get_path_name() + ":" + STEP, Elapsed=delta, VisitorInside="false")
    pp.compiled(bp)
    assets.set_metadata_tag(bp, "Lunden.SpecHash", spec_hash)
    if not assets.save_loaded_asset(bp, only_if_is_dirty=False):
        raise RuntimeError("Could not save " + PATH)
    return bp.generated_class()


def spawn(actors, cls, gate, row):
    import unreal as u
    a = actors.spawn_actor_from_class(cls, u.Vector(*row["pivot"]["unreal"]))
    a.set_actor_label("Garageportens styrning")
    a.tags = [u.Name("garage-control")]
    b = row["control"]["opening"]
    margin = b["xMargin"] + b["radius"]
    for name, val in {"Gate": gate, "AutoSeconds": row["control"]["autoSeconds"], "MinX": 100 * (b["x"] - margin),
                      "MaxX": 100 * (b["x"] + margin), "MinY": 100 * b["z0"], "MaxY": 100 * b["z1"],
                      "TopZ": 100 * b["top"]}.items():
        a.set_editor_property(name, val)
    return a
