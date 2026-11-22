"""#2281: render views of the world map with the vegetation for the web/Unreal picture pairs (verification only).

    UnrealEditor-Cmd.exe <uproject> -run=pythonscript "-script=<this file> <scene.json> <out dir> [view id,…] [YYYY-MM-DD]"
        -AllowCommandletRendering -RenderOffScreen -unattended -nosplash -nosound

scene.json: `node tools/unreal-engine/pilot-scene.mjs measurements.json scene.json` for the cameras (see
docs/verification/2281/). Loads and checks the complete composed L_Lunden, turns Nanite off in memory on the imported meshes (their full meshes,
as capture_lighting.py: a one-shot commandlet capture draws Nanite meshes as coarse panels, #2298; the vegetation's own mesh copies have
Nanite off already) and lights the views with the world's own sky (#2283's BP_LundenSky, set to views.json's date and
each preset's hour exactly as capture_lighting.py does; no temporary rig) and takes the game's locked exposure
(capture_light.game_bias, #2313; until #2390 this script used the pilot rig's fixed bias 0, about 2 EV brighter). Renders with screenshot_level.render_view.
Nothing is saved. Logs LUNDEN_VEGETATION_CAPTURE_OK.
"""
import datetime
import json
import math
import os
from pathlib import Path
import sys

import unreal as u

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from screenshot_level import render_view  # noqa: E402
from prepare_nanite_materials import static_mesh_editor  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from capture_light import light_for  # noqa: E402
from capture_world import MANIFEST  # noqa: E402

TOOLS = Path(__file__).resolve().parents[1]
# views.json's date and lighting presets (the scene file's cameras may come from a scratch copy with extra views)
VIEWS = json.loads((TOOLS.parents[1] / "unreal/Lunden/Tests/views.json").read_text(encoding="utf-8"))


def run(scene_path, out_dir, ids=None, iso_date=None):
    date = datetime.date.fromisoformat(iso_date) if iso_date else datetime.date(**VIEWS["date"])
    scene = json.loads(Path(scene_path).read_text(encoding="utf-8"))
    wanted = ids.split(",") if ids else [c["id"] for c in scene["cameras"]]
    if not u.EditorLoadingAndSavingUtils.load_map(MANIFEST["map"]):
        raise RuntimeError(f"Cannot load {MANIFEST['map']}: run compose_world.py first")
    world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
    light = light_for(world)
    capture_date = (date.year, date.month, date.day)
    # ApplySeason changes actor collision. Do it once, before the Nanite rebuild registers
    # replacement physics proxies in this same commandlet tick (as in capture_lighting.py).
    hidden_seasonal = light.seasons.apply(capture_date)
    fallback = 0
    if os.environ.get("LUNDEN_CAPTURE_NANITE") != "1":
        for path in u.EditorAssetLibrary.list_assets("/Game/Lunden/Generated", recursive=True, include_folder=False):
            if "/StaticMeshes/" not in path:
                continue
            mesh = u.EditorAssetLibrary.load_asset(path)
            settings = mesh.get_editor_property("nanite_settings") if isinstance(mesh, u.StaticMesh) else None
            if settings and settings.get_editor_property("enabled"):
                settings.set_editor_property("enabled", False)
                static_mesh_editor().set_nanite_settings(mesh, settings, True)  # rebuilds the render data (#2297)
                fallback += 1
    actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
    excluded = [a for a in actors if "kind:collision" in [str(t) for t in a.tags]]
    calendar = u.load_asset("/Game/Lunden/Seasons/MPC_LundenVegetation")
    if not calendar:
        raise RuntimeError("Build the seasonal vegetation collection before capturing the vegetation")
    u.SystemLibrary.execute_console_command(world, "r.Shadow.Virtual.Enable 0")
    os.makedirs(out_dir, exist_ok=True)
    observed = []
    for cam in [c for c in scene["cameras"] if c["id"] in wanted]:
        preset = VIEWS["lighting"][cam["lighting"]]
        light.use(cam["lighting"], preset, capture_date, applied_season=hidden_seasonal)
        if u.MaterialLibrary.get_scalar_parameter_value(world, calendar, "Month") != date.month:
            raise RuntimeError("The vegetation materials did not receive the capture month")
        obs = render_view(world, out_dir, cam["id"], u.Vector(*cam["xyz"]),
                          u.Rotator(roll=0, pitch=cam["pitch"], yaw=cam["yaw"]), scene["width"], scene["height"],
                          scene["horizontalFov"], light.bias(preset),
                          excluded + light.seasons.hidden_at(hidden_seasonal, capture_date, preset["hour"]), lumen=True)
        if math.dist(obs["xyz"], cam["xyz"]) > 0.01 or any(abs(obs[k] - cam[k]) > 0.001 for k in ("pitch", "yaw")):
            raise RuntimeError("Camera transform mismatch: " + cam["id"])
        observed.append({**obs, "id": cam["id"], "lighting": cam["lighting"], "hour": preset["hour"], "exposureBias": light.bias(preset), "date": {"year": date.year, "month": date.month, "day": date.day}})
    (Path(out_dir) / "capture.json").write_text(json.dumps({"engine": u.SystemLibrary.get_engine_version(), "map": MANIFEST["map"],
        "date": date.isoformat(), "loadedLevels": light.seasons.loaded_levels, "streamedInMemory": [], "naniteOffInMemory": fallback, "hiddenCollisionActors": len(excluded), "lamps": len(light.lamps), "cameras": observed}, indent=2) + "\n")
    u.EditorLoadingAndSavingUtils.new_blank_map(False)  # discard the capture state
    u.log(f"LUNDEN_VEGETATION_CAPTURE_OK {len(observed)} views")


run(*[a for a in sys.argv[1:] if a])
