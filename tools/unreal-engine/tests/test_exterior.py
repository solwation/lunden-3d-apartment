"""#2279: Hus L, Hus A/B/C and the garage as imported from the #2245 export, measured in Play In Editor.

The exporter casts measurement rays through each house (tools/unreal-engine/export-scene.js `buildingProbes`: façades,
gables, roofs, stairwells, the garage, the glazed entrances and Hus L's portik) on exactly the nodes it exports and
writes the first hit into measurements.json `buildings`. This test opens Hus L's imported level
(/Game/Lunden/Generated/hus-l/Level_hus-l, owned by import_world.py) with the other zones that have rays streamed in
(in memory, nothing is saved), turns Nanite off and complex collision double-sided on their meshes (in memory: a
trace would otherwise hit the simplified Nanite fallback, and the export's rays count every face from both sides),
starts Play In Editor and traces the same rays against the complex collision of each
zone's actors (the others ignored). Every ray must

- hit the same export node (the actor named by its id, or one of its `<id>__<n>` parts) within 1 cm of the web's
  hit point (expect `hit`, and `glass` for the intentional entrance glazing), or
- hit nothing, like the web (expect `clear`: Hus L's portik, an intentional through-passage).

The editor world of a commandlet traces nothing (no physics scene), hence Play In Editor. Run like the other tests:
copy this file to unreal/Lunden/Content/Python/ (untracked) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_exterior
Writes Saved/exterior-result.json and logs LUNDEN_EXTERIOR_MEASURE lines, then LUNDEN_EXTERIOR_OK.
"""
import json
import math
from pathlib import Path
import time

import unreal as u

TOLERANCE = 1.0  # cm, the issue's acceptance
PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
M = json.loads((PROJECT / "Import/measurements.json").read_text(encoding="utf-8"))
PROBES = M.get("buildings") or []
if not PROBES:
    raise RuntimeError("Import/measurements.json has no `buildings` rays: export with the zones hus-l and kvarteret")
ZONES = sorted({p["zone"] for p in PROBES})
level = lambda zone: f"/Game/Lunden/Generated/{zone}/Level_{zone}"

editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
if not u.EditorLoadingAndSavingUtils.load_map(level(ZONES[0])):
    raise RuntimeError(f"Could not load {level(ZONES[0])}: run import_world.py")
for zone in ZONES[1:]:
    if not u.EditorLevelUtils.add_level_to_world(editor.get_editor_world(), level(zone), u.LevelStreamingAlwaysLoaded):
        raise RuntimeError(f"Could not stream {level(zone)}: run import_world.py")
# Measure the imported geometry, not what the collision makes of it. A trace's complex collision is built from the
# render LOD, which for a Nanite mesh is its simplified fallback (centimetres off on large merged meshes, thin rails
# gone), and Interchange leaves it single-sided, while the exporter's rays count every face from both sides. So, in
# memory only and never saved: Nanite off (the full mesh) and double-sided complex collision on the measured meshes.
double = nanite = 0
started = time.monotonic()
for zone in ZONES:
    for path in u.EditorAssetLibrary.list_assets(f"/Game/Lunden/Generated/{zone}/StaticMeshes", recursive=True, include_folder=False):
        mesh = u.EditorAssetLibrary.load_asset(path)
        if not isinstance(mesh, u.StaticMesh):
            continue
        settings = mesh.get_editor_property("nanite_settings")
        if settings.get_editor_property("enabled"):
            settings.set_editor_property("enabled", False)
            mesh.set_editor_property("nanite_settings", settings)
            nanite += 1
        body = mesh.get_editor_property("body_setup")
        if body and not body.get_editor_property("double_sided_geometry"):
            body.set_editor_property("double_sided_geometry", True)
            double += 1
u.log(f"LUNDEN_EXTERIOR in memory (not saved): Nanite off on {nanite} meshes, double-sided complex collision on {double}, "
      f"{time.monotonic() - started:.1f} s")
levels.editor_request_begin_play()


def zone_of(actor):
    for t in actor.tags:
        t = str(t)
        if t.startswith("zone:"):
            return t[5:]
    return None


@u.AutomationScheduler.add_latent_command
def exterior_test():
    try:
        deadline = time.monotonic() + 60
        world = None
        while not world:
            if time.monotonic() >= deadline:
                raise RuntimeError("Play In Editor did not start")
            world = editor.get_game_world()
            yield
        start = u.GameplayStatics.get_time_seconds(world)
        while u.GameplayStatics.get_time_seconds(world) - start < 0.5:
            yield
        actors = u.GameplayStatics.get_all_actors_of_class(world, u.Actor)
        zoned = {}
        for a in actors:
            zoned.setdefault(zone_of(a), []).append(a)
        result = {"engine": u.SystemLibrary.get_engine_version(), "export": M.get("sourceCommit"), "tolerance": TOLERANCE,
                  "actors": {str(k): len(v) for k, v in zoned.items()}, "measurements": []}
        for zone in ZONES:
            if not zoned.get(zone):
                raise RuntimeError(f"No actors of zone {zone} in the running world")
        failures = []
        for p in PROBES:
            zone = p["zone"]
            ignore = [a for a in actors if zone_of(a) != zone]
            a, b = p["from"], p["to"]
            hit = u.SystemLibrary.line_trace_single(world, u.Vector(*a), u.Vector(*b), u.TraceTypeQuery.ECC_VISIBILITY,
                                                    True, ignore, u.DrawDebugTrace.NONE, True)
            if isinstance(hit, tuple):
                hit = hit[-1] if hit[0] else None
            parts = hit.to_tuple() if hit else None
            blocked = bool(parts and parts[0])
            name = parts[9].get_name() if blocked and parts[9] else None
            row = {"id": p["id"], "house": p["house"], "zone": zone, "what": p["what"], "expect": p["expect"],
                   "from": a, "to": b, "web": p["hit"], "hit": name}
            if p["expect"] == "clear":
                row["ok"] = not blocked and p["hit"] is None
                u.log(f"LUNDEN_EXTERIOR_MEASURE {p['id']} ({p['house']}): {'blocked by ' + str(name) if blocked else 'clear'}, "
                      f"want clear ({p['what']})")
            elif not blocked or p["hit"] is None:
                row["ok"] = False
                u.log(f"LUNDEN_EXTERIOR_MEASURE {p['id']} ({p['house']}): Unreal {'hit ' + str(name) if blocked else 'nothing'}, "
                      f"web {'hit ' + p['hit']['node'] if p['hit'] else 'nothing'}")
            else:
                point = parts[5]
                got, want, node = [point.x, point.y, point.z], p["hit"]["unreal"], p["hit"]["node"]
                error = math.dist(got, want)
                same = bool(name) and (name == node or name.startswith(node + "__"))
                row.update({"gotCm": [round(v, 3) for v in got], "wantCm": want, "errorCm": round(error, 3), "node": node,
                            "sameNode": same, "materialKey": p["hit"].get("materialKey"), "ok": error <= TOLERANCE and same})
                u.log(f"LUNDEN_EXTERIOR_MEASURE {p['id']} ({p['house']}): got [{got[0]:.2f}, {got[1]:.2f}, {got[2]:.2f}] on {name}, "
                      f"want {want} on {node}, error {error:.3f} cm ({p['what']})")
            result["measurements"].append(row)
            if not row["ok"]:
                failures.append(p["id"])
        houses = {}
        for r in result["measurements"]:
            h = houses.setdefault(r["house"], {"rays": 0, "ok": 0, "maxErrorCm": 0.0})
            h["rays"] += 1
            h["ok"] += 1 if r["ok"] else 0
            h["maxErrorCm"] = max(h["maxErrorCm"], r.get("errorCm") or 0.0)
        result["houses"] = houses
        out = Path(u.Paths.project_saved_dir()) / "exterior-result.json"
        out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        for h, s in sorted(houses.items()):
            u.log(f"LUNDEN_EXTERIOR_HOUSE {h}: {s['ok']}/{s['rays']} rays on the same node within {TOLERANCE} cm, "
                  f"max {s['maxErrorCm']:.3f} cm")
        if failures:
            raise RuntimeError(f"LUNDEN_EXTERIOR_FAIL {failures} (see {out})")
        u.log(f"LUNDEN_EXTERIOR_OK {len(result['measurements'])} rays, result {out}")
    finally:
        levels.editor_request_end_play()
