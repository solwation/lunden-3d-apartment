"""Lunden (#2245): headless screenshots of an imported zone level (verification pictures, nothing is saved in Content).

Loads /Game/Lunden/Generated/<zone>/Level_<zone>, adds temporary light (sun, sky light, atmosphere; the generated levels
have none: lighting is #2246) and renders views with a SceneCapture2D into PNG files. Needs a GPU, so run the
commandlet WITHOUT -nullrhi (run-python.ps1 always passes -nullrhi):
    UnrealEditor-Cmd.exe <uproject> -run=pythonscript -script="tools/unreal-engine/python/screenshot_level.py <out dir> [zone]" -unattended -nosplash -nosound
Views are in web metres (x east, y up, z south) and converted with the target mapping (Unreal = 100 * (x, z, y)).
"""
import os
import sys

import unreal

WIDTH, HEIGHT = 1600, 900
LAMP_CANDELA = 40.0  # a room lamp of about 500 lm, so interiors are not lit by the sun alone
EXPOSURE_BIAS = {"exterior-southwest": 1.0, "cutaway-entreplan": 0.0, "interior-vardagsrum": 0.5}
# name: (camera position, look-at point, field of view, hide actors above this web height (m) or None, interior lamp)
VIEWS = {
    "exterior-southwest": ((-7.0, 9.0, 24.0), (2.9, 2.5, 6.0), 60, None, None),
    "cutaway-entreplan": ((-3.5, 11.0, 15.5), (2.9, 0.0, 6.4), 60, 2.45, (2.9, 2.2, 6.4)),
    "interior-vardagsrum": ((1.4, 1.6, 7.6), (4.5, 1.0, 12.0), 75, None, (2.9, 2.3, 10.5)),
}


def unreal_point(p):
    return unreal.Vector(100 * p[0], 100 * p[2], 100 * p[1])


def spawn(cls, location, rotation=unreal.Rotator(0, 0, 0)):
    return unreal.get_editor_subsystem(unreal.EditorActorSubsystem).spawn_actor_from_class(cls, location, rotation)


def add_light():
    sun = spawn(unreal.DirectionalLight, unreal.Vector(0, 0, 2000), unreal.Rotator(roll=0, pitch=-40, yaw=-60))
    sun.light_component.set_intensity(8.0)
    sun.light_component.set_editor_property("atmosphere_sun_light", True)
    spawn(unreal.SkyAtmosphere, unreal.Vector(0, 0, 0))
    sky = spawn(unreal.SkyLight, unreal.Vector(0, 0, 500))
    sky.light_component.set_editor_property("real_time_capture", True)
    sky.light_component.set_intensity(1.5)
    sky.light_component.set_editor_property("cast_shadows", False)  # its distance-field occlusion is blocky until built
    return sun


def capture(world, out_dir, name, view):
    pos, target, fov, cut, lamp = view
    hidden = []
    for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors():
        comp = a.get_component_by_class(unreal.StaticMeshComponent)
        if comp is None:
            continue
        # collision boxes are hidden in game only; an editor-world capture would draw them over the walls
        hide = "kind:collision" in [str(t) for t in a.tags]
        if cut is not None and not hide:
            origin, extent = a.get_actor_bounds(False)
            hide = origin.z - extent.z > 100 * cut - 1
        if hide:
            comp.set_visibility(False)
            hidden.append(a)
    light = None
    if lamp is not None:
        light = spawn(unreal.PointLight, unreal_point(lamp))
        light.point_light_component.set_intensity(LAMP_CANDELA)
        light.point_light_component.set_attenuation_radius(1500.0)
    loc, look = unreal_point(pos), unreal_point(target)
    rot = unreal.MathLibrary.find_look_at_rotation(loc, look)
    render_view(world, out_dir, name, loc, rot, WIDTH, HEIGHT, fov, EXPOSURE_BIAS[name], [])
    if light:
        light.destroy_actor()
    for a in hidden:
        a.get_component_by_class(unreal.StaticMeshComponent).set_visibility(True)
    unreal.log(f"LUNDEN_SCREENSHOT {name}: {len(hidden)} actors hidden (collision boxes{', above the cut' if cut else ''})")


def render_view(world, out_dir, name, loc, rot, width, height, fov, exposure_bias, excluded, lumen=False):
    cam = spawn(unreal.SceneCapture2D, loc, rot)
    comp = cam.capture_component2d
    rt = unreal.RenderingLibrary.create_render_target2d(world, width, height, unreal.TextureRenderTargetFormat.RTF_RGBA8_SRGB)
    for actor in excluded:
        comp.hide_actor_components(actor)
    comp.set_editor_property("texture_target", rt)
    comp.set_editor_property("capture_source", unreal.SceneCaptureSource.SCS_FINAL_TONE_CURVE_HDR)
    comp.set_editor_property("fov_angle", float(fov))
    comp.set_editor_property("capture_every_frame", False)
    comp.set_editor_property("always_persist_rendering_state", lumen)
    pp = comp.get_editor_property("post_process_settings")
    pp.set_editor_property("override_auto_exposure_method", True)
    pp.set_editor_property("auto_exposure_method", unreal.AutoExposureMethod.AEM_MANUAL)
    pp.set_editor_property("override_auto_exposure_apply_physical_camera_exposure", True)
    pp.set_editor_property("auto_exposure_apply_physical_camera_exposure", False)
    pp.set_editor_property("override_auto_exposure_bias", True)
    pp.set_editor_property("auto_exposure_bias", exposure_bias)
    # The import overview uses fast direct light; the pilot retains a Lumen view state across captures.
    pp.set_editor_property("override_dynamic_global_illumination_method", True)
    pp.set_editor_property("dynamic_global_illumination_method", unreal.DynamicGlobalIlluminationMethod.LUMEN if lumen else unreal.DynamicGlobalIlluminationMethod.NONE)
    pp.set_editor_property("override_reflection_method", True)
    pp.set_editor_property("reflection_method", unreal.ReflectionMethod.LUMEN if lumen else unreal.ReflectionMethod.NONE)
    comp.set_editor_property("post_process_settings", pp)
    comp.set_editor_property("post_process_blend_weight", 1.0)
    # meshes and material shaders compile asynchronously; a capture before they finish shows only the sky
    unreal.AutomationLibrary.finish_loading_before_screenshot()
    for _ in range(24 if lumen else 4):  # a few captures so sky light and temporal effects settle
        comp.capture_scene()
    unreal.RenderingLibrary.export_render_target(world, rt, out_dir, name + ".png")
    unreal.log(f"LUNDEN_SCREENSHOT {name}: {os.path.join(out_dir, name + '.png')}")
    observed = {"xyz": list(cam.get_actor_location().to_tuple()), "yaw": cam.get_actor_rotation().yaw,
                "pitch": cam.get_actor_rotation().pitch, "roll": cam.get_actor_rotation().roll,
                "horizontalFov": comp.fov_angle, "width": rt.size_x, "height": rt.size_y}
    cam.destroy_actor()
    return observed


def main(argv):
    out_dir = argv[0]
    zone = argv[1] if len(argv) > 1 else "l1007"
    os.makedirs(out_dir, exist_ok=True)
    if not unreal.EditorLoadingAndSavingUtils.load_map(f"/Game/Lunden/Generated/{zone}/Level_{zone}"):
        raise RuntimeError(f"no imported level for {zone}: run import_world.py first")
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    add_light()
    # virtual shadow maps allocate their pages over several frames; a few one-off captures show square shadow tiles
    unreal.SystemLibrary.execute_console_command(world, "r.Shadow.Virtual.Enable 0")
    for name, view in VIEWS.items():
        capture(world, out_dir, name, view)
    unreal.EditorLoadingAndSavingUtils.new_blank_map(False)  # discard: the temporary actors are never saved
    unreal.log("LUNDEN_SCREENSHOTS_OK")


if __name__ == "__main__":
    main([a for a in sys.argv[1:] if a])
