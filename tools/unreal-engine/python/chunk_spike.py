"""Create two small test worlds or move a single actor in zone A for the #2248 cook comparison."""
from pathlib import Path
import sys
import unreal

# The isolated fixture's project folder is created by prepare-chunk-spike.py.
project = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
if not (project / ".lunden-chunk-spike").is_file():
    raise RuntimeError("Prepare an isolated chunk-spike project before generating test maps.")

levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
zone_a = "/Game/Maps/SpikeA/ZoneA"
zone_b = "/Game/Maps/SpikeB/ZoneB"


def create_zone(path):
    if unreal.EditorAssetLibrary.does_asset_exist(path) or not levels.new_level(path):
        raise RuntimeError(f"Could not create new fixture level {path}")
    player = actors.spawn_actor_from_class(unreal.PlayerStart, unreal.Vector(0, 0, 120))
    cube = actors.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(360, 0, 115))
    cube.static_mesh_component.set_static_mesh(unreal.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube"))
    cube.set_actor_scale3d(unreal.Vector(1.25, 1.25, 1.25))
    cube.set_actor_label("ZoneMarker")
    sun = actors.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 500), unreal.Rotator(-40, -30, 0))
    sun.light_component.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
    if not player or not levels.save_current_level():
        raise RuntimeError(f"Could not save fixture level {path}")


if "--change-zone-a" in sys.argv:
    if not levels.load_level(zone_a):
        raise RuntimeError("Could not load zone A")
    marker, = [a for a in actors.get_all_level_actors() if a.get_actor_label() == "ZoneMarker"]
    marker.modify()
    if not marker.set_actor_location(unreal.Vector(360, 250, 115), False, True) or not levels.save_current_level():
        raise RuntimeError("Could not move and save the zone A marker")
    unreal.log("LUNDEN_CHUNK_SPIKE_CHANGED /Game/Maps/SpikeA/ZoneA")
else:
    for zone in (zone_a, zone_b):
        create_zone(zone)
    unreal.log("LUNDEN_CHUNK_SPIKE_READY /Game/Maps/SpikeA/ZoneA /Game/Maps/SpikeB/ZoneB")
