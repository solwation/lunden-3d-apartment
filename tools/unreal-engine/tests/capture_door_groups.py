"""Capture the #2328 doors in a live, normally lit L_Lunden PIE world, using its exported grips and hinges.

Stage as Content/Python/test_door_groups_capture.py. Run the single automation test with a GPU and -RenderOffScreen.
Each run writes game-viewport PNGs and a camera/state record under Saved/Automation/door-pictures-<id>.
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
MEASURES = json.loads((PROJECT / "Import/measurements.json").read_text(encoding="utf-8"))
OUTPUT = PROJECT / "Saved/Automation" / ("door-pictures-" + uuid.uuid4().hex)
OUTPUT.mkdir(parents=True)
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
if not u.EditorLoadingAndSavingUtils.load_map(MAP):
    raise RuntimeError("The composed L_Lunden is required")
template = u.get_editor_subsystem(u.EditorActorSubsystem).spawn_actor_from_class(u.CameraActor, u.Vector(0, 0, 100))
template.root_component.set_mobility(u.ComponentMobility.MOVABLE)
template.tags = [u.Name("door-pictures-camera")]
saved_slot = save_isolation.isolate()


def coords(v):
    return [round(n, 3) for n in (v.x, v.y, v.z)]


def selected(rows):
    for house in ("a", "b", "c"):
        yield "hus-" + house, next(r for r in rows if r.get("house") == house and r.get("leafType") == "flat"
                                   and r["hinge"]["unreal"][2] == 0)
    for part in ("steel", "cage", "park"):
        yield part, next(r for r in rows if r.get("leafType") == part)


def door_view(row):
    h = u.Vector(*row["hinge"]["unreal"])
    shut = u.Vector(*row["checkClosed"]["unreal"]) - h
    opened = u.Vector(*row["checkOpen"]["unreal"]) - h
    length = shut.length()
    tangent = shut / length
    # The exported swing supplies the side of the landing. View the opening slightly from its latch end.
    normal = u.Vector(-tangent.y, tangent.x, 0)
    if opened.x * normal.x + opened.y * normal.y < 0:
        normal = -normal
    middle = h + shut * 0.5
    # The storage aisle is narrower than the landings. Its neighbouring mesh occludes the longer camera offset.
    distance, lateral = (145, 35) if row["leafType"] == "cage" else (165, 58)
    eye = middle + normal * distance + tangent * lateral + u.Vector(0, 0, 149)
    aim = middle + normal * 10 + u.Vector(0, 0, row["height"] * 51)
    grip = middle + u.Vector(0, 0, 110)
    return (eye, aim), (grip + normal * 30, grip)


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

        camera = actor("door-pictures-camera")
        pc.set_view_target_with_blend(camera, 0)
        sky = actor("lunden:sky")
        for prop, val in (("UseClock", False), ("TimeScale", 0.0), ("Year", 2026), ("Month", 11), ("Day", 15),
                          ("Hour", 14.0), ("Rain", 0.0), ("Snow", 0.0), ("Wet", 0.0)):
            sky.set_editor_property(prop, val, u.PropertyAccessChangeNotifyMode.NEVER)
        sky.call_method("UpdateSky")
        u.AutomationLibrary.finish_loading_before_screenshot()
        result = {"map": MAP, "engine": u.SystemLibrary.get_engine_version(), "export": MEASURES["sourceCommit"],
                  "hour": sky.get_editor_property("Hour"), "date": "2026-11-15", "views": {}}

        def move(eye, target, fov):
            rotation = u.MathLibrary.find_look_at_rotation(eye, target)
            camera.camera_component.set_field_of_view(fov)
            camera.set_actor_location_and_rotation(eye, rotation, False, True)
            return {"eyeCm": coords(eye), "aimCm": coords(target), "horizontalFov": fov}

        def interact(eye, target):
            move(eye, target, 72)
            yield from tick(.25)
            u.SystemLibrary.execute_console_command(game, "Input.+key E 1", pc)
            yield
            u.SystemLibrary.execute_console_command(game, "Input.-key E", pc)

        def photo(name, view, obj):
            yield from tick(.5, 12)  # the viewport, Lumen and exposure settle after moving the camera
            target = OUTPUT / (name + ".png")
            u.SystemLibrary.execute_console_command(game, f'shot filename="{target.as_posix()}" -nosuffix', pc)
            limit = time.monotonic() + 30
            while time.monotonic() < limit:
                yield
                if target.is_file() and target.stat().st_size > 32:
                    break
            else:
                raise RuntimeError("No game-viewport picture for " + name)
            result["views"][name] = dict(view, id=str(obj.get_editor_property("Id")),
                                         targetOpen=obj.get_editor_property("TargetOpen"),
                                         changeCount=obj.get_editor_property("ChangeCount"))
            u.log("LUNDEN_DOOR_PICTURE " + name)

        for name, row in selected(MEASURES["doors"]):
            leaf = actor("interact:" + row["id"])
            if math.dist(coords(leaf.get_actor_location()), row["hinge"]["unreal"]) > 1:
                raise RuntimeError("Wrong hinge for " + name)
            if leaf.get_editor_property("TargetOpen"):
                leaf.call_method("CloseDoor")
                yield from tick(row["seconds"] + .2)
            frame, grip = door_view(row)
            view = move(*frame, 86)
            yield from photo(name + "-closed", view, leaf)
            previous = leaf.get_editor_property("ChangeCount")
            yield from interact(*grip)
            yield from tick(row["seconds"] + .25)
            move(*frame, 86)
            angle = leaf.get_actor_rotation().yaw
            if (leaf.get_editor_property("ChangeCount") != previous + 1 or not leaf.get_editor_property("TargetOpen")
                    or abs((angle - row["open"]["unrealYaw"] + 180) % 360 - 180) > 1):
                raise RuntimeError("Opening did not reach the exported stop of " + name)
            yield from photo(name + "-open", view, leaf)

        gate_row, = [r for r in MEASURES["doors"] if r["kind"] == "overhead"]
        gate = actor("interact:" + gate_row["id"])
        for row in gate_row["control"]["buttons"]:
            name = row["id"].removeprefix("button_garage_")
            outside = name == "outside"
            side = -1 if outside else 1
            button = actor("interact:" + row["id"])
            p = u.Vector(*row["position"]["unreal"])
            if (button.get_actor_location() - p).length() > 1:
                raise RuntimeError("Wrong button location for " + name)
            eye = p + u.Vector(side * 115, -75, 26)
            aim = p + u.Vector(0, -30, 0)
            view = move(eye, aim, 72)
            yield from photo(name + "-button", view, button)
            previous = button.get_editor_property("ChangeCount")
            yield from interact(p + u.Vector(side * 45, 0, 0), p)
            yield from tick(gate_row["seconds"] + .25)
            if button.get_editor_property("ChangeCount") != previous + 1 or bool(gate.get_editor_property("TargetOpen")) != outside:
                raise RuntimeError("E did not change the gate through the " + name + " button")
            # Include the gate after the button press, using the gate's own opening centre as the image focus.
            hinge = u.Vector(*gate_row["pivot"]["unreal"])
            aim = hinge - u.Vector(0, 0, 0.45 * gate_row["height"] * 100)
            eye = aim + u.Vector(side * gate_row["width"] * 70, 40, 25)
            yield from photo(name + "-gate", move(eye, aim, 80), gate)

        (OUTPUT / "capture.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        u.log(f"LUNDEN_DOOR_PICTURES_OK {len(result['views'])} {OUTPUT}")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
