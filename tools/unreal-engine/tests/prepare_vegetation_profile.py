"""#2281: a scratch map for the courtyard frame-time measurement (verification only; not versioned).

    run-python.ps1 tools/unreal-engine/tests/prepare_vegetation_profile.py <scene.json> <view id> [--without-vegetation]

Writes /Game/Lunden/Generated/VegetationPerf/L_Perf_<view>[_novegetation]: every sub-level of world-levels.json streamed
always-loaded (as compose_world.py composes L_Lunden, including #2283's lighting level with its sky on the PC's clock;
with --without-vegetation the vegetation level is left out for the A/B comparison) and a CameraActor on the scene's
camera that player 0 views through (Auto Activate). No temporary light: the world's own lighting sub-level lights it. The GameMode is the engine's GameModeBase, so nothing but the camera moves
the view. Run the map with the uncooked game (UnrealEditor-Cmd -game -d3d12 -RenderOffScreen; see
docs/verification/2281/README.md) and summarise the CSV with profile_report.py.
"""
import json
from pathlib import Path
import sys

import unreal as u

TOOLS = Path(__file__).resolve().parents[1]
WORLD = json.loads((TOOLS / "world-levels.json").read_text(encoding="utf-8"))
VEGETATION = "/Game/Lunden/Generated/VegetationWorld/Level_vegetation_foliage"


def main(scene_path, view, *flags):
    scene = json.loads(Path(scene_path).read_text(encoding="utf-8"))
    cam = next(c for c in scene["cameras"] if c["id"] == view)
    without = "--without-vegetation" in flags
    target = f"/Game/Lunden/Generated/VegetationPerf/L_Perf_{view}{'_novegetation' if without else ''}"
    world = u.EditorLoadingAndSavingUtils.new_blank_map(False)
    streamed = []
    for entry in WORLD["levels"]:
        if without and entry["package"] == VEGETATION:
            continue
        if not u.EditorLevelUtils.add_level_to_world(world, entry["package"], u.LevelStreamingAlwaysLoaded):
            raise RuntimeError(f"Cannot stream {entry['package']}: build it with {entry['builder']}")
        streamed.append(entry["package"])
    spawner = u.get_editor_subsystem(u.EditorActorSubsystem)
    camera = spawner.spawn_actor_from_class(u.CameraActor, u.Vector(*cam["xyz"]), u.Rotator(roll=0, pitch=cam["pitch"], yaw=cam["yaw"]))
    comp = camera.camera_component
    comp.set_editor_property("field_of_view", scene["horizontalFov"])
    comp.set_editor_property("constrain_aspect_ratio", False)
    camera.set_editor_property("auto_activate_for_player", u.AutoReceiveInput.PLAYER0)
    start = spawner.spawn_actor_from_class(u.PlayerStart, u.Vector(*cam["xyz"]))
    settings = world.get_world_settings() if hasattr(world, "get_world_settings") else \
        u.GameplayStatics.get_all_actors_of_class(world, u.WorldSettings)[0]
    settings.set_editor_property("default_game_mode", u.GameModeBase)
    start_name = start.get_name()
    if not u.EditorLoadingAndSavingUtils.save_map(world, target):
        raise RuntimeError("Cannot save " + target)
    u.EditorLoadingAndSavingUtils.new_blank_map(False)
    u.log(f"LUNDEN_VEGETATION_PROFILE_MAP {target}: camera {cam['id']} {cam['xyz']} yaw {cam['yaw']} pitch {cam['pitch']}, "
          f"{len(streamed)} sub-levels, start {start_name}")


main(*[a for a in sys.argv[1:] if a])
