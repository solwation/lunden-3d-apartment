"""#2292: actual Shipping-compatible presence nodes in Play In Editor, with an isolated save and IPC directory.

Install this test in Content/Python and run Editor.Python.Lunden.test_network. Build the Network
assets and the production Player before running. The separate live test adds the real launcher and Worker.
"""
import codecs
import csv
import io
import json
import math
from pathlib import Path
import sys
import tempfile
import time

import unreal as u

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
TOOLS = PROJECT.parents[1] / "tools/unreal-engine"
sys.path.insert(0, str(TOOLS / "tests"))
import save_isolation

WIRE = json.loads((TOOLS / "wire/players.json").read_text(encoding="utf-8"))
MODE = json.loads((TOOLS / "world-levels.json").read_text(encoding="utf-8"))["gameMode"]
NET = "/Game/Lunden/Network/BPC_LundenNetwork.BPC_LundenNetwork_C"
SAVE = "/Game/Lunden/Save/BFL_LundenSave.BFL_LundenSave_C"
NAME = """Test %22\\n'","""
LOOK = "000000000175"
ENCODED_NAME = "Test %2522%5Cn%27%22,"
ESCAPES = (("\\", "\\\\"), ("\n", "\\n"), ("\r", "\\r"), ("\t", "\\t"), ("'", "\\'"), ('"', '\\"'))


def saved_packet(file):
    data = file.read_bytes()
    text = data.decode("utf-16" if data.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)) else "utf-8-sig")
    rows = list(csv.DictReader(io.StringIO(text, newline="")))
    assert len(rows) == 1 and rows[0]["Key"] == "Packet", "unexpected game.csv keys"
    packet = rows[0]["SourceString"]
    for char, escaped in reversed(ESCAPES):
        packet = packet.replace(escaped, char)
    return packet


def write_peers(file, packet):
    for char, escaped in ESCAPES:
        packet = packet.replace(char, escaped)
    with file.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerows((("Key", "SourceString"), ("Packet", packet)))


def check_values(got, expected, tolerance=0.002):
    assert len(got) == len(expected) and all(math.isclose(float(a), b, abs_tol=tolerance)
                                             for a, b in zip(got, expected)), (got, expected)


editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
world = u.EditorLoadingAndSavingUtils.new_blank_map(False)
world.get_world_settings().set_editor_property("default_game_mode", u.load_class(None, MODE))
actors = u.get_editor_subsystem(u.EditorActorSubsystem)
ground = actors.spawn_actor_from_class(u.StaticMeshActor, u.Vector(0, 0, -50))
ground.static_mesh_component.set_static_mesh(u.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube"))
ground.static_mesh_component.set_collision_profile_name("BlockAll")
ground.set_actor_scale3d(u.Vector(100, 100, 1))
actors.spawn_actor_from_class(u.PlayerStart, u.Vector(0, 0, 100))
saved_slot = save_isolation.isolate()
levels.editor_request_begin_play()


@u.AutomationScheduler.add_latent_command
def network_test():
    try:
        deadline = time.monotonic() + 60
        while True:
            game = editor.get_game_world()
            pawn = u.GameplayStatics.get_player_character(game, 0) if game else None
            if pawn:
                break
            if time.monotonic() >= deadline:
                raise RuntimeError("PIE did not possess the production character")
            yield
        net = pawn.get_component_by_class(u.load_class(None, NET))
        assert net is not None, "build_network.py, build_network_peers.py and build_player.py must run first"
        with tempfile.TemporaryDirectory(prefix="network test %29,)", dir=PROJECT / "Saved") as raw:
            folder = Path(raw)
            incoming = folder / "peers.csv"
            def last_file():
                return Path(net.get_editor_property("LastGameFile"))
            def consume():
                file = last_file()
                packet = saved_packet(file)
                file.unlink()
                return packet
            net.call_method("ConfigureBridge", ("-NoSound",))
            net.call_method("SyncPresence")
            assert not list(folder.glob("game-*.csv")) and net.get_editor_property("SessionPath") == ""
            store = u.get_default_object(u.load_class(None, SAVE))
            assert store.call_method("SetPlayerName", (NAME, game)) and store.call_method("SetLookCode", (LOOK, game))
            arg = raw.replace("%", "%25").replace(" ", "%20").replace(",", "%2C").replace(")", "%29")
            net.call_method("ConfigureBridge", ("-NoSound -LundenPlayersBridge=" + arg + " -Unattended",))
            assert net.get_editor_property("SessionPath") == raw
            assert net.get_editor_property("Appearance") == LOOK
            assert net.get_editor_property("DisplayName") == ENCODED_NAME
            assert net.call_method("SafeAppearance", ("0000000",)) == "0000000"
            for invalid in ("private-name", "v0-look-2288", "000000000\n1"):
                assert net.call_method("SafeAppearance", (invalid,)) == ""
            # A newly started pawn must skip an outstanding offer from the previous map.
            assert net.get_editor_property("NextSequence") == 1
            collision = folder / "game-1.csv"
            collision.write_bytes(b"prior map offer")
            for seq, case in enumerate(WIRE["coordinates"]["cases"], 2):
                unreal = case["unreal"]
                feet = unreal["feetCm"]
                rot = [unreal["yawDeg"], unreal.get("pitchDeg", 0)]
                head = unreal.get("headYawDeg", 0)
                pose = 1 if head else 0
                packet = net.call_method("FormatFrame", (u.Vector(*feet), *rot, False, pose, head))
                assert net.call_method("WritePacket", (packet,))
                assert last_file().name == f"game-{seq}.csv"
                fields = consume().split("\n")
                assert len(fields) == 11 and fields[:3] == ["1", ENCODED_NAME, LOOK]
                check_values(fields[3:], [*feet, *rot, 0, pose, head])

            assert collision.read_bytes() == b"prior map offer"
            collision.unlink()

            pc = pawn.get_controller()
            pc.set_control_rotation(u.Rotator(roll=0, pitch=-17, yaw=67))
            net.call_method("SyncPresence")
            pending = last_file()
            next_seq = net.get_editor_property("NextSequence")
            for _ in range(10):
                net.call_method("SyncPresence")
            assert net.get_editor_property("NextSequence") == next_seq and list(folder.glob("game-*.csv")) == [pending]
            p = consume().split("\n")
            loc = pawn.get_actor_location()
            check_values(p[3:8], [loc.x, loc.y, loc.z - pawn.capsule_component.get_scaled_capsule_half_height(), 67, -17])

            peer = "1\tself\nother\tTest\t000000000\t120\t-30\t0\t90\t5\t0\t0\t0\t0"
            write_peers(incoming, peer)
            net.call_method("SyncPresence")
            assert net.get_editor_property("LastPeersPacket") == peer
            write_peers(incoming, "2\tunknown-version")
            net.call_method("SyncPresence")
            assert net.get_editor_property("LastPeersPacket") == peer
            net.call_method("SetPresenceAway", (True,))
            net.call_method("SyncPresence")
            assert consume() == "away"
            write_peers(incoming, "1\t")
            net.call_method("SetPresenceAway", (False,))
            net.call_method("SyncPresence")
            assert consume().startswith("1\n") and net.get_editor_property("LastPeersPacket") == "1\t"
            seq = net.get_editor_property("NextSequence")
            net.call_method("ConfigureBridge", ("-LundenPlayersBridge=" + arg,))
            assert net.get_editor_property("NextSequence") == seq
            net.call_method("ConfigureBridge", ("",))  # EndPlay cannot recreate the private directory
        u.log("LUNDEN_NETWORK_TEST_OK")
    finally:
        if editor.get_game_world():
            levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
