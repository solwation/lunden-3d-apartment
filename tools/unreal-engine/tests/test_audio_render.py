"""#2287: render the footstep MetaSounds and the wind/bed loops to WAV files, silently, for a spectral comparison.

This is the one Lunden test that needs an audio device, so it is NOT run by run-tests.ps1 (which passes -nosound). It
refuses to start unless the engine's final output gain is zero, so nothing reaches the speakers: the mixer multiplies
every buffer it hands the device by au.LinearGainScalarForFinalOutut (AudioMixerCore FOutputBuffer::MixNextBuffer),
while the submix recording below is taken before that. Start the editor like run-tests.ps1 but without -nosound, with
-RenderOffScreen instead of -nullrhi (#2320: without a drawn game viewport the listener never follows the player's
camera, so the positioned window voice is heard from elsewhere) and with

    -dpcvars=au.LinearGainScalarForFinalOutut=0
    -ini:Engine:[Audio]:UnfocusedVolumeMultiplier=1.0
    -ini:EditorPerProjectUserSettings:[/Script/UnrealEd.LevelEditorMiscSettings]:bAllowBackgroundAudio=True

(the hidden editor never has the focus, and without the last two every source is rendered at volume 0).

Each step MetaSound is played three times on its own (the player's loops stopped, the player on the road at START, where the
room is 'open'), recording the main submix to Saved/audio-render/step_<profile>.wav (and _2, _3); then the wind and the bed at 9 m/s
outdoors on the grass and indoors on the parquet (wind_out.wav, wind_in.wav, bed_out.wav, bed_in.wav), the rain alone
at both places (rain_out.wav, rain_in.wav) and one open sash's wind 1 m in front of the camera on the road, dry (window.wav,
#2320: the component's own WindowSound, WindowAttenuation and Gain/LpHz, as SyncWindowVoice spawns it). The parameters
used go to render-params.json. The comparison with the web's synthesis is tests/audio-render-compare.py. Logs
LUNDEN_AUDIO_RENDER lines and LUNDEN_AUDIO_RENDER_OK.
"""
import json
from pathlib import Path
import time
import sys
import unreal as u

sys.path.insert(0, str(Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())).parents[1]
                       / "tools/unreal-engine/tests"))
import save_isolation  # noqa: E402

GAIN_CVAR = "au.LinearGainScalarForFinalOutut"
if u.SystemLibrary.get_console_variable_float_value(GAIN_CVAR) != 0.0:
    raise RuntimeError(f"{GAIN_CVAR} is not 0: refusing to play anything (start with -dpcvars={GAIN_CVAR}=0)")

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
TOOLS = PROJECT.parents[1] / "tools/unreal-engine"
WORLD = json.loads((TOOLS / "world-levels.json").read_text(encoding="utf-8"))
A = json.loads((TOOLS / "audio-params.json").read_text(encoding="utf-8"))
M = json.loads((PROJECT / "Import/measurements.json").read_text(encoding="utf-8"))
CONTROL = {c["name"]: c for c in M["spawn"]["surface"]["control"]}
OUT = PROJECT / "Saved/audio-render"
OUT.mkdir(parents=True, exist_ok=True)
DIR = "/Game/Lunden/Audio"
TAKES = 3  # plays per step profile: one take's level varies with the random variation and crackle trough

editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
actors = u.get_editor_subsystem(u.EditorActorSubsystem)
world = u.EditorLoadingAndSavingUtils.new_blank_map(False)
world.get_world_settings().set_editor_property("default_game_mode", u.load_class(None, WORLD["gameMode"]))
cube = u.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube")
road = next(c for c in CONTROL.values() if c["road"])
grass = next(c for c in CONTROL.values() if c["surface"] == "grass")
parquet = next(c for c in CONTROL.values() if c["surface"] == "wood" and c["where"] == "indoor")
for c in (road, grass, parquet):
    x, y, z = c["unreal"]
    a = actors.spawn_actor_from_class(u.StaticMeshActor, u.Vector(x, y, z - 10))
    a.static_mesh_component.set_static_mesh(cube)
    a.static_mesh_component.set_collision_profile_name("BlockAll")
    a.set_actor_scale3d(u.Vector(1.6, 1.6, 0.2))
actors.spawn_actor_from_class(u.PlayerStart, u.Vector(road["unreal"][0], road["unreal"][1], 120))
saved_slot = save_isolation.isolate()
levels.editor_request_begin_play()


def put(obj, name, value):
    obj.set_editor_property(name, value, u.PropertyAccessChangeNotifyMode.NEVER)


@u.AutomationScheduler.add_latent_command
def render():
    lib = u.AudioMixerLibrary  # UAudioMixerBlueprintLibrary (ScriptName)
    try:
        deadline = time.monotonic() + 30
        pawn = None
        while not pawn:
            if time.monotonic() > deadline:
                raise RuntimeError("PIE did not possess a pawn")
            game = editor.get_game_world()
            pawn = u.GameplayStatics.get_player_character(game, 0) if game else None
            yield
        if u.SystemLibrary.get_console_variable_float_value(GAIN_CVAR) != 0.0:
            raise RuntimeError(GAIN_CVAR + " changed")
        comp = pawn.get_component_by_class(u.load_class(None, DIR + "/BPC_LundenAudio.BPC_LundenAudio_C"))
        put(comp, "StepsOn", False)
        put(comp, "UseSky", False)
        loops = {"wind": comp.get_editor_property("WindAudio"), "bed": comp.get_editor_property("BedAudio")}
        if not all(loops.values()):
            raise RuntimeError("No audio device: the loops were not started (is -nosound set?)")
        for loop in loops.values():
            loop.stop()

        def seconds(t):
            start = u.GameplayStatics.get_time_seconds(game)
            while u.GameplayStatics.get_time_seconds(game) - start < t:
                if time.monotonic() > deadline + 300:
                    raise RuntimeError("Render timed out")
                yield

        def record(name, t, start=None):
            lib.start_recording_output(game, t + 0.5)
            if start:
                start()
            yield from seconds(t)
            lib.stop_recording_output(game, u.AudioRecordingExportType.WAV_FILE, name, str(OUT))
            yield from seconds(0.2)
            u.log(f"LUNDEN_AUDIO_RENDER wrote {name}.wav")

        def stand(c):
            x, y, z = c["unreal"]
            pawn.set_actor_location(u.Vector(x, y, z + 100), False, True)
            yield from seconds(0.6)

        yield from stand(road)
        volume = comp.get_editor_property("StepVolume")
        sounds = dict(zip((str(n) for n in comp.get_editor_property("Profiles")), comp.get_editor_property("StepSounds")))
        for profile in sorted(A["footsteps"]["profiles"]):
            sound = sounds[profile]
            for take in range(TAKES):  # each play draws its own variation and crackle trough (#2320)
                yield from record("step_" + profile + (f"_{take + 1}" if take else ""), 0.6,
                                  lambda s=sound: u.GameplayStatics.play_sound2d(game, s, volume))
        params = {"stepVolume": volume, "rain": {}, "window": {}}
        put(comp, "WindSpeed", 9.0)
        put(comp, "Hour", 8.0)
        put(comp, "Month", 6)
        for where, c in (("out", grass), ("in", parquet)):
            yield from stand(c)
            yield from seconds(1.0)  # UpdateBeds has pushed this place's parameters
            for name, loop in loops.items():
                loop.play(0.0)
                yield from seconds(1.5)
                u.log(f"LUNDEN_AUDIO_RENDER {name} {where}: playing {loop.is_playing()}")  # the MetaSound eases to its parameters (WIND_SOUND.ease / AMBIENT_BED.ease)
                yield from record(f"{name}_{where}", 2.0)
                loop.stop()
                yield from seconds(0.3)
            # A separate instance of the same bed plays only rain: its river and city gains
            # default to zero. Sample the live player's recorded weather parameters at this spot.
            put(comp, "Rain", 1.0)
            yield from seconds(0.6)
            rain = u.GameplayStatics.spawn_sound2d(game, comp.get_editor_property("BedSound"))
            params["rain"][where] = {}
            for name in ("RainGain", "RainCutoff", "Base", "BaseHz", "Roof", "Metal", "Leaf", "Water"):
                params["rain"][where][name] = comp.get_editor_property(name)
                rain.set_float_parameter(name, params["rain"][where][name])
            yield from seconds(1.5)
            yield from record(f"rain_{where}", 2.0)
            rain.stop()
            put(comp, "Rain", 0.0)
        # #2320: one open sash's voice inside the web's 1.2 m full-level distance. On the road the room is 'open', so no
        # reverb is active and the recording compares with the web's dry path (its room send depends on the room).
        yield from stand(road)
        yield from seconds(1.0)
        cam = u.GameplayStatics.get_player_camera_manager(game, 0)
        eye, ahead = cam.get_camera_location(), u.MathLibrary.get_forward_vector(cam.get_camera_rotation())
        at = u.Vector(eye.x + 100 * ahead.x, eye.y + 100 * ahead.y, eye.z + 100 * ahead.z)
        u.log(f"LUNDEN_AUDIO_RENDER camera {eye} window voice at {at}")
        params["window"] = {"Gain": comp.get_editor_property("WindowGain"), "LpHz": comp.get_editor_property("WindowLpHz"),
                            "volume": 0.6 * A["masterGain"], "distanceCm": 100.0}
        voice = u.GameplayStatics.spawn_sound_at_location(
            game, comp.get_editor_property("WindowSound"), at, volume_multiplier=params["window"]["volume"],
            attenuation_settings=comp.get_editor_property("WindowAttenuation"))
        for name in ("Gain", "LpHz"):
            voice.set_float_parameter(name, params["window"][name])
        yield from seconds(1.5)
        yield from record("window", 2.0)
        voice.stop()
        (OUT / "render-params.json").write_text(json.dumps(params, indent=1) + "\n", encoding="utf-8")
        u.log("LUNDEN_AUDIO_RENDER_OK")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
