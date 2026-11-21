"""#2279: render the START and courtyard views of the world map with the buildings' zones streamed in (verification).

    UnrealEditor-Cmd.exe <uproject> -run=pythonscript "-script=<this file> <scene.json> <out dir> [view id,…]"
        -AllowCommandletRendering -RenderOffScreen -unattended -nosplash -nosound

scene.json: `node tools/unreal-engine/pilot-scene.mjs measurements.json scene.json` for the cameras (the #2279 pair: the
shared `start` view and a `courtyard` view, see docs/verification/2279/). Loads L_Lunden (streaming in memory only a
#2279 zone that world-levels.json does not list), adds capture_l1007.py's temporary
light rig and renders with screenshot_level.render_view. Nothing is saved. Logs LUNDEN_EXTERIOR_CAPTURE_OK.
"""
import json
import math
import os
from pathlib import Path
import sys

import unreal as u

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from screenshot_level import render_view  # noqa: E402

MAP = "/Game/Lunden/Maps/L_Lunden"
ZONES = ["l1007-entre", "hus-l", "kvarteret"]


def run(scene_path, out_dir, ids=None):
    scene = json.loads(Path(scene_path).read_text(encoding="utf-8"))
    wanted = ids.split(",") if ids else [c["id"] for c in scene["cameras"]]
    if not u.EditorLoadingAndSavingUtils.load_map(MAP):
        raise RuntimeError(f"Cannot load {MAP}: run compose_world.py first")
    world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
    listed = {e["package"] for e in json.loads((Path(__file__).resolve().parents[1] / "world-levels.json").read_text(encoding="utf-8"))["levels"]}
    added = []
    for zone in ZONES:
        package = f"/Game/Lunden/Generated/{zone}/Level_{zone}"
        if package in listed:  # composed into L_Lunden already
            continue
        if not u.EditorLevelUtils.add_level_to_world(world, package, u.LevelStreamingAlwaysLoaded):
            raise RuntimeError(f"Cannot stream {package}: run import_world.py --zones {zone}")
        added.append(package)
    fallback = 0
    if os.environ.get("LUNDEN_CAPTURE_NANITE") != "1":
        # The capture draws a Nanite mesh's fallback here, which for the big merged façade meshes is simplified into
        # loose panels (docs/verification/2279): show the full meshes instead, in memory only (never saved).
        for zone in ZONES:
            for path in u.EditorAssetLibrary.list_assets(f"/Game/Lunden/Generated/{zone}/StaticMeshes", recursive=True, include_folder=False):
                mesh = u.EditorAssetLibrary.load_asset(path)
                settings = mesh.get_editor_property("nanite_settings") if isinstance(mesh, u.StaticMesh) else None
                if settings and settings.get_editor_property("enabled"):
                    settings.set_editor_property("enabled", False)
                    mesh.set_editor_property("nanite_settings", settings)
                    fallback += 1
    actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
    excluded = [a for a in actors if "kind:collision" in [str(t) for t in a.tags]]
    sun, sky, ambient, lamps = RIG.rig(scene)
    u.SystemLibrary.execute_console_command(world, "r.Shadow.Virtual.Enable 0")
    os.makedirs(out_dir, exist_ok=True)
    observed = []
    for cam in [c for c in scene["cameras"] if c["id"] in wanted]:
        preset = scene["lighting"][cam["lighting"]]
        RIG.set_time(sun, sky, ambient, lamps, preset)
        obs = render_view(world, out_dir, cam["id"], u.Vector(*cam["xyz"]),
                          u.Rotator(roll=0, pitch=cam["pitch"], yaw=cam["yaw"]), scene["width"], scene["height"],
                          scene["horizontalFov"], -0.7 if preset["lampsOn"] else 0, excluded, lumen=True)
        if math.dist(obs["xyz"], cam["xyz"]) > 0.01 or any(abs(obs[k] - cam[k]) > 0.001 for k in ("pitch", "yaw")):
            raise RuntimeError("Camera transform mismatch: " + cam["id"])
        observed.append({**obs, "id": cam["id"], "lighting": cam["lighting"]})
    (Path(out_dir) / "capture.json").write_text(json.dumps({"engine": u.SystemLibrary.get_engine_version(), "map": MAP,
        "streamedInMemory": added, "naniteOffInMemory": fallback, "hiddenCollisionActors": len(excluded), "cameras": observed}, indent=2) + "\n")
    u.EditorLoadingAndSavingUtils.new_blank_map(False)  # discard the temporary levels and rig
    u.log(f"LUNDEN_EXTERIOR_CAPTURE_OK {len(observed)} views")


class _Rig:
    """capture_l1007.py's rig() and set_time(), loaded without running its main()."""
    def __init__(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("capture_l1007_rig", Path(__file__).resolve().parent / "capture_l1007.py")
        source = spec.loader.get_source("capture_l1007_rig").replace("\nmain(*[a for a in sys.argv[1:] if a])", "\n")
        namespace = {"__file__": str(Path(__file__).resolve().parent / "capture_l1007.py"), "__name__": "capture_l1007_rig"}
        exec(compile(source, "capture_l1007.py", "exec"), namespace)
        self.rig, self.set_time = namespace["rig"], namespace["set_time"]


RIG = _Rig()
run(*[a for a in sys.argv[1:] if a])
