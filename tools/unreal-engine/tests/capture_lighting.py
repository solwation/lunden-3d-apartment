"""#2283: render the shared reference views (unreal/Lunden/Tests/views.json) of L_Lunden with its own lighting.

    UnrealEditor-Cmd.exe <uproject> -run=pythonscript "-script=<this file> <scene.json> <out dir> [shot,…]"
        -AllowCommandletRendering -RenderOffScreen -unattended -nosplash -nosound

scene.json comes from `node tools/unreal-engine/pilot-scene.mjs measurements.json scene.json` (cameras converted from
the web). The world's BP_LundenSky (Generated/Lighting/Level_lighting,
composed into L_Lunden) is set to views.json's date and each preset's hour with UseClock off, UpdateSky runs, and the
lamps are switched with their TurnOn / TurnOff events (views.json `lampsOn`). Weather shots switch Rain or Snow on and
set Wet to 1 (a soaked street). #2307 adds the shots of lighting-shots.json (their own date and hour; lamps `all`, `none`
or `dusk`: only the lamps tagged auto:dusk, on when the sky's DuskLight is below the middle of the web's dusk thresholds,
the lamp Blueprint's first reading, which test_lighting checks in play). Each shot takes the game's locked exposure
(#2313, game_bias); --exposure=manual keeps #2283's fixed bias (0 at 14:00 as the #2246/#2279 pairs, -0.7 otherwise). Nothing is saved; the zones' meshes render with Nanite off in memory (a one-shot
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
from screenshot_level import render_view, spawn  # noqa: E402
from prepare_nanite_materials import static_mesh_editor  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent))
from capture_light import game_bias  # noqa: E402,F401  (#2306: one helper for the capture scripts' light)

MAP = "/Game/Lunden/Maps/L_Lunden"
VIEWS = json.loads((Path(__file__).resolve().parents[3] / "unreal/Lunden/Tests/views.json").read_text(encoding="utf-8"))
# #2283: the five shared pairs, then rain and snow outside and through windows (views.json's date and lighting presets).
LEGACY = [("start", "start", "day", None), ("living-room", "living-room", "day", None), ("patio", "patio", "day", None),
          ("stairs", "stairs", "evening", None), ("upper-floor", "upper-floor", "evening", None),
          ("start-rain", "start", "day", "Rain"), ("living-room-rain", "living-room", "day", "Rain"),
          ("patio-snow", "patio", "day", "Snow"), ("upper-floor-rain", "upper-floor", "evening", "Rain")]
DATE = [VIEWS["date"][k] for k in ("year", "month", "day")]
SHOTS = [{"name": n, "camera": c, "date": DATE, "hour": VIEWS["lighting"][p]["hour"], "weather": (w or "clear").lower(),
          "lamps": "all" if VIEWS["lighting"][p]["lampsOn"] else "none"} for n, c, p, w in LEGACY]
SHOTS += json.loads((Path(__file__).resolve().parent / "lighting-shots.json").read_text(encoding="utf-8"))["shots"]


def render_game(world, out_dir, name, loc, rot, width, height, fov, excluded, histogram=None):
    """#2313: render_view (screenshot_level.py) with the game's exposure. Without `histogram` that is render_view at
    game_bias (pass it as the bias). With `histogram` = (min, max, bias) EV100 the capture meters each view with histogram
    auto exposure, as the game did until #2313 (a fresh capture has no exposure history, so it starts at the metered
    exposure): the comparison that rejected it."""
    cam = spawn(u.SceneCapture2D, loc, rot)
    comp = cam.capture_component2d
    rt = u.RenderingLibrary.create_render_target2d(world, width, height, u.TextureRenderTargetFormat.RTF_RGBA8_SRGB)
    for actor in excluded:
        comp.hide_actor_components(actor)
    comp.set_editor_property("texture_target", rt)
    comp.set_editor_property("capture_source", u.SceneCaptureSource.SCS_FINAL_TONE_CURVE_HDR)
    comp.set_editor_property("fov_angle", float(fov))
    comp.set_editor_property("capture_every_frame", False)
    comp.set_editor_property("always_persist_rendering_state", True)
    pp = comp.get_editor_property("post_process_settings")
    if histogram:
        for key, value in (("auto_exposure_method", u.AutoExposureMethod.AEM_HISTOGRAM), ("auto_exposure_min_brightness", histogram[0]),
                           ("auto_exposure_max_brightness", histogram[1]), ("auto_exposure_bias", histogram[2]),
                           ("auto_exposure_speed_up", 100.0), ("auto_exposure_speed_down", 100.0)):
            pp.set_editor_property("override_" + key, True)
            pp.set_editor_property(key, value)
    for key, value in (("dynamic_global_illumination_method", u.DynamicGlobalIlluminationMethod.LUMEN),
                       ("reflection_method", u.ReflectionMethod.LUMEN)):
        pp.set_editor_property("override_" + key, True)
        pp.set_editor_property(key, value)
    comp.set_editor_property("post_process_settings", pp)
    comp.set_editor_property("post_process_blend_weight", 1.0)
    u.AutomationLibrary.finish_loading_before_screenshot()
    for _ in range(24):
        comp.capture_scene()
    u.RenderingLibrary.export_render_target(world, rt, out_dir, name + ".png")
    observed = {"xyz": list(cam.get_actor_location().to_tuple()), "yaw": cam.get_actor_rotation().yaw,
                "pitch": cam.get_actor_rotation().pitch, "roll": cam.get_actor_rotation().roll,
                "horizontalFov": comp.fov_angle, "width": rt.size_x, "height": rt.size_y}
    cam.destroy_actor()
    return observed


def run(scene_path, out_dir, names=None, exposure="game", trial=None, bias_offset=0.0):
    scene = json.loads(Path(scene_path).read_text(encoding="utf-8"))
    cams = {c["id"]: c for c in scene["cameras"]}
    wanted = names.split(",") if names else [s["name"] for s in SHOTS]
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
    dusk_mid = (lamps[0].get_editor_property("DuskOn") + lamps[0].get_editor_property("DuskOff")) / 2
    for shot in [s for s in SHOTS if s["name"] in wanted]:
        name, cam, weather = shot["name"], cams[shot["camera"]], shot["weather"]
        (year, month, day), hour = shot["date"], float(shot["hour"])
        for k, v in (("UseClock", False), ("TimeScale", 0.0), ("Year", year), ("Month", month), ("Day", day), ("Hour", hour),
                     ("Rain", 1.0 if weather == "rain" else 0.0), ("Snow", 1.0 if weather == "snow" else 0.0),
                     ("Wet", 1.0 if weather == "rain" else 0.0)):
            # NEVER notify: a property change in the editor world re-runs the construction script, which resets the lights
            sky.set_editor_property(k, v, u.PropertyAccessChangeNotifyMode.NEVER)
        for k, v in (trial or {}).items():
            sky.set_editor_property(k, v, u.PropertyAccessChangeNotifyMode.NEVER)
        sky.call_method("UpdateSky")
        for facade in u.GameplayStatics.get_all_actors_with_tag(world, "lunden:facade-controller"):
            facade.call_method("SettleFacade")  # the commandlet editor world never ticks the wall-light fade
        dark = sky.get_editor_property("DuskLight") < dusk_mid
        lit = 0
        for lamp in lamps:
            on = shot["lamps"] == "all" or (shot["lamps"] == "dusk" and dark and "auto:dusk" in [str(t) for t in lamp.tags])
            lamp.call_method("TurnOn" if on else "TurnOff")
            lit += on
        skylight.recapture_sky()
        direction = sky.get_editor_property("SunDirection")
        bias = 0.0 if hour == 14 else -0.7
        where = (u.Vector(*cam["xyz"]), u.Rotator(roll=0, pitch=cam["pitch"], yaw=cam["yaw"]), scene["width"], scene["height"], scene["horizontalFov"])
        if exposure == "game":
            bias = game_bias(sky) + bias_offset
            obs = render_view(world, out_dir, name, *where, bias, excluded, lumen=True)
        elif exposure == "histogram":
            bias = None
            obs = render_game(world, out_dir, name, *where, excluded, (-4.0, 3.0, 0.0))
        else:
            obs = render_view(world, out_dir, name, *where, bias, excluded, lumen=True)
        forward = u.MathLibrary.get_forward_vector(sun.get_world_rotation())
        off = math.degrees(math.acos(max(-1, min(1, -(forward.x * direction.x + forward.y * direction.y + forward.z * direction.z)))))
        if math.dist(obs["xyz"], cam["xyz"]) > 0.01 or any(abs(obs[k] - cam[k]) > 0.001 for k in ("pitch", "yaw")) or off > 0.01:
            raise RuntimeError(f"Camera or sun mismatch in {name}: sun {off:.3f}° off")
        observed.append({**obs, "name": name, "camera": shot["camera"], "date": shot["date"], "hour": hour, "weather": weather,
                         "lamps": shot["lamps"], "lampsLit": lit, "exposureBias": bias,
                         "sunElevation": sky.get_editor_property("SunElevation"), "sunLux": sun.intensity,
                         "daylight": sky.get_editor_property("Daylight"), "duskLight": sky.get_editor_property("DuskLight"),
                         "cloudCover": sky.get_editor_property("CloudCover"), "moonIllumination": sky.get_editor_property("MoonIllumination")})
        u.log(f"LUNDEN_LIGHTING_CAPTURE {name}: sun elevation {sky.get_editor_property('SunElevation'):.3f}°, sun {sun.intensity:.3f} lux")
    (Path(out_dir) / "capture.json").write_text(json.dumps({"engine": u.SystemLibrary.get_engine_version(), "map": MAP,
        "exposure": exposure, "trial": trial, "biasOffset": bias_offset, "naniteOffInMemory": fallback, "hiddenCollisionActors": len(excluded), "lamps": len(lamps), "shots": observed}, indent=2) + "\n")
    u.EditorLoadingAndSavingUtils.new_blank_map(False)  # discard every in-memory change
    u.log(f"LUNDEN_LIGHTING_CAPTURE_OK {len(observed)} views")


# --exposure=game (default: the game's locked exposure, game_bias), manual (#2283's fixed bias) or histogram (#2283's auto
# exposure);
# --set=Name:value,... sets BP_LundenSky variables before UpdateSky and --bias=x shifts its exposure by x EV (calibration
# trials, nothing is saved).
_args = [a for a in sys.argv[1:] if a]
_opt = dict(a[2:].split("=", 1) for a in _args if a.startswith("--") and "=" in a)
run(*[a for a in _args if not a.startswith("--")], exposure=_opt.get("exposure", "game"),
    trial={k: float(v) for k, v in (kv.split(":") for kv in _opt["set"].split(","))} if "set" in _opt else None,
    bias_offset=float(_opt.get("bias", 0)))
