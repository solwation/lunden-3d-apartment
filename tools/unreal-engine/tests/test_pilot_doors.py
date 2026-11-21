"""Unreal Python Automation test. Install in Content/Python only in the generated scratch pilot."""
import json
import math
from pathlib import Path
import time
import sys
import unreal as u

sys.path.insert(0, str(Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())).parents[1]
                       / "tools/unreal-engine/tests"))
import save_isolation  # noqa: E402  #2311: start without the player's save file

MAP = "/Game/Lunden/Generated/PilotDoors/Level_l1007_doors"
CONTROLLER = "/Game/Lunden/Player/BP_LundenPlayerController.BP_LundenPlayerController_C"
ENTRANCE = "door_l0_x80_z0"
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
world = u.EditorLoadingAndSavingUtils.load_map(MAP)
if not world:
    raise RuntimeError("Build the playable L1007 sublevel before running the door test.")
# Use the packaged pilot GameMode and its actual PlayerController binding.
mode = u.load_class(None, "/Game/Lunden/Player/BP_LundenGameMode.BP_LundenGameMode_C")
if not mode or u.get_default_object(mode).get_editor_property("player_controller_class") != u.load_class(None, CONTROLLER):
    raise RuntimeError("Link the pilot GameMode to the door controller before testing.")
world.get_world_settings().set_editor_property("default_game_mode", mode)
camera_template = u.get_editor_subsystem(u.EditorActorSubsystem).spawn_actor_from_class(u.CameraActor, u.Vector(130.665, -100, 110))
camera_template.root_component.set_mobility(u.ComponentMobility.MOVABLE)
camera_template.tags = [u.Name("pilot-test-camera")]
saved_slot = save_isolation.isolate()
levels.editor_request_begin_play()


@u.AutomationScheduler.add_latent_command
def operate():
    try:
        stop = time.monotonic() + 45
        pc = None
        while not pc or pc.get_class().get_name() != "BP_LundenPlayerController_C":
            if time.monotonic() > stop:
                raise RuntimeError("PIE did not start its door controller: " + str(pc))
            game = editor.get_game_world()
            pc = u.GameplayStatics.get_player_controller(game, 0) if game else None
            yield
        hinges = u.GameplayStatics.get_all_actors_of_class(game, u.load_class(None,
            "/Game/Lunden/Blueprints/PilotDoors/BP_LundenSwingDoor.BP_LundenSwingDoor_C"))
        doors = {str(h.tags[0]).removeprefix("pilot-door:"): h for h in hinges}
        if len(doors) != 10:
            raise RuntimeError(f"Expected ten imported swing doors, found {len(doors)}")
        for door_id, actor in doors.items():
            if str(actor.get_editor_property("Id")) != door_id or actor.get_editor_property("Seconds") <= 0:
                raise RuntimeError(f"Missing swing-door identity or duration on {door_id}")
            for endpoint in ("OpenLocation", "ClosedLocation"):
                if (actor.get_editor_property(endpoint) - actor.get_actor_location()).length() > 0.01:
                    raise RuntimeError(f"{door_id} {endpoint} differs from its placed hinge")
        hinge = doors[ENTRANCE]
        leaf, = [a for a in hinge.get_attached_actors() if a.actor_has_tag(ENTRANCE)]
        box, = [a for a in hinge.get_attached_actors() if a.actor_has_tag("pilot-door-leaf:" + ENTRANCE)]
        panel = next(p for p in leaf.get_attached_actors() if p.actor_has_tag(ENTRANCE + "__1"))
        camera, = u.GameplayStatics.get_all_actors_with_tag(game, "pilot-test-camera")
        pc.set_view_target_with_blend(camera)
        def seconds(amount):
            end = u.GameplayStatics.get_time_seconds(game) + amount
            while u.GameplayStatics.get_time_seconds(game) < end:
                if time.monotonic() > stop:
                    raise RuntimeError("Timed out while waiting for door motion")
                yield
        def key(name, down):
            u.SystemLibrary.execute_console_command(game, "Input." + ("+key " if down else "-key ") +
                                                   name + (" 1" if down else ""), pc)
        def tap(name):
            # The Enhanced Input console injector issues IE_Pressed on every forced frame.
            # Hold for one PIE frame to reproduce a user's single key or mouse press.
            key(name, True)
            yield
            key(name, False)
        def aim(x, y, heading):
            camera.set_actor_location_and_rotation(u.Vector(x, y, 110), u.Rotator(roll=0, pitch=0, yaw=heading), False, True)
        def point(a):
            p = a.get_actor_location()
            return [round(p.x, 3), round(p.y, 3), round(p.z, 3)]
        def snapshot():
            return {"hingeCm": point(hinge), "yaw": round(hinge.get_actor_rotation().yaw, 3),
                    "colliderCm": point(box), "visiblePanelCm": point(panel)}
        def expect(a, b, tolerance):
            if math.dist(a, b) > tolerance:
                raise RuntimeError(f"Door measurement mismatch: {a} versus {b}")
        aim(130.665, -305, 90)
        yield from seconds(0.25)
        yield from tap("E")
        yield from seconds(0.7)
        closed = snapshot()
        expect(closed["colliderCm"], [130.665, 0, 105], 0.1)
        aim(130.665, -100, 90)
        yield from seconds(0.15)
        yield from tap("E")
        yield from seconds(0.2)
        moving = snapshot()
        if not -90 < moving["yaw"] < -0.01:
            raise RuntimeError(f"Entrance failed to start swinging after E: {moving}")
        yield from seconds(0.7)
        opened = snapshot()
        expect(opened["colliderCm"], [80.47, -50.195, 105], 0.1)
        expect(opened["visiblePanelCm"], [80.47, -50.195, closed["visiblePanelCm"][2]], 0.1)
        aim(170, -50.195, 180)
        yield from seconds(0.15)
        yield from tap("LeftMouseButton")
        yield from seconds(0.7)
        returned = snapshot()
        for item in [closed, moving, opened, returned]:
            expect(item["hingeCm"], [80.47, 0, 0], 0.01)
        expect(returned["colliderCm"], closed["colliderCm"], 0.1)
        expect(returned["visiblePanelCm"], closed["visiblePanelCm"], 0.1)
        evidence = {"engine": u.SystemLibrary.get_engine_version(), "map": MAP, "hinges": sorted(doors),
                    "entrance": ENTRANCE, "beyondReachAndClosed": closed, "opening": moving,
                    "openedWithE": opened, "closedWithMouse": returned}
        (Path(u.Paths.project_saved_dir()) / "pilot-doors-result.json").write_text(
            json.dumps(evidence, indent=2) + "\n", encoding="utf8")
        u.log("LUNDEN_PILOT_DOOR_PLAY_OK")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
