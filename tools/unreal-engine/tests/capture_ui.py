"""#2286: pictures of the menu, the settings and the compass in Play In Editor (verification only, nothing is saved).

A PIE automation test like test_ui.py, but it needs frames, so it runs the editor with a GPU and no window instead of
run-tests.ps1 (which adds -nullrhi):
    UnrealEditor-Cmd.exe <uproject> -EnablePlugins=PythonAutomationTest
        -ExecCmds="Automation RunTests Editor.Python.Lunden.test_ui_capture; Quit" -TestExit="Automation Test Queue Empty"
        -RenderOffScreen -unattended -nosplash -nosound -nop4 -abslog=<log>
(copy this file to unreal/Lunden/Content/Python/test_ui_capture.py first, untracked: the plugin only runs test_*.py). On a temporary lit level with the world's GameMode
and an isolated save slot (save_isolation) it takes "shot showui" screenshots of: the HUD while playing (looking at
Unreal yaw -90, plan north, where the web's compass shows 58 degrees, nordost), the start menu, the settings page and
the pause menu. They land in Saved/Screenshots/; LUNDEN_UI_CAPTURE lines name them, then LUNDEN_UI_CAPTURE_OK.
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

WORLD = json.loads((REPO / "tools/unreal-engine/world-levels.json").read_text(encoding="utf-8"))
COMPONENT = "/Game/Lunden/UI/BPC_LundenUI.BPC_LundenUI_C"
SHOTS = Path(u.Paths.convert_relative_path_to_full(u.Paths.screen_shot_dir()))
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
actors = u.get_editor_subsystem(u.EditorActorSubsystem)

u.EditorLoadingAndSavingUtils.new_blank_map(False)
editor.get_editor_world().get_world_settings().set_editor_property("default_game_mode", u.load_class(None, WORLD["gameMode"]))
ground = actors.spawn_actor_from_class(u.StaticMeshActor, u.Vector(0, 0, -10))
ground.static_mesh_component.set_static_mesh(u.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube"))
ground.static_mesh_component.set_collision_profile_name("BlockAll")
ground.set_actor_scale3d(u.Vector(60, 60, 0.2))
for i, (x, y) in enumerate(((800, -900), (-600, -1100), (1400, 300))):  # a few blocks so the view is not empty
    block = actors.spawn_actor_from_class(u.StaticMeshActor, u.Vector(x, y, 150))
    block.static_mesh_component.set_static_mesh(u.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube"))
    block.set_actor_scale3d(u.Vector(2 + i, 2, 3))
sun = actors.spawn_actor_from_class(u.DirectionalLight, u.Vector(0, 0, 500), u.Rotator(roll=0, pitch=-40, yaw=30))
sun.light_component.set_editor_property("atmosphere_sun_light", True)
actors.spawn_actor_from_class(u.SkyAtmosphere, u.Vector(0, 0, 0))
sky = actors.spawn_actor_from_class(u.SkyLight, u.Vector(0, 0, 300))
sky.light_component.set_editor_property("real_time_capture", True)
actors.spawn_actor_from_class(u.PlayerStart, u.Vector(0, 0, 100))
saved_slot = save_isolation.isolate()


@u.AutomationScheduler.add_latent_command
def capture():
    try:
        def frames(n):
            for _ in range(n):
                yield

        def shot(name):
            before = set(SHOTS.rglob("*.png")) if SHOTS.exists() else set()
            u.SystemLibrary.execute_console_command(state["game"], "shot showui")
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                yield
                made = (set(SHOTS.rglob("*.png")) if SHOTS.exists() else set()) - before
                if made:
                    path = made.pop()
                    for _ in range(5):
                        yield
                    target = path.with_name(name + ".png")
                    path.replace(target)
                    u.log(f"LUNDEN_UI_CAPTURE {name} {target}")
                    return
            raise RuntimeError("No screenshot for " + name)

        state = {}
        levels.editor_request_begin_play()
        while True:
            game = editor.get_game_world()
            pc = u.GameplayStatics.get_player_controller(game, 0) if game else None
            if pc and pc.get_controlled_pawn():
                break
            yield
        state["game"] = game
        u.SystemLibrary.execute_console_command(game, "r.SetRes 1280x720w")
        ui = pc.get_components_by_class(u.load_class(None, COMPONENT))[0]
        menu = ui.get_editor_property("Menu")
        pc.set_control_rotation(u.Rotator(roll=0, pitch=-8, yaw=-90))
        yield from frames(90)
        hud = ui.get_editor_property("Hud")
        u.log(f"LUNDEN_UI_CAPTURE hud bearing {hud.get_editor_property('Bearing'):.2f}, frames counted "
              f"{hud.get_editor_property('Frames')}, fps {hud.get_editor_property('FpsValue')}")
        yield from shot("unreal-hud-compass")
        menu.call_method("Open", (True,))
        yield from frames(20)
        yield from shot("unreal-start-menu")
        menu.call_method("ShowSettings")
        yield from frames(20)
        yield from shot("unreal-settings")
        menu.call_method("Close")
        yield from frames(10)
        menu.call_method("Open", (False,))
        yield from frames(20)
        yield from shot("unreal-pause-menu")
        menu.call_method("Close")
        u.log("LUNDEN_UI_CAPTURE_OK")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
