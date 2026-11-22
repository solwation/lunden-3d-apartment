"""#2400: game-view pictures of the flats' number signs (Hus A, B, C, L) and the garage plate in a lit L_Lunden PIE world.

Write the cameras first (WSL): node tools/unreal-engine/tests/sign-views.mjs > unreal/Lunden/Saved/sign-views.json.
Stage as Content/Python/test_flat_signs_capture.py (untracked copy, delete afterwards) and run the single automation test
with a GPU and -RenderOffScreen. The web pictures come from the same views through capture-web-views.cjs
(LUNDEN_CAPTURE_VIEWS). Each run writes PNGs and capture.json under Saved/Automation/sign-pictures-<id>.
#2435: an optional Saved/sign-shots.json lists the lighting of each round, e.g. [{"name": "day", "hour": 14},
{"name": "evening", "hour": 22}, {"name": "powercut", "hour": 22, "power": 0}] (power: MPC_LundenWeather.PowerAvailable,
as capture_lighting.py's shots); every view is taken in each round as <view>-<name>.png. Without it: one day round,
<view>.png, as before.
"""
import json
import math
from pathlib import Path
import sys
import time
import uuid

import unreal as u

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
sys.path.insert(0, str(PROJECT.parents[1] / "tools/unreal-engine/tests"))
import save_isolation  # noqa: E402

MAP = "/Game/Lunden/Maps/L_Lunden"
VIEWS = json.loads((PROJECT / "Saved/sign-views.json").read_text(encoding="utf-8"))
SHOTS_FILE = PROJECT / "Saved/sign-shots.json"
SHOTS = json.loads(SHOTS_FILE.read_text(encoding="utf-8")) if SHOTS_FILE.is_file() else [{"name": None, "hour": 14.0}]
MEASURES = json.loads((PROJECT / "Import/measurements.json").read_text(encoding="utf-8"))
# the web's vertical 72 degrees (src/main.js camera) at 16:9, as Unreal's horizontal field of view
FOV = math.degrees(2 * math.atan(math.tan(math.radians(36)) * 16 / 9))
OUTPUT = PROJECT / "Saved/Automation" / ("sign-pictures-" + uuid.uuid4().hex)
OUTPUT.mkdir(parents=True)
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
if not u.EditorLoadingAndSavingUtils.load_map(MAP):
    raise RuntimeError("The composed L_Lunden is required")
template = u.get_editor_subsystem(u.EditorActorSubsystem).spawn_actor_from_class(u.CameraActor, u.Vector(0, 0, 100))
template.root_component.set_mobility(u.ComponentMobility.MOVABLE)
template.tags = [u.Name("sign-pictures-camera")]
saved_slot = save_isolation.isolate()


@u.AutomationScheduler.add_latent_command
def capture():
    try:
        levels.editor_request_begin_play()
        deadline = time.monotonic() + 100
        while time.monotonic() < deadline:
            game = editor.get_game_world()
            pc = u.GameplayStatics.get_player_controller(game, 0) if game else None
            if pc and pc.get_controlled_pawn() and u.GameplayStatics.get_all_actors_with_tag(game, "lunden:sky"):
                break
            yield
        else:
            raise RuntimeError("The composed player and sky did not enter PIE")

        def actor(tag):
            found = u.GameplayStatics.get_all_actors_with_tag(game, tag)
            if len(found) != 1:
                raise RuntimeError(f"{len(found)} actors carry {tag}")
            return found[0]

        def tick(seconds, minimum=2):
            target = u.GameplayStatics.get_time_seconds(game) + seconds
            limit = time.monotonic() + 90
            while minimum > 0 or u.GameplayStatics.get_time_seconds(game) < target:
                if time.monotonic() > limit:
                    raise RuntimeError("Timed out waiting for PIE time")
                yield
                minimum -= 1

        camera = actor("sign-pictures-camera")
        pc.set_view_target_with_blend(camera, 0)
        sky = actor("lunden:sky")
        weather = u.load_asset("/Game/Lunden/Lighting/MPC_LundenWeather")
        result = {"map": MAP, "engine": u.SystemLibrary.get_engine_version(), "export": MEASURES["sourceCommit"],
                  "date": "2026-11-15", "hour": SHOTS[0]["hour"], "shots": SHOTS, "horizontalFov": round(FOV, 4), "views": {}}
        camera.camera_component.set_field_of_view(FOV)
        rounds = [(shot, v) for shot in SHOTS for v in VIEWS]
        for i, (shot, v) in enumerate(rounds):
            if i == 0 or shot is not rounds[i - 1][0]:  # a new lighting round
                for prop, val in (("UseClock", False), ("TimeScale", 0.0), ("Year", 2026), ("Month", 11), ("Day", 15),
                                  ("Hour", float(shot["hour"])), ("Rain", 0.0), ("Snow", 0.0), ("Wet", 0.0)):
                    sky.set_editor_property(prop, val, u.PropertyAccessChangeNotifyMode.NEVER)
                sky.call_method("UpdateSky")
                u.MaterialLibrary.set_scalar_parameter_value(game, weather, "PowerAvailable", float(shot.get("power", 1)))
                u.AutomationLibrary.finish_loading_before_screenshot()
            eye = u.Vector(*v["unreal"]["eyeCm"])
            camera.set_actor_location_and_rotation(eye, u.Rotator(roll=0, pitch=v["unreal"]["pitch"], yaw=v["unreal"]["yaw"]),
                                                   False, True)
            yield from tick(.5, 12)  # the viewport, Lumen and exposure settle after moving the camera
            name = v["id"] + (f"-{shot['name']}" if shot["name"] else "")
            target = OUTPUT / (name + ".png")
            u.SystemLibrary.execute_console_command(game, f'shot filename="{target.as_posix()}" -nosuffix', pc)
            limit = time.monotonic() + 30
            while time.monotonic() < limit:
                yield
                if target.is_file() and target.stat().st_size > 32:
                    break
            else:
                raise RuntimeError("No game-viewport picture for " + name)
            rot = camera.get_actor_rotation()
            result["views"][name] = {"label": v["label"], "eyeCm": v["unreal"]["eyeCm"], "hour": shot["hour"],
                                     "power": shot.get("power", 1), "yaw": round(rot.yaw, 4), "pitch": round(rot.pitch, 4)}
            u.log("LUNDEN_SIGN_PICTURE " + name)
        (OUTPUT / "capture.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        u.log(f"LUNDEN_SIGN_PICTURES_OK {len(result['views'])} {OUTPUT}")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
