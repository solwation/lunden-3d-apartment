"""#2290: pictures of BP_LundenAvatar standing, walking, running, crouched, jumping and seated, side on like the web's
docs/verification/1916/avatar-side.png, and the logical hit zones standing and crouched (verification only, nothing
is saved).

A PIE automation test (the animation Blueprint only runs in a playing world) that needs frames, so it runs the editor
with a GPU and no window instead of run-tests.ps1 (which adds -nullrhi), as capture_ui.py does:
    copy this file to unreal/Lunden/Content/Python/test_avatar_capture.py (untracked: the plugin only runs test_*.py)
    UnrealEditor-Cmd.exe <uproject> -EnablePlugins=PythonAutomationTest
        -ExecCmds="Automation RunTests Editor.Python.Lunden.test_avatar_capture; Quit" -TestExit="Automation Test Queue Empty"
        -RenderOffScreen -unattended -nosplash -nosound -nop4 -abslog=<log>
On a temporary lit level (a grey floor, sun and sky light; not L_Lunden) one avatar per pose faces screen right and a
SceneCapture2D beside it takes the picture into Saved/AvatarCapture/<pose>.png. Logs LUNDEN_AVATAR_CAPTURE lines,
then LUNDEN_AVATAR_CAPTURE_OK.
"""
import json
from pathlib import Path
import sys
import time

import unreal as u

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
REPO = PROJECT.parents[1]
sys.path.insert(0, str(REPO / "tools/unreal-engine/tests"))
import save_isolation  # noqa: E402

AVATAR = "/Game/Lunden/Avatar/Rig/BP_LundenAvatar.BP_LundenAvatar_C"
OUT = PROJECT / "Saved/AvatarCapture"
WIDTH, HEIGHT, FOV = 600, 800, 40.0
# pose name -> SetMotion(Speed cm/s, Crouch, Airborne, Pose) and whether the hit zones are drawn
POSES = {
    "stand": ((0, 0, False, 0), False), "walk": ((160, 0, False, 0), False), "run": ((320, 0, False, 0), False),
    "crouch": ((0, 1, False, 0), False), "jump": ((0, 0, True, 0), False), "sit": ((0, 0, False, 1), False),
    "zones-stand": ((0, 0, False, 0), True), "zones-crouch": ((0, 1, False, 0), True),
}
SPACING = 1000.0  # cm between the poses, so each picture shows one figure
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
actors = u.get_editor_subsystem(u.EditorActorSubsystem)

u.EditorLoadingAndSavingUtils.new_blank_map(False)
ground = actors.spawn_actor_from_class(u.StaticMeshActor, u.Vector(SPACING * 4.5, 0, -10))
ground.static_mesh_component.set_static_mesh(u.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube"))
ground.set_actor_scale3d(u.Vector(120, 40, 0.2))
sun = actors.spawn_actor_from_class(u.DirectionalLight, u.Vector(0, 0, 500), u.Rotator(roll=0, pitch=-35, yaw=60))
sun.light_component.set_editor_property("atmosphere_sun_light", True)
actors.spawn_actor_from_class(u.SkyAtmosphere, u.Vector(0, 0, 0))
sky = actors.spawn_actor_from_class(u.SkyLight, u.Vector(0, 0, 300))
sky.light_component.set_editor_property("real_time_capture", True)
cls = u.load_class(None, AVATAR)
for i, name in enumerate(POSES):
    x = SPACING * (i + 1)  # clear of the origin, where PIE puts the default pawn
    # facing -X; a camera on -Y looking +Y has screen right = -X, so the figure faces right as in the web picture
    avatar = actors.spawn_actor_from_class(cls, u.Vector(x, 0, 0), u.Rotator(roll=0, pitch=0, yaw=180))
    avatar.tags = [f"pose:{name}"]
    cam = actors.spawn_actor_from_class(u.SceneCapture2D, u.Vector(x, -420, 95), u.Rotator(roll=0, pitch=-2, yaw=90))
    cam.tags = [f"cam:{name}"]
    if name == "sit":  # the web picture's 45 cm seat (REST.avatarSeat), under the thighs
        seat = actors.spawn_actor_from_class(u.StaticMeshActor, u.Vector(x - 15, 0, 22.5))
        seat.static_mesh_component.set_static_mesh(u.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube"))
        seat.set_actor_scale3d(u.Vector(0.4, 0.45, 0.45))
saved_slot = save_isolation.isolate()


def tagged(world, cls_, prefix):
    found = {}
    for a in u.GameplayStatics.get_all_actors_of_class(world, cls_):
        for t in a.tags:
            if str(t).startswith(prefix):
                found[str(t)[len(prefix):]] = a
    return found


@u.AutomationScheduler.add_latent_command
def capture():
    try:
        levels.editor_request_begin_play()
        deadline = time.monotonic() + 60
        game = None
        while not game:
            if time.monotonic() > deadline:
                raise RuntimeError("PIE did not start")
            game = editor.get_game_world()
            yield
        avatars, cams = tagged(game, cls, "pose:"), tagged(game, u.SceneCapture2D, "cam:")
        if set(avatars) != set(POSES) or set(cams) != set(POSES):
            raise RuntimeError(f"PIE has avatars {sorted(avatars)} and cameras {sorted(cams)}")
        for name, (motion, zones) in POSES.items():
            avatars[name].call_method("SetMotion", tuple(float(v) if i < 2 else v for i, v in enumerate(motion)))
            for comp in avatars[name].get_components_by_class(u.ShapeComponent):
                comp.set_hidden_in_game(not zones)
        for _ in range(45):  # past every blend; the jump clip has left the ground
            yield
        OUT.mkdir(parents=True, exist_ok=True)
        shots = []
        for name in POSES:
            comp = cams[name].capture_component2d
            rt = u.RenderingLibrary.create_render_target2d(game, WIDTH, HEIGHT, u.TextureRenderTargetFormat.RTF_RGBA8_SRGB)
            comp.set_editor_property("texture_target", rt)
            comp.set_editor_property("capture_source", u.SceneCaptureSource.SCS_FINAL_TONE_CURVE_HDR)
            comp.set_editor_property("fov_angle", FOV)
            comp.set_editor_property("capture_every_frame", False)
            pp = comp.get_editor_property("post_process_settings")
            pp.set_editor_property("override_auto_exposure_method", True)
            pp.set_editor_property("auto_exposure_method", u.AutoExposureMethod.AEM_MANUAL)
            pp.set_editor_property("override_auto_exposure_apply_physical_camera_exposure", True)
            pp.set_editor_property("auto_exposure_apply_physical_camera_exposure", False)
            pp.set_editor_property("override_auto_exposure_bias", True)
            pp.set_editor_property("auto_exposure_bias", 0.5)
            comp.set_editor_property("post_process_settings", pp)
            comp.set_editor_property("post_process_blend_weight", 1.0)
            u.AutomationLibrary.finish_loading_before_screenshot()
            for _ in range(6):
                comp.capture_scene()
                yield
            u.RenderingLibrary.export_render_target(game, rt, str(OUT), name + ".png")
            body = avatars[name].get_components_by_class(u.SkeletalMeshComponent)[0]
            base = avatars[name].get_actor_location()
            pelvis, head = body.get_socket_location("pelvis") - base, body.get_socket_location("head") - base
            shots.append({"pose": name, "setMotion": POSES[name][0], "zones": POSES[name][1],
                          "pelvisZ": round(pelvis.z, 1), "head": [round(-head.x, 1), round(head.z, 1)]})
            u.log(f"LUNDEN_AVATAR_CAPTURE {json.dumps(shots[-1])}")
        (OUT / "capture.json").write_text(json.dumps({"engine": u.SystemLibrary.get_engine_version(), "width": WIDTH,
            "height": HEIGHT, "fov": FOV, "camera": "4.2 m to the figure's left, 0.95 m up, level", "shots": shots},
            indent=1) + "\n", encoding="utf-8")
        u.log("LUNDEN_AVATAR_CAPTURE_OK")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
