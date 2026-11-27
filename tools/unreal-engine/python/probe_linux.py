"""#2467: confirm the opt-in Linux quality settings inside the actual Unreal process.

run-linux.py python tools/unreal-engine/python/probe_linux.py
The renderer probe uses --render; NullRHI proves only config/loading, not rendering.
"""
import json
import platform
from pathlib import Path
import unreal as u

expected = {
    "r.DynamicGlobalIlluminationMethod": 0,
    "r.ReflectionMethod": 0,
    "r.Shadow.Virtual.Enable": 0,
    "r.Nanite": 0,
    "r.RayTracing": 0,
    "r.ShadowQuality": 0,
    "r.VolumetricFog": 0,
}
actual = {key: u.SystemLibrary.get_console_variable_int_value(key) for key in expected}
result = {"engine": u.SystemLibrary.get_engine_version(), "platform": platform.system(),
          "settings": actual, "expected": expected}
out = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_saved_dir())) / "linux-profile.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(result, indent=2) + "\n")
if platform.system() != "Linux" or actual != expected:
    raise RuntimeError(f"Linux low profile not applied: {result}")
u.log("LUNDEN_LINUX_PROFILE_OK " + json.dumps(result))
