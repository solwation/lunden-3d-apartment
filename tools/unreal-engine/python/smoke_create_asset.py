"""Lunden (#2243) headless smoke test: create, save, reload and delete an asset in the Unreal editor.

Run: powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/run-python.ps1 tools/unreal-engine/python/smoke_create_asset.py
Uses only /Game/Lunden/_Smoke (ignored by unreal/Lunden/.gitignore) and deletes it again; raises on any failure so
tools/unreal-engine/run-python.ps1 reports a non-zero exit.
"""
import unreal

FOLDER = "/Game/Lunden/_Smoke"
NAME = "M_LundenSmoke"
PATH = f"{FOLDER}/{NAME}"

eal = unreal.EditorAssetLibrary


def main():
    if eal.does_directory_exist(FOLDER):
        eal.delete_directory(FOLDER)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    asset = tools.create_asset(NAME, FOLDER, unreal.Material, unreal.MaterialFactoryNew())
    if asset is None:
        raise RuntimeError(f"create_asset returned None for {PATH}")
    if not eal.save_asset(PATH, only_if_is_dirty=False):
        raise RuntimeError(f"save_asset failed for {PATH}")
    loaded = eal.load_asset(PATH)
    if loaded is None or not isinstance(loaded, unreal.Material):
        raise RuntimeError(f"load_asset did not return the material {PATH}: {loaded!r}")
    unreal.log(f"LUNDEN_SMOKE_OK created and reloaded {loaded.get_path_name()} (engine {unreal.SystemLibrary.get_engine_version()})")
    if not eal.delete_directory(FOLDER):
        raise RuntimeError(f"could not delete {FOLDER}")


main()
