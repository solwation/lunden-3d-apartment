"""#2324: observe the actual facade controller ticking in PIE on L_Lunden."""
import json
from pathlib import Path
import sys
import time

import unreal as u

project = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
sys.path.insert(0, str(project.parents[1] / "tools/unreal-engine/tests"))
import save_isolation

if not u.EditorLoadingAndSavingUtils.load_map("/Game/Lunden/Maps/L_Lunden"):
    raise RuntimeError("Cannot load the composed world")
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
saved = save_isolation.isolate()
levels.editor_request_begin_play()


@u.AutomationScheduler.add_latent_command
def facade_dusk():
    try:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            game = editor.get_game_world()
            if game:
                skies = u.GameplayStatics.get_all_actors_with_tag(game, "lunden:sky")
                controllers = u.GameplayStatics.get_all_actors_with_tag(game, "lunden:facade-controller")
                if len(skies) == len(controllers) == 1:
                    break
            yield
        else:
            raise RuntimeError("PIE did not load the sky and the facade controller")

        sky = skies[0]
        weather = u.load_asset("/Game/Lunden/Lighting/MPC_LundenWeather")
        wall = u.load_asset("/Game/Lunden/Generated/FacadeLighting/MPC_LundenFacade")
        for name, value in (("UseClock", False), ("TimeScale", 0.0), ("Year", 2026), ("Month", 11),
                            ("Day", 16), ("Rain", 0.0), ("Snow", 0.0)):
            sky.set_editor_property(name, value)

        def scalar(collection, name):
            return u.MaterialLibrary.get_scalar_parameter_value(game, collection, name)

        result = []
        for hour, supply, target in ((14.0, 1, 0), (18.25, 1, 1), (18.25, 0, 0), (18.25, 1, 1), (14.0, 1, 0)):
            sky.set_editor_property("Hour", hour)
            sky.call_method("UpdateSky")
            u.MaterialLibrary.set_scalar_parameter_value(game, weather, "PowerAvailable", supply)
            intermediate = False
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                yield
                latch, level = scalar(wall, "WallOn"), scalar(wall, "WallLevel")
                intermediate |= 0.0001 < level < 0.9999
                if latch == target and abs(level - target) < 0.0001:
                    break
            else:
                raise RuntimeError(f"At {hour}, power {supply}: WallOn {latch}, WallLevel {level}, expected {target}")
            if result and not intermediate:
                raise RuntimeError(f"No intermediate fade in PIE at {hour}, power {supply}")
            result.append({"hour": hour, "power": supply, "night": scalar(weather, "Night"),
                           "wallOn": latch, "wallLevel": level, "observedFade": intermediate})
        (project / "Saved/facade-dusk-result.json").write_text(json.dumps(result, indent=2) + "\n")
        u.log("LUNDEN_FACADE_DUSK_OK 5 real-time sky and power states with 4 visible fade transitions")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved, editor)
