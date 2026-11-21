"""#2283: render the shared reference views (unreal/Lunden/Tests/views.json) of L_Lunden with its own lighting.

    UnrealEditor-Cmd.exe <uproject> -run=pythonscript "-script=<this file> <scene.json> <out dir> [shot,…]"
        -AllowCommandletRendering -RenderOffScreen -unattended -nosplash -nosound

scene.json comes from `node tools/unreal-engine/pilot-scene.mjs measurements.json scene.json` (cameras converted from
the web). Unlike capture_l1007.py there is no temporary rig: the world's BP_LundenSky (Generated/Lighting/Level_lighting,
composed into L_Lunden) is set to views.json's date and each preset's hour with UseClock off, UpdateSky runs, and the
lamps are switched with their TurnOn / TurnOff events (views.json `lampsOn`). Weather shots switch Rain or Snow on and
set Wet to 1 (a soaked street). Nothing is saved; the zones' meshes render with Nanite off in memory (a one-shot
commandlet capture draws Nanite meshes as coarse loose panels otherwise, also with the full fallback of importer
version 5, #2279/#2298). Logs LUNDEN_LIGHTING_CAPTURE_OK.
"""
import json
import math
import os
from pathlib import Path
import sys

import unreal as u

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from screenshot_level import render_view  # noqa: E402
from prepare_nanite_materials import static_mesh_editor  # noqa: E402

MAP = "/Game/Lunden/Maps/L_Lunden"
VIEWS = json.loads((Path(__file__).resolve().parents[3] / "unreal/Lunden/Tests/views.json").read_text(encoding="utf-8"))
# (name, camera id, lighting preset, weather): the five shared pairs, then rain and snow outside and through windows.
SHOTS = [("start", "start", "day", None), ("living-room", "living-room", "day", None), ("patio", "patio", "day", None),
         ("stairs", "stairs", "evening", None), ("upper-floor", "upper-floor", "evening", None),
         ("start-rain", "start", "day", "Rain"), ("living-room-rain", "living-room", "day", "Rain"),
         ("patio-snow", "patio", "day", "Snow"), ("upper-floor-rain", "upper-floor", "evening", "Rain")]


def run(scene_path, out_dir, names=None):
    scene = json.loads(Path(scene_path).read_text(encoding="utf-8"))
    cams = {c["id"]: c for c in scene["cameras"]}
    wanted = names.split(",") if names else [s[0] for s in SHOTS]
    if not u.EditorLoadingAndSavingUtils.load_map(MAP):
        raise RuntimeError(f"Cannot load {MAP}: run compose_world.py first")
    world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
    fallback = 0
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
    skies = [a for a in actors if "lunden:sky" in [str(t) for t in a.tags]]
    lamps = [a for a in actors if any(str(t).startswith("lamp:") for t in a.tags)]
    if len(skies) != 1 or not lamps:
        raise RuntimeError(f"L_Lunden has {len(skies)} skies and {len(lamps)} lamps: run build_lighting.py and compose_world.py")
    sky = skies[0]
    sun = [c for c in sky.get_components_by_class(u.DirectionalLightComponent) if c.get_name() == "Sun"][0]
    skylight = sky.get_component_by_class(u.SkyLightComponent)
    # A real-time sky capture is refreshed by the main view, which a commandlet capture does not render: capture the
    # sky (atmosphere and clouds) once per shot instead (in memory, never saved; the game keeps the real-time capture).
    skylight.set_editor_property("real_time_capture", False, u.PropertyAccessChangeNotifyMode.NEVER)
    u.SystemLibrary.execute_console_command(world, "r.Shadow.Virtual.Enable 0")
    os.makedirs(out_dir, exist_ok=True)
    observed = []
    for name, cam_id, preset_name, weather in [s for s in SHOTS if s[0] in wanted]:
        cam, preset = cams[cam_id], VIEWS["lighting"][preset_name]
        for k, v in (("UseClock", False), ("TimeScale", 0.0), ("Year", VIEWS["date"]["year"]), ("Month", VIEWS["date"]["month"]),
                     ("Day", VIEWS["date"]["day"]), ("Hour", float(preset["hour"])), ("Rain", 1.0 if weather == "Rain" else 0.0),
                     ("Snow", 1.0 if weather == "Snow" else 0.0), ("Wet", 1.0 if weather == "Rain" else 0.0)):
            # NEVER notify: a property change in the editor world re-runs the construction script, which resets the lights
            sky.set_editor_property(k, v, u.PropertyAccessChangeNotifyMode.NEVER)
        sky.call_method("UpdateSky")
        for lamp in lamps:
            lamp.call_method("TurnOn" if preset["lampsOn"] else "TurnOff")
        skylight.recapture_sky()
        direction = sky.get_editor_property("SunDirection")
        obs = render_view(world, out_dir, name, u.Vector(*cam["xyz"]), u.Rotator(roll=0, pitch=cam["pitch"], yaw=cam["yaw"]),
                          scene["width"], scene["height"], scene["horizontalFov"], -0.7 if preset["lampsOn"] else 0, excluded, lumen=True)
        forward = u.MathLibrary.get_forward_vector(sun.get_world_rotation())
        off = math.degrees(math.acos(max(-1, min(1, -(forward.x * direction.x + forward.y * direction.y + forward.z * direction.z)))))
        if math.dist(obs["xyz"], cam["xyz"]) > 0.01 or any(abs(obs[k] - cam[k]) > 0.001 for k in ("pitch", "yaw")) or off > 0.01:
            raise RuntimeError(f"Camera or sun mismatch in {name}: sun {off:.3f}° off")
        observed.append({**obs, "name": name, "camera": cam_id, "lighting": preset_name, "hour": preset["hour"], "weather": weather or "clear",
                         "sunElevation": sky.get_editor_property("SunElevation"), "sunLux": sun.intensity,
                         "lampsOn": preset["lampsOn"], "date": VIEWS["date"]})
        u.log(f"LUNDEN_LIGHTING_CAPTURE {name}: sun elevation {sky.get_editor_property('SunElevation'):.3f}°, sun {sun.intensity:.3f} lux")
    (Path(out_dir) / "capture.json").write_text(json.dumps({"engine": u.SystemLibrary.get_engine_version(), "map": MAP,
        "naniteOffInMemory": fallback, "hiddenCollisionActors": len(excluded), "lamps": len(lamps), "shots": observed}, indent=2) + "\n")
    u.EditorLoadingAndSavingUtils.new_blank_map(False)  # discard every in-memory change
    u.log(f"LUNDEN_LIGHTING_CAPTURE_OK {len(observed)} views")


run(*[a for a in sys.argv[1:] if a])
