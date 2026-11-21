"""#2288: the player's save file, /Game/Lunden/Save/, built headless from this script.

The web keeps the player's name, opaque id, look code, settings and place in browser storage (src/playerprofiles.js
lunden.name / lunden.playerId / lunden.avatar, src/resume.js and lunden.playerWorld for the place). The Windows game
keeps the same things in one versioned SaveGame slot in the user's save folder, which the launcher (#2249/#2250)
keeps outside the installation: `-UserDir=%LOCALAPPDATA%\\Lunden` makes it %LOCALAPPDATA%\\Lunden\\Saved\\SaveGames\\
LundenSave.sav (Lunden-Test for the test channel), untouched by updates and kept by a default uninstall.

Assets (one owner, #2288):
  Save/SG_LundenSave    SaveGame: SaveVersion, PlayerName, PlayerId, LookCode, PlaceMap, PlaceLocation (cm),
                        PlaceRotation (the control rotation), Settings (string -> string).
  Save/BFL_LundenSave   Function library, the interface for other areas (#2286 settings, #2291 look code, #2292 name
                        and player id). Every call reads the slot, and every setter writes it back at once:
                          LoadSave() -> Save            the slot, migrated to CurrentVersion; created (with a new
                                                        PlayerId) and written when missing or unreadable
                          WriteSave(Save) -> Success
                          MigrateSave(Save) -> Changed  step by step up to CurrentVersion (0 -> 1: add PlayerId)
                          GetSetting(Key, Default) -> Value, Found;   SetSetting(Key, Value) -> Success
                          GetPlayerName / SetPlayerName, GetLookCode / SetLookCode, GetPlayerId
                          NewPlayerId() -> Id           a random id shaped like the web's crypto.randomUUID()
                          CurrentVersion(), SlotName()  pure constants
  Save/BPC_LundenSave   ActorComponent on BP_LundenPlayerController (tools/unreal-engine/player-extensions.json):
                        BeginPlay puts the possessed pawn back at the saved place and facing when the save was made on
                        the same map (TryRestore, retried every RetrySeconds until a pawn is possessed), then saves the
                        place every SaveIntervalSeconds and on EndPlay. RestorePlace / SavePlace are the test hooks.

Version rule: SaveVersion defaults to 0 on the class, so a file written before the field existed reads as 0 (a SaveGame
stores only the properties that differ from the class defaults). LoadSave stamps new saves with CurrentVersion and
MigrateSave brings an older file up to it and writes it back. A save from a newer build (after a launcher rollback) is
read as far as this build knows it; fields it does not know are dropped on its next write.

Run (Windows checkout; lock the assets first: git lfs lock unreal/Lunden/Content/Lunden/Save/<each>.uasset):
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/run-python.ps1 tools/unreal-engine/python/build_save.py [--force | --check]
    ... build_save.py --v0-fixture <file.sav>   writes the frozen pre-version save used by tests/test_save.py
A run whose script is unchanged (metadata Lunden.SpecHash on BPC_LundenSave) saves nothing; --check fails when an
asset is missing or was built by another version of this script. Logs LUNDEN_SAVE_OK.
"""
import hashlib
from pathlib import Path
import shutil
import sys

import unreal as u

DIR = "/Game/Lunden/Save"
SAVE = DIR + "/SG_LundenSave"
LIBRARY = DIR + "/BFL_LundenSave"
COMPONENT = DIR + "/BPC_LundenSave"
SPEC_TAG = "Lunden.SpecHash"
SLOT = "LundenSave"
USER = 0
VERSION = 1  # 0: before SaveVersion and PlayerId existed (the frozen fixture); 1: PlayerId added
SAVE_INTERVAL = 2.0  # seconds; src/main.js writes the F5 place record (src/resume.js saveSession) every ~2 s
RETRY = 0.05  # seconds between attempts to find the possessed pawn at start

ASSETS = u.EditorAssetLibrary
BP = u.BlueprintEditorLibrary
GRAPH = u.BlueprintGraphEditor
TOOLS = u.AssetToolsHelpers.get_asset_tools()
INT = BP.get_basic_type_by_name("int")
BOOL = BP.get_basic_type_by_name("bool")
REAL = BP.get_basic_type_by_name("real")
STRING = BP.get_basic_type_by_name("string")
SAVE_VARIABLES = {
    "SaveVersion": INT, "PlayerName": STRING, "PlayerId": STRING, "LookCode": STRING, "PlaceMap": STRING,
    "PlaceLocation": BP.get_struct_type(u.Vector.static_struct()),
    "PlaceRotation": BP.get_struct_type(u.Rotator.static_struct()),
    "Settings": BP.get_map_type(STRING, STRING),
}
LIBRARY_FUNCTIONS = ("CurrentVersion", "SlotName", "NewPlayerId", "WriteSave", "MigrateSave", "LoadSave",
                     "GetSetting", "SetSetting", "GetPlayerName", "SetPlayerName", "GetLookCode", "SetLookCode",
                     "GetPlayerId")
COMPONENT_FUNCTIONS = ("RestorePlace", "SavePlace", "TryRestore", "AutoSave")


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
    """The typed output of a Cast To node ("AsSG Lunden Save"; the display name depends on the class name)."""
    found = [p for p in BP.list_output_pins(node) if str(p.get_pin_name()).startswith("As")]
    if len(found) != 1:
        raise RuntimeError(f"{node.get_name()}: no single As output in {pins(node, BP.list_output_pins)}")
    return found[0]


def class_path(path):
    return f"{path}.{path.rsplit('/', 1)[1]}_C"


class Graph:
    """Places nodes left to right; `x` advances with each call that does not give a position."""

    def __init__(self, editor, owner=None):
        self.g = editor
        self.owner = owner
        self.x = 250

    def at(self, node, x=None, y=0):
        if not node:
            raise RuntimeError(f"Could not create a node at {x},{y}")
        if x is None:
            x, self.x = self.x, self.x + 280
        BP.set_node_pos(node, u.IntPoint(x, y))
        return node

    def call(self, path, x=None, y=0):
        full = path if path.startswith("/") else "/Script/Engine." + path
        return self.at(self.g.add_call_function_node(full), x, y)

    def get(self, name, owner, x=None, y=200):
        return self.at(self.g.add_get_member_variable_node(name, owner), x, y)

    def set(self, name, owner, x=None, y=0):
        return self.at(self.g.add_set_member_variable_node(name, owner), x, y)

    def branch(self, x=None, y=0):
        return self.at(self.g.add_branch_node(), x, y)

    def ret(self, x=None, y=0):
        return self.at(self.g.add_return_node(), x, y)

    def cast(self, cls, x=None, y=0):
        """A Cast To node for `cls`: Blueprint classes are made as Cast To SaveGame and retargeted."""
        if cls == u.PlayerController.static_class():
            return self.at(self.g.create_node_from_name("Utilities|Casting|CastToPlayerController", u.Vector2D(0, 0), []), x, y)
        node = self.g.create_node_from_name("Utilities|Casting|CastToSaveGame", u.Vector2D(0, 0), [])
        if not node or not self.g.retarget_node_class(node, u.SaveGame.static_class(), cls):
            raise RuntimeError(f"Could not make a cast to {cls.get_name()}")
        return self.at(node, x, y)


def function(bp, name, inputs, outputs, pure=False):
    """A new function graph with typed parameters; returns (Graph, entry pins by name, result node or None)."""
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
    return Graph(editor), params, result


def start(g):
    return g.g.find_graph_entry_pin()


def remove_functions(bp, names):
    if "EventGraph" in [str(n) for n in BP.list_graph_names(bp)]:  # a function library has none
        events = GRAPH.get_graph_editor_by_name(bp, "EventGraph")
        events.remove_nodes(list(events.list_all_nodes()))
    for name in names:
        if BP.find_graph(bp, name):
            BP.remove_function_graph(bp, name)
    BP.compile_blueprint(bp)  # drop the old functions from the class before graphs of the same name come back
    left = [str(n) for n in BP.list_graph_names(bp) if str(n) in names]
    if left:
        raise RuntimeError(f"Could not remove the old functions {left} from {bp.get_path_name()}")


def compiled(bp, graphs):
    BP.compile_blueprint(bp)
    broken = [f"{name}: {n.get_name()}" for name in graphs
              for n in GRAPH.get_graph_editor_by_name(bp, name).list_nodes_with_errors()]
    if broken:
        raise RuntimeError(f"{bp.get_name()} failed to compile: " + ", ".join(broken))


def blueprint(path, parent=None, factory=None):
    if ASSETS.does_asset_exist(path):
        return ASSETS.load_asset(path)
    if factory is None:
        factory = u.BlueprintFactory()
        factory.set_editor_property("parent_class", parent)
    folder, name = path.rsplit("/", 1)
    bp = TOOLS.create_asset(name, folder, u.Blueprint, factory)
    if not bp:
        raise RuntimeError("Could not create " + path)
    return bp


# SG_LundenSave ------------------------------------------------------------------------------------------------------

def save_class():
    bp = blueprint(SAVE, u.SaveGame)
    have = {str(n) for n in BP.list_member_variable_names(bp)}
    for name, kind in SAVE_VARIABLES.items():
        if name in have:
            if BP.get_member_variable_type(bp, name).export_text() != kind.export_text():
                BP.change_member_variable_type(bp, name, kind)
        elif not BP.add_member_variable(bp, name, kind):
            raise RuntimeError("Could not add the variable " + name)
        BP.set_blueprint_variable_instance_editable(bp, name, True)  # editor Python (fixture, tests) sets instances
    extra = sorted(have - SAVE_VARIABLES.keys())
    if extra:
        raise RuntimeError(f"{SAVE} has variables this script does not know: {extra}")
    BP.compile_blueprint(bp)
    default = u.get_default_object(bp.generated_class())
    default.set_editor_property("SaveVersion", 0)  # the version rule above: an unversioned file reads as 0
    return bp


# BFL_LundenSave -----------------------------------------------------------------------------------------------------

def library(save_bp):
    bp = blueprint(LIBRARY, factory=u.BlueprintFunctionLibraryFactory())
    remove_functions(bp, LIBRARY_FUNCTIONS)
    sg = save_bp.generated_class()
    sg_path = sg.get_path_name()
    lib = class_path(LIBRARY)
    sg_ref = BP.get_object_reference_type(sg)

    for name, output, text, kind in (("CurrentVersion", "Version", VERSION, INT), ("SlotName", "Slot", SLOT, STRING)):
        g, _, result = function(bp, name, [], [(output, kind)], pure=True)
        link(start(g), inp(result, "execute"))
        value(result, output, text)

    # NewPlayerId: a new GUID as lower-case 8-4-4-4-12 hex, the shape of the web's crypto.randomUUID() (lunden.playerId)
    g, _, result = function(bp, "NewPlayerId", [], [("Id", STRING)])
    guid = g.call("KismetGuidLibrary:NewGuid", 250, 200)
    text = g.call("KismetGuidLibrary:Conv_GuidToString", 500, 200)
    link(out(guid, "ReturnValue"), inp(text, "InGuid"))
    lower = g.call("KismetStringLibrary:ToLower", 750, 200)
    link(out(text, "ReturnValue"), inp(lower, "SourceString"))
    joined = None
    for i, (first, length) in enumerate(((0, 8), (8, 4), (12, 4), (16, 4), (20, 12))):
        part = g.call("KismetStringLibrary:GetSubstring", 1000 + i * 250, 300)
        link(out(lower, "ReturnValue"), inp(part, "SourceString"))
        value(part, "StartIndex", first)
        value(part, "Length", length)
        if joined is None:
            joined = out(part, "ReturnValue")
            continue
        dash = g.call("KismetStringLibrary:Concat_StrStr", 1000 + i * 250, 500)
        link(joined, inp(dash, "A"))
        value(dash, "B", "-")
        both = g.call("KismetStringLibrary:Concat_StrStr", 1100 + i * 250, 650)
        link(out(dash, "ReturnValue"), inp(both, "A"))
        link(out(part, "ReturnValue"), inp(both, "B"))
        joined = out(both, "ReturnValue")
    g.at(result, 2400, 0)
    link(start(g), inp(result, "execute"))
    link(joined, inp(result, "Id"))
    BP.compile_blueprint(bp)

    # WriteSave(Save) -> Success
    g, p, result = function(bp, "WriteSave", [("Save", sg_ref)], [("Success", BOOL)])
    write = g.call("GameplayStatics:SaveGameToSlot")
    link(start(g), inp(write, "execute"))
    link(p["Save"], inp(write, "SaveGameObject"))
    value(write, "SlotName", SLOT)
    value(write, "UserIndex", USER)
    g.at(result)
    link(out(write, "then"), inp(result, "execute"))
    link(out(write, "ReturnValue"), inp(result, "Success"))

    # MigrateSave(Save) -> Changed. One step per version; each step ends by setting SaveVersion to its target.
    g, p, result = function(bp, "MigrateSave", [("Save", sg_ref)], [("Changed", BOOL)])
    version = g.get("SaveVersion", sg_path, 250, 200)
    link(p["Save"], inp(version, "self"))
    older = g.call("KismetMathLibrary:Less_IntInt", 500, 200)
    link(out(version, "SaveVersion"), inp(older, "A"))
    value(older, "B", 1)
    step = g.branch(750, 0)
    link(start(g), inp(step, "execute"))
    link(out(older, "ReturnValue"), inp(step, "Condition"))
    # 0 -> 1: the opaque player id (src/playerprofiles.js lunden.playerId) did not exist; keep one if present
    old_id = g.get("PlayerId", sg_path, 750, 350)
    link(p["Save"], inp(old_id, "self"))
    missing = g.call("KismetStringLibrary:IsEmpty", 1000, 350)
    link(out(old_id, "PlayerId"), inp(missing, "InString"))
    fresh = g.call(lib + ":NewPlayerId", 1000, 150)
    link(out(step, "then"), inp(fresh, "execute"))
    pick = g.call("KismetMathLibrary:SelectString", 1250, 300)
    link(out(fresh, "Id"), inp(pick, "A"))
    link(out(old_id, "PlayerId"), inp(pick, "B"))
    link(out(missing, "ReturnValue"), inp(pick, "bPickA"))
    set_id = g.set("PlayerId", sg_path, 1500, 0)
    link(out(fresh, "then"), inp(set_id, "execute"))
    link(p["Save"], inp(set_id, "self"))
    link(out(pick, "ReturnValue"), inp(set_id, "PlayerId"))
    set_version = g.set("SaveVersion", sg_path, 1800, 0)
    link(out(set_id, "then"), inp(set_version, "execute"))
    link(p["Save"], inp(set_version, "self"))
    value(set_version, "SaveVersion", 1)
    g.at(result, 2100, 0)
    link(out(set_version, "then"), inp(result, "execute"))
    value(result, "Changed", "true")
    same = g.ret(1000, 600)
    link(out(step, "else"), inp(same, "execute"))
    value(same, "Changed", "false")
    BP.compile_blueprint(bp)

    # LoadSave() -> Save: the slot if it holds an SG_LundenSave (migrated and written back when older), else a new one
    g, _, result = function(bp, "LoadSave", [], [("Save", sg_ref)])
    exists = g.call("GameplayStatics:DoesSaveGameExist", 250, 200)
    value(exists, "SlotName", SLOT)
    value(exists, "UserIndex", USER)
    link(start(g), inp(exists, "execute"))
    there = g.branch(500, 0)
    link(out(exists, "then"), inp(there, "execute"))
    link(out(exists, "ReturnValue"), inp(there, "Condition"))
    read = g.call("GameplayStatics:LoadGameFromSlot", 750, 0)
    link(out(there, "then"), inp(read, "execute"))
    value(read, "SlotName", SLOT)
    value(read, "UserIndex", USER)
    loaded = g.cast(sg, 1000, 0)
    link(out(read, "then"), inp(loaded, "execute"))
    link(out(read, "ReturnValue"), inp(loaded, "Object"))
    as_save = cast_out(loaded)
    migrate = g.call(lib + ":MigrateSave", 1300, 0)
    link(out(loaded, "then"), inp(migrate, "execute"))
    link(as_save, inp(migrate, "Save"))
    changed = g.branch(1550, 0)
    link(out(migrate, "then"), inp(changed, "execute"))
    link(out(migrate, "Changed"), inp(changed, "Condition"))
    rewrite = g.call(lib + ":WriteSave", 1800, 0)
    link(out(changed, "then"), inp(rewrite, "execute"))
    link(as_save, inp(rewrite, "Save"))
    g.at(result, 2100, 0)
    link(out(rewrite, "then"), inp(result, "execute"))
    link(as_save, inp(result, "Save"))
    kept = g.ret(1800, 250)
    link(out(changed, "else"), inp(kept, "execute"))
    link(as_save, inp(kept, "Save"))
    # missing or unreadable: a new save at the current version with a new id, written at once so the id stays
    create = g.call("GameplayStatics:CreateSaveGameObject", 1000, 600)
    link(out(there, "else"), inp(create, "execute"))
    link(out(loaded, "CastFailed"), inp(create, "execute"))
    value(create, "SaveGameClass", sg.get_path_name())
    made = g.cast(sg, 1300, 600)
    link(out(create, "then"), inp(made, "execute"))
    link(out(create, "ReturnValue"), inp(made, "Object"))
    as_new = cast_out(made)
    new_id = g.call(lib + ":NewPlayerId", 1550, 600)
    link(out(made, "then"), inp(new_id, "execute"))
    set_new_id = g.set("PlayerId", sg_path, 1800, 600)
    link(out(new_id, "then"), inp(set_new_id, "execute"))
    link(as_new, inp(set_new_id, "self"))
    link(out(new_id, "Id"), inp(set_new_id, "PlayerId"))
    set_new_version = g.set("SaveVersion", sg_path, 2050, 600)
    link(out(set_new_id, "then"), inp(set_new_version, "execute"))
    link(as_new, inp(set_new_version, "self"))
    value(set_new_version, "SaveVersion", VERSION)
    first = g.call(lib + ":WriteSave", 2300, 600)
    link(out(set_new_version, "then"), inp(first, "execute"))
    link(as_new, inp(first, "Save"))
    fresh_out = g.ret(2550, 600)
    link(out(first, "then"), inp(fresh_out, "execute"))
    link(as_new, inp(fresh_out, "Save"))
    BP.compile_blueprint(bp)

    # Getters and setters over LoadSave/WriteSave
    def loaded_save(g):
        node = g.call(lib + ":LoadSave", 250, 0)
        link(start(g), inp(node, "execute"))
        return node

    for field in ("PlayerName", "LookCode", "PlayerId"):
        g, _, result = function(bp, "Get" + field, [], [(field, STRING)])
        load = loaded_save(g)
        read = g.get(field, sg_path, 500, 200)
        link(out(load, "Save"), inp(read, "self"))
        g.at(result, 750, 0)
        link(out(load, "then"), inp(result, "execute"))
        link(out(read, field), inp(result, field))
        if field == "PlayerId":
            continue  # the id is made by LoadSave/MigrateSave, never set from outside
        g, p, result = function(bp, "Set" + field, [(field, STRING)], [("Success", BOOL)])
        load = loaded_save(g)
        put = g.set(field, sg_path, 500, 0)
        link(out(load, "then"), inp(put, "execute"))
        link(out(load, "Save"), inp(put, "self"))
        link(p[field], inp(put, field))
        write = g.call(lib + ":WriteSave", 800, 0)
        link(out(put, "then"), inp(write, "execute"))
        link(out(load, "Save"), inp(write, "Save"))
        g.at(result, 1050, 0)
        link(out(write, "then"), inp(result, "execute"))
        link(out(write, "Success"), inp(result, "Success"))

    g, p, result = function(bp, "GetSetting", [("Key", STRING), ("Default", STRING)], [("Value", STRING), ("Found", BOOL)])
    load = loaded_save(g)
    settings = g.get("Settings", sg_path, 500, 200)
    link(out(load, "Save"), inp(settings, "self"))
    find = g.call("/Script/Engine.BlueprintMapLibrary:Map_Find", 750, 200)
    link(out(settings, "Settings"), inp(find, "TargetMap"))
    link(p["Key"], inp(find, "Key"))
    pick = g.call("KismetMathLibrary:SelectString", 1000, 200)
    link(out(find, "Value"), inp(pick, "A"))
    link(p["Default"], inp(pick, "B"))
    link(out(find, "ReturnValue"), inp(pick, "bPickA"))
    g.at(result, 1250, 0)
    link(out(load, "then"), inp(result, "execute"))
    link(out(pick, "ReturnValue"), inp(result, "Value"))
    link(out(find, "ReturnValue"), inp(result, "Found"))

    g, p, result = function(bp, "SetSetting", [("Key", STRING), ("Value", STRING)], [("Success", BOOL)])
    load = loaded_save(g)
    settings = g.get("Settings", sg_path, 500, 200)
    link(out(load, "Save"), inp(settings, "self"))
    add = g.call("/Script/Engine.BlueprintMapLibrary:Map_Add", 750, 0)
    link(out(load, "then"), inp(add, "execute"))
    link(out(settings, "Settings"), inp(add, "TargetMap"))
    link(p["Key"], inp(add, "Key"))
    link(p["Value"], inp(add, "Value"))
    write = g.call(lib + ":WriteSave", 1050, 0)
    link(out(add, "then"), inp(write, "execute"))
    link(out(load, "Save"), inp(write, "Save"))
    g.at(result, 1300, 0)
    link(out(write, "then"), inp(result, "execute"))
    link(out(write, "Success"), inp(result, "Success"))

    compiled(bp, LIBRARY_FUNCTIONS)
    return bp


# BPC_LundenSave -----------------------------------------------------------------------------------------------------

def component(save_bp):
    bp = blueprint(COMPONENT, u.ActorComponent)
    remove_functions(bp, COMPONENT_FUNCTIONS)  # also clears the event graph, including a new Blueprint's ghost events
    have = {str(n) for n in BP.list_member_variable_names(bp)}
    for name, kind in (("SaveIntervalSeconds", REAL), ("RetrySeconds", REAL), ("Restored", BOOL)):
        if name not in have and not BP.add_member_variable(bp, name, kind):
            raise RuntimeError("Could not add the variable " + name)
    BP.compile_blueprint(bp)
    sg_path = save_bp.generated_class().get_path_name()
    lib = class_path(LIBRARY)
    me = bp.generated_class().get_path_name()
    controller_pin = "AsPlayer Controller"

    def owner_controller(g, after):
        owner = g.call("ActorComponent:GetOwner", 250, 200)
        cast = g.cast(u.PlayerController.static_class(), 500, 0)
        link(after, inp(cast, "execute"))
        link(out(owner, "ReturnValue"), inp(cast, "Object"))
        pawn = g.call("Controller:K2_GetPawn", 750, 250)
        link(out(cast, controller_pin), inp(pawn, "self"))
        valid = g.call("KismetSystemLibrary:IsValid", 1000, 250)
        link(out(pawn, "ReturnValue"), inp(valid, "Object"))
        branch = g.branch(1000, 0)
        link(out(cast, "then"), inp(branch, "execute"))
        link(out(valid, "ReturnValue"), inp(branch, "Condition"))
        return cast, pawn, branch

    def answer(g, pin, name, text, x, y):
        node = g.ret(x, y)
        link(pin, inp(node, "execute"))
        value(node, name, text)

    # RestorePlace() -> Restored: the saved place and facing, when the save was made on this map
    g, _, result = function(bp, "RestorePlace", [], [("Restored", BOOL)])
    cast, pawn, has_pawn = owner_controller(g, start(g))
    answer(g, out(cast, "CastFailed"), "Restored", "false", 750, -250)
    answer(g, out(has_pawn, "else"), "Restored", "false", 1250, 250)
    load = g.call(lib + ":LoadSave", 1250, 0)
    link(out(has_pawn, "then"), inp(load, "execute"))
    saved_map = g.get("PlaceMap", sg_path, 1250, 400)
    link(out(load, "Save"), inp(saved_map, "self"))
    here = g.call("GameplayStatics:GetCurrentLevelName", 1250, 550)
    same = g.call("KismetStringLibrary:EqualEqual_StrStr", 1500, 400)
    link(out(saved_map, "PlaceMap"), inp(same, "A"))
    link(out(here, "ReturnValue"), inp(same, "B"))
    known = g.call("KismetStringLibrary:IsEmpty", 1500, 600)
    link(out(saved_map, "PlaceMap"), inp(known, "InString"))
    unknown = g.call("KismetMathLibrary:Not_PreBool", 1700, 600)
    link(out(known, "ReturnValue"), inp(unknown, "A"))
    usable = g.call("KismetMathLibrary:BooleanAND", 1900, 450)
    link(out(same, "ReturnValue"), inp(usable, "A"))
    link(out(unknown, "ReturnValue"), inp(usable, "B"))
    link(out(load, "then"), inp(here, "execute"))
    here_branch = g.branch(1900, 0)
    link(out(here, "then"), inp(here_branch, "execute"))
    link(out(usable, "ReturnValue"), inp(here_branch, "Condition"))
    answer(g, out(here_branch, "else"), "Restored", "false", 2150, 300)
    where = g.get("PlaceLocation", sg_path, 1900, 750)
    link(out(load, "Save"), inp(where, "self"))
    facing = g.get("PlaceRotation", sg_path, 1900, 900)
    link(out(load, "Save"), inp(facing, "self"))
    split = g.call("KismetMathLibrary:BreakRotator", 2150, 900)
    link(out(facing, "PlaceRotation"), inp(split, "InRot"))
    body = g.call("KismetMathLibrary:MakeRotator", 2400, 900)  # the body turns with the yaw only; the view keeps pitch
    link(out(split, "Yaw"), inp(body, "Yaw"))
    # K2_TeleportTo checks the capsule there and moves it to the nearest free spot (or refuses) if something stands
    # where the player stood when the save was made
    move = g.call("Actor:K2_TeleportTo", 2150, 0)
    link(out(here_branch, "then"), inp(move, "execute"))
    link(out(pawn, "ReturnValue"), inp(move, "self"))
    link(out(where, "PlaceLocation"), inp(move, "DestLocation"))
    link(out(body, "ReturnValue"), inp(move, "DestRotation"))
    look = g.call("Controller:SetControlRotation", 2450, 0)
    link(out(move, "then"), inp(look, "execute"))
    link(out(cast, controller_pin), inp(look, "self"))
    link(out(facing, "PlaceRotation"), inp(look, "NewRotation"))
    g.at(result, 2750, 0)
    link(out(look, "then"), inp(result, "execute"))
    link(out(move, "ReturnValue"), inp(result, "Restored"))

    # SavePlace() -> Saved: this map, the pawn's location and the control rotation, written at once
    g, _, result = function(bp, "SavePlace", [], [("Saved", BOOL)])
    cast, pawn, has_pawn = owner_controller(g, start(g))
    answer(g, out(cast, "CastFailed"), "Saved", "false", 750, -250)
    answer(g, out(has_pawn, "else"), "Saved", "false", 1250, 250)
    load = g.call(lib + ":LoadSave", 1250, 0)
    link(out(has_pawn, "then"), inp(load, "execute"))
    here = g.call("GameplayStatics:GetCurrentLevelName", 1250, 400)
    link(out(load, "then"), inp(here, "execute"))
    previous = out(here, "then")
    where = g.call("Actor:K2_GetActorLocation", 1250, 550)
    link(out(pawn, "ReturnValue"), inp(where, "self"))
    facing = g.call("Controller:GetControlRotation", 1250, 700)
    link(out(cast, controller_pin), inp(facing, "self"))
    for i, (field, source) in enumerate((("PlaceMap", here), ("PlaceLocation", where), ("PlaceRotation", facing))):
        put = g.set(field, sg_path, 1550 + i * 280, 0)
        link(previous, inp(put, "execute"))
        link(out(load, "Save"), inp(put, "self"))
        link(out(source, "ReturnValue"), inp(put, field))
        previous = out(put, "then")
    write = g.call(lib + ":WriteSave", 2400, 0)
    link(previous, inp(write, "execute"))
    link(out(load, "Save"), inp(write, "Save"))
    g.at(result, 2700, 0)
    link(out(write, "then"), inp(result, "execute"))
    link(out(write, "Success"), inp(result, "Saved"))
    BP.compile_blueprint(bp)

    # AutoSave(): the timer target (a timer function takes no parameters and returns nothing)
    g, _, _ = function(bp, "AutoSave", [], [])
    saver = g.call(me + ":SavePlace", 250, 0)
    link(start(g), inp(saver, "execute"))

    # TryRestore(): once a pawn is possessed, restore the place once, stop retrying and start saving
    g, _, _ = function(bp, "TryRestore", [], [])
    cast, pawn, has_pawn = owner_controller(g, start(g))
    restore = g.call(me + ":RestorePlace", 1250, 0)
    link(out(has_pawn, "then"), inp(restore, "execute"))
    done = g.set("Restored", me, 1550, 0)
    link(out(restore, "then"), inp(done, "execute"))
    value(done, "Restored", "true")
    stop = g.call("KismetSystemLibrary:K2_ClearTimer", 1850, 0)
    link(out(done, "then"), inp(stop, "execute"))
    value(stop, "FunctionName", "TryRestore")
    every = g.call("KismetSystemLibrary:K2_SetTimer", 2150, 0)
    link(out(stop, "then"), inp(every, "execute"))
    value(every, "FunctionName", "AutoSave")
    link(out(g.get("SaveIntervalSeconds", me, 1850, 300), "SaveIntervalSeconds"), inp(every, "Time"))
    value(every, "bLooping", "true")
    BP.compile_blueprint(bp)

    # BeginPlay: try at once, else retry every RetrySeconds; EndPlay: save the place one last time
    g = Graph(GRAPH.get_graph_editor_by_name(bp, "EventGraph"))
    begin = g.g.create_node_from_name("AddEvent|EventBeginPlay", u.Vector2D(0, 0), []) \
        or BP.add_event_override(bp, "ReceiveBeginPlay", u.IntPoint(0, 0))
    g.at(begin, 0, 0)
    first = g.call(me + ":TryRestore", 250, 0)
    link(out(begin, "then"), inp(first, "execute"))
    waiting = g.branch(550, 0)
    link(out(first, "then"), inp(waiting, "execute"))
    link(out(g.get("Restored", me, 350, 200), "Restored"), inp(waiting, "Condition"))
    retry = g.call("KismetSystemLibrary:K2_SetTimer", 850, 100)
    link(out(waiting, "else"), inp(retry, "execute"))
    value(retry, "FunctionName", "TryRestore")
    link(out(g.get("RetrySeconds", me, 600, 300), "RetrySeconds"), inp(retry, "Time"))
    value(retry, "bLooping", "true")
    end = g.g.create_node_from_name("AddEvent|EventEndPlay", u.Vector2D(0, 600), []) \
        or BP.add_event_override(bp, "ReceiveEndPlay", u.IntPoint(0, 600))
    g.at(end, 0, 600)
    ready = g.branch(300, 600)
    link(out(end, "then"), inp(ready, "execute"))
    link(out(g.get("Restored", me, 100, 800), "Restored"), inp(ready, "Condition"))
    last = g.call(me + ":SavePlace", 550, 600)
    link(out(ready, "then"), inp(last, "execute"))

    compiled(bp, COMPONENT_FUNCTIONS + ("EventGraph",))
    default = u.get_default_object(bp.generated_class())
    default.set_editor_property("SaveIntervalSeconds", SAVE_INTERVAL)
    default.set_editor_property("RetrySeconds", RETRY)
    default.set_editor_property("Restored", False)
    return bp


def save(asset):
    if not ASSETS.save_loaded_asset(asset, only_if_is_dirty=False):
        raise RuntimeError(f"Could not save {asset.get_path_name()} (is its .uasset locked with git lfs lock?)")


def v0_fixture(target):
    """The frozen save of the layout before SaveVersion and PlayerId: written with the current class but only the
    fields version 0 had, which serializes exactly as a version-0 build would (defaults are not stored)."""
    sg = u.load_class(None, class_path(SAVE))
    save_obj = u.GameplayStatics.create_save_game_object(sg)
    save_obj.set_editor_properties({
        "PlayerName": "Gammal sparfil", "LookCode": "v0-look-2288", "PlaceMap": "L_Lunden",
        "PlaceLocation": u.Vector(123.4, -567.8, 92.5), "PlaceRotation": u.Rotator(roll=0.0, pitch=-12.5, yaw=37.25)})
    slot = "build-save-v0-fixture"
    if not u.GameplayStatics.save_game_to_slot(save_obj, slot, USER):
        raise RuntimeError("Could not write the v0 fixture")
    written = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_saved_dir())) / "SaveGames" / (slot + ".sav")
    data = written.read_bytes()
    for absent in (b"SaveVersion", b"PlayerId", b"Settings"):
        if absent in data:
            raise RuntimeError(f"The v0 fixture stores {absent.decode()}: its default must be the empty value")
    Path(target).parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(written, target)
    written.unlink()
    u.log(f"LUNDEN_SAVE v0 fixture {target}: {len(data)} bytes, sha256 {hashlib.sha256(data).hexdigest()}")


def main(argv):
    if "--v0-fixture" in argv:
        v0_fixture(argv[argv.index("--v0-fixture") + 1])
        u.log("LUNDEN_SAVE_OK")
        return
    spec = hashlib.sha256(Path(__file__).read_text(encoding="utf-8").encode()).hexdigest()
    present = all(ASSETS.does_asset_exist(p) for p in (SAVE, LIBRARY, COMPONENT))
    stored = ASSETS.get_metadata_tag(ASSETS.load_asset(COMPONENT), SPEC_TAG) if present else ""
    if "--check" in argv:
        if stored != spec:
            raise RuntimeError(f"{DIR} is not built by this script (stored {stored[:16]}, want {spec[:16]})")
        u.log(f"LUNDEN_SAVE {DIR}: check passed, spec {spec[:16]}")
    elif stored == spec and "--force" not in argv:
        u.log(f"LUNDEN_SAVE {DIR}: unchanged, nothing saved; spec {spec[:16]}")
    else:
        save_bp = save_class()
        save(save_bp)
        lib = library(save_bp)
        save(lib)
        comp = component(save_bp)
        ASSETS.set_metadata_tag(comp, SPEC_TAG, spec)
        save(comp)
        u.log(f"LUNDEN_SAVE {DIR}: saved SG_LundenSave, BFL_LundenSave, BPC_LundenSave; version {VERSION}; spec {spec[:16]}")
    u.log("LUNDEN_SAVE_OK")


main(sys.argv[1:])
