"""Lunden (#2245) web → Unreal import. DRAFT — UNTESTED.

Written in phase A without Unreal Engine installed: no line of this file has run in the editor. Phase B (UE 5.8.4)
must run it, fix the API details marked ``PHASE B`` and only then may it be called working (docs/development/unreal.md).

Run (Windows checkout, after ``tools/browsertest.sh node tools/unreal-engine/export-world.mjs`` has written the export):
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/run-python.ps1 tools/unreal-engine/python/import_world.py [<export dir>] [--zones l1007,fixture]

What it does:
  1. reads ``export-manifest.json`` (default ``unreal/Lunden/Import``), refuses an unknown major ``formatVersion`` and
     any file whose SHA-256 differs from the manifest;
  2. imports each zone GLB with Interchange into ``/Game/Lunden/Generated/<zone>/`` (replacing what an earlier import
     wrote: the import is idempotent and nothing there is edited by hand);
  3. imports the ``fixture`` zone and compares the imported marker positions with ``measurements.json`` ``fixture``
     (the target axis mapping Unreal X = 100·x, Unreal Y = 100·z, Unreal Z = 100·y; tools/unreal-engine/coordinates.mjs). Interchange's own glTF
     axis conversion is the open assumption this measures; logs ``LUNDEN_IMPORT_FIXTURE max error <cm>``;
  4. logs ``LUNDEN_IMPORT_OK`` when every step passed; raises otherwise (tools/unreal-engine/run-python.ps1 then exits non-zero).
"""
import hashlib
import json
import os
import sys

import unreal

SUPPORTED_FORMAT_VERSION = 1
GENERATED_ROOT = "/Game/Lunden/Generated"
TOLERANCE_CM = 1.0

eal = unreal.EditorAssetLibrary


def project_root():
    # unreal/Lunden/ → repository root
    return os.path.normpath(os.path.join(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()), "..", ".."))


def sha256(path):
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
        if not os.path.isfile(file_path) or sha256(file_path) != entry["sha256"]:
            raise RuntimeError(f"{entry['path']} is missing or differs from the manifest: re-export")
    return manifest


def import_glb(file_path, destination):
    """Interchange import of one GLB into `destination`, replacing existing assets. PHASE B: confirm that UE 5.8's
    AssetImportTask routes .glb through Interchange (Project Settings → Interchange), whether a scene import (actors
    per node, transforms kept) or a combined static-mesh import is produced, and whether node `extras` arrive as asset
    metadata or actor tags. Node names equal the stable ids either way."""
    if eal.does_directory_exist(destination):
        eal.delete_directory(destination)  # Generated/ is written only by this importer
    task = unreal.AssetImportTask()
    task.filename = file_path
    task.destination_path = destination
    task.automated = True
    task.replace_existing = True
    task.save = True
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    imported = list(task.imported_object_paths or [])
    if not imported:
        raise RuntimeError(f"Interchange imported nothing from {file_path}")
    unreal.log(f"LUNDEN_IMPORT zone {os.path.basename(file_path)} → {destination}: {len(imported)} objects")
    return imported


def fixture_error(destination, measurements):
    """Max distance (cm) between the imported fixture markers and their expected Unreal positions. PHASE B: decide how a
    marker's position is read — the actor location after a scene import, or the static mesh's bounds centre when each
    node becomes an asset with its pivot at the origin. This draft reads bounds centres of the imported meshes."""
    expected = {p["id"]: p["unreal"] for p in measurements["fixture"]["points"]}
    worst, found = 0.0, 0
    for path in eal.list_assets(destination, recursive=True, include_folder=False):
        asset = eal.load_asset(path)
        name = asset.get_name() if asset else ""
        key = next((k for k in expected if name.endswith(k) or name == k), None)
        if key is None or not isinstance(asset, unreal.StaticMesh):
            continue
        box = asset.get_bounding_box()
        centre = [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2]
        err = sum((a - b) ** 2 for a, b in zip(centre, expected[key])) ** 0.5
        unreal.log(f"LUNDEN_IMPORT_FIXTURE {key}: got {centre}, want {expected[key]}, error {err:.2f} cm")
        worst, found = max(worst, err), found + 1
    if found < 4:
        raise RuntimeError(f"only {found} fixture markers found under {destination} (need ≥ 4)")
    return worst


def main(argv):
    zones = None
    args = [a for a in argv if a]
    if "--zones" in args:
        i = args.index("--zones")
        zones = set(args[i + 1].split(","))
        del args[i:i + 2]
    export_dir = args[0] if args else os.path.join(project_root(), "unreal", "Lunden", "Import")
    manifest = read_manifest(export_dir)
    with open(os.path.join(export_dir, "measurements.json"), encoding="utf-8") as f:
        measurements = json.load(f)
    unreal.log(f"LUNDEN_IMPORT export from {manifest['sourceCommit']} (dirty: {manifest['sourceDirty']}), engine {unreal.SystemLibrary.get_engine_version()}")
    for entry in manifest["files"]:
        if entry["kind"] != "glb" or (zones and entry["zone"] not in zones):
            continue
        import_glb(os.path.join(export_dir, entry["path"]), f"{GENERATED_ROOT}/{entry['zone']}")
    if not zones or "fixture" in zones:
        worst = fixture_error(f"{GENERATED_ROOT}/fixture", measurements)
        unreal.log(f"LUNDEN_IMPORT_FIXTURE max error {worst:.2f} cm (tolerance {TOLERANCE_CM} cm)")
        if worst > TOLERANCE_CM:
            raise RuntimeError(f"fixture markers are off by up to {worst:.2f} cm: Interchange's axis conversion differs from the target mapping (docs/development/unreal.md)")
    # PHASE B / #2246: map material keys (measurements.json `materials`) to hand-made materials in
    # /Game/Lunden/Materials/, turn `collision` nodes into simple collision (not rendered), tag actors with their ids.
    unreal.log("LUNDEN_IMPORT_OK")


main(sys.argv[1:])
