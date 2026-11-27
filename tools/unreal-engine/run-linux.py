#!/usr/bin/env python3
"""#2467: opt-in Linux development runner; Windows delivery keeps its own scripts/profile.

Local settings: ~/.config/lunden-unreal/linux.json (engineRoot, dataDir, optional vulkanIcd/libraryPath/allowCpuDevice).
Use `check`, `python SCRIPT [ARGS...]`, or `tests [FILTER]`. Rendering requires --render.
"""
import argparse
import contextlib
import ctypes
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
STOP_GRACE_SECONDS = 10


class RunCancelled(Exception):
    pass


@contextlib.contextmanager
def cancellation_signals():
    # Record cancellation rather than exiting between editor completion and the
    # durable result. Polling below observes it without interrupting cleanup.
    received = []
    previous = {}
    for sig in (signal.SIGTERM, signal.SIGINT):
        previous[sig] = signal.signal(sig, lambda signum, frame: received.append(signum))
    try:
        yield received
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


def engine_version(engine):
    data = json.loads((engine / "Engine/Build/Build.version").read_text())
    return ".".join(str(data[k]) for k in ("MajorVersion", "MinorVersion", "PatchVersion"))


def low_ini():
    # Default-file override preserves the engine's base config hierarchy, including RHI arrays.
    # https://dev.epicgames.com/documentation/unreal-engine/configuration-files-in-unreal-engine
    return ((PROJECT / "Config/DefaultEngine.ini").read_text()
            + "\n" + Path(__file__).with_name("linux-low.ini").read_text())


def automation_passed(report):
    # Unreal exports JSON with a UTF-8 BOM on Linux as well as Windows.
    result = json.loads(report.read_text(encoding="utf-8-sig")) if report.is_file() else {}
    return (result.get("succeeded", 0) + result.get("succeededWithWarnings", 0) > 0
            and result.get("failed") == 0 and result.get("notRun") == 0)


def write_result(run, result):
    temporary = run / "result.json.tmp"
    temporary.write_text(json.dumps(result, indent=2) + "\n")
    temporary.replace(run / "result.json")


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


def child_pids():
    return [int(pid) for pid in Path(f"/proc/self/task/{os.getpid()}/children").read_text().split()]


def owner_managed_service(pid, process):
    # Parentage alone does not imply exclusive ownership of a shared daemon.
    # Recognize the actual engine/installed executables and this editor's explicit
    # owner/sponsor contract, never a process name or a global process search.
    try:
        executable = Path(f"/proc/{pid}/exe").resolve(strict=True)
        args = Path(f"/proc/{pid}/cmdline").read_bytes().decode().split("\0")
    except (OSError, UnicodeError):
        return False
    binaries = Path(process.args[0]).resolve().parent
    if executable == (binaries / "UnrealTraceServer").resolve():
        return "fork" in args and f"--sponsor={process.pid}" in args
    zen = {binaries / "zenserver", Path.home() / ".config/Epic/UnrealEngine/Common/Zen/Install/zenserver"}
    if executable in {path.resolve() for path in zen} and "--detach" in args:
        return any(a == "--owner-pid" and b == str(process.pid) for a, b in zip(args, args[1:]))
    return False


def stop_children(process, protected=()):
    # Unreal starts shader workers in separate sessions. Adopted descendants must
    # therefore be cleaned by parentage rather than process-group membership.
    # Give the editor its normal shutdown, then allow owner/sponsor-managed
    # services to exit naturally. Never run an adopted orphan's SIGTERM handler:
    # it may forward the signal to getppid(), which now names this supervisor.
    protected = set(protected)
    if process.poll() is None:
        try:
            process.send_signal(signal.SIGTERM)
        except ProcessLookupError:
            pass
    for kill in (False, True):
        deadline = time.monotonic() + STOP_GRACE_SECONDS
        sent = set()
        while True:
            process.poll()  # Only Popen reaps the editor, preserving its exit code.
            children = set(child_pids()) - protected
            for pid in list(children):
                if owner_managed_service(pid, process):
                    protected.add(pid)
                    children.remove(pid)
                    print(f"Leaving owner/sponsor-managed service {pid} to its own lifetime", flush=True)
            if not children:
                return
            for pid in children:
                if kill and pid not in sent:
                    try:
                        os.kill(pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    sent.add(pid)
                if pid != process.pid:
                    try:
                        os.waitpid(pid, os.WNOHANG)
                    except ChildProcessError:
                        pass
            if time.monotonic() >= deadline:
                break
            time.sleep(0.02)
    raise RuntimeError("Invocation children did not exit after SIGKILL")


def run_process(command, env, timeout, cancelled=()):
    # This single-invocation CLI owns no unrelated subprocesses. Become a Linux
    # child subreaper before launch, so detached workers return to us on editor exit.
    libc = ctypes.CDLL(None, use_errno=True)
    previous = ctypes.c_int()
    if libc.prctl(37, ctypes.byref(previous), 0, 0, 0) or libc.prctl(36, 1, 0, 0, 0):
        raise OSError(ctypes.get_errno(), "Cannot supervise engine descendants")
    try:
        protected = child_pids()
        if cancelled:
            raise RunCancelled()
        process = subprocess.Popen(command, cwd=ROOT, env=env, start_new_session=True)
        try:
            deadline = time.monotonic() + timeout
            while True:
                if cancelled:
                    raise RunCancelled()
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise subprocess.TimeoutExpired(command, timeout)
                try:
                    return process.wait(timeout=min(0.1, remaining))
                except subprocess.TimeoutExpired:
                    pass
        finally:
            stop_children(process, protected)
            process.wait()
    finally:
        if libc.prctl(36, previous.value, 0, 0, 0):
            raise OSError(ctypes.get_errno(), "Cannot restore child supervision")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine-root", type=Path)
    parser.add_argument("--data-dir", type=Path)
    parser.add_argument("--render", action="store_true", help="Vulkan SM5 offscreen, 640x360, low profile")
    parser.add_argument("--vulkan-icd", type=Path, help="Override the private driver for this rendered run only")
    parser.add_argument("--allow-cpu-device", action="store_true", help="Explicitly permit a Vulkan software device (requires --render)")
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
    if args.allow_cpu_device and not args.render:
        parser.error("--allow-cpu-device requires --render")
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
               f"-LocalDataCachePath={data / 'DerivedDataCache'}",
               f"-ZenDataPath={data / 'Zen'}",
               "-unattended", "-nosplash", "-nosound", "-nop4", "-stdout", "-FullStdOutLogOutput",
               "-NoCrashDialog", f"-abslog={log}"]
    command += (["-vulkan", "-sm5", "-AllowCommandletRendering", "-RenderOffscreen", "-ResX=640", "-ResY=360", "-windowed"]
                if args.render else ["-nullrhi"])
    if args.render and (args.allow_cpu_device or settings.get("allowCpuDevice", False)):
        command.append("-AllowCPUDevices")
    if args.mode == "python":
        script = args.script.resolve()
        if not script.is_file():
            raise RuntimeError(f"Python script missing: {script}")
        command += ["-run=pythonscript", "-script=" + shlex.join([str(script), *args.args])]
    else:
        command += ["-EnablePlugins=PythonAutomationTest", f"-ExecCmds=Automation RunTests {args.filter}; Quit",
                    "-TestExit=Automation Test Queue Empty", f"-ReportExportPath={run / 'automation'}"]
    env = os.environ.copy()
    # UnixPlatformMisc translates '-' to '_' when reading environment variable names.
    env["UE_LocalDataCachePath"] = str(data / "DerivedDataCache")
    env["UE_ZenDataPath"] = str(data / "Zen")
    if args.render and (args.vulkan_icd or settings.get("vulkanIcd")):
        env["VK_DRIVER_FILES"] = str(args.vulkan_icd.resolve()) if args.vulkan_icd else settings["vulkanIcd"]
    if args.render and settings.get("libraryPath"):
        env["LD_LIBRARY_PATH"] = settings["libraryPath"] + ":" + env.get("LD_LIBRARY_PATH", "")
    print(shlex.join(command), flush=True)
    start = time.monotonic()
    result = {"engine": actual, "profile": "linux-low" if args.render else "nullrhi",
              "exitCode": None, "timedOut": False, "passed": False, "completed": False,
              "log": str(log), "command": command,
              "engineIniSha256": hashlib.sha256(ini.read_bytes()).hexdigest(),
              "vulkanIcd": env.get("VK_DRIVER_FILES") if args.render else None,
              "revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()}
    # A hard kill cannot run Python's finally blocks. Leave an explicit incomplete,
    # failed record before launching, then replace it atomically on handled exits.
    write_result(run, result)
    code, ok, timed_out, error = 1, False, False, None
    with cancellation_signals() as cancelled:
        try:
            with editor_slot(args.owner):
                code = run_process(command, env, args.timeout, cancelled=cancelled)
            content = log.read_text(errors="replace") if log.is_file() else ""
            ok = code == 0 and bool(content) and not re.search(r"LogPython: Error:|Traceback \(most recent call last\)", content)
            if args.mode == "tests":
                ok = ok and automation_passed(run / "automation/index.json")
        except subprocess.TimeoutExpired:
            code, timed_out = 124, True
        except (RunCancelled, OSError, ValueError, RuntimeError, subprocess.SubprocessError) as failure:
            error = str(failure) or type(failure).__name__
            code, ok = 1, False
        finally:
            if cancelled:
                code, ok = 128 + cancelled[0], False
            result.update(exitCode=code, timedOut=timed_out, passed=bool(ok), completed=True,
                          signal=cancelled[0] if cancelled else None, error=error,
                          seconds=round(time.monotonic() - start, 2))
            write_result(run, result)
    print(json.dumps(result, indent=2))
    return code if cancelled else (0 if ok else 1)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
