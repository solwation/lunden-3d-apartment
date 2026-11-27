#!/usr/bin/env python3
"""#2467: opt-in Linux development runner; Windows delivery keeps its own scripts/profile.

Local settings: ~/.config/lunden-unreal/linux.json (engineRoot, dataDir, optional vulkanIcd/libraryPath).
Use `check`, `python SCRIPT [ARGS...]`, or `tests [FILTER]`. Rendering requires --render.
"""
import argparse
import contextlib
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
PROJECT = ROOT / "unreal/Lunden"
SETTINGS = Path.home() / ".config/lunden-unreal/linux.json"


def engine_version(engine):
    data = json.loads((engine / "Engine/Build/Build.version").read_text())
    return ".".join(str(data[k]) for k in ("MajorVersion", "MinorVersion", "PatchVersion"))


def low_ini():
    # Default-file override preserves the engine's base config hierarchy, including RHI arrays.
    # https://dev.epicgames.com/documentation/unreal-engine/configuration-files-in-unreal-engine
    return ((PROJECT / "Config/DefaultEngine.ini").read_text()
            + "\n" + Path(__file__).with_name("linux-low.ini").read_text())


@contextlib.contextmanager
def editor_slot(owner):
    """Share the PC-wide slots with the Windows editors; never remove somebody else's lock."""
    slots = Path.home() / ".local/state/lunden-editor-slots"
    slots.mkdir(parents=True, exist_ok=True)
    held = None
    try:
        for number in range(1, 4):
            candidate = slots / f"slot-{number}"
            try:
                candidate.mkdir()
            except FileExistsError:
                continue
            held = candidate
            (held / "owner").write_text(owner + "\n")
            powershell = Path("/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe")
            if "microsoft" in os.uname().release.lower():
                result = subprocess.run(
                    [str(powershell), "-NoProfile", "-NonInteractive", "-Command",
                     "(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory"],
                    check=True, capture_output=True, text=True, timeout=30)
                free_gib = int(result.stdout.strip()) / 1024 / 1024
                occupied = sum((slots / f"slot-{n}").exists() for n in range(1, 4))
                minimum = 10 if occupied == 3 else 6
                if free_gib < minimum:
                    raise RuntimeError(f"Windows has {free_gib:.1f} GiB free; this editor needs {minimum} GiB")
                if occupied == 3 and any(slots.glob("waiting-*")):
                    own = sum(owner.split(" #")[0] in p.read_text()
                              for p in slots.glob("slot-*/owner"))
                    if own > 2:
                        raise RuntimeError("Another orchestra is waiting; this session may hold at most two editors")
            yield
            return
        raise RuntimeError("All three PC-wide editor slots are occupied; retry after one is released")
    finally:
        if held is not None:
            (held / "owner").unlink(missing_ok=True)
            held.rmdir()


def run_process(command, env, timeout):
    process = subprocess.Popen(command, cwd=ROOT, env=env, start_new_session=True)
    try:
        return process.wait(timeout=timeout)
    finally:
        # Shader compilers belong to this invocation too. Only signal our own process group.
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        if process.poll() is None:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine-root", type=Path)
    parser.add_argument("--data-dir", type=Path)
    parser.add_argument("--render", action="store_true", help="Vulkan SM5 offscreen, 640x360, low profile")
    parser.add_argument("--vulkan-icd", type=Path, help="Override the private driver for this rendered run only")
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--owner", default="local-linux #2467")
    commands = parser.add_subparsers(dest="mode", required=True)
    commands.add_parser("check")
    python = commands.add_parser("python")
    python.add_argument("script", type=Path)
    python.add_argument("args", nargs=argparse.REMAINDER)
    tests = commands.add_parser("tests")
    tests.add_argument("filter", nargs="?", default="Editor.Python.Lunden.test_fixture_material")
    args = parser.parse_args(argv)
    settings = json.loads(SETTINGS.read_text()) if SETTINGS.exists() else {}
    engine = args.engine_root or Path(os.environ.get("LUNDEN_UNREAL_LINUX_ROOT", settings.get("engineRoot", "/nonexistent")))
    data = args.data_dir or Path(settings.get("dataDir", str(PROJECT / "Saved/LinuxDev")))
    engine, data = engine.expanduser().resolve(), data.expanduser().resolve()
    locked = (PROJECT / "ENGINE_VERSION").read_text().strip()
    editor = engine / "Engine/Binaries/Linux/UnrealEditor-Cmd"
    if not editor.is_file():
        editor = engine / "Engine/Binaries/Linux/UnrealEditor"
    if not editor.is_file():
        print(f"ERROR: Linux editor missing: {editor}", file=sys.stderr)
        return 2
    actual = engine_version(engine)
    if actual != locked:
        print(f"ERROR: Engine {actual}; project requires {locked}", file=sys.stderr)
        return 3
    print(f"Engine {actual}; project {PROJECT}; data {data}")
    if args.mode == "check":
        return 0
    if args.timeout < 1:
        parser.error("--timeout must be positive")
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%f") + f"-{os.getpid()}"
    run = data / "runs" / stamp
    run.mkdir(parents=True)
    ini = run / "LowEngine.ini"
    ini.write_text(low_ini())
    log = run / "editor.log"
    command = [str(editor), str(PROJECT / "Lunden.uproject"), f"-DefEngineIni={ini}",
               "-unattended", "-nosplash", "-nosound", "-nop4", "-stdout", "-FullStdOutLogOutput",
               "-NoCrashDialog", f"-abslog={log}"]
    command += (["-vulkan", "-sm5", "-AllowCommandletRendering", "-RenderOffscreen", "-ResX=640", "-ResY=360", "-windowed"]
                if args.render else ["-nullrhi"])
    if args.mode == "python":
        script = args.script.resolve()
        if not script.is_file():
            raise RuntimeError(f"Python script missing: {script}")
        command += ["-run=pythonscript", "-script=" + shlex.join([str(script), *args.args])]
    else:
        command += ["-EnablePlugins=PythonAutomationTest", f"-ExecCmds=Automation RunTests {args.filter}; Quit",
                    "-TestExit=Automation Test Queue Empty", f"-ReportExportPath={run / 'automation'}"]
    env = os.environ.copy()
    env["UE-LocalDataCachePath"] = str(data / "DerivedDataCache")
    env["UE-ZenDataPath"] = str(data / "Zen")
    if args.render and (args.vulkan_icd or settings.get("vulkanIcd")):
        env["VK_DRIVER_FILES"] = str(args.vulkan_icd.resolve()) if args.vulkan_icd else settings["vulkanIcd"]
    if args.render and settings.get("libraryPath"):
        env["LD_LIBRARY_PATH"] = settings["libraryPath"] + ":" + env.get("LD_LIBRARY_PATH", "")
    print(shlex.join(command), flush=True)
    start = time.monotonic()
    with editor_slot(args.owner):
        code = run_process(command, env, args.timeout)
    content = log.read_text(errors="replace") if log.is_file() else ""
    ok = code == 0 and bool(content) and not re.search(r"LogPython: Error:|Traceback \(most recent call last\)", content)
    if args.mode == "tests":
        report = run / "automation/index.json"
        result = json.loads(report.read_text()) if report.is_file() else {}
        ok = ok and result.get("succeeded", 0) + result.get("succeededWithWarnings", 0) > 0
        ok = ok and result.get("failed") == 0 and result.get("notRun") == 0
    result = {"engine": actual, "profile": "linux-low" if args.render else "nullrhi",
              "exitCode": code, "passed": bool(ok), "seconds": round(time.monotonic() - start, 2),
              "log": str(log), "command": command,
              "engineIniSha256": hashlib.sha256(ini.read_bytes()).hexdigest(),
              "vulkanIcd": env.get("VK_DRIVER_FILES") if args.render else None,
              "revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()}
    (run / "result.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
