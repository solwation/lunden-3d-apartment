"""#2295: the season rule, /Game/Lunden/Seasons/BPC_LundenSeasons, built headless from this script.

The web shows the Christmas tree only from XMAS_TREE.season.from to .to, inclusive and across the new year
(src/christmas.js inChristmas, 1 Dec - 6 Jan). The export marks such pieces with `extras.seasonal`, and
import_world.py turns that into actor tags on the piece and all its parts:

    seasonal, season:<what>, seasonFrom:<month * 100 + day>, seasonTo:<month * 100 + day>
    and, for an item that also keeps clock hours (#2406, the patio beers): seasonHourFrom:<h>, seasonHourTo:<h>

BPC_LundenSeasons is an ActorComponent that BP_LundenPlayerController carries through
tools/unreal-engine/player-extensions.json. It holds the rule in one place for every seasonal item:

- InSeason(Year, Month, Day, From, To) -> InSeason: key = Month * 100 + min(Day, DaysInMonth(Year, Month)); inside
  when From <= key <= To, or, for a window that wraps the new year (From > To), when key >= From or key <= To.
  The same comparison as src/christmas.js inChristmas, with the window from the actor instead of src/config.js.
- InHours(Hour, From, To) -> InHours (#2406): From <= Hour < To, or, for hours that wrap midnight (From > To), Hour >= From
  or Hour < To. The web's src/patio.js beersOut compares its decimal clock hour with whole-hour edges, so the whole hour
  gives the same answer.
- TagValue(Actor, Prefix) -> Value, Found: the integer after `Prefix` in one of the actor's tags.
- ApplySeason(Year, Month, Day): publishes Month to MPC_LundenVegetation for crowns and lawns. Every actor tagged
  `seasonal` whose window tags it can read is shown with collision inside its window and hidden without collision outside
  it; an actor that also has hour tags is shown only when the variable Hour is inside them as well. Also the test hook:
  tests call it with a fixed date. It stops the clock (ClockDriven false), so a fixed date stays.
- ApplySeasonAt(Year, Month, Day, Hour): sets Hour, then ApplySeason (the test hook for the hour window).
- ApplyClock(): ApplySeasonAt with the PC's local date and hour (Now), then ClockDriven = true.
- ClockTick(): ApplyClock while ClockDriven, on a CLOCK_SECONDS looping timer, so hour windows follow the PC's clock as
  the web's follow its day clock.
- BeginPlay: ApplyClock with the PC's local date, as the web does on a new visit, and starts the ClockTick timer.

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
FUNCTIONS = ("InSeason", "InHours", "TagValue", "ApplySeason", "ApplySeasonAt", "ApplyClock", "ClockTick")
VARIABLES = (("Hour", INT), ("ClockDriven", BOOL))  # #2406: the hour ApplySeason uses; whether the PC clock drives it
CLOCK_SECONDS = 60.0  # #2406: how often the PC clock is read again; an hour window turns at most this late


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

    def get(self, name, owner, x, y):
        return self.at(self.g.add_get_member_variable_node(name, owner), x, y)

    def set(self, name, owner, x, y):
        return self.at(self.g.add_set_member_variable_node(name, owner), x, y)


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


def window_answer(g, key, start, end, before_fn, x):
    """start <= key (before_fn) end, or for a window that wraps (start > end) key >= start or key (before_fn) end."""
    after = g.call("KismetMathLibrary:GreaterEqual_IntInt", x, 100)  # key >= from
    link(key, inp(after, "A"))
    link(start, inp(after, "B"))
    before = g.call("KismetMathLibrary:" + before_fn, x, 250)  # key <= to (dates) or key < to (hours)
    link(key, inp(before, "A"))
    link(end, inp(before, "B"))
    ordered = g.call("KismetMathLibrary:LessEqual_IntInt", x, 400)  # from <= to: no wrap
    link(start, inp(ordered, "A"))
    link(end, inp(ordered, "B"))
    both = g.call("KismetMathLibrary:BooleanAND", x + 250, 100)
    link(out(after, "ReturnValue"), inp(both, "A"))
    link(out(before, "ReturnValue"), inp(both, "B"))
    either = g.call("KismetMathLibrary:BooleanOR", x + 250, 250)
    link(out(after, "ReturnValue"), inp(either, "A"))
    link(out(before, "ReturnValue"), inp(either, "B"))
    wraps = g.call("KismetMathLibrary:Not_PreBool", x + 250, 400)
    link(out(ordered, "ReturnValue"), inp(wraps, "A"))
    wrapped = g.call("KismetMathLibrary:BooleanAND", x + 500, 300)  # wrapping window: after or before
    link(out(wraps, "ReturnValue"), inp(wrapped, "A"))
    link(out(either, "ReturnValue"), inp(wrapped, "B"))
    # ordered: after AND before; wrapping: (after AND before) OR after OR before = after OR before
    answer = g.call("KismetMathLibrary:BooleanOR", x + 750, 150)
    link(out(both, "ReturnValue"), inp(answer, "A"))
    link(out(wrapped, "ReturnValue"), inp(answer, "B"))
    return out(answer, "ReturnValue")


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
    answer = window_answer(g, out(key, "ReturnValue"), p["From"], p["To"], "LessEqual_IntInt", 1050)
    g.at(result, 2050, 0)
    link(answer, inp(result, "InSeason"))


def in_hours(bp):
    """#2406: From <= Hour < To, or across midnight (From > To) Hour >= From or Hour < To."""
    g, p, result = function(bp, "InHours", [(n, INT) for n in ("Hour", "From", "To")], [("InHours", BOOL)])
    link(g.g.find_graph_entry_pin(), inp(result, "execute"))
    answer = window_answer(g, p["Hour"], p["From"], p["To"], "Less_IntInt", 300)
    g.at(result, 1300, 0)
    link(answer, inp(result, "InHours"))


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
    stop = g.set("ClockDriven", cls, -250, 0)  # a date from outside (a test) stays until ApplyClock runs again
    value(stop, "ClockDriven", "false")
    find = g.call("GameplayStatics:GetAllActorsWithTag", 250, 0)
    value(find, "Tag", SEASON_TAG)
    publish = g.call("KismetMaterialLibrary:SetScalarParameterValue", 0, -240)
    value(publish, "Collection", calendar.get_path_name())
    value(publish, "ParameterName", "Month")
    real_month = g.call("KismetMathLibrary:Conv_IntToDouble", -250, -380)
    link(p["Month"], inp(real_month, "InInt"))
    link(out(real_month, "ReturnValue"), inp(publish, "ParameterValue"))
    link(g.g.find_graph_entry_pin(), inp(stop, "execute"))
    link(out(stop, "then"), inp(publish, "execute"))
    link(out(publish, "then"), inp(find, "execute"))
    each = g.loop(550, 0)
    link(out(find, "then"), inp(each, "Exec"))
    link(out(find, "OutActors"), inp(each, "Array"))
    window = []
    previous = out(each, "LoopBody")
    for index, prefix in enumerate(("seasonFrom:", "seasonTo:", "seasonHourFrom:", "seasonHourTo:")):
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
    hours = g.call(cls + ":InHours", 1950, 0)  # #2406: an actor with hour tags keeps them as well
    link(out(rule, "then"), inp(hours, "execute"))
    link(out(g.get("Hour", cls, 1700, 500), "Hour"), inp(hours, "Hour"))
    link(out(window[2], "Value"), inp(hours, "From"))
    link(out(window[3], "Value"), inp(hours, "To"))
    timed = g.call("KismetMathLibrary:BooleanAND", 1950, 400)
    link(out(window[2], "Found"), inp(timed, "A"))
    link(out(window[3], "Found"), inp(timed, "B"))
    any_hour = g.call("KismetMathLibrary:Not_PreBool", 2200, 400)
    link(out(timed, "ReturnValue"), inp(any_hour, "A"))
    hour_ok = g.call("KismetMathLibrary:BooleanOR", 2450, 300)
    link(out(any_hour, "ReturnValue"), inp(hour_ok, "A"))
    link(out(hours, "InHours"), inp(hour_ok, "B"))
    shown = g.call("KismetMathLibrary:BooleanAND", 2700, 250)
    link(out(rule, "InSeason"), inp(shown, "A"))
    link(out(hour_ok, "ReturnValue"), inp(shown, "B"))
    hidden = g.call("KismetMathLibrary:Not_PreBool", 2950, 250)
    link(out(shown, "ReturnValue"), inp(hidden, "A"))
    hide = g.call("Actor:SetActorHiddenInGame", 3150, 0)
    link(out(hours, "then"), inp(hide, "execute"))
    link(out(each, "Array Element"), inp(hide, "self"))
    link(out(hidden, "ReturnValue"), inp(hide, "bNewHidden"))
    solid = g.call("Actor:SetActorEnableCollision", 3450, 0)
    link(out(hide, "then"), inp(solid, "execute"))
    link(out(each, "Array Element"), inp(solid, "self"))
    link(out(shown, "ReturnValue"), inp(solid, "bNewActorEnableCollision"))


def apply_season_at(bp):
    """#2406: ApplySeason with an hour for the hour windows (the test hook)."""
    g, p, _ = function(bp, "ApplySeasonAt", [(n, INT) for n in ("Year", "Month", "Day", "Hour")], [])
    cls = bp.generated_class().get_path_name()
    hour = g.set("Hour", cls, 250, 0)
    link(g.g.find_graph_entry_pin(), inp(hour, "execute"))
    link(p["Hour"], inp(hour, "Hour"))
    apply = g.call(cls + ":ApplySeason", 550, 0)
    link(out(hour, "then"), inp(apply, "execute"))
    for name in ("Year", "Month", "Day"):
        link(p[name], inp(apply, name))


def apply_clock(bp):
    """ApplySeasonAt with the PC's local date and hour, then the clock keeps driving it (ClockTick)."""
    g, _, _ = function(bp, "ApplyClock", [], [])
    cls = bp.generated_class().get_path_name()
    now = g.call("KismetMathLibrary:Now", 250, 150)  # the PC's local date and time
    date = g.call("KismetMathLibrary:BreakDateTime", 500, 150)
    link(out(now, "ReturnValue"), inp(date, "InDateTime"))
    apply = g.call(cls + ":ApplySeasonAt", 800, 0)
    link(g.g.find_graph_entry_pin(), inp(apply, "execute"))
    for name in ("Year", "Month", "Day", "Hour"):
        link(out(date, name), inp(apply, name))
    driven = g.set("ClockDriven", cls, 1100, 0)
    link(out(apply, "then"), inp(driven, "execute"))
    value(driven, "ClockDriven", "true")


def clock_tick(bp):
    g, _, _ = function(bp, "ClockTick", [], [])
    cls = bp.generated_class().get_path_name()
    driven = g.branch(300, 0)
    link(g.g.find_graph_entry_pin(), inp(driven, "execute"))
    link(out(g.get("ClockDriven", cls, 100, 200), "ClockDriven"), inp(driven, "Condition"))
    apply = g.call(cls + ":ApplyClock", 600, 0)
    link(out(driven, "then"), inp(apply, "execute"))


def event_graph(bp):
    g = Graph(GRAPH.get_graph_editor_by_name(bp, "EventGraph"))
    g.g.remove_nodes(list(g.g.list_all_nodes()))
    start = g.g.create_node_from_name("AddEvent|EventBeginPlay", u.Vector2D(0, 0), []) \
        or BP.add_event_override(bp, "ReceiveBeginPlay", u.IntPoint(0, 0))
    g.at(start, 0, 0)
    apply = g.call(bp.generated_class().get_path_name() + ":ApplyClock", 300, 0)
    link(out(start, "then"), inp(apply, "execute"))
    every = g.call("KismetSystemLibrary:K2_SetTimer", 600, 0)  # #2406: hour windows follow the PC's clock
    link(out(apply, "then"), inp(every, "execute"))
    value(every, "FunctionName", "ClockTick")
    value(every, "Time", CLOCK_SECONDS)
    value(every, "bLooping", "true")


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
    have = {str(n) for n in BP.list_member_variable_names(bp)}
    for name, kind in VARIABLES:
        if name not in have and not BP.add_member_variable(bp, name, kind):
            raise RuntimeError("Could not add the variable " + name)
        BP.set_blueprint_variable_instance_editable(bp, name, True)  # editor Python (tests) reads them
    BP.compile_blueprint(bp)
    in_season(bp)
    in_hours(bp)
    tag_value(bp)
    BP.compile_blueprint(bp)  # ApplySeason calls the functions above by class path
    apply_season(bp, calendar)
    BP.compile_blueprint(bp)
    apply_season_at(bp)
    BP.compile_blueprint(bp)
    apply_clock(bp)
    BP.compile_blueprint(bp)
    clock_tick(bp)
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
