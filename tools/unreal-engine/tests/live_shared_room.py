"""Optional #2293 stages of the loopback Windows, desktop and touch PIE automation."""
from pathlib import Path
import struct
import time
import unreal as u

ROOT = "/Game/Lunden/Network/Shared/BPC_LundenSharedRoom"
DOOR = "/Game/Lunden/Blueprints/PilotDoors/BP_LundenSwingDoor"


def cls(path):
    return u.load_class(None, path + "." + path.rsplit("/", 1)[1] + "_C")


def setup(actors):
    ids = dict(u.get_default_object(cls(ROOT)).get_editor_property("DoorIds"))
    name, = [k for k, v in ids.items() if v == "w1"]
    hinge = actors.spawn_actor_from_class(cls(DOOR), u.Vector(320, -120, 0))
    hinge.tags = ["test-shared-hinge"]
    hinge.set_editor_property("Id", name)
    hinge.set_editor_property("Seconds", .3)


def wait_for(predicate, message, seconds=12):
    deadline = time.monotonic() + seconds
    while not predicate():
        if time.monotonic() >= deadline:
            raise RuntimeError(message)
        yield


def capture_chat(game, frame):
    target = Path(frame).with_name(Path(frame).stem + "-shared-chat.png")
    screen_dir = Path(u.Paths.convert_relative_path_to_full(u.Paths.screen_shot_dir()))
    before = set(screen_dir.rglob("*.png"))
    for _ in range(5):
        yield
    u.SystemLibrary.execute_console_command(game, "shot showui")
    def result():
        return next(iter(set(screen_dir.rglob("*.png")) - before), None)
    yield from wait_for(result, "Rendering produced no HUD screenshot")
    shot = result()
    for _ in range(5):
        yield
    image = shot.read_bytes()
    if len(image) < 48 or image[:8] != b"\x89PNG\r\n\x1a\n" or image[-8:-4] != b"IEND":
        raise RuntimeError("The shared-room capture is not a complete PNG")
    width, height = struct.unpack(">II", image[16:24])
    if width < 340 or height < 180:
        raise RuntimeError(f"The viewport is too small to contain the chat panel ({width} x {height})")
    with target.open("xb") as stream:
        stream.write(image)


def run(stage, folder, game, pawn, capture):
    room = pawn.get_component_by_class(cls(ROOT))
    door, = u.GameplayStatics.get_all_actors_with_tag(game, "test-shared-hinge")
    prop = room.get_editor_property
    yield from wait_for(lambda: prop("Joined") and prop("ChatWidget"), "Room or HUD did not join")
    widget = prop("ChatWidget")
    if stage == "shared-typing":
        yield from wait_for(lambda: "Dator" in prop("TypingNames"), "Desktop typing did not reach the room component")
    elif stage == "shared-reply":
        yield from wait_for(lambda: "Dator: Hej från datorn" in prop("ChatLines") and door.get_editor_property("TargetOpen"),
                            "Web chat or opened w1 did not reach the active player")
        widget.call_method("OpenChat")
        assert widget.get_editor_property("Editing")
        widget.get_editor_property("Draft").set_text(u.Text("Hej från Windows"))
        widget.call_method("Submit")
        yield from wait_for(lambda: "Klara: Hej från Windows" in prop("ChatLines"), "Own sent chat did not reach the HUD")
        door.call_method("ToggleDoor")
        if capture:
            widget.call_method("OpenChat")
            widget.call_method("UpdateChat")
            assert "Dator: Hej från datorn" in widget.get_editor_property("ShownHistory")
            assert "Klara: Hej från Windows" in widget.get_editor_property("ShownHistory")
            yield from capture_chat(game, capture)
            widget.call_method("CloseChat")
    elif stage == "shared-falls":
        baseline = pawn.get_editor_property("Revives")
        movement = pawn.get_editor_property("character_movement")
        half = pawn.get_editor_property("capsule_component").get_scaled_capsule_half_height()
        for height, expected in ((4, 5), (7, 10)):
            old = prop("LastLifeEvent")
            pawn.set_actor_location(u.Vector(0, 0, half + 2), False, True)
            movement.set_movement_mode(u.MovementMode.MOVE_WALKING)
            pawn.set_actor_location(u.Vector(0, 0, half + height * 100), False, True)
            movement.set_movement_mode(u.MovementMode.MOVE_FALLING)
            yield from wait_for(lambda: prop("LastLifeEvent") > old and pawn.get_editor_property("Lives") == expected,
                                f"Room did not confirm the {height} m landing")
        yield from wait_for(lambda: pawn.get_editor_property("Revives") == baseline + 1, "Confirmed fall did not wake the native pawn")
    else:
        raise RuntimeError("Unknown shared-room test stage")
    (folder / (stage + ".ok")).touch()
