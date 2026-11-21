"""#2292: subscribe to the stock game's presence notifications in PIE.

The same peers.csv snapshots can be consumed with or without a listener. Run
Editor.Python.Lunden.test_network_events after building the Network and Player assets.
"""
import csv
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

LISTENER = "/Game/Lunden/Network/BP_LundenNetworkListener.BP_LundenNetworkListener_C"
NETWORK = "/Game/Lunden/Network/BPC_LundenNetwork.BPC_LundenNetwork_C"
MODE = json.loads((TOOLS / "world-levels.json").read_text(encoding="utf-8"))["gameMode"]
ESCAPES = (("\\", "\\\\"), ("\n", "\\n"), ("\r", "\\r"), ("\t", "\\t"), ("'", "\\'"), ('"', '\\"'))


def offer(file, packet, events):
    with file.open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.writer(stream)
        writer.writerow(("Key", "SourceString"))
        for key, value in (("Packet", packet), ("Events", "\n".join(events))):
            for char, escaped in ESCAPES:
                value = value.replace(char, escaped)
            writer.writerow((key, value))


def event(seq, kind, peer, **fields):
    payload = json.dumps({"t": kind, "i": peer, **fields}, ensure_ascii=True, separators=(",", ":"))
    # A literal slash in a name uses its JSON Unicode escape, as in the launcher's StringTable transport.
    return f"{seq}\t{kind}\t{peer}\t" + payload.replace("\\\\", "\\u005C")


editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
actors = u.get_editor_subsystem(u.EditorActorSubsystem)
world = u.EditorLoadingAndSavingUtils.new_blank_map(False)
world.get_world_settings().set_editor_property("default_game_mode", u.load_class(None, MODE))
actors.spawn_actor_from_class(u.PlayerStart, u.Vector(0, 0, 100))
observer = actors.spawn_actor_from_class(u.load_class(None, LISTENER), u.Vector(0, 0, -500))
observer.tags = [u.Name("network-event-observer")]
saved = save_isolation.isolate()
levels.editor_request_begin_play()


@u.AutomationScheduler.add_latent_command
def network_events_test():
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
        net = pawn.get_component_by_class(u.load_class(None, NETWORK))
        listener, = u.GameplayStatics.get_all_actors_with_tag(game, "network-event-observer")
        with tempfile.TemporaryDirectory(dir=PROJECT / "Saved") as directory:
            csv_file = Path(directory) / "peers.csv"
            arg = directory.replace("%", "%25").replace(" ", "%20").replace(",", "%2C").replace(")", "%29")
            net.call_method("ConfigureBridge", ("-LundenPlayersBridge=" + arg,))
            packet = "1\tself"
            received = []
            cases = [("w", "self", {}), ("j", "b", {"n": "Test\\n"}),
                     ("s", "b", {"p": [1, 0, -2], "r": 0.5}), ("x", "b", {})]
            for seq, (kind, peer, fields) in enumerate(cases, 1):
                received.append(event(seq, kind, peer, **fields))
                offer(csv_file, packet, received)  # unchanged Packet; one new event plus the earlier history
                for _ in range(2):
                    net.call_method("ReadPeers")
                    assert listener.get_editor_property("EventCount") == seq
                    assert listener.get_editor_property("LastKind") == kind
                    assert listener.get_editor_property("LastPeerId") == peer
                    assert json.loads(listener.get_editor_property("LastPayload")) == {"t": kind, "i": peer, **fields}

            listener.destroy_actor()
            yield
            assert not u.GameplayStatics.get_all_actors_with_tag(game, "network-event-observer")
            offer(csv_file, "1\t", [event(5, "s", "b", p=[2, 1, -2])])
            net.call_method("ReadPeers")
            assert net.get_editor_property("LastEventSequence") == 5 and net.get_editor_property("LastPeersPacket") == "1\t"
            # An overlapping batch with an older event and a type outside the presence contract consumes neither.
            offer(csv_file, "1\t", [received[0], event(6, "unhandled", "b")])
            net.call_method("ReadPeers")
            assert net.get_editor_property("LastEventSequence") == 5
            net.call_method("ConfigureBridge", ("",))
        u.log("LUNDEN_NETWORK_EVENTS_TEST_OK")
    finally:
        if editor.get_game_world():
            levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved, editor)
