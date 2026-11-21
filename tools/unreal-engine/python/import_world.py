"""Lunden (#2245) web -> Unreal import: zone GLBs -> /Game/Lunden/Generated/<zone>/ (a level with one actor per node).

Verified on UE 5.8.4 (phase B, 2026-11-20; docs/development/unreal.md "Import into Unreal").

Run (Windows checkout, after tools/unreal-engine/export-world.mjs has written the export to unreal/Lunden/Import/):
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/run-python.ps1 tools/unreal-engine/python/import_world.py [<export dir>] [--zones l1007,fixture] [--force] [--measure <id>,<id>]
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/run-python.ps1 tools/unreal-engine/python/import_world.py --check

Import (default):
  1. reads export-manifest.json, refuses a newer formatVersion and any file whose SHA-256 differs from the manifest;
  2. per zone: if Content/Lunden/Generated/<zone>/import-stamp.json says this exact GLB (SHA-256) was imported by this
     importer version on this engine, and every package file it lists is still byte-identical, the zone is SKIPPED
     (nothing is written: a second import changes no asset). Otherwise the folder is deleted and rebuilt: a new level
     Level_<zone>, then an Interchange *scene* import (glTF translator + the project's default glTF scene pipelines),
     which creates StaticMesh/MaterialInstance assets under <zone>/StaticMeshes|Materials and one actor per glTF node
     with its transform. Interchange's glTF conversion IS the target axis mapping (Unreal X = 100*x, Y = 100*z,
     Z = 100*y), measured with the fixture zone, so no axis correction exists anywhere;
  3. post-processing: actor object names and labels = the node's stable id; tags = [id, kind:<kind>, zone:<zone>,
     level:<n>, webId:<id>, source:<pointer>, parent:<id>] from the node extras (read from the GLB itself);
     `collision` nodes become hidden-in-game BlockAll actors whose (shared unit cube) mesh has one simple box;
     material keys listed in tools/unreal-engine/material-map.json are replaced by hand-made materials;
  4. saves, writes import-stamp.json (export hashes, a content fingerprint and the SHA-256 of every package file);
  5. checks (also run by --check without importing): fixture markers within 1 cm of measurements.json `fixture`,
     arrow tips (north -> Unreal -Y, east -> +X) within 1 cm, every door/window/light/furniture/interactive id present
     as an actor name, label and tag, and the stamp's package hashes; logs LUNDEN_IMPORT_OK / LUNDEN_CHECK_OK.
Any failure raises, so run-python.ps1 exits non-zero.
"""
import hashlib
import json
import os
import re
import shutil
import struct
import sys

import unreal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prepare_nanite_materials import prepare_zone

SUPPORTED_FORMAT_VERSION = 1
IMPORTER_VERSION = 2  # bump when the importer's output changes for the same export (forces a re-import)
GENERATED_ROOT = "/Game/Lunden/Generated"
TOLERANCE_CM = 1.0
ID_KINDS = ("door", "window", "light", "furniture", "interactive")
STAMP = "import-stamp.json"

eal = unreal.EditorAssetLibrary


# ---------------------------------------------------------------- paths, hashes, export
def project_dir():
    return os.path.normpath(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))


def repo_root():
    return os.path.normpath(os.path.join(project_dir(), "..", ".."))


def zone_disk_dir(zone):
    return os.path.join(project_dir(), "Content", "Lunden", "Generated", zone)


def level_path(zone):
    return f"{GENERATED_ROOT}/{zone}/Level_{zone}"


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_manifest(export_dir):
    path = os.path.join(export_dir, "export-manifest.json")
    if not os.path.isfile(path):
        raise RuntimeError(f"no export at {export_dir}: run tools/unreal-engine/export-world.mjs first")
    with open(path, encoding="utf-8") as f:
        manifest = json.load(f)
    version = manifest.get("formatVersion")
    if not isinstance(version, int) or version > SUPPORTED_FORMAT_VERSION:
        raise RuntimeError(f"export formatVersion {version!r} is newer than this importer ({SUPPORTED_FORMAT_VERSION}); update tools/unreal-engine/python/import_world.py")
    for entry in manifest["files"]:
        file_path = os.path.join(export_dir, entry["path"])
        if not os.path.isfile(file_path) or sha256_file(file_path) != entry["sha256"]:
            raise RuntimeError(f"{entry['path']} is missing or differs from the manifest: re-export")
    return manifest


def glb_json(path):
    """The glTF JSON chunk of a GLB (node names and extras: the ids, kinds and sources)."""
    with open(path, "rb") as f:
        magic, _version, _length, chunk_len, chunk_type = struct.unpack("<5I", f.read(20))
        if magic != 0x46546C67 or chunk_type != 0x4E4F534A:
            raise RuntimeError(f"{path} is not a GLB with a JSON chunk")
        return json.loads(f.read(chunk_len).decode("utf-8"))


def node_extras(path):
    """id -> extras for every named node of a zone GLB."""
    return {n["name"]: n.get("extras") or {} for n in glb_json(path).get("nodes", []) if n.get("name")}


def material_map():
    path = os.path.join(repo_root(), "tools", "unreal-engine", "material-map.json")
    with open(path, encoding="utf-8") as f:
        table = json.load(f)
    return table, sha256_file(path)


# ---------------------------------------------------------------- stamp and fingerprint
def package_files(zone):
    """relative path -> sha256 of every file the import wrote for the zone (the stamp itself excluded)."""
    root, out = zone_disk_dir(zone), {}
    for d, _, files in os.walk(root):
        for name in files:
            rel = os.path.relpath(os.path.join(d, name), root).replace("\\", "/")
            if rel != STAMP:
                out[rel] = sha256_file(os.path.join(d, name))
    return dict(sorted(out.items()))


def read_stamp(zone):
    path = os.path.join(zone_disk_dir(zone), STAMP)
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def r2(v):
    return round(v + 0.0, 2) + 0.0  # + 0.0 turns -0.0 into 0.0


def level_actors():
    return unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()


def content_fingerprint(zone):
    """A hash of what the import produced, independent of package GUIDs and save order: every actor (name, label,
    class, parent, transform to 0.01, tags, mesh, collision) and every StaticMesh (vertices, triangles, bounds to
    0.01, materials). Two imports of the same export must give the same fingerprint even though the .uasset bytes
    differ (a new package always gets a new persistent GUID)."""
    actors = []
    for a in level_actors():
        comp = a.get_component_by_class(unreal.StaticMeshComponent)
        mesh = comp.static_mesh.get_name() if comp and comp.static_mesh else None
        loc, rot, scale = a.get_actor_location(), a.get_actor_rotation(), a.get_actor_scale3d()
        parent = a.get_attach_parent_actor()
        actors.append([a.get_name(), a.get_actor_label(), a.get_class().get_name(), parent.get_name() if parent else None,
                       [r2(loc.x), r2(loc.y), r2(loc.z)], [r2(rot.pitch), r2(rot.yaw), r2(rot.roll)],
                       [r2(scale.x), r2(scale.y), r2(scale.z)], sorted(str(t) for t in a.tags), mesh,
                       str(comp.get_collision_profile_name()) if comp else None, bool(a.get_editor_property("hidden"))])
    actors.sort(key=lambda x: x[0])
    meshes = []
    for p in sorted(eal.list_assets(f"{GENERATED_ROOT}/{zone}", recursive=True, include_folder=False)):
        asset = eal.load_asset(p)
        if isinstance(asset, unreal.StaticMesh):
            b = asset.get_bounding_box()
            mats = [m.material_interface.get_path_name() if m.material_interface else None for m in asset.static_materials]
            body = asset.get_editor_property("body_setup")
            boxes = len(body.get_editor_property("agg_geom").get_editor_property("box_elems")) if body else 0
            meshes.append([p, asset.get_num_vertices(0), asset.get_num_triangles(0),
                           [r2(b.min.x), r2(b.min.y), r2(b.min.z), r2(b.max.x), r2(b.max.y), r2(b.max.z)], mats, boxes])
        else:
            meshes.append([p, asset.get_class().get_name() if asset else None])
    text = json.dumps({"actors": actors, "assets": meshes}, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(text.encode("utf-8")).hexdigest(), len(actors), len(meshes)


def stamp_current(zone, glb_entry, map_sha):
    """(True, why) when the zone needs no re-import: same export file, importer, engine, material map, and every
    package file byte-identical to what the last import wrote (a hand edit or a lost file forces a re-import)."""
    stamp = read_stamp(zone)
    if not stamp:
        return False, "no earlier import"
    want = {"glb": glb_entry["sha256"], "importerVersion": IMPORTER_VERSION, "engine": unreal.SystemLibrary.get_engine_version(),
            "materialMap": map_sha}
    have = {"glb": stamp.get("export", {}).get("sha256"), "importerVersion": stamp.get("importerVersion"),
            "engine": stamp.get("engine"), "materialMap": stamp.get("materialMap")}
    changed = [k for k in want if want[k] != have[k]]
    if changed:
        return False, "changed: " + ", ".join(changed)
    files = package_files(zone)
    if files != stamp.get("files"):
        diff = sorted(set(files.items()) ^ set(stamp.get("files", {}).items()))
        return False, f"{len(diff)} package files differ from the stamp (hand edit or partial import), e.g. {diff[0][0]}"
    return True, f"unchanged since import of {stamp['export']['sha256'][:12]}"


# ---------------------------------------------------------------- import
def apply_tags(extras):
    """Name, label and tag every actor with its node's id and extras; return actors by id."""
    by_id = {}
    for actor in level_actors():
        label = actor.get_actor_label()
        ex = extras.get(label)
        if ex is None:
            continue
        node_id = ex.get("id", label)
        tags = [node_id] + [f"{k}:{ex[k]}" for k in ("kind", "zone", "level", "webId", "source", "parent") if ex.get(k) is not None]
        actor.tags = [unreal.Name(t) for t in tags]
        if actor.get_name() != node_id:
            actor.rename(node_id)  # Interchange names actors <zone>_node_<index>; the id is stable between exports
        actor.set_actor_label(node_id)
        by_id[node_id] = actor
    return by_id


def apply_collision(by_id, extras):
    """`collision` nodes: one simple box on the shared unit-cube mesh, BlockAll, never rendered in game."""
    # the StaticMeshEditorSubsystem is None in the pythonscript commandlet (5.8.4); EditorStaticMeshLibrary still works there
    sme = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem) or unreal.EditorStaticMeshLibrary
    done, count = set(), 0
    for node_id, actor in by_id.items():
        if extras[node_id].get("kind") != "collision":
            continue
        comp = actor.get_component_by_class(unreal.StaticMeshComponent)
        mesh = comp.static_mesh
        if mesh.get_path_name() not in done:
            sme.remove_collisions(mesh)
            sme.add_simple_collisions(mesh, unreal.ScriptCollisionShapeType.BOX)
            done.add(mesh.get_path_name())
        comp.set_collision_profile_name("BlockAll")
        actor.set_actor_hidden_in_game(True)
        count += 1
    return count


def apply_materials(zone, table):
    """Replace imported material instances whose key matches a rule in material-map.json by the hand-made material."""
    # optional "mesh": a regex on the StaticMesh asset name (= the id of the first export node using it, #2282), for
    # keys whose web texture differs per surface (one shared tile key covers hall/wet-room tiles, paving and boards)
    rules = [(re.compile(r["match"]), re.compile(r["mesh"]) if r.get("mesh") else None, r["material"]) for r in table.get("rules", [])]
    loaded, replaced = {}, 0
    for p in eal.list_assets(f"{GENERATED_ROOT}/{zone}/StaticMeshes", recursive=True, include_folder=False):
        mesh = eal.load_asset(p)
        if not isinstance(mesh, unreal.StaticMesh):
            continue
        slots, changed = list(mesh.static_materials), False
        for slot in slots:
            key = slot.material_interface.get_name() if slot.material_interface else ""
            target = next((m for rx, mx, m in rules if rx.search(key) and (mx is None or mx.search(mesh.get_name()))), None)
            if target is None:
                continue
            if target not in loaded:
                loaded[target] = eal.load_asset(target)
                if loaded[target] is None:
                    raise RuntimeError(f"material-map.json names {target}, which does not exist: run tools/unreal-engine/python/build_materials.py")
            slot.material_interface = loaded[target]
            changed, replaced = True, replaced + 1
        if changed:
            mesh.set_editor_property("static_materials", slots)
    return replaced


def clear_zone(zone):
    """Remove everything an earlier import wrote for the zone. EditorAssetLibrary.delete_directory is unusable at this
    size on 5.8.4: it left the .umap behind, logged "Error opening file" for every package and took > 7 minutes for
    l1007's 2,426 assets (reference gathering per asset). Generated/<zone>/ belongs to this importer alone, so when none
    of its packages is loaded the folder is removed on disk and the asset registry rescans it; otherwise (a level of the
    zone is open in this editor session) the slow editor deletion is used."""
    unreal.EditorLoadingAndSavingUtils.new_blank_map(False)
    unreal.SystemLibrary.collect_garbage()
    folder, disk = f"{GENERATED_ROOT}/{zone}", zone_disk_dir(zone)
    assets = eal.list_assets(folder, recursive=True, include_folder=False) if eal.does_directory_exist(folder) else []
    loaded = [p for p in assets if unreal.find_object(None, p) is not None]
    if loaded:
        unreal.log_warning(f"LUNDEN_IMPORT zone {zone}: {len(loaded)} packages are loaded (e.g. {loaded[0]}): deleting through the editor (slow)")
        eal.delete_directory(folder)
    if os.path.isdir(disk):
        shutil.rmtree(disk)
    unreal.AssetRegistryHelpers.get_asset_registry().scan_paths_synchronous([folder], True)
    left = eal.list_assets(folder, recursive=True, include_folder=False) if eal.does_directory_exist(folder) else []
    if left:
        raise RuntimeError(f"{folder} still lists {len(left)} assets after clearing, e.g. {left[0]}")


def import_zone(zone, glb_path, glb_entry, manifest, table, map_sha):
    folder, stamp_file = f"{GENERATED_ROOT}/{zone}", os.path.join(zone_disk_dir(zone), STAMP)
    clear_zone(zone)
    # the actors go into a fresh blank (not World Partition) map, saved as Level_<zone> only after the import worked:
    # LevelEditorSubsystem.new_level would save an empty level at once and refuse the path after a failed import
    world = unreal.EditorLoadingAndSavingUtils.new_blank_map(False)
    params = unreal.ImportAssetParameters()
    params.is_automated = True
    source = unreal.InterchangeManager.create_source_data(glb_path)
    # scene import with the project's default glTF scene pipeline stack; assets go to <root>/<file name>/ = <zone>/
    if not unreal.InterchangeManager.get_interchange_manager_scripted().import_scene(GENERATED_ROOT, source, params):
        raise RuntimeError(f"Interchange scene import of {glb_path} failed")
    extras = node_extras(glb_path)
    by_id = apply_tags(extras)
    missing = sorted(i for i, ex in extras.items() if ex.get("kind") not in ("zone", None) and i not in by_id)
    if missing:
        raise RuntimeError(f"{zone}: {len(missing)} nodes have no actor after import, e.g. {missing[:5]}")
    collisions = apply_collision(by_id, extras)
    materials = apply_materials(zone, table)
    prepare_zone(zone)
    if not unreal.EditorLoadingAndSavingUtils.save_map(world, level_path(zone)):
        raise RuntimeError(f"could not save {level_path(zone)}")
    eal.save_directory(folder, only_if_is_dirty=False, recursive=True)
    fingerprint, n_actors, n_assets = content_fingerprint(zone)
    files = package_files(zone)
    stamp = {"formatVersion": 1, "importer": "tools/unreal-engine/python/import_world.py", "importerVersion": IMPORTER_VERSION,
             "engine": unreal.SystemLibrary.get_engine_version(), "materialMap": map_sha,
             "export": {"path": glb_entry["path"], "sha256": glb_entry["sha256"], "sourceCommit": manifest["sourceCommit"],
                        "sourceDirty": manifest["sourceDirty"], "sourceHash": manifest.get("sourceHash")},
             "level": level_path(zone), "actors": n_actors, "assets": n_assets, "contentFingerprint": fingerprint,
             "bytes": sum(os.path.getsize(os.path.join(zone_disk_dir(zone), p)) for p in files), "files": files}
    with open(stamp_file, "w", encoding="utf-8", newline="\n") as f:
        json.dump(stamp, f, indent=1, sort_keys=True)
        f.write("\n")
    unreal.log(f"LUNDEN_IMPORT zone {zone}: imported {glb_entry['path']} ({glb_entry['sha256'][:12]}) -> {folder}: "
               f"{n_actors} actors, {n_assets} assets, {len(files)} files, {stamp['bytes']} bytes, {collisions} collision boxes, "
               f"{materials} material slots mapped, fingerprint {fingerprint[:16]}")
    return stamp


# ---------------------------------------------------------------- checks
def load_level(zone):
    if not unreal.EditorLoadingAndSavingUtils.load_map(level_path(zone)):
        raise RuntimeError(f"{level_path(zone)} does not exist: import first")


def check_fixture(measurements):
    """Max error (cm) of the fixture markers and arrow tips against measurements.json, in the loaded fixture level."""
    actors = {a.get_name(): a for a in level_actors()}
    worst, found = 0.0, 0
    for p in measurements["fixture"]["points"]:
        a = actors.get(p["id"])
        if a is None:
            raise RuntimeError(f"fixture marker {p['id']} has no actor")
        loc = a.get_actor_location()
        got = [loc.x, loc.y, loc.z]
        err = sum((g - w) ** 2 for g, w in zip(got, p["unreal"])) ** 0.5
        unreal.log(f"LUNDEN_IMPORT_FIXTURE {p['id']}: got [{got[0]:.2f}, {got[1]:.2f}, {got[2]:.2f}], want {p['unreal']}, error {err:.3f} cm")
        worst, found = max(worst, err), found + 1
    for arrow in measurements["fixture"]["arrows"]:
        base, head = actors.get(arrow["id"]), actors.get(arrow["id"] + "__2")
        if base is None or head is None:
            raise RuntimeError(f"fixture arrow {arrow['id']} (or its head part) has no actor")
        origin, _extent = head.get_actor_bounds(False)
        b = base.get_actor_location()
        want = [b.x + arrow["unreal"][0], b.y + arrow["unreal"][1], b.z + arrow["unreal"][2]]  # the head's centre: 1 m along
        got = [origin.x, origin.y, origin.z]
        err = sum((g - w) ** 2 for g, w in zip(got, want)) ** 0.5
        unreal.log(f"LUNDEN_IMPORT_FIXTURE {arrow['id']} ({arrow['direction']}): tip at [{got[0]:.2f}, {got[1]:.2f}, {got[2]:.2f}], "
                   f"want {[round(w, 2) for w in want]} (direction {arrow['unreal']}), error {err:.3f} cm")
        worst, found = max(worst, err), found + 1
    if found < 4:
        raise RuntimeError(f"only {found} fixture markers found (need >= 4)")
    unreal.log(f"LUNDEN_IMPORT_FIXTURE max error {worst:.3f} cm over {found} markers (tolerance {TOLERANCE_CM} cm)")
    if worst > TOLERANCE_CM:
        raise RuntimeError(f"fixture markers are off by up to {worst:.2f} cm: Interchange's axis conversion differs from the target mapping (docs/development/unreal.md)")
    return worst


def check_ids(zone, glb_path):
    """Every door/window/light/furniture/interactive id exists as an actor name, label and first tag."""
    extras = node_extras(glb_path)
    want = sorted(i for i, ex in extras.items() if ex.get("kind") in ID_KINDS)
    actors = {a.get_name(): a for a in level_actors()}
    bad = [i for i in want if i not in actors or actors[i].get_actor_label() != i or not actors[i].tags or str(actors[i].tags[0]) != i]
    if bad:
        raise RuntimeError(f"{zone}: {len(bad)} of {len(want)} ids are missing as actor name/label/tag, e.g. {bad[:5]}")
    counts = {}
    for i in want:
        counts[extras[i]["kind"]] = counts.get(extras[i]["kind"], 0) + 1
    unreal.log(f"LUNDEN_IMPORT_IDS zone {zone}: {len(want)} ids present as actor name, label and tag {json.dumps(counts, sort_keys=True)}")


def check_stamp(zone, glb_entry, map_sha):
    ok, why = stamp_current(zone, glb_entry, map_sha)
    if not ok:
        raise RuntimeError(f"{zone}: the import does not match the export ({why}): run import_world.py")
    unreal.log(f"LUNDEN_IMPORT_STAMP zone {zone}: {why}, {len(read_stamp(zone)['files'])} package files byte-identical")


def log_measures(zone, ids):
    """Log the world bounds (cm) of the named actors, e.g. --measure door_l0_x80_z0 for a round-trip check."""
    actors = {a.get_name(): a for a in level_actors()}
    for node_id in ids:
        a = actors.get(node_id)
        if a is None:
            continue
        lo, hi, stack = [float("inf")] * 3, [float("-inf")] * 3, [a]
        while stack:  # the object's actor and its attached part actors
            x = stack.pop()
            stack.extend(x.get_attached_actors())
            if x.get_component_by_class(unreal.StaticMeshComponent) is None:
                continue
            origin, extent = x.get_actor_bounds(False)
            for i, (o, e) in enumerate(((origin.x, extent.x), (origin.y, extent.y), (origin.z, extent.z))):
                lo[i], hi[i] = min(lo[i], o - e), max(hi[i], o + e)
        size = [h - l for h, l in zip(hi, lo)]
        unreal.log(f"LUNDEN_IMPORT_MEASURE zone {zone} {node_id}: bounds min [{lo[0]:.2f}, {lo[1]:.2f}, {lo[2]:.2f}] "
                   f"max [{hi[0]:.2f}, {hi[1]:.2f}, {hi[2]:.2f}] cm, size [{size[0]:.2f}, {size[1]:.2f}, {size[2]:.2f}] cm")


# ---------------------------------------------------------------- main
def main(argv):
    args = [a for a in argv if a]
    zones, force, check_only = None, "--force" in args, "--check" in args
    args = [a for a in args if a not in ("--force", "--check")]
    measure = []
    if "--measure" in args:
        i = args.index("--measure")
        measure = args[i + 1].split(",")
        del args[i:i + 2]
    if "--zones" in args:
        i = args.index("--zones")
        zones = set(args[i + 1].split(","))
        del args[i:i + 2]
    export_dir = args[0] if args else os.path.join(project_dir(), "Import")
    manifest = read_manifest(export_dir)
    with open(os.path.join(export_dir, "measurements.json"), encoding="utf-8") as f:
        measurements = json.load(f)
    table, map_sha = material_map()
    unreal.log(f"LUNDEN_IMPORT export from {manifest['sourceCommit']} (dirty: {manifest['sourceDirty']}), engine {unreal.SystemLibrary.get_engine_version()}"
               f"{', check only' if check_only else ''}{', forced' if force else ''}")
    entries = [e for e in manifest["files"] if e["kind"] == "glb" and (not zones or e["zone"] in zones)]
    for entry in entries:
        zone, glb_path = entry["zone"], os.path.join(export_dir, entry["path"])
        if check_only:
            check_stamp(zone, entry, map_sha)
        else:
            current, why = stamp_current(zone, entry, map_sha)
            if current and not force:
                unreal.log(f"LUNDEN_IMPORT zone {zone}: skipped, {why} ({len(read_stamp(zone)['files'])} package files byte-identical)")
            else:
                unreal.log(f"LUNDEN_IMPORT zone {zone}: importing ({'forced' if force else why})")
                import_zone(zone, glb_path, entry, manifest, table, map_sha)
        load_level(zone)
        check_ids(zone, glb_path)
        if zone == "fixture":
            check_fixture(measurements)
        log_measures(zone, measure)
        if check_only:
            fingerprint, _, _ = content_fingerprint(zone)
            want = read_stamp(zone)["contentFingerprint"]
            if fingerprint != want:
                raise RuntimeError(f"{zone}: content fingerprint {fingerprint[:16]} differs from the stamp's {want[:16]}")
            unreal.log(f"LUNDEN_IMPORT_FINGERPRINT zone {zone}: {fingerprint[:16]} matches the stamp")
    unreal.EditorLoadingAndSavingUtils.new_blank_map(False)
    unreal.log("LUNDEN_CHECK_OK" if check_only else "LUNDEN_IMPORT_OK")


main(sys.argv[1:])
