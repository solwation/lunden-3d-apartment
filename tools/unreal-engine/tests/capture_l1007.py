"""#2278: render shared reference views (unreal/Lunden/Tests/views.json) of the composed world map L_Lunden.

    UnrealEditor-Cmd.exe <uproject> -run=pythonscript "-script=<this file> <scene.json> <out dir> [view id,…]"
        -AllowCommandletRendering -RenderOffScreen -unattended -nosplash -nosound

scene.json comes from `node tools/unreal-engine/pilot-scene.mjs measurements.json scene.json` (cameras, sun angles and
room lamps converted from the web). L_Lunden has no lighting of its own yet (#2283 owns it), so this script adds the
pilot's temporary rig (sun, atmosphere, sky light with the pilot sky cubemap, room lamps) to the editor world, renders
with screenshot_level.render_view and discards the world: nothing is saved. Logs LUNDEN_L1007_CAPTURE_OK.
"""
import json
import math
import os
from pathlib import Path
import sys

import unreal as u

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from screenshot_level import render_view, spawn  # noqa: E402

MAP = "/Game/Lunden/Maps/L_Lunden"
SKY = "/Game/Lunden/Lighting/T_PilotClearSky"  # read only; the pilot's project-generated sky (owned by #2283)


def rig(scene):
    sun = spawn(u.DirectionalLight, u.Vector(0, 0, 2000))
    sun.light_component.set_mobility(u.ComponentMobility.MOVABLE)
    sun.light_component.set_editor_property("atmosphere_sun_light", True)
    spawn(u.SkyAtmosphere, u.Vector(0, 0, 0))
    sky = spawn(u.SkyLight, u.Vector(0, 0, 500))
    sky.light_component.set_mobility(u.ComponentMobility.MOVABLE)
    sky.light_component.set_editor_property("cast_shadows", False)
    cube = u.load_asset(SKY)
    sky.light_component.set_editor_property("source_type", u.SkyLightSourceType.SLS_SPECIFIED_CUBEMAP)
    sky.light_component.set_cubemap(cube)
    ambient = spawn(u.PostProcessVolume, u.Vector(0, 0, 0))
    ambient.set_editor_property("unbound", True)
    pp = ambient.settings
    pp.set_editor_property("ambient_cubemap", cube)
    ambient.settings = pp
    lamps = []
    for lamp in scene["lamps"]:
        comp = spawn(u.PointLight, u.Vector(*lamp["xyz"])).point_light_component
        comp.set_mobility(u.ComponentMobility.MOVABLE)
        comp.set_editor_property("intensity_units", u.LightUnits.CANDELAS)
        comp.set_intensity(lamp["candela"])
        comp.set_attenuation_radius(650)
        r, g, b = bytes.fromhex(lamp["color"].lstrip("#"))
        colour = u.LinearColor()
        colour.set_from_srgb(u.Color(r=r, g=g, b=b, a=255))
        comp.set_light_color(colour)
        lamps.append(comp)
    return sun, sky, ambient, lamps


def set_time(sun, sky, ambient, lamps, preset):
    """The pilot's day/evening presets (capture_pilot.py), so the pairs compare with the #2246 pilot pictures."""
    evening = preset["lampsOn"]
    sun.set_actor_rotation(u.Rotator(roll=0, pitch=preset["sunPitch"], yaw=preset["sunYaw"]), False)
    sun.light_component.set_intensity(0.25 if evening else 8.0)
    sky.light_component.set_editor_property("real_time_capture", False)
    sky.light_component.set_intensity(0.06 if evening else 0.8)
    pp = ambient.settings
    pp.set_editor_property("override_ambient_cubemap_intensity", True)
    pp.set_editor_property("ambient_cubemap_intensity", 0.015 if evening else 0.25)
    ambient.settings = pp
    for comp in lamps:
        comp.set_visibility(evening)
    sky.light_component.recapture_sky()


def main(scene_path, out_dir, ids=None):
    scene = json.loads(Path(scene_path).read_text(encoding="utf-8"))
    wanted = ids.split(",") if ids else [c["id"] for c in scene["cameras"]]
    if not u.EditorLoadingAndSavingUtils.load_map(MAP):
        raise RuntimeError(f"Cannot load {MAP}: run compose_world.py first")
    world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
    actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
    excluded = [a for a in actors if "kind:collision" in [str(t) for t in a.tags]]
    sun, sky, ambient, lamps = rig(scene)
    u.SystemLibrary.execute_console_command(world, "r.Shadow.Virtual.Enable 0")
    os.makedirs(out_dir, exist_ok=True)
    observed = []
    for cam in [c for c in scene["cameras"] if c["id"] in wanted]:
        preset = scene["lighting"][cam["lighting"]]
        set_time(sun, sky, ambient, lamps, preset)
        obs = render_view(world, out_dir, cam["id"], u.Vector(*cam["xyz"]),
                          u.Rotator(roll=0, pitch=cam["pitch"], yaw=cam["yaw"]), scene["width"], scene["height"],
                          scene["horizontalFov"], -0.7 if preset["lampsOn"] else 0, excluded, lumen=True)
        if math.dist(obs["xyz"], cam["xyz"]) > 0.01 or any(abs(obs[k] - cam[k]) > 0.001 for k in ("pitch", "yaw")):
            raise RuntimeError("Camera transform mismatch: " + cam["id"])
        observed.append({**obs, "id": cam["id"], "lighting": cam["lighting"]})
    (Path(out_dir) / "capture.json").write_text(json.dumps({"engine": u.SystemLibrary.get_engine_version(), "map": MAP,
        "hiddenCollisionActors": len(excluded), "cameras": observed}, indent=2) + "\n")
    u.EditorLoadingAndSavingUtils.new_blank_map(False)  # discard the temporary rig
    u.log(f"LUNDEN_L1007_CAPTURE_OK {len(observed)} views")


main(*[a for a in sys.argv[1:] if a])
