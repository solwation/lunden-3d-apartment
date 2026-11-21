"""#2279: build the walkable collision of Hus L's stairwell and the garage for the world map from the #2245 import.

    run-python.ps1 tools/unreal-engine/python/build_exterior.py [--force]

Reads the imported zones /Game/Lunden/Generated/hus-l/Level_hus-l and /Game/Lunden/Generated/kvarteret/Level_kvarteret
(owned by import_world.py, never edited here) and writes /Game/Lunden/Generated/ExteriorWorld/Level_exterior_collision,
which compose_world.py streams next to them:

- a collision copy of every imported mesh of Hus L's stairwell (export `source` src/core.js: walls, flights, landings,
  the lift shaft), of Hus A/B/C's stairwells, which open onto the garage on våning −1 (src/corehouse.js; their doors
  stay as exported, closed), and of the garage (src/garage.js: floor, walls, ramps, doors), placed on the imported actor's transform
  and hidden in game. Each copy is complex-as-simple with double-sided triangles and Nanite off, so the capsule follows
  the full mesh: the imported meshes have no simple shapes after a reload, their complex collision would be the
  simplified Nanite fallback (#2298) and single-sided (#2299). Copies leave those importer bugs alone;
- not the portik's glazed door leaf into the stairwell (doors that open are #2285), so the way in stays open.

The street from START west to the portik and the portik's floor are the ground's collision level (build_site.py,
#2280), which replaced the provisional street-level boxes this builder placed until then.

Nothing here is versioned (Content/Lunden/Generated/ is ignored). The build is skipped when both import fingerprints,
this script and every output package are unchanged.
"""
import hashlib
import json
from pathlib import Path
import sys

import unreal as u

SOURCES = {"hus-l": ("/Game/Lunden/Generated/hus-l/Level_hus-l", {"source:src/core.js"}),
           "kvarteret": ("/Game/Lunden/Generated/kvarteret/Level_kvarteret", {"source:src/garage.js", "source:src/corehouse.js"})}
FOLDER = "/Game/Lunden/Generated/ExteriorWorld"
TARGET = FOLDER + "/Level_exterior_collision"
TAGS = ["kind:collision", "derived:exterior-collision"]
# The portik's glazed door into the stairwell (cm, Unreal axes): src/config.js PORTIK.west = -16.12 m (the screen's line)
# and CORE.portikDoor.z = [8.45, 9.48] m. Imported actors whose bounds centre lies in this box are the leaf's parts.
DOOR_LEAF = {"x": (-1612 - 60, -1612 + 60), "y": (845 - 5, 948 + 5), "z": (-10, 230)}

content = Path(u.Paths.project_content_dir())
out_dir = content / "Lunden/Generated/ExteriorWorld"
stamp_path = out_dir / "build-stamp.json"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def text_sha(path):
    # line endings normalised, so a CRLF (autocrlf) checkout hashes the script like LF (#2309)
    return hashlib.sha256(Path(path).read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def package_files():
    return sorted(p for p in out_dir.rglob("*") if p.suffix in (".umap", ".uasset"))


def inputs():
    stamps = {z: json.loads((content / f"Lunden/Generated/{z}/import-stamp.json").read_text(encoding="utf-8")) for z in SOURCES}
    return {"importFingerprints": {z: s["contentFingerprint"] for z, s in stamps.items()},
            "importGlbs": {z: s["export"]["sha256"] for z, s in stamps.items()},
            "builder": text_sha(__file__), "engine": u.SystemLibrary.get_engine_version()}


def unchanged(wanted):
    if not stamp_path.exists():
        return False
    old = json.loads(stamp_path.read_text(encoding="utf-8"))
    files = {p.relative_to(out_dir).as_posix(): sha(p) for p in package_files()}
    return old.get("inputs") == wanted and old.get("files") == files and files


def in_leaf(centre):
    d = DOOR_LEAF
    return d["x"][0] < centre.x < d["x"][1] and d["y"][0] < centre.y < d["y"][1] and d["z"][0] < centre.z < d["z"][1]


def collect():
    """The meshes to copy, as plain values (each source world is unloaded after)."""
    meshes, skipped = [], []
    for zone, (level, tag) in SOURCES.items():
        if not u.EditorLoadingAndSavingUtils.load_map(level):
            raise RuntimeError(f"Missing {level}: run import_world.py --zones {zone} first")
        found = 0
        for a in sorted(u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors(), key=lambda a: a.get_name()):
            if not tag & {str(t) for t in a.tags} or not isinstance(a, u.StaticMeshActor):
                continue
            mesh = a.static_mesh_component.static_mesh
            if not mesh:
                continue
            centre, _ = a.get_actor_bounds(False)
            if zone == "hus-l" and in_leaf(centre):
                skipped.append(a.get_name())
                continue
            meshes.append((zone, a.get_name(), a.get_actor_transform(), mesh.get_path_name()))
            found += 1
        if not found:
            raise RuntimeError(f"{level} has no actors tagged {tag}")
    if not skipped:
        raise RuntimeError("The portik door leaf was not found: check DOOR_LEAF against the export")
    return meshes, skipped


def build(meshes):
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

    def static_actor(label, mesh, tags):
        actor = spawner.spawn_actor_from_class(u.StaticMeshActor, u.Vector(0, 0, 0))
        actor.set_actor_label(label)
        comp = actor.static_mesh_component
        comp.set_static_mesh(mesh)
        comp.set_collision_profile_name("BlockAll")
        actor.set_actor_hidden_in_game(True)
        actor.tags = [u.Name(t) for t in tags]
        return actor

    copies = {}
    for zone, name, transform, mesh_path in meshes:
        mesh = copies.get(mesh_path)
        if not mesh:
            target = "Collision_" + mesh_path.rsplit(".", 1)[-1]
            mesh = tools.duplicate_asset(target, FOLDER + "/Meshes", assets.load_asset(mesh_path))
            if not mesh:
                raise RuntimeError(f"Cannot copy {mesh_path}")
            settings = mesh.get_editor_property("nanite_settings")
            settings.set_editor_property("enabled", False)
            mesh.set_editor_property("nanite_settings", settings)
            body = mesh.get_editor_property("body_setup")
            body.set_editor_property("collision_trace_flag", u.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
            body.set_editor_property("double_sided_geometry", True)
            if not assets.save_loaded_asset(mesh, only_if_is_dirty=False):
                raise RuntimeError(f"Cannot save {FOLDER}/Meshes/{target}")
            copies[mesh_path] = mesh
        static_actor("Exterior collision " + name, mesh, TAGS + ["zone:" + zone, "source:" + name]).set_actor_transform(transform, False, False)
    if not u.EditorLoadingAndSavingUtils.save_map(world, TARGET):
        raise RuntimeError("Cannot save " + TARGET)
    u.EditorLoadingAndSavingUtils.new_blank_map(False)
    return len(copies)


def main(argv):
    wanted = inputs()
    if "--force" not in argv and unchanged(wanted):
        u.log(f"LUNDEN_EXTERIOR_BUILD skipped, unchanged since import fingerprints {wanted['importFingerprints']}")
    else:
        meshes, skipped = collect()
        copies = build(meshes)
        files = {p.relative_to(out_dir).as_posix(): sha(p) for p in package_files()}
        stamp_path.write_text(json.dumps({"inputs": wanted, "files": files}, indent=1, sort_keys=True) + "\n",
                              encoding="utf-8")
        u.log(f"LUNDEN_EXTERIOR_BUILD {TARGET}: {len(meshes)} collision actors from {copies} mesh copies "
              f"(stairwells and garage), door leaf left open ({len(skipped)} parts: {skipped}), "
              f"{len(files)} packages")
    u.log("LUNDEN_EXTERIOR_BUILD_OK")


main([a for a in sys.argv[1:] if a])
