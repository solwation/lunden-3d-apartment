"""#2286: pictures of the menu, the settings and the compass in Play In Editor (verification only, nothing is saved).

A PIE automation test like test_ui.py, but it needs frames, so it runs the editor with a GPU and no window instead of
run-tests.ps1 (which adds -nullrhi):
    UnrealEditor-Cmd.exe <uproject> -EnablePlugins=PythonAutomationTest
        -ExecCmds="Automation RunTests Editor.Python.Lunden.test_ui_capture; Quit" -TestExit="Automation Test Queue Empty"
        -RenderOffScreen -unattended -nosplash -nosound -nop4 -abslog=<log>
(copy this file to unreal/Lunden/Content/Python/test_ui_capture.py first, untracked: the plugin only runs test_*.py). On a temporary lit level with the world's GameMode
and an isolated save slot (save_isolation) it takes "shot showui" screenshots of: the HUD while playing (looking at
Unreal yaw -90, plan north, where the web's compass shows 58 degrees, nordost), the start menu, both ends of the privacy notice, the settings page and
the pause menu. They land in Saved/Screenshots/; LUNDEN_UI_CAPTURE lines name them, then LUNDEN_UI_CAPTURE_OK.

For #2375, set LUNDEN_CAPTURE_PREJOIN to a new empty directory and supply its encoded path with the normal launcher's
-LundenPlayersBridge argument. Run the Automation RunTests command from a text file via -ExecCmds="EXECFILE <file>".
This lets StartMenuWanted use the ordinary startup path. The capture checks the notice before Play, then observes
the first game-side multiplayer frame on disk. Each run puts its images beside the bridge in a screenshots directory.
"""
import json
import os
from pathlib import Path
import struct
import sys
import time
import unreal as u

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
REPO = PROJECT.parents[1]
sys.path.insert(0, str(REPO / "tools/unreal-engine/tests"))
import save_isolation  # noqa: E402
sys.path.insert(0, str(REPO / "tools/unreal-engine/python"))
from privacy_content import windows_privacy  # noqa: E402

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
            directory = bridge.parent / "screenshots" if bridge else None
            if directory:
                directory.mkdir(exist_ok=True)
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                yield
                made = set(SHOTS.rglob("*.png")) - before
                if not made:
                    continue
                path, = made
                target = (directory or path.parent) / (name + ".png")
                try:
                    # The Windows writer may keep the file open after creating it. An initially complete image
                    # can also carry trailing bytes, so walk PNG chunk lengths instead of checking the file tail.
                    with path.open("rb") as picture:
                        if picture.read(8) != b"\x89PNG\r\n\x1a\n":
                            continue
                        header = picture.read(8)
                        while len(header) == 8:
                            size, kind = struct.unpack(">I4s", header)
                            picture.seek(size, 1)
                            crc = picture.read(4)
                            if len(crc) == 4 and kind == b"IEND" and size == 0:
                                break
                            header = picture.read(8)
                        else:
                            continue
                    path.replace(target)
                except (FileNotFoundError, PermissionError):
                    continue
                u.log(f"LUNDEN_UI_CAPTURE {name} {target}")
                return
            raise RuntimeError("No completed screenshot for " + name)

        def privacy_pages():
            menu.get_editor_property("ExtPrivacy").get_editor_property("on_clicked").broadcast()
            yield from frames(20)
            pages = menu.get_editor_property("Pages")
            if pages.get_active_widget_index() != 2 or not u.GameplayStatics.is_game_paused(game):
                raise RuntimeError("The privacy notice must open from the paused start menu")
            scroll = menu.get_editor_property("PrivacyScrollHolder").get_content()
            blocks = windows_privacy((REPO / "index.html").read_text(encoding="utf-8"))
            expected = [("• " if tag == "li" else "") + words for tag, words in blocks]
            children = scroll.get_all_children()
            if [str(widget.get_text()) for widget in children] != expected:
                raise RuntimeError("Displayed notice differs from the shared and Windows source text")
            if scroll.get_scroll_offset() > 1:
                raise RuntimeError("The start of the privacy notice is outside the viewport")
            yield from shot("unreal-privacy-before-play")
            end = scroll.get_scroll_offset_of_end()
            if bridge and end <= 1:
                raise RuntimeError("The expected scrollable notice did not exceed its viewport")
            result = {"textBlocks": len(expected)}
            if end > 1:
                def confirm_visible(widget):
                    # Slate's IntoView arranges the child and moves only if either edge is clipped.
                    before = scroll.get_scroll_offset()
                    scroll.scroll_widget_into_view(widget, False)
                    yield from frames(20)
                    if abs(scroll.get_scroll_offset() - before) > 1.0:
                        raise RuntimeError(f"The notice still clipped {widget.get_name()} at {before:.1f}")

                if bridge:
                    heading = expected.index("Flerspelarläget i Windows")
                    scroll.scroll_widget_into_view(children[heading], False, u.DescendantScrollDestination.TOP_OR_LEFT)
                    yield from frames(30)
                    yield from confirm_visible(children[heading + 1])
                    yield from shot("unreal-privacy-multiplayer")
                # Page Down uses 240 Slate units. Newly visible paragraphs wrap as the layout updates.
                for _ in range(len(children)):
                    menu.call_method("ScrollPrivacy", (240.0,))
                    yield from frames(20)
                    offset = scroll.get_scroll_offset()
                    end = scroll.get_scroll_offset_of_end()
                    if abs(offset - end) <= 1.0:
                        break
                else:
                    raise RuntimeError("Page Down never reached the end of the privacy notice")
                yield from confirm_visible(children[-2])
                yield from confirm_visible(children[-1])
                result.update(scrollOffset=offset, endOffset=end)
                yield from shot("unreal-privacy-windows")
                if bridge:
                    # Paired render for a pixel check of the final paragraph in the saved picture.
                    opacity = children[-1].get_render_opacity()
                    try:
                        children[-1].set_render_opacity(0.0)
                        yield from frames(10)
                        yield from shot("unreal-privacy-hidden-crash-text")
                    finally:
                        children[-1].set_render_opacity(opacity)
            menu.get_editor_property("BtnPrivacyBack").get_editor_property("on_clicked").broadcast()
            yield from frames(10)
            if pages.get_active_widget_index() != 0 or not u.GameplayStatics.is_game_paused(game):
                raise RuntimeError("Back must return to the start menu before Play")
            result["returnedToStart"] = True
            return result

        # In the release-path capture an isolated file bridge records the real player's first presence frame.
        bridge_dir = os.environ.get("LUNDEN_CAPTURE_PREJOIN")
        bridge = Path(bridge_dir) if bridge_dir else None
        state = {}
        levels.editor_request_begin_play()
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            game = editor.get_game_world()
            pc = u.GameplayStatics.get_player_controller(game, 0) if game else None
            if pc and pc.get_controlled_pawn():
                break
            yield
        else:
            raise RuntimeError("PIE did not start with a local player")
        state["game"] = game
        u.SystemLibrary.execute_console_command(game, "r.SetRes 1280x720w")
        ui = pc.get_components_by_class(u.load_class(None, COMPONENT))[0]
        menu = ui.get_editor_property("Menu")
        if bridge:
            if not (ui.call_method("StartMenuWanted") and menu.get_editor_property("IsStart")
                    and menu.get_editor_property("IsOpen")):
                raise RuntimeError("The production startup path must open the real start menu")
            yield from frames(20)
            network_class = u.load_class(None, "/Game/Lunden/Network/BPC_LundenNetwork.BPC_LundenNetwork_C")
            network, = pc.get_controlled_pawn().get_components_by_class(network_class)
            session = network.get_editor_property("SessionPath")
            if not session or Path(session).resolve() != bridge.resolve():
                raise RuntimeError("The player did not configure the isolated bridge")
            if not u.GameplayStatics.is_game_paused(game) or list(bridge.glob("game-*.csv")):
                raise RuntimeError("Presence was published before the player opened the notice")
            yield from shot("unreal-start-menu")
            result = yield from privacy_pages()
            if network.get_editor_property("HasPublished") or list(bridge.glob("game-*.csv")):
                raise RuntimeError("The player published presence while reading the notice")
            menu.get_editor_property("BtnPlay").get_editor_property("on_clicked").broadcast()
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                yield
                if network.get_editor_property("HasPublished") and list(bridge.glob("game-*.csv")):
                    break
            else:
                raise RuntimeError("The normal Play action did not produce the first presence frame")
            if u.GameplayStatics.is_game_paused(game) or menu.get_editor_property("IsOpen"):
                raise RuntimeError("Play did not dismiss the menu and resume the game")
            result.update(packetsBeforePlay=0, firstPacketAfterPlay=True)
            (PROJECT / "Saved/privacy-before-play.json").write_text(json.dumps(result, indent=2) + "\n")
            u.log("LUNDEN_UI_CAPTURE_OK verified the shared notice before the first presence frame")
            return
        pc.set_control_rotation(u.Rotator(roll=0, pitch=-8, yaw=-90))
        yield from frames(90)
        hud = ui.get_editor_property("Hud")
        u.log(f"LUNDEN_UI_CAPTURE hud bearing {hud.get_editor_property('Bearing'):.2f}, frames counted "
              f"{hud.get_editor_property('Frames')}, fps {hud.get_editor_property('FpsValue')}")
        yield from shot("unreal-hud-compass")
        menu.call_method("Open", (True,))
        yield from frames(20)
        yield from shot("unreal-start-menu")
        yield from privacy_pages()
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
