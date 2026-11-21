"""#2306: count the lights a capture script's editor world has, per map, as capture_light.py sets it up.

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/run-python.ps1 tools/unreal-engine/tests/check_capture_light.py <scene.json>

For L_Lunden (its own BP_LundenSky since #2283) and Pilot_L1007: the light capture_light.light_for picks, its count of
visible directional and sky lights by day and in the evening, including the owner of each component. Writes Saved/capture-light-check.json; nothing is saved to the project.
Fails unless L_Lunden has exactly its own sky's lights and Pilot_L1007 the rig's. Logs LUNDEN_CAPTURE_LIGHT_OK.
"""
import json
from pathlib import Path
import sys

import unreal as u

sys.path.insert(0, str(Path(__file__).resolve().parent))
from capture_light import count_lights, light_for  # noqa: E402
from capture_world import loaded_capture_levels  # noqa: E402

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))


def main(scene_path):
    scene = json.loads(Path(scene_path).read_text(encoding="utf-8"))
    report, failures = {}, []
    for name, path in (("L_Lunden", "/Game/Lunden/Maps/L_Lunden"), ("Pilot_L1007", "/Game/Lunden/Maps/Pilot_L1007")):
        if not u.EditorLoadingAndSavingUtils.load_map(path):
            raise RuntimeError("Cannot load " + path)
        world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
        light = light_for(world)
        entry = {"light": light.kind}
        for preset in ("day", "evening"):
            light.use(preset, scene["lighting"][preset])
            entry[preset] = count_lights(world, light)
        report[name] = entry
        day = entry["day"]
        want = "map" if name == "L_Lunden" else "pilot"
        if light.kind != want or day["sky"] != 1 or not 1 <= day["directional"] <= 2:
            failures.append(f"{name}: {entry}")
        if name == "L_Lunden":
            entry["loadedLevels"] = light.seasons.loaded_levels
            vegetation = next(p for p in entry["loadedLevels"] if "/VegetationWorld/" in p)
            # Remove its ULevel from this unsaved editor world. Its package and manifest row still exist.
            stream = u.GameplayStatics.get_streaming_level(world, vegetation)
            if not u.EditorLevelUtils.remove_level_from_world(stream.get_loaded_level()):
                raise RuntimeError("Could not remove the vegetation for the negative capture check")
            try:
                loaded_capture_levels(world)
            except RuntimeError as error:
                if vegetation not in str(error):
                    raise
            else:
                raise RuntimeError("A capture incorrectly accepted unloaded vegetation")
        u.log(f"LUNDEN_CAPTURE_LIGHT {name}: {json.dumps(entry)}")
        u.EditorLoadingAndSavingUtils.new_blank_map(False)
    (PROJECT / "Saved/capture-light-check.json").write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8")
    if failures:
        raise RuntimeError("capture light: " + "; ".join(failures))
    u.log("LUNDEN_CAPTURE_LIGHT_OK")


main(*[a for a in sys.argv[1:] if a])
