"""Create a repeatable profiling camera in a disposable copy of the L1007 pilot."""
import json
import sys
import unreal

PILOT = "/Game/Lunden/Maps/Pilot_L1007"
SEQ_PATH = "/Game/Lunden/Tests"
with open(sys.argv[1], encoding="utf8") as scene_file:
    scene = json.load(scene_file)
world = unreal.EditorLoadingAndSavingUtils.load_map(PILOT)
if not world:
    raise RuntimeError("Cannot load the composed pilot")
if unreal.EditorAssetLibrary.does_asset_exist(SEQ_PATH + "/ProfileRoute"):
    raise RuntimeError("Generate the route in a disposable project copy with no existing ProfileRoute")
sequence = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
    "ProfileRoute", SEQ_PATH, unreal.LevelSequence, unreal.LevelSequenceFactoryNew())
sequence.set_display_rate(unreal.FrameRate(30, 1))
# The editor subsystem requires an open Sequencer; this commandlet runs without its UI.
camera = sequence.add_spawnable_from_class(unreal.CameraActor)
cut = sequence.add_track(unreal.MovieSceneCameraCutTrack).add_section()
cut.set_camera_binding_id(sequence.get_binding_id(camera))
section = camera.add_track(unreal.MovieScene3DTransformTrack).add_section()
route = scene["cameras"] + [scene["cameras"][0]]
# Equal time per segment and a seamless return to START.
step = 90
last = (len(route) - 1) * step
sequence.set_playback_end(last)
cut.set_range(0, last)
section.set_range(0, last)
channels = section.get_all_channels()
assert len(channels) >= 9
for i, pose in enumerate(route):
    values = [*pose["xyz"], 0, pose["pitch"], pose["yaw"], 1, 1, 1]
    for channel, value in zip(channels[:9], values):
        channel.add_key(unreal.FrameNumber(i * step), value, interpolation=unreal.MovieSceneKeyInterpolation.LINEAR)
actor = unreal.get_editor_subsystem(unreal.EditorActorSubsystem).spawn_actor_from_class(
    unreal.LevelSequenceActor, unreal.Vector(0, 0, 0))
actor.set_sequence(sequence)
settings = actor.get_editor_property("playback_settings")
settings.set_editor_property("auto_play", True)
settings.set_editor_property("loop_count", unreal.MovieSceneSequenceLoopCount(-1))
actor.set_editor_property("playback_settings", settings)
assert unreal.EditorAssetLibrary.save_loaded_asset(sequence)
assert unreal.EditorLoadingAndSavingUtils.save_map(world, "/Game/Lunden/Tests/ProfilePilot")
unreal.log("LUNDEN_PILOT_ROUTE_SAVED")
