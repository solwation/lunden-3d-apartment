"""Exercise #2293 through the production pawn, #2292's file exchange and #2285 door events in PIE."""
import codecs
import csv
import io
import json
from pathlib import Path
import sys
import tempfile
import time
import unreal as u

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
TOOLS = PROJECT.parents[1] / "tools/unreal-engine"
sys.path.insert(0, str(TOOLS / "tests"))
import save_isolation

def cls(path):
    return u.load_class(None, path + "." + path.rsplit("/", 1)[1] + "_C")


def snapshot(path, data, welcome=""):
    escapes = [("\\", "\\\\"), ("\n", "\\n"), ("\r", "\\r"), ("\t", "\\t"), ("'", "\\'"), ('"', '\\"')]
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["Key", "SourceString"])
        for key, text in [("Packet", "1\tlocal"), ("Events", welcome), ("Shared", data)]:
            for char, encoded in escapes:
                text = text.replace(char, encoded)
            writer.writerow([key, text])


def packet(file):
    data = file.read_bytes()
    text = data.decode("utf-16" if data.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)) else "utf-8-sig")
    return next(csv.DictReader(io.StringIO(text)))["SourceString"].replace("\\t", "\t")


def output(net):
    return packet(Path(net.get_editor_property("LastGameFile")))


def actual_drop(pawn, folder, height, nr):
    movement = pawn.get_editor_property("character_movement")
    half = pawn.get_editor_property("capsule_component").get_scaled_capsule_half_height()
    pawn.set_actor_location(u.Vector(0, 0, half + 2), False, True)
    movement.set_movement_mode(u.MovementMode.MOVE_WALKING)
    pawn.set_actor_location(u.Vector(0, 0, half + height * 100), False, True)
    movement.set_movement_mode(u.MovementMode.MOVE_FALLING)
    deadline = time.monotonic() + 10
    prefix = f"shared\tfall\t{nr}\t"
    while True:
        for file in folder.glob("game-*.csv"):
            offer = packet(file)
            if offer.startswith(prefix):
                _, _, _, drop, gap = offer.split("\t")
                assert abs(float(drop) - height) < .1 and abs(float(drop) - float(gap)) < .001
                return
        if time.monotonic() >= deadline:
            raise RuntimeError(f"OnLanded did not offer the {height} m drop")
        yield


fixture = json.loads((TOOLS / "wire/shared-room.json").read_text(encoding="utf-8"))
mode = json.loads((TOOLS / "world-levels.json").read_text(encoding="utf-8"))["gameMode"]
shared_class = cls("/Game/Lunden/Network/Shared/BPC_LundenSharedRoom")
ids = dict(u.get_default_object(shared_class).get_editor_property("DoorIds"))
assert "w1" in ids.values() and "q0" in ids.values()
actor_id = next(key for key, wire in ids.items() if wire == "w1")
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
actors = u.get_editor_subsystem(u.EditorActorSubsystem)
world = u.EditorLoadingAndSavingUtils.new_blank_map(False)
world.get_world_settings().set_editor_property("default_game_mode", u.load_class(None, mode))
ground = actors.spawn_actor_from_class(u.StaticMeshActor, u.Vector(0, 0, -50))
ground.static_mesh_component.set_static_mesh(u.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube"))
ground.static_mesh_component.set_collision_profile_name("BlockAll")
ground.set_actor_scale3d(u.Vector(600, 600, 1))
actors.spawn_actor_from_class(u.PlayerStart, u.Vector(0, 0, 100))
door = actors.spawn_actor_from_class(cls("/Game/Lunden/Blueprints/PilotDoors/BP_LundenSwingDoor"), u.Vector(500, 0, 0))
door.set_editor_property("Id", actor_id)
door.set_editor_property("Seconds", 0.3)
door.tags = ["shared-door"]
saved = save_isolation.isolate()
levels.editor_request_begin_play()


@u.AutomationScheduler.add_latent_command
def shared_room_test():
    try:
        deadline = time.monotonic() + 60
        while True:
            game = editor.get_game_world()
            pawn = u.GameplayStatics.get_player_character(game, 0) if game else None
            shared = pawn.get_component_by_class(shared_class) if pawn else None
            if shared and shared.get_editor_property("DoorListener") and shared.get_editor_property("ChatWidget"):
                break
            if time.monotonic() >= deadline:
                raise RuntimeError("The production pawn did not activate its room listener")
            yield
        door, = u.GameplayStatics.get_all_actors_with_tag(game, "shared-door")
        net = pawn.get_component_by_class(cls("/Game/Lunden/Network/BPC_LundenNetwork"))
        with tempfile.TemporaryDirectory(dir=PROJECT / "Saved") as root:
            src = Path(root) / "peers.csv"
            encoded = root.replace("%", "%25").replace(" ", "%20").replace(",", "%2C").replace(")", "%29")
            net.call_method("ConfigureBridge", ("-LundenPlayersBridge=" + encoded,))
            try:
                poses = json.loads((TOOLS / "wire/shared-avatar-poses.json").read_text(encoding="utf-8"))["poses"]
                save = u.get_default_object(cls("/Game/Lunden/Save/BFL_LundenSave"))
                for row in poses:
                    assert save.call_method("SetLookCode", (row["appearance"], game))
                    net.call_method("RefreshProfile")
                    fields = net.call_method("FormatFrame", (u.Vector(*row["feet"]), row["yaw"], row["pitch"],
                                            row["crouch"], row["pose"], row["headYaw"])).split("\n")
                    assert fields[2] == row["appearance"] and fields[8:10] == [str(int(row["crouch"])), str(row["pose"])]
                    actual = [float(f) for f in [*fields[3:8], fields[10]]]
                    expected = [*row["feet"], row["yaw"], row["pitch"], row["headYaw"]]
                    assert all(abs(a - e) < .001 for a, e in zip(actual, expected)), row["case"]
                snapshot(src, "1\tlocal\t10\t10\t1\tw1", '1\tw\tlocal\t{"t":"w","i":"local"}')
                count = net.get_editor_property("NextSequence")
                net.call_method("ReadPeers")  # actual imported table and welcome listener
                assert door.get_editor_property("TargetOpen") and door.get_editor_property("ChangeCount") == 1
                assert count == net.get_editor_property("NextSequence"), "remote open echoed to the worker"
                pawn.call_method("UpdateRoomLife")
                assert pawn.get_editor_property("Lives") == 10
                yield from actual_drop(pawn, Path(root), 4, 1)
                assert pawn.get_editor_property("Lives") == 10, "predicted damage before the worker replied"
                pending = net.get_editor_property("NextSequence")
                assert pawn.call_method("OfferRoomLanding", (400., True))
                assert pending == net.get_editor_property("NextSequence"), "re-offered a fall while its acknowledgement was pending"
                snapshot(src, fixture["sharedSnapshot"])
                net.call_method("ReadPeers")
                shared.call_method("RefreshShared")
                pawn.call_method("UpdateRoomLife")
                assert pawn.get_editor_property("Lives") == 5 and pawn.get_editor_property("LastFallDamage") == 5
                assert list(shared.get_editor_property("ChatLines")) == ["Webb: Hej"]
                assert shared.get_editor_property("RoomLives") == 5 and not shared.get_editor_property("WasRevived")
                door.call_method("ToggleDoor")
                assert not door.get_editor_property("TargetOpen") and output(net) == "shared\tdr\tw1\t0"
                widget = shared.get_editor_property("ChatWidget")
                assert isinstance(widget.get_parent(), u.CanvasPanel), "chat did not mount on the real HUD"
                widget.call_method("UpdateChat")
                assert widget.get_editor_property("ShownHistory") == "Webb: Hej"
                widget.call_method("OpenChat")
                assert widget.get_editor_property("Editing")
                draft = widget.get_editor_property("Draft")
                text = u.Text('Hej "%')
                draft.set_text(text)
                # Stock UEditableTextBox::SetText updates its field before Slate's callback, so it never
                # broadcasts OnTextChanged. Dispatch the same bound UMG delegate a real edit uses.
                draft.get_editor_property("on_text_changed").broadcast(text)
                assert output(net) == "shared\tk\t1"
                widget.call_method("Submit")
                assert not widget.get_editor_property("Editing")
                rows = [packet(file) for file in Path(root).glob("game-*.csv")]
                assert rows.count("shared\tm\tHej %22%25") == 1 and "shared\tk\t0" in rows
                shared.call_method("SendTyping", (True,))
                assert output(net) == "shared\tk\t1"
                deaths = pawn.get_editor_property("Deaths")
                wakes = pawn.get_editor_property("Revives")
                yield from actual_drop(pawn, Path(root), 7, 2)
                assert pawn.get_editor_property("Lives") == 5 and pawn.get_editor_property("Deaths") == deaths
                snapshot(src, fixture["recoveredSnapshot"])
                net.call_method("ReadPeers")
                shared.call_method("RefreshShared")
                for _ in range(2):
                    pawn.call_method("UpdateRoomLife")
                    assert pawn.get_editor_property("Lives") == 10 and pawn.get_editor_property("Deaths") == deaths + 1
                assert shared.get_editor_property("RoomLives") == 10 and shared.get_editor_property("WasRevived")
                deadline = time.monotonic() + 10
                while pawn.get_editor_property("Revives") == wakes:
                    if time.monotonic() >= deadline:
                        raise RuntimeError("Confirmed fall did not complete the normal blackout and wake")
                    yield
                assert pawn.get_editor_property("Revives") == wakes + 1
                assert list(shared.get_editor_property("ChatLines")) == ["Webb: Hej"]
                snapshot(src, "1\t\t-1\t-1\t4\t")
                net.call_method("ReadPeers")
                shared.call_method("RefreshShared")
                assert not shared.call_method("SendChat", ("offline",))
                assert not shared.get_editor_property("ChatLines") and not shared.get_editor_property("FallPending")
            finally:
                net.call_method("ConfigureBridge", ("",))
        u.log("LUNDEN_NETWORK_SHARED_TEST_OK")
    finally:
        if editor.get_game_world():
            levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved, editor)
