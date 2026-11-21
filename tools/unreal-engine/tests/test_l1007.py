"""#2278: L1007 in the world map /Game/Lunden/Maps/L_Lunden, in Play In Editor.

1. The sub-levels of tools/unreal-engine/world-levels.json are loaded and visible in the running game.
2. Measurements against the #2245 export (unreal/Lunden/Import/measurements.json), tolerance 1 cm: line traces
   against what the player collides with (floors of both storeys, outer wall faces of both storeys, stair foot,
   treads, landing and the stair opening) and the world bounds of the imported visible floors and outer walls.
3. The pilot's route on the new map: the production character walks from START through the front door into
   Entréplan, up the stairs to Övre plan and back down and out, driven only by W and the view direction.

Run like the pilot tests: copy this file to unreal/Lunden/Content/Python/ (untracked) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_l1007
Writes Saved/l1007-world-result.json and logs LUNDEN_L1007_MEASURE / LUNDEN_ROUTE lines, then LUNDEN_L1007_WORLD_OK.
"""
import json
import math
from pathlib import Path
import time
import unreal as u

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
WORLD = json.loads((PROJECT.parents[1] / "tools/unreal-engine/world-levels.json").read_text(encoding="utf-8"))
M = json.loads((PROJECT / "Import/measurements.json").read_text(encoding="utf-8"))
MAP = WORLD["map"]
TOLERANCE = 1.0  # cm, the issue's acceptance
HALF_HEIGHT = 94.65  # capsule centre above the floor while walking (pilot player.md: 92.5 cm half height + 2.15 cm)

editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
if not u.EditorLoadingAndSavingUtils.load_map(MAP):
    raise RuntimeError(f"Could not load {MAP}: run compose_world.py first")
levels.editor_request_begin_play()


def tags(actor):
    return {str(t) for t in actor.tags}


@u.AutomationScheduler.add_latent_command
def world_test():
    try:
        deadline = time.monotonic() + 45
        pawn = None
        while not pawn:
            if time.monotonic() >= deadline:
                raise RuntimeError("L_Lunden did not spawn the first-person character")
            world = editor.get_game_world()
            pawn = u.GameplayStatics.get_player_character(world, 0) if world else None
            yield
        if pawn.get_class().get_name() != "BP_LundenPlayer_C":
            raise RuntimeError(f"Unexpected pawn {pawn.get_class().get_name()}")
        pc = pawn.get_controller()
        result = {"engine": u.SystemLibrary.get_engine_version(), "map": MAP, "subLevels": [],
                  "measurements": [], "checkpoints": []}

        def wait(seconds):
            now = u.GameplayStatics.get_time_seconds(world)
            while u.GameplayStatics.get_time_seconds(world) - now < seconds:
                yield

        yield from wait(0.4)
        for entry in WORLD["levels"]:
            stream = u.GameplayStatics.get_streaming_level(world, entry["package"].rsplit("/", 1)[-1])
            if not stream or not stream.is_level_loaded() or not stream.is_level_visible():
                raise RuntimeError(f"Sub-level {entry['package']} is not loaded and visible")
            result["subLevels"].append(entry["package"])

        # ---------------------------------------------------------------- measurements
        actors = u.GameplayStatics.get_all_actors_of_class(world, u.Actor)
        solid = [a for a in actors if "derived:l1007-collision" in tags(a) or "kind:provisional-ground" in tags(a)]
        ignore = [a for a in actors if a not in solid]
        if len(solid) < 60:
            raise RuntimeError(f"Expected the derived L1007 collision, found {len(solid)} actors")
        by_name = {a.get_name(): a for a in actors}
        failures = []

        def record(name, got, want, source, extra=None):
            error = abs(got - want)
            row = {"id": name, "gotCm": round(got, 3), "wantCm": round(want, 3), "errorCm": round(error, 3),
                   "source": source, **(extra or {})}
            result["measurements"].append(row)
            u.log(f"LUNDEN_L1007_MEASURE {name}: got {got:.2f}, want {want:.2f} ({source}), error {error:.3f} cm")
            if error > TOLERANCE:
                failures.append(name)

        def trace(a, b):
            hit = u.SystemLibrary.line_trace_single(world, u.Vector(*a), u.Vector(*b),
                                                    u.TraceTypeQuery.ECC_VISIBILITY, False, ignore,
                                                    u.DrawDebugTrace.NONE, True)
            if isinstance(hit, tuple):
                hit = hit[-1] if hit[0] else None
            # BreakHitResult: blocking hit, initial overlap, time, distance, location, impact point, normal,
            # impact normal, physical material, hit actor, hit component, ...
            parts = hit.to_tuple() if hit else None
            if not parts or not parts[0]:
                raise RuntimeError(f"Trace {a} -> {b} hit nothing")
            return parts[5], parts[9].get_actor_label() if parts[9] else None

        def traced(name, a, b, axis, want, source):
            point, actor = trace(a, b)
            record(name, getattr(point, axis), want, source, {"trace": [a, b], "hit": actor})

        floors = M["plan"]["levels"]
        size_x, size_y = 100 * M["plan"]["size"]["x"], 100 * M["plan"]["size"]["z"]
        riser = 100 * M["stair"]["riser"]
        foot = M["stair"]["foot"]["unreal"]
        ovre = next(p for p in M["fixture"]["points"] if p["id"] == "fixture_ovre_plan")["unreal"]
        plan = "measurements.json#/plan"
        traced("entreplan_floor", (142, 225, 150), (142, 225, -50), "z", floors[0]["unreal"]["floorZ"], plan + "/levels/0")
        traced("ovre_plan_floor", (ovre[0], ovre[1], 450), (ovre[0], ovre[1], 250), "z", floors[1]["unreal"]["floorZ"],
               plan + "/levels/1")
        traced("entreplan_west_outer", (-100, 600, 100), (300, 600, 100), "x", 0, plan + "/size")
        traced("entreplan_east_outer", (700, 600, 100), (300, 600, 100), "x", size_x, plan + "/size")
        traced("entreplan_north_outer", (500, -100, 100), (500, 300, 100), "y", 0, plan + "/size")
        traced("entreplan_south_outer", (520, 1400, 100), (520, 1000, 100), "y", size_y, plan + "/size")
        traced("ovre_plan_west_outer", (-100, 300, 450), (300, 300, 450), "x", 0, plan + "/size")
        traced("ovre_plan_east_outer", (700, 300, 450), (300, 300, 450), "x", size_x, plan + "/size")
        traced("stair_foot", (300, foot[1], riser / 2), (450, foot[1], riser / 2), "x", foot[0],
               "measurements.json#/stair/foot")
        traced("stair_tread_1_top", (364, 713, 150), (364, 713, -50), "z", riser, "measurements.json#/stair/riser")
        traced("stair_tread_15_top", (399, 618, 450), (399, 618, 200), "z", 15 * riser, "measurements.json#/stair/riser")
        traced("stair_landing", (347, 616, 450), (347, 616, 250), "z", floors[1]["unreal"]["floorZ"], plan + "/levels/1")
        hole = M["stair"]["hole"]
        centre = (50 * (hole["x0"] + hole["x1"]), 50 * (hole["z0"] + hole["z1"]))
        point, actor = trace((centre[0], centre[1], 450), (centre[0], centre[1], -50))
        result["measurements"].append({"id": "stair_opening", "hitZCm": round(point.z, 2), "hit": actor,
                                       "rule": "no Övre plan floor over measurements.json#/stair/hole"})
        u.log(f"LUNDEN_L1007_MEASURE stair_opening: first hit at z {point.z:.2f} ({actor}), below Övre plan")
        if point.z > floors[1]["unreal"]["floorZ"] - 5:
            failures.append("stair_opening")

        def bounds(actor_id):
            a = by_name.get(actor_id)
            if not a:
                raise RuntimeError(f"Missing imported actor {actor_id}")
            origin, extent = a.get_actor_bounds(False)
            return origin - extent, origin + extent

        visible = "imported visible mesh"
        record("visible_entreplan_floor_top", bounds("mesh_l0_x288_z635_y0")[1].z, floors[0]["unreal"]["floorZ"], visible)
        record("visible_ovre_plan_floor_top", bounds("mesh_l1_x288_z1015_y325")[1].z, floors[1]["unreal"]["floorZ"], visible)
        record("visible_west_wall_outer", bounds("wall_l0_x10_z635_y150")[0].x, 0, visible)
        record("visible_east_wall_outer", bounds("wall_l0_x565_z635_y150")[1].x, size_x, visible)
        if failures:
            raise RuntimeError(f"Outside {TOLERANCE} cm: {failures}")

        # ---------------------------------------------------------------- route
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

        def move(name, x, y, floor=None, tolerance=8):
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
                    if now - last_progress > 0.65 or p.z < -20:
                        report(name + " BLOCKED")
                        raise RuntimeError(f"Character could not reach {name} ({x},{y}), remaining {distance:.2f} cm")
                    aim(x, y)
                    yield
            finally:
                press("W", False)
            yield from wait(0.12)
            p = report(name)
            if floor is not None and abs(p.z - HALF_HEIGHT - floor) > 12:
                raise RuntimeError(f"Wrong floor at {name}: centre {p.z:.2f}, expected {HALF_HEIGHT + floor:.2f}")

        entre, upper = floors[0]["unreal"]["floorZ"], floors[1]["unreal"]["floorZ"]
        start = report("START")
        want = M["spawn"]["start"]["unreal"]
        if math.hypot(start.x - want[0], start.y - want[1]) > 10 or abs(start.z - HALF_HEIGHT - want[2]) > 12:
            raise RuntimeError(f"Spawned at {start}, not at START {want}")
        yield from move("approach entrance", 139, -140, entre)
        # The imported door leaves have no simple collision (door movement and blocking doors are #2285).
        yield from move("through entrance", 141, 100, entre)
        aim(350, 100)  # the hall partition faces x = 205.66 cm here; the 22 cm capsule must stop short of it
        yield
        press("W", True)
        yield from wait(0.6)
        press("W", False)
        edge = report("blocked by hall wall")
        if not 181 < edge.x < 185:
            raise RuntimeError(f"Character did not stop against the hall partition: {edge}")
        yield from move("entrance hall", 142, 225, entre)
        yield from move("towards kitchen", 265, 250, entre)
        yield from move("hallway", 270, 505, entre)
        yield from move("stair foot", 301, 710, entre)
        steps = [(455, 713), (484, 710), (505, 693), (518, 666), (507, 636), (478, 618), (451, 615)]
        for i, xy in enumerate(steps):
            yield from move(f"ascending {i + 1}", *xy, tolerance=4)
        yield from move("upper landing", 347, 616, upper)
        yield from move("Övre plan", 250, 665, upper)
        yield from move("back to landing", 347, 616, upper)
        for i, xy in enumerate(reversed(steps)):
            yield from move(f"descending {i + 1}", *xy, tolerance=4)
        yield from move("downstairs", 283, 715, entre)
        yield from move("back along hallway", 270, 505, entre)
        yield from move("back in entrance hall", 142, 225, entre)
        yield from move("back out of the entrance", 141, 100, entre)
        yield from move("back outside", 139, -140, entre)
        (Path(u.Paths.project_saved_dir()) / "l1007-world-result.json").write_text(json.dumps(result, indent=2) + "\n")
        u.log("LUNDEN_L1007_WORLD_OK")
    finally:
        levels.editor_request_end_play()
