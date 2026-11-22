"""#2392 probe 2 (scratch): what shades the courtyard walk at entrance A? Nothing is saved.
Renders entrance-a as is, with the collision actors' shadows off (in memory), and with the sun's shadows off,
and traces from ground points on the walk towards the sun, listing every hit."""
import datetime, json, math, os, sys
from pathlib import Path
import unreal as u
TOOLS = Path(r"C:/Users/Olof/Documents/lunden-ue-wt/opus-release-2419/tools/unreal-engine")
sys.path.insert(0, str(TOOLS / "python")); sys.path.insert(0, str(TOOLS / "tests"))
from screenshot_level import render_view
from prepare_nanite_materials import static_mesh_editor
from capture_light import light_for
from capture_world import MANIFEST
VIEWS = json.loads((TOOLS.parents[1] / "unreal/Lunden/Tests/views.json").read_text(encoding="utf-8"))
scene = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")); out = sys.argv[2]
u.EditorLoadingAndSavingUtils.load_map(MANIFEST["map"])
world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
light = light_for(world); date = datetime.date(**VIEWS["date"]); cd = (date.year, date.month, date.day)
hidden = light.seasons.apply(cd)
for path in u.EditorAssetLibrary.list_assets("/Game/Lunden/Generated", recursive=True, include_folder=False):
    if "/StaticMeshes/" not in path: continue
    mesh = u.EditorAssetLibrary.load_asset(path)
    s = mesh.get_editor_property("nanite_settings") if isinstance(mesh, u.StaticMesh) else None
    if s and s.get_editor_property("enabled"):
        s.set_editor_property("enabled", False); static_mesh_editor().set_nanite_settings(mesh, s, True)
actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
excluded = [a for a in actors if "kind:collision" in [str(t) for t in a.tags]]
u.SystemLibrary.execute_console_command(world, "r.Shadow.Virtual.Enable 0")
cam = [c for c in scene["cameras"] if c["id"] == "entrance-a"][0]
preset = VIEWS["lighting"][cam["lighting"]]
light.use(cam["lighting"], preset, cd, applied_season=hidden)
suns = [a for a in actors if isinstance(a, u.DirectionalLight)] + [a for a in u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors() if a.get_components_by_class(u.DirectionalLightComponent) and not isinstance(a, u.DirectionalLight)]
info = {"suns": []}
dls = []
for a in suns:
    for c in a.get_components_by_class(u.DirectionalLightComponent):
        dls.append(c)
        f = c.get_forward_vector()
        info["suns"].append({"actor": a.get_actor_label(), "visible": c.is_visible(), "castShadows": c.get_editor_property("cast_shadows"),
                             "intensity": c.get_editor_property("intensity"), "forward": [f.x, f.y, f.z], "rot": str(c.get_world_rotation())})
u.log("PROBE2_SUNS " + json.dumps(info["suns"]))
# sun traces from walk points around the camera
main = [d for d in info["suns"] if d["visible"] and d["intensity"] > 0]
f = main[0]["forward"] if main else info["suns"][0]["forward"]
to_sun = u.Vector(-f[0], -f[1], -f[2])
traces = []
cx, cy = cam["xyz"][0], cam["xyz"][1]
yaw = math.radians(cam["yaw"])
for dist in (150, 300, 500, 800):
    for side in (-100, 0, 100):
        px = cx + dist * math.cos(yaw) - side * math.sin(yaw); py = cy + dist * math.sin(yaw) + side * math.cos(yaw)
        down = u.SystemLibrary.line_trace_single(world, u.Vector(px, py, 500), u.Vector(px, py, -2000), u.TraceTypeQuery.TRACE_TYPE_QUERY1, True, [], u.DrawDebugTrace.NONE, True)
        hit = down[0] if isinstance(down, tuple) else down
        t = hit.to_tuple() if hit else ()
        ground = t[4] if len(t) > 4 else None  # impact point
        gz = ground.z if ground else 0.0
        gname = t[9].get_actor_label() if len(t) > 9 and t[9] else None
        start = u.Vector(px, py, gz + 2)
        end = u.Vector(px + to_sun.x * 20000, py + to_sun.y * 20000, gz + 2 + to_sun.z * 20000)
        hits = u.SystemLibrary.line_trace_multi(world, start, end, u.TraceTypeQuery.TRACE_TYPE_QUERY1, True, [], u.DrawDebugTrace.NONE, True)
        hl = hits[0] if isinstance(hits, tuple) and isinstance(hits[0], (list, tuple)) else hits
        names = []
        for h in (hl or []):
            ht = h.to_tuple()
            act = ht[9] if len(ht) > 9 else None
            comp = ht[10] if len(ht) > 10 else None
            names.append({"actor": act.get_actor_label() if act else None, "tags": [str(x) for x in act.tags] if act else [],
                          "comp": comp.get_name() if comp else None, "dist": round(ht[3], 1) if len(ht) > 3 else None,
                          "hiddenInGame": comp.get_editor_property("hidden_in_game") if comp else None,
                          "castShadow": comp.get_editor_property("cast_shadow") if comp else None})
        traces.append({"point": [round(px), round(py), round(gz, 1)], "ground": gname, "hits": names})
u.log("PROBE2_TRACES " + json.dumps(traces))
res = []
obs = render_view(world, out, "s-base-entrance-a", u.Vector(*cam["xyz"]), u.Rotator(roll=0, pitch=cam["pitch"], yaw=cam["yaw"]),
                  scene["width"], scene["height"], scene["horizontalFov"], light.bias(preset), excluded + hidden, lumen=True)
for a in excluded:
    for c in a.get_components_by_class(u.PrimitiveComponent):
        c.set_editor_property("cast_shadow", False)
obs = render_view(world, out, "s-nocoll-entrance-a", u.Vector(*cam["xyz"]), u.Rotator(roll=0, pitch=cam["pitch"], yaw=cam["yaw"]),
                  scene["width"], scene["height"], scene["horizontalFov"], light.bias(preset), excluded + hidden, lumen=True)
for c in dls:
    c.set_editor_property("cast_shadows", False)
obs = render_view(world, out, "s-nosun-entrance-a", u.Vector(*cam["xyz"]), u.Rotator(roll=0, pitch=cam["pitch"], yaw=cam["yaw"]),
                  scene["width"], scene["height"], scene["horizontalFov"], light.bias(preset), excluded + hidden, lumen=True)
(Path(out) / "probe2.json").write_text(json.dumps({"suns": info["suns"], "traces": traces, "excluded": len(excluded), "hiddenSeasonal": len(hidden)}, indent=1, default=str))
u.EditorLoadingAndSavingUtils.new_blank_map(False)
u.log("PROBE2_OK")
