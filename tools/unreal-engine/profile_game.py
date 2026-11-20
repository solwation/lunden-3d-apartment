"""Run the packaged Development pilot through the four #2246 Windows performance profiles."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

from profile_report import summarize

GROUPS = ("ViewDistance", "AntiAliasing", "Shadow", "GlobalIllumination", "Reflection",
          "PostProcess", "Texture", "Effects", "Foliage", "Shading", "Landscape")
CHECKS = ("r.DynamicGlobalIlluminationMethod", "r.ReflectionMethod", "r.Lumen.DiffuseIndirect.Allow",
          "r.Lumen.Reflections.Allow", "r.Shadow.Virtual.Enable")


def measure(archive, root, width, height, quality, frames):
    preset = {2: "High", 3: "Epic"}[quality]
    directory = Path(tempfile.mkdtemp(dir=root, prefix=f"{width}x{height}-{preset}-"))
    log = directory / "game.log"
    commands = [f"sg.{group}Quality {quality}" for group in GROUPS]
    commands += ["r.ScreenPercentage 100", "r.DynamicRes.OperationMode 0", "r.VSync 0", "t.MaxFPS 0", *CHECKS]
    exe = archive / "Engine/Binaries/Win64/UnrealGame.exe"
    args = [str(exe), r"..\..\..\Lunden\Lunden.uproject", "/Game/Lunden/Tests/ProfilePilot",
            "-d3d12", "-RenderOffscreen", "-ForceRes", f"-ResX={width}", f"-ResY={height}",
            "-unattended", "-nosplash", "-nosound", "-novsync", "-NoScreenMessages",
            f"-UserDir={directory.resolve()}", f"-abslog={log.resolve()}",
            "-csvGpuStats", "-csvNoProcessingThread", "-csvCompression=0", f"-csvCaptureFrames={frames}", "-ExitAfterCsvProfiling",
            "-ExecCmds=" + ",".join(commands)]
    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = subprocess.SW_HIDE
    with (directory / "console.log").open("w") as output:
        result = subprocess.run(args, cwd=archive, stdout=output, stderr=subprocess.STDOUT,
                                startupinfo=startup, creationflags=subprocess.CREATE_NO_WINDOW, check=True)
    log_text = log.read_text(encoding="utf-8-sig", errors="replace")
    if "Capture Ended. Writing CSV" not in log_text or "CsvProfiler.ExitAfterCsvProfiling" not in log_text:
        raise RuntimeError(f"Incomplete capture (process exit {result.returncode}): {log}")
    expected = dict.fromkeys(CHECKS, 1)
    expected.update({f"sg.{group}Quality": quality for group in GROUPS})
    expected.update({"r.ScreenPercentage": 100, "r.DynamicRes.OperationMode": 0, "r.VSync": 0})
    for cvar, value in expected.items():
        if f'{cvar} = "{value}"' not in log_text:
            raise ValueError(f"Missing setting {cvar}={value} in {log}")
    if 'CSVEvent "ProfileRoute"' not in log_text:
        raise ValueError(f"Camera sequence did not start in {log}")
    files = list(directory.glob("Saved/Profiling/CSV/*.csv"))
    if len(files) != 1:
        raise ValueError(f"Expected one completed profile in {directory}")
    report = summarize(files[0])
    if (report["width"], report["height"], report["configuration"]) != (width, height, "Development"):
        raise ValueError(f"Unexpected viewport or build in {directory}")
    report["preset"] = preset
    report["processExit"] = result.returncode
    (directory / "result.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="packaged Windows directory")
    parser.add_argument("output", type=Path)
    parser.add_argument("--frames", type=int, default=6600)
    args = parser.parse_args()
    if os.name != "nt":
        parser.error("Use Windows Python to launch the game without a console window")
    args.output.mkdir(parents=True, exist_ok=True)
    results = []
    for width, height in ((1920, 1080), (2560, 1440)):
        for quality in (2, 3):
            result = measure(args.archive.resolve(), args.output, width, height, quality, args.frames)
            results.append(result)
            print(json.dumps(result), flush=True)
    (args.output / "results.json").write_text(json.dumps(results, indent=2) + "\n")


if __name__ == "__main__":
    main()
