"""Prepare a private playable L1007 staging project before a map-only local Shipping cook."""
from pathlib import Path
import runpy
import sys

import unreal


def run_builder(name, *args):
    script = Path(__file__).with_name(name)
    original = sys.argv
    try:
        sys.argv = [str(script), *args]
        runpy.run_path(str(script), run_name="__main__")
    finally:
        sys.argv = original


def prepare(measurements, scene):
    pilot = "/Game/Lunden/Maps/Pilot_L1007"
    mode = "/Game/Lunden/Player/BP_LundenGameMode.BP_LundenGameMode_C"
    config = unreal.GameMapsSettings.get_game_maps_settings()
    if pilot + ".Pilot_L1007" not in config.get_editor_property("game_default_map").export_text():
        raise RuntimeError("Set GameDefaultMap to Pilot_L1007 in the private project's DefaultEngine.ini first")
    run_builder("build_pilot_doors.py", measurements)
    run_builder("build_player.py", measurements)
    run_builder("capture_pilot.py", scene)
    run_builder("build_pilot_collision.py")
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    stream_names = {level.get_path_name().split(".")[0] for level in unreal.EditorLevelUtils.get_levels(world)}
    needed = {pilot, "/Game/Lunden/Generated/PilotDoors/Level_l1007_doors",
              "/Game/Lunden/Generated/l1007-uteplats/Level_l1007-uteplats"}
    if not needed <= stream_names or "/Game/Lunden/Generated/l1007/Level_l1007" in stream_names:
        raise RuntimeError(f"Incorrect pilot level composition: {sorted(stream_names)}")
    if world.get_world_settings().get_editor_property("default_game_mode").get_path_name() != mode:
        raise RuntimeError("Pilot world has the wrong default GameMode")
    doors = sum(a.get_class().get_name() == "BP_LundenSwingDoor_C" for a in
                unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors())
    if doors != 10:
        raise RuntimeError(f"Expected ten interactive door hinges, found {doors}")
    unreal.log("LUNDEN_PLAYABLE_PILOT_OK")


if __name__ == "__main__":
    prepare(*sys.argv[1:])
