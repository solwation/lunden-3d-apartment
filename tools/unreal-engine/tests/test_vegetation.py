"""#2281: the site's trees and hedges in the world map /Game/Lunden/Maps/L_Lunden, in Play In Editor.

Every tree and hedge that the export lists in measurements.json `vegetation` must exist in the running game:

1. Trees. Each tree's trunk is a foliage instance of a trunk mesh (build_vegetation.py's `SM_Veg_trunk_*`) whose
   location lies within 10 cm of the web's foot. Its height is computed the way the exporter computes it
   (export-scene.js vegetationData), but from what Unreal holds: every crown-lobe instance goes to the tree whose foot
   is horizontally nearest in units of that tree's crown radius (within `lobeReach` radii), and the height is the
   highest top of the trunk's and its lobes' bounds (the mesh's local box through the instance transform) above the
   foot. Its height class (round(height / treeClassM)) must equal the web's.
2. Hedges. A hedge of the zone `vegetation` is a foliage instance whose bounds centre lies within 10 cm of the web's
   box centre; a hedge of another zone is that zone's imported actor (by id) when the zone is streamed, else
   build_vegetation.py's tagged copy. Its height class (round(box height / hedgeClassM)) must equal the web's.
3. The vegetation sub-level is listed in world-levels.json and loaded and visible; leaf instances use MI_LundenLeaf.
4. Trunk collision (#2308), as the web (src/farwalk.js; measurements.json `vegetation.trees[].blocks`): every blocking
   trunk has exactly one hidden blocking cube on its foot (within 1 cm) whose diamond half-width is the web's (1 mm),
   and no other trunk has one. Samples (`TRUNK_SAMPLES`: the first blocking trunk of each kind and two trunks inside
   the home block, by id): the character is placed 1.5 m from the foot on the ground and walks at a diamond face
   (diagonally) towards a point 1.5 m past the foot. A blocking trunk must stop the capsule centre at the face's
   distance plus the capsule radius (5 cm); a home-block trunk must let it pass. Any of the four diagonals may serve
   (a neighbouring trunk, bench or slope can block one approach).

Run like the other world tests: copy this file to unreal/Lunden/Content/Python/ (untracked) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_vegetation
Writes Saved/vegetation-result.json and logs LUNDEN_VEGETATION_TREE / _HEDGE summaries, then LUNDEN_VEGETATION_OK.
"""
import datetime
import json
import math
import os
from pathlib import Path
import time

import sys
import unreal as u

sys.path.insert(0, str(Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())).parents[1]
                       / "tools/unreal-engine/tests"))
import save_isolation  # noqa: E402  #2311: start without the player's save file

TOLERANCE = 10.0  # cm, the issue's acceptance for position
PACKAGE = "/Game/Lunden/Generated/VegetationWorld/Level_vegetation_foliage"
LEAF = "/Game/Lunden/Vegetation/MI_LundenLeaf"
VINE = "/Game/Lunden/Vegetation/MI_LundenVine"  # #2432
PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
WORLD = json.loads((PROJECT.parents[1] / "tools/unreal-engine/world-levels.json").read_text(encoding="utf-8"))
M = json.loads((PROJECT / "Import/measurements.json").read_text(encoding="utf-8"))
VEG = M.get("vegetation")
if not VEG:
    raise RuntimeError("Import/measurements.json has no `vegetation`: export with the zone vegetation")
MAP = WORLD["map"]

editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
if not u.EditorLoadingAndSavingUtils.load_map(MAP):
    raise RuntimeError(f"Could not load {MAP}: run compose_world.py first")
# Until compose_world.py has recomposed the map with its LFS lock, listed levels missing from it are streamed in memory
# (nothing is saved); the result records which. The accepted run has none.
IN_MEMORY = []
_world = editor.get_editor_world()
_present = {lvl.get_outermost().get_name().lower() for lvl in u.EditorLevelUtils.get_levels(_world)}
for _entry in WORLD["levels"]:
    if _entry["package"].lower() not in _present:
        if not u.EditorLevelUtils.add_level_to_world(_world, _entry["package"], u.LevelStreamingAlwaysLoaded):
            raise RuntimeError(f"Could not stream {_entry['package']}: build it with {_entry['builder']}")
        IN_MEMORY.append(_entry["package"])
u.log(f"LUNDEN_VEGETATION streamed in memory (map not recomposed): {IN_MEMORY}")
render_motion = os.environ.get("LUNDEN_VEGETATION_RENDER") == "1"
if render_motion:
    import perennial_motion
    previous_throttle = perennial_motion.setup(_world)
saved_slot = save_isolation.isolate()
levels.editor_request_begin_play()


def corners(box):
    lo, hi = box.min, box.max
    return [u.Vector(x, y, z) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]


def world_box(local_corners, transform):
    pts = [transform.transform_location(c) for c in local_corners]
    lo = u.Vector(min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))
    hi = u.Vector(max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))
    return lo, hi


def instance_transform(comp, i):
    r = comp.get_instance_transform(i, True)
    if isinstance(r, tuple):
        r = r[-1] if isinstance(r[-1], u.Transform) else r[0]
    return r


TRUNK_SAMPLES = 2  # trunks inside the home block to walk through; plus the first blocking trunk of each kind


def trunk_checks(world, result, failures):
    """#2308: the trunk cubes against the web's rule, then walk samples."""
    if "trunkCollision" not in VEG:
        failures.append("measurements.json has no vegetation.trunkCollision: export again (#2308)")
        return
    cubes = {}
    for a in u.GameplayStatics.get_all_actors_with_tag(world, "derived:trunk-collision"):
        tree = next((str(t)[5:] for t in a.tags if str(t).startswith("tree:")), None)
        cubes.setdefault(tree, []).append(a)
    blocking = [t for t in VEG["trees"] if t.get("blocks") is not None]
    bad = []
    for t in VEG["trees"]:
        mine = cubes.pop(t["id"], [])
        if t.get("blocks") is None:
            if mine:
                bad.append(f"{t['id']}: has a trunk cube, but the web does not block it")
            continue
        if len(mine) != 1:
            bad.append(f"{t['id']}: {len(mine)} trunk cubes")
            continue
        loc, scale = mine[0].get_actor_location(), mine[0].get_actor_scale3d()
        fx, fy, _ = t["foot"]["unreal"]
        half = scale.x * 100 / 2 ** 0.5 / 100  # m: the cube's half-diagonal
        if math.hypot(loc.x - fx, loc.y - fy) > 1 or abs(half - t["blocks"]) > 0.001 or abs(mine[0].get_actor_rotation().yaw - 45) > 0.01:
            bad.append(f"{t['id']}: cube at ({loc.x:.1f}, {loc.y:.1f}) half-width {half:.4f} m, want ({fx}, {fy}) {t['blocks']} m")
    bad += [f"trunk cube for unknown tree {k}" for k in cubes]
    failures.extend(bad)
    result["trunkCubes"] = {"blocking": len(blocking), "problems": len(bad)}
    u.log(f"LUNDEN_VEGETATION_TRUNKS {len(blocking)} blocking trunks with the web's diamond, {len(bad)} problems")

    pawn = u.GameplayStatics.get_player_character(world, 0)
    pc = pawn.get_controller()
    capsule = pawn.get_component_by_class(u.CapsuleComponent)
    cap_r, cap_h = capsule.get_scaled_capsule_radius(), capsule.get_scaled_capsule_half_height()
    kinds = sorted({t["kind"] for t in blocking})
    samples = [next(t for t in sorted(blocking, key=lambda t: t["id"]) if t["kind"] == k) for k in kinds]
    samples += sorted((t for t in VEG["trees"] if t.get("blocks") is None), key=lambda t: t["id"])[:TRUNK_SAMPLES]

    def press(key, down):
        u.SystemLibrary.execute_console_command(world, ("Input.+key " + key + " 1") if down else ("Input.-key " + key), pc)

    def wait(seconds):
        now = u.GameplayStatics.get_time_seconds(world)
        while u.GameplayStatics.get_time_seconds(world) - now < seconds:
            yield

    def ground(x, y, top):
        hit = u.SystemLibrary.line_trace_single(world, u.Vector(x, y, top), u.Vector(x, y, top - 2000),
                                                u.TraceTypeQuery.ECC_VISIBILITY, False, [pawn], u.DrawDebugTrace.NONE, True)
        if isinstance(hit, tuple):
            hit = hit[-1] if hit[0] else None
        parts = hit.to_tuple() if hit else None
        return parts[5].z if parts and parts[0] else None

    result["trunkWalks"] = []
    for t in samples:
        fx, fy, fz = t["foot"]["unreal"]
        blocks = t.get("blocks")
        want = blocks * 100 / 2 ** 0.5 + cap_r if blocks is not None else None
        tries = []
        for dx, dy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            dx, dy = dx / 2 ** 0.5, dy / 2 ** 0.5
            sx, sy = fx - dx * 150, fy - dy * 150
            floor = ground(sx, sy, fz + 200)
            if floor is None:
                tries.append({"dir": [dx, dy], "outcome": "no ground"})
                continue
            pawn.set_actor_location(u.Vector(sx, sy, floor + cap_h + 5), False, True)
            pawn.get_movement_component().stop_movement_immediately()
            pc.set_control_rotation(u.Rotator(roll=0, pitch=0, yaw=math.degrees(math.atan2(dy, dx))))
            yield from wait(0.3)
            tx, ty = fx + dx * 150, fy + dy * 150
            press("W", True)
            began = u.GameplayStatics.get_time_seconds(world)
            nearest, progress, reached = float("inf"), began, False
            try:
                while True:
                    p = pawn.get_actor_location()
                    dist = math.hypot(tx - p.x, ty - p.y)
                    now = u.GameplayStatics.get_time_seconds(world)
                    if dist <= 10:
                        reached = True
                        break
                    if dist < nearest - 1:
                        nearest, progress = dist, now
                    if now - progress > 0.6 or now - began > 6:
                        break
                    pc.set_control_rotation(u.Rotator(roll=0, pitch=0, yaw=math.degrees(math.atan2(ty - p.y, tx - p.x))))
                    yield
            finally:
                press("W", False)
            p = pawn.get_actor_location()
            along = -((p.x - fx) * dx + (p.y - fy) * dy)  # capsule centre's distance before the foot along the approach
            side = abs((p.x - fx) * dy - (p.y - fy) * dx)
            ok = (not reached and abs(along - want) <= 5 and side <= 5) if want is not None else reached
            tries.append({"dir": [round(dx, 3), round(dy, 3)], "reached": reached, "beforeFootCm": round(along, 2),
                          "sideCm": round(side, 2), "ok": ok})
            if ok:
                break
        ok = any(x.get("ok") for x in tries)
        row = {"id": t["id"], "kind": t["kind"], "blocks": blocks, "expectStopCm": round(want, 2) if want else None,
               "tries": tries, "ok": ok}
        result["trunkWalks"].append(row)
        last = next((x for x in tries if x.get("ok")), tries[-1])
        u.log(f"LUNDEN_VEGETATION_TRUNK_WALK {t['id']} ({t['kind']}, web {'blocks ' + str(blocks) + ' m' if blocks else 'does not block'}): "
              f"{last}, want {'stop at ' + format(want, '.1f') + ' cm' if want else 'pass'}")
        if not ok:
            failures.append(f"trunk walk {t['id']} ({t['kind']}): {tries}")


def vegetation_parameters(world):
    pc = u.GameplayStatics.get_player_controller(world, 0)
    seasons, = pc.get_components_by_class(u.load_class(None, "/Game/Lunden/Seasons/BPC_LundenSeasons.BPC_LundenSeasons_C"))
    calendar = u.load_asset("/Game/Lunden/Seasons/MPC_LundenVegetation")
    today = datetime.date.today()
    months = []
    try:
        for month in (1, 6, 10):
            seasons.call_method("ApplySeason", (2026, month, 15))
            value = u.MaterialLibrary.get_scalar_parameter_value(world, calendar, "Month")
            if value != month:
                raise RuntimeError(f"ApplySeason({month}) published {value} to the vegetation materials")
            months.append(value)
    finally:
        seasons.call_method("ApplySeason", (today.year, today.month, today.day))
    weather = u.load_asset("/Game/Lunden/Lighting/MPC_LundenWeather")
    sky, = u.GameplayStatics.get_all_actors_of_class(world, u.load_class(None, "/Game/Lunden/Lighting/BP_LundenSky.BP_LundenSky_C"))
    speed, direction = (sky.get_editor_property(n) for n in ("WindSpeed", "WindFromDeg"))
    winds = []
    try:
        for sample_speed, turn in ((0, 0), (5, 0), (13, 90)):
            sky.set_editor_property("WindSpeed", sample_speed)
            sky.set_editor_property("WindFromDeg", sky.get_editor_property("PlanNorth") + turn)
            sky.call_method("UpdateSky")
            wind = [u.MaterialLibrary.get_scalar_parameter_value(world, weather, key) for key in ("WindX", "WindY")]
            if math.dist(wind, [-sample_speed * math.sin(math.radians(turn)), sample_speed * math.cos(math.radians(turn))]) > 0.01:
                raise RuntimeError(f"The vegetation wind input differs from {sample_speed} m/s at {turn} degrees: {wind}")
            winds.append(wind)
    finally:
        sky.set_editor_property("WindSpeed", speed)
        sky.set_editor_property("WindFromDeg", direction)
        sky.call_method("UpdateSky")
    return {"months": months, "windXY": winds}


@u.AutomationScheduler.add_latent_command
def vegetation_test():
    try:
        deadline = time.monotonic() + 60
        world = None
        while not (world and u.GameplayStatics.get_player_character(world, 0)):
            if time.monotonic() >= deadline:
                raise RuntimeError("L_Lunden did not spawn the first-person character")
            world = editor.get_game_world()
            yield
        result = {"engine": u.SystemLibrary.get_engine_version(), "map": MAP, "export": M.get("sourceCommit"),
                  "tolerance": TOLERANCE, "inMemory": IN_MEMORY, "trees": [], "hedges": [], "instances": {}}
        result["vegetationParameters"] = vegetation_parameters(world)
        listed = [e["package"] for e in WORLD["levels"]]
        if PACKAGE not in listed:
            raise RuntimeError(f"{PACKAGE} is not in world-levels.json")
        stream = u.GameplayStatics.get_streaming_level(world, PACKAGE.rsplit("/", 1)[-1])
        if not stream or not stream.is_level_loaded() or not stream.is_level_visible():
            raise RuntimeError(f"Sub-level {PACKAGE} is not loaded and visible")

        # every foliage instance in the running game: (role, location, world box)
        inst = {"trunk": [], "crown": [], "hedge": [], "other": []}
        perennial_instances = 0
        leaf_ok = True
        for ifa in u.GameplayStatics.get_all_actors_of_class(world, u.InstancedFoliageActor):
            for comp in ifa.get_components_by_class(u.InstancedStaticMeshComponent):
                mesh = comp.static_mesh
                if not mesh or not mesh.get_name().startswith("SM_Veg_"):
                    continue
                role = mesh.get_name().split("_")[2]
                local = corners(mesh.get_bounding_box())
                n = comp.get_instance_count()
                result["instances"][mesh.get_name()] = result["instances"].get(mesh.get_name(), 0) + n
                if "mesh_courtyard-shrubs_" in mesh.get_name():
                    expected = "/Game/Lunden/Vegetation/MI_LundenPerennial" if "stillLeafKeys" in VEG["look"] else LEAF
                    if expected not in [m.get_path_name().split(".")[0] for m in comp.get_materials() if m]:
                        raise RuntimeError("The courtyard perennials lost their wind material")
                    if not comp.get_editor_property("evaluate_world_position_offset"):
                        raise RuntimeError("The courtyard perennial component disabled wind displacement")
                    if render_motion and n and "perennialMotion" not in result:
                        bounds = world_box(local, instance_transform(comp, 0))
                        result["perennialMotion"] = yield from perennial_motion.measure(world, comp, bounds)
                    perennial_instances += n
                mats = [m.get_path_name().split(".")[0] for m in comp.get_materials() if m]
                if role == "crown":
                    result["crownMaterials"] = mats
                    leaf_ok = leaf_ok and LEAF in mats
                # #2432: the season shrinks crown and vine lobes in the vertex shader, so their foliage evaluates the offset
                if (role == "crown" or VINE in mats) and not comp.get_editor_property("evaluate_world_position_offset"):
                    raise RuntimeError(f"{mesh.get_name()} disabled world position offset: its lobes cannot follow the season")
                if VINE in mats:
                    result["vineInstances"] = result.get("vineInstances", 0) + n
                # #2432: crowns and vines carry their tree's web seeds as custom data, so a tree keeps one colour in play
                if VEG.get("seeds") and (role == "crown" or VINE in mats) and comp.get_editor_property("num_custom_data_floats") != 4:
                    raise RuntimeError(f"{mesh.get_name()} lost its season seeds (custom data floats "
                                       f"{comp.get_editor_property('num_custom_data_floats')}, expected 4)")
                for i in range(n):
                    t = instance_transform(comp, i)
                    inst[role].append((t.translation, world_box(local, t)))
        if "stillLeafKeys" in VEG["look"] and perennial_instances != VEG["byWebName"]["courtyard-shrubs"]:
            raise RuntimeError(f"The courtyard foliage must keep the perennials separate from its still vines: {perennial_instances}")
        if render_motion and "perennialMotion" not in result:
            raise RuntimeError("No courtyard perennial was available for the offscreen motion measurement")
        result["perennialWindInstances"] = perennial_instances
        if "stillLeafKeys" in VEG["look"] and not result.get("vineInstances"):
            raise RuntimeError("The still vines lost MI_LundenVine (seasonal lobe size without sway, #2432)")
        if not leaf_ok:
            raise RuntimeError(f"The crown lobes do not use {LEAF}: {result.get('crownMaterials')}")
        failures = []

        # ---------------------------------------------------------------- trees
        cell = 100.0
        grid = {}
        for loc, box in inst["trunk"]:
            grid.setdefault((math.floor(loc.x / cell), math.floor(loc.y / cell)), []).append((loc, box))
        trees = []
        for t in VEG["trees"]:
            fx, fy, fz = t["foot"]["unreal"]
            best, bd = None, float("inf")
            for gx in (-1, 0, 1):
                for gy in (-1, 0, 1):
                    for loc, box in grid.get((math.floor(fx / cell) + gx, math.floor(fy / cell) + gy), []):
                        d = math.sqrt((loc.x - fx) ** 2 + (loc.y - fy) ** 2 + (loc.z - fz) ** 2)
                        if d < bd:
                            best, bd = (loc, box), d
            trees.append({"t": t, "trunk": best, "error": bd, "top": best[1][1].z if best else None, "lobes": 0})
        reach = VEG["lobeReach"]
        for loc, box in inst["crown"]:
            best, bd = None, reach
            for tr in trees:
                fx, fy, _ = tr["t"]["foot"]["unreal"]
                d = math.hypot(loc.x - fx, loc.y - fy) / (100.0 * tr["t"]["crownR"])
                if d < bd:
                    best, bd = tr, d
            if best and best["top"] is not None:
                best["lobes"] += 1
                best["top"] = max(best["top"], box[1].z)
        worst, worst_h = 0.0, 0.0
        for tr in trees:
            t = tr["t"]
            row = {"id": t["id"], "kind": t["kind"], "errorCm": None if tr["trunk"] is None else round(tr["error"], 3),
                   "webHeight": t["height"], "webClass": t["heightClass"], "webLobes": t["lobes"], "lobes": tr["lobes"]}
            if tr["trunk"] is None or tr["error"] > TOLERANCE:
                failures.append(f"tree {t['id']}: no trunk within {TOLERANCE} cm of {t['foot']['unreal']} (nearest {tr['error']:.1f} cm)")
            else:
                h = (tr["top"] - t["foot"]["unreal"][2]) / 100.0
                row.update(height=round(h, 4), heightClass=round(h / VEG["treeClassM"]))
                worst, worst_h = max(worst, tr["error"]), max(worst_h, abs(h - t["height"]))
                if row["heightClass"] != t["heightClass"]:
                    failures.append(f"tree {t['id']}: height class {row['heightClass']} ({h:.2f} m), web {t['heightClass']} ({t['height']} m)")
            result["trees"].append(row)
        u.log(f"LUNDEN_VEGETATION_TREE {len(trees)} trees: trunk within {worst:.3f} cm of the web's foot, "
              f"height within {100 * worst_h:.3f} cm, {sum(1 for r in result['trees'] if r.get('heightClass') == r['webClass'])} in the web's height class")

        # ---------------------------------------------------------------- hedges
        actors = u.GameplayStatics.get_all_actors_of_class(world, u.StaticMeshActor)
        by_name = {a.get_name(): a for a in actors}
        copies = {}
        for a in actors:
            tags = {str(x) for x in a.tags}
            if "derived:vegetation-copy" in tags:
                for x in tags:
                    copies[x] = a
        for h in VEG["hedges"]:
            cx, cy, cz = h["centre"]["unreal"]
            zone_level = f"/Game/Lunden/Generated/{h['zone']}/Level_{h['zone']}"
            if h["zone"] == "vegetation":
                cands = [box for _, box in inst["hedge"]]
                where = "foliage instance"
            else:
                a = by_name.get(h["id"]) if zone_level in listed else copies.get(h["id"])
                where = "imported actor in " + h["zone"] if zone_level in listed else "copy in the vegetation level"
                cands = []
                if a:
                    o, e = a.get_actor_bounds(False)
                    cands = [(u.Vector(o.x - e.x, o.y - e.y, o.z - e.z), u.Vector(o.x + e.x, o.y + e.y, o.z + e.z))]
            best, bd = None, float("inf")
            for lo, hi in cands:
                d = math.sqrt(((lo.x + hi.x) / 2 - cx) ** 2 + ((lo.y + hi.y) / 2 - cy) ** 2 + ((lo.z + hi.z) / 2 - cz) ** 2)
                if d < bd:
                    best, bd = (lo, hi), d
            row = {"id": h["id"], "zone": h["zone"], "where": where, "webHeight": h["height"], "webClass": h["heightClass"]}
            if best is None or bd > TOLERANCE:
                failures.append(f"hedge {h['id']} ({h['zone']}): nothing within {TOLERANCE} cm ({where}, nearest {bd:.1f} cm)")
            else:
                height = (best[1].z - best[0].z) / 100.0
                row.update(errorCm=round(bd, 3), height=round(height, 4), heightClass=round(height / VEG["hedgeClassM"]))
                if row["heightClass"] != h["heightClass"]:
                    failures.append(f"hedge {h['id']}: height class {row['heightClass']} ({height:.3f} m), web {h['heightClass']}")
            result["hedges"].append(row)
            u.log(f"LUNDEN_VEGETATION_HEDGE {h['id']} ({where}): {row}")

        yield from trunk_checks(world, result, failures)

        out = Path(u.Paths.project_saved_dir()) / "vegetation-result.json"
        result["failures"] = failures
        out.write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
        if failures:
            raise RuntimeError(f"{len(failures)} vegetation failures, first: {failures[:5]}")
        u.log(f"LUNDEN_VEGETATION_OK {len(trees)} trees and {len(VEG['hedges'])} hedges within {TOLERANCE} cm and in their "
              f"height class; {sum(result['instances'].values())} foliage instances; result {out}")
    finally:
        levels.editor_request_end_play()
        try:
            yield from save_isolation.restore_after_play(saved_slot, editor)
        finally:
            if render_motion:
                perennial_motion.restore(_world, previous_throttle)
