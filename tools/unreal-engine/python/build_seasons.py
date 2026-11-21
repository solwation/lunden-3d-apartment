"""#2295: the season rule, /Game/Lunden/Seasons/BPC_LundenSeasons, built headless from this script.

The web shows the Christmas tree only from XMAS_TREE.season.from to .to, inclusive and across the new year
(src/christmas.js inChristmas, 1 Dec - 6 Jan). The export marks such pieces with `extras.seasonal`, and
import_world.py turns that into actor tags on the piece and all its parts:

    seasonal, season:<what>, seasonFrom:<month * 100 + day>, seasonTo:<month * 100 + day>

BPC_LundenSeasons is an ActorComponent that BP_LundenPlayerController carries through
tools/unreal-engine/player-extensions.json. It holds the rule in one place for every seasonal item:

- InSeason(Year, Month, Day, From, To) -> InSeason: key = Month * 100 + min(Day, DaysInMonth(Year, Month)); inside
  when From <= key <= To, or, for a window that wraps the new year (From > To), when key >= From or key <= To.
  The same comparison as src/christmas.js inChristmas, with the window from the actor instead of src/config.js.
- TagValue(Actor, Prefix) -> Value, Found: the integer after `Prefix` in one of the actor's tags.
- ApplySeason(Year, Month, Day): publishes Month to MPC_LundenVegetation for crowns and lawns. Every actor tagged `seasonal` whose window tags it can read is shown with collision
  inside its window and hidden without collision outside it. Also the test hook: tests call it with a fixed date.
- BeginPlay: ApplySeason with the PC's local date (Now), once, at game start, as the web does on a new visit.

Run (Windows checkout; lock Seasons/BPC_LundenSeasons.uasset and Seasons/MPC_LundenVegetation.uasset first):
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/run-python.ps1 tools/unreal-engine/python/build_seasons.py [--force | --check]
A run whose script is unchanged (metadata Lunden.SpecHash) saves nothing; --check fails when the asset is missing or
was built by another version of this script. Logs LUNDEN_SEASONS_OK.
"""
import hashlib
from pathlib import Path
import sys

import unreal as u

DIR = "/Game/Lunden/Seasons"
COMPONENT = DIR + "/BPC_LundenSeasons"
VEGETATION = DIR + "/MPC_LundenVegetation"
SPEC_TAG = "Lunden.SpecHash"
FOR_EACH = "/Engine/EditorBlueprintResources/StandardMacros.StandardMacros:ForEachLoop"
SEASON_TAG = "seasonal"  # import_world.py season_tags

ASSETS = u.EditorAssetLibrary
BP = u.BlueprintEditorLibrary
GRAPH = u.BlueprintGraphEditor
INT = BP.get_basic_type_by_name("int")
BOOL = BP.get_basic_type_by_name("bool")
STRING = BP.get_basic_type_by_name("string")
FUNCTIONS = ("InSeason", "TagValue", "ApplySeason")


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


class Graph:
    def __init__(self, editor):
        self.g = editor
        self.x = 0

    def at(self, node, x, y):
        if not node:
            raise RuntimeError(f"Could not create a node at {x},{y}")
        BP.set_node_pos(node, u.IntPoint(x, y))
        return node

    def call(self, path, x, y):
        return self.at(self.g.add_call_function_node(path if path.startswith("/") else "/Script/Engine." + path), x, y)

    def loop(self, x, y):
        return self.at(self.g.add_macro_node(FOR_EACH), x, y)

    def branch(self, x, y):
        return self.at(self.g.add_branch_node(), x, y)


def function(bp, name, inputs, outputs):
    """A new function graph with typed parameters; returns (Graph, entry pins by name, result node)."""
    editor = GRAPH.create_and_edit_function_graph(bp, name)
    if not editor:
        raise RuntimeError("Could not create the function " + name)
    params = {}
    for pname, ptype in inputs:
        pin = editor.add_graph_input_parameter(pname, ptype)
        if not pin or not pin.is_valid():
            raise RuntimeError(f"Could not add the input {name}.{pname}")
        params[pname] = pin
    result = None
    for pname, ptype in outputs:
        result = editor.add_graph_output_parameter(pname, ptype)
        if not result:
            raise RuntimeError(f"Could not add the output {name}.{pname}")
    return Graph(editor), params, result


def in_season(bp):
    g, p, result = function(bp, "InSeason", [(n, INT) for n in ("Year", "Month", "Day", "From", "To")], [("InSeason", BOOL)])
    link(g.g.find_graph_entry_pin(), inp(result, "execute"))
    month100 = g.call("KismetMathLibrary:Multiply_IntInt", 300, 100)
    link(p["Month"], inp(month100, "A"))
    value(month100, "B", 100)
    days = g.call("KismetMathLibrary:DaysInMonth", 300, 250)
    link(p["Year"], inp(days, "Year"))
    link(p["Month"], inp(days, "Month"))
    day = g.call("KismetMathLibrary:Min", 550, 250)  # src/christmas.js: Math.min(date, daysIn(year, month))
    link(p["Day"], inp(day, "A"))
    link(out(days, "ReturnValue"), inp(day, "B"))
    key = g.call("KismetMathLibrary:Add_IntInt", 800, 150)
    link(out(month100, "ReturnValue"), inp(key, "A"))
    link(out(day, "ReturnValue"), inp(key, "B"))
    after = g.call("KismetMathLibrary:GreaterEqual_IntInt", 1050, 100)  # key >= from
    link(out(key, "ReturnValue"), inp(after, "A"))
    link(p["From"], inp(after, "B"))
    before = g.call("KismetMathLibrary:LessEqual_IntInt", 1050, 250)  # key <= to
    link(out(key, "ReturnValue"), inp(before, "A"))
    link(p["To"], inp(before, "B"))
    ordered = g.call("KismetMathLibrary:LessEqual_IntInt", 1050, 400)  # from <= to: no new-year wrap
    link(p["From"], inp(ordered, "A"))
    link(p["To"], inp(ordered, "B"))
    both = g.call("KismetMathLibrary:BooleanAND", 1300, 100)
    link(out(after, "ReturnValue"), inp(both, "A"))
    link(out(before, "ReturnValue"), inp(both, "B"))
    either = g.call("KismetMathLibrary:BooleanOR", 1300, 250)
    link(out(after, "ReturnValue"), inp(either, "A"))
    link(out(before, "ReturnValue"), inp(either, "B"))
    wraps = g.call("KismetMathLibrary:Not_PreBool", 1300, 400)
    link(out(ordered, "ReturnValue"), inp(wraps, "A"))
    wrapped = g.call("KismetMathLibrary:BooleanAND", 1550, 300)  # wrapping window: key >= from or key <= to
    link(out(wraps, "ReturnValue"), inp(wrapped, "A"))
    link(out(either, "ReturnValue"), inp(wrapped, "B"))
    # ordered: after AND before; wrapping: (after AND before) OR after OR before = after OR before
    answer = g.call("KismetMathLibrary:BooleanOR", 1800, 150)
    link(out(both, "ReturnValue"), inp(answer, "A"))
    link(out(wrapped, "ReturnValue"), inp(answer, "B"))
    g.at(result, 2050, 0)
    link(out(answer, "ReturnValue"), inp(result, "InSeason"))


def tag_value(bp):
    actor_type = BP.get_object_reference_type(u.Actor)
    g, p, result = function(bp, "TagValue", [("Actor", actor_type), ("Prefix", STRING)], [("Value", INT), ("Found", BOOL)])
    tags = g.at(g.g.add_get_member_variable_node("Tags", "/Script/Engine.Actor"), 200, 200)
    link(p["Actor"], inp(tags, "self"))
    each = g.loop(450, 0)
    link(g.g.find_graph_entry_pin(), inp(each, "Exec"))
    link(out(tags, "Tags"), inp(each, "Array"))
    text = g.call("KismetStringLibrary:Conv_NameToString", 750, 200)
    link(out(each, "Array Element"), inp(text, "InName"))
    starts = g.call("KismetStringLibrary:StartsWith", 1000, 200)
    link(out(text, "ReturnValue"), inp(starts, "SourceString"))
    link(p["Prefix"], inp(starts, "InPrefix"))
    hit = g.branch(1300, 0)
    link(out(each, "LoopBody"), inp(hit, "execute"))
    link(out(starts, "ReturnValue"), inp(hit, "Condition"))
    length = g.call("KismetStringLibrary:Len", 1000, 400)
    link(p["Prefix"], inp(length, "S"))
    rest = g.call("KismetStringLibrary:RightChop", 1300, 300)
    link(out(text, "ReturnValue"), inp(rest, "SourceString"))
    link(out(length, "ReturnValue"), inp(rest, "Count"))
    number = g.call("KismetStringLibrary:Conv_StringToInt", 1550, 300)
    link(out(rest, "ReturnValue"), inp(number, "InString"))
    g.at(result, 1800, 0)
    link(out(hit, "then"), inp(result, "execute"))
    link(out(number, "ReturnValue"), inp(result, "Value"))
    value(result, "Found", "true")
    none = g.at(g.g.add_return_node(), 1800, 400)
    link(out(each, "Completed"), inp(none, "execute"))
    value(none, "Value", 0)
    value(none, "Found", "false")


def vegetation_calendar(check):
    asset = ASSETS.load_asset(VEGETATION) if ASSETS.does_asset_exist(VEGETATION) else None
    if asset:
        # #2380: struct fields are read through get_editor_property on 5.8 (no .parameter_name attribute)
        names = [str(v.get_editor_property("parameter_name")) for v in asset.get_editor_property("scalar_parameters")]
        if "Month" not in names:
            raise RuntimeError(VEGETATION + " has no Month parameter")
        return asset
    if check:
        raise RuntimeError("Missing " + VEGETATION)
    asset = u.AssetToolsHelpers.get_asset_tools().create_asset("MPC_LundenVegetation", DIR,
        u.MaterialParameterCollection, u.MaterialParameterCollectionFactoryNew())
    month = u.CollectionScalarParameter()
    month.set_editor_property("parameter_name", "Month")
    month.set_editor_property("default_value", 6.0)  # the June export in an editor preview, before BeginPlay
    asset.set_editor_property("scalar_parameters", [month])
    if not ASSETS.save_loaded_asset(asset, only_if_is_dirty=False):
        raise RuntimeError("Could not save " + VEGETATION)
    return asset


def apply_season(bp, calendar):
    g, p, _ = function(bp, "ApplySeason", [(n, INT) for n in ("Year", "Month", "Day")], [])
    cls = bp.generated_class().get_path_name()
    find = g.call("GameplayStatics:GetAllActorsWithTag", 250, 0)
    value(find, "Tag", SEASON_TAG)
    publish = g.call("KismetMaterialLibrary:SetScalarParameterValue", 0, -240)
    value(publish, "Collection", calendar.get_path_name())
    value(publish, "ParameterName", "Month")
    real_month = g.call("KismetMathLibrary:Conv_IntToDouble", -250, -380)
    link(p["Month"], inp(real_month, "InInt"))
    link(out(real_month, "ReturnValue"), inp(publish, "ParameterValue"))
    link(g.g.find_graph_entry_pin(), inp(publish, "execute"))
    link(out(publish, "then"), inp(find, "execute"))
    each = g.loop(550, 0)
    link(out(find, "then"), inp(each, "Exec"))
    link(out(find, "OutActors"), inp(each, "Array"))
    window = []
    previous = out(each, "LoopBody")
    for index, prefix in enumerate(("seasonFrom:", "seasonTo:")):
        read = g.call(cls + ":TagValue", 850 + index * 300, 0)
        link(previous, inp(read, "execute"))
        link(out(each, "Array Element"), inp(read, "Actor"))
        value(read, "Prefix", prefix)
        window.append(read)
        previous = out(read, "then")
    known = g.call("KismetMathLibrary:BooleanAND", 1150, 300)
    link(out(window[0], "Found"), inp(known, "A"))
    link(out(window[1], "Found"), inp(known, "B"))
    readable = g.branch(1450, 0)  # an actor without a window is left as it is
    link(previous, inp(readable, "execute"))
    link(out(known, "ReturnValue"), inp(readable, "Condition"))
    rule = g.call(cls + ":InSeason", 1700, 0)
    link(out(readable, "then"), inp(rule, "execute"))
    for name in ("Year", "Month", "Day"):
        link(p[name], inp(rule, name))
    link(out(window[0], "Value"), inp(rule, "From"))
    link(out(window[1], "Value"), inp(rule, "To"))
    hidden = g.call("KismetMathLibrary:Not_PreBool", 1950, 250)
    link(out(rule, "InSeason"), inp(hidden, "A"))
    hide = g.call("Actor:SetActorHiddenInGame", 2150, 0)
    link(out(rule, "then"), inp(hide, "execute"))
    link(out(each, "Array Element"), inp(hide, "self"))
    link(out(hidden, "ReturnValue"), inp(hide, "bNewHidden"))
    solid = g.call("Actor:SetActorEnableCollision", 2450, 0)
    link(out(hide, "then"), inp(solid, "execute"))
    link(out(each, "Array Element"), inp(solid, "self"))
    link(out(rule, "InSeason"), inp(solid, "bNewActorEnableCollision"))


def event_graph(bp):
    g = Graph(GRAPH.get_graph_editor_by_name(bp, "EventGraph"))
    g.g.remove_nodes(list(g.g.list_all_nodes()))
    start = g.g.create_node_from_name("AddEvent|EventBeginPlay", u.Vector2D(0, 0), []) \
        or BP.add_event_override(bp, "ReceiveBeginPlay", u.IntPoint(0, 0))
    g.at(start, 0, 0)
    now = g.call("KismetMathLibrary:Now", 250, 150)  # the PC's local date and time
    date = g.call("KismetMathLibrary:BreakDateTime", 500, 150)
    link(out(now, "ReturnValue"), inp(date, "InDateTime"))
    apply = g.call(bp.generated_class().get_path_name() + ":ApplySeason", 800, 0)
    link(out(start, "then"), inp(apply, "execute"))
    for name in ("Year", "Month", "Day"):
        link(out(date, name), inp(apply, name))


def build(calendar):
    if ASSETS.does_asset_exist(COMPONENT):
        bp = ASSETS.load_asset(COMPONENT)
        events = GRAPH.get_graph_editor_by_name(bp, "EventGraph")
        events.remove_nodes(list(events.list_all_nodes()))  # its ApplySeason call goes before the function does
        for name in FUNCTIONS:
            graph = BP.find_graph(bp, name)
            if graph:
                BP.remove_function_graph(bp, name)
        BP.compile_blueprint(bp)  # drop the old functions from the class before graphs of the same name come back
        left = [str(n) for n in BP.list_graph_names(bp) if str(n) in FUNCTIONS]
        if left:
            raise RuntimeError(f"Could not remove the old functions {left} from {COMPONENT}")
    else:
        factory = u.BlueprintFactory()
        factory.set_editor_property("parent_class", u.ActorComponent)
        folder, name = COMPONENT.rsplit("/", 1)
        bp = u.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, u.Blueprint, factory)
        if not bp:
            raise RuntimeError("Could not create " + COMPONENT)
    in_season(bp)
    tag_value(bp)
    BP.compile_blueprint(bp)  # ApplySeason calls the two functions above by class path
    apply_season(bp, calendar)
    BP.compile_blueprint(bp)
    event_graph(bp)
    BP.compile_blueprint(bp)
    broken = [f"{name}: {n.get_name()}" for name in FUNCTIONS + ("EventGraph",)
              for n in GRAPH.get_graph_editor_by_name(bp, name).list_nodes_with_errors()]
    if broken:
        raise RuntimeError("BPC_LundenSeasons failed to compile: " + ", ".join(broken))
    return bp


def main(argv):
    spec = hashlib.sha256(Path(__file__).read_text(encoding="utf-8").encode()).hexdigest()  # line endings as build_player.py
    calendar = vegetation_calendar("--check" in argv)
    present = ASSETS.does_asset_exist(COMPONENT)
    stored = ASSETS.get_metadata_tag(ASSETS.load_asset(COMPONENT), SPEC_TAG) if present else ""
    if "--check" in argv:
        if stored != spec:
            raise RuntimeError(f"{COMPONENT} is not built by this script (stored {stored[:16]}, want {spec[:16]})")
        u.log(f"LUNDEN_SEASONS {COMPONENT}: check passed, spec {spec[:16]}")
    elif stored == spec and "--force" not in argv:
        u.log(f"LUNDEN_SEASONS {COMPONENT}: unchanged, nothing saved; spec {spec[:16]}")
    else:
        bp = build(calendar)
        ASSETS.set_metadata_tag(bp, SPEC_TAG, spec)
        if not ASSETS.save_loaded_asset(bp, only_if_is_dirty=False):
            raise RuntimeError(f"Could not save {COMPONENT} (is its .uasset locked with git lfs lock?)")
        u.log(f"LUNDEN_SEASONS {COMPONENT}: saved; spec {spec[:16]}")
    u.log("LUNDEN_SEASONS_OK")


main(sys.argv[1:])
