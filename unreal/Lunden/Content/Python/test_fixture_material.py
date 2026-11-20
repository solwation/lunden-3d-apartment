"""Unreal Automation test for the Lunden content-only project's committed LFS fixture."""
import unreal

path = "/Game/Lunden/Fixtures/M_LundenFixture"
material = unreal.EditorAssetLibrary.load_asset(path)
if not isinstance(material, unreal.Material):
    raise RuntimeError(f"Expected fixture material at {path}, got {material!r}")
unreal.log(f"Lunden fixture material loaded: {material.get_path_name()}")
