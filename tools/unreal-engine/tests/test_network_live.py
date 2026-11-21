"""Real PIE leg of the Windows + desktop browser + touch browser room test (#2292).

PlayerBridgeTests stages this automation script in an isolated Windows checkout, provides a
temporary UserDir and runs a local Worker. The JSON files only synchronize test steps. Presence
travels through the production network component, its string tables and the launcher's WebSocket.
"""
import json
import math
import os
from pathlib import Path
import sys
import time
import unreal as u

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
TESTS = PROJECT.parents[1] / "tools/unreal-engine/tests"
sys.path.insert(0, str(TESTS))
import save_isolation  # noqa: E402

ROOM = Path(os.environ["LUNDEN_NETWORK_LIVE_DIR"])
capture_path = os.environ.get("LUNDEN_TEST_UE_CAPTURE")
shared_enabled = os.environ.get("LUNDEN_TEST_SHARED_ROOM") == "1"
if shared_enabled:
    import live_shared_room
if capture_path:
    import capture_network_peers
MODE = json.loads((TESTS.parent / "world-levels.json").read_text(encoding="utf-8"))["gameMode"]
NET = "/Game/Lunden/Network/BPC_LundenNetwork.BPC_LundenNetwork_C"
PEER = "/Game/Lunden/Network/BP_LundenPeer.BP_LundenPeer_C"
SAVE = "/Game/Lunden/Save/BFL_LundenSave.BFL_LundenSave_C"
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
actors = u.get_editor_subsystem(u.EditorActorSubsystem)


def distance(a, b):
    return math.dist((a.x, a.y, a.z), b)


def matching(peers, expected):
    if len(peers) != len(expected):
        return False
    for name, xyz, yaw in expected:
        found = [p for p in peers if p.get_editor_property("DisplayName") == name]
        if len(found) != 1:
            return False
        peer = found[0]
        if distance(peer.get_actor_location(), xyz) > 5 or abs(math.remainder(peer.get_actor_rotation().yaw - yaw, 360)) > 1:
            return False
        if peer.get_editor_property("Away") or not peer.get_editor_property("PeerId"):
            return False
    return True


@u.AutomationScheduler.add_latent_command
def live_test():
    isolation = save_isolation.isolate()
    try:
        world = u.EditorLoadingAndSavingUtils.new_blank_map(False)
        world.get_world_settings().set_editor_property("default_game_mode", u.load_class(None, MODE))
        floor = actors.spawn_actor_from_class(u.StaticMeshActor, u.Vector(0, 0, -10))
        floor.static_mesh_component.set_static_mesh(u.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube"))
        floor.static_mesh_component.set_collision_profile_name("BlockAll")
        floor.set_actor_scale3d(u.Vector(80, 80, .2))
        actors.spawn_actor_from_class(u.PlayerStart, u.Vector(75, 130, 95))
        lib = u.get_default_object(u.load_class(None, SAVE))
        for method, value in (("SetPlayerName", "Klara"), ("SetLookCode", "120310101175u1")):
            if not lib.call_method(method, (value, world)):
                raise RuntimeError("Could not prepare the test profile: " + method)
        if shared_enabled:
            live_shared_room.setup(actors)
        if capture_path:
            capture_network_peers.setup(actors)
        levels.editor_request_begin_play()
        deadline = time.monotonic() + (210 if shared_enabled else 150)
        while time.monotonic() < deadline:
            game = editor.get_game_world()
            pc = u.GameplayStatics.get_player_controller(game, 0) if game else None
            pawn = pc.get_controlled_pawn() if pc else None
            if pawn:
                break
            yield
        else:
            raise RuntimeError("PIE did not possess the test character")
        net = pawn.get_component_by_class(u.load_class(None, NET))
        peer_class = u.load_class(None, PEER)
        if not net or not peer_class:
            raise RuntimeError("Build the network Blueprints and install the character extension first")
        net.call_method("RefreshProfile")
        capsule = pawn.get_component_by_class(u.CapsuleComponent)
        (ROOM / "live-ready").write_text("PIE ready", encoding="utf-8")
        last = None
        ids = None
        photographed = False
        while time.monotonic() < deadline:
            step_file = ROOM / "live-step.json"
            if not step_file.exists():
                yield
                continue
            step = json.loads(step_file.read_text(encoding="utf-8"))
            stage = step["stage"]
            if stage == "done":
                return
            if shared_enabled and isinstance(stage, str) and stage.startswith("shared-"):
                if stage != last:
                    yield from live_shared_room.run(stage, ROOM, game, pawn, capture_path)
                    last = stage
                yield
                continue
            if stage != last:
                if stage == "away":
                    net.call_method("SetPresenceAway", (True,))
                else:
                    pawn.set_actor_location(u.Vector(step["x"], 130, capsule.get_scaled_capsule_half_height()), False, True)
                    pc.set_control_rotation(u.Rotator(roll=0, pitch=15, yaw=0))
                    net.call_method("SetPresenceAway", (False,))
                last = stage
            if stage != "away":
                expected = [(name, (x*100, z*100, 0), -90 - math.degrees(yaw)) for name, x, z, yaw in step["web"]]
                peers = u.GameplayStatics.get_all_actors_of_class(game, peer_class)
                if matching(peers, expected):
                    received = {str(p.get_editor_property("DisplayName")): str(p.get_editor_property("PeerId")) for p in peers}
                    if ids is not None and ids != received:
                        raise RuntimeError("A returning player has duplicate or replaced browser actors")
                    ids = received
                    output = ROOM / "live-observed.json"
                    value = json.dumps({"stage": stage, "count": len(ids)})
                    if not output.exists() or output.read_text(encoding="utf-8") != value:
                        temporary = output.with_suffix(".tmp")
                        temporary.write_text(value, encoding="utf-8")
                        temporary.replace(output)
                    if capture_path and stage == 2 and not photographed:
                        yield from capture_network_peers.capture(game, pc, expected, Path(capture_path))
                        photographed = True
                        (ROOM / "live-captured").write_text("OK", encoding="utf-8")
            yield
        raise RuntimeError("Timed out waiting for the three clients to observe the same movement")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(isolation, editor)
