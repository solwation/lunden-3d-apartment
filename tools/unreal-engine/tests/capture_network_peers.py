"""#2292: offscreen image of the two real browser peers in the running three-client PIE test.

Imported by test_network_live.py when LUNDEN_TEST_UE_CAPTURE is set. setup() adds only lights
and cameras to its temporary unsaved map. capture() observes the production peers connected to
the local Worker, without spawning, posing, renaming or editing them. The capture needs a GPU.

In the isolated Windows checkout with the production player/network assets built and the local
Worker, Playwright, Chromium and three available, set LUNDEN_TEST_UE_EDITOR to the full
UnrealEditor-Cmd.exe path and LUNDEN_TEST_UE_CAPTURE to a new absolute PNG path outside
Content and the temporary room. From the repository root run:

    dotnet test unreal/Launcher.Tests/Lunden.Launcher.Tests.csproj --filter FullyQualifiedName~LauncherAndWebPeerExchangeMovementAndResumeOneIdentityOnLocalWorker

This starts one three-client run with -RenderOffScreen. Omitting the capture variable keeps
the ordinary -nullrhi test. No second editor or saved test map is needed.
"""
import math
import os
from pathlib import Path
import struct
import tempfile
import zlib

import unreal as u

PEER = "/Game/Lunden/Network/BP_LundenPeer.BP_LundenPeer_C"
AVATAR = "/Game/Lunden/Avatar/Rig/BP_LundenAvatar.BP_LundenAvatar_C"
CAPTURE_TAG = "network-live-capture"
VIEW_TAG = "network-live-view"
WIDTH, HEIGHT, FOV = 1280, 720, 55.0


def setup(actors):
    """Call on the live test's blank editor map before BeginPlay so PIE duplicates these actors."""
    sun = actors.spawn_actor_from_class(u.DirectionalLight, u.Vector(0, 0, 500), u.Rotator(roll=0, pitch=-38, yaw=72))
    sun.light_component.set_editor_property("atmosphere_sun_light", True)
    actors.spawn_actor_from_class(u.SkyAtmosphere, u.Vector(0, 0, 0))
    sky = actors.spawn_actor_from_class(u.SkyLight, u.Vector(0, 0, 300))
    sky.light_component.set_editor_property("real_time_capture", True)
    capture_actor = actors.spawn_actor_from_class(u.SceneCapture2D, u.Vector(0, 0, 0))
    capture_actor.tags = [u.Name(CAPTURE_TAG)]
    capture_actor.capture_component2d.set_editor_property("capture_every_frame", False)
    capture_actor.capture_component2d.set_editor_property("capture_on_movement", False)
    view = actors.spawn_actor_from_class(u.CameraActor, u.Vector(0, 0, 0))
    view.tags = [u.Name(VIEW_TAG)]


def verified_figures(game, expected):
    if len(expected) != 2 or {name for name, _, _ in expected} != {"Dator", "Telefon"}:
        raise RuntimeError("The capture requires the two named synthetic browser profiles in the local room")
    peers = u.GameplayStatics.get_all_actors_of_class(game, u.load_class(None, PEER))
    if len(peers) != 2:
        raise RuntimeError(f"Expected two live network peers, got {len(peers)}")
    figures = []
    ids = set()
    for name, position, yaw in sorted(expected):
        matches = [p for p in peers if p.get_editor_property("DisplayName") == name]
        if len(matches) != 1:
            raise RuntimeError(f"Expected one live {name} actor")
        peer = matches[0]
        loc, angle = peer.get_actor_location(), peer.get_actor_rotation().yaw
        if not (math.dist(loc.to_tuple(), position) <= 5 and abs(math.remainder(angle - yaw, 360)) <= 1):
            raise RuntimeError(f"{name} is outside the live test's 5 cm / 1 degree tolerance")
        key = str(peer.get_editor_property("PeerId"))
        if not key or key in ids or peer.get_editor_property("Away"):
            raise RuntimeError(f"{name} has no distinct active peer identity")
        ids.add(key)
        label = peer.get_editor_property("NameTag")
        if str(label.get_editor_property("text")) != name or not label.is_visible() or label.get_editor_property("hidden_in_game"):
            raise RuntimeError(f"{name} has no visible live name tag")
        avatar = peer.get_editor_property("Figure").get_editor_property("child_actor")
        if not avatar or avatar.get_class().get_path_name() != AVATAR:
            raise RuntimeError(f"{name} has no production BP_LundenAvatar")
        meshes = avatar.get_components_by_class(u.SkeletalMeshComponent)
        if not any(m.get_editor_property("skeletal_mesh_asset") and m.is_visible()
                   and not m.get_editor_property("hidden_in_game") for m in meshes):
            raise RuntimeError(f"{name} has no visible skeletal mesh")
        figures.append((name, loc.to_tuple(), avatar))
    return figures


def framing(feet):
    """Level camera facing the line between both figures, with margin for their full height and names."""
    a, b = feet
    dx, dy = b[0] - a[0], b[1] - a[1]
    separation = math.hypot(dx, dy)
    if separation < 100:
        raise RuntimeError("The movement stage must separate the two figures for a readable image")
    right = (dx / separation, dy / separation)
    forward = (right[1], -right[0])
    tan_half = math.tan(math.radians(FOV / 2))
    distance = max((separation / 2 + 75) / tan_half, (130 + abs(a[2] - b[2]) / 2) * WIDTH / HEIGHT / tan_half)
    camera = ((a[0] + b[0]) / 2 - forward[0] * distance, (a[1] + b[1]) / 2 - forward[1] * distance,
              (a[2] + b[2]) / 2 + 105)
    yaw = math.degrees(math.atan2(forward[1], forward[0]))
    # Probe a patch of each torso. Perspective scale is identical horizontally and vertically in pixels.
    probes = []
    focal = WIDTH / (2 * tan_half)
    for point in feet:
        dx, dy = point[0] - camera[0], point[1] - camera[1]
        scale = focal / (dx * forward[0] + dy * forward[1])
        center_x = WIDTH / 2 + (dx * right[0] + dy * right[1]) * scale
        probes.append([(round(center_x + offset * scale), round(HEIGHT / 2 - (point[2] + z - camera[2]) * scale))
                       for z in (70, 95, 120, 140) for offset in (-9, 0, 9)])
    return camera, yaw, probes


def colors(game, target, coords):
    result = []
    for x, y in coords:
        pixel = u.RenderingLibrary.read_render_target_pixel(game, target, x, y)
        result.append((pixel.r, pixel.g, pixel.b))
    return result


def png_length(data):
    """Validate the rendered PNG and find its end. Some UE 5.8 captures have trailing buffer bytes."""
    if (data[:16] != b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR" or len(data) < 45
            or struct.unpack_from(">II", data, 16) != (WIDTH, HEIGHT)):
        raise RuntimeError("Unreal did not export a 1280 × 720 PNG")
    offset = 8
    has_pixels = False
    while offset + 12 <= len(data):
        length, kind = struct.unpack_from(">I4s", data, offset)
        end = offset + 12 + length
        if end > len(data) or zlib.crc32(data[offset + 4:end - 4]) != struct.unpack_from(">I", data, end - 4)[0]:
            raise RuntimeError("Unreal exported an incomplete or corrupt PNG chunk")
        if kind == b"IDAT" and length:
            has_pixels = True
        if kind == b"IEND" and length == 0 and has_pixels:
            return end
        offset = end
    raise RuntimeError("Unreal PNG is missing image data or its end marker")


def capture(game, controller, expected, output):
    """Yield from this once while the browser helper keeps both peers at their final positions."""
    output = Path(output)
    if not output.is_absolute() or output.suffix.lower() != ".png":
        raise ValueError("LUNDEN_TEST_UE_CAPTURE must name an absolute PNG path")
    content = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_content_dir())).resolve()
    if output.resolve().is_relative_to(content) or output.exists():
        raise ValueError("Choose a new evidence file outside the project's Content directory")
    output.parent.mkdir(parents=True, exist_ok=True)
    figures = verified_figures(game, expected)
    camera, yaw, probes = framing([feet for _, feet, _ in figures])
    view, = u.GameplayStatics.get_all_actors_with_tag(game, VIEW_TAG)
    capture_actor, = u.GameplayStatics.get_all_actors_with_tag(game, CAPTURE_TAG)
    rot = u.Rotator(roll=0, pitch=0, yaw=yaw)
    for actor in (view, capture_actor):
        actor.set_actor_location_and_rotation(u.Vector(*camera), rot, False, True)
    comp = capture_actor.capture_component2d
    target = u.RenderingLibrary.create_render_target2d(game, WIDTH, HEIGHT, u.TextureRenderTargetFormat.RTF_RGBA8_SRGB)
    if not target:
        raise RuntimeError("The GPU render target could not be created; use -RenderOffScreen")
    comp.set_editor_property("texture_target", target)
    comp.set_editor_property("capture_source", u.SceneCaptureSource.SCS_FINAL_TONE_CURVE_HDR)
    comp.set_editor_property("fov_angle", FOV)
    pp = comp.get_editor_property("post_process_settings")
    for key, value in (("override_auto_exposure_method", True), ("auto_exposure_method", u.AutoExposureMethod.AEM_MANUAL),
                       ("override_auto_exposure_apply_physical_camera_exposure", True), ("auto_exposure_apply_physical_camera_exposure", False),
                       ("override_auto_exposure_bias", True), ("auto_exposure_bias", 0.5)):
        pp.set_editor_property(key, value)
    comp.set_editor_property("post_process_settings", pp)
    comp.set_editor_property("post_process_blend_weight", 1.0)
    original = controller.get_view_target()
    try:
        # The real NameTags already face the local player's camera. Keep that camera at the capture point.
        controller.set_view_target_with_blend(view, 0.0)
        u.AutomationLibrary.finish_loading_before_screenshot()
        for _, _, avatar in figures:
            comp.hide_actor_components(avatar, True)
        for _ in range(3):
            comp.capture_scene()
            yield
        background = [colors(game, target, coords) for coords in probes]
        comp.clear_hidden_components()
        for _ in range(6):
            comp.capture_scene()
            yield
        current = verified_figures(game, expected)
        if any(old[2] != now[2] for old, now in zip(figures, current)):
            raise RuntimeError("The network figures changed during capture")
        for (name, _, _), before, coords in zip(current, background, probes):
            after = colors(game, target, coords)
            changed = sum(max(abs(a - b) for a, b in zip(p, q)) >= 12 for p, q in zip(before, after))
            if changed < 2:
                raise RuntimeError(f"The captured {name} skeletal mesh did not cover its projected torso")
        with tempfile.TemporaryDirectory(dir=output.parent) as scratch:
            rendered = Path(scratch) / "peers.png"
            u.RenderingLibrary.export_render_target(game, target, scratch, rendered.name)
            data = rendered.read_bytes()
            length = png_length(data)
            if length < len(data):
                with rendered.open("r+b") as stream:
                    stream.truncate(length)
            # Windows rename fails if the destination exists. POSIX link gives the same guarantee.
            if os.name == "nt":
                rendered.rename(output)
            else:
                os.link(rendered, output)
        u.log("LUNDEN_NETWORK_CAPTURE_OK Dator and Telefon visible within 5 cm and 1 degree")
    finally:
        comp.clear_hidden_components()
        if original:
            controller.set_view_target_with_blend(original, 0.0)
        comp.set_editor_property("texture_target", None)
        u.RenderingLibrary.release_render_target2d(target)
