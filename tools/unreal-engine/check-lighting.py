"""Verify the versioned sky Blueprint against measurements from export-world, without loading Unreal (#2385)."""
import argparse
import ast
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import sys
import types

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS / "python"))
from season_tags import season_tags
import sky_clouds
import stair_lamp
import window_light
import parasol_control
import patio_tone

PACKAGE = "/Game/Lunden/Lighting/BP_LundenSky"
ASSET = TOOLS.parents[1] / "unreal/Lunden/Content/Lunden/Lighting/BP_LundenSky.uasset"


def lighting_signature(measurements):
    # Run the actual pure specification and its dependencies. Importing the whole editor builder
    # would initialise reflected editor subsystems. Its raw file bytes are part of every existing signature.
    builder = TOOLS / "python/build_lighting.py"
    tree = ast.parse(builder.read_bytes(), filename=str(builder))
    definitions = {}
    for node in tree.body:
        if isinstance(node, ast.FunctionDef):
            definitions[node.name] = node
        elif isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            definitions[node.targets[0].id] = node
    wanted = set()
    pending = ["load_measurements", "spec_of", "spec_hash"]
    while pending:
        node = definitions[pending.pop()]
        if node not in wanted:
            wanted.add(node)
            pending.extend(n.id for n in ast.walk(node) if isinstance(n, ast.Name) and n.id in definitions)
    tree.body = [node for node in tree.body if node in wanted]
    # neutral_tonemap.py (#2396) builds an editor material and imports `unreal`; the specification only hashes its file.
    neutral_tonemap = types.SimpleNamespace(__file__=str(TOOLS / "python/neutral_tonemap.py"))
    build_window_light = types.SimpleNamespace(__file__=str(TOOLS / "python/build_window_light.py"))
    ns = dict(__file__=str(builder), Path=Path, hashlib=hashlib, json=json, season_tags=season_tags,
              sky_clouds=sky_clouds, stair_lamp=stair_lamp, neutral_tonemap=neutral_tonemap,
              window_light=window_light, build_window_light=build_window_light,
              parasol_control=parasol_control, patio_tone=patio_tone)
    exec(compile(tree, str(builder), "exec"), ns)
    return ns["spec_hash"](ns["spec_of"](ns["load_measurements"](measurements)))


class PackageReader(io.BytesIO):
    """The few UE 5.8 editor-package types needed by the summary and linker metadata tables."""

    def integer(self):
        return struct.unpack("<i", self.read(4))[0]

    def count(self):
        value = self.integer()
        if not 0 <= value <= len(self.getbuffer()) // 4:
            raise ValueError("invalid package table count")
        return value

    def string(self):
        length = self.integer()
        size = length if length >= 0 else -2 * length
        if size == 0:
            return ""
        raw = self.read(size)
        if len(raw) != size:
            raise ValueError("truncated FString")
        value = raw.decode("ascii" if length > 0 else "utf-16-le")
        if not value.endswith("\0"):
            raise ValueError("invalid FString terminator")
        return value[:-1]

    def utf8_string(self):
        length = self.count()  # the soft path serializes its UTF-8 subpath without a terminator
        raw = self.read(length)
        if len(raw) != length:
            raise ValueError("truncated soft object subpath")
        return raw.decode("utf-8")

    def name(self, names):
        index, number = self.integer(), self.integer()
        if not 0 <= index < len(names) or number < 0:
            raise ValueError("invalid FName")
        return names[index] if number == 0 else f"{names[index]}_{number - 1}"


def blueprint_signature(blob):
    # FPackageFileSummary, FLinkerLoad::SerializeSoftObjectPathList and SerializePackageMetaData.
    # The tag belongs to the Blueprint itself; arbitrary hashes or tags on other objects are irrelevant.
    r = PackageReader(blob)
    if r.read(4) != bytes.fromhex("c1832a9e") or r.integer() != -9:
        raise ValueError("expected an Unreal 5.8 editor package (git lfs pull the sky Blueprint)")
    r.seek(16)
    if r.integer() != 1018:
        raise ValueError("unsupported Unreal package version (expected UE 5.8)")
    r.seek(48)
    versions = r.count()
    r.seek(20 * versions, 1)
    if r.string() != PACKAGE or r.integer() & 0x80000000:
        raise ValueError(f"expected the uncooked {PACKAGE} editor asset")
    name_count, name_offset = r.count(), r.integer()
    path_count, path_offset = r.count(), r.integer()
    r.string()  # localization ID
    r.seek(4 * 10, 1)  # gatherable text, exports, imports, cell exports and cell imports (count + offset)
    metadata_offset = r.integer()
    if not 0 < name_offset < path_offset < metadata_offset < len(blob):
        raise ValueError("invalid package table offsets")
    r.seek(name_offset)
    names = []
    for _ in range(name_count):
        names.append(r.string())
        r.seek(4, 1)  # name hashes
    r.seek(path_offset)
    paths = [(r.name(names), r.name(names), r.utf8_string()) for _ in range(path_count)]
    r.seek(metadata_offset)
    objects = r.count()
    r.count()  # number of root metadata entries, following the per-object entries
    found = []
    target = (PACKAGE, PACKAGE.rsplit("/", 1)[1], "")
    for _ in range(objects):
        index = r.integer()
        if not 0 <= index < len(paths):
            raise ValueError("invalid object metadata path")
        for _ in range(r.count()):
            name, value = r.name(names), r.string()
            if paths[index] == target and name == "Lunden.SpecHash":
                found.append(value)
    if len(found) != 1 or not re.fullmatch(r"[0-9a-f]{64}", found[0]):
        raise ValueError(f"{PACKAGE} needs exactly one valid Lunden.SpecHash")
    return found[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("measurements", type=Path, help="measurements.json from the current export")
    parser.add_argument("--sky-asset", type=Path, default=ASSET, help="hydrated BP_LundenSky.uasset for this checkout")
    args = parser.parse_args()
    expected = lighting_signature(args.measurements)
    blob = args.sky_asset.read_bytes()
    # A WSL checkout may hold only a pointer. An explicit hydrated copy must match that versioned object.
    if args.sky_asset != ASSET:
        pointer = ASSET.read_bytes()
        if pointer.startswith(b"version https://git-lfs.github.com/spec/v1\n"):
            oid = re.search(rb"^oid sha256:([0-9a-f]{64})$", pointer, re.M)
            if not oid or hashlib.sha256(blob).hexdigest() != oid[1].decode():
                raise ValueError("--sky-asset does not match this checkout's LFS object")
        elif pointer != blob:
            raise ValueError("--sky-asset differs from this checkout's hydrated Blueprint")
    actual = blueprint_signature(blob)
    if actual != expected:
        raise ValueError(f"stale Lighting assets: BP_LundenSky has {actual}, current lighting inputs require {expected}. "
                         "On Windows take the Lighting LFS locks, run tools/unreal-engine/run-python.ps1 "
                         "tools/unreal-engine/python/build_lighting.py with the current measurements.json, "
                         "and commit the rebuilt assets in unreal/Lunden/Content/Lunden/Lighting.")
    print(f"BP_LundenSky Lunden.SpecHash matches current lighting inputs: {actual}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, RuntimeError, struct.error, KeyError, NameError) as error:
        sys.exit(f"Lighting check failed: {error}")
