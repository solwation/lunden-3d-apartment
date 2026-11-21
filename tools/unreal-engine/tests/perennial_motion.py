"""#2317: measure the live courtyard perennial's GPU silhouette with calm and moving air in offscreen PIE."""
import math
import time

import unreal as u

TAG = "LundenPerennialCapture"
SIZE = 128
THROTTLE = "Slate.bAllowThrottling"


def setup(editor_world):
    camera = u.get_editor_subsystem(u.EditorActorSubsystem).spawn_actor_from_class(u.SceneCapture2D, u.Vector())
    camera.tags = [u.Name(TAG)]
    camera.capture_component2d.set_editor_property("capture_every_frame", False)
    camera.capture_component2d.set_editor_property("capture_on_movement", False)
    # EditorEngine gates PIE world ticks on IsAllowingExpensiveTasks. In an offscreen editor,
    # Slate can continue scheduling this automation even when the game's clock is stationary.
    previous = u.SystemLibrary.get_console_variable_int_value(THROTTLE)
    u.SystemLibrary.execute_console_command(editor_world, f"{THROTTLE} 0")
    return previous


def restore(editor_world, previous):
    u.SystemLibrary.execute_console_command(editor_world, f"{THROTTLE} {previous}")


def play_state(world):
    pc = u.GameplayStatics.get_player_controller(world, 0)
    ui_class = u.load_class(None, "/Game/Lunden/UI/BPC_LundenUI.BPC_LundenUI_C")
    ui = pc.get_component_by_class(ui_class) if ui_class else None
    menu = ui.get_editor_property("Menu") if ui else None
    paused = u.GameplayStatics.is_game_paused(world)
    menu_open = bool(menu and menu.get_editor_property("IsOpen"))
    if paused and menu_open:
        menu.call_method("Close")
    if u.GameplayStatics.is_game_paused(world):
        raise RuntimeError(f"Perennial motion needs active PIE play, pause={paused}, menuOpen={menu_open}")
    u.log(f"LUNDEN_PERENNIAL_CLOCK pause={paused} menuOpen={menu_open} "
          f"throttling={u.SystemLibrary.get_console_variable_int_value(THROTTLE)} "
          f"dilation={u.GameplayStatics.get_global_time_dilation(world)}")


def sample_after(world, seconds):
    start = u.GameplayStatics.get_time_seconds(world)
    real_start = u.GameplayStatics.get_real_time_seconds(world)
    deadline = time.monotonic() + 30
    while u.GameplayStatics.get_time_seconds(world) - start < seconds:
        if time.monotonic() > deadline:
            delta = u.GameplayStatics.get_time_seconds(world) - start
            real_delta = u.GameplayStatics.get_real_time_seconds(world) - real_start
            raise RuntimeError(f"Perennial PIE clock advanced {delta:.3f} game / {real_delta:.3f} real seconds "
                               f"(pause={u.GameplayStatics.is_game_paused(world)}, "
                               f"dilation={u.GameplayStatics.get_global_time_dilation(world)})")
        yield


def silhouette(world, capture, target, far):
    capture.capture_scene()
    # SCS_SceneDepth writes camera-space depth in cm to red. Reading float RGBA without
    # normalisation keeps centimetres. A clear pixel is beyond the plant's bounding box.
    pixels = u.RenderingLibrary.read_render_target_raw_pixel_area(world, target, 0, 0, SIZE, SIZE, False)
    mask = {i for i, pixel in enumerate(pixels) if 0 < pixel.r < far}
    if len(pixels) != SIZE * SIZE or not SIZE < len(mask) < len(pixels) * 0.9:
        raise RuntimeError(f"Perennial depth capture has {len(mask)} plant pixels in {len(pixels)} samples")
    return mask


def measure(world, component, bounds):
    play_state(world)
    camera, = u.GameplayStatics.get_all_actors_with_tag(world, TAG)
    capture = camera.capture_component2d
    lo, hi = bounds
    centre = (hi + lo) * 0.5
    width = max(hi.x - lo.x, hi.y - lo.y, 1)
    # Camera above the first real perennial. At its top the view is 1.4 times its diameter.
    distance = max(50, 0.7 * width / math.tan(math.radians(25)))
    camera.set_actor_location_and_rotation(u.Vector(centre.x, centre.y, hi.z + distance),
                                           u.Rotator(roll=0, pitch=-90, yaw=0), False, True)
    capture.set_editor_property("fov_angle", 50)
    capture.set_editor_property("primitive_render_mode", u.SceneCapturePrimitiveRenderMode.PRM_USE_SHOW_ONLY_LIST)
    capture.show_only_component(component)
    capture.set_editor_property("capture_source", u.SceneCaptureSource.SCS_SCENE_DEPTH)
    target = u.RenderingLibrary.create_render_target2d(world, SIZE, SIZE, u.TextureRenderTargetFormat.RTF_RGBA16F)
    if not target:
        raise RuntimeError("The perennial depth capture requires an offscreen GPU")
    capture.set_editor_property("texture_target", target)
    far = distance + hi.z - lo.z + 20
    sky, = u.GameplayStatics.get_all_actors_of_class(world, u.load_class(None, "/Game/Lunden/Lighting/BP_LundenSky.BP_LundenSky_C"))
    wind = u.load_asset("/Game/Lunden/Lighting/MPC_LundenWeather")
    old_speed, old_heading = (sky.get_editor_property(k) for k in ("WindSpeed", "WindFromDeg"))
    masks = []
    try:
        sky.set_editor_property("WindFromDeg", sky.get_editor_property("PlanNorth"))
        u.AutomationLibrary.finish_loading_before_screenshot()
        for speed, count in ((0.0, 3), (13.0, 5)):
            sky.set_editor_property("WindSpeed", speed)
            sky.call_method("UpdateSky")
            frames = []
            for _ in range(count):
                yield from sample_after(world, 0.31)
                actual = [u.MaterialLibrary.get_scalar_parameter_value(world, wind, k) for k in ("WindX", "WindY")]
                if math.dist(actual, [0, speed]) > 0.01:
                    raise RuntimeError(f"The weather changed during the perennial capture: {actual}, expected [0, {speed}]")
                frames.append(silhouette(world, capture, target, far))
            masks.append(frames)
    finally:
        sky.set_editor_property("WindSpeed", old_speed)
        sky.set_editor_property("WindFromDeg", old_heading)
        sky.call_method("UpdateSky")
        capture.set_editor_property("texture_target", None)
        u.RenderingLibrary.release_render_target2d(target)

    calm, windy = masks
    def max_change(frames):
        return max(len(frame ^ earlier) for i, frame in enumerate(frames) for earlier in frames[:i])

    noise, motion = max_change(calm), max_change(windy)
    if motion <= max(12, noise * 3):
        raise RuntimeError(f"Wind changed {motion} silhouette pixels, against {noise} in calm air")
    return {"component": component.static_mesh.get_name(), "size": SIZE, "windSpeedsMps": [0, 13],
            "calmPlantPixels": [len(frame) for frame in calm], "windPlantPixels": [len(frame) for frame in windy],
            "calmChangedPixels": noise, "windChangedPixels": motion}
