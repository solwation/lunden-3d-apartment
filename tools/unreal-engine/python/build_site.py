"""#2280: build the ground's derived collision sub-level for the world map from the #2245 import.

    run-python.ps1 tools/unreal-engine/python/build_site.py [<export dir>] [--force]

The ground round Kv. Lunden is imported as the zones l1007-entre (#2279: the street in front of L1007 incl. START),
gard (the courtyard) and omgivning (the terrain, streets and the Höje å valley); their levels belong to
import_world.py and are never edited here. The terrain is the web's own triangle mesh (`site-terrain-*`, cut by zone),
not an Unreal Landscape, so the ground is the web's ground vertex for vertex.

The imported meshes cannot carry the player: their BodySetup has no simple shape (their complex collision was also
single-sided until importer version 6, #2299, and the simplified Nanite fallback until version 5, #2298). This builder
therefore writes /Game/Lunden/Generated/SiteWorld/Level_site_collision, which compose_world.py streams next to the
zones: for every walkable node that the export lists in measurements.json `ground.collision` (terrain, asphalt,
paving, park paths, the road bridge's asphalt, the timber bridge, the bus platform) a copy of its imported mesh with
Nanite off (the full mesh), complex-as-simple and double-sided collision, placed with the imported actor's transform
and hidden in game. The water surface, kerbs, street furniture and parked cars get no collision here.

The folder is SiteWorld, next to L1007World: Generated/<zone>/ belongs to the importer. Nothing here is versioned
(Content/Lunden/Generated/ is ignored). The build is skipped when the zones' import fingerprints, the collision list,
this script and every output package are unchanged.
"""
import hashlib
import json
import os
from pathlib import Path
import sys

import unreal as u

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_nanite_materials import static_mesh_editor  # noqa: E402  set_editor_property leaves the fallback (#2297)

FOLDER = "/Game/Lunden/Generated/SiteWorld"
TARGET = FOLDER + "/Level_site_collision"
ZONES = ("l1007-entre", "gard", "omgivning")
TAGS = ["kind:collision", "derived:site-collision"]

content = Path(u.Paths.project_content_dir())
out_dir = content / "Lunden/Generated/SiteWorld"
stamp_path = out_dir / "build-stamp.json"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def text_sha(path):
    # line endings normalised, so a CRLF (autocrlf) checkout hashes the script like LF (#2309)
    return hashlib.sha256(Path(path).read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def package_files():
    return sorted(p for p in out_dir.rglob("*") if p.suffix in (".umap", ".uasset"))


def level(zone):
    return f"/Game/Lunden/Generated/{zone}/Level_{zone}"


def ground_list(export_dir):
    measurements = json.loads((Path(export_dir) / "measurements.json").read_text(encoding="utf-8"))
    ground = measurements.get("ground")
    if not ground or not ground.get("collision"):
        raise RuntimeError("measurements.json has no `ground.collision`: export with the zones gard and omgivning (#2280)")
    return ground["collision"]


def inputs(collision):
    stamps = {}
    for zone in ZONES:
        path = content / f"Lunden/Generated/{zone}/import-stamp.json"
        if not path.exists():
            raise RuntimeError(f"Zone {zone} is not imported: run import_world.py --zones {','.join(ZONES)}")
        stamp = json.loads(path.read_text(encoding="utf-8"))
        stamps[zone] = {"fingerprint": stamp["contentFingerprint"], "glb": stamp["export"]["sha256"]}
    listed = hashlib.sha256(json.dumps(collision, sort_keys=True).encode()).hexdigest()
    return {"zones": stamps, "collision": listed, "builder": text_sha(__file__), "engine": u.SystemLibrary.get_engine_version()}


def unchanged(wanted):
    if not stamp_path.exists():
        return False
    old = json.loads(stamp_path.read_text(encoding="utf-8"))
    files = {p.relative_to(out_dir).as_posix(): sha(p) for p in package_files()}
    return old.get("inputs") == wanted and old.get("files") == files and files


def collect(collision):
    """The walkable actors' transforms and meshes, read from each imported zone level as plain values."""
    found = []
    for zone in ZONES:
        ids = [c["id"] for c in collision if c["zone"] == zone]
        if not ids:
            continue
        if not u.EditorLoadingAndSavingUtils.load_map(level(zone)):
            raise RuntimeError(f"Missing {level(zone)}: run import_world.py --zones {zone} first")
        actors = {a.get_name(): a for a in u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()}
        for node in ids:
            a = actors.get(node)
            if not a or not isinstance(a, u.StaticMeshActor):
                raise RuntimeError(f"Missing imported ground actor {node} in {level(zone)}")
            found.append((zone, node, a.get_actor_transform(), a.static_mesh_component.static_mesh.get_path_name()))
    return found


def build(found):
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
    triangles = 0
    for zone, node, transform, mesh_path in found:
        target = "Collision_" + node
        mesh = tools.duplicate_asset(target, FOLDER, assets.load_asset(mesh_path))
        if not mesh:
            raise RuntimeError(f"Cannot copy {mesh_path}")
        nanite = mesh.get_editor_property("nanite_settings")
        if nanite.get_editor_property("enabled"):  # the full mesh, not the Nanite fallback (#2298)
            nanite.set_editor_property("enabled", False)
            static_mesh_editor().set_nanite_settings(mesh, nanite, True)  # rebuilds the render data now
        body = mesh.get_editor_property("body_setup")
        body.set_editor_property("collision_trace_flag", u.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
        body.set_editor_property("double_sided_geometry", True)  # not dependent on the import's winding (#2299)
        try:
            triangles += mesh.get_num_triangles(0)
        except Exception:  # (not exposed in every engine build; the count is only reported)
            pass
        if not assets.save_loaded_asset(mesh, only_if_is_dirty=False):
            raise RuntimeError(f"Cannot save {FOLDER}/{target}")
        actor = spawner.spawn_actor_from_class(u.StaticMeshActor, u.Vector(0, 0, 0))
        actor.set_actor_label("Site collision " + node)
        comp = actor.static_mesh_component
        comp.set_static_mesh(mesh)
        comp.set_collision_profile_name("BlockAll")
        actor.set_actor_hidden_in_game(True)
        actor.tags = [u.Name(t) for t in TAGS + ["zone:" + zone, "source:" + node]]
        actor.set_actor_transform(transform, False, False)
    if not u.EditorLoadingAndSavingUtils.save_map(world, TARGET):
        raise RuntimeError("Cannot save " + TARGET)
    u.EditorLoadingAndSavingUtils.new_blank_map(False)
    return triangles


def main(argv):
    args = [a for a in argv if a and a != "--force"]
    export_dir = args[0] if args else os.path.join(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()), "Import")
    collision = ground_list(export_dir)
    wanted = inputs(collision)
    if "--force" not in argv and unchanged(wanted):
        u.log(f"LUNDEN_SITE_BUILD skipped, unchanged since the imports of {', '.join(ZONES)}")
    else:
        found = collect(collision)
        triangles = build(found)
        files = {p.relative_to(out_dir).as_posix(): sha(p) for p in package_files()}
        stamp_path.write_text(json.dumps({"inputs": wanted, "files": files}, indent=1, sort_keys=True) + "\n",
                              encoding="utf-8")
        u.log(f"LUNDEN_SITE_BUILD {TARGET}: {len(found)} walkable meshes with complex collision ({triangles} triangles) "
              f"from {', '.join(ZONES)}, {len(files)} packages")
    u.log("LUNDEN_SITE_BUILD_OK")


main([a for a in sys.argv[1:] if a])
