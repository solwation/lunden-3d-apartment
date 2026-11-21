"""Build or open the persistently lit L1007 composition and capture the five shared reference views."""
import json
import math
import os
from pathlib import Path
import sys
import unreal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from screenshot_level import render_view, spawn

MAP = "/Game/Lunden/Maps/Pilot_L1007"
ZONES = ("l1007", "l1007-uteplats")
LABEL = "Lunden Pilot "
APARTMENT = "/Game/Lunden/Generated/l1007/Level_l1007"
DOORS = "/Game/Lunden/Generated/PilotDoors/Level_l1007_doors"
GAMEMODE = "/Game/Lunden/Player/BP_LundenGameMode"


def actor(cls, label, loc=(0, 0, 0)):
    a = spawn(cls, unreal.Vector(*loc))
    a.set_actor_label(LABEL + label)
    return a


def sky_cube():
    # Project-generated, cloudless diffuse environment. Sun and atmosphere remain dynamic.
    # Sky colours are the web daycycle.js daylight horizon and zenith in linear RGB.
    asset = "/Game/Lunden/Lighting/T_PilotClearSky"
    existing = unreal.load_asset(asset) if unreal.EditorAssetLibrary.does_asset_exist(asset) else None
    if existing:
        return existing
    hdr = Path(unreal.Paths.project_intermediate_dir()) / "T_PilotClearSky.hdr"
    horizon, zenith, ground = (0.624, 0.745, 0.839), (0.078, 0.275, 0.631), (0.18, 0.165, 0.15)
    with hdr.open("wb") as f:
        f.write(b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 32 +X 64\n")
        for row in range(32):
            up = math.cos(math.pi * (row + 0.5) / 32)
            end = zenith if up > 0 else ground
            rgb = [a + (b - a) * abs(up) for a, b in zip(horizon, end)]
            _, exponent = math.frexp(max(rgb))
            pixel = [int(value * 256 / 2**exponent) for value in rgb] + [exponent + 128]
            f.write(bytes((2, 2, 0, 64)))
            for value in pixel:
                f.write(bytes((128 + 64, value)))
    task = unreal.AssetImportTask()
    task.filename = str(hdr.resolve())
    task.destination_path = "/Game/Lunden/Lighting"
    task.automated = True
    task.save = True
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    cube = unreal.load_asset(asset)
    if not isinstance(cube, unreal.TextureCube):
        raise RuntimeError("Failed to import the pilot sky as a TextureCube.")
    return cube


def set_time(rig, preset):
    sun = rig["Sun"]
    sun.set_actor_rotation(unreal.Rotator(roll=0, pitch=preset["sunPitch"], yaw=preset["sunYaw"]), False)
    evening = preset["lampsOn"]
    sun.light_component.set_intensity(0.25 if evening else 8.0)
    sky = rig["Sky"].light_component
    sky.set_editor_property("real_time_capture", False)
    sky.set_intensity(0.06 if evening else 0.8)
    ambient = rig["Ambient"]
    pp = ambient.settings
    pp.set_editor_property("override_ambient_cubemap_intensity", True)
    pp.set_editor_property("ambient_cubemap_intensity", 0.015 if evening else 0.25)
    ambient.settings = pp
    for name, light in rig.items():
        if name.startswith("Lamp "):
            light.point_light_component.set_visibility(evening)
    sky.recapture_sky()


def upgrade_door_level(world):
    """Replace only the base apartment stream when the interactive derivative has been built."""
    if not unreal.EditorAssetLibrary.does_asset_exist(DOORS):
        return
    levels = {level.get_path_name().split(".")[0]: level for level in unreal.EditorLevelUtils.get_levels(world)}
    if APARTMENT not in levels:
        return
    if DOORS not in levels and not unreal.EditorLevelUtils.add_level_to_world(world, DOORS, unreal.LevelStreamingAlwaysLoaded):
        raise RuntimeError("Cannot add the derived door level")
    if not unreal.EditorLevelUtils.remove_level_from_world(levels[APARTMENT]):
        raise RuntimeError("Cannot detach the original apartment level")
    return True


def bind_player(world):
    if not unreal.EditorAssetLibrary.does_asset_exist(GAMEMODE):
        return False
    mode = unreal.load_class(None, GAMEMODE + ".BP_LundenGameMode_C")
    if not mode:
        raise RuntimeError("Cannot load the pilot GameMode class")
    settings = world.get_world_settings()
    if settings.get_editor_property("default_game_mode") == mode:
        return False
    settings.set_editor_property("default_game_mode", mode)
    return True


def level(scene):
    tools = unreal.EditorLoadingAndSavingUtils
    if unreal.EditorAssetLibrary.does_asset_exist(MAP):
        if not tools.load_map(MAP):
            raise RuntimeError("Cannot load " + MAP)
        world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
        changed = upgrade_door_level(world)
        rig = {a.get_actor_label()[len(LABEL):]: a for a in
               unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
               if a.get_actor_label().startswith(LABEL)}
        start = rig["PlayerStart"]
        position = start.get_actor_location()
        if abs(position.z - scene["spawnZ"]) > 0.01:
            position.z = scene["spawnZ"]
            start.set_actor_location(position, False, False)
            changed = True
        if (bind_player(world) or changed) and not tools.save_map(world, MAP):
            raise RuntimeError("Cannot save the pilot integration")
        return world, rig
    world = tools.new_blank_map(False)
    sun = actor(unreal.DirectionalLight, "Sun", (0, 0, 2000))
    sun.light_component.set_mobility(unreal.ComponentMobility.MOVABLE)
    sun.light_component.set_editor_property("atmosphere_sun_light", True)
    actor(unreal.SkyAtmosphere, "Atmosphere")
    sky = actor(unreal.SkyLight, "Sky", (0, 0, 500))
    sky.light_component.set_mobility(unreal.ComponentMobility.MOVABLE)
    sky.light_component.set_editor_property("real_time_capture", True)
    sky.light_component.set_editor_property("cast_shadows", False)
    cube = sky_cube()
    sky.light_component.set_editor_property("source_type", unreal.SkyLightSourceType.SLS_SPECIFIED_CUBEMAP)
    sky.light_component.set_cubemap(cube)
    ambient = actor(unreal.PostProcessVolume, "Ambient")
    ambient.set_editor_property("unbound", True)
    pp = ambient.settings
    pp.set_editor_property("ambient_cubemap", cube)
    ambient.settings = pp
    start = next(c for c in scene["cameras"] if c["id"] == "start")
    player = actor(unreal.PlayerStart, "PlayerStart")
    x, y, _ = start["xyz"]
    player.set_actor_location(unreal.Vector(x, y, scene["spawnZ"]), False, False)
    player.set_actor_rotation(unreal.Rotator(roll=0, pitch=0, yaw=start["yaw"]), False)
    rig = {"Sun": sun, "Sky": sky, "Ambient": ambient}
    for lamp in scene["lamps"]:
        name = f"Lamp {lamp['id']} {lamp['room']}"
        light = actor(unreal.PointLight, name, lamp["xyz"])
        comp = light.point_light_component
        comp.set_mobility(unreal.ComponentMobility.MOVABLE)
        comp.set_editor_property("intensity_units", unreal.LightUnits.CANDELAS)
        comp.set_intensity(lamp["candela"])
        comp.set_attenuation_radius(650)
        r, g, b = bytes.fromhex(lamp["color"].lstrip("#"))
        color = unreal.Color(r=r, g=g, b=b, a=255)
        linear = unreal.LinearColor()
        linear.set_from_srgb(color)
        comp.set_light_color(linear)
        rig[name] = light
    for zone in ZONES:
        package = f"/Game/Lunden/Generated/{zone}/Level_{zone}"
        if zone == "l1007" and unreal.EditorAssetLibrary.does_asset_exist(DOORS):
            package = DOORS
        if not unreal.EditorLevelUtils.add_level_to_world(world, package, unreal.LevelStreamingAlwaysLoaded):
            raise RuntimeError("Missing imported zone " + package)
    bind_player(world)
    set_time(rig, scene["lighting"]["day"])
    if not tools.save_map(world, MAP):
        raise RuntimeError("Cannot save " + MAP)
    return world, rig


def main(config, output=None):
    with open(config, encoding="utf8") as f:
        scene = json.load(f)
    world, rig = level(scene)
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
    excluded = [a for a in actors if "kind:collision" in [str(t) for t in a.tags]]
    counts = {z: sum("zone:" + z in [str(t) for t in a.tags] for a in actors) for z in ZONES}
    if not all(counts.values()):
        raise RuntimeError(f"Both imported zones must be visible: {counts}")
    if output is None:
        unreal.log("LUNDEN_PILOT_MAP_OK")
        return
    out = Path(output)
    out.mkdir(parents=True, exist_ok=True)
    # Commandlet stills use conventional shadows; the authored level retains the project's VSM/Lumen settings.
    unreal.SystemLibrary.execute_console_command(world, "r.Shadow.Virtual.Enable 0")
    observed = []
    for mode, preset in scene["lighting"].items():
        set_time(rig, preset)
        for cam in [c for c in scene["cameras"] if c["lighting"] == mode]:
            pos = unreal.Vector(*cam["xyz"])
            rot = unreal.Rotator(roll=0, pitch=cam["pitch"], yaw=cam["yaw"])
            obs = render_view(world, str(out), cam["id"], pos, rot, scene["width"], scene["height"],
                              scene["horizontalFov"], -0.7 if preset["lampsOn"] else 0, excluded, lumen=True)
            if math.dist(obs["xyz"], cam["xyz"]) > 0.01 or any(abs(obs[k]-cam[k]) > 0.001 for k in ("pitch", "yaw")):
                raise RuntimeError("Camera transform mismatch: " + cam["id"])
            vfov = math.degrees(2 * math.atan(math.tan(math.radians(obs["horizontalFov"] / 2)) * obs["height"] / obs["width"]))
            if abs(obs["roll"]) > 0.001 or abs(vfov-scene["verticalFov"]) > 0.001 or [obs["width"],obs["height"]] != [scene["width"],scene["height"]]:
                raise RuntimeError("Projection mismatch: " + cam["id"])
            observed.append({**obs, "id": cam["id"], "verticalFov": vfov, "lighting": mode})
    (out / "capture.json").write_text(json.dumps({"engine": unreal.SystemLibrary.get_engine_version(), "map": MAP,
        "taggedActors": counts, "hiddenCollisionActors": len(excluded), "lighting": scene["lighting"], "cameras": observed}, indent=2) + "\n")
    unreal.log("LUNDEN_PILOT_CAPTURE_OK")


if __name__ == "__main__":
    main(*sys.argv[1:])
