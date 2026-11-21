"""#2278: render shared reference views (unreal/Lunden/Tests/views.json) of the composed world map L_Lunden.

    UnrealEditor-Cmd.exe <uproject> -run=pythonscript "-script=<this file> <scene.json> <out dir> [view id,…]"
        -AllowCommandletRendering -RenderOffScreen -unattended -nosplash -nosound

scene.json comes from `node tools/unreal-engine/pilot-scene.mjs measurements.json scene.json` (cameras, sun angles and
room lamps converted from the web). The light follows capture_light.py (#2306): L_Lunden's own sky and lamps (#2283) at
views.json's date and the preset's hour with the game's exposure, the pilot map's saved rig for pilot views.
capture.json records the lights in the scene. Renders with screenshot_level.render_view and discards the world: nothing
is saved. Logs LUNDEN_L1007_CAPTURE_OK.
"""
import json
import math
import os
from pathlib import Path
import sys

import unreal as u

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from screenshot_level import render_view  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent))
from capture_light import count_lights, light_for  # noqa: E402

MAP = "/Game/Lunden/Maps/L_Lunden"


def main(scene_path, out_dir, ids=None):
    scene = json.loads(Path(scene_path).read_text(encoding="utf-8"))
    wanted = ids.split(",") if ids else [c["id"] for c in scene["cameras"]]
    if not u.EditorLoadingAndSavingUtils.load_map(MAP):
        raise RuntimeError(f"Cannot load {MAP}: run compose_world.py first")
    world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
    actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
    excluded = [a for a in actors if "kind:collision" in [str(t) for t in a.tags]]
    light = light_for(world)
    u.SystemLibrary.execute_console_command(world, "r.Shadow.Virtual.Enable 0")
    os.makedirs(out_dir, exist_ok=True)
    observed = []
    for cam in [c for c in scene["cameras"] if c["id"] in wanted]:
        preset = scene["lighting"][cam["lighting"]]
        light.use(cam["lighting"], preset)
        lights = count_lights(world, light)
        obs = render_view(world, out_dir, cam["id"], u.Vector(*cam["xyz"]),
                          u.Rotator(roll=0, pitch=cam["pitch"], yaw=cam["yaw"]), scene["width"], scene["height"],
                          scene["horizontalFov"], light.bias(preset), excluded, lumen=True)
        if math.dist(obs["xyz"], cam["xyz"]) > 0.01 or any(abs(obs[k] - cam[k]) > 0.001 for k in ("pitch", "yaw")):
            raise RuntimeError("Camera transform mismatch: " + cam["id"])
        observed.append({**obs, "id": cam["id"], "lighting": cam["lighting"], "light": light.kind,
                         "exposureBias": light.bias(preset), "lights": lights})
    (Path(out_dir) / "capture.json").write_text(json.dumps({"engine": u.SystemLibrary.get_engine_version(), "map": MAP,
        "hiddenCollisionActors": len(excluded), "cameras": observed}, indent=2) + "\n")
    u.EditorLoadingAndSavingUtils.new_blank_map(False)  # discard the editor world (rig or sky settings)
    u.log(f"LUNDEN_L1007_CAPTURE_OK {len(observed)} views")


main(*[a for a in sys.argv[1:] if a])
