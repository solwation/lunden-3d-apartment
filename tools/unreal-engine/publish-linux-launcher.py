#!/usr/bin/env python3
"""Build, but never upload, the Linux x64 launcher with the public manifest key embedded."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--public-key", type=Path, required=True)
    p.add_argument("--version", required=True)
    p.add_argument("--out", type=Path, required=True)
    a = p.parse_args(argv)
    if sys.platform != "linux" or os.uname().machine != "x86_64":
        raise RuntimeError("Build the Linux launcher on Linux x86_64")
    if not re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", a.version):
        raise ValueError("Expected MAJOR.MINOR.PATCH")
    key = a.public_key.resolve(strict=True)
    key_bytes = key.read_bytes()
    pem = key_bytes.decode()
    if not re.fullmatch(r"-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PUBLIC KEY-----\s*", pem) or "PRIVATE" in pem:
        raise ValueError("Use only the public SPKI manifest key")
    if subprocess.check_output(["git", "status", "--porcelain=v1", "--untracked-files=all"], cwd=ROOT):
        raise RuntimeError("Build a clean source revision")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    out = a.out.resolve()
    if out.is_relative_to(ROOT):
        raise ValueError("Output belongs outside the source checkout")
    out.mkdir(parents=True, exist_ok=False)
    subprocess.run(["dotnet", "publish", str(ROOT / "unreal/Launcher/Lunden.Launcher.csproj"),
                    "-c", "Release", "-r", "linux-x64", "--self-contained", "true", "-o", str(out),
                    "-p:PublishSingleFile=true", "-p:IncludeNativeLibrariesForSelfExtract=true",
                    "-p:DebugType=None", "-p:DebugSymbols=false",
                    f"-p:Version={a.version}", f"-p:LundenManifestKey={key}"], cwd=ROOT, check=True)
    if (subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip() != commit
            or subprocess.check_output(["git", "status", "--porcelain=v1", "--untracked-files=all"], cwd=ROOT)
            or key.read_bytes() != key_bytes):
        raise RuntimeError("Source or public key changed while publishing")
    binary = out / "Lunden"
    with binary.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    with binary.open("rb") as stream:
        header = stream.read(20)
    if header[:7] != bytes([127, 69, 76, 70, 2, 1, 1]) or header[18:20] != bytes([62, 0]):
        raise RuntimeError("Publisher produced no Linux ELF x64 launcher")
    record = {"platform": "linux-x64", "commit": commit, "version": a.version, "sha256": digest,
              "manifestPublicKeySha256": hashlib.sha256(key_bytes).hexdigest()}
    (out / "launcher-build-linux.json").write_text(json.dumps(record, indent=2) + "\n")


if __name__ == "__main__":
    main()
