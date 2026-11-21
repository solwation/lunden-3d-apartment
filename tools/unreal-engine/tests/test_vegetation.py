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

Run like the other world tests: copy this file to unreal/Lunden/Content/Python/ (untracked) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_vegetation
Writes Saved/vegetation-result.json and logs LUNDEN_VEGETATION_TREE / _HEDGE summaries, then LUNDEN_VEGETATION_OK.
"""
import json
import math
from pathlib import Path
import time

import unreal as u

TOLERANCE = 10.0  # cm, the issue's acceptance for position
PACKAGE = "/Game/Lunden/Generated/VegetationWorld/Level_vegetation_foliage"
LEAF = "/Game/Lunden/Vegetation/MI_LundenLeaf"
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
        listed = [e["package"] for e in WORLD["levels"]]
        if PACKAGE not in listed:
            raise RuntimeError(f"{PACKAGE} is not in world-levels.json")
        stream = u.GameplayStatics.get_streaming_level(world, PACKAGE.rsplit("/", 1)[-1])
        if not stream or not stream.is_level_loaded() or not stream.is_level_visible():
            raise RuntimeError(f"Sub-level {PACKAGE} is not loaded and visible")

        # every foliage instance in the running game: (role, location, world box)
        inst = {"trunk": [], "crown": [], "hedge": [], "other": []}
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
                if role == "crown":
                    mats = [m.get_path_name().split(".")[0] for m in comp.get_materials() if m]
                    result["crownMaterials"] = mats
                    leaf_ok = leaf_ok and LEAF in mats
                for i in range(n):
                    t = instance_transform(comp, i)
                    inst[role].append((t.translation, world_box(local, t)))
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

        out = Path(u.Paths.project_saved_dir()) / "vegetation-result.json"
        result["failures"] = failures
        out.write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
        if failures:
            raise RuntimeError(f"{len(failures)} vegetation failures, first: {failures[:5]}")
        u.log(f"LUNDEN_VEGETATION_OK {len(trees)} trees and {len(VEG['hedges'])} hedges within {TOLERANCE} cm and in their "
              f"height class; {sum(result['instances'].values())} foliage instances; result {out}")
    finally:
        levels.editor_request_end_play()
