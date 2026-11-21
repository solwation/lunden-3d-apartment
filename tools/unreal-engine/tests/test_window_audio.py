"""#2320. Open and close real sashes in an isolated PIE session of L_Lunden and change the sky's wind.
Copy this script to Content/Python, then run-tests.ps1 -Filter Editor.Python.Lunden.test_window_audio
to check states and weather with -nosound.
With test_audio_render.py's silent mixer flags the same test checks live spatial components as well.
"""
import json
import math
from pathlib import Path
import sys
import time
import unreal as u

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
TOOLS = PROJECT.parents[1] / "tools/unreal-engine"
sys.path.insert(0, str(TOOLS / "tests"))
import save_isolation  # noqa: E402

m = json.loads((PROJECT / "Import/measurements.json").read_text(encoding="utf-8"))
P = json.loads((TOOLS / "audio-params.json").read_text(encoding="utf-8"))["wind"]
sashes = [s for w in m["windows"] for s in w.get("sashes", [])]
audio_cls = u.load_class(None, "/Game/Lunden/Audio/BPC_LundenAudio.BPC_LundenAudio_C")
sky_cls = u.load_class(None, "/Game/Lunden/Lighting/BP_LundenSky.BP_LundenSky_C")
silent = "-nosound" in u.SystemLibrary.get_command_line().lower().split()
if not silent and u.SystemLibrary.get_console_variable_float_value("au.LinearGainScalarForFinalOutut") != 0:
    raise RuntimeError("Use -nosound or the silent mixer settings from test_audio_render.py")
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
if not u.EditorLoadingAndSavingUtils.load_map("/Game/Lunden/Maps/L_Lunden"):
    raise RuntimeError("Compose the interaction world before running the window audio test")
saved_slot = save_isolation.isolate()
levels.editor_request_begin_play()


@u.AutomationScheduler.add_latent_command
def window_audio_test():
    try:
        end = time.monotonic() + 120
        while True:
            if time.monotonic() > end:
                raise RuntimeError("PIE did not load the player, weather and opening sashes")
            game = editor.get_game_world()
            pawn = u.GameplayStatics.get_player_character(game, 0) if game else None
            if pawn:
                sky = u.GameplayStatics.get_actor_of_class(game, sky_cls)
                actors = [u.GameplayStatics.get_all_actors_with_tag(game, "interact:" + s["id"]) for s in sashes[:2]]
                if sky and len(actors) == 2 and all(len(a) == 1 for a in actors):
                    break
            yield
        comp = pawn.get_component_by_class(audio_cls)
        ids = list(comp.get_editor_property("WindowIds"))
        assert set(ids) == {s["id"] for s in sashes}
        first, second = [a[0] for a in actors]
        a, b = (ids.index(s["id"]) for s in sashes[:2])
        pawn.set_actor_location(first.get_actor_location(), False, True)
        yield  # let the audio listener follow the teleport before opening a spatial source
        for actor in (first, second):
            actor.call_method("CloseDoor")

        def check(indices, speed):
            sky.set_editor_property("WindSpeed", speed, u.PropertyAccessChangeNotifyMode.NEVER)
            comp.call_method("UpdateBeds")
            assert comp.get_editor_property("WindSpeed") == speed
            assert set(comp.get_editor_property("OpenWindowIndices")) == set(indices)
            power = dict(P["powerCases"])[speed] * (0.7 + 0.6 * comp.get_editor_property("GustNow"))
            power = min(1.0, max(0.0, power))
            for var, key in (("WindowGain", "gain"), ("WindowLpHz", "hz")):
                lo, hi = P["sound"]["window"][key]
                assert math.isclose(comp.get_editor_property(var), lo + (hi - lo) * power, rel_tol=2e-5)
            if silent:
                return {}
            voices = list(comp.get_editor_property("WindowVoices"))
            assert {i for i, voice in enumerate(voices) if voice} == set(indices)
            for i in indices:
                voice = voices[i]
                assert voice.is_playing() and voice.sound.get_name() == "MS_LundenWindowWind"
                s = next(s for s in sashes if s["id"] == ids[i])
                mid = u.Vector(*[(x + y) / 2 for x, y in zip(s["pivot"]["unreal"], s["checkClosed"]["unreal"])])
                assert (voice.get_world_location() - mid).length() < 1
            return {i: voices[i] for i in indices}

        check([], 0.0)
        first.call_method("OpenDoor")
        before = check([a], 0.0)
        second.call_method("OpenDoor")
        both = check([a, b], 0.0)
        if not silent:
            assert before[a] == both[a] and both[a] != both[b]
        first.call_method("CloseDoor")
        after = check([b], 13.0)
        if not silent:
            assert after[b] == both[b]
        second.call_method("CloseDoor")
        check([], 13.0)
        u.log(f"LUNDEN_WINDOW_AUDIO_OK {len(ids)} real sashes, two independent openings, calm and windy, live mixer={not silent}")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
