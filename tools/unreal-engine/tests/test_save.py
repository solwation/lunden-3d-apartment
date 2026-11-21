"""#2288: the save file (/Game/Lunden/Save) in the editor and in Play In Editor.

1. Migration: the frozen version-0 file tools/unreal-engine/tests/save-v0.sav (written by build_save.py --v0-fixture:
   no SaveVersion, no PlayerId) is put in the slot; BFL_LundenSave.LoadSave reads it, keeps name, look code, map,
   location and facing, adds a web-shaped player id, stamps SaveVersion 1 and writes it back; a second load returns
   the same id without a new migration.
2. PIE session 1 with the world's GameMode on a temporary level, from an empty slot: BP_LundenPlayerController
   carries BPC_LundenSave (player-extensions.json). The test sets settings, name and look code through the library,
   moves the player to a new spot and facing, waits for the autosave and ends the session.
3. The slot on disk (read without the game) holds that place within 1 cm and 1 degree.
4. PIE session 2 (the restart; nothing but the file carries state): the player starts at the saved place within 1 cm
   and the saved facing within 1 degree, and settings, name, look code and player id are equal. A save made on another
   map is not applied.

Run like the other PIE tests: copy this file to unreal/Lunden/Content/Python/ (untracked) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_save
Writes Saved/save-result.json and logs LUNDEN_SAVE_TEST lines, then LUNDEN_SAVE_TEST_OK.
The test deletes and rewrites the editor's own slot (unreal/Lunden/Saved/SaveGames/LundenSave.sav).
"""
import json
from pathlib import Path
import re
import shutil
import time
import unreal as u

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
TESTS = PROJECT.parents[1] / "tools/unreal-engine/tests"
WORLD = json.loads((PROJECT.parents[1] / "tools/unreal-engine/world-levels.json").read_text(encoding="utf-8"))
SAVED = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_saved_dir()))
SLOT = "LundenSave"
FILE = SAVED / "SaveGames" / (SLOT + ".sav")
LIBRARY = "/Game/Lunden/Save/BFL_LundenSave.BFL_LundenSave_C"
COMPONENT = "/Game/Lunden/Save/BPC_LundenSave.BPC_LundenSave_C"
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
SETTINGS = {"mouse.sensitivity": "0.42", "mouse.invertY": "true", "audio.master": "0.8", "graphics.quality": "medium"}
NAME, LOOK = "Testspelare 2288", "a1b2c3d4-look"
TARGET = u.Vector(1234.5, -678.9, 100.0)  # dropped from 100 cm onto the ground; the test reads where it settles
FACING = u.Rotator(roll=0.0, pitch=-12.6, yaw=137.3)

library = u.get_default_object(u.load_class(None, LIBRARY))
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
result = {"engine": u.SystemLibrary.get_engine_version(), "slot": str(FILE)}


def call(name, *args):
    """A BFL_LundenSave function; the library's hidden world context is its last parameter."""
    world = editor.get_game_world() or editor.get_editor_world()
    return library.call_method(name, (*args, world))


def disk():
    """The slot as stored, read straight from the file without the game."""
    save = u.GameplayStatics.load_game_from_slot(SLOT, 0)
    if not save:
        raise RuntimeError(f"No readable save at {FILE}")
    return save


def xyz(v):
    return [round(v.x, 3), round(v.y, 3), round(v.z, 3)]


def pyr(r):
    return [round(r.pitch, 3), round(r.yaw, 3), round(r.roll, 3)]


def angle(a, b):
    return abs((a - b + 180.0) % 360.0 - 180.0)


def place_error(location, rotation, want_location, want_rotation):
    return ((location - want_location).length(),
            max(angle(rotation.pitch, want_rotation.pitch), angle(rotation.yaw, want_rotation.yaw)))


# 1. Migration of the frozen version-0 file -------------------------------------------------------------------------
fixture = (TESTS / "save-v0.sav").read_bytes()
for absent in (b"SaveVersion", b"PlayerId"):
    if absent in fixture:
        raise RuntimeError(f"save-v0.sav is not a version-0 file: it stores {absent.decode()}")
FILE.parent.mkdir(parents=True, exist_ok=True)
FILE.write_bytes(fixture)
if disk().get_editor_property("SaveVersion") != 0:
    raise RuntimeError("save-v0.sav does not read as version 0")
migrated = call("LoadSave")
got = {k: migrated.get_editor_property(k) for k in ("SaveVersion", "PlayerName", "LookCode", "PlaceMap", "PlayerId")}
location, rotation = migrated.get_editor_property("PlaceLocation"), migrated.get_editor_property("PlaceRotation")
want = {"SaveVersion": 1, "PlayerName": "Gammal sparfil", "LookCode": "v0-look-2288", "PlaceMap": "L_Lunden"}
wrong = {k: got[k] for k in want if got[k] != want[k]}
distance, turn = place_error(location, rotation, u.Vector(123.4, -567.8, 92.5), u.Rotator(roll=0, pitch=-12.5, yaw=37.25))
if wrong or not UUID.match(got["PlayerId"]) or distance > 0.001 or turn > 0.001:
    raise RuntimeError(f"Migration of save-v0.sav gave {got}, place off by {distance} cm / {turn} deg; wrong {wrong}")
stored = disk()
rewritten = FILE.read_bytes()
if stored.get_editor_property("SaveVersion") != 1 or stored.get_editor_property("PlayerId") != got["PlayerId"] \
        or b"SaveVersion" not in rewritten:
    raise RuntimeError("The migrated save was not written back at version 1 with its new id")
again = call("LoadSave")
if again.get_editor_property("PlayerId") != got["PlayerId"] or FILE.read_bytes() != rewritten:
    raise RuntimeError("A second load of a migrated save changed it")
result["migration"] = {"from": "tests/save-v0.sav", "fixtureBytes": len(fixture), **{k: str(v) for k, v in got.items()},
                       "placeErrorCm": distance, "facingErrorDeg": turn}
u.log(f"LUNDEN_SAVE_TEST migration {json.dumps(result['migration'])}")

# 2. Temporary level with the world's GameMode, from an empty slot ---------------------------------------------------
FILE.unlink()
actors = u.get_editor_subsystem(u.EditorActorSubsystem)
world = u.EditorLoadingAndSavingUtils.new_blank_map(False)
world.get_world_settings().set_editor_property("default_game_mode", u.load_class(None, WORLD["gameMode"]))
ground = actors.spawn_actor_from_class(u.StaticMeshActor, u.Vector(0, 0, -10))
ground.static_mesh_component.set_static_mesh(u.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube"))
ground.static_mesh_component.set_collision_profile_name("BlockAll")
ground.set_actor_scale3d(u.Vector(80, 80, 0.2))  # 80 m square, top at z = 0
START = u.Vector(-2000, -2000, 100)
actors.spawn_actor_from_class(u.PlayerStart, START)


@u.AutomationScheduler.add_latent_command
def save_test():
    try:
        def session():
            levels.editor_request_begin_play()
            deadline = time.monotonic() + 60
            while True:
                game = editor.get_game_world()
                pc = u.GameplayStatics.get_player_controller(game, 0) if game else None
                pawn = pc.get_controlled_pawn() if pc else None
                if pawn:
                    break
                if time.monotonic() > deadline:
                    raise RuntimeError("PIE did not possess a pawn")
                yield
            comps = pc.get_components_by_class(u.load_class(None, COMPONENT))
            if pc.get_class().get_name() != "BP_LundenPlayerController_C" or len(comps) != 1:
                raise RuntimeError(f"{pc.get_class().get_name()} carries {len(comps)} BPC_LundenSave (want 1): "
                                   "add the player-extensions.json row and run build_player.py")
            for _ in range(10):  # BeginPlay and the first TryRestore
                yield
            if not comps[0].get_editor_property("Restored"):
                raise RuntimeError("BPC_LundenSave did not run TryRestore")
            state.update(game=game, pc=pc, pawn=pawn, save=comps[0])

        def stop():
            levels.editor_request_end_play()
            while editor.get_game_world():
                yield

        def settle(seconds):
            until = time.monotonic() + seconds
            while time.monotonic() < until:
                yield

        state = {}
        # Session 1: a first start writes a new save; then settings, name, look and a new place
        yield from session()
        if not FILE.exists():
            raise RuntimeError("The first start did not create the save")
        first_id = call("GetPlayerId")
        if not UUID.match(first_id):
            raise RuntimeError(f"New player id {first_id!r} is not shaped like crypto.randomUUID()")
        for key, text in SETTINGS.items():
            if not call("SetSetting", key, text):
                raise RuntimeError("SetSetting failed for " + key)
        if not call("SetPlayerName", NAME) or not call("SetLookCode", LOOK):
            raise RuntimeError("SetPlayerName or SetLookCode failed")
        pawn, pc = state["pawn"], state["pc"]
        pawn.set_actor_location(TARGET, False, True)
        pc.set_control_rotation(FACING)
        yield from settle(3.0)  # lands, stands still, and the 2 s autosave has run after that
        left_at, facing = pawn.get_actor_location(), pc.get_control_rotation()
        u.log(f"LUNDEN_SAVE_TEST session 1 ends at {left_at}, facing {facing}")
        yield from stop()

        # The file alone, read without the game
        stored = disk()
        distance, turn = place_error(stored.get_editor_property("PlaceLocation"), stored.get_editor_property("PlaceRotation"),
                                     left_at, facing)
        result["file"] = {"bytes": FILE.stat().st_size, "map": stored.get_editor_property("PlaceMap"),
                          "placeErrorCm": distance, "facingErrorDeg": turn,
                          "version": stored.get_editor_property("SaveVersion")}
        u.log(f"LUNDEN_SAVE_TEST file {json.dumps(result['file'])}")
        if distance > 1.0 or turn > 1.0 or stored.get_editor_property("SaveVersion") != 1:
            raise RuntimeError(f"The saved place is off by {distance} cm / {turn} deg")

        # Session 2: the restart
        yield from session()
        yield from settle(0.5)
        pawn, pc = state["pawn"], state["pc"]
        back_at, back_facing = pawn.get_actor_location(), pc.get_control_rotation()
        distance, turn = place_error(back_at, back_facing, left_at, facing)
        settings = {key: call("GetSetting", key, "missing") for key in SETTINGS}
        missing = call("GetSetting", "not.saved", "fallback")
        same = {"name": call("GetPlayerName"), "look": call("GetLookCode"), "id": call("GetPlayerId")}
        result["restart"] = {"playerStart": xyz(START), "left": xyz(left_at), "back": xyz(back_at),
                             "fromPlayerStartCm": round((back_at - START).length(), 1), "placeErrorCm": distance,
                             "facing": pyr(facing), "backFacing": pyr(back_facing), "facingErrorDeg": turn,
                             "settings": {k: list(v) for k, v in settings.items()}, "unknownSetting": list(missing),
                             **same}
        u.log(f"LUNDEN_SAVE_TEST restart {json.dumps(result['restart'])}")
        if distance > 1.0 or turn > 1.0:
            raise RuntimeError(f"Restored {distance} cm / {turn} deg from where session 1 ended")
        if any(tuple(v) != (SETTINGS[k], True) for k, v in settings.items()) or tuple(missing) != ("fallback", False):
            raise RuntimeError(f"Settings after the restart: {settings}, unknown {missing}")
        if same != {"name": NAME, "look": LOOK, "id": first_id}:
            raise RuntimeError(f"Name, look or id changed over the restart: {same}")

        # A save from another map is not applied
        other = disk()
        other.set_editor_property("PlaceMap", "AnotherMap")
        u.GameplayStatics.save_game_to_slot(other, SLOT, 0)
        before = pawn.get_actor_location()
        applied = state["save"].call_method("RestorePlace")
        moved = (before - pawn.get_actor_location()).length()
        result["otherMap"] = {"restored": applied, "movedCm": moved}
        if applied or moved > 0.01:
            raise RuntimeError(f"A save from another map was applied: {result['otherMap']}")
        yield from stop()
        (SAVED / "save-result.json").write_text(json.dumps(result, indent=2) + "\n")
        u.log("LUNDEN_SAVE_TEST_OK")
    finally:
        if editor.get_game_world():
            levels.editor_request_end_play()
