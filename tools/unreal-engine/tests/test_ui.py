"""#2286: the menu, the settings and the compass (/Game/Lunden/UI) in Play In Editor.

On a temporary level with the world's GameMode (as test_save.py), from an empty save slot:
1. BP_LundenPlayerController carries BPC_LundenUI (player-extensions.json row UI); it made the HUD and the menu, and
   under automation it opened no start menu (StartMenuWanted is false), so other areas' PIE tests run unpaused.
2. Compass: for nine view yaws the HUD's bearing equals the web's, compassBearing(yaw) = DAY.planNorth - yaw with the
   web yaw = -90 - Unreal yaw (src/compass.js, tools/unreal-engine/coordinates.mjs); the rose turns by -bearing and the
   N letter sits where the web draws it. compass-rule.test.mjs checks the same rows against the web's own JavaScript.
3. Menu: Open(start) pauses the game, frees the mouse and shows the start texts; the buttons' OnClicked (broadcast as a
   click does) reach the settings page, back, and play; the typed name is saved on play; IA_LundenMenu (Esc, injected)
   opens the pause menu while playing and steps back while it is open.
4. Settings: graphics level, resolution, frame rate, mouse speed, inverted mouse and two volumes, each through the menu,
   change their effect at once and are in the save slot.
5. Restart (a second PIE session; the graphics level and resolution are first set to something else in the editor): the
   saved settings are applied again at start.
Run like the other PIE tests: copy this file to unreal/Lunden/Content/Python/ (untracked) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_ui
Writes Saved/ui-result.json and logs LUNDEN_UI_TEST lines, then LUNDEN_UI_TEST_OK. Both sessions run on one isolated
save slot (save_isolation, #2311): the player's own LundenSave.sav is moved aside first and put back afterwards.
"""
import json
import math
from pathlib import Path
import sys
import time
import unreal as u

sys.path.insert(0, str(Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())).parents[1]
                       / "tools/unreal-engine/tests"))
import save_isolation  # noqa: E402  #2311: start without the player's save file

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
REPO = PROJECT.parents[1]
WORLD = json.loads((REPO / "tools/unreal-engine/world-levels.json").read_text(encoding="utf-8"))
MEASUREMENTS = json.loads((PROJECT / "Import/measurements.json").read_text(encoding="utf-8"))
EXTENSIONS = json.loads((REPO / "tools/unreal-engine/ui-extensions.json").read_text(encoding="utf-8"))
SAVED = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_saved_dir()))
COMPONENT = "/Game/Lunden/UI/BPC_LundenUI.BPC_LundenUI_C"
SAVE_LIBRARY = "/Game/Lunden/Save/BFL_LundenSave.BFL_LundenSave_C"
IA_MENU = "/Game/Lunden/UI/Input/IA_LundenMenu.IA_LundenMenu"
IMC_INVERT = "/Game/Lunden/UI/Input/IMC_LundenInvertY.IMC_LundenInvertY"
PLAN_NORTH = float(MEASUREMENTS["site"]["planNorthDeg"])
BASE_LOOK = math.degrees(MEASUREMENTS["spawn"]["player"]["mouseSens"])
YAWS = [-90.0, 0.0, 90.0, 180.0, -148.0, -32.0, 37.3, 123.4, -170.5]  # Unreal control yaws
NAMES = ["norr", "nordost", "öster", "sydost", "söder", "sydväst", "väster", "nordväst"]  # src/compass.js
NAME = "Testspelare 2286"
SENSITIVITY, MASTER, MUSIC = 2.0, 0.4, 0.65

save_lib = u.get_default_object(u.load_class(None, SAVE_LIBRARY))
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
result = {"engine": u.SystemLibrary.get_engine_version(), "planNorth": PLAN_NORTH, "baseLookDegrees": BASE_LOOK}


def setting(key, default="missing"):
    world = editor.get_game_world() or editor.get_editor_world()
    return save_lib.call_method("GetSetting", (key, default, world))[0]


def web_bearing(unreal_yaw):
    """src/compass.js compassBearing of the web yaw that coordinates.mjs unrealYawToWebYaw gives."""
    web_yaw = -90.0 - unreal_yaw
    return ((PLAN_NORTH - web_yaw) % 360 + 360) % 360


def angle(a, b):
    return abs((a - b + 180.0) % 360.0 - 180.0)


def label(widget_box):
    return str(widget_box.get_content().get_text())


# Temporary level with the world's GameMode, from an empty slot (kept over both sessions, restored at the end)
actors = u.get_editor_subsystem(u.EditorActorSubsystem)
u.EditorLoadingAndSavingUtils.new_blank_map(False)
editor.get_editor_world().get_world_settings().set_editor_property("default_game_mode", u.load_class(None, WORLD["gameMode"]))
ground = actors.spawn_actor_from_class(u.StaticMeshActor, u.Vector(0, 0, -10))
ground.static_mesh_component.set_static_mesh(u.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube"))
ground.static_mesh_component.set_collision_profile_name("BlockAll")
ground.set_actor_scale3d(u.Vector(40, 40, 0.2))
actors.spawn_actor_from_class(u.PlayerStart, u.Vector(0, 0, 100))
settings_gus = u.GameUserSettings.get_game_user_settings()
original_level = settings_gus.get_overall_scalability_level()
saved_slot = save_isolation.isolate()


@u.AutomationScheduler.add_latent_command
def ui_test():
    try:
        state = {}

        def frames(n):
            for _ in range(n):
                yield

        def settle(seconds):
            until = time.monotonic() + seconds
            while time.monotonic() < until:
                yield

        def session():
            levels.editor_request_begin_play()
            deadline = time.monotonic() + 60
            while True:
                game = editor.get_game_world()
                pc = u.GameplayStatics.get_player_controller(game, 0) if game else None
                pawn = pc.get_controlled_pawn() if pc else None
                if pawn:
                    break
                if time.monotonic() > deadline:
                    raise RuntimeError("PIE did not possess a pawn")
                yield
            comps = pc.get_components_by_class(u.load_class(None, COMPONENT))
            if len(comps) != 1:
                raise RuntimeError(f"{pc.get_class().get_name()} carries {len(comps)} BPC_LundenUI (want 1): "
                                   "add the player-extensions.json row and run build_player.py")
            yield from settle(0.6)  # BeginPlay, the widgets' Construct and the first CheckMouse timer
            ui = comps[0]
            subsystem = ui.get_editor_property("InputSubsystem")  # BeginPlay keeps the player's EnhancedInputLocalPlayerSubsystem
            if not subsystem:
                raise RuntimeError("BPC_LundenUI found no Enhanced Input subsystem")
            state.update(game=game, pc=pc, pawn=pawn, ui=ui, hud=ui.get_editor_property("Hud"),
                         menu=ui.get_editor_property("Menu"), input=subsystem)

        def stop():
            levels.editor_request_end_play()
            while editor.get_game_world():
                yield

        def paused():
            return u.GameplayStatics.is_game_paused(state["game"])

        def menu_state():
            m = state["menu"]
            return {"open": m.get_editor_property("IsOpen"), "paused": paused(),
                    "cursor": state["pc"].get_editor_property("show_mouse_cursor"),
                    "page": m.get_editor_property("Pages").get_active_widget_index(),
                    "visible": str(m.get_visibility()), "title": label(m.get_editor_property("Title"))}

        def click(name):
            state["menu"].get_editor_property(name).get_editor_property("on_clicked").broadcast()

        def press_escape():
            """IA_LundenMenu as the Esc key gives it (injected for one frame), then a few frames to run it."""
            action = u.load_object(None, IA_MENU)
            state["input"].inject_input_vector_for_action(action, u.Vector(1, 0, 0), [], [])
            yield from frames(4)

        def labels():
            m = state["menu"]
            names = ["BtnQualityLabel", "BtnResolutionLabel", "BtnFpsLabel", "SensLabel", "BtnInvertLabel"] + \
                [f"VolumeLabel{i}" for i in range(len(EXTENSIONS["volumes"]))]
            return {n: label(m.get_editor_property(n)) for n in names}

        # 1. Session 1 ---------------------------------------------------------------------------------------------
        yield from session()
        ui, hud, menu = state["ui"], state["hud"], state["menu"]
        if not hud or not menu:
            raise RuntimeError("BPC_LundenUI made no HUD or menu")
        wanted = ui.call_method("StartMenuWanted")
        start = menu_state()
        result["start"] = {"startMenuWanted": wanted, **start}
        u.log(f"LUNDEN_UI_TEST start {json.dumps(result['start'])}")
        if wanted or start["open"] or start["paused"]:
            raise RuntimeError(f"Under automation the start menu must stay closed: {result['start']}")

        # 2. Compass ------------------------------------------------------------------------------------------------
        rows = []
        for yaw in YAWS:
            state["pc"].set_control_rotation(u.Rotator(roll=0, pitch=-10, yaw=yaw))
            yield from frames(3)
            # The HUD's Event Tick runs UpdateCompass every painted frame; PIE under -nullrhi paints no widgets, so the
            # test runs the same function itself
            hud.call_method("UpdateCompass")
            bearing = hud.get_editor_property("Bearing")
            want = web_bearing(yaw)
            rose = hud.get_editor_property("Rose").get_editor_property("render_transform").get_editor_property("angle")
            north = hud.get_editor_property("LetterN").get_editor_property("render_transform").get_editor_property("translation")
            radius = hud.get_editor_property("LetterRadius")
            north_want = (radius * math.sin(math.radians(-want)), -radius * math.cos(math.radians(-want)))
            rows.append({"unrealYaw": yaw, "webYaw": round(((-90 - yaw + 180) % 360) - 180, 3), "bearing": round(bearing, 3),
                         "webBearing": round(want, 3), "name": NAMES[round(bearing / 45) % 8], "webName": NAMES[round(want / 45) % 8],
                         "roseAngle": round(rose, 3), "letterN": [round(north.x, 2), round(north.y, 2)],
                         "letterNWeb": [round(north_want[0], 2), round(north_want[1], 2)]})
        result["compass"] = rows
        result["hudTicked"] = {"framesCounted": hud.get_editor_property("Frames"), "fpsWindows": hud.get_editor_property("FpsValue")}
        u.log(f"LUNDEN_UI_TEST compass {json.dumps(rows)}")
        bad = [r for r in rows if angle(r["bearing"], r["webBearing"]) > 0.01 or angle(-r["roseAngle"], r["webBearing"]) > 0.01
               or r["name"] != r["webName"] or abs(r["letterN"][0] - r["letterNWeb"][0]) > 0.05
               or abs(r["letterN"][1] - r["letterNWeb"][1]) > 0.05]
        if bad:
            raise RuntimeError(f"Compass differs from the web: {bad}")

        # 3. Menu ---------------------------------------------------------------------------------------------------
        menu.call_method("Open", (True,))
        yield from frames(2)
        opened = menu_state()
        click("BtnSettings")
        yield from frames(2)
        on_settings = menu_state()
        click("BtnBack")
        yield from frames(2)
        back_main = menu_state()
        menu.get_editor_property("NameBox").set_text(u.Text("  " + NAME + "  "))
        click("BtnPlay")
        yield from frames(2)
        played = menu_state()
        saved_name = save_lib.call_method("GetPlayerName", (state["game"],))
        yield from press_escape()
        esc_open = menu_state()
        click("BtnSettings")
        yield from frames(2)
        yield from press_escape()
        esc_back = menu_state()
        yield from press_escape()
        esc_closed = menu_state()
        bound = {n: menu.get_editor_property(n).get_editor_property("on_clicked").is_bound()
                 for n in ("BtnPlay", "BtnSettings", "BtnQuit", "BtnQuality", "BtnResolution", "BtnFps", "BtnInvert", "BtnBack")}
        result["menu"] = {"open": opened, "settings": on_settings, "back": back_main, "play": played, "savedName": saved_name,
                          "escOpens": esc_open, "escFromSettings": esc_back, "escCloses": esc_closed, "clickBound": bound}
        u.log(f"LUNDEN_UI_TEST menu {json.dumps(result['menu'], ensure_ascii=False)}")
        problems = []
        if not (opened["open"] and opened["paused"] and opened["cursor"] and opened["title"] == "Välkommen till Lunden."):
            problems.append("Open(start) did not open, pause and free the mouse with the start title")
        if on_settings["page"] != 1 or back_main["page"] != 0:
            problems.append("Inställningar / Tillbaka did not switch the page")
        if played["open"] or played["paused"] or played["cursor"]:
            problems.append("Spela did not give control back")
        if saved_name != NAME:
            problems.append(f"the typed name was saved as {saved_name!r}")
        if not (esc_open["open"] and esc_open["paused"] and esc_open["title"] == "Paus"):
            problems.append("Esc (IA_LundenMenu) did not open the pause menu")
        if not (esc_back["open"] and esc_back["page"] == 0) or esc_closed["open"] or esc_closed["paused"]:
            problems.append("Esc did not step back from the settings page and then close the menu")
        if not all(bound.values()):
            problems.append(f"unbound buttons: {bound}")
        if problems:
            raise RuntimeError("Menu: " + "; ".join(problems))

        # 4. Settings through the menu ------------------------------------------------------------------------------
        menu.call_method("Open", (False,))
        click("BtnSettings")
        yield from frames(2)
        gus = u.GameUserSettings.get_game_user_settings()
        before = gus.get_overall_scalability_level()
        click("BtnQuality")
        yield from frames(2)
        after_click = gus.get_overall_scalability_level()
        while gus.get_overall_scalability_level() != 1:  # settle on Låg, which is not the editor's default
            click("BtnQuality")
        quality = gus.get_overall_scalability_level()
        click("BtnResolution")
        resolution = gus.get_screen_resolution()
        click("BtnFps")
        yield from frames(2)
        fps_visible = str(hud.get_editor_property("Fps").get_visibility())
        menu.get_editor_property("SensSlider").get_editor_property("on_value_changed").broadcast(SENSITIVITY)
        click("BtnInvert")
        for i, row in enumerate(EXTENSIONS["volumes"]):
            if row["key"] in ("audio.master", "audio.music"):
                menu.get_editor_property(f"VolumeSlider{i}").get_editor_property("on_value_changed").broadcast(
                    MASTER if row["key"] == "audio.master" else MUSIC)
        yield from frames(2)
        look = state["pawn"].get_editor_property("LookDegrees")
        invert = state["input"].has_mapping_context(u.load_object(None, IMC_INVERT))
        stored = {k: setting(k) for k in ("graphics.quality", "graphics.resolution", "hud.fps", "mouse.sensitivity",
                                          "mouse.invertY", "audio.master", "audio.music", "audio.effects")}
        result["settings"] = {"qualityBefore": before, "qualityAfterOneClick": after_click, "quality": quality,
                              "resolution": [resolution.x, resolution.y], "fpsVisibility": fps_visible,
                              "showFps": hud.get_editor_property("ShowFps"), "lookDegrees": look, "invertContext": invert,
                              "saved": stored, "labels": labels()}
        u.log(f"LUNDEN_UI_TEST settings {json.dumps(result['settings'], ensure_ascii=False)}")
        problems = []
        if after_click != (before + 1) % 5 or stored["graphics.quality"] != str(quality):
            problems.append("the graphics level did not step or was not saved")
        if stored["graphics.resolution"] != f"{resolution.x}x{resolution.y}":
            problems.append("the resolution was not saved as applied")
        if stored["hud.fps"] != "false" or "COLLAPSED" not in fps_visible.upper() or hud.get_editor_property("ShowFps"):
            problems.append("the frame rate did not hide")
        if abs(look - BASE_LOOK * SENSITIVITY) > 1e-6 or abs(float(stored["mouse.sensitivity"]) - SENSITIVITY) > 1e-6:
            problems.append(f"mouse speed {look} (want {BASE_LOOK * SENSITIVITY})")
        if stored["mouse.invertY"] != "true" or not invert:
            problems.append("the inverted mouse is not on")
        if abs(float(stored["audio.master"]) - MASTER) > 1e-6 or abs(float(stored["audio.music"]) - MUSIC) > 1e-6 \
                or stored["audio.effects"] != "missing":
            problems.append("the volumes were not saved")
        if problems:
            raise RuntimeError("Settings: " + "; ".join(problems))
        menu.call_method("Close")
        yield from stop()

        # 5. Restart: the editor's own values are moved away first, so only the save can bring them back
        gus.set_overall_scalability_level(4)
        gus.set_screen_resolution(u.IntPoint(1024, 768))
        gus.apply_settings(False)
        yield from session()
        pawn, hud = state["pawn"], state["hud"]
        back = {"quality": gus.get_overall_scalability_level(), "resolution": [gus.get_screen_resolution().x,
                gus.get_screen_resolution().y], "lookDegrees": pawn.get_editor_property("LookDegrees"),
                "invertContext": state["input"].has_mapping_context(u.load_object(None, IMC_INVERT)),
                "showFps": hud.get_editor_property("ShowFps"), "fpsVisibility": str(hud.get_editor_property("Fps").get_visibility()),
                "name": save_lib.call_method("GetPlayerName", (state["game"],))}
        state["menu"].call_method("Open", (False,))
        state["menu"].call_method("ShowSettings")
        back["labels"] = labels()
        state["menu"].call_method("Close")
        result["restart"] = back
        u.log(f"LUNDEN_UI_TEST restart {json.dumps(back, ensure_ascii=False)}")
        want = result["settings"]
        if back["quality"] != want["quality"] or back["resolution"] != want["resolution"] \
                or abs(back["lookDegrees"] - want["lookDegrees"]) > 1e-6 or not back["invertContext"] or back["showFps"] \
                or back["name"] != NAME or back["labels"] != want["labels"]:
            raise RuntimeError(f"Settings after the restart: {back}, want {want}")
        yield from stop()
        (SAVED / "ui-result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        u.log("LUNDEN_UI_TEST_OK")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
        u.GameUserSettings.get_game_user_settings().set_overall_scalability_level(original_level)
