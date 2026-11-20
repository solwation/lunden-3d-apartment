"""Lunden (#2243) headless smoke test: create, save, reload and delete an asset, and load the committed LFS fixture.

Run: powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/run-python.ps1 tools/unreal-engine/python/smoke_create_asset.py
     ... smoke_create_asset.py --create-fixture   (once, to (re)create the committed fixture asset)

1. Scratch: creates a material in /Game/Lunden/_Smoke (ignored by unreal/Lunden/.gitignore), saves, reloads and
   deletes it again.
2. Fixture: loads the committed /Game/Lunden/Fixtures/M_LundenFixture (Git LFS, lockable). When the checkout still has
   the LFS pointer text instead of the binary (LFS excluded by .lfsconfig and not pulled), it fails with the fix.
Raises on any failure, so tools/unreal-engine/run-python.ps1 reports a non-zero exit.
"""
import os
import sys

import unreal

FOLDER = "/Game/Lunden/_Smoke"
NAME = "M_LundenSmoke"
PATH = f"{FOLDER}/{NAME}"

FIXTURE_FOLDER = "/Game/Lunden/Fixtures"
FIXTURE_NAME = "M_LundenFixture"
FIXTURE_PATH = f"{FIXTURE_FOLDER}/{FIXTURE_NAME}"
FIXTURE_FILE = os.path.join(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_content_dir()),
                            "Lunden", "Fixtures", f"{FIXTURE_NAME}.uasset")
LFS_POINTER_PREFIX = b"version https://git-lfs.github.com/spec/v1"

eal = unreal.EditorAssetLibrary


def create_material(name, folder):
    asset = unreal.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, unreal.Material, unreal.MaterialFactoryNew())
    if asset is None:
        raise RuntimeError(f"create_asset returned None for {folder}/{name}")
    if not eal.save_asset(f"{folder}/{name}", only_if_is_dirty=False):
        raise RuntimeError(f"save_asset failed for {folder}/{name}")
    return asset


def scratch_round_trip():
    if eal.does_directory_exist(FOLDER):
        eal.delete_directory(FOLDER)
    create_material(NAME, FOLDER)
    loaded = eal.load_asset(PATH)
    if loaded is None or not isinstance(loaded, unreal.Material):
        raise RuntimeError(f"load_asset did not return the material {PATH}: {loaded!r}")
    name = loaded.get_path_name()
    del loaded
    if not eal.delete_directory(FOLDER):
        raise RuntimeError(f"could not delete {FOLDER}")
    return name


def check_fixture(create):
    if create and not eal.does_asset_exist(FIXTURE_PATH):
        create_material(FIXTURE_NAME, FIXTURE_FOLDER)
        unreal.log(f"LUNDEN_SMOKE created fixture {FIXTURE_PATH} ({FIXTURE_FILE})")
    if not os.path.isfile(FIXTURE_FILE):
        raise RuntimeError(f"fixture missing: {FIXTURE_FILE} (create it once with --create-fixture)")
    with open(FIXTURE_FILE, "rb") as f:
        if f.read(len(LFS_POINTER_PREFIX)) == LFS_POINTER_PREFIX:
            raise RuntimeError(f"{FIXTURE_FILE} is a Git LFS pointer, not the asset. In this checkout run: "
                               'git config lfs.fetchexclude "" && git lfs pull')
    loaded = eal.load_asset(FIXTURE_PATH)
    if loaded is None or not isinstance(loaded, unreal.Material):
        raise RuntimeError(f"load_asset did not return the fixture material {FIXTURE_PATH}: {loaded!r}")
    return f"{loaded.get_path_name()} ({os.path.getsize(FIXTURE_FILE)} bytes)"


def main(argv):
    scratch = scratch_round_trip()
    fixture = check_fixture("--create-fixture" in argv)
    unreal.log(f"LUNDEN_SMOKE_OK created and reloaded {scratch}; loaded fixture {fixture} "
               f"(engine {unreal.SystemLibrary.get_engine_version()})")


main(sys.argv[1:])
