"""#2280: the ground round Kv. Lunden in the world map /Game/Lunden/Maps/L_Lunden, in Play In Editor.

1. The ground's sub-levels (zones gard and omgivning, and build_site.py's derived collision level) are loaded and
   visible in the running game.
2. Ground height at the export's control points (measurements.json `ground.points`, export-scene.js groundProbes):
   a vertical line trace against the derived ground collision, which is the imported mesh itself (a full, non-Nanite
   copy). Every point must lie within 5 cm of the export's own measurement on the same node; `elevation` points (where
   the web's terrain is data/elevation.json itself) also within 5 cm of the elevation grid, and `terrain` points (the
   courtyard on the garage box and the carved Höje å valley, where the web departs from the elevation data by design)
   within 5 cm of the web's drawn terrain, with the elevation value logged beside it. Each collision actor's bounds
   must also equal its imported visible actor's bounds (the same mesh, 0.1 cm).
3. The route (`ground.route`): the production character walks from START along the street, up the ramp onto the
   courtyard, back down, south along Sankt Lars väg to the park level and down the shore path into the Höje å valley,
   driven only by W and the view direction. At each checkpoint its feet must be within 20 cm of the web's walking
   surface; it must never drop more than 1 m below the lowest point of the route (falling through the ground).

Run like the other world tests: copy this file to unreal/Lunden/Content/Python/ (untracked) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_site
Writes Saved/site-result.json and logs LUNDEN_SITE_HEIGHT / LUNDEN_SITE_ROUTE lines, then LUNDEN_SITE_OK.
"""
import json
import math
from pathlib import Path
import time

import unreal as u

TOLERANCE = 5.0  # cm, the issue's acceptance for the ground height
ROUTE_TOLERANCE = 20.0  # cm, feet against the web surface at a checkpoint (a flat-based capsule rests on a slope's uphill edge)
HALF_HEIGHT = 94.65  # capsule centre above the floor while walking (92.5 cm half height + 2.15 cm, as test_l1007)
SITE_LEVELS = ("/Game/Lunden/Generated/gard/Level_gard", "/Game/Lunden/Generated/omgivning/Level_omgivning",
               "/Game/Lunden/Generated/SiteWorld/Level_site_collision")
PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
WORLD = json.loads((PROJECT.parents[1] / "tools/unreal-engine/world-levels.json").read_text(encoding="utf-8"))
M = json.loads((PROJECT / "Import/measurements.json").read_text(encoding="utf-8"))
GROUND = M.get("ground")
if not GROUND:
    raise RuntimeError("Import/measurements.json has no `ground`: export with the zones gard and omgivning")
MAP = WORLD["map"]

editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
if not u.EditorLoadingAndSavingUtils.load_map(MAP):
    raise RuntimeError(f"Could not load {MAP}: run compose_world.py first")
# Until compose_world.py has recomposed the map with its LFS lock, the listed ground levels can be streamed in memory
# (nothing is saved); the result records which. The accepted run has none.
IN_MEMORY = []
_world = editor.get_editor_world()
_present = {lvl.get_outermost().get_name().lower() for lvl in u.EditorLevelUtils.get_levels(_world)}
for _entry in WORLD["levels"]:
    if _entry["package"].lower() not in _present:
        if not u.EditorLevelUtils.add_level_to_world(_world, _entry["package"], u.LevelStreamingAlwaysLoaded):
            raise RuntimeError(f"Could not stream {_entry['package']}: build it with {_entry['builder']}")
        IN_MEMORY.append(_entry["package"])
u.log(f"LUNDEN_SITE streamed in memory (map not recomposed): {IN_MEMORY}")
levels.editor_request_begin_play()


def tags(actor):
    return {str(t) for t in actor.tags}


def tag_value(actor, key):
    for t in tags(actor):
        if t.startswith(key + ":"):
            return t[len(key) + 1:]
    return None


@u.AutomationScheduler.add_latent_command
def site_test():
    try:
        deadline = time.monotonic() + 60
        pawn = None
        while not pawn:
            if time.monotonic() >= deadline:
                raise RuntimeError("L_Lunden did not spawn the first-person character")
            world = editor.get_game_world()
            pawn = u.GameplayStatics.get_player_character(world, 0) if world else None
            yield
        pc = pawn.get_controller()
        result = {"engine": u.SystemLibrary.get_engine_version(), "map": MAP, "export": M.get("sourceCommit"),
                  "tolerance": TOLERANCE, "inMemory": IN_MEMORY, "subLevels": [], "heights": [], "bounds": [], "checkpoints": []}

        def wait(seconds):
            now = u.GameplayStatics.get_time_seconds(world)
            while u.GameplayStatics.get_time_seconds(world) - now < seconds:
                yield

        yield from wait(0.5)
        listed = [e["package"] for e in WORLD["levels"]]
        for package in SITE_LEVELS:
            if package not in listed:
                raise RuntimeError(f"{package} is not in world-levels.json")
            stream = u.GameplayStatics.get_streaming_level(world, package.rsplit("/", 1)[-1])
            if not stream or not stream.is_level_loaded() or not stream.is_level_visible():
                raise RuntimeError(f"Sub-level {package} is not loaded and visible")
            result["subLevels"].append(package)

        actors = u.GameplayStatics.get_all_actors_of_class(world, u.Actor)
        solid = [a for a in actors if "derived:site-collision" in tags(a)]
        ignore = [a for a in actors if a not in solid]
        by_name = {a.get_name(): a for a in actors}
        if len(solid) != len(GROUND["collision"]):
            raise RuntimeError(f"Expected {len(GROUND['collision'])} ground collision actors, found {len(solid)}")
        failures = []

        # ---------------------------------------------------------------- the collision is the imported mesh
        for a in solid:
            node = tag_value(a, "source")
            visible, zone = by_name.get(node), tag_value(a, "zone")
            if not visible:
                if f"/Game/Lunden/Generated/{zone}/Level_{zone}" in listed:
                    raise RuntimeError(f"Missing imported ground actor {node}")
                result["bounds"].append({"node": node, "zone": zone, "skipped": "zone level not in world-levels.json yet"})
                continue
            (c1, e1), (c2, e2) = a.get_actor_bounds(False), visible.get_actor_bounds(False)
            error = max(abs(v) for v in (c1.x - c2.x, c1.y - c2.y, c1.z - c2.z, e1.x - e2.x, e1.y - e2.y, e1.z - e2.z))
            result["bounds"].append({"node": node, "errorCm": round(error, 3)})
            if error > 0.1:
                failures.append("bounds " + node)

        # ---------------------------------------------------------------- heights
        def down(x, y, z0, z1):
            hit = u.SystemLibrary.line_trace_single(world, u.Vector(x, y, z0), u.Vector(x, y, z1),
                                                    u.TraceTypeQuery.ECC_VISIBILITY, True, ignore,
                                                    u.DrawDebugTrace.NONE, True)
            if isinstance(hit, tuple):
                hit = hit[-1] if hit[0] else None
            parts = hit.to_tuple() if hit else None
            if not parts or not parts[0]:
                return None, None
            return parts[5].z, tag_value(parts[9], "source") if parts[9] else None

        for p in GROUND["points"]:
            x, y = p["unreal"]
            want = p["hit"]["unrealZ"]
            got, node = down(x, y, want + 500, want - 500)
            row = {"id": p["id"], "what": p["what"], "reference": p["reference"], "unrealXY": [x, y],
                   "gotCm": None if got is None else round(got, 3), "exportCm": want, "node": node,
                   "elevationCm": round(100 * p["elevationY"], 2), "webTerrainCm": round(100 * p["terrainY"], 2)}
            if got is None:
                row["ok"] = False
                u.log(f"LUNDEN_SITE_HEIGHT {p['id']}: no ground under ({x}, {y})")
            else:
                ref = row["elevationCm"] if p["reference"] == "elevation" else row["webTerrainCm"]
                row.update({"referenceCm": ref, "errorCm": round(abs(got - ref), 3), "exportErrorCm": round(abs(got - want), 3),
                            "sameNode": node == p["hit"]["node"], "elevationDeltaCm": round(got - row["elevationCm"], 2)})
                row["ok"] = row["errorCm"] <= TOLERANCE and row["exportErrorCm"] <= TOLERANCE and row["sameNode"]
                u.log(f"LUNDEN_SITE_HEIGHT {p['id']} ({p['reference']}): got {got:.2f} cm on {node}, "
                      f"{p['reference']} {ref:.2f} (error {row['errorCm']:.3f}), export {want:.2f} on {p['hit']['node']} "
                      f"(error {row['exportErrorCm']:.3f}); elevation.json {row['elevationCm']:.2f} ({p['what']})")
            result["heights"].append(row)
            if not row["ok"]:
                failures.append(p["id"])
        if failures:
            raise RuntimeError(f"Outside {TOLERANCE} cm or on another node: {failures}")

        # ---------------------------------------------------------------- route
        route = GROUND["route"]
        floor_min = min(100 * r["hit"]["y"] for r in route)

        def press(key, down_):
            u.SystemLibrary.execute_console_command(world, ("Input.+key " + key + " 1") if down_ else ("Input.-key " + key), pc)

        def report(label, want=None):
            p = pawn.get_actor_location()
            xyz = [round(n, 2) for n in (p.x, p.y, p.z)]
            row = {"label": label, "capsuleCm": xyz}
            if want is not None:
                row.update({"feetCm": round(p.z - HALF_HEIGHT, 2), "webSurfaceCm": round(want, 2),
                            "errorCm": round(abs(p.z - HALF_HEIGHT - want), 2)})
            result["checkpoints"].append(row)
            u.log(f"LUNDEN_SITE_ROUTE {label}: {xyz}" + (f", feet {p.z - HALF_HEIGHT:.2f} vs web {want:.2f}" if want is not None else ""))
            return p

        def aim(x, y):
            p = pawn.get_actor_location()
            pc.set_control_rotation(u.Rotator(roll=0, pitch=0, yaw=math.degrees(math.atan2(y - p.y, x - p.x))))

        def move(name, x, y, want, tolerance=25):
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
                    if p.z - HALF_HEIGHT < floor_min - 100:
                        report(name + " FELL")
                        raise RuntimeError(f"Fell through the ground on the way to {name}: {p}")
                    now = u.GameplayStatics.get_time_seconds(world)
                    if distance < nearest - 2:
                        nearest, last_progress = distance, now
                    if now - last_progress > 1.0:
                        report(name + " BLOCKED")
                        raise RuntimeError(f"Character could not reach {name} ({x},{y}), remaining {distance:.2f} cm")
                    aim(x, y)
                    yield
            finally:
                press("W", False)
            yield from wait(0.15)
            p = report(name, want)
            if abs(p.z - HALF_HEIGHT - want) > ROUTE_TOLERANCE:
                raise RuntimeError(f"Wrong ground at {name}: feet {p.z - HALF_HEIGHT:.2f}, web surface {want:.2f}")

        first = route[0]
        start = report("spawn", 100 * first["hit"]["y"])
        if math.hypot(start.x - first["unreal"][0], start.y - first["unreal"][1]) > 10:
            raise RuntimeError(f"Spawned at {start}, not at {first['label']} {first['unreal']}")
        if abs(start.z - HALF_HEIGHT - 100 * first["hit"]["y"]) > ROUTE_TOLERANCE:
            raise RuntimeError(f"Spawned at feet {start.z - HALF_HEIGHT:.2f}, START's ground is {100 * first['hit']['y']:.2f}")
        press("LeftShift", True)  # run (src/config.js PLAYER.run): the route is about 280 m
        try:
            for r in route[1:]:
                yield from move(r["label"], r["unreal"][0], r["unreal"][1], 100 * r["hit"]["y"])
        finally:
            press("LeftShift", False)
        out = Path(u.Paths.project_saved_dir()) / "site-result.json"
        out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        worst = max(r["errorCm"] for r in result["heights"])
        u.log(f"LUNDEN_SITE_OK {len(result['heights'])} control points within {TOLERANCE} cm (max {worst:.3f} cm), "
              f"{len(result['checkpoints'])} route checkpoints, result {out}")
    finally:
        levels.editor_request_end_play()
