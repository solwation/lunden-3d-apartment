"""#2279: walk from START into Hus L's stairwell and down into the garage on the composed world map, in Play In Editor.

The production character starts at START in /Game/Lunden/Maps/L_Lunden and, driven only by W and the view direction,
walks west along the street (the ground collision of build_site.py, #2280) into the portik, through the open way into the
stairwell (its door leaf has no collision until #2285), onto the landing of våning 1, north along the passage beside
the flights, down the flight to våning −1 and east through the basement opening into the garage. Each checkpoint must
be reached and stand on the expected floor (12 cm), so the collision of the stairwell and the garage holds the capsule.

Waypoints (cm, Unreal axes) come from src/config.js CORE (the band x −18.95 … −16.62 m split at −17.95, the flights'
foot z 7.61 m, 16 treads of 0.25 m to våning 1, the landing z 7.61 … 9.58 m, the basement openings z 7.95 … 8.85 m),
PORTIK and CORE.portikDoor (z 8.45 … 9.48 m at x −16.12 m), and GARAGE.floor (−3 m).

Run like the other tests: copy this file to unreal/Lunden/Content/Python/ (untracked) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_exterior_route
Writes Saved/exterior-route-result.json and logs LUNDEN_ROUTE lines, then LUNDEN_EXTERIOR_ROUTE_OK.
"""
import json
import math
from pathlib import Path
import time

import sys
import unreal as u

sys.path.insert(0, str(Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())).parents[1]
                       / "tools/unreal-engine/tests"))
import save_isolation  # noqa: E402  #2311: start without the player's save file

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
WORLD = json.loads((PROJECT.parents[1] / "tools/unreal-engine/world-levels.json").read_text(encoding="utf-8"))
M = json.loads((PROJECT / "Import/measurements.json").read_text(encoding="utf-8"))
MAP = WORLD["map"]
HALF_HEIGHT = 94.65  # capsule centre above the floor while walking (test_l1007.py)
STREET, GARAGE = 0.0, -300.0  # START's street level; GARAGE.floor and våning −1
ROUTE = [  # name, x, y, floor (cm)
    ("street west of L1007", 0, -300, STREET),
    ("street by the portik", -1450, -300, STREET),
    ("in the portik", -1450, 897, STREET),
    ("through the stairwell door", -1640, 897, STREET),
    ("stairwell landing, våning 1", -1730, 860, STREET),
    ("passage beside the flights", -1730, 600, STREET),
    ("street-end floor, våning 1", -1730, 280, STREET),
    ("top of the flight down", -1845, 280, STREET),
    ("flight down 1", -1845, 420, None),
    ("flight down 2", -1845, 540, None),
    ("flight down 3", -1845, 660, None),
    ("foot of the flight, våning −1", -1845, 800, GARAGE),
    ("stairwell, våning −1", -1730, 840, GARAGE),
    ("basement opening", -1600, 840, GARAGE),
    ("garage under Hus L", -1450, 840, GARAGE),
]

editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
if not u.EditorLoadingAndSavingUtils.load_map(MAP):
    raise RuntimeError(f"Could not load {MAP}: run compose_world.py first")
saved_slot = save_isolation.isolate()
levels.editor_request_begin_play()


@u.AutomationScheduler.add_latent_command
def route_test():
    try:
        deadline = time.monotonic() + 60
        pawn = None
        while not pawn:
            if time.monotonic() >= deadline:
                raise RuntimeError("L_Lunden did not spawn the player")
            world = editor.get_game_world()
            pawn = u.GameplayStatics.get_player_character(world, 0) if world else None
            yield
        pc = pawn.get_controller()
        result = {"engine": u.SystemLibrary.get_engine_version(), "map": MAP, "pawn": pawn.get_class().get_name(),
                  "subLevels": [], "checkpoints": []}

        def wait(seconds):
            now = u.GameplayStatics.get_time_seconds(world)
            while u.GameplayStatics.get_time_seconds(world) - now < seconds:
                yield

        yield from wait(0.5)
        for entry in WORLD["levels"]:
            stream = u.GameplayStatics.get_streaming_level(world, entry["package"].rsplit("/", 1)[-1])
            if not stream or not stream.is_level_loaded() or not stream.is_level_visible():
                raise RuntimeError(f"Sub-level {entry['package']} is not loaded and visible")
            result["subLevels"].append(entry["package"])

        def press(key, down):
            u.SystemLibrary.execute_console_command(world, ("Input.+key " + key + " 1") if down else ("Input.-key " + key), pc)

        def report(label):
            p = pawn.get_actor_location()
            xyz = [round(n, 2) for n in (p.x, p.y, p.z)]
            result["checkpoints"].append({"label": label, "capsuleCm": xyz})
            u.log(f"LUNDEN_ROUTE {label}: {xyz}")
            return p

        def aim(x, y):
            p = pawn.get_actor_location()
            pc.set_control_rotation(u.Rotator(roll=0, pitch=0, yaw=math.degrees(math.atan2(y - p.y, x - p.x))))

        def move(name, x, y, floor, tolerance=8):
            aim(x, y)
            yield
            press("W", True)
            nearest, last_progress = float("inf"), u.GameplayStatics.get_time_seconds(world)
            try:
                while True:
                    p = pawn.get_actor_location()
                    distance = math.hypot(x - p.x, y - p.y)
                    if distance <= tolerance:
                        break
                    now = u.GameplayStatics.get_time_seconds(world)
                    if distance < nearest - 2:
                        nearest, last_progress = distance, now
                    if now - last_progress > 0.8 or p.z < GARAGE - 100:
                        report(name + " BLOCKED")
                        raise RuntimeError(f"Character could not reach {name} ({x},{y}), remaining {distance:.2f} cm")
                    aim(x, y)
                    yield
            finally:
                press("W", False)
            yield from wait(0.15)
            p = report(name)
            if floor is not None and abs(p.z - HALF_HEIGHT - floor) > 12:
                raise RuntimeError(f"Wrong floor at {name}: centre {p.z:.2f}, expected {HALF_HEIGHT + floor:.2f}")

        start = report("START")
        want = M["spawn"]["start"]["unreal"]
        if math.hypot(start.x - want[0], start.y - want[1]) > 10:
            raise RuntimeError(f"Spawned at {start}, not at START {want}")
        for name, x, y, floor in ROUTE:
            yield from move(name, x, y, floor, tolerance=4 if floor is None else 8)
        (Path(u.Paths.project_saved_dir()) / "exterior-route-result.json").write_text(json.dumps(result, indent=2) + "\n")
        u.log(f"LUNDEN_EXTERIOR_ROUTE_OK {len(result['checkpoints'])} checkpoints")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
