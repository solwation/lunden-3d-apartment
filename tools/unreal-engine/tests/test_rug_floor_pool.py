"""#2322: composed-world copied PBR, original geometry and source fade.

Rendered near/reference/far contribution and web/native colour need their own images.
Only the private Generated stale-source regression writes assets; never save the world.
"""
import json
from pathlib import Path
import sys

import unreal as u

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from build_rug_pool import DIR, FADE, TAG, pool_uv, receiver_material

project = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
spec = json.loads((project / "Import/measurements.json").read_text(encoding="utf-8"))["furnishing"]["rugFloorPool"]
world = u.EditorLoadingAndSavingUtils.load_map("/Game/Lunden/Maps/L_Lunden")
actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
by_tag = {str(t): a for a in actors for t in a.tags}
controls = u.GameplayStatics.get_all_actors_with_tag(world, TAG)
assert len(controls) == len(spec["receivers"])
assert all(not isinstance(a, u.StaticMeshActor) for a in controls), "legacy overlay geometry remains"
lamp = by_tag["lamp:" + spec["lamp"]]
mpc = u.load_asset("/Game/Lunden/Lighting/MPC_LundenWeather")
texture = u.load_asset(DIR + "/T_RugPoolMask")
assert not texture.get_editor_property("srgb")
saved = {key: lamp.get_editor_property(key) for key in ("K", "IsOn", "Candela", "Supply")}
power = u.MaterialLibrary.get_scalar_parameter_value(world, mpc, "PowerAvailable")
receivers = []
parameter_checks = 0

try:
    for row in spec["receivers"]:
        source = by_tag[row["mesh"]]
        comp = source.get_component_by_class(u.StaticMeshComponent)
        original = u.load_asset("/Game/Lunden/Generated/l1007/Materials/" + row["key"])
        copied = comp.get_material(0)
        assert isinstance(copied, u.MaterialInstanceConstant)
        assert copied != original and copied.get_path_name().startswith(DIR + "/Surface_")
        assert copied.get_name() == original.get_name() == row["key"]
        assert copied.get_blend_mode() == original.get_blend_mode() == u.BlendMode.BLEND_OPAQUE
        assert copied.get_base_material() != original.get_base_material()
        assert copied.get_base_material().get_path_name().startswith(DIR + "/Surface_")
        # Every effective existing parameter survives the complete copied inheritance chain.
        for kind, names in (("scalar", "get_scalar_parameter_names"), ("vector", "get_vector_parameter_names"),
                            ("texture", "get_texture_parameter_names"), ("static_switch", "get_static_switch_parameter_names")):
            getter = getattr(u.MaterialEditingLibrary, "get_material_instance_" + kind + "_parameter_value")
            for name in getattr(u.MaterialEditingLibrary, names)(original):
                assert getter(copied, name) == getter(original, name), (kind, name)
                parameter_checks += 1
        a, b = copied, original
        while isinstance(b, u.MaterialInstanceConstant):
            assert a.get_editor_property("base_property_overrides") == b.get_editor_property("base_property_overrides")
            a, b = a.get_editor_property("parent"), b.get_editor_property("parent")
        driver = by_tag[row["mesh"] + ":rug-pool"]
        assert driver in controls and driver.get_editor_property("Receiver") == source
        origin, extent = source.get_actor_bounds(False)
        assert all(abs(p[2] - (origin.z + extent.z)) < .0001 for p in row["corners"].values())
        receivers.append((comp, comp.static_mesh, source.get_actor_transform(),
                          comp.get_collision_enabled(), comp.get_editor_property("cast_shadow")))
        for key, p in spec["corners"].items():
            want = [float(v) for v in key.split(",")]
            assert max(abs(a - b) for a, b in zip(pool_uv(p, spec["corners"]), want)) < 1e-10

    # Reusing the same imported name must not retain stale PBR overrides. Exercise
    # only a private Generated source copy; imported/authored packages stay untouched.
    trial_path = DIR + "/Regression/MI_Source"
    eal, mel = u.EditorAssetLibrary, u.MaterialEditingLibrary
    if eal.does_asset_exist(trial_path):
        assert eal.delete_asset(trial_path)
    trial = eal.duplicate_asset(original.get_path_name(), trial_path)
    assert isinstance(trial, u.MaterialInstanceConstant)
    assert eal.save_loaded_asset(trial, only_if_is_dirty=False)
    first = receiver_material(trial, spec, "native-stale-source-regression")
    roughness = u.Name("RoughnessFactor")
    assert roughness in mel.get_scalar_parameter_names(trial)
    before = mel.get_material_instance_scalar_parameter_value(trial, roughness)
    after = .375 if abs(before - .375) > .01 else .625
    mel.set_material_instance_scalar_parameter_value(trial, roughness, after)
    mel.update_material_instance(trial)
    try:
        receiver_material(trial, spec, "native-stale-source-regression")
    except RuntimeError as error:
        assert "Save the source material" in str(error)
    else:
        raise AssertionError("unsaved source change was accepted against its stale disk fingerprint")
    assert eal.save_loaded_asset(trial, only_if_is_dirty=False)
    second = receiver_material(trial, spec, "native-stale-source-regression")
    assert first != second
    assert abs(mel.get_material_instance_scalar_parameter_value(second, roughness) - after) < 1e-6
    assert receiver_material(trial, spec, "native-stale-source-regression") == second

    for k, supply in ((1, 1), (.75, 1), (.25, .5), (0, 1), (1, 0)):
        lamp.set_editor_property("K", k, u.PropertyAccessChangeNotifyMode.NEVER)
        u.MaterialLibrary.set_scalar_parameter_value(world, mpc, "PowerAvailable", supply)
        for driver in controls:
            driver.call_method("UpdateRugPool")
            comp = driver.get_editor_property("Receiver").get_component_by_class(u.StaticMeshComponent)
            observed = comp.get_material(0)
            assert isinstance(observed, u.MaterialInstanceDynamic)
            assert abs(observed.get_scalar_parameter_value(FADE) - k * supply) < 1e-6
        assert lamp.get_editor_property("Candela") == saved["Candela"]
        assert lamp.get_editor_property("Supply") == saved["Supply"]
    u.MaterialLibrary.set_scalar_parameter_value(world, mpc, "PowerAvailable", 1)
    for on in (True, False, True):
        lamp.call_method("TurnOn" if on else "TurnOff")
        for driver in controls:
            driver.call_method("UpdateRugPool")
            comp = driver.get_editor_property("Receiver").get_component_by_class(u.StaticMeshComponent)
            assert abs(comp.get_material(0).get_scalar_parameter_value(FADE) - lamp.get_editor_property("K")) < 1e-6
    for comp, mesh, transform, collision, shadow in receivers:
        assert comp.static_mesh == mesh and comp.get_owner().get_actor_transform() == transform
        assert comp.get_collision_enabled() == collision and comp.get_editor_property("cast_shadow") == shadow
finally:
    u.MaterialLibrary.set_scalar_parameter_value(world, mpc, "PowerAvailable", power)
    for key, value in saved.items():
        lamp.set_editor_property(key, value, u.PropertyAccessChangeNotifyMode.NEVER)
    for driver in controls:
        driver.call_method("UpdateRugPool")
u.log(f"LUNDEN_RUG_POOL_NATIVE_OK: {len(controls)} original receivers, {parameter_checks} preserved PBR parameters, source lamp/power fades; rendered depth/colour pending")
