"""Prepare an empty Windows directory for the isolated two-zone Shipping cook."""
import argparse
import shutil
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("project", type=Path, help="new directory for the fixture's Lunden.uproject")
root = parser.parse_args().project
unreal_tools = Path(__file__).resolve().parents[1]
source = unreal_tools.parents[1] / "unreal" / "Lunden"
root.mkdir(parents=True, exist_ok=False)
shutil.copytree(source / "Config", root / "Config")
shutil.copy2(source / "Lunden.uproject", root)
shutil.copy2(unreal_tools / "python" / "chunk_spike.py", root)
(root / ".lunden-chunk-spike").touch()
with (root / "Config" / "DefaultGame.ini").open("a", encoding="utf-8") as f:
    f.write("""
[/Script/UnrealEd.ProjectPackagingSettings]
bGenerateChunks=True
bForceOneChunkPerFile=True
+MapsToCook=(FilePath="/Game/Maps/SpikeA/ZoneA")
+MapsToCook=(FilePath="/Game/Maps/SpikeB/ZoneB")

[/Script/Engine.AssetManagerSettings]
+PrimaryAssetRules=(PrimaryAssetId="Map:/Game/Maps/SpikeA/ZoneA",Rules=(Priority=10,ChunkId=1,bApplyRecursively=False,CookRule=AlwaysCook))
+PrimaryAssetRules=(PrimaryAssetId="Map:/Game/Maps/SpikeB/ZoneB",Rules=(Priority=10,ChunkId=2,bApplyRecursively=False,CookRule=AlwaysCook))
""")
with (root / "Config" / "DefaultEngine.ini").open("a", encoding="utf-8") as f:
    f.write("""
[/Script/EngineSettings.GameMapsSettings]
GameDefaultMap=/Game/Maps/SpikeA/ZoneA
EditorStartupMap=/Engine/Maps/Entry
""")
