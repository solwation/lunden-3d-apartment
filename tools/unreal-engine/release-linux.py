#!/usr/bin/env python3
"""#2422: local Linux x86_64 Shipping cook. Never publishes or signs a release.

Uses the installed Epic Linux 5.8.4 content-only Shipping runtime and the normal
import freshness gate. No low-profile/NullRHI/CPU-device flags enter the product.
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = "Engine/Binaries/Linux/UnrealGame-Linux-Shipping"


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def revision(root=ROOT):
    if subprocess.check_output(["git", "-C", str(root), "status", "--porcelain=v1", "--untracked-files=all"]):
        raise RuntimeError("Release requires a clean checkout, including authored assets")
    return subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()


def uat_arguments(engine, output):
    return [str(engine / "Engine/Build/BatchFiles/RunUAT.sh"), "BuildCookRun",
            f"-project={ROOT / 'unreal/Lunden/Lunden.uproject'}", "-platform=Linux", "-clientconfig=Shipping",
            "-nocompileuat", "-nocompile", "-skipbuild", "-cook", "-stage", "-pak", "-iostore",
            "-package", "-nodebuginfo", "-nobootstrapexe", "-archive",
            f"-stagingdirectory={output / 'stage'}", f"-archivedirectory={output / 'archive'}",
            "-unattended", "-nop4", "-utf8output"]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine-root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path, help="new directory outside the checkout")
    parser.add_argument("--version", required=True)
    parser.add_argument("--content", type=int, required=True)
    parser.add_argument("--timeout", type=int, default=14400)
    parser.add_argument("--plan", action="store_true", help="validate prerequisites and print UAT arguments; do not launch or create output")
    args = parser.parse_args(argv)
    if sys.platform != "linux" or os.uname().machine != "x86_64":
        raise RuntimeError("Run this Shipping cook on Linux x86_64")
    if not re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", args.version) or not 0 <= args.content <= 2147483647:
        raise ValueError("Expected release MAJOR.MINOR.PATCH and nonnegative Int32 content version")
    if args.timeout <= 0:
        raise ValueError("Timeout must be positive")
    engine, output = args.engine_root.resolve(strict=True), args.output.resolve()
    if output.is_relative_to(ROOT) or output == engine or output.is_relative_to(engine):
        raise ValueError("Choose a new output directory outside the checkout and engine")
    commit = revision()
    version = json.loads((engine / "Engine/Build/Build.version").read_text())
    if tuple(version[k] for k in ["MajorVersion", "MinorVersion", "PatchVersion"]) != (5, 8, 4):
        raise RuntimeError("The project requires the installed Epic Linux 5.8.4 engine")
    runtime = engine / RUNTIME
    if not runtime.is_file() or not (engine / "Engine/Build/BatchFiles/RunUAT.sh").is_file():
        raise RuntimeError("Installed Linux Shipping runtime / RunUAT.sh is missing")
    subprocess.run(["node", str(ROOT / "tools/unreal-engine/check-import.mjs")], cwd=ROOT, check=True)
    export = ROOT / "unreal/Lunden/Import/export-manifest.json"
    import_info = json.loads(export.read_text())
    export_hash = digest(export)
    command = uat_arguments(engine, output)
    if args.plan:
        print(json.dumps({"platform": "linux-x64", "commit": commit, "command": command,
                          "importGate": "passed", "dryRun": True}, indent=2))
        return
    output.mkdir(parents=True, exist_ok=False)
    spec = importlib.util.spec_from_file_location("lunden_linux_release_runner", Path(__file__).with_name("run-linux.py"))
    runner = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = runner
    spec.loader.exec_module(runner)
    result = {"platform": "linux-x64", "commit": commit, "command": command, "passed": False}
    log = output / "BuildCookRun.log"
    try:
        # Same editor slots and descendant supervision as the development runner; the
        # publisher/Root scheduler owns permission to invoke this expensive command.
        with runner.editor_slot(f"release-linux #2422 {uuid.uuid4().hex}"), runner.cancellation_signals() as cancelled:
            env = dict(os.environ, LUNDEN_RELEASE_LOG=str(log))
            # Shell text is constant; paths and UAT arguments remain positional arguments.
            code = runner.run_process(["bash", "-c", 'exec "$@" > "$LUNDEN_RELEASE_LOG" 2>&1', "release-linux", *command],
                                      env, args.timeout, cancelled)
        result["uatExitCode"] = code
        result["logErrors"] = runner.log_errors(log.read_text(errors="replace"))
        if code or result["logErrors"]:
            raise RuntimeError("Shipping cook failed; inspect BuildCookRun.log")
        package = output / "archive/Linux"
        game = package / RUNTIME
        if not game.is_file() or not game.stat().st_size or digest(game) != digest(runtime):
            raise RuntimeError("Archive runtime differs from the installed Epic Linux Shipping runtime")
        if revision() != commit or digest(export) != export_hash:
            raise RuntimeError("Checkout/export changed while cooking")
        info = {"platform": "linux-x64", "appVersion": args.version, "contentVersion": args.content,
                "commit": commit, "engineVersion": "5.8.4", "releaseScriptBlob": subprocess.check_output(
                    ["git", "rev-parse", f"{commit}:tools/unreal-engine/release-linux.py"], cwd=ROOT, text=True).strip(),
                "runtime": {"path": RUNTIME, "sha256": digest(game)},
                "import": {"gate": "passed", "exportCommit": import_info["sourceCommit"],
                           "sourceHash": import_info["sourceHash"], "exportManifestSha256": export_hash},
                "builtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        pending = package / "build-info.json.tmp"
        pending.write_text(json.dumps(info, indent=2) + "\n")
        pending.replace(package / "build-info.json")
        result.update(passed=True, archive=str(package))
        print(package)
    except Exception as error:
        result["error"] = type(error).__name__ + ": " + str(error)
        raise
    finally:
        pending = output / "result.json.tmp"
        pending.write_text(json.dumps(result, indent=2) + "\n")
        pending.replace(output / "result.json")


if __name__ == "__main__":
    main()
