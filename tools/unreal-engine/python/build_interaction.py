"""#2285: make L1007's doors, windows, light switches and taps usable (successor of build_pilot_doors.py).

    run-python.ps1 tools/unreal-engine/python/build_interaction.py [<measurements.json>]

1. Rebuilds the graph of /Game/Lunden/Blueprints/PilotDoors/BP_LundenSwingDoor as the general interactable. The class
   stays where the pilot put it because BP_LundenPlayerController's use (E / left mouse: trace 2.2 m, take the hit
   actor's attach parent, cast to BP_LundenSwingDoor, call ToggleDoor) casts to it; every door, sash, switch and tap is
   an instance, so the controller needs no change. Instance values (set by step 2 from measurements.json):
     Id (export id), Kind (0 door or window: move the root between Closed/Open Location/Rotation in Seconds;
     1 switch: TurnOn/TurnOff #2283's BP_LundenLamp actors tagged lamp:<id> for every name in LampTags;
     2 tap: show/hide the Water actor), TargetOpen (the state), PartnerTags (wardrobe: opening this closes the partner,
     src/doors.js wardrobeDoors), ChangeCount (+1 exactly once per change of state; a request for the state it is
     already in changes nothing).
   Events: OpenDoor, CloseDoor, ToggleDoor (all set Wanted, then Apply). Open by id without a player (#2292/#2293):
   Get All Actors With Tag "interact:<id>" and call OpenDoor / CloseDoor / ToggleDoor.
2. Builds /Game/Lunden/Generated/Interaction/Level_l1007_interaction: a copy of the importer's Level_l1007 (as the
   pilot's door builder did) where each door leaf and window sash hangs on an interactable at its hinge / pivot with a
   blocking box for the use trace, each room switch and tap gets an interactable with a small use box, and each tap a
   hidden water stream (an engine cylinder from outlet to landing, src/water.js).
3. Builds /Game/Lunden/Generated/Interaction/Level_lift_buttons: the four lifts' car and call buttons
   (src/liftpanel.js) as interactables (Kind 3: state + ChangeCount only, since the lifts are not ported yet).
Ends with LUNDEN_INTERACTION_OK. Lock BP_LundenSwingDoor.uasset first (git lfs lock); the level is generated, not versioned.
"""
import hashlib
import json
import math
from pathlib import Path
import sys

import unreal as u

ASSETS = u.EditorAssetLibrary
BP = u.BlueprintEditorLibrary
GRAPH = u.BlueprintGraphEditor
DOOR = "/Game/Lunden/Blueprints/PilotDoors/BP_LundenSwingDoor"
LAMP = "/Game/Lunden/Lighting/BP_LundenLamp"
SOURCE = "/Game/Lunden/Generated/l1007/Level_l1007"
TARGET = "/Game/Lunden/Generated/Interaction/Level_l1007_interaction"
LIFTS = "/Game/Lunden/Generated/Interaction/Level_lift_buttons"
FOR_EACH = "/Engine/EditorBlueprintResources/StandardMacros.StandardMacros:ForEachLoop"  # as build_seasons.py
CYLINDER = "/Engine/BasicShapes/Cylinder.Cylinder"  # 100 cm across, 100 cm high, pivot at its centre
WATER_MATERIAL = "/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"
PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
USE_BOX = 6.0       # cm, half size of a switch's / tap's use box (the web picks the switch plate / tap lever)
LEAF_HALF = 2.5     # cm, half thickness of a door leaf's / sash's blocking box (the pilot's)
KIND_MOVE, KIND_SWITCH, KIND_TAP, KIND_BUTTON = 0, 1, 2, 3  # a button: only its state and ChangeCount (no motion)
BUTTON_BOX = 4.0    # cm, half size of a lift button's use box (LIFT_PANEL.radius 3.4 cm, ring x 1.32; pitch 12-15 cm)
BUTTON_SECONDS = 0.22  # LIFT_PANEL.pressMs
SPEC_TAG = "Lunden.SpecHash"
# the class depends only on this script (line endings normalised, so a CRLF checkout does not rebuild it)
SPEC = hashlib.sha256(Path(__file__).read_bytes().replace(b"\r\n", b"\n")).hexdigest()


# ---------------------------------------------------------------------------------------------- graph helpers ----

def pin_out(node, name):
    p = BP.find_output_pin(node, name)
    if not p.is_valid():
        raise RuntimeError(f"{node.get_name()} has no output {name}: {[str(x.get_pin_name()) for x in BP.list_output_pins(node)]}")
    return p


def connect(src, output, dst, name):
    out, inp = pin_out(src, output), BP.find_input_pin(dst, name)
    if not inp.is_valid() or not out.try_create_connection(inp):
        raise RuntimeError(f"Cannot connect {src.get_name()}.{output} to {dst.get_name()}.{name} "
                           f"{[str(p.get_pin_name()) for p in BP.list_input_pins(dst)]}")


def value(node, name, text):
    p = BP.find_input_pin(node, name)
    if not p.is_valid() or not p.set_pin_value(str(text)):
        raise RuntimeError(f"Cannot set {node.get_name()}.{name} to {text}")


class G:
    def __init__(self, bp):
        self.bp, self.g, self.x, self.y = bp, GRAPH.get_graph_editor_by_name(bp, "EventGraph"), 0, 0
        self.g.remove_nodes(list(self.g.list_all_nodes()))

    def at(self, node):
        if not node:
            raise RuntimeError(f"Could not create a graph node at {self.x},{self.y}")
        self.x += 280
        BP.set_node_pos(node, u.IntPoint(self.x, self.y))
        return node

    def row(self):
        self.x, self.y = 0, self.y + 700

    def call(self, path, **consts):
        node = self.at(self.g.add_call_function_node(path if path.startswith("/") else "/Script/Engine." + path))
        for k, v in consts.items():
            value(node, k, v)
        return node

    def get(self, name):
        return self.at(self.g.add_get_member_variable_node(name))

    def set(self, name):
        return self.at(self.g.add_set_member_variable_node(name))

    def custom(self, name):
        self.row()
        return self.at(self.g.add_custom_event_node(name))

    def branch(self):
        return self.at(self.g.add_branch_node())

    def named(self, *names):
        for name in names:
            node = self.g.create_node_from_name(name, u.Vector2D(self.x + 280, self.y), [])
            if node:
                return self.at(node)
        raise RuntimeError("No action " + " / ".join(names))

    def cast(self, cls_bp):
        node = self.named("Utilities|Casting|CastToActor")
        if not self.g.retarget_node_class(node, u.Actor, cls_bp.generated_class()):
            raise RuntimeError("Could not retarget a cast to " + cls_bp.get_name())
        return node, [str(p.get_pin_name()) for p in BP.list_output_pins(node) if str(p.get_pin_name()).startswith("As")][0]


def variables(bp, wanted):
    have = {str(n) for n in BP.list_member_variable_names(bp)}
    for name, typ in wanted.items():
        if name not in have:
            if not BP.add_member_variable(bp, name, typ):
                raise RuntimeError("Could not add the variable " + name)
        BP.set_blueprint_variable_instance_editable(bp, name, True)
    BP.compile_blueprint(bp)


def for_each_tag(gr, tags_var, cls_bp, body):
    """for tag in <tags_var>: for actor in GetAllActorsWithTag(tag): body(cast exec node, typed actor pin) -> exec in."""
    outer = gr.at(gr.g.add_macro_node(FOR_EACH))
    connect(gr.get(tags_var), tags_var, outer, "Array")
    find = gr.call("GameplayStatics:GetAllActorsWithTag")
    connect(outer, "LoopBody", find, "execute")
    connect(outer, "Array Element", find, "Tag")
    inner = gr.at(gr.g.add_macro_node(FOR_EACH))
    connect(find, "then", inner, "Exec")
    connect(find, "OutActors", inner, "Array")
    cast, typed = gr.cast(cls_bp)
    connect(inner, "LoopBody", cast, "execute")
    connect(inner, "Array Element", cast, "Object")
    body(cast, typed)
    return outer


def build_class():
    bp = ASSETS.load_asset(DOOR)
    if not bp:
        raise RuntimeError(DOOR + " is missing (the #2246 pilot asset)")
    if ASSETS.get_metadata_tag(bp, SPEC_TAG) == SPEC:
        u.log("LUNDEN_INTERACTION class unchanged, nothing saved")
        return bp.generated_class()
    rot, vec = BP.get_struct_type(u.Rotator.static_struct()), BP.get_struct_type(u.Vector.static_struct())
    names = BP.get_array_type(BP.get_basic_type_by_name("name"))
    variables(bp, {"OpenRotation": rot, "ClosedRotation": rot, "OpenLocation": vec, "ClosedLocation": vec,
                   "TargetOpen": BP.get_basic_type_by_name("bool"), "Wanted": BP.get_basic_type_by_name("bool"),
                   "Seconds": BP.get_basic_type_by_name("real"), "Kind": BP.get_basic_type_by_name("int"),
                   "ChangeCount": BP.get_basic_type_by_name("int"), "Id": BP.get_basic_type_by_name("string"),
                   "LampTags": names, "PartnerTags": names, "Water": BP.get_object_reference_type(u.Actor)})
    lamp = ASSETS.load_asset(LAMP)
    if not lamp:
        raise RuntimeError(LAMP + " is missing: build #2283's lighting first (build_lighting.py)")
    gr = G(bp)
    apply = gr.custom("Apply")
    BP.compile_blueprint(bp)  # Apply must exist on the class before the events can call it
    for name, wanted in (("OpenDoor", "true"), ("CloseDoor", "false"), ("ToggleDoor", None)):
        ev = gr.custom(name)
        setter = gr.set("Wanted")
        connect(ev, "then", setter, "execute")
        if wanted is None:
            flip = gr.call("KismetMathLibrary:Not_PreBool")
            connect(gr.get("TargetOpen"), "TargetOpen", flip, "A")
            connect(flip, "ReturnValue", setter, "Wanted")
        else:
            value(setter, "Wanted", wanted)
        go = gr.call(bp.generated_class().get_path_name() + ":Apply")
        connect(setter, "then", go, "execute")
    BP.compile_blueprint(bp)  # CloseDoor must exist before the partner loop calls it
    # Apply: only a real change does anything (and counts once)
    gr.row()
    gr.x = 0
    BP.set_node_pos(apply, u.IntPoint(0, gr.y))
    differs = gr.call("KismetMathLibrary:NotEqual_BoolBool")
    connect(gr.get("Wanted"), "Wanted", differs, "A")
    connect(gr.get("TargetOpen"), "TargetOpen", differs, "B")
    changed = gr.branch()
    connect(apply, "then", changed, "execute")
    connect(differs, "ReturnValue", changed, "Condition")
    state = gr.set("TargetOpen")
    connect(changed, "then", state, "execute")
    connect(gr.get("Wanted"), "Wanted", state, "TargetOpen")
    plus = gr.call("KismetMathLibrary:Add_IntInt")
    connect(gr.get("ChangeCount"), "ChangeCount", plus, "A")
    value(plus, "B", 1)  # promotable operators: a literal only after a typed connection
    count = gr.set("ChangeCount")
    connect(state, "then", count, "execute")
    connect(plus, "ReturnValue", count, "ChangeCount")
    is_switch = gr.call("KismetMathLibrary:EqualEqual_IntInt")
    connect(gr.get("Kind"), "Kind", is_switch, "A")
    value(is_switch, "B", KIND_SWITCH)
    b_switch = gr.branch()
    connect(count, "then", b_switch, "execute")
    connect(is_switch, "ReturnValue", b_switch, "Condition")

    # switch: every lamp:<id> actor on or off
    gr.row()

    def lamp_body(cast, typed):
        on = gr.branch()
        connect(cast, "then", on, "execute")
        connect(gr.get("TargetOpen"), "TargetOpen", on, "Condition")
        for pin, event in (("then", "TurnOn"), ("else", "TurnOff")):
            call = gr.call(lamp.generated_class().get_path_name() + ":" + event)
            connect(on, pin, call, "execute")
            connect(cast, typed, call, "self")
    lamps = for_each_tag(gr, "LampTags", lamp, lamp_body)
    connect(b_switch, "then", lamps, "Exec")

    # tap: the water stream shows while the tap is on
    gr.row()
    is_tap = gr.call("KismetMathLibrary:EqualEqual_IntInt")
    connect(gr.get("Kind"), "Kind", is_tap, "A")
    value(is_tap, "B", KIND_TAP)
    b_tap = gr.branch()
    connect(b_switch, "else", b_tap, "execute")
    connect(is_tap, "ReturnValue", b_tap, "Condition")
    hide = gr.call("Actor:SetActorHiddenInGame")
    connect(b_tap, "then", hide, "execute")
    connect(gr.get("Water"), "Water", hide, "self")
    off = gr.call("KismetMathLibrary:Not_PreBool")
    connect(gr.get("TargetOpen"), "TargetOpen", off, "A")
    connect(off, "ReturnValue", hide, "bNewHidden")

    # door or window: a wardrobe panel that opens closes its partner first, then the root moves
    gr.row()
    move = gr.call("KismetSystemLibrary:MoveComponentTo")
    gr.row()
    b_partner = gr.branch()
    connect(b_tap, "else", b_partner, "execute")
    connect(gr.get("TargetOpen"), "TargetOpen", b_partner, "Condition")

    def partner_body(cast, typed):
        close = gr.call(bp.generated_class().get_path_name() + ":CloseDoor")
        connect(cast, "then", close, "execute")
        connect(cast, typed, close, "self")
    partners = for_each_tag(gr, "PartnerTags", bp, partner_body)
    connect(b_partner, "then", partners, "Exec")
    connect(partners, "Completed", move, "Move")
    connect(b_partner, "else", move, "Move")
    gr.row()
    loc = gr.call("KismetMathLibrary:SelectVector")
    rot_pick = gr.call("KismetMathLibrary:SelectRotator")
    for node, a, b in ((loc, "OpenLocation", "ClosedLocation"), (rot_pick, "OpenRotation", "ClosedRotation")):
        connect(gr.get(a), a, node, "A")
        connect(gr.get(b), b, node, "B")
        connect(gr.get("TargetOpen"), "TargetOpen", node, "bPickA")
    root = gr.call("Actor:K2_GetRootComponent")
    connect(root, "ReturnValue", move, "Component")
    connect(loc, "ReturnValue", move, "TargetRelativeLocation")
    connect(rot_pick, "ReturnValue", move, "TargetRelativeRotation")
    connect(gr.get("Seconds"), "Seconds", move, "OverTime")
    for name in ("bEaseIn", "bEaseOut", "bForceShortestRotationPath"):
        value(move, name, "true")
    BP.compile_blueprint(bp)
    bad = gr.g.list_nodes_with_errors()
    if bad:
        raise RuntimeError("BP_LundenSwingDoor failed to compile: " + ", ".join(n.get_name() for n in bad))
    ASSETS.set_metadata_tag(bp, SPEC_TAG, SPEC)
    if not ASSETS.save_loaded_asset(bp, only_if_is_dirty=False):
        raise RuntimeError("Could not save " + DOOR + " (git lfs lock it first)")
    return bp.generated_class()


# ----------------------------------------------------------------------------------------------------- level ----

def yaw(degrees):
    return u.Rotator(roll=0, pitch=0, yaw=degrees)


def near(a, b):
    return abs((a - b + 180) % 360 - 180) < 0.1


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz)


def qrot(q, v):
    x, y, z, w = qmul(qmul(q, (v[0], v[1], v[2], 0.0)), (-q[0], -q[1], -q[2], q[3]))
    return (x, y, z)


def axis_quat(axis, degrees):
    n = math.sqrt(sum(c * c for c in axis))
    s = math.sin(math.radians(degrees) / 2)
    return (axis[0] / n * s, axis[1] / n * s, axis[2] / n * s, math.cos(math.radians(degrees) / 2))


def sash_rotation(sash):
    """The world rotation (about the pivot) that takes the closed check point to the open one: the export's axis and
    angle, with the sign that matches (the web is right-handed, Unreal left-handed). Returns (quat, error cm)."""
    pivot, closed, opened = (sash[k]["unreal"] for k in ("pivot", "checkClosed", "checkOpen"))
    rel = [c - p for c, p in zip(closed, pivot)]
    best = None
    for sign in (1, -1):
        q = axis_quat(sash["axis"]["unreal"], sign * sash["angleDeg"])
        got = [p + r for p, r in zip(pivot, qrot(q, rel))]
        err = math.dist(got, opened)
        if best is None or err < best[1]:
            best = (q, err)
    return best


def attach(actor, parent):
    keep = u.AttachmentRule.KEEP_WORLD
    actor.attach_to_actor(parent, "", keep, keep, keep, False)
    if actor.get_attach_parent_actor() != parent:
        raise RuntimeError("Failed to attach " + actor.get_actor_label() + " to " + parent.get_actor_label())


def movable(actor):
    for part in [actor] + list(actor.get_attached_actors(recursively_include_attached_actors=True)):
        for comp in part.get_components_by_class(u.SceneComponent):
            comp.set_mobility(u.ComponentMobility.MOVABLE)
            if isinstance(comp, u.PrimitiveComponent):
                comp.set_collision_enabled(u.CollisionEnabled.NO_COLLISION)


def box(actors, parent, label, tag, centre, extent, rotation=None):
    b = actors.spawn_actor_from_class(u.TriggerBox, u.Vector(*centre), rotation or yaw(0))
    b.set_actor_label(label)
    b.tags = [u.Name(tag)]
    comp = b.get_component_by_class(u.BoxComponent)
    comp.set_mobility(u.ComponentMobility.MOVABLE)
    comp.set_box_extent(u.Vector(*extent))
    comp.set_collision_profile_name("BlockAllDynamic")
    comp.set_editor_property("generate_overlap_events", False)
    attach(b, parent)
    return b


def interactable(actors, cls, row_id, kind, location, rotation, **props):
    a = actors.spawn_actor_from_class(cls, u.Vector(*location), rotation)
    a.set_actor_label(row_id + " interact")
    a.tags = [u.Name("interact:" + row_id), u.Name("kind:" + ("move", "switch", "tap", "liftbutton")[kind])]
    a.root_component.set_mobility(u.ComponentMobility.MOVABLE)
    a.set_editor_property("Id", row_id)
    a.set_editor_property("Kind", kind)
    for k, v in props.items():
        a.set_editor_property(k, v)
    return a


def build_level(cls, m):
    levels = u.EditorLoadingAndSavingUtils
    world = levels.load_map(SOURCE)
    if not world or not levels.save_map(world, TARGET):
        raise RuntimeError("Could not copy " + SOURCE + " to " + TARGET)
    world = levels.load_map(TARGET)
    actors = u.get_editor_subsystem(u.EditorActorSubsystem)
    by_id = {str(a.tags[0]): a for a in actors.get_all_level_actors() if a.tags}
    counts = {"swing": 0, "sliding": 0, "wardrobe": 0, "sash": 0, "switch": 0, "tap": 0}
    for d in [d for d in m["doors"] if d["zone"] == "l1007"]:
        leaf = by_id.get(d["id"])
        if leaf is None:
            raise RuntimeError("Imported door missing: " + d["id"])
        here = leaf.get_actor_location()
        start = [here.x, here.y, here.z]
        if d["kind"] == "swing":
            xyz = d["hinge"]["unreal"]
            if math.dist(start, xyz) > 1.0:
                raise RuntimeError(f"Imported hinge differs from the export: {d['id']} {start} {xyz}")
            heading = leaf.get_actor_rotation().yaw + 90  # the leaf's local +Y points from the hinge to the latch
            closed, opened = d["closed"]["unrealYaw"], d["open"]["unrealYaw"]
            if not (near(heading, closed) or near(heading, opened)):
                raise RuntimeError(f"Unexpected initial pose {d['id']}: {heading}")
            hinge = interactable(actors, cls, d["id"], KIND_MOVE, xyz, yaw(heading), OpenRotation=yaw(opened),
                                 ClosedRotation=yaw(closed), OpenLocation=u.Vector(*xyz), ClosedLocation=u.Vector(*xyz),
                                 TargetOpen=near(heading, opened), Seconds=d["seconds"])
            movable(leaf)
            attach(leaf, hinge)
            w, h, r = 100 * d["width"], 100 * d["height"], math.radians(heading)
            box(actors, hinge, d["id"] + " collision", "door-leaf:" + d["id"],
                (xyz[0] + w * math.cos(r) / 2, xyz[1] + w * math.sin(r) / 2, xyz[2] + h / 2), (w / 2, LEAF_HALF, h / 2), yaw(heading))
        else:
            c0, c1 = d["closedCentre"]["unreal"], d["openCentre"]["unreal"]
            shift = [b - a for a, b in zip(c0, c1)]
            closed_at = [s - k for s, k in zip(start, shift)] if d["initiallyOpen"] else start
            open_at = [a + k for a, k in zip(closed_at, shift)]
            rot = leaf.get_actor_rotation()
            partner = [u.Name("interact:" + d["partner"])] if d.get("partner") else []
            hinge = interactable(actors, cls, d["id"], KIND_MOVE, start, rot, OpenRotation=rot, ClosedRotation=rot,
                                 OpenLocation=u.Vector(*open_at), ClosedLocation=u.Vector(*closed_at),
                                 TargetOpen=d["initiallyOpen"], Seconds=d["seconds"], PartnerTags=partner)
            movable(leaf)
            attach(leaf, hinge)
            sx, sy, sz = d["size"]  # web axes: x east, y up, z south
            centre = c1 if d["initiallyOpen"] else c0
            box(actors, hinge, d["id"] + " collision", "door-leaf:" + d["id"], centre, (50 * sx, 50 * sz, 50 * sy))
        counts[d["kind"]] += 1
    for w in m["windows"]:
        for s in w.get("sashes", []):
            sash = by_id.get(s["id"])
            if sash is None:
                raise RuntimeError("Imported window sash missing: " + s["id"])
            here = sash.get_actor_location()
            pivot = s["pivot"]["unreal"]
            if math.dist([here.x, here.y, here.z], pivot) > 1.0:
                raise RuntimeError(f"Imported sash pivot differs from the export: {s['id']} {here} {pivot}")
            q, err = sash_rotation(s)
            if err > 1.0:
                raise RuntimeError(f"{s['id']}: the export's axis/angle miss its open check point by {err:.2f} cm")
            closed = sash.get_actor_rotation()
            cq = closed.quaternion()
            oq = qmul(q, (cq.x, cq.y, cq.z, cq.w))
            opened = u.Quat(*oq).rotator()
            hinge = interactable(actors, cls, s["id"], KIND_MOVE, pivot, closed, OpenRotation=opened, ClosedRotation=closed,
                                 OpenLocation=u.Vector(*pivot), ClosedLocation=u.Vector(*pivot),
                                 TargetOpen=s["initiallyOpen"], Seconds=s["seconds"])
            movable(sash)
            attach(sash, hinge)
            check = s["checkClosed"]["unreal"]
            r = w["rect"]
            width = 100 * (r["x1"] - r["x0"]) if w["facade"] in ("north", "south") else 100 * (r["z1"] - r["z0"])
            half_h = max(5.0, abs(pivot[2] - check[2]) / 2)
            extent = (width / 2 - 5, LEAF_HALF, half_h) if w["facade"] in ("north", "south") else (LEAF_HALF, width / 2 - 5, half_h)
            box(actors, hinge, s["id"] + " collision", "sash:" + s["id"], [(p + c) / 2 for p, c in zip(pivot, check)], extent)
            counts["sash"] += 1
    extra = m.get("interaction") or {}
    for i, sw in enumerate(extra.get("switches", [])):
        sid = sw["id"] or f"switch_{i}"
        xyz = sw["position"]["unreal"]
        a = interactable(actors, cls, sid, KIND_SWITCH, xyz, yaw(0), TargetOpen=False,
                         LampTags=[u.Name("lamp:" + lamp) for lamp in sw["lamps"]])
        a.tags = list(a.tags) + [u.Name(f"room:{sw['room']}"), u.Name(f"level:{sw['level']}")]
        n = sw["normal"]["unreal"]
        box(actors, a, sid + " use", "switch-use:" + sid, [p + 1.0 * k for p, k in zip(xyz, n)], (USE_BOX, USE_BOX, USE_BOX))
        counts["switch"] += 1
    mesh = u.load_asset(CYLINDER)
    for t in extra.get("taps", []):
        out, land = t["outlet"]["unreal"], t["landing"]["unreal"]
        length = math.dist(out, land)
        water = actors.spawn_actor_from_class(u.StaticMeshActor, u.Vector(*[(a + b) / 2 for a, b in zip(out, land)]), yaw(0))
        water.set_actor_label(t["id"] + " water")
        water.tags = [u.Name("water:" + t["id"])]
        comp = water.static_mesh_component
        comp.set_mobility(u.ComponentMobility.MOVABLE)
        comp.set_static_mesh(mesh)
        comp.set_collision_enabled(u.CollisionEnabled.NO_COLLISION)
        d = [b - a for a, b in zip(out, land)]
        # the cylinder's axis is local Z; tilt it from straight down by the stream's slope (taps here fall straight)
        pitch = math.degrees(math.atan2(math.hypot(d[0], d[1]), -d[2]))
        water.set_actor_rotation(u.Rotator(roll=0, pitch=pitch, yaw=math.degrees(math.atan2(d[1], d[0]))), False)
        diameter = 200 * t["radius"]
        water.set_actor_scale3d(u.Vector(diameter / 100, diameter / 100, length / 100))
        water.set_actor_hidden_in_game(True)
        tap = interactable(actors, cls, t["id"], KIND_TAP, t["pick"]["unreal"], yaw(0), TargetOpen=False, Water=water)
        box(actors, tap, t["id"] + " use", "tap-use:" + t["id"], t["pick"]["unreal"], (USE_BOX, USE_BOX, USE_BOX))
        counts["tap"] += 1
    if not levels.save_map(world, TARGET):
        raise RuntimeError("Could not save " + TARGET)
    u.log("LUNDEN_INTERACTION_LEVEL " + TARGET + " " + json.dumps(counts))
    return counts


def build_lift_level(cls, m):
    """The lifts' car and call buttons (src/liftpanel.js) as interactables in their own sub-level. The lifts themselves
    are not ported yet: a press only sets the button's state (lit) and raises ChangeCount, the hook a ported lift binds to."""
    rows = (m.get("interaction") or {}).get("liftButtons", [])
    levels = u.EditorLoadingAndSavingUtils
    world = levels.new_blank_map(False)
    actors = u.get_editor_subsystem(u.EditorActorSubsystem)
    for b in rows:
        xyz = b["position"]["unreal"]
        a = interactable(actors, cls, b["id"], KIND_BUTTON, xyz, yaw(0), TargetOpen=False, Seconds=BUTTON_SECONDS,
                         OpenLocation=u.Vector(*xyz), ClosedLocation=u.Vector(*xyz), OpenRotation=yaw(0), ClosedRotation=yaw(0))
        a.tags = list(a.tags) + [u.Name(f"house:{b['house']}"), u.Name(f"lift:{b['kind']}"), u.Name(f"stop:{b['stop']}")]
        box(actors, a, b["id"] + " use", "liftbutton-use:" + b["id"], xyz, (BUTTON_BOX, BUTTON_BOX, BUTTON_BOX))
    if not levels.save_map(world, LIFTS):
        raise RuntimeError("Could not save " + LIFTS)
    u.log(f"LUNDEN_INTERACTION_LIFTS {LIFTS}: {len(rows)} buttons")


def main(argv):
    path = Path(argv[0]) if argv else PROJECT / "Import/measurements.json"
    m = json.loads(path.read_text(encoding="utf-8"))
    if "interaction" not in m or not any(w.get("sashes") for w in m["windows"]):
        raise RuntimeError("measurements.json has no #2285 interaction data: export again (export-world.mjs)")
    for level in (TARGET, LIFTS):  # generated: delete first, so a rebuilt class does not keep the old level loaded
        if ASSETS.does_asset_exist(level) and not ASSETS.delete_asset(level):
            raise RuntimeError("Could not delete the previous " + level)
    cls = build_class()
    build_level(cls, m)
    build_lift_level(cls, m)
    u.log("LUNDEN_INTERACTION_OK")


main(sys.argv[1:])
