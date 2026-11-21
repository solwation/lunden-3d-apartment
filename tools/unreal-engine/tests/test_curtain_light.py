"""UE 5.8.4 commandlet test for #2322. Run after sync-import, without saving the editor world."""
import json
import math
from pathlib import Path

import unreal as u

project = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
rows = json.loads((project / "Import/measurements.json").read_text(encoding="utf-8"))["furnishing"]["curtains"]
world = u.EditorLoadingAndSavingUtils.load_map("/Game/Lunden/Maps/L_Lunden")
mpc = u.load_asset("/Game/Lunden/Lighting/MPC_LundenWeather")
actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
by_tag = {str(tag): actor for actor in actors for tag in actor.tags}
controls = u.GameplayStatics.get_all_actors_with_tag(world, "lunden:curtain-light")
assert len(controls) == len(rows)
lamps = {i: by_tag["lamp:" + i] for row in rows for i in row["lamps"]}
keys = ["Daylight", "DuskLight", "PowerAvailable"]
saved = {key: u.MaterialLibrary.get_scalar_parameter_value(world, mpc, key) for key in keys}
lamp_states = {i: (l.get_editor_property("IsOn"), l.get_editor_property("hidden")) for i, l in lamps.items()}


def verify(daylight, oc, supply, enabled=(), hidden=()):
    for key, v in zip(keys, (daylight, daylight * (1 - .6 * oc), supply)):
        u.MaterialLibrary.set_scalar_parameter_value(world, mpc, key, v)
    for i, lamp in lamps.items():
        lamp.call_method("TurnOn" if i in enabled else "TurnOff")
        lamp.set_actor_hidden_in_game(i in hidden)
    for row in rows:
        lit = supply > .5 and any(i in enabled and i not in hidden for i in row["lamps"])
        want = [d * daylight * (1 - .5 * oc) + (l if lit else 0) for d, l in zip(row["daylight"], row["lamp"])]
        driver = by_tag[row["id"]]
        assert driver in controls
        driver.call_method("UpdateCurtainLight")
        for node in row["nodes"]:
            material = by_tag[node].static_mesh_component.get_material(0)
            assert isinstance(material, u.MaterialInstanceDynamic), node
            base = material.get_texture_parameter_value("BaseColorTexture")
            emissive = material.get_texture_parameter_value("EmissiveTexture")
            assert base and base == emissive and base.get_editor_property("srgb"), node
            observed = material.get_vector_parameter_value("EmissiveFactor")
            assert math.dist([observed.r, observed.g, observed.b], want) < .00001, (row["id"], node, observed, want)


try:
    verify(1, 0, 1)
    verify(.45, .8, 1)
    verify(0, 0, 1)
    # Each ceiling and small lamp independently, then hidden, and while the grid is down.
    for light_id in lamps:
        verify(0, 0, 1, {light_id})
        verify(0, 0, 1, {light_id}, {light_id})
    verify(.25, .5, .5, set(lamps))
    verify(.25, .5, .51, set(lamps))
finally:
    for key, v in saved.items():
        u.MaterialLibrary.set_scalar_parameter_value(world, mpc, key, v)
    for i, (on, hidden) in lamp_states.items():
        lamps[i].call_method("TurnOn" if on else "TurnOff")
        lamps[i].set_actor_hidden_in_game(hidden)
    for driver in controls:
        driver.call_method("UpdateCurtainLight")
u.log(f"LUNDEN_CURTAIN_LIGHT_OK {len(rows)} room controllers, {len(lamps)} individual lamp tests")
