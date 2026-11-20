"""#2246: sample physical StaticMesh bounds from the imported L1007 level. No expected distances or export geometry."""
import hashlib
import itertools
import json
from pathlib import Path
import sys

import unreal

LEVEL = "/Game/Lunden/Generated/l1007/Level_l1007"
# Importer actor IDs identify the mesh only. Never parse a coordinate from an ID.
SURFACES = {
    "living_west": "wall_l0_x10_z635_y150",
    "living_east": "wall_l0_x565_z635_y150",
    "entrance_floor": "mesh_l0_x288_z635_y0",
    "entrance_ceiling": "mesh_l0_x288_z1015_y300",
    "upper_floor": "mesh_l1_x288_z1015_y325",
    "upper_ceiling": "mesh_l1_x288_z635_y605",
    "stair_landing": "mesh_l1_x193_z665_y325",
    "stair_last_tread": "mesh_l0_x399_z618_y292",
    "door_north_jamb": "wall_l0_x210_z419_y150",
    "door_south_jamb": "wall_l0_x210_z688_y150",
}


def mesh_bounds(actor):
    """Transform a real asset's local bounding-box corners by its placed component's world transform."""
    components = actor.get_components_by_class(unreal.StaticMeshComponent)
    if len(components) != 1:
        raise RuntimeError(f"{actor.get_name()} requires one placed mesh, got {len(components)}")
    component = components[0]
    mesh = component.get_editor_property("static_mesh")
    bounds = mesh.get_bounding_box()
    transform = component.get_world_transform()
    points = []
    for x, y, z in itertools.product(*[(getattr(bounds.min, k), getattr(bounds.max, k)) for k in "xyz"]):
        p = unreal.MathLibrary.transform_location(transform, unreal.Vector(x, y, z))
        points.append((p.x, p.y, p.z))
    return {
        "actor": actor.get_name(),
        "mesh": mesh.get_path_name(),
        "minCm": [min(axis) for axis in zip(*points)],
        "maxCm": [max(axis) for axis in zip(*points)],
    }


def measure(output):
    zone = Path(unreal.Paths.project_content_dir()) / "Lunden/Generated/l1007"
    stamp = json.loads((zone / "import-stamp.json").read_bytes())
    map_file = "Level_l1007.umap"
    digest = hashlib.sha256((zone / map_file).read_bytes()).hexdigest()
    if digest != stamp["files"][map_file]:
        raise RuntimeError("Level package differs from the import stamp")
    if not unreal.EditorLoadingAndSavingUtils.load_map(LEVEL):
        raise RuntimeError(f"Could not open {LEVEL}")
    actors = {a.get_name(): a for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()}
    observed = {key: mesh_bounds(actors[name]) for key, name in SURFACES.items()}
    report = {"engine": unreal.SystemLibrary.get_engine_version(), "level": LEVEL, "levelSHA256": digest,
              "importSource": stamp["export"], "surfaces": observed}
    output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    unreal.log(f"LUNDEN_PILOT_SURFACES {len(observed)} mesh components")


if __name__ == "__main__":
    measure(Path(sys.argv[1]))
