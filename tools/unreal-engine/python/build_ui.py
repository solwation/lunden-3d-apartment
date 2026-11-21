"""#2286: the start and pause menu, the settings, the compass and the frame-rate display, /Game/Lunden/UI/, built
headless from this script.

Web sources: index.html #overlay (start menu) and #settings-dialog, src/menusettings.js, src/qualitysetting.js
(QUALITY.names), src/compass.js (bearing = DAY.planNorth - yaw), src/fps.js (HUD_FPS.everyMs windows).

Assets (one owner, #2286):
  UI/BFL_LundenSettings  Function library: reads the settings from the #2288 save slot (BFL_LundenSave.GetSetting) and
                         applies them: ApplyGraphics (scalability level, resolution), ApplyMouse(Controller) (look
                         speed on BP_LundenPlayer, inverted pitch through IMC_LundenInvertY), ApplyVolumes (sound-mix
                         overrides from ui-extensions.json `volumes`); ReadNumber, ReadFlag, QualityName,
                         ResolutionAfter, BaseLookDegrees (the export's spawn.player.mouseSens in degrees).
  UI/WBP_LundenHud       Compass (top right) and frame rate (top left). Bearing = PlanNorth + 90 + control yaw: the
                         web's planNorth - yaw with the web yaw = -90 - Unreal yaw (tools/unreal-engine/coordinates.mjs).
                         PlanNorth is the export's site.planNorthDeg. Refresh() reads hud.fps.
  UI/WBP_LundenMenu      Start and pause menu (Spela / Fortsätt, name, Inställningar, extension buttons, Avsluta) and
                         the settings page (graphics level, resolution, frame rate, mouse speed, inverted mouse,
                         one slider per volume row). Open(Start) pauses the game and gives the menu the mouse and
                         keyboard; Close() saves the name and gives control back. Esc (OnKeyDown) goes back one step.
  UI/BPC_LundenUI        ActorComponent on BP_LundenPlayerController (player-extensions.json row UI): creates both
                         widgets, applies the saved settings, opens the start menu (not under automation, see
                         StartMenuWanted) and opens the pause menu on IA_LundenMenu (Esc).
  UI/SM_LundenVolumes    SoundMix that carries the volume overrides.
  UI/Input/IA_LundenMenu, IMC_LundenUI (Esc), IMC_LundenInvertY (MouseY -> #2284's IA_LundenLookY, negated, priority 1)

Settings keys in the save slot (strings, BFL_LundenSave.SetSetting writes at once):
  graphics.quality 0..4 (Lägsta, Låg, Medel, Hög, Ultra = Unreal scalability Low..Cinematic), graphics.resolution "WxH",
  hud.fps true/false (default true, the web always shows it), mouse.sensitivity (factor of the web's look speed,
  default 1), mouse.invertY true/false, and one key per ui-extensions.json `volumes` row (0..1, default 1).

Extension lists (tools/unreal-engine/ui-extensions.json, format owned by #2286): `menuButtons` rows add a button to the
main menu page that opens their widget class over the menu (#2291 appearance); `volumes` rows add a slider and, when the
row names a soundClass, a SoundMix override for it (#2287 audio). A changed list rebuilds the UI.

Run (Windows checkout; lock every UI/*.uasset that exists first: git lfs lock unreal/Lunden/Content/Lunden/UI/...):
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/run-python.ps1 tools/unreal-engine/python/build_ui.py [<measurements.json>] [--force | --check]
A run whose inputs (this script, ui-extensions.json, the export values) match UI/build-stamp.json (and Lunden.SpecHash on
BPC_LundenUI) saves nothing; --check fails when an asset is missing or was built from other inputs. A widget tree cannot
be cleared from Python and an asset deleted in a session cannot be created again in it, so a rebuild takes two runs: the
first removes the four Blueprint files and logs LUNDEN_UI_RUN_AGAIN, the second builds them from nothing. Input assets
and the sound mix are only created when missing; a run that creates IA_LundenMenu also ends with LUNDEN_UI_RUN_AGAIN,
because Unreal lists a new input action's event node only after an editor restart.
Logs LUNDEN_UI_OK.
"""
import hashlib
import json
import math
from pathlib import Path
import sys

import unreal as u

REPO = Path(__file__).resolve().parents[3]
DIR = "/Game/Lunden/UI"
INPUT = DIR + "/Input"
LIBRARY = DIR + "/BFL_LundenSettings"
HUD = DIR + "/WBP_LundenHud"
MENU = DIR + "/WBP_LundenMenu"
COMPONENT = DIR + "/BPC_LundenUI"
MIX = DIR + "/SM_LundenVolumes"
IA_MENU = INPUT + "/IA_LundenMenu"
IMC_UI = INPUT + "/IMC_LundenUI"
IMC_INVERT = INPUT + "/IMC_LundenInvertY"
LOOK_Y = "/Game/Lunden/Player/Input/IA_LundenLookY"
PLAYER = "/Game/Lunden/Player/BP_LundenPlayer"
SAVE_LIBRARY = "/Game/Lunden/Save/BFL_LundenSave"
SPEC_TAG = "Lunden.SpecHash"
BLUEPRINTS = (LIBRARY, HUD, MENU, COMPONENT)
STAMP = REPO / "unreal/Lunden/Content/Lunden/UI/build-stamp.json"  # the inputs' hash, readable without loading assets

QUALITY_NAMES = ["Lägsta", "Låg", "Medel", "Hög", "Ultra"]  # src/config.js QUALITY.names, index = Unreal scalability
FPS_EVERY = 0.5  # seconds per frame-rate window: src/config.js HUD_FPS.everyMs
SENSITIVITY = (0.25, 3.0, 0.05)  # mouse speed factor slider min, max, step (assumption: the web has no such setting)
INVERT_PRIORITY = 1  # above IMC_LundenPlayer (0): the higher context consumes MouseY for IA_LundenLookY
UI_PRIORITY = 2
WATCH_SECONDS = 0.25  # how often BPC_LundenUI checks for a new pawn to give the mouse settings to
SUPPRESS = ("-run=", "Automation RunTests", "-LundenNoStartMenu")  # command lines that get no start menu (see below)

# Colours of the web menu (index.html #overlay, #settings-dialog): dark text on a white card over rgba(20,35,45,.7)
INK = (0.012, 0.03, 0.045, 1.0)
CARD = (0.97, 0.97, 0.97, 1.0)
DIM = (0.007, 0.017, 0.026, 0.7)
BLUE = (0.039, 0.29, 0.79, 1.0)  # #3894e6 in linear colour
SOFT = (0.75, 0.8, 0.84, 1.0)
WHITE = (1.0, 1.0, 1.0, 1.0)
RED = (0.75, 0.05, 0.04, 1.0)

ASSETS = u.EditorAssetLibrary
BP = u.BlueprintEditorLibrary
GRAPH = u.BlueprintGraphEditor
WIDGETS = u.EditorUtilityLibrary
TOOLS = u.AssetToolsHelpers.get_asset_tools()
INT = BP.get_basic_type_by_name("int")
BOOL = BP.get_basic_type_by_name("bool")
REAL = BP.get_basic_type_by_name("real")
STRING = BP.get_basic_type_by_name("string")


def class_path(path):
    return f"{path}.{path.rsplit('/', 1)[1]}_C"


# Graph helpers (as build_save.py) ------------------------------------------------------------------------------------

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


def cast_out(node):
    found = [p for p in BP.list_output_pins(node) if str(p.get_pin_name()).startswith("As")]
    if len(found) != 1:
        raise RuntimeError(f"{node.get_name()}: no single As output in {pins(node, BP.list_output_pins)}")
    return found[0]


class Graph:
    """Places nodes left to right and chains exec pins: `step(node)` links the last exec output to the node."""

    def __init__(self, editor, entry=None):
        self.g = editor
        self.x = 250
        self.y = 0
        self.exec = entry  # the exec output the next step() continues from

    def at(self, node, x=None, y=None):
        if not node:
            raise RuntimeError("Could not create a node")
        if x is None:
            x, self.x = self.x, self.x + 300
        BP.set_node_pos(node, u.IntPoint(x, self.y + 220 if y is None else y))
        return node

    def call(self, path, *, x=None, y=None):
        full = path if path.startswith("/") else "/Script/Engine." + path
        node = self.g.add_call_function_node(full)
        if not node:
            raise RuntimeError("Could not create a call to " + full)
        return self.at(node, x, y)

    def named(self, name, *, x=None, y=None):
        return self.at(self.g.create_node_from_name(name, u.Vector2D(0, 0), []), x, y)

    def get(self, name, owner=None):
        node = self.g.add_get_member_variable_node(name, owner) if owner else self.g.add_get_member_variable_node(name)
        return out(self.at(node), name)

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
        """An exec call in the chain with inputs (a pin or a literal each)."""
        node = self.call(path)
        self.step(node)
        if target is not None:
            link(target, inp(node, "self"))
        feed_all(node, args)
        return node

    def pure(self, path, target=None, result="ReturnValue", **args):
        """A call used for its value; an impure one (with an exec input) is stepped into the chain right here."""
        node = self.call(path)
        if "execute" in pins(node, BP.list_input_pins):
            self.step(node)
        if target is not None:
            link(target, inp(node, "self"))
        feed_all(node, args)
        return out(node, result)

    def cast(self, start_name, native, cls=None):
        """An exec Cast To node: `start_name` is the native cast ("CastToCharacter"), retargeted to `cls` if given."""
        node = self.g.create_node_from_name("Utilities|Casting|" + start_name, u.Vector2D(0, 0), [])
        if not node:
            raise RuntimeError("Could not create " + start_name)
        if cls is not None and not self.g.retarget_node_class(node, native, cls):
            raise RuntimeError(f"Could not retarget {start_name} to {cls.get_name()}")
        return node

    def branch(self, condition):
        """A Branch in the chain; continues on True and returns the False exec output."""
        node = self.g.add_branch_node()
        self.step(node)
        feed(node, "Condition", condition)
        return out(node, "else")

    def ret(self, result, **values):
        self.step(result, exec_out=None)
        for name, source in values.items():
            feed(result, name, source)


def either(node, names, find):
    for name in names:
        pin = find(node, name)
        if pin.is_valid():
            return pin
    raise RuntimeError(f"{node.get_name()} has none of the pins {names}: in {pins(node, BP.list_input_pins)}, "
                       f"out {pins(node, BP.list_output_pins)}")


def feed_all(node, args):
    """Links first, literals after: a promotable operator (Add, Subtract ...) types its pins from the links."""
    for name, source in sorted(args.items(), key=lambda item: not isinstance(item[1], u.BlueprintGraphPin)):
        feed(node, name, source)


def feed(node, name, source):
    if isinstance(source, u.BlueprintGraphPin):
        link(source, inp(node, name))
    elif isinstance(source, bool):
        value(node, name, "true" if source else "false")
    else:
        value(node, name, source)


def function(bp, name, inputs=(), outputs=(), pure=False):
    """A new function graph; returns (Graph chained from the entry, entry pins by name, result node or None).
    Compiles first, so the functions made so far can be called from the new one."""
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
    result = None
    for pname, ptype in outputs:
        result = editor.add_graph_output_parameter(pname, ptype)
        if not result:
            raise RuntimeError(f"Could not add the output {name}.{pname}")
    if pure:
        editor.set_is_pure_function(True)
    return Graph(editor, editor.find_graph_entry_pin()), params, result


def events(bp):
    BP.compile_blueprint(bp)
    return Graph(GRAPH.get_graph_editor_by_name(bp, "EventGraph"))


def event(g, bp, name, override, y):
    node = g.g.create_node_from_name(name, u.Vector2D(0, y), []) or BP.add_event_override(bp, override, u.IntPoint(0, y))
    if not node:
        raise RuntimeError("Could not create the event " + name)
    BP.set_node_pos(node, u.IntPoint(0, y))
    g.x, g.y, g.exec = 300, y, out(node, "then")
    return node


def text(g, source):
    """A Text pin from a string pin or literal."""
    return g.pure("KismetTextLibrary:Conv_StringToText", InString=source)


def concat(g, *parts):
    joined = parts[0]
    for part in parts[1:]:
        joined = g.pure("KismetStringLibrary:Concat_StrStr", A=joined, B=part)
    return joined


def number_text(g, source, digits):
    """A real as a string with `digits` decimals in the player's culture (Swedish: a decimal comma)."""
    t = g.pure("KismetTextLibrary:Conv_DoubleToText", Value=source, RoundingMode="HalfToEven", bAlwaysSign=False,
               bUseGrouping=False, MinimumIntegralDigits=1, MaximumIntegralDigits=324,
               MinimumFractionalDigits=digits, MaximumFractionalDigits=digits)
    return g.pure("KismetTextLibrary:Conv_TextToString", InText=t)


def select_string(g, condition, yes, no):
    return g.pure("KismetMathLibrary:SelectString", A=yes, B=no, bPickA=condition)


def compiled(bp):
    BP.compile_blueprint(bp)
    broken = []
    for name in BP.list_graph_names(bp):
        editor = GRAPH.get_graph_editor_by_name(bp, str(name))
        if editor:
            broken += [f"{name}: {n.get_name()} ({BP.get_node_title(n)})" for n in editor.list_nodes_with_errors()]
    if broken:
        raise RuntimeError(f"{bp.get_name()} failed to compile: " + ", ".join(broken))


def save(asset):
    if not ASSETS.save_loaded_asset(asset, only_if_is_dirty=False):
        raise RuntimeError(f"Could not save {asset.get_path_name()} (is its .uasset locked with git lfs lock?)")


def create(path, kind, factory):
    folder, name = path.rsplit("/", 1)
    asset = TOOLS.create_asset(name, folder, kind, factory)
    if not asset:
        raise RuntimeError("Could not create " + path)
    return asset


def blueprint(path, parent):
    factory = u.BlueprintFactory()
    factory.set_editor_property("parent_class", parent)
    return create(path, u.Blueprint, factory)


def widget_blueprint(path):
    factory = u.WidgetBlueprintFactory()
    factory.set_editor_property("parent_class", u.UserWidget)
    return create(path, u.WidgetBlueprint, factory)


def variables(bp, spec):
    for name, kind in spec.items():
        if not BP.add_member_variable(bp, name, kind):
            raise RuntimeError(f"Could not add the variable {bp.get_name()}.{name}")
    BP.compile_blueprint(bp)


def linear(rgba):
    return u.LinearColor(*rgba)


def slate(rgba):
    color = u.SlateColor()
    color.set_editor_property("specified_color", linear(rgba))
    return color


# Inputs and data ------------------------------------------------------------------------------------------------------

def load_extensions(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("formatVersion") != 1:
        raise RuntimeError(f"{path}: formatVersion {data.get('formatVersion')} is not 1")
    names = set()
    for row in data["menuButtons"]:
        missing = {"name", "label", "widget", "owner", "what"} - row.keys()
        if missing or not row["name"].isidentifier() or row["name"] in names:
            raise RuntimeError(f"{path}: bad menuButtons row {row} (missing {sorted(missing)}, or a repeated/invalid name)")
        names.add(row["name"])
    keys = set()
    for row in data["volumes"]:
        missing = {"key", "label", "soundClass", "owner", "what"} - row.keys()
        if missing or row["key"] in keys:
            raise RuntimeError(f"{path}: bad volumes row {row} (missing {sorted(missing)} or a repeated key)")
        keys.add(row["key"])
    return data


def export_values(measurements):
    site, player = measurements["site"], measurements["spawn"]["player"]
    if site.get("planNorthDeg") is None or player.get("mouseSens") is None:
        raise RuntimeError("measurements.json lacks site.planNorthDeg or spawn.player.mouseSens: re-export")
    return {"planNorth": float(site["planNorthDeg"]), "lookDegrees": math.degrees(player["mouseSens"])}


def key(name):
    k = u.Key()
    k.import_text(name)
    if k.export_text() != name:
        raise RuntimeError(f"Unreal did not recognize the key {name}")
    return k


def input_assets():
    """IA_LundenMenu (Esc, also while paused), IMC_LundenUI and IMC_LundenInvertY; created only when missing.
    Returns True when an input action was created in this run (its event node needs a fresh editor)."""
    created = False
    if not ASSETS.does_asset_exist(IA_MENU):
        action = create(IA_MENU, u.InputAction, u.InputAction_Factory())
        action.set_editor_property("value_type", u.InputActionValueType.BOOLEAN)
        action.set_editor_property("trigger_when_paused", True)
        save(action)
        created = True
    action = ASSETS.load_asset(IA_MENU)
    if not ASSETS.does_asset_exist(IMC_UI):
        mapping = create(IMC_UI, u.InputMappingContext, u.InputMappingContext_Factory())
        mapping.map_key(action, key("Escape"))
        save(mapping)
    if not ASSETS.does_asset_exist(IMC_INVERT):
        look_y = ASSETS.load_asset(LOOK_Y)
        if not look_y:
            raise RuntimeError(f"{LOOK_Y} is missing: build the player first (build_player.py)")
        mapping = create(IMC_INVERT, u.InputMappingContext, u.InputMappingContext_Factory())
        mapping.map_key(look_y, key("MouseY"))
        holder = mapping.get_editor_property("default_key_mappings")  # 5.8: the mappings live in this struct
        rows = holder.get_editor_property("mappings")
        row = rows[0]
        row.set_editor_property("modifiers", [u.new_object(u.InputModifierNegate, outer=mapping)])
        rows[0] = row
        holder.set_editor_property("mappings", rows)
        mapping.set_editor_property("default_key_mappings", holder)
        stored = mapping.get_editor_property("default_key_mappings").get_editor_property("mappings")[0]
        if len(stored.get_editor_property("modifiers")) != 1:
            raise RuntimeError("Could not give IMC_LundenInvertY its Negate modifier")
        save(mapping)
    if not ASSETS.does_asset_exist(MIX):
        save(create(MIX, u.SoundMix, u.SoundMixFactory()))
    return created


# BFL_LundenSettings -----------------------------------------------------------------------------------------------------

def library(values, extensions):
    bp = create(LIBRARY, u.Blueprint, u.BlueprintFunctionLibraryFactory())
    lib = class_path(LIBRARY)
    save_lib = class_path(SAVE_LIBRARY)
    player = u.load_class(None, class_path(PLAYER))
    if not player:
        raise RuntimeError(f"{PLAYER} is missing: build the player first (build_player.py)")
    pc_ref = BP.get_object_reference_type(u.PlayerController.static_class())
    point = BP.get_struct_type(u.IntPoint.static_struct())

    g, _, result = function(bp, "BaseLookDegrees", outputs=[("Degrees", REAL)], pure=True)
    g.ret(result, Degrees=repr(values["lookDegrees"]))

    g, p, result = function(bp, "ReadNumber", [("Key", STRING), ("Default", REAL)], [("Value", REAL)], pure=True)
    fallback = g.pure("KismetStringLibrary:Conv_DoubleToString", InDouble=p["Default"])
    read = g.call(save_lib + ":GetSetting")
    g.step(read)
    feed(read, "Key", p["Key"])
    feed(read, "Default", fallback)
    g.ret(result, Value=g.pure("KismetStringLibrary:Conv_StringToDouble", InString=out(read, "Value")))

    g, p, result = function(bp, "ReadFlag", [("Key", STRING), ("Default", BOOL)], [("Value", BOOL)], pure=True)
    read = g.call(save_lib + ":GetSetting")
    g.step(read)
    feed(read, "Key", p["Key"])
    feed(read, "Default", select_string(g, p["Default"], "true", "false"))
    g.ret(result, Value=g.pure("KismetStringLibrary:EqualEqual_StrStr", A=out(read, "Value"), B="true"))

    g, p, result = function(bp, "QualityName", [("Level", INT)], [("Name", STRING)], pure=True)
    name = "?"
    for level, label in enumerate(QUALITY_NAMES):
        same = g.pure("KismetMathLibrary:EqualEqual_IntInt", A=p["Level"], B=level)
        name = select_string(g, same, label, name)
    g.ret(result, Name=name)

    g, p, result = function(bp, "ResolutionText", [("Resolution", point)], [("Text", STRING)], pure=True)
    split = g.named("Utilities|Struct|BreakIntPoint")
    link(p["Resolution"], either(split, ("IntPoint", "InIntPoint"), BP.find_input_pin))
    width = g.pure("KismetStringLibrary:Conv_IntToString", InInt=out(split, "X"))
    height = g.pure("KismetStringLibrary:Conv_IntToString", InInt=out(split, "Y"))
    g.ret(result, Text=concat(g, width, "x", height))

    # ResolutionAfter(Current) -> Next: the next of the monitor's full-screen modes (or, without any, the convenient
    # window sizes) after the current one, wrapping round; the current one when the list is empty.
    g, p, result = function(bp, "ResolutionAfter", [("Current", point)], [("Next", point)])
    full = g.run("KismetSystemLibrary:GetSupportedFullscreenResolutions")
    window = g.run("KismetSystemLibrary:GetConvenientWindowedResolutions")
    count_full = g.pure("KismetArrayLibrary:Array_Length", TargetArray=out(full, "Resolutions"))
    use_full = g.pure("KismetMathLibrary:Greater_IntInt", A=count_full, B=0)
    empty_window = g.pure("KismetMathLibrary:EqualEqual_IntInt",
                          A=g.pure("KismetArrayLibrary:Array_Length", TargetArray=out(window, "Resolutions")), B=0)
    nothing = g.pure("KismetMathLibrary:BooleanAND", A=g.pure("KismetMathLibrary:Not_PreBool", A=use_full), B=empty_window)
    keep = g.branch(g.pure("KismetMathLibrary:Not_PreBool", A=nothing))
    same = g.g.add_return_node()
    g.at(same, 1200, 500)
    link(keep, inp(same, "execute"))
    feed(same, "Next", p["Current"])
    which = g.branch(use_full)
    for idx, (source, exec_pin) in enumerate(((out(full, "Resolutions"), g.exec), (out(window, "Resolutions"), which))):
        h = Graph(g.g, exec_pin)
        h.x, h.y = 2000, idx * 700
        found = h.pure("KismetArrayLibrary:Array_Find", TargetArray=source, ItemToFind=p["Current"])
        length = h.pure("KismetArrayLibrary:Array_Length", TargetArray=source)
        nxt = h.pure("KismetMathLibrary:Percent_IntInt", A=h.pure("KismetMathLibrary:Add_IntInt", A=found, B=1), B=length)
        get = h.call("KismetArrayLibrary:Array_Get")
        feed(get, "TargetArray", source)
        feed(get, "Index", nxt)
        done = h.g.add_return_node()
        h.ret(done, Next=out(get, "Item"))

    # ApplyGraphics(): the saved scalability level (else the current one) and the saved resolution, applied at once
    g, _, _ = function(bp, "ApplyGraphics")
    gus = g.pure("GameUserSettings:GetGameUserSettings")
    current = g.pure("GameUserSettings:GetOverallScalabilityLevel", target=gus)
    level = g.call(lib + ":ReadNumber")
    feed(level, "Key", "graphics.quality")
    feed(level, "Default", g.pure("KismetMathLibrary:Conv_IntToDouble", InInt=current))
    clamped = g.pure("KismetMathLibrary:Clamp", Value=g.pure("KismetMathLibrary:Round", A=out(level, "Value")), Min=0,
                     Max=len(QUALITY_NAMES) - 1)
    g.run("GameUserSettings:SetOverallScalabilityLevel", target=gus, Value=clamped)
    stored = g.call(save_lib + ":GetSetting")
    g.step(stored)
    feed(stored, "Key", "graphics.resolution")
    feed(stored, "Default", "")
    split = g.call("KismetStringLibrary:Split")
    feed(split, "SourceString", out(stored, "Value"))
    feed(split, "InStr", "x")
    width = g.pure("KismetStringLibrary:Conv_StringToInt", InString=out(split, "LeftS"))
    height = g.pure("KismetStringLibrary:Conv_StringToInt", InString=out(split, "RightS"))
    sane = g.pure("KismetMathLibrary:BooleanAND", A=out(split, "ReturnValue"),
                  B=g.pure("KismetMathLibrary:BooleanAND", A=g.pure("KismetMathLibrary:Greater_IntInt", A=width, B=0),
                           B=g.pure("KismetMathLibrary:Greater_IntInt", A=height, B=0)))
    no_resolution = g.branch(sane)
    make = g.named("Utilities|Struct|MakeIntPoint")
    feed(make, "X", width)
    feed(make, "Y", height)
    g.run("GameUserSettings:SetScreenResolution", target=gus, Resolution=either(make, ("IntPoint", "ReturnValue"), BP.find_output_pin))
    g.run("GameUserSettings:ApplySettings", target=gus, bCheckForCommandLineOverrides=False)
    skip = Graph(g.g, no_resolution)
    skip.x, skip.y = g.x - 300, 500
    skip.run("GameUserSettings:ApplySettings", target=gus, bCheckForCommandLineOverrides=False)

    # ApplyMouse(Controller) -> Applied: look speed = BaseLookDegrees x mouse.sensitivity on the possessed
    # BP_LundenPlayer (whose graph turns by LookDegrees per mouse count), and the inverted-pitch context
    g, p, result = function(bp, "ApplyMouse", [("Controller", pc_ref)], [("Applied", BOOL)])
    subsystem = g.named("PlayerController|LocalPlayerSubsystems|GetEnhancedInputLocalPlayerSubsystem")
    link(p["Controller"], inp(subsystem, "PlayerController"))
    has_input = g.pure("KismetSystemLibrary:IsValid", Object=out(subsystem, "ReturnValue"))
    no_input = g.branch(has_input)
    invert = g.call(lib + ":ReadFlag")
    feed(invert, "Key", "mouse.invertY")
    feed(invert, "Default", False)
    remove = Graph(g.g, g.branch(out(invert, "Value")))
    remove.x, remove.y = g.x, 400
    g.run("/Script/EnhancedInput.EnhancedInputSubsystemInterface:AddMappingContext", target=out(subsystem, "ReturnValue"),
          MappingContext=IMC_INVERT + "." + IMC_INVERT.rsplit("/", 1)[1], Priority=INVERT_PRIORITY)
    remove.run("/Script/EnhancedInput.EnhancedInputSubsystemInterface:RemoveMappingContext",
               target=out(subsystem, "ReturnValue"), MappingContext=IMC_INVERT + "." + IMC_INVERT.rsplit("/", 1)[1])
    seq = g.named("Utilities|FlowControl|Sequence")  # both branches join here
    g.step(seq, exec_out="then_0")
    link(remove.exec, inp(seq, "execute"))
    link(no_input, inp(seq, "execute"))
    pawn = g.pure("Controller:K2_GetPawn", target=p["Controller"])
    cast = g.cast("CastToCharacter", u.Character.static_class(), player)
    g.step(cast)
    link(pawn, inp(cast, "Object"))
    failed = out(cast, "CastFailed")
    speed = g.call(lib + ":ReadNumber")
    feed(speed, "Key", "mouse.sensitivity")
    feed(speed, "Default", "1.0")
    factor = g.pure("KismetMathLibrary:FClamp", Value=out(speed, "Value"), Min=SENSITIVITY[0], Max=SENSITIVITY[1])
    base = g.call(lib + ":BaseLookDegrees")
    g.set("LookDegrees", g.pure("KismetMathLibrary:Multiply_DoubleDouble", A=out(base, "Degrees"), B=factor),
          owner=class_path(PLAYER), target=cast_out(cast))
    g.ret(result, Applied=True)
    no = g.g.add_return_node()
    g.at(no, g.x, 500)
    link(failed, inp(no, "execute"))
    feed(no, "Applied", False)

    # ApplyVolumes(): every volumes row with a sound class becomes a SoundMix override; the mix is (re)pushed
    g, _, _ = function(bp, "ApplyVolumes")
    mix = MIX + "." + MIX.rsplit("/", 1)[1]
    for row in extensions["volumes"]:
        if not row["soundClass"]:
            continue
        if not u.load_object(None, row["soundClass"]):
            raise RuntimeError(f"ui-extensions.json: cannot load the sound class {row['soundClass']} ({row['owner']})")
        level = g.call(lib + ":ReadNumber")
        feed(level, "Key", row["key"])
        feed(level, "Default", "1.0")
        g.run("GameplayStatics:SetSoundMixClassOverride", InSoundMixModifier=mix, InSoundClass=row["soundClass"],
              Volume=g.pure("KismetMathLibrary:FClamp", Value=out(level, "Value"), Min=0, Max=1), Pitch="1.0",
              FadeInTime="0.0", bApplyToChildren=True)
    g.run("GameplayStatics:PopSoundMixModifier", InSoundMixModifier=mix)
    g.run("GameplayStatics:PushSoundMixModifier", InSoundMixModifier=mix)

    compiled(bp)
    return bp


# Widget trees -------------------------------------------------------------------------------------------------------

class Tree:
    """Adds source widgets to a widget blueprint. Text blocks and boxes are not Blueprint variables by default and Python
    cannot change that, so every widget the graphs touch is a variable class (Button, Slider, EditableTextBox,
    WidgetSwitcher, Image, InvalidationBox); a text the graphs rewrite sits in an InvalidationBox named after it and is
    reached with GetContent."""

    def __init__(self, wbp):
        self.wbp = wbp

    def add(self, cls, name, parent):
        widget = WIDGETS.add_source_widget(self.wbp, cls, name, parent or "")
        if not widget:
            raise RuntimeError(f"Could not add {name} to {self.wbp.get_name()}")
        return widget

    def label(self, name, parent, words, size=14, color=INK, bold=False, wrap=False, center=False, box=False):
        """A TextBlock; with box=True inside an InvalidationBox `name` (the text block is `name`Text)."""
        if box:
            holder = self.add(u.InvalidationBox, name, parent)
            holder.set_editor_property("can_cache", False)
            parent, name = name, name + "Text"
        block = self.add(u.TextBlock, name, parent)
        block.set_text(u.Text(words))
        font = block.get_editor_property("font")
        font.set_editor_property("size", size)
        font.set_editor_property("typeface_font_name", "Bold" if bold else "Regular")
        block.set_editor_property("font", font)
        block.set_editor_property("color_and_opacity", slate(color))
        if wrap:
            block.set_editor_property("auto_wrap_text", True)
        if center:
            block.set_editor_property("justification", u.TextJustify.CENTER)
        return holder if box else block

    def button(self, name, parent, words, primary=False):
        button = self.add(u.Button, name, parent)
        button.set_editor_property("background_color", linear(BLUE if primary else SOFT))
        self.label(name + "Label", name, words, size=16, color=WHITE if primary else INK, bold=primary, box=True)
        slot = button.get_editor_property("slot")
        slot.set_padding(u.Margin(0, 4, 0, 4))
        return button


def canvas_slot(widget, anchor, alignment, position=(0, 0), size=None):
    slot = widget.get_editor_property("slot")
    slot.set_anchors(u.Anchors(minimum=u.Vector2D(*anchor[:2]), maximum=u.Vector2D(*anchor[2:])))
    slot.set_alignment(u.Vector2D(*alignment))
    if anchor == (0, 0, 1, 1):  # stretched over the parent
        slot.set_auto_size(False)
        slot.set_offsets(u.Margin(0, 0, 0, 0))
        return slot
    slot.set_position(u.Vector2D(*position))
    if size is None:
        slot.set_auto_size(True)
    else:
        slot.set_size(u.Vector2D(*size))
    return slot


def pad(widget, left, top, right, bottom):
    widget.get_editor_property("slot").set_padding(u.Margin(left, top, right, bottom))


def round_brush(image, rgba, radius=None):
    brush = image.get_editor_property("brush")
    brush.set_editor_property("draw_as", u.SlateBrushDrawType.ROUNDED_BOX)
    outline = brush.get_editor_property("outline_settings")
    if radius is None:
        outline.set_editor_property("rounding_type", u.SlateBrushRoundingType.HALF_HEIGHT_RADIUS)
    else:
        outline.set_editor_property("rounding_type", u.SlateBrushRoundingType.FIXED_RADIUS)
        outline.set_editor_property("corner_radii", u.Vector4(radius, radius, radius, radius))
    brush.set_editor_property("outline_settings", outline)
    brush.set_editor_property("tint_color", slate(rgba))
    image.set_editor_property("brush", brush)


def content_text(g, box_name):
    """The TextBlock inside the InvalidationBox variable `box_name` (exec cast in the chain)."""
    content = g.pure("/Script/UMG.ContentWidget:GetContent", target=g.get(box_name))
    cast = g.cast("CastToTextBlock", None)
    g.step(cast)
    link(content, inp(cast, "Object"))
    return cast_out(cast)


def set_label(g, box_name, words):
    block = content_text(g, box_name)
    g.run("/Script/UMG.TextBlock:SetText", target=block, InText=text(g, words))


def visibility(g, widget_pin, visible, hidden="Collapsed", shown="SelfHitTestInvisible"):
    """SetVisibility(shown) when `visible` (a bool pin) else hidden; continues after both."""
    otherwise = g.branch(visible)
    g.run("/Script/UMG.Widget:SetVisibility", target=widget_pin, InVisibility=shown)
    side = Graph(g.g, otherwise)
    side.x, side.y = g.x - 300, g.y + 400
    side.run("/Script/UMG.Widget:SetVisibility", target=widget_pin, InVisibility=hidden)
    seq = g.named("Utilities|FlowControl|Sequence")
    g.step(seq, exec_out="then_0")
    link(side.exec, inp(seq, "execute"))


# WBP_LundenHud ------------------------------------------------------------------------------------------------------

LETTERS = (("LetterN", "N", 0, RED), ("LetterE", "Ö", 90, WHITE), ("LetterS", "S", 180, WHITE), ("LetterW", "V", 270, WHITE))
COMPASS = 64  # px, the web's --badge-height-ish compass disc (index.html #compass, interactions.md #767)
LETTER_RADIUS = 24


def hud(values):
    wbp = widget_blueprint(HUD)
    tree = Tree(wbp)
    root = tree.add(u.CanvasPanel, "Root", None)
    root.set_visibility(u.SlateVisibility.SELF_HIT_TEST_INVISIBLE)
    compass = tree.add(u.CanvasPanel, "Compass", "Root")
    canvas_slot(compass, (1, 0, 1, 0), (1, 0), (-16, 16), (COMPASS, COMPASS))
    disc = tree.add(u.Image, "Disc", "Compass")
    canvas_slot(disc, (0, 0, 1, 1), (0, 0))
    round_brush(disc, (0.01, 0.02, 0.03, 0.55))
    rose = tree.add(u.InvalidationBox, "Rose", "Compass")
    rose.set_editor_property("can_cache", False)
    canvas_slot(rose, (0, 0, 1, 1), (0, 0))
    needle = tree.add(u.CanvasPanel, "Needle", "Rose")
    for name, rgba, top in (("NorthArrow", RED, 14), ("SouthArrow", (0.7, 0.72, 0.74, 1), 32)):
        arrow = tree.add(u.Image, name, "Needle")
        canvas_slot(arrow, (0, 0, 0, 0), (0, 0), (COMPASS / 2 - 2, top), (4, 18))
        arrow.set_editor_property("color_and_opacity", linear(rgba))
    dot = tree.add(u.Image, "Hub", "Needle")
    canvas_slot(dot, (0, 0, 0, 0), (0.5, 0.5), (COMPASS / 2, COMPASS / 2), (4, 4))
    round_brush(dot, WHITE)
    for name, letter, _, rgba in LETTERS:
        holder = tree.label(name, "Compass", letter, size=10, color=rgba, bold=True, box=True)
        canvas_slot(holder, (0, 0, 0, 0), (0.5, 0.5), (COMPASS / 2, COMPASS / 2))
    fps = tree.label("Fps", "Root", "— FPS", size=14, color=WHITE, bold=True, box=True)
    canvas_slot(fps, (0, 0, 0, 0), (0, 0), (16, 16))
    fps_text = WIDGETS.find_source_widget_by_name(wbp, "FpsText")
    fps_text.set_editor_property("shadow_offset", u.Vector2D(1, 1))
    fps_text.set_editor_property("shadow_color_and_opacity", linear((0, 0, 0, 0.8)))

    variables(wbp, {"PlanNorth": REAL, "Bearing": REAL, "ShowFps": BOOL, "Frames": INT, "FpsElapsed": REAL,
                    "FpsEvery": REAL, "FpsValue": INT, "LetterRadius": REAL})
    me = class_path(HUD)
    lib = class_path(LIBRARY)

    # UpdateCompass(): bearing clockwise from true north, as src/compass.js; the rose turns by -bearing and the upright
    # letters sit at (sin, -cos)(cardinal - bearing) x LetterRadius from the centre
    g, _, _ = function(wbp, "UpdateCompass")
    player = g.pure("/Script/UMG.Widget:GetOwningPlayer")
    valid = g.pure("KismetSystemLibrary:IsValid", Object=player)
    g.branch(valid)
    rotation = g.pure("Controller:GetControlRotation", target=player)
    split = g.call("KismetMathLibrary:BreakRotator")
    link(rotation, inp(split, "InRot"))
    raw = g.pure("KismetMathLibrary:Add_DoubleDouble", A=g.pure("KismetMathLibrary:Add_DoubleDouble", A=g.get("PlanNorth"), B="90.0"),
                 B=out(split, "Yaw"))
    signed = g.pure("KismetMathLibrary:NormalizeAxis", Angle=raw)
    negative = g.pure("KismetMathLibrary:Less_DoubleDouble", A=signed, B="0.0")
    bearing = g.pure("KismetMathLibrary:SelectFloat", A=g.pure("KismetMathLibrary:Add_DoubleDouble", A=signed, B="360.0"),
                     B=signed, bPickA=negative)
    g.set("Bearing", bearing)
    minus = g.pure("KismetMathLibrary:Multiply_DoubleDouble", A=g.get("Bearing"), B="-1.0")
    g.run("/Script/UMG.Widget:SetRenderTransformAngle", target=g.get("Rose"), Angle=minus)
    for name, _, cardinal, _ in LETTERS:
        angle = g.pure("KismetMathLibrary:Subtract_DoubleDouble", A=str(float(cardinal)), B=g.get("Bearing"))
        x = g.pure("KismetMathLibrary:Multiply_DoubleDouble", A=g.pure("KismetMathLibrary:DegSin", A=angle), B=g.get("LetterRadius"))
        y = g.pure("KismetMathLibrary:Multiply_DoubleDouble", A=g.pure("KismetMathLibrary:DegCos", A=angle), B=g.get("LetterRadius"))
        offset = g.pure("KismetMathLibrary:MakeVector2D", X=x, Y=g.pure("KismetMathLibrary:Multiply_DoubleDouble", A=y, B="-1.0"))
        g.run("/Script/UMG.Widget:SetRenderTranslation", target=g.get(name), Translation=offset)

    # UpdateFps(Delta): frames per FpsEvery window, rounded, as src/fps.js
    g, p, _ = function(wbp, "UpdateFps", [("Delta", REAL)])
    g.set("Frames", g.pure("KismetMathLibrary:Add_IntInt", A=g.get("Frames"), B=1))
    g.set("FpsElapsed", g.pure("KismetMathLibrary:Add_DoubleDouble", A=g.get("FpsElapsed"), B=p["Delta"]))
    g.branch(g.pure("KismetMathLibrary:GreaterEqual_DoubleDouble", A=g.get("FpsElapsed"), B=g.get("FpsEvery")))
    rate = g.pure("KismetMathLibrary:Divide_DoubleDouble", A=g.pure("KismetMathLibrary:Conv_IntToDouble", InInt=g.get("Frames")),
                  B=g.get("FpsElapsed"))
    g.set("FpsValue", g.pure("KismetMathLibrary:Round", A=rate))
    g.set("Frames", 0)
    g.set("FpsElapsed", "0.0")
    words = concat(g, g.pure("KismetStringLibrary:Conv_IntToString", InInt=g.get("FpsValue")), " FPS")
    set_label(g, "Fps", words)

    # Refresh(): show or hide the frame rate from hud.fps (default shown, like the web)
    g, _, _ = function(wbp, "Refresh")
    flag = g.call(lib + ":ReadFlag")
    feed(flag, "Key", "hud.fps")
    feed(flag, "Default", True)
    g.set("ShowFps", out(flag, "Value"))
    visibility(g, g.get("Fps"), g.get("ShowFps"))

    ev = events(wbp)
    event(ev, wbp, "AddEvent|UserInterface|EventConstruct", "Construct", 0)
    ev.run(me + ":Refresh")
    ev.run(me + ":UpdateCompass")
    tick = event(ev, wbp, "AddEvent|UserInterface|EventTick", "Tick", 600)
    ev.run(me + ":UpdateCompass")
    ev.run(me + ":UpdateFps", Delta=out(tick, "InDeltaTime"))
    compiled(wbp)
    default = u.get_default_object(wbp.generated_class())
    default.set_editor_property("PlanNorth", values["planNorth"])
    default.set_editor_property("ShowFps", True)
    default.set_editor_property("FpsEvery", FPS_EVERY)
    default.set_editor_property("LetterRadius", float(LETTER_RADIUS))
    return wbp


# WBP_LundenMenu -----------------------------------------------------------------------------------------------------

def menu(extensions):
    wbp = widget_blueprint(MENU)
    tree = Tree(wbp)
    root = tree.add(u.CanvasPanel, "Root", None)
    dim = tree.add(u.Image, "Dim", "Root")
    canvas_slot(dim, (0, 0, 1, 1), (0, 0))
    dim.set_editor_property("color_and_opacity", linear(DIM))
    card = tree.add(u.Border, "Card", "Root")
    canvas_slot(card, (0.5, 0.5, 0.5, 0.5), (0.5, 0.5))
    card.set_editor_property("brush_color", linear(CARD))
    card.set_editor_property("padding", u.Margin(28, 24, 28, 24))
    width = tree.add(u.SizeBox, "CardWidth", "Card")
    width.set_width_override(480)
    pages = tree.add(u.WidgetSwitcher, "Pages", "CardWidth")

    main = tree.add(u.VerticalBox, "MainPage", "Pages")
    tree.label("Kicker", "MainPage", "KV. LUNDEN · ETT HEM ATT UPPTÄCKA", size=11, color=BLUE, bold=True)
    pad(tree.label("Title", "MainPage", "Välkommen till Lunden.", size=28, bold=True, box=True), 0, 6, 0, 6)
    pad(tree.label("Desc", "MainPage", "Kliv in i L1007, upptäck kvarteret och gör dig hemmastadd. "
                   "Det finns alltid något nytt att hitta.", size=14, wrap=True), 0, 0, 0, 14)
    tree.label("NameLabel", "MainPage", "Ditt namn", size=12, bold=True)
    name = tree.add(u.EditableTextBox, "NameBox", "MainPage")
    name.set_editor_property("hint_text", u.Text("Anonym"))
    pad(name, 0, 4, 0, 12)
    tree.button("BtnPlay", "MainPage", "Spela", primary=True)
    tree.button("BtnSettings", "MainPage", "Inställningar")
    for row in extensions["menuButtons"]:
        tree.button("Ext" + row["name"], "MainPage", row["label"])
    tree.button("BtnQuit", "MainPage", "Avsluta")

    settings = tree.add(u.VerticalBox, "SettingsPage", "Pages")
    tree.label("SettingsKicker", "SettingsPage", "SPELETS INSTÄLLNINGAR", size=11, color=BLUE, bold=True)
    pad(tree.label("SettingsTitle", "SettingsPage", "Inställningar", size=28, bold=True), 0, 6, 0, 10)

    def section(name, words):
        pad(tree.label(name, "SettingsPage", words, size=12, color=BLUE, bold=True), 0, 10, 0, 2)

    def slider(name, low, high, step):
        widget = tree.add(u.Slider, name, "SettingsPage")
        widget.set_editor_property("min_value", low)
        widget.set_editor_property("max_value", high)
        widget.set_editor_property("step_size", step)
        widget.set_editor_property("value", high)
        return widget

    section("GraphicsTitle", "Grafik")
    tree.button("BtnQuality", "SettingsPage", "Grafiknivå")
    tree.button("BtnResolution", "SettingsPage", "Upplösning")
    tree.button("BtnFps", "SettingsPage", "Visa bildfrekvens")
    section("MouseTitle", "Mus")
    tree.label("SensLabel", "SettingsPage", "Musens känslighet", size=14, box=True)
    slider("SensSlider", *SENSITIVITY)
    tree.button("BtnInvert", "SettingsPage", "Invertera musens höjdled")
    section("SoundTitle", "Ljud")
    for i, row in enumerate(extensions["volumes"]):
        tree.label(f"VolumeLabel{i}", "SettingsPage", row["label"], size=14, box=True)
        slider(f"VolumeSlider{i}", 0.0, 1.0, 0.05)
    pad(tree.button("BtnBack", "SettingsPage", "Tillbaka", primary=True), 0, 16, 0, 0)
    root.set_visibility(u.SlateVisibility.VISIBLE)

    hud_bp = ASSETS.load_asset(HUD)
    variables(wbp, {"Hud": BP.get_object_reference_type(hud_bp.generated_class()), "IsOpen": BOOL, "IsStart": BOOL})
    me = class_path(MENU)
    lib = class_path(LIBRARY)
    save_lib = class_path(SAVE_LIBRARY)
    hud_class = class_path(HUD)

    def owner(g):
        return g.pure("/Script/UMG.Widget:GetOwningPlayer")

    def gus(g):
        return g.pure("GameUserSettings:GetGameUserSettings")

    def on_off(g, flag):
        return select_string(g, flag, "PÅ", "AV")

    def store(g, key_name, words):
        node = g.call(save_lib + ":SetSetting")
        g.step(node)
        feed(node, "Key", key_name)
        feed(node, "Value", words)

    def read_flag(g, key_name, default):
        node = g.call(lib + ":ReadFlag")
        feed(node, "Key", key_name)
        feed(node, "Default", default)
        return out(node, "Value")

    def read_number(g, key_name, default):
        node = g.call(lib + ":ReadNumber")
        feed(node, "Key", key_name)
        feed(node, "Default", default)
        return out(node, "Value")

    # RefreshLabels(): every settings line shows its current value
    g, _, _ = function(wbp, "RefreshLabels")
    level = g.pure("GameUserSettings:GetOverallScalabilityLevel", target=gus(g))
    quality = g.call(lib + ":QualityName")
    feed(quality, "Level", level)
    set_label(g, "BtnQualityLabel", concat(g, "Grafiknivå: ", out(quality, "Name")))
    res = g.call(lib + ":ResolutionText")
    feed(res, "Resolution", g.pure("GameUserSettings:GetScreenResolution", target=gus(g)))
    set_label(g, "BtnResolutionLabel", concat(g, "Upplösning: ", out(res, "Text")))
    set_label(g, "BtnFpsLabel", concat(g, "Visa bildfrekvens: ", on_off(g, read_flag(g, "hud.fps", True))))
    sens = g.pure("KismetMathLibrary:FClamp", Value=read_number(g, "mouse.sensitivity", "1.0"), Min=SENSITIVITY[0], Max=SENSITIVITY[1])
    set_label(g, "SensLabel", concat(g, "Musens känslighet: ", number_text(g, sens, 2), "×"))
    g.run("/Script/UMG.Slider:SetValue", target=g.get("SensSlider"), InValue=sens)
    set_label(g, "BtnInvertLabel", concat(g, "Invertera musens höjdled: ", on_off(g, read_flag(g, "mouse.invertY", False))))
    for i, row in enumerate(extensions["volumes"]):
        level = g.pure("KismetMathLibrary:FClamp", Value=read_number(g, row["key"], "1.0"), Min=0, Max=1)
        percent = g.pure("KismetMathLibrary:Round", A=g.pure("KismetMathLibrary:Multiply_DoubleDouble", A=level, B="100.0"))
        set_label(g, f"VolumeLabel{i}", concat(g, row["label"] + ": ", g.pure("KismetStringLibrary:Conv_IntToString", InInt=percent), " %"))
        g.run("/Script/UMG.Slider:SetValue", target=g.get(f"VolumeSlider{i}"), InValue=level)

    # Open(Start): the start menu (Välkommen / Spela) or the pause menu (Paus / Fortsätt); pauses the game and gives the
    # menu the mouse and keyboard, with keyboard focus on the first button
    g, p, _ = function(wbp, "Open", [("Start", BOOL)])
    g.set("IsStart", p["Start"])
    set_label(g, "Title", select_string(g, p["Start"], "Välkommen till Lunden.", "Paus"))
    set_label(g, "BtnPlayLabel", select_string(g, p["Start"], "Spela", "Fortsätt"))
    current_name = g.call(save_lib + ":GetPlayerName")
    g.step(current_name)
    g.run("/Script/UMG.EditableTextBox:SetText", target=g.get("NameBox"), InText=text(g, out(current_name, "PlayerName")))
    g.run("/Script/UMG.WidgetSwitcher:SetActiveWidgetIndex", target=g.get("Pages"), Index=0)
    g.run(me + ":RefreshLabels")
    g.run("/Script/UMG.Widget:SetVisibility", InVisibility="Visible")
    g.run("GameplayStatics:SetGamePaused", bPaused=True)
    g.run("/Script/UMG.WidgetBlueprintLibrary:SetInputMode_UIOnlyEx", PlayerController=owner(g), InWidgetToFocus=g.get("BtnPlay"),
          InMouseLockMode="DoNotLock", bFlushInput=True)
    g.set("bShowMouseCursor", True, owner="/Script/Engine.PlayerController", target=owner(g))
    g.set("IsOpen", True)

    # Close(): keeps the typed name (trimmed; an empty name stays empty, shown as Anonym) and gives control back
    g, _, _ = function(wbp, "Close")
    typed = g.pure("KismetStringLibrary:TrimTrailing", SourceString=g.pure("KismetStringLibrary:Trim", SourceString=
                   g.pure("KismetTextLibrary:Conv_TextToString", InText=g.pure("/Script/UMG.EditableTextBox:GetText", target=g.get("NameBox")))))
    before = g.call(save_lib + ":GetPlayerName")
    g.step(before)
    same = g.branch(g.pure("KismetStringLibrary:NotEqual_StrStr", A=typed, B=out(before, "PlayerName")))
    put = g.call(save_lib + ":SetPlayerName")
    g.step(put)
    feed(put, "PlayerName", typed)
    seq = g.named("Utilities|FlowControl|Sequence")
    g.step(seq, exec_out="then_0")
    link(same, inp(seq, "execute"))
    g.run("/Script/UMG.Widget:SetVisibility", InVisibility="Collapsed")
    g.run("GameplayStatics:SetGamePaused", bPaused=False)
    g.run("/Script/UMG.WidgetBlueprintLibrary:SetInputMode_GameOnly", PlayerController=owner(g), bFlushInput=True)
    g.set("bShowMouseCursor", False, owner="/Script/Engine.PlayerController", target=owner(g))
    g.set("IsOpen", False)

    g, _, _ = function(wbp, "ShowSettings")
    g.run(me + ":RefreshLabels")
    g.run("/Script/UMG.WidgetSwitcher:SetActiveWidgetIndex", target=g.get("Pages"), Index=1)
    g.run("/Script/UMG.Widget:SetKeyboardFocus", target=g.get("BtnQuality"))

    g, _, _ = function(wbp, "ShowMain")
    g.run("/Script/UMG.WidgetSwitcher:SetActiveWidgetIndex", target=g.get("Pages"), Index=0)
    g.run("/Script/UMG.Widget:SetKeyboardFocus", target=g.get("BtnSettings"))

    # Back(): Esc goes back one step: settings -> main page -> play / resume
    g, _, _ = function(wbp, "Back")
    on_settings = g.pure("KismetMathLibrary:EqualEqual_IntInt", B=1,
                         A=g.pure("/Script/UMG.WidgetSwitcher:GetActiveWidgetIndex", target=g.get("Pages")))
    to_close = g.branch(on_settings)
    g.run(me + ":ShowMain")
    h = Graph(g.g, to_close)
    h.x, h.y = g.x, 400
    h.run(me + ":Close")

    g, _, _ = function(wbp, "CycleQuality")
    level = g.pure("GameUserSettings:GetOverallScalabilityLevel", target=gus(g))
    nxt = g.pure("KismetMathLibrary:Percent_IntInt", A=g.pure("KismetMathLibrary:Add_IntInt", A=level, B=1), B=len(QUALITY_NAMES))
    store(g, "graphics.quality", g.pure("KismetStringLibrary:Conv_IntToString", InInt=nxt))
    g.run(lib + ":ApplyGraphics")
    g.run(me + ":RefreshLabels")

    g, _, _ = function(wbp, "CycleResolution")
    after = g.run(lib + ":ResolutionAfter", Current=g.pure("GameUserSettings:GetScreenResolution", target=gus(g)))
    words = g.call(lib + ":ResolutionText")
    feed(words, "Resolution", out(after, "Next"))
    store(g, "graphics.resolution", out(words, "Text"))
    g.run(lib + ":ApplyGraphics")
    g.run(me + ":RefreshLabels")

    g, _, _ = function(wbp, "ToggleFps")
    store(g, "hud.fps", select_string(g, read_flag(g, "hud.fps", True), "false", "true"))
    g.run(hud_class + ":Refresh", target=g.get("Hud"))
    g.run(me + ":RefreshLabels")

    g, _, _ = function(wbp, "ToggleInvert")
    store(g, "mouse.invertY", select_string(g, read_flag(g, "mouse.invertY", False), "false", "true"))
    g.run(lib + ":ApplyMouse", Controller=owner(g))
    g.run(me + ":RefreshLabels")

    g, p, _ = function(wbp, "SetSensitivity", [("Value", REAL)])
    store(g, "mouse.sensitivity", g.pure("KismetStringLibrary:Conv_DoubleToString", InDouble=p["Value"]))
    g.run(lib + ":ApplyMouse", Controller=owner(g))
    g.run(me + ":RefreshLabels")

    g, p, _ = function(wbp, "SetVolume", [("Key", STRING), ("Value", REAL)])
    store(g, p["Key"], g.pure("KismetStringLibrary:Conv_DoubleToString", InDouble=p["Value"]))
    g.run(lib + ":ApplyVolumes")
    g.run(me + ":RefreshLabels")

    g, _, _ = function(wbp, "Quit")
    g.run("KismetSystemLibrary:QuitGame", SpecificPlayer=owner(g), QuitPreference="Quit", bIgnorePlatformRestrictions=False)

    # OpenExtension(Widget): a menuButtons row's widget over the menu (it removes itself when done; the menu stays)
    g, p, _ = function(wbp, "OpenExtension", [("Widget", BP.get_class_reference_type(u.UserWidget.static_class()))])
    made = g.named("UserInterface|CreateWidget")
    g.step(made)
    link(p["Widget"], inp(made, "Class"))
    link(owner(g), inp(made, "OwningPlayer"))
    g.run("/Script/UMG.UserWidget:AddToViewport", target=out(made, "ReturnValue"), ZOrder=20)

    # OnKeyDown: Escape = Back(); every other key goes on to the focused widget's default handling
    graph = BP.add_function_override(wbp, "OnKeyDown")
    if not graph:
        raise RuntimeError("Could not override OnKeyDown")
    editor = GRAPH.get_graph_editor(graph)
    entry = result = None
    for node in list(editor.list_all_nodes()):
        kind = node.get_class().get_name()
        if kind == "K2Node_FunctionEntry":
            entry = node
        elif kind == "K2Node_FunctionResult":
            result = node
        else:
            editor.remove_nodes([node])
    g = Graph(editor, out(entry, "then"))
    pressed = g.pure("KismetInputLibrary:GetKey", Input=out(entry, "InKeyEvent"))
    escape = g.call("KismetInputLibrary:EqualEqual_KeyKey")
    feed(escape, "A", pressed)
    feed(escape, "B", "Escape")
    other = g.branch(out(escape, "ReturnValue"))
    g.run(me + ":Back")
    g.ret(result, ReturnValue=g.pure("/Script/UMG.WidgetBlueprintLibrary:Handled"))
    no = editor.add_return_node()
    g.at(no, g.x, 500)
    link(other, inp(no, "execute"))
    feed(no, "ReturnValue", g.pure("/Script/UMG.WidgetBlueprintLibrary:Unhandled"))

    # Construct: the buttons' and sliders' events
    ev = events(wbp)
    event(ev, wbp, "AddEvent|UserInterface|EventConstruct", "Construct", 0)
    clicks = [("BtnPlay", me + ":Close", {}), ("BtnSettings", me + ":ShowSettings", {}), ("BtnQuit", me + ":Quit", {}),
              ("BtnQuality", me + ":CycleQuality", {}), ("BtnResolution", me + ":CycleResolution", {}),
              ("BtnFps", me + ":ToggleFps", {}), ("BtnInvert", me + ":ToggleInvert", {}), ("BtnBack", me + ":ShowMain", {})]
    for row in extensions["menuButtons"]:
        widget_class = u.load_class(None, row["widget"])
        if not widget_class:
            raise RuntimeError(f"ui-extensions.json: cannot load the widget {row['widget']} ({row['owner']})")
        clicks.append(("Ext" + row["name"], me + ":OpenExtension", {"Widget": row["widget"]}))
    handlers = [(name, "AssignOnClicked", call, args, None) for name, call, args in clicks]
    handlers.append(("SensSlider", "AssignOnValueChanged", me + ":SetSensitivity", {}, "Value"))
    for i, row in enumerate(extensions["volumes"]):
        handlers.append((f"VolumeSlider{i}", "AssignOnValueChanged", me + ":SetVolume", {"Key": row["key"]}, "Value"))
    y = 1200
    for name, assign_name, call, args, passed in handlers:
        widget = ev.get(name)
        before = {n.get_name() for n in ev.g.list_all_nodes()}
        choices = [str(n) for n in ev.g.list_available_nodes([widget]) if str(n).endswith("|" + assign_name)]
        assign = ev.g.create_node_from_name(choices[0], u.Vector2D(ev.x, ev.y), [widget]) if choices else None
        if not assign:
            raise RuntimeError(f"Could not create {assign_name} for {name}")
        ev.step(assign)
        widget.try_create_connection(inp(assign, "self"))  # the context pin may already be linked
        handler = [n for n in ev.g.list_all_nodes() if n.get_name() not in before
                   and n.get_class().get_name() == "K2Node_CustomEvent"]
        if len(handler) != 1:
            raise RuntimeError(f"{assign_name} for {name} made {len(handler)} custom events")
        h = Graph(ev.g, out(handler[0], "then"))
        BP.set_node_pos(handler[0], u.IntPoint(0, y))
        h.x, h.y = 300, y
        call_node = h.run(call, **args)
        if passed:
            link(out(handler[0], passed), inp(call_node, "Value"))
        y += 300
        BP.compile_blueprint(wbp)  # so the next Assign sees this event's name and picks a new one
    compiled(wbp)
    return wbp


# BPC_LundenUI -----------------------------------------------------------------------------------------------------------

def component(hud_bp, menu_bp):
    bp = blueprint(COMPONENT, u.ActorComponent)
    variables(bp, {"Hud": BP.get_object_reference_type(hud_bp.generated_class()),
                   "Menu": BP.get_object_reference_type(menu_bp.generated_class()),
                   "MousePawn": BP.get_object_reference_type(u.Pawn.static_class()),
                   "StartMenu": BOOL, "WatchSeconds": REAL,
                   "InputSubsystem": BP.get_object_reference_type(u.Object.static_class())})
    me = class_path(COMPONENT)
    lib = class_path(LIBRARY)
    menu_class = class_path(MENU)
    pc_class = u.PlayerController.static_class()

    def controller(g):
        cast = g.cast("CastToPlayerController", None)
        g.step(cast)
        link(g.pure("ActorComponent:GetOwner"), inp(cast, "Object"))
        return cast_out(cast)

    # StartMenuWanted() -> Wanted: StartMenu, except under editor automation (run-python's -run=pythonscript, run-tests'
    # Automation RunTests) and with -LundenNoStartMenu, so other areas' PIE tests and captures run unpaused
    g, _, result = function(bp, "StartMenuWanted", outputs=[("Wanted", BOOL)], pure=True)
    line = g.pure("KismetSystemLibrary:GetCommandLine")
    quiet = None
    for word in SUPPRESS:
        hit = g.pure("KismetStringLibrary:Contains", SearchIn=line, Substring=word, bUseCase=False, bSearchFromEnd=False)
        quiet = hit if quiet is None else g.pure("KismetMathLibrary:BooleanOR", A=quiet, B=hit)
    g.ret(result, Wanted=g.pure("KismetMathLibrary:BooleanAND", A=g.get("StartMenu"),
                                B=g.pure("KismetMathLibrary:Not_PreBool", A=quiet)))

    # CheckMouse(): gives a newly possessed pawn the mouse settings (timer target)
    g, _, _ = function(bp, "CheckMouse")
    pc = controller(g)
    pawn = g.pure("Controller:K2_GetPawn", target=pc)
    g.branch(g.pure("KismetMathLibrary:NotEqual_ObjectObject", A=pawn, B=g.get("MousePawn")))
    applied = g.run(lib + ":ApplyMouse", Controller=pc)
    g.branch(out(applied, "Applied"))
    g.set("MousePawn", pawn)

    # BeginPlay: widgets for the local player, the menu input, the saved settings, the start menu
    ev = events(bp)
    event(ev, bp, "AddEvent|EventBeginPlay", "ReceiveBeginPlay", 0)
    pc = controller(ev)
    ev.branch(ev.pure("Controller:IsLocalController", target=pc))
    made = {}
    for name, widget_bp, order in (("Hud", hud_bp, 0), ("Menu", menu_bp, 10)):
        create_node = ev.named("UserInterface|CreateWidget")
        ev.step(create_node)
        value(create_node, "Class", widget_bp.generated_class().get_path_name())
        link(pc, inp(create_node, "OwningPlayer"))
        typed = ev.cast("CastToUserWidget", u.UserWidget.static_class(), widget_bp.generated_class())
        ev.step(typed)
        link(out(create_node, "ReturnValue"), inp(typed, "Object"))
        ev.set(name, cast_out(typed))
        made[name] = ev.get(name)
        ev.run("/Script/UMG.UserWidget:AddToViewport", target=ev.get(name), ZOrder=order)
    ev.set("Hud", ev.get("Hud"), owner=menu_class, target=ev.get("Menu"))
    ev.run("/Script/UMG.Widget:SetVisibility", target=ev.get("Menu"), InVisibility="Collapsed")
    subsystem = ev.named("PlayerController|LocalPlayerSubsystems|GetEnhancedInputLocalPlayerSubsystem")
    link(pc, inp(subsystem, "PlayerController"))
    ev.branch(ev.pure("KismetSystemLibrary:IsValid", Object=out(subsystem, "ReturnValue")))
    ev.set("InputSubsystem", out(subsystem, "ReturnValue"))  # the player's input subsystem, also for tests (Python cannot reach it)
    ev.run("/Script/EnhancedInput.EnhancedInputSubsystemInterface:AddMappingContext", target=out(subsystem, "ReturnValue"),
           MappingContext=IMC_UI + "." + IMC_UI.rsplit("/", 1)[1], Priority=UI_PRIORITY)
    ev.run(lib + ":ApplyGraphics")
    ev.run(lib + ":ApplyVolumes")
    ev.run(me + ":CheckMouse")
    ev.run("KismetSystemLibrary:K2_SetTimer", FunctionName="CheckMouse", Time=ev.get("WatchSeconds"), bLooping=True)
    ev.branch(ev.pure(me + ":StartMenuWanted", result="Wanted"))
    ev.run(menu_class + ":Open", target=ev.get("Menu"), Start=True)

    # IA_LundenMenu (Esc, also while paused): open the pause menu, or step back when it is open and lost the focus
    action = ev.g.create_node_from_name("Input|EnhancedActionEvents|" + IA_MENU.rsplit("/", 1)[1], u.Vector2D(0, 900), [])
    if not action:
        raise RuntimeError("No event node for IA_LundenMenu yet: run build_ui.py once more (a new input action is listed "
                           "after an editor restart)")
    BP.set_node_pos(action, u.IntPoint(0, 900))
    ev.x, ev.y, ev.exec = 300, 900, out(action, "Started")
    ev.branch(ev.pure("KismetSystemLibrary:IsValid", Object=ev.get("Menu")))
    getter = ev.at(ev.g.add_get_member_variable_node("IsOpen", menu_class))
    link(ev.get("Menu"), inp(getter, "self"))
    closed = ev.branch(out(getter, "IsOpen"))
    ev.run(menu_class + ":Back", target=ev.get("Menu"))
    h = Graph(ev.g, closed)
    h.x, h.y = ev.x, 1300
    h.run(menu_class + ":Open", target=ev.get("Menu"), Start=False)

    compiled(bp)
    default = u.get_default_object(bp.generated_class())
    default.set_editor_property("StartMenu", True)
    default.set_editor_property("WatchSeconds", WATCH_SECONDS)
    return bp


# Main -------------------------------------------------------------------------------------------------------------------

def asset_file(path):
    return REPO / "unreal/Lunden/Content" / (path.removeprefix("/Game/") + ".uasset")


def main(argv):
    flags = {a for a in argv if a.startswith("--")}
    args = [a for a in argv if not a.startswith("--")]
    measurements = json.loads((Path(args[0]) if args else REPO / "unreal/Lunden/Import/measurements.json").read_text(encoding="utf-8"))
    values = export_values(measurements)
    extensions = load_extensions(REPO / "tools/unreal-engine/ui-extensions.json")
    spec = hashlib.sha256(json.dumps({"values": values, "extensions": extensions,
                                      "script": Path(__file__).read_text(encoding="utf-8")}, sort_keys=True).encode()).hexdigest()
    stamp = json.loads(STAMP.read_text(encoding="utf-8")).get("spec", "") if STAMP.exists() else ""
    present = all(ASSETS.does_asset_exist(p) for p in BLUEPRINTS + (IA_MENU, IMC_UI, IMC_INVERT, MIX))
    if "--check" in flags:
        stored = ASSETS.get_metadata_tag(ASSETS.load_asset(COMPONENT), SPEC_TAG) if present else ""
        if stamp != spec or stored != spec:
            raise RuntimeError(f"{DIR} is not built from these inputs (stamp {stamp[:16]}, asset {stored[:16]}, want {spec[:16]})")
        u.log(f"LUNDEN_UI {DIR}: check passed, spec {spec[:16]}")
        u.log("LUNDEN_UI_OK")
        return
    if present and stamp == spec and "--force" not in flags:
        u.log(f"LUNDEN_UI {DIR}: unchanged, nothing saved; spec {spec[:16]}")
        u.log("LUNDEN_UI_OK")
        return
    # A widget tree cannot be cleared from Python and an asset deleted in this session cannot be created again here, so a
    # rebuild first removes the old Blueprint files (unloaded) and asks for a second run, which starts from nothing.
    stale = [asset_file(p) for p in BLUEPRINTS if asset_file(p).exists()]
    if stale:
        for file in stale:
            try:
                file.unlink()
            except PermissionError:
                raise RuntimeError(f"Cannot remove {file}: take its git lfs lock first") from None
        STAMP.unlink(missing_ok=True)
        u.log(f"LUNDEN_UI removed the old {', '.join(f.stem for f in stale)}; run build_ui.py again to build them")
        u.log("LUNDEN_UI_RUN_AGAIN")
        return
    if input_assets():
        u.log("LUNDEN_UI created the input assets; run build_ui.py again to build the Blueprints")
        u.log("LUNDEN_UI_RUN_AGAIN")
        return
    lib = library(values, extensions)
    save(lib)
    hud_bp = hud(values)
    save(hud_bp)
    menu_bp = menu(extensions)
    save(menu_bp)
    comp = component(hud_bp, menu_bp)
    ASSETS.set_metadata_tag(comp, SPEC_TAG, spec)
    save(comp)
    STAMP.write_text(json.dumps({"spec": spec, "by": "tools/unreal-engine/python/build_ui.py"}, indent=2) + "\n", encoding="utf-8")
    u.log(f"LUNDEN_UI {DIR}: saved BFL_LundenSettings, WBP_LundenHud, WBP_LundenMenu, BPC_LundenUI; "
          f"{len(extensions['menuButtons'])} menu buttons, {len(extensions['volumes'])} volumes; "
          f"planNorth {values['planNorth']}, look {values['lookDegrees']:.4f} deg; spec {spec[:16]}")
    u.log("LUNDEN_UI_OK")


main(sys.argv[1:])
