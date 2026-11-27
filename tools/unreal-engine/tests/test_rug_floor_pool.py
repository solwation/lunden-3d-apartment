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

def legacy_receiver():
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


    def base_overrides(instance):
        """Compare explicit UE 5.8 fields; StructBase equality need not compare values."""
        data = instance.get_editor_property("base_property_overrides")
        fields = """blend_mode cast_dynamic_shadow_as_masked compatible_with_lumen_card_sharing
            dithered_lod_transition enable_displacement_fade enable_tessellation has_pixel_animation
            is_thin_surface max_world_position_offset_displacement opacity_mask_clip_value
            output_translucent_velocity override_b_enable_displacement_fade override_b_enable_tessellation
            override_b_has_pixel_animation override_b_is_thin_surface override_blend_mode
            override_cast_dynamic_shadow_as_masked override_compatible_with_lumen_card_sharing
            override_displacement_fade_range override_displacement_scaling override_dithered_lod_transition
            override_max_world_position_offset_displacement override_opacity_mask_clip_value
            override_output_translucent_velocity override_shading_model override_two_sided override_usage_flags
            shading_model two_sided usage_flags""".split()
        values = {name: data.get_editor_property(name) for name in fields}
        for name, keys in (("displacement_scaling", ("center", "magnitude")),
                           ("displacement_fade_range", ("start_size_pixels", "end_size_pixels"))):
            nested = data.get_editor_property(name)
            values[name] = tuple(nested.get_editor_property(key) for key in keys)
        return values


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
                for name in getattr(u.MaterialEditingLibrary, names)(original):
                    # Never retain a bound Unreal method in this module's cyclic test
                    # globals: UE 5.8.4's closure weakref slot crashes Python GC (#2401).
                    assert (getattr(u.MaterialEditingLibrary, "get_material_instance_" + kind + "_parameter_value")(copied, name)
                            == getattr(u.MaterialEditingLibrary, "get_material_instance_" + kind + "_parameter_value")(original, name)), (kind, name)
                    parameter_checks += 1
            a, b = copied, original
            while isinstance(b, u.MaterialInstanceConstant):
                assert base_overrides(a) == base_overrides(b)
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


def current_display_pools():
    import build_display_pools as display
    import display_pools
    project = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
    data = json.loads((project/'Import/measurements.json').read_text())["furnishing"]["displayPools"]
    order = display_pools.lamps(data)
    world = u.EditorLoadingAndSavingUtils.load_map("/Game/Lunden/Maps/L_Lunden")
    assert world
    actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
    by_tag = {str(t): a for a in actors for t in a.tags}
    assert not u.GameplayStatics.get_all_actors_with_tag(world, TAG), "retired pre-tonemap contribution remains"
    pools = u.GameplayStatics.get_all_actors_with_tag(world, display.TAG)
    assert len(pools) == 1
    assert not pools[0].get_component_by_class(u.StaticMeshComponent), "display compositor must add no overlay mesh"
    material = u.load_asset(display.MATERIAL)
    assert display._graph_matches(material, data, len(order))
    component = pools[0].get_component_by_class(u.PostProcessComponent)
    blendables = component.get_editor_property("settings").get_editor_property("weighted_blendables").array
    assert component.get_editor_property("unbound") and len(blendables) == 1
    assert blendables[0].object == material and blendables[0].weight == 1
    for row in data['rugReceivers']:
        receiver = by_tag[row['mesh']]
        comp = receiver.get_component_by_class(u.StaticMeshComponent)
        original = u.load_asset('/Game/Lunden/Generated/l1007/Materials/'+row['key'])
        assert comp.get_material(0) == original, "the original PBR surface must remain exact"
    # The calibrated child may override only its declared color/specular guesses.
    # All real texture, UV, roughness, alpha and static-switch values must survive.
    import build_furnishing_profile as furnishing
    import re
    checked = set()
    for actor in actors:
        comp = actor.get_component_by_class(u.StaticMeshComponent)
        if not comp or not comp.static_mesh:
            continue
        for index, slot in enumerate(comp.static_mesh.static_materials):
            original = slot.material_interface
            if not isinstance(original, u.MaterialInstanceConstant) or not original.get_path_name().startswith('/Game/Lunden/Generated/l1007/Materials/'):
                continue
            profile = next((p for p in furnishing.PROFILES.values() if any(re.search(pattern, original.get_name()) for pattern in p['keys'])), None)
            if profile is None:
                actual = comp.get_material(index)
                assert not (actual and actual.get_path_name().startswith(furnishing.DIR+'/')
                            and u.EditorAssetLibrary.get_metadata_tag(actual, furnishing.STAMP)
                            and u.EditorAssetLibrary.get_metadata_tag(actual, 'Lunden.Source') == original.get_path_name()), 'retired own furnishing profile must be restored'
                continue
            calibrated = comp.get_material(index)
            assert isinstance(calibrated, u.MaterialInstanceConstant)
            assert calibrated.get_editor_property('parent') == original
            assert 'guess:' in u.EditorAssetLibrary.get_metadata_tag(calibrated, 'Lunden.Assumption')
            if calibrated.get_path_name() in checked:
                continue
            checked.add(calibrated.get_path_name())
            for kind in ('scalar','vector','texture','static_switch'):
                for name in getattr(u.MaterialEditingLibrary, 'get_'+kind+'_parameter_names')(original):
                    if str(name) == 'BaseColorFactor' or (str(name) == 'SpecularFactor' and profile['specular'] is not None):
                        continue
                    assert (getattr(u.MaterialEditingLibrary, 'get_material_instance_'+kind+'_parameter_value')(calibrated, name)
                            == getattr(u.MaterialEditingLibrary, 'get_material_instance_'+kind+'_parameter_value')(original, name)), (calibrated.get_path_name(),kind,name)
            assert calibrated.get_blend_mode() == original.get_blend_mode()
    assert len(checked) >= 2, 'missing actual wood and solid-sofa-frame profile instances'
    mpc = u.load_asset(display.MPC)
    weather = u.load_asset('/Game/Lunden/Lighting/MPC_LundenWeather')
    saved_power = u.MaterialLibrary.get_scalar_parameter_value(world, weather, 'PowerAvailable')
    drivers = {str(a.tags[1]): a for a in u.GameplayStatics.get_all_actors_with_tag(world, display.DRIVER)}
    assert set(drivers) == set(order)
    checks = 0
    for index, lamp_id in enumerate(order):
        lamp = by_tag['lamp:'+lamp_id]
        saved = {key: lamp.get_editor_property(key) for key in ('K','IsOn','Candela','Supply')}
        hidden = bool(lamp.get_editor_property('hidden'))
        try:
            lamp.set_actor_hidden_in_game(False)
            for k, supply in ((1,1),(.25,1),(0,1),(1,0)):
                lamp.set_editor_property('K', k, u.PropertyAccessChangeNotifyMode.NEVER)
                u.MaterialLibrary.set_scalar_parameter_value(world, weather, 'PowerAvailable', supply)
                drivers[lamp_id].call_method('UpdateDisplayPool')
                actual = u.MaterialLibrary.get_scalar_parameter_value(world, mpc, 'Lamp'+str(index))
                assert abs(actual-k*supply) < 1e-6
                checks += 1
            lamp.set_actor_hidden_in_game(True)
            lamp.set_editor_property('K', 1, u.PropertyAccessChangeNotifyMode.NEVER)
            u.MaterialLibrary.set_scalar_parameter_value(world, weather, 'PowerAvailable', 1)
            drivers[lamp_id].call_method('UpdateDisplayPool')
            assert abs(u.MaterialLibrary.get_scalar_parameter_value(world, mpc, 'Lamp'+str(index))) < 1e-6
            assert lamp.get_editor_property('Candela') == saved['Candela']
            assert lamp.get_editor_property('Supply') == saved['Supply']
        finally:
            lamp.set_actor_hidden_in_game(hidden)
            for key, value in saved.items():
                lamp.set_editor_property(key, value, u.PropertyAccessChangeNotifyMode.NEVER)
            u.MaterialLibrary.set_scalar_parameter_value(world, weather, 'PowerAvailable', saved_power)
            drivers[lamp_id].call_method('UpdateDisplayPool')
    u.log(f'LUNDEN_RUG_POOL_NATIVE_OK: {len(data["fields"])} source display quads; original PBR; {checks} K/power fade checks plus visibility; actual pixels separate')


def main():
    project = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
    furnishing = json.loads((project/'Import/measurements.json').read_text())["furnishing"]
    if furnishing.get('displayPools'):
        current_display_pools()
    else:
        legacy_receiver()


main()
