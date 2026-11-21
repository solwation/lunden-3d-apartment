"""#2295: GPU views of the L1007 living room corner with the Christmas tree on a summer and a Christmas date.

    run-python.ps1 is -nullrhi, so run UnrealEditor-Cmd directly (headless, nothing on screen):
    UnrealEditor-Cmd.exe <uproject> -run=pythonscript "-script=<this file> <scene.json> <out dir>"
        -AllowCommandletRendering -RenderOffScreen -unattended -nosplash -nosound

scene.json comes from `node tools/unreal-engine/pilot-scene.mjs measurements.json scene.json`. The light follows
capture_light.py (#2306: L_Lunden's own sky at the day preset, the saved rig only on the pilot map; the day's sun of
views.json, not the shot's date), and the season state comes from the real rule: a
temporary BPC_LundenSeasons runs ApplySeason(year, month, day) on the editor world, the same function BeginPlay runs in
the game. Nothing is saved. Logs LUNDEN_SEASONS_CAPTURE_OK.
"""
import json
import os
from pathlib import Path
import sys

import unreal as u

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "python"))
from screenshot_level import render_view, spawn  # noqa: E402

sys.path.insert(0, str(HERE))
from capture_light import count_lights, light_for  # noqa: E402

MAP = "/Game/Lunden/Maps/L_Lunden"
COMPONENT = "/Game/Lunden/Seasons/BPC_LundenSeasons.BPC_LundenSeasons_C"
# Unreal cm: behind the coffee table looking north at the tree corner (web x 2.9, z 11.0, eye 1.62 m)
VIEW = {"xyz": [290, 1100, 162], "yaw": -100, "pitch": -6}
DATES = {"summer": (2026, 7, 15), "christmas": (2026, 12, 24)}


def main(scene_path, out_dir):
    scene = json.loads(Path(scene_path).read_text(encoding="utf-8"))
    if not u.EditorLoadingAndSavingUtils.load_map(MAP):
        raise RuntimeError("Cannot load L_Lunden")
    world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
    actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
    excluded = [a for a in actors if "kind:collision" in [str(t) for t in a.tags]]
    seasonal = [a for a in actors if "seasonal" in [str(t) for t in a.tags]]
    seasonal_lights = [a for a in seasonal if a.get_component_by_class(u.PointLightComponent)]
    light = light_for(world)
    light.use("day", scene["lighting"]["day"])
    lights = count_lights(world, light)
    u.SystemLibrary.execute_console_command(world, "r.Shadow.Virtual.Enable 0")
    holder = spawn(u.Actor, u.Vector(0, 0, 0))
    seasons = u.new_object(u.load_class(None, COMPONENT), outer=holder)
    os.makedirs(out_dir, exist_ok=True)
    shots = []
    for name, date in DATES.items():
        seasons.call_method("ApplySeason", date)
        # The editor uses its own hidden flag for a point light's contribution to the scene.
        for lamp in seasonal_lights:
            lamp.set_is_temporarily_hidden_in_editor(lamp.get_editor_property("hidden"))
        hidden_roots = sorted(str(a.tags[0]) for a in seasonal if a.get_editor_property("hidden")
                              and "kind:furniture" in [str(t) for t in a.tags])
        # an editor-world capture draws hidden-in-game actors, so it hides what the game hides (as for collision)
        gone = [a for a in seasonal if a.get_editor_property("hidden")]
        render_view(world, out_dir, f"unreal-living-room-{name}", u.Vector(*VIEW["xyz"]),
                    u.Rotator(roll=0, pitch=VIEW["pitch"], yaw=VIEW["yaw"]), scene["width"], scene["height"],
                    scene["horizontalFov"], light.bias(scene["lighting"]["day"]), excluded + gone, lumen=True)
        shots.append({"name": name, "date": "%04d-%02d-%02d" % date, "seasonalActors": len(seasonal), "hidden": sorted({a.get_editor_property("hidden") for a in seasonal}),
                      "hiddenRoots": hidden_roots})
        u.log(f"LUNDEN_SEASONS_CAPTURE {json.dumps(shots[-1])}")
    (Path(out_dir) / "capture.json").write_text(json.dumps({"engine": u.SystemLibrary.get_engine_version(),
        "view": VIEW, "light": light.kind, "lights": lights, "shots": shots}, indent=2) + "\n")
    u.EditorLoadingAndSavingUtils.new_blank_map(False)  # discard the capture settings and temporary component
    u.log("LUNDEN_SEASONS_CAPTURE_OK")


main(*[a for a in sys.argv[1:] if a])
