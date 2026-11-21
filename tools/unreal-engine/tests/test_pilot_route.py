"""Drive the pilot character through the real imported L1007 with keyboard input in PIE."""
import json
import math
from pathlib import Path
import time
import sys
import unreal as u

sys.path.insert(0, str(Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())).parents[1]
                       / "tools/unreal-engine/tests"))
import save_isolation  # noqa: E402  #2311: start without the player's save file

MAP = "/Game/Lunden/Maps/Pilot_L1007"
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
if not u.EditorLoadingAndSavingUtils.load_map(MAP):
    raise RuntimeError(f"Could not load {MAP}")
saved_slot = save_isolation.isolate()
levels.editor_request_begin_play()


@u.AutomationScheduler.add_latent_command
def route():
    try:
        deadline = time.monotonic() + 45
        pawn = None
        while not pawn:
            if time.monotonic() >= deadline:
                raise RuntimeError("L1007 did not spawn the first-person character")
            world = editor.get_game_world()
            pawn = u.GameplayStatics.get_player_character(world, 0) if world else None
            yield
        pc = pawn.get_controller()
        if pawn.get_class().get_name() != "BP_LundenPlayer_C" or pc.get_class().get_name() != "BP_LundenPlayerController_C":
            raise RuntimeError(f"Unexpected possession: {pawn.get_class().get_name()}, {pc.get_class().get_name()}")
        checkpoints = []

        def press(key, down):
            cmd = "Input." + ("+key " if down else "-key ") + key
            u.SystemLibrary.execute_console_command(world, cmd + (" 1" if down else ""), pc)

        def wait(seconds):
            now = u.GameplayStatics.get_time_seconds(world)
            while u.GameplayStatics.get_time_seconds(world) - now < seconds:
                yield

        def report(label):
            p = pawn.get_actor_location()
            xyz = [round(n, 2) for n in (p.x, p.y, p.z)]
            checkpoints.append({"label": label, "capsuleCm": xyz})
            u.log(f"LUNDEN_ROUTE {label}: {xyz}")
            return p

        def aim(x, y):
            p = pawn.get_actor_location()
            yaw = math.degrees(math.atan2(y - p.y, x - p.x))
            pc.set_control_rotation(u.Rotator(roll=0, pitch=0, yaw=yaw))

        def move(name, x, y, target_floor=None, tolerance=8):
            aim(x, y)
            yield
            press("W", True)
            nearest = float("inf")
            last_progress = u.GameplayStatics.get_time_seconds(world)
            try:
                while True:
                    p = pawn.get_actor_location()
                    distance = math.hypot(x - p.x, y - p.y)
                    if distance <= tolerance:
                        break
                    now = u.GameplayStatics.get_time_seconds(world)
                    if distance < nearest - 2:
                        nearest = distance
                        last_progress = now
                    if now - last_progress > 0.65 or p.z < -20:
                        report(name + " BLOCKED")
                        raise RuntimeError(f"Character could not reach {name} ({x},{y}), remaining {distance:.2f} cm")
                    aim(x, y)
                    yield
            finally:
                press("W", False)
            yield from wait(0.12)
            p = report(name)
            if target_floor is not None and abs(p.z - 94.65 - target_floor) > 12:
                raise RuntimeError(f"Wrong floor at {name}: character centre {p.z:.2f}, expected {94.65 + target_floor:.2f}")

        def open_door(name, x, y, door_id, expected_yaw):
            hinge = doors[door_id]
            if abs(hinge.get_actor_rotation().yaw) > 1:
                raise RuntimeError(f"{door_id} should begin closed")
            aim(x, y)
            yield from wait(0.15)
            press("E", True)
            yield
            press("E", False)
            yield from wait(0.75)
            yaw = hinge.get_actor_rotation().yaw
            if abs(yaw - expected_yaw) > 1:
                raise RuntimeError(f"{door_id} did not open in response to E: yaw={yaw}")
            report(name)
            checkpoints[-1]["doorYaw"] = round(yaw, 2)

        yield from wait(0.4)
        hinges = u.GameplayStatics.get_all_actors_of_class(world, u.load_class(None,
            "/Game/Lunden/Blueprints/PilotDoors/BP_LundenSwingDoor.BP_LundenSwingDoor_C"))
        doors = {str(hinge.tags[0]).removeprefix("pilot-door:"): hinge for hinge in hinges}
        for name in ("Level_l1007_doors", "Level_l1007-uteplats"):
            stream = u.GameplayStatics.get_streaming_level(world, name)
            if not stream or not stream.is_level_loaded() or not stream.is_level_visible():
                raise RuntimeError(f"Required pilot level {name} is unavailable")
        if len(hinges) != 10:
            raise RuntimeError(f"Streamed apartment must contain 10 pilot door hinges, found {len(hinges)}")
        start = report("START")
        if math.hypot(start.x - 287.5, start.y + 1200) > 10 or abs(start.z - 94.65) > 12:
            raise RuntimeError(f"Unplayable street spawn at {start}")
        yield from move("approach entrance", 139, -140, 0)
        yield from open_door("open entrance", 132, 0, "door_l0_x80_z0", -90)
        yield from move("through entrance", 141, 100, 0)
        # Hall partition faces x=205.66 cm here. The capsule must stop 22 cm away.
        aim(350, 100)
        yield
        press("W", True)
        yield from wait(0.6)
        press("W", False)
        edge = report("blocked by hall wall")
        if not 181 < edge.x < 185:
            raise RuntimeError(f"Character did not stop against the hall partition: {edge}")
        yield from move("entrance hall", 142, 225, 0)
        yield from move("towards kitchen", 265, 250, 0)
        yield from move("hallway", 270, 505, 0)
        yield from move("stair foot", 301, 710, 0)
        steps = [(455, 713), (484, 710), (505, 693), (518, 666), (507, 636), (478, 618), (451, 615)]
        for i, xy in enumerate(steps):
            yield from move(f"ascending {i+1}", *xy, tolerance=4)
        yield from move("upper landing", 347, 616, 325)
        for i, xy in enumerate(reversed(steps)):
            yield from move(f"descending {i+1}", *xy, tolerance=4)
        yield from move("downstairs", 283, 715, 0)
        yield from move("living room", 262, 901, 0)
        yield from move("approach patio", 147, 1155, 0)
        yield from open_door("open patio", 148, 1269.86, "door_l0_x95_z1270", 90)
        yield from move("patio", 147, 1420, 0)
        (Path(u.Paths.project_saved_dir()) / "pilot-route-result.json").write_text(
            json.dumps({"engine": u.SystemLibrary.get_engine_version(), "map": MAP, "checkpoints": checkpoints}, indent=2) + "\n")
        u.log("LUNDEN_PILOT_ROUTE_OK")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
