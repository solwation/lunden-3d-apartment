"""#2279/#2302: build the player collision of the buildings (Hus L's stairwell, the garage, and since #2302 the façades
of Hus L, A, B and C) for the world map from the #2245 import.

    run-python.ps1 tools/unreal-engine/python/build_exterior.py [--force]

Reads the imported zones /Game/Lunden/Generated/hus-l/Level_hus-l and /Game/Lunden/Generated/kvarteret/Level_kvarteret
(owned by import_world.py, never edited here) and writes /Game/Lunden/Generated/ExteriorWorld/Level_exterior_collision,
which compose_world.py streams next to them:

- a collision copy of every imported mesh of Hus L's stairwell (export `source` src/core.js: walls, flights, landings,
  the lift shaft), of Hus A/B/C's stairwells, which open onto the garage on våning −1 (src/corehouse.js), of the garage
  (src/garage.js: floor, walls, ramps, doors), and (#2302) of the buildings'
  outsides: Hus L's façades, loftgång, roofs, terraces, the neighbours' patios and the portik (src/exterior.js) and Hus
  A/B/C's façades, loggias and roofs (src/surroundings.js), placed on the imported actor's transform
  and hidden in game. Each copy is complex-as-simple with double-sided triangles and Nanite off, so the capsule follows
  the full mesh: the imported meshes have no simple shapes (their complex collision was also single-sided until
  importer version 6, #2299, and the simplified Nanite fallback until version 5, #2298). Copies leave the imported
  meshes alone;
- not the leaves of the doors that open (#2314): every node listed in a measurements.json door row's `parts` (Hus L's
  stairwell doors from the portik and the loftgång, the entrances of Hus A/B/C, the garage door's sections). Their
  interactables in build_interaction.py's Level_hus-l_interaction / Level_kvarteret_interaction carry a blocking box that
  moves with the leaf. The façade meshes keep the web's openings: the portik stays a through-passage and the garage
  door's opening in the box stays as garage.js has it (tests/test_facades.py).

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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_nanite_materials import static_mesh_editor  # noqa: E402  set_editor_property leaves the fallback (#2297)

SOURCES = {"hus-l": ("/Game/Lunden/Generated/hus-l/Level_hus-l", {"source:src/core.js", "source:src/exterior.js"}),
           "kvarteret": ("/Game/Lunden/Generated/kvarteret/Level_kvarteret",
                         {"source:src/garage.js", "source:src/corehouse.js", "source:src/surroundings.js"})}
FOLDER = "/Game/Lunden/Generated/ExteriorWorld"
TARGET = FOLDER + "/Level_exterior_collision"
TAGS = ["kind:collision", "derived:exterior-collision"]
MEASUREMENTS = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())) / "Import/measurements.json"

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


def door_parts():
    """#2314: the exported nodes of the leaves that open (measurements.json doors with `parts`), by zone."""
    doors = json.loads(MEASUREMENTS.read_text(encoding="utf-8"))["doors"]
    return {z: sorted(p for d in doors if d["zone"] == z for p in d.get("parts", [])) for z in SOURCES}


def inputs():
    stamps = {z: json.loads((content / f"Lunden/Generated/{z}/import-stamp.json").read_text(encoding="utf-8")) for z in SOURCES}
    return {"importFingerprints": {z: s["contentFingerprint"] for z, s in stamps.items()},
            "importGlbs": {z: s["export"]["sha256"] for z, s in stamps.items()},
            "doorParts": door_parts(), "builder": text_sha(__file__), "engine": u.SystemLibrary.get_engine_version()}


def unchanged(wanted):
    if not stamp_path.exists():
        return False
    old = json.loads(stamp_path.read_text(encoding="utf-8"))
    files = {p.relative_to(out_dir).as_posix(): sha(p) for p in package_files()}
    return old.get("inputs") == wanted and old.get("files") == files and files


def collect():
    """The meshes to copy, as plain values (each source world is unloaded after)."""
    meshes, skipped = [], []
    parts = door_parts()
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
            if a.tags and str(a.tags[0]) in parts[zone]:
                skipped.append(str(a.tags[0]))
                continue
            meshes.append((zone, a.get_name(), a.get_actor_transform(), mesh.get_path_name()))
            found += 1
        if not found:
            raise RuntimeError(f"{level} has no actors tagged {tag}")
    missing = sorted(set(p for z in parts.values() for p in z) - set(skipped))
    if missing:
        raise RuntimeError(f"Door leaf nodes of measurements.json not found among the copied meshes: {missing}")
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
            static_mesh_editor().set_nanite_settings(mesh, settings, True)  # rebuilds the render data now (#2298)
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
              f"(stairwells, garage and façades), {len(skipped)} door leaf parts left to their interactables, "
              f"{len(files)} packages")
    u.log("LUNDEN_EXTERIOR_BUILD_OK")


main([a for a in sys.argv[1:] if a])
