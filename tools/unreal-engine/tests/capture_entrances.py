"""#2314: result pictures of the doors outside L1007 opened through their interactables, on the composed L_Lunden with
its own lighting sub-level (#2283; no temporary sun): the entrance of Hus A from the courtyard, the garage door from the
drive and Hus L's stairwell door from the portik (editor world, nothing saved; Nanite off in memory as capture_lighting).

    UnrealEditor-Cmd.exe <uproject> -run=pythonscript "-script=<this file> <out dir>"
        -AllowCommandletRendering -RenderOffScreen -unattended -nosplash -nosound
Writes <out dir>/<view>.png and capture.json; logs LUNDEN_ENTRANCES_CAPTURE_OK.
"""
import json
import os
from pathlib import Path
import sys

import unreal as u

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from prepare_nanite_materials import static_mesh_editor  # noqa: E402
from screenshot_level import render_view  # noqa: E402

MAP = "/Game/Lunden/Maps/L_Lunden"
# view: (door ids opened, camera cm, pitch, yaw, horizontal fov)
VIEWS = {"unreal-hus-a-entrance-open": (["door_husa_l0_x222_z3090"], (30, 2640, 165), -6, 66, 70),
         "unreal-garage-door-open": (["door_garage_l0_xm7050_z4400"], (-7720, 4400, -150), 2, 0, 70),
         "unreal-hus-l-stairwell-door-open": (["door_husl_l0_xm1612_z948"], (-1380, 900, 165), -4, 180, 70)}


def main(out_dir):
    if not u.EditorLoadingAndSavingUtils.load_map(MAP):
        raise RuntimeError(f"Cannot load {MAP}: run compose_world.py first")
    world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
    for path in u.EditorAssetLibrary.list_assets("/Game/Lunden/Generated", recursive=True, include_folder=False):
        if "/StaticMeshes/" not in path:
            continue
        mesh = u.EditorAssetLibrary.load_asset(path)
        settings = mesh.get_editor_property("nanite_settings") if isinstance(mesh, u.StaticMesh) else None
        if settings and settings.get_editor_property("enabled"):
            settings.set_editor_property("enabled", False)
            static_mesh_editor().set_nanite_settings(mesh, settings, True)
    actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
    excluded = [a for a in actors if isinstance(a, u.TriggerBox) or "kind:collision" in [str(t) for t in a.tags]]
    by_tag = {str(t): a for a in actors for t in a.tags if str(t).startswith("interact:")}
    skies = [a for a in actors if "lunden:sky" in [str(t) for t in a.tags]]
    if len(skies) != 1:
        raise RuntimeError(f"L_Lunden has {len(skies)} skies: run build_lighting.py and compose_world.py")
    sky = skies[0]
    for k, v in (("UseClock", False), ("TimeScale", 0.0), ("Year", 2026), ("Month", 6), ("Day", 21), ("Hour", 14.0),
                 ("Rain", 0.0), ("Snow", 0.0), ("Wet", 0.0)):
        sky.set_editor_property(k, v, u.PropertyAccessChangeNotifyMode.NEVER)
    sky.call_method("UpdateSky")
    skylight = sky.get_component_by_class(u.SkyLightComponent)
    skylight.set_editor_property("real_time_capture", False, u.PropertyAccessChangeNotifyMode.NEVER)
    skylight.recapture_sky()
    u.SystemLibrary.execute_console_command(world, "r.Shadow.Virtual.Enable 0")
    os.makedirs(out_dir, exist_ok=True)
    shots = []
    for name, (ids, xyz, pitch, yaw, fov) in VIEWS.items():
        for i in ids:
            a = by_tag["interact:" + i]
            a.set_actor_location_and_rotation(a.get_editor_property("OpenLocation"), a.get_editor_property("OpenRotation"), False, True)
        obs = render_view(world, out_dir, name, u.Vector(*xyz), u.Rotator(roll=0, pitch=pitch, yaw=yaw), 1280, 720, fov, 0.0,
                          excluded, lumen=True)
        shots.append({**obs, "name": name, "opened": ids})
    (Path(out_dir) / "capture.json").write_text(json.dumps({"engine": u.SystemLibrary.get_engine_version(), "map": MAP,
                                                             "date": "2026-06-21 14:00", "shots": shots}, indent=2) + "\n")
    u.EditorLoadingAndSavingUtils.new_blank_map(False)  # discard every in-memory change
    u.log(f"LUNDEN_ENTRANCES_CAPTURE_OK {len(shots)} views")


main(*[a for a in sys.argv[1:] if a])
