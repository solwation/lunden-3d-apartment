"""#2281: render views of the world map with the vegetation for the web/Unreal picture pairs (verification only).

    UnrealEditor-Cmd.exe <uproject> -run=pythonscript "-script=<this file> <scene.json> <out dir> [view id,…]"
        -AllowCommandletRendering -RenderOffScreen -unattended -nosplash -nosound

scene.json: `node tools/unreal-engine/pilot-scene.mjs measurements.json scene.json` for the cameras (see
docs/verification/2281/). Loads L_Lunden and streams in memory every world-levels.json sub-level the saved map does not
hold yet (until compose_world.py recomposes it), turns Nanite off in memory on the imported meshes (their full meshes,
as capture_lighting.py: the commandlet capture draws the Nanite fallback, #2298; the vegetation's own mesh copies have
Nanite off already) and lights the views with the world's own sky (#2283's BP_LundenSky, set to views.json's date and
each preset's hour exactly as capture_lighting.py does; no temporary rig). Renders with screenshot_level.render_view.
Nothing is saved. Logs LUNDEN_VEGETATION_CAPTURE_OK.
"""
import json
import math
import os
from pathlib import Path
import sys

import unreal as u

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from screenshot_level import render_view  # noqa: E402

TOOLS = Path(__file__).resolve().parents[1]
WORLD = json.loads((TOOLS / "world-levels.json").read_text(encoding="utf-8"))
# views.json's date and lighting presets (the scene file's cameras may come from a scratch copy with extra views)
VIEWS = json.loads((TOOLS.parents[1] / "unreal/Lunden/Tests/views.json").read_text(encoding="utf-8"))


def run(scene_path, out_dir, ids=None):
    scene = json.loads(Path(scene_path).read_text(encoding="utf-8"))
    wanted = ids.split(",") if ids else [c["id"] for c in scene["cameras"]]
    if not u.EditorLoadingAndSavingUtils.load_map(WORLD["map"]):
        raise RuntimeError(f"Cannot load {WORLD['map']}: run compose_world.py first")
    world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
    present = {lvl.get_outermost().get_name().lower() for lvl in u.EditorLevelUtils.get_levels(world)}
    added = []
    for entry in WORLD["levels"]:
        if entry["package"].lower() not in present:
            if not u.EditorLevelUtils.add_level_to_world(world, entry["package"], u.LevelStreamingAlwaysLoaded):
                raise RuntimeError(f"Cannot stream {entry['package']}: build it with {entry['builder']}")
            added.append(entry["package"])
    fallback = 0
    if os.environ.get("LUNDEN_CAPTURE_NANITE") != "1":
        for path in u.EditorAssetLibrary.list_assets("/Game/Lunden/Generated", recursive=True, include_folder=False):
            if "/StaticMeshes/" not in path:
                continue
            mesh = u.EditorAssetLibrary.load_asset(path)
            settings = mesh.get_editor_property("nanite_settings") if isinstance(mesh, u.StaticMesh) else None
            if settings and settings.get_editor_property("enabled"):
                settings.set_editor_property("enabled", False)
                mesh.set_editor_property("nanite_settings", settings)
                fallback += 1
    actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
    excluded = [a for a in actors if "kind:collision" in [str(t) for t in a.tags]]
    skies = [a for a in actors if "lunden:sky" in [str(t) for t in a.tags]]
    lamps = [a for a in actors if any(str(t).startswith("lamp:") for t in a.tags)]
    if len(skies) != 1:
        raise RuntimeError(f"L_Lunden has {len(skies)} skies: run build_lighting.py (#2283)")
    sky = skies[0]
    skylight = sky.get_component_by_class(u.SkyLightComponent)
    skylight.set_editor_property("real_time_capture", False, u.PropertyAccessChangeNotifyMode.NEVER)
    u.SystemLibrary.execute_console_command(world, "r.Shadow.Virtual.Enable 0")
    os.makedirs(out_dir, exist_ok=True)
    observed = []
    for cam in [c for c in scene["cameras"] if c["id"] in wanted]:
        preset = VIEWS["lighting"][cam["lighting"]]
        for k, v in (("UseClock", False), ("TimeScale", 0.0), ("Year", VIEWS["date"]["year"]), ("Month", VIEWS["date"]["month"]),
                     ("Day", VIEWS["date"]["day"]), ("Hour", float(preset["hour"])), ("Rain", 0.0), ("Snow", 0.0), ("Wet", 0.0)):
            sky.set_editor_property(k, v, u.PropertyAccessChangeNotifyMode.NEVER)
        sky.call_method("UpdateSky")
        for lamp in lamps:
            lamp.call_method("TurnOn" if preset["lampsOn"] else "TurnOff")
        skylight.recapture_sky()
        obs = render_view(world, out_dir, cam["id"], u.Vector(*cam["xyz"]),
                          u.Rotator(roll=0, pitch=cam["pitch"], yaw=cam["yaw"]), scene["width"], scene["height"],
                          scene["horizontalFov"], -0.7 if preset["lampsOn"] else 0, excluded, lumen=True)
        if math.dist(obs["xyz"], cam["xyz"]) > 0.01 or any(abs(obs[k] - cam[k]) > 0.001 for k in ("pitch", "yaw")):
            raise RuntimeError("Camera transform mismatch: " + cam["id"])
        observed.append({**obs, "id": cam["id"], "lighting": cam["lighting"], "hour": preset["hour"], "date": VIEWS["date"]})
    (Path(out_dir) / "capture.json").write_text(json.dumps({"engine": u.SystemLibrary.get_engine_version(), "map": WORLD["map"],
        "streamedInMemory": added, "naniteOffInMemory": fallback, "hiddenCollisionActors": len(excluded), "lamps": len(lamps), "cameras": observed}, indent=2) + "\n")
    u.EditorLoadingAndSavingUtils.new_blank_map(False)  # discard the temporary levels and rig
    u.log(f"LUNDEN_VEGETATION_CAPTURE_OK {len(observed)} views")


run(*[a for a in sys.argv[1:] if a])
