"""#2300: the player's footstep surface sensor and rest, built by build_player.py (not run on its own).

  Player/BPC_LundenStepSurface  ActorComponent on BP_LundenPlayer (player-extensions.json row StepSurface): what is under
                                the feet, src/stepsurface.js stepInfo from the export's sampled data
  Player/BPC_LundenRest         ActorComponent on BP_LundenPlayer (row Rest): sit and lie down on furniture, src/rest.js

Both read only their own variables, whose defaults build_player.py writes from measurements.json `spawn.surface` and
`spawn.rest` (export-player.js); no web number is typed into a graph.
"""
import unreal as u

ASSETS = u.EditorAssetLibrary
BP = u.BlueprintEditorLibrary
GRAPH = u.BlueprintGraphEditor
INT = BP.get_basic_type_by_name("int")
BOOL = BP.get_basic_type_by_name("bool")
REAL = BP.get_basic_type_by_name("real")
STRING = BP.get_basic_type_by_name("string")
NAME = BP.get_basic_type_by_name("name")
VEC = BP.get_struct_type(u.Vector.static_struct())
ROT = BP.get_struct_type(u.Rotator.static_struct())
FOR_EACH = "/Engine/EditorBlueprintResources/StandardMacros.StandardMacros:ForEachLoop"
FOR_LOOP = "/Engine/EditorBlueprintResources/StandardMacros.StandardMacros:ForLoop"


def array(t):
    return BP.get_array_type(t)


def class_path(path):
    return f"{path}.{path.rsplit('/', 1)[1]}_C"


# Graph helpers (as build_ui.py) ----------------------------------------------------------------------------------------

def pins(node, find):
    return [str(p.get_pin_name()) for p in find(node)]


def out(node, name):
    pin = BP.find_output_pin(node, name)
    if not pin.is_valid():
        raise RuntimeError(f"{node.get_name()} has no output {name}: {pins(node, BP.list_output_pins)}")
    return pin


def inp(node, name):
    pin = BP.find_input_pin(node, name)
    if not pin.is_valid():
        raise RuntimeError(f"{node.get_name()} has no input {name}: {pins(node, BP.list_input_pins)}")
    return pin


def link(a, b):
    if not a.try_create_connection(b):
        raise RuntimeError(f"Could not connect {a.get_pin_name()} to {b.get_pin_name()}")


def value(node, name, text):
    if not inp(node, name).set_pin_value(str(text)):
        raise RuntimeError(f"Could not set {node.get_name()}.{name} to {text}")


def feed(node, name, source):
    if isinstance(source, u.BlueprintGraphPin):
        link(source, inp(node, name))
    elif isinstance(source, bool):
        value(node, name, "true" if source else "false")
    else:
        value(node, name, source)


def feed_all(node, args):
    """Links first, literals after: a promotable operator types its pins from the links."""
    for name, source in sorted(args.items(), key=lambda item: not isinstance(item[1], u.BlueprintGraphPin)):
        feed(node, name, source)


def cast_out(node):
    found = [p for p in BP.list_output_pins(node) if str(p.get_pin_name()).startswith("As")]
    if len(found) != 1:
        raise RuntimeError(f"{node.get_name()}: no single As output in {pins(node, BP.list_output_pins)}")
    return found[0]


class Graph:
    """Places nodes left to right and chains exec pins: `step(node)` links the last exec output to the node."""

    def __init__(self, editor, entry=None, bp=None):
        self.g, self.bp = editor, bp
        self.x, self.y = 250, 0
        self.exec = entry

    def at(self, node, x=None, y=None):
        if not node:
            raise RuntimeError("Could not create a node")
        if x is None:
            x, self.x = self.x, self.x + 300
        BP.set_node_pos(node, u.IntPoint(x, self.y + 220 if y is None else y))
        return node

    def call(self, path):
        full = path if path.startswith("/") else "/Script/Engine." + path
        node = self.g.add_call_function_node(full)
        if not node:
            raise RuntimeError("Could not create a call to " + full)
        return self.at(node)

    def named(self, *names):
        for name in names:
            node = self.g.create_node_from_name(name, u.Vector2D(0, 0), [])
            if node:
                return self.at(node)
        raise RuntimeError("No action " + " / ".join(names))

    def get(self, name, owner=None, target=None):
        node = self.g.add_get_member_variable_node(name, owner) if owner else self.g.add_get_member_variable_node(name)
        self.at(node)
        if target is not None:
            link(target, inp(node, "self"))
        return out(node, name)

    def step(self, node, exec_in="execute", exec_out="then"):
        if self.exec is not None:
            link(self.exec, inp(node, exec_in))
        self.exec = out(node, exec_out) if exec_out else None
        BP.set_node_pos(node, u.IntPoint(self.x, self.y))
        self.x += 300
        return node

    def set(self, name, source, owner=None, target=None):
        node = self.g.add_set_member_variable_node(name, owner) if owner else self.g.add_set_member_variable_node(name)
        self.step(node)
        feed(node, name, source)
        if target is not None:
            link(target, inp(node, "self"))
        return node

    def run(self, path, target=None, **args):
        node = self.call(path)
        self.step(node)
        if target is not None:
            link(target, inp(node, "self"))
        feed_all(node, args)
        return node

    def pure(self, path, target=None, result="ReturnValue", **args):
        node = self.call(path)
        if "execute" in pins(node, BP.list_input_pins):
            self.step(node)
        if target is not None:
            link(target, inp(node, "self"))
        feed_all(node, args)
        return out(node, result)

    def node_of(self, path, target=None, **args):
        """A call node (stepped into the chain when impure); returns the node for several outputs."""
        node = self.call(path)
        if "execute" in pins(node, BP.list_input_pins):
            self.step(node)
        if target is not None:
            link(target, inp(node, "self"))
        feed_all(node, args)
        return node

    def cast(self, source, native_names, native, cls=None):
        """An exec Cast To node in the chain; continues on success and returns the As pin."""
        node = None
        for name in native_names:
            node = self.g.create_node_from_name("Utilities|Casting|" + name, u.Vector2D(0, 0), [])
            if node:
                break
        if not node:
            raise RuntimeError("No cast node " + " / ".join(native_names))
        if cls is not None and not self.g.retarget_node_class(node, native, cls):
            raise RuntimeError(f"Could not retarget {native_names[0]} to {cls.get_name()}")
        self.step(node)
        link(source, inp(node, "Object"))
        return cast_out(node)

    def branch(self, condition):
        """A Branch in the chain; continues on True and returns the False exec output."""
        node = self.g.add_branch_node()
        self.step(node)
        feed(node, "Condition", condition)
        return out(node, "else")

    def loop(self, array_pin):
        """A ForEachLoop in the chain; continues in the body. Returns (element, index, completed exec)."""
        node = self.at(self.g.add_macro_node(FOR_EACH))
        self.step(node, "Exec", "LoopBody")
        link(array_pin, inp(node, "Array"))
        return out(node, "Array Element"), out(node, "Array Index"), out(node, "Completed")

    def count(self, first, last):
        """A ForLoop (first..last, inclusive) in the chain; continues in the body. Returns (index, completed exec)."""
        node = self.at(self.g.add_macro_node(FOR_LOOP))
        self.step(node, "execute", "LoopBody")
        feed(node, "FirstIndex", first)
        feed(node, "LastIndex", last)
        return out(node, "Index"), out(node, "Completed")

    def ret(self, **values):
        node = self.g.add_return_node()
        self.step(node, exec_out=None)
        for name, source in values.items():
            feed(node, name, source)
        return node

    def fork(self, exec_pin, y):
        """A new chain from `exec_pin`, drawn on row `y`."""
        g = Graph(self.g, exec_pin, self.bp)
        g.x, g.y = self.x, y
        return g

    # small maths
    def op(self, name, **args):
        return self.pure("KismetMathLibrary:" + name, **args)

    def item(self, array_pin, index):
        node = self.call("KismetArrayLibrary:Array_Get")
        feed(node, "TargetArray", array_pin)
        feed(node, "Index", index)
        return out(node, "Item")


def function(bp, name, inputs=(), outputs=(), pure=False):
    """A new function graph; returns (Graph chained from the entry, entry pins by name). Compiles first, so the
    functions made so far can be called from the new one."""
    BP.compile_blueprint(bp)
    editor = GRAPH.create_and_edit_function_graph(bp, name)
    if not editor:
        raise RuntimeError("Could not create the function " + name)
    params = {}
    for pname, ptype in inputs:
        pin = editor.add_graph_input_parameter(pname, ptype)
        if not pin or not pin.is_valid():
            raise RuntimeError(f"Could not add the input {name}.{pname}")
        params[pname] = pin
    for pname, ptype in outputs:
        if not editor.add_graph_output_parameter(pname, ptype):
            raise RuntimeError(f"Could not add the output {name}.{pname}")
    if pure:
        editor.set_is_pure_function(True)
    return Graph(editor, editor.find_graph_entry_pin(), bp), params


def events(bp):
    BP.compile_blueprint(bp)
    g = Graph(GRAPH.get_graph_editor_by_name(bp, "EventGraph"), None, bp)
    g.g.remove_nodes(list(g.g.list_all_nodes()))
    return g


def event(g, bp, name, override, y):
    node = g.g.create_node_from_name(name, u.Vector2D(0, y), []) or BP.add_event_override(bp, override, u.IntPoint(0, y))
    if not node:
        raise RuntimeError("Could not create the event " + name)
    BP.set_node_pos(node, u.IntPoint(0, y))
    g.x, g.y, g.exec = 300, y, out(node, "then")
    return node


def compiled(bp):
    BP.compile_blueprint(bp)
    broken = []
    for name in BP.list_graph_names(bp):
        editor = GRAPH.get_graph_editor_by_name(bp, str(name))
        if editor:
            broken += [f"{name}: {n.get_name()} ({BP.get_node_title(n)})" for n in editor.list_nodes_with_errors()]
    if broken:
        raise RuntimeError(f"{bp.get_name()} failed to compile: " + ", ".join(broken))


def variables(bp, wanted):
    have = {str(n) for n in BP.list_member_variable_names(bp)}
    for name, kind in wanted.items():
        if name not in have and not BP.add_member_variable(bp, name, kind):
            raise RuntimeError(f"Could not add the variable {name} to {bp.get_name()}")


def fresh_component(path, functions):
    """The component Blueprint at `path` (created when missing) with its event graph emptied and `functions` removed."""
    if ASSETS.does_asset_exist(path):
        bp = ASSETS.load_asset(path)
        editor = GRAPH.get_graph_editor_by_name(bp, "EventGraph")
        editor.remove_nodes(list(editor.list_all_nodes()))
        for name in functions:
            if BP.find_graph(bp, name):
                BP.remove_function_graph(bp, name)
        BP.compile_blueprint(bp)
        left = [str(n) for n in BP.list_graph_names(bp) if str(n) in functions]
        if left:
            raise RuntimeError(f"Could not remove the old functions {left} from {path}")
        return bp
    factory = u.BlueprintFactory()
    factory.set_editor_property("parent_class", u.ActorComponent)
    folder, name = path.rsplit("/", 1)
    bp = u.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, u.Blueprint, factory)
    if not bp:
        raise RuntimeError("Could not create " + path)
    return bp


def owner_character(g):
    """GetOwner cast to Character, in the chain; returns the As pin."""
    owner = g.pure("ActorComponent:GetOwner")
    return g.cast(owner, ["CastToCharacter"], u.Character.static_class())


# BPC_LundenStepSurface ----------------------------------------------------------------------------------------------------

STEP_FUNCTIONS = ("GridCode", "StepCode", "NearLevel", "StepInfo", "FeetLocation", "FeetInfo")
STEP_VARIABLES = {
    "Surfaces": array(NAME), "Wheres": array(NAME),
    "GridX0": REAL, "GridY0": REAL, "GridCell": REAL, "GridNX": INT, "GridNY": INT, "Char0": INT, "Grid": STRING,
    "BoxCentre": array(VEC), "BoxExtent": array(VEC), "BoxCode": array(INT),
    "BucketX0": REAL, "BucketY0": REAL, "BucketCell": REAL, "BucketNX": INT, "BucketNY": INT,
    "BucketStart": array(INT), "BucketCount": array(INT), "BucketItems": array(INT),
    "Levels": array(REAL), "FloorTol": REAL, "FloorClearance": REAL,
}
INFO = [("Surface", NAME), ("Where", NAME), ("Road", BOOL), ("Stairs", BOOL), ("Outdoor", BOOL), ("Code", INT)]


def build_step_surface(path):
    """StepInfo(Location) -> Surface, Where, Road, Stairs, Outdoor, Code: the first box (BoxCentre/BoxExtent) holding the
    point gives the code, else the ground raster Grid; `Stairs` = in a stairwell (code bit 32) and not within FloorTol of
    a landing level (stepInfo's stairs); `Outdoor` = where is ground or exposed (src/player.js runSpeed's outdoors and
    not below or in a core). FeetInfo() = StepInfo at the owner's feet (capsule bottom less the float above the floor)."""
    bp = fresh_component(path, STEP_FUNCTIONS)
    variables(bp, STEP_VARIABLES)
    me = class_path(path)

    # GridCode(Location) -> Code: the raster cell's character minus Char0; 0 (grass) outside the raster
    g, p = function(bp, "GridCode", [("Location", VEC)], [("Code", INT)], pure=True)
    split = g.call("KismetMathLibrary:BreakVector")
    link(p["Location"], inp(split, "InVec"))
    cells = []
    for axis, origin, count in (("X", "GridX0", "GridNX"), ("Y", "GridY0", "GridNY")):
        rel = g.op("Divide_DoubleDouble", A=g.op("Subtract_DoubleDouble", A=out(split, axis), B=g.get(origin)), B=g.get("GridCell"))
        i = g.op("FFloor", A=rel)
        ok = g.op("BooleanAND", A=g.op("GreaterEqual_IntInt", A=i, B=0), B=g.op("Less_IntInt", A=i, B=g.get(count)))
        cells.append((i, ok))
    inside = g.op("BooleanAND", A=cells[0][1], B=cells[1][1])
    index = g.op("Add_IntInt", A=g.op("Multiply_IntInt", A=cells[1][0], B=g.get("GridNX")), B=cells[0][0])
    char = g.pure("KismetStringLibrary:GetCharacterAsNumber", SourceString=g.get("Grid"), Index=index)
    code = g.op("SelectInt", A=g.op("Subtract_IntInt", A=char, B=g.get("Char0")), B=0, bPickA=inside)
    g.ret(Code=code)

    # StepCode(Location) -> Code: the first box of the point's bucket that holds it, else the raster
    g, p = function(bp, "StepCode", [("Location", VEC)], [("Code", INT)])
    split = g.call("KismetMathLibrary:BreakVector")
    link(p["Location"], inp(split, "InVec"))
    cells = []
    for axis, origin, count in (("X", "BucketX0", "BucketNX"), ("Y", "BucketY0", "BucketNY")):
        rel = g.op("Divide_DoubleDouble", A=g.op("Subtract_DoubleDouble", A=out(split, axis), B=g.get(origin)), B=g.get("BucketCell"))
        i = g.op("FFloor", A=rel)
        ok = g.op("BooleanAND", A=g.op("GreaterEqual_IntInt", A=i, B=0), B=g.op("Less_IntInt", A=i, B=g.get(count)))
        cells.append((i, ok))
    outside = g.branch(g.op("BooleanAND", A=cells[0][1], B=cells[1][1]))
    bucket = g.op("Add_IntInt", A=g.op("Multiply_IntInt", A=cells[1][0], B=g.get("BucketNX")), B=cells[0][0])
    first = g.item(g.get("BucketStart"), bucket)
    last = g.op("Subtract_IntInt", A=g.op("Add_IntInt", A=first, B=g.item(g.get("BucketCount"), bucket)), B=1)
    index, done = g.count(first, last)
    box = g.item(g.get("BucketItems"), index)
    hit = g.op("IsPointInBox", Point=p["Location"], BoxOrigin=g.item(g.get("BoxCentre"), box),
               BoxExtent=g.item(g.get("BoxExtent"), box))
    g.branch(hit)
    g.ret(Code=g.item(g.get("BoxCode"), box))
    for n, exec_pin in enumerate((done, outside)):
        tail = g.fork(exec_pin, 700 + 400 * n)
        tail.ret(Code=tail.pure(me + ":GridCode", result="Code", Location=p["Location"]))

    # NearLevel(Z) -> Near: within FloorTol of a landing level (stepInfo's stair test)
    g, p = function(bp, "NearLevel", [("Z", REAL)], [("Near", BOOL)])
    element, _, done = g.loop(g.get("Levels"))
    close = g.op("Less_DoubleDouble", A=g.op("Abs", A=g.op("Subtract_DoubleDouble", A=p["Z"], B=element)), B=g.get("FloorTol"))
    g.branch(close)
    g.ret(Near=True)
    g.fork(done, 500).ret(Near=False)

    # StepInfo(Location) -> the class
    g, p = function(bp, "StepInfo", [("Location", VEC)], INFO)
    step = g.node_of(me + ":StepCode", Location=p["Location"])
    code = out(step, "Code")
    split = g.call("KismetMathLibrary:BreakVector")
    link(p["Location"], inp(split, "InVec"))
    near = g.node_of(me + ":NearLevel", Z=out(split, "Z"))
    surface = g.op("Percent_IntInt", A=code, B=4)
    where = g.op("Percent_IntInt", A=g.op("Divide_IntInt", A=code, B=4), B=4)
    road = g.op("EqualEqual_IntInt", A=g.op("Percent_IntInt", A=g.op("Divide_IntInt", A=code, B=16), B=2), B=1)
    core = g.op("GreaterEqual_IntInt", A=code, B=32)
    stairs = g.op("BooleanAND", A=core, B=g.op("Not_PreBool", A=out(near, "Near")))
    g.ret(Surface=g.item(g.get("Surfaces"), surface), Where=g.item(g.get("Wheres"), where), Road=road, Stairs=stairs,
          Outdoor=g.op("Less_IntInt", A=where, B=2), Code=code)

    # FeetLocation() -> Location: the owner's capsule bottom less the float above the floor (build_player.py
    # FLOOR_CLEARANCE); a non-Character owner gives its own location
    g, _ = function(bp, "FeetLocation", [], [("Location", VEC)])
    owner = g.pure("ActorComponent:GetOwner")
    at = g.pure("Actor:K2_GetActorLocation", target=owner)
    cast_node = g.g.create_node_from_name("Utilities|Casting|CastToCharacter", u.Vector2D(0, 0), [])
    if not cast_node:
        raise RuntimeError("No CastToCharacter node")
    g.step(cast_node)
    link(owner, inp(cast_node, "Object"))
    who = cast_out(cast_node)
    capsule = g.get("CapsuleComponent", "/Script/Engine.Character", target=who)
    half = g.pure("CapsuleComponent:GetScaledCapsuleHalfHeight", target=capsule)
    down = g.op("Add_DoubleDouble", A=half, B=g.get("FloorClearance"))
    feet = g.op("Subtract_VectorVector", A=at, B=g.op("MakeVector", X=0, Y=0, Z=down))
    g.ret(Location=feet)
    g.fork(out(cast_node, "CastFailed"), 600).ret(Location=at)

    # FeetInfo() -> the class under the feet
    g, _ = function(bp, "FeetInfo", [], INFO)
    feet = g.node_of(me + ":FeetLocation")
    info = g.node_of(me + ":StepInfo", Location=out(feet, "Location"))
    g.ret(**{name: out(info, name) for name, _ in INFO})
    compiled(bp)
    return bp


# BPC_LundenRest --------------------------------------------------------------------------------------------------------------

REST_FUNCTIONS = ("PickSpot", "BeginRest", "StandUp", "Use", "ApplyLimits", "Glide")
REST_VARIABLES = {
    "SpotEye": array(VEC), "SpotAim": array(VEC), "SpotYaw": array(REAL), "SpotStartYaw": array(REAL),
    "SpotStartPitch": array(REAL), "SpotLie": array(BOOL), "SpotItem": array(STRING), "SpotName": array(STRING),
    "Move": REAL, "Reach": REAL, "PickRadius": REAL,
    "SitYaw": REAL, "SitPitchMin": REAL, "SitPitchMax": REAL, "LieYaw": REAL, "LiePitchMin": REAL, "LiePitchMax": REAL,
    "Spot": INT, "Alpha": REAL, "Count": INT, "FromLocation": VEC, "StandLocation": VEC, "FromRotation": ROT,
    "BestIndex": INT, "BestDistance": REAL, "MaxAlong": REAL,
    "SavedPitchMin": REAL, "SavedPitchMax": REAL, "SavedYawMin": REAL, "SavedYawMax": REAL,
}
CAMERA = "/Script/Engine.PlayerCameraManager"


def build_rest(path):
    """Sit or lie on furniture (src/rest.js, src/main.js sitOrLie / standUp):

    - Use(): E. Resting: StandUp; else PickSpot and BeginRest. Also Space or Ctrl while resting stand up (main.js).
    - PickSpot() -> Index: the spot whose aim point is nearest the view ray (chooseSpot), within Reach along the ray and
      PickRadius from it, and not behind the first thing the view hits (a visibility trace). -1 = none.
    - BeginRest(Index): remembers where you stood, stops walking and collision, and glides the eye to the spot over Move
      s (smoothstep; the view turns to the spot's start yaw and pitch, Rest.begin). Then ApplyLimits clamps the view to
      the spot's yaw +- the kind's yaw and its pitch range (Rest.clampLook) on the camera manager.
    - StandUp(): back where you stood, facing the way you look (level after lying), walking again, limits restored.
    The keys are read in Tick with WasInputKeyJustPressed (no input action of its own, so E keeps opening doors through
    the controller's trace, and Space / Ctrl keep their actions)."""
    bp = fresh_component(path, REST_FUNCTIONS)
    variables(bp, REST_VARIABLES)
    me = class_path(path)

    def camera(g):
        return g.pure("GameplayStatics:GetPlayerCameraManager", PlayerIndex=0)

    def controller(g):
        return g.pure("GameplayStatics:GetPlayerController", PlayerIndex=0)

    # PickSpot() -> Index
    g, _ = function(bp, "PickSpot", [], [("Index", INT)])
    owner = g.pure("ActorComponent:GetOwner")
    view = g.node_of("Actor:GetActorEyesViewPoint", target=owner)
    eye, rot = out(view, "OutLocation"), out(view, "OutRotation")
    ahead = g.op("GetForwardVector", InRot=rot)
    far = g.op("Add_DoubleDouble", A=g.get("Reach"), B=g.get("PickRadius"))
    trace = g.node_of("KismetSystemLibrary:LineTraceSingle", Start=eye,
                      End=g.op("Add_VectorVector", A=eye, B=g.op("Multiply_VectorFloat", A=ahead, B=far)),
                      TraceChannel="TraceTypeQuery1", bTraceComplex=True, DrawDebugType="None", bIgnoreSelf=True)
    split = g.call("GameplayStatics:BreakHitResult")
    link(out(trace, "OutHit"), inp(split, "Hit"))
    blocked = g.op("Add_DoubleDouble", A=out(split, "Distance"), B=g.get("PickRadius"))
    far_again = g.op("Add_DoubleDouble", A=g.get("Reach"), B=g.get("PickRadius"))  # (one promotable output per use)
    g.set("MaxAlong", g.op("SelectFloat", A=blocked, B=far_again, bPickA=out(trace, "ReturnValue")))
    g.set("BestIndex", -1)
    g.set("BestDistance", g.get("PickRadius"))
    element, index, done = g.loop(g.get("SpotAim"))
    rel = g.op("Subtract_VectorVector", A=element, B=eye)
    along = g.op("Dot_VectorVector", A=rel, B=ahead)
    across = g.op("VSize", A=g.op("Subtract_VectorVector", A=rel, B=g.op("Multiply_VectorFloat", A=ahead, B=along)))
    ok = g.op("BooleanAND", A=g.op("BooleanAND", A=g.op("Greater_DoubleDouble", A=along, B=0),
                                   B=g.op("LessEqual_DoubleDouble", A=along, B=g.get("MaxAlong"))),
              B=g.op("Less_DoubleDouble", A=across, B=g.get("BestDistance")))
    g.branch(ok)
    g.set("BestIndex", index)
    g.set("BestDistance", across)
    tail = g.fork(done, 700)
    tail.ret(Index=tail.get("BestIndex"))

    # ApplyLimits(): the view clamp of the spot's kind round its yaw
    g, _ = function(bp, "ApplyLimits")
    spot = g.get("Spot")
    lie = g.item(g.get("SpotLie"), spot)
    yaw = g.item(g.get("SpotYaw"), spot)
    half = g.op("SelectFloat", A=g.get("LieYaw"), B=g.get("SitYaw"), bPickA=lie)
    cam = camera(g)
    for prop, source in (("ViewYawMin", g.op("Subtract_DoubleDouble", A=yaw, B=half)),
                         ("ViewYawMax", g.op("Add_DoubleDouble", A=yaw, B=half)),
                         ("ViewPitchMin", g.op("SelectFloat", A=g.get("LiePitchMin"), B=g.get("SitPitchMin"), bPickA=lie)),
                         ("ViewPitchMax", g.op("SelectFloat", A=g.get("LiePitchMax"), B=g.get("SitPitchMax"), bPickA=lie))):
        g.set(prop, source, CAMERA, cam)

    # BeginRest(Index)
    g, p = function(bp, "BeginRest", [("Index", INT)], [])
    valid = g.op("BooleanAND", A=g.op("GreaterEqual_IntInt", A=p["Index"], B=0),
                 B=g.op("Less_IntInt", A=p["Index"], B=g.pure("KismetArrayLibrary:Array_Length", TargetArray=g.get("SpotEye"))))
    g.branch(valid)
    g.branch(g.op("Less_IntInt", A=g.get("Spot"), B=0))  # already resting: nothing
    who = owner_character(g)
    move = g.get("CharacterMovement", "/Script/Engine.Character", target=who)
    g.run("MovementComponent:StopMovementImmediately", target=move)
    g.run("CharacterMovementComponent:SetMovementMode", target=move, NewMovementMode="MOVE_None", NewCustomMode=0)
    g.run("Actor:SetActorEnableCollision", target=who, bNewActorEnableCollision=False)
    here = g.pure("Actor:K2_GetActorLocation", target=who)
    g.set("StandLocation", here)
    g.set("FromLocation", here)
    g.set("FromRotation", g.pure("Controller:GetControlRotation", target=controller(g)))
    cam = camera(g)
    for prop, var in (("ViewPitchMin", "SavedPitchMin"), ("ViewPitchMax", "SavedPitchMax"), ("ViewYawMin", "SavedYawMin"),
                      ("ViewYawMax", "SavedYawMax")):
        g.set(var, g.get(prop, CAMERA, cam))
    g.set("Alpha", 0.0)
    g.set("Count", g.op("Add_IntInt", A=g.get("Count"), B=1))
    g.set("Spot", p["Index"])

    # Glide(DeltaSeconds): the entry glide (Rest.update), then the limits
    g, p = function(bp, "Glide", [("DeltaSeconds", REAL)], [])
    g.branch(g.op("GreaterEqual_IntInt", A=g.get("Spot"), B=0))
    g.branch(g.op("Less_DoubleDouble", A=g.get("Alpha"), B=1))
    a = g.op("FMin", A=g.op("Add_DoubleDouble", A=g.get("Alpha"), B=g.op("Divide_DoubleDouble", A=p["DeltaSeconds"], B=g.get("Move"))), B=1)
    g.set("Alpha", a)
    a = g.get("Alpha")
    e = g.op("Multiply_DoubleDouble", A=g.op("Multiply_DoubleDouble", A=a, B=a),
             B=g.op("Subtract_DoubleDouble", A=3, B=g.op("Multiply_DoubleDouble", A=2, B=a)))
    who = owner_character(g)
    spot = g.get("Spot")
    eye_height = g.get("BaseEyeHeight", "/Script/Engine.Pawn", target=who)
    to = g.op("Subtract_VectorVector", A=g.item(g.get("SpotEye"), spot), B=g.op("MakeVector", X=0, Y=0, Z=eye_height))
    g.run("Actor:K2_SetActorLocation", target=who, NewLocation=g.op("VLerp", A=g.get("FromLocation"), B=to, Alpha=e),
          bSweep=False, bTeleport=True)
    goal = g.op("MakeRotator", Roll=0, Pitch=g.item(g.get("SpotStartPitch"), spot), Yaw=g.item(g.get("SpotStartYaw"), spot))
    g.run("Controller:SetControlRotation", target=controller(g),
          NewRotation=g.op("RLerp", A=g.get("FromRotation"), B=goal, Alpha=e, bShortestPath=True))
    g.branch(g.op("GreaterEqual_DoubleDouble", A=g.get("Alpha"), B=1))
    g.run(me + ":ApplyLimits")

    # StandUp()
    g, _ = function(bp, "StandUp")
    g.branch(g.op("GreaterEqual_IntInt", A=g.get("Spot"), B=0))
    cam = camera(g)
    for prop, var in (("ViewPitchMin", "SavedPitchMin"), ("ViewPitchMax", "SavedPitchMax"), ("ViewYawMin", "SavedYawMin"),
                      ("ViewYawMax", "SavedYawMax")):
        g.set(prop, g.get(var), CAMERA, cam)
    pc = controller(g)
    now = g.call("KismetMathLibrary:BreakRotator")
    link(g.pure("Controller:GetControlRotation", target=pc), inp(now, "InRot"))
    lie = g.item(g.get("SpotLie"), g.get("Spot"))
    g.run("Controller:SetControlRotation", target=pc,
          NewRotation=g.op("MakeRotator", Roll=0, Yaw=out(now, "Yaw"), Pitch=g.op("SelectFloat", A=0, B=out(now, "Pitch"), bPickA=lie)))
    who = owner_character(g)
    g.run("Actor:SetActorEnableCollision", target=who, bNewActorEnableCollision=True)
    g.run("Actor:K2_SetActorLocation", target=who, NewLocation=g.get("StandLocation"), bSweep=False, bTeleport=True)
    move = g.get("CharacterMovement", "/Script/Engine.Character", target=who)
    g.run("CharacterMovementComponent:SetMovementMode", target=move, NewMovementMode="MOVE_Walking", NewCustomMode=0)
    g.set("Spot", -1)

    # Use(): E
    g, _ = function(bp, "Use")
    standing = g.branch(g.op("GreaterEqual_IntInt", A=g.get("Spot"), B=0))
    g.run(me + ":StandUp")
    other = g.fork(standing, 500)
    pick = other.node_of(me + ":PickSpot")
    other.run(me + ":BeginRest", Index=out(pick, "Index"))

    # Tick: the keys, then the glide
    g = events(bp)
    tick = event(g, bp, "AddEvent|EventTick", "ReceiveTick", 0)
    pc = controller(g)
    pressed = g.pure("PlayerController:WasInputKeyJustPressed", target=pc, Key="E")
    no_e = g.branch(pressed)
    g.run(me + ":Use")
    g.run(me + ":Glide", DeltaSeconds=out(tick, "DeltaSeconds"))
    h = g.fork(no_e, 600)
    up = h.op("BooleanOR", A=h.pure("PlayerController:WasInputKeyJustPressed", target=pc, Key="SpaceBar"),
              B=h.pure("PlayerController:WasInputKeyJustPressed", target=pc, Key="LeftControl"))
    resting = h.op("GreaterEqual_IntInt", A=h.get("Spot"), B=0)
    after = h.branch(h.op("BooleanAND", A=up, B=resting))
    h.run(me + ":StandUp")
    h.run(me + ":Glide", DeltaSeconds=out(tick, "DeltaSeconds"))
    k = h.fork(after, 1000)
    k.run(me + ":Glide", DeltaSeconds=out(tick, "DeltaSeconds"))
    compiled(bp)
    return bp


# Defaults from the export ------------------------------------------------------------------------------------------------

PICK_RADIUS = 40.0  # cm: how far from the view ray a rest spot's aim point may be (assumption; the web picks the piece
# the ray hits, then chooseSpot's nearest spot, src/rest.js; Unreal's imported furniture has no reliable trace collision)


def component_defaults(path, bp, data, values):
    BP.compile_blueprint(bp)
    d = u.get_default_object(bp.generated_class())
    if path.endswith("BPC_LundenStepSurface"):
        grid = data["grid"]
        boxes = data["boxes"]
        d.set_editor_property("Surfaces", [u.Name(n) for n in data["surfaces"]])
        d.set_editor_property("Wheres", [u.Name(n) for n in data["wheres"]])
        for name, key in (("GridX0", "x0"), ("GridY0", "y0"), ("GridCell", "cell")):
            d.set_editor_property(name, float(grid[key]))
        for name, key in (("GridNX", "nx"), ("GridNY", "ny"), ("Char0", "char0")):
            d.set_editor_property(name, int(grid[key]))
        if len(grid["codes"]) != grid["nx"] * grid["ny"]:
            raise RuntimeError("measurements.json spawn.surface.grid: codes do not fill nx * ny")
        d.set_editor_property("Grid", grid["codes"])
        d.set_editor_property("BoxCentre", [u.Vector((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2) for b in boxes])
        d.set_editor_property("BoxExtent", [u.Vector((b[3] - b[0]) / 2, (b[4] - b[1]) / 2, (b[5] - b[2]) / 2) for b in boxes])
        d.set_editor_property("BoxCode", [int(b[6]) for b in boxes])
        k = data["buckets"]
        for name, key in (("BucketX0", "x0"), ("BucketY0", "y0"), ("BucketCell", "cell")):
            d.set_editor_property(name, float(k[key]))
        for name, key in (("BucketNX", "nx"), ("BucketNY", "ny")):
            d.set_editor_property(name, int(k[key]))
        for name, key in (("BucketStart", "starts"), ("BucketCount", "counts"), ("BucketItems", "items")):
            d.set_editor_property(name, [int(v) for v in k[key]])
        d.set_editor_property("Levels", [float(v) for v in data["levels"]])
        d.set_editor_property("FloorTol", float(data["floorTol"]))
        d.set_editor_property("FloorClearance", float(values["vars"]["FloorClearance"]))
    else:
        spots = data["spots"]
        d.set_editor_property("SpotEye", [u.Vector(*s["eye"]["unreal"]) for s in spots])
        d.set_editor_property("SpotAim", [u.Vector(*s["aim"]["unreal"]) for s in spots])
        for name, key in (("SpotYaw", "yaw"), ("SpotStartYaw", "startYaw"), ("SpotStartPitch", "startPitch")):
            d.set_editor_property(name, [float(s[key]) for s in spots])
        d.set_editor_property("SpotLie", [s["kind"] == "lie" for s in spots])
        d.set_editor_property("SpotItem", [s["item"] for s in spots])
        d.set_editor_property("SpotName", [s["name"] for s in spots])
        lim = data["limits"]
        for name, v in (("Move", data["move"]), ("Reach", data["reach"]), ("PickRadius", PICK_RADIUS),
                        ("SitYaw", lim["sit"]["yaw"]), ("SitPitchMin", lim["sit"]["pitch"][0]), ("SitPitchMax", lim["sit"]["pitch"][1]),
                        ("LieYaw", lim["lie"]["yaw"]), ("LiePitchMin", lim["lie"]["pitch"][0]), ("LiePitchMax", lim["lie"]["pitch"][1])):
            d.set_editor_property(name, float(v))
        d.set_editor_property("Spot", -1)
        d.set_editor_property("Count", 0)


# The character's #2300 functions -----------------------------------------------------------------------------------------

CHARACTER_FUNCTIONS = ("UpdateSprint", "Die", "Revive", "UpdateBlackout")


def cast_component(g, source, path):
    """Cast an ActorComponent pin to the Blueprint component at `path` (in the chain); returns the As pin."""
    cls = u.load_class(None, class_path(path))
    node = g.g.create_node_from_name("Utilities|Casting|CastTo" + path.rsplit("/", 1)[1], u.Vector2D(0, 0), [])
    if not node:
        node = g.g.create_node_from_name("Utilities|Casting|CastToActorComponent", u.Vector2D(0, 0), [])
        if not node or not g.g.retarget_node_class(node, u.ActorComponent.static_class(), cls):
            raise RuntimeError("Could not make a cast to " + path)
    g.step(node)
    link(source, inp(node, "Object"))
    return cast_out(node)


def component_of(g, path):
    found = g.pure("Actor:GetComponentByClass", ComponentClass=class_path(path))
    return cast_component(g, found, path)


def clear_character(char):
    """Empty BP_LundenPlayer's event graph and drop its #2300 functions before the components are rebuilt, so no node of
    the character refers to a component function while that function is gone (it would log compile errors)."""
    editor = GRAPH.get_graph_editor_by_name(char, "EventGraph")
    editor.remove_nodes(list(editor.list_all_nodes()))
    for name in CHARACTER_FUNCTIONS:
        if BP.find_graph(char, name):
            BP.remove_function_graph(char, name)
    BP.compile_blueprint(char)


def character_functions(char, step_path, rest_path):
    """UpdateSprint(), Die(), Revive() -> Revived and UpdateBlackout(DeltaSeconds) on BP_LundenPlayer."""
    for name in CHARACTER_FUNCTIONS:
        if BP.find_graph(char, name):
            BP.remove_function_graph(char, name)
    BP.compile_blueprint(char)
    me = char.generated_class().get_path_name()

    # UpdateSprint(): while Shift is held the speed is RunOutdoorSpeed outdoors, RunSpeed inside (src/player.js runSpeed)
    g, _ = function(char, "UpdateSprint")
    g.branch(g.get("Running"))
    step = component_of(g, step_path)
    info = g.node_of(class_path(step_path) + ":FeetInfo", target=step)
    speed = g.op("SelectFloat", A=g.get("RunOutdoorSpeed"), B=g.get("RunSpeed"), bPickA=out(info, "Outdoor"))
    g.set("MaxWalkSpeed", speed, "/Script/Engine.CharacterMovementComponent", g.get("CharacterMovement", "/Script/Engine.Character"))

    # Revive() -> Revived: the first of the web's wake points from a random start that the capsule fits at
    g, _ = function(char, "Revive", [], [("Revived", BOOL)])
    count = g.pure("KismetArrayLibrary:Array_Length", TargetArray=g.get("RevivePoints"))
    g.branch(g.op("Greater_IntInt", A=count, B=0))
    # stored: a pure random node would draw again at every use
    g.set("ReviveStart", g.op("RandomIntegerInRange", Min=0, Max=g.op("Subtract_IntInt", A=count, B=1)))
    start = g.get("ReviveStart")
    half = g.pure("CapsuleComponent:GetScaledCapsuleHalfHeight", target=g.get("CapsuleComponent", "/Script/Engine.Character"))
    up = g.op("MakeVector", X=0, Y=0, Z=g.op("Add_DoubleDouble", A=half, B=g.get("FloorClearance")))
    _, index, done = g.loop(g.get("RevivePoints"))
    j = g.op("Percent_IntInt", A=g.op("Add_IntInt", A=start, B=index), B=count)
    facing = g.op("MakeRotator", Roll=0, Pitch=0, Yaw=g.get("ReviveYaw"))
    moved = g.pure("Actor:K2_TeleportTo", DestLocation=g.op("Add_VectorVector", A=g.item(g.get("RevivePoints"), j), B=up),
                   DestRotation=facing)
    g.branch(moved)
    g.run("MovementComponent:StopMovementImmediately", target=g.get("CharacterMovement", "/Script/Engine.Character"))
    g.run("Controller:SetControlRotation", target=g.pure("GameplayStatics:GetPlayerController", PlayerIndex=0), NewRotation=facing)
    g.set("LastRevive", j)
    g.set("Revives", g.op("Add_IntInt", A=g.get("Revives"), B=1))
    g.ret(Revived=True)
    g.fork(done, 700).ret(Revived=False)

    # Die(): the death's blackout starts (src/fall.js hurt with fatal); no walking or looking until the wake. Rest ends
    # first (main.js goToStart stands you up). Also the hook for #2293's other deaths.
    g, _ = function(char, "Die")
    g.branch(g.op("Less_DoubleDouble", A=g.get("BlackoutT"), B=0))
    g.set("BlackoutT", 0.0)
    g.set("BlackoutAlpha", 0.0)
    g.run("Actor:DisableInput", PlayerController=g.pure("GameplayStatics:GetPlayerController", PlayerIndex=0))
    rest = component_of(g, rest_path)
    g.run(class_path(rest_path) + ":StandUp", target=rest)

    # UpdateBlackout(DeltaSeconds): src/fall.js paint and wake, as a manual camera fade
    g, p = function(char, "UpdateBlackout", [("DeltaSeconds", REAL)], [])
    g.branch(g.op("GreaterEqual_DoubleDouble", A=g.get("BlackoutT"), B=0))
    g.set("BlackoutBefore", g.get("BlackoutT"))  # stored: a pure Get would read the new value after the Set below
    before = g.get("BlackoutBefore")
    g.set("BlackoutT", g.op("Add_DoubleDouble", A=before, B=p["DeltaSeconds"]))
    t = g.get("BlackoutT")
    red, black, hold, back = (g.get(n) for n in ("FallRed", "FallBlack", "FallHold", "FallBack"))
    out_t = g.op("Add_DoubleDouble", A=g.op("Add_DoubleDouble", A=red, B=black), B=hold)
    k = g.op("FClamp", Value=g.op("Divide_DoubleDouble", A=g.op("Subtract_DoubleDouble", A=t, B=red), B=black), Min=0, Max=1)
    a_red = g.op("Divide_DoubleDouble", A=g.op("Multiply_DoubleDouble", A=g.get("RedAlpha"), B=t), B=red)
    a_dark = g.op("Add_DoubleDouble", A=g.get("RedAlpha"),
                  B=g.op("Multiply_DoubleDouble", A=g.op("Subtract_DoubleDouble", A=1, B=g.get("RedAlpha")), B=k))
    a_back = g.op("FMax", A=0, B=g.op("Subtract_DoubleDouble", A=1, B=g.op("Divide_DoubleDouble", A=g.op("Subtract_DoubleDouble", A=t, B=out_t), B=back)))
    alpha = g.op("SelectFloat", A=a_red, bPickA=g.op("Less_DoubleDouble", A=t, B=red),
                 B=g.op("SelectFloat", A=a_dark, B=a_back, bPickA=g.op("Less_DoubleDouble", A=t, B=out_t)))
    g.set("BlackoutAlpha", alpha)
    g.set("BlackoutRed", g.op("Subtract_DoubleDouble", A=1, B=k))
    colour = g.op("MakeColor", R=g.op("Multiply_DoubleDouble", A=g.get("RedLinear"), B=g.get("BlackoutRed")), G=0, B=0, A=1)
    camera = g.pure("GameplayStatics:GetPlayerCameraManager", PlayerIndex=0)
    g.run("PlayerCameraManager:SetManualCameraFade", target=camera, InFadeAmount=g.get("BlackoutAlpha"), Color=colour,
          bInFadeAudio=False)
    woke = g.op("BooleanAND", A=g.op("Less_DoubleDouble", A=before, B=out_t), B=g.op("GreaterEqual_DoubleDouble", A=t, B=out_t))
    later = g.branch(woke)
    g.run(me + ":Revive")
    g.run("Actor:EnableInput", PlayerController=g.pure("GameplayStatics:GetPlayerController", PlayerIndex=0))
    h = g.fork(later, 900)
    h.branch(h.op("GreaterEqual_DoubleDouble", A=h.get("BlackoutT"), B=h.op("Add_DoubleDouble", A=out_t, B=back)))
    h.set("BlackoutT", -1.0)
    h.run("PlayerCameraManager:StopCameraFade", target=camera)
    BP.compile_blueprint(char)  # the event graph calls these by class path
