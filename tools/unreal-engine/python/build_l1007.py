"""#2278: build L1007's derived collision sub-level for the world map from the #2245 import.

    run-python.ps1 tools/unreal-engine/python/build_l1007.py [--force]

Reads the imported zone /Game/Lunden/Generated/l1007/Level_l1007 (owned by import_world.py, never edited here) and
writes /Game/Lunden/Generated/L1007World/Level_l1007_collision, which compose_world.py streams next to it:

- one collidable engine cube per imported collision proxy (the web's wall rectangles and floor plates, including the
  stair opening). The proxies share an Interchange cube whose BodySetup is empty after a reload (#2246 route.md), so
  the player would fall through them;
- the 15 stair treads as complex-as-simple copies of their imported meshes, so the capsule follows the winders;
- a provisional street-level approach from START to the front door. The street zone is not exported yet
  (`l1007-entre`); #2280 replaces this slab with the real terrain.

The folder is L1007World, not L1007: Windows paths are case-insensitive, so Generated/L1007 would be the importer's
Generated/l1007, which it deletes on every re-import. Nothing here is versioned (Content/Lunden/Generated/ is ignored).
The build is skipped when the import fingerprint, this script and every output package are unchanged.
"""
import hashlib
import json
from pathlib import Path
import sys

import unreal as u

SOURCE = "/Game/Lunden/Generated/l1007/Level_l1007"
FOLDER = "/Game/Lunden/Generated/L1007World"
TARGET = FOLDER + "/Level_l1007_collision"
CUBE = "/Engine/BasicShapes/Cube"
GROUND_MATERIAL = "/Engine/BasicShapes/BasicShapeMaterial"
TAGS = ["kind:collision", "zone:l1007", "derived:l1007-collision"]
# Stable export ids of the 4 straight, 8 winding and 3 return treads (src/stairs.js), as in build_pilot_collision.py.
TREADS = """
mesh_l0_x364_z713_y10 mesh_l0_x393_z713_y20 mesh_l0_x422_z713_y30 mesh_l0_x450_z713_y41
mesh_l0_x483_z710_y89 mesh_l0_x507_z710_y109 mesh_l0_x507_z708_y130 mesh_l0_x507_z683_y150
mesh_l0_x507_z648_y170 mesh_l0_x507_z623_y191 mesh_l0_x507_z621_y211 mesh_l0_x483_z621_y231
mesh_l0_x451_z618_y252 mesh_l0_x425_z618_y272 mesh_l0_x399_z618_y292
""".split()
# Provisional approach (cm, Unreal axes): the apartment frontage from the north facade (y = 0) to past START
# (y = -1200), at the street level of START (measurements.json spawn.start, z = 0). SITE.roads in the web puts the
# forecourt 16.3 m deep here; build_pilot_collision.py used the same extent. Replaced by #2280's terrain.
APPROACH = {"x0": 0.0, "x1": 575.3, "y0": -1630.0, "y1": 0.0, "top": 0.0, "thickness": 20.0}

content = Path(u.Paths.project_content_dir())
out_dir = content / "Lunden/Generated/L1007World"
stamp_path = out_dir / "build-stamp.json"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def package_files():
    return sorted(p for p in out_dir.rglob("*") if p.suffix in (".umap", ".uasset"))


def inputs():
    import_stamp = json.loads((content / "Lunden/Generated/l1007/import-stamp.json").read_text(encoding="utf-8"))
    return {"importFingerprint": import_stamp["contentFingerprint"], "importGlb": import_stamp["export"]["sha256"],
            "builder": sha(__file__), "engine": u.SystemLibrary.get_engine_version()}


def unchanged(wanted):
    if not stamp_path.exists():
        return False
    old = json.loads(stamp_path.read_text(encoding="utf-8"))
    files = {p.relative_to(out_dir).as_posix(): sha(p) for p in package_files()}
    return old.get("inputs") == wanted and old.get("files") == files and files


def collect():
    """Read what the derived level needs from the import, as plain values (the source world is unloaded after)."""
    if not u.EditorLoadingAndSavingUtils.load_map(SOURCE):
        raise RuntimeError(f"Missing {SOURCE}: run import_world.py --zones l1007 first")
    actors = {a.get_name(): a for a in u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()}
    proxies = []
    for name, a in sorted(actors.items()):
        tags = {str(t) for t in a.tags}
        if {"kind:collision", "zone:l1007"} <= tags:
            centre, extent = a.get_actor_bounds(False)
            proxies.append((name, centre, extent))
    if not proxies:
        raise RuntimeError("The import contains no L1007 collision proxies")
    treads = []
    for name in TREADS:
        a = actors.get(name)
        if not a:
            raise RuntimeError(f"Missing imported L1007 tread {name}")
        treads.append((name, a.get_actor_transform(), a.static_mesh_component.static_mesh.get_path_name()))
    return proxies, treads


def build(proxies, treads):
    tools = u.AssetToolsHelpers.get_asset_tools()
    assets = u.EditorAssetLibrary
    if assets.does_directory_exist(FOLDER):
        for path in assets.list_assets(FOLDER, recursive=True, include_folder=False):
            if not assets.delete_asset(path.split(".")[0]):
                raise RuntimeError("Cannot clear " + path)
    world = u.EditorLoadingAndSavingUtils.new_blank_map(False)
    if not world:
        raise RuntimeError("Cannot create a blank map")
    spawner = u.get_editor_subsystem(u.EditorActorSubsystem)
    cube = assets.load_asset(CUBE)

    def static_actor(label, mesh, tags, hidden=True):
        actor = spawner.spawn_actor_from_class(u.StaticMeshActor, u.Vector(0, 0, 0))
        actor.set_actor_label(label)
        comp = actor.static_mesh_component
        comp.set_static_mesh(mesh)
        comp.set_collision_profile_name("BlockAll")
        actor.set_actor_hidden_in_game(hidden)
        actor.tags = [u.Name(t) for t in tags]
        return actor

    def box(label, centre, extent, tags, hidden=True):
        actor = static_actor(label, cube, tags, hidden)
        actor.set_actor_location(centre, False, False)
        actor.set_actor_scale3d(extent / 50)
        return actor

    for name, centre, extent in proxies:
        box("L1007 collision " + name, centre, extent, TAGS + ["source:" + name])
    for name, transform, mesh_path in treads:
        target = "Collision_" + name
        mesh = tools.duplicate_asset(target, FOLDER, assets.load_asset(mesh_path))
        if not mesh:
            raise RuntimeError(f"Cannot copy {mesh_path}")
        mesh.get_editor_property("body_setup").set_editor_property(
            "collision_trace_flag", u.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
        if not assets.save_loaded_asset(mesh, only_if_is_dirty=False):
            raise RuntimeError(f"Cannot save {FOLDER}/{target}")
        static_actor("L1007 collision " + name, mesh, TAGS + ["source:" + name]).set_actor_transform(transform, False, False)
    a = APPROACH
    ground = box("L1007 provisional approach", u.Vector((a["x0"] + a["x1"]) / 2, (a["y0"] + a["y1"]) / 2,
                 a["top"] - a["thickness"] / 2), u.Vector((a["x1"] - a["x0"]) / 2, (a["y1"] - a["y0"]) / 2,
                 a["thickness"] / 2), ["kind:provisional-ground", "zone:l1007", "replacedBy:#2280"], hidden=False)
    ground.static_mesh_component.set_material(0, assets.load_asset(GROUND_MATERIAL))
    if not u.EditorLoadingAndSavingUtils.save_map(world, TARGET):
        raise RuntimeError("Cannot save " + TARGET)
    u.EditorLoadingAndSavingUtils.new_blank_map(False)


def main(argv):
    wanted = inputs()
    if "--force" not in argv and unchanged(wanted):
        u.log(f"LUNDEN_L1007_BUILD skipped, unchanged since import fingerprint {wanted['importFingerprint']}")
    else:
        proxies, treads = collect()
        build(proxies, treads)
        files = {p.relative_to(out_dir).as_posix(): sha(p) for p in package_files()}
        stamp_path.write_text(json.dumps({"inputs": wanted, "files": files}, indent=1, sort_keys=True) + "\n",
                              encoding="utf-8")
        u.log(f"LUNDEN_L1007_BUILD {TARGET}: {len(proxies)} wall/floor boxes, {len(treads)} treads, "
              f"1 provisional approach, {len(files)} packages")
    u.log("LUNDEN_L1007_BUILD_OK")


main([a for a in sys.argv[1:] if a])
