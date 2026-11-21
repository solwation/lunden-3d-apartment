"""#2285: result picture of build_interaction.py's level: L1007's north facade from outside with the front door and
the Entréplan north window opened through their interactables (editor world, nothing saved).

    UnrealEditor-Cmd.exe <uproject> -run=pythonscript "-script=<this file> <out dir>"
        -AllowCommandletRendering -RenderOffScreen -unattended -nosplash -nosound
Logs LUNDEN_INTERACTION_CAPTURE_OK.
"""
import os
from pathlib import Path
import sys

import unreal as u

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from screenshot_level import add_light, render_view  # noqa: E402

MAP = "/Game/Lunden/Generated/Interaction/Level_l1007_interaction"
OPEN = ("door_l0_x80_z0", "window_l0_x385_z7", "window_l1_x385_z7")
VIEWS = {"open-door-and-window": (u.Vector(240, -620, 230), u.Rotator(roll=0, pitch=-8, yaw=90), 80)}


def main(out_dir):
    if not u.EditorLoadingAndSavingUtils.load_map(MAP):
        raise RuntimeError("Run build_interaction.py first")
    world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
    actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
    for a in actors:
        tags = [str(t) for t in a.tags]
        for i in OPEN:
            if "interact:" + i in tags:
                a.set_actor_location_and_rotation(a.get_editor_property("OpenLocation"), a.get_editor_property("OpenRotation"), False, True)
    excluded = [a for a in actors if isinstance(a, u.TriggerBox) or "kind:collision" in [str(t) for t in a.tags]]
    sun = add_light()
    sun.set_actor_rotation(u.Rotator(roll=0, pitch=-30, yaw=60), False)  # light the north facade (it faces -Y)
    u.SystemLibrary.execute_console_command(world, "r.Shadow.Virtual.Enable 0")
    os.makedirs(out_dir, exist_ok=True)
    for name, (loc, rot, fov) in VIEWS.items():
        render_view(world, out_dir, name, loc, rot, 1280, 720, fov, 0, excluded)
    u.EditorLoadingAndSavingUtils.new_blank_map(False)
    u.log("LUNDEN_INTERACTION_CAPTURE_OK")


main(*[a for a in sys.argv[1:] if a])
