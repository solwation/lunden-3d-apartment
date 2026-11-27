"""#2322: composed-world material/receiver/switch checks after sync-import; never save.

This checks graph execution and geometry. Rendered camera-distance stability, occlusion
and matched web/UE colour measurements remain separate acceptance requirements.
"""
import json
from pathlib import Path
import sys

import unreal as u

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from build_rug_pool import DIR, FADE, TAG, pool_uv, receiver_matches

project = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
spec = json.loads((project / "Import/measurements.json").read_text(encoding="utf-8"))["furnishing"]["rugFloorPool"]
world = u.EditorLoadingAndSavingUtils.load_map("/Game/Lunden/Maps/L_Lunden")
actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
by_tag = {str(t): a for a in actors for t in a.tags}
controls = u.GameplayStatics.get_all_actors_with_tag(world, TAG)
assert len(controls) == len(spec["receivers"])
lamp = by_tag["lamp:" + spec["lamp"]]
mpc = u.load_asset("/Game/Lunden/Lighting/MPC_LundenWeather")
texture = u.load_asset(DIR + "/T_RugPoolMask")
assert not texture.get_editor_property("srgb")
parent = u.load_asset(DIR + "/M_RugPool")
assert parent.get_editor_property("blend_mode") == u.BlendMode.BLEND_ADDITIVE
assert not parent.get_editor_property("disable_depth_test")
assert parent.get_editor_property("two_sided")
assert not parent.get_editor_property("use_translucency_vertex_fog")
saved = {key: lamp.get_editor_property(key) for key in ("K", "IsOn", "Candela", "Supply")}
power = u.MaterialLibrary.get_scalar_parameter_value(world, mpc, "PowerAvailable")

try:
    for row in spec["receivers"]:
        source = by_tag[row["mesh"]]
        source_comp = source.get_component_by_class(u.StaticMeshComponent)
        assert source_comp.get_material(0).get_name() == row["key"], "original rug material changed"
        overlay = by_tag[row["mesh"] + ":rug-pool"]
        comp = overlay.static_mesh_component
        assert overlay in controls
        assert not comp.get_editor_property("cast_shadow")
        assert comp.get_collision_enabled() == u.CollisionEnabled.NO_COLLISION
        assert comp.get_editor_property("translucency_sort_priority") == spec["depth"]["renderOrder"]
        # Standalone rebuild must not skip solely because its material UObject and pose match.
        args = (overlay, comp.static_mesh, comp.get_material(0), overlay.get_actor_location(),
                overlay.get_actor_rotation(), overlay.get_actor_scale3d(), spec["depth"]["renderOrder"])
        assert receiver_matches(*args)
        original_order = comp.get_editor_property("translucency_sort_priority")
        try:
            comp.set_editor_property("translucency_sort_priority", original_order + 1)
            assert not receiver_matches(*args), "sort-priority drift was incorrectly skipped"
            comp.set_editor_property("translucency_sort_priority", original_order)
            comp.set_editor_property("cast_shadow", True)
            assert not receiver_matches(*args), "shadow drift was incorrectly skipped"
            comp.set_editor_property("cast_shadow", False)
            comp.set_collision_enabled(u.CollisionEnabled.QUERY_ONLY)
            assert not receiver_matches(*args), "collision drift was incorrectly skipped"
        finally:
            comp.set_editor_property("translucency_sort_priority", original_order)
            comp.set_editor_property("cast_shadow", False)
            comp.set_collision_enabled(u.CollisionEnabled.NO_COLLISION)
        assert receiver_matches(*args)
        origin, extent = source.get_actor_bounds(False)
        # Both source and overlay are exactly flat rectangular geometry. No arbitrary native lift.
        top = overlay.get_actor_location().z
        assert abs(top - (origin.z + extent.z)) < .0001, (top, origin, extent)
        assert all(abs(p[2] - top) < .0001 for p in row["corners"].values())
        for key, p in spec["corners"].items():
            want = [float(v) for v in key.split(",")]
            assert max(abs(a - b) for a, b in zip(pool_uv(p, spec["corners"]), want)) < 1e-10

    for k, supply in ((1, 1), (.75, 1), (.25, .5), (0, 1), (1, 0)):
        lamp.set_editor_property("K", k, u.PropertyAccessChangeNotifyMode.NEVER)
        u.MaterialLibrary.set_scalar_parameter_value(world, mpc, "PowerAvailable", supply)
        for driver in controls:
            driver.call_method("UpdateRugPool")
            observed = driver.static_mesh_component.get_material(0)
            assert isinstance(observed, u.MaterialInstanceDynamic)
            assert abs(observed.get_scalar_parameter_value(FADE) - k * supply) < 1e-6
        assert lamp.get_editor_property("Candela") == saved["Candela"]
        assert lamp.get_editor_property("Supply") == saved["Supply"]
    u.MaterialLibrary.set_scalar_parameter_value(world, mpc, "PowerAvailable", 1)
    for on in (True, False, True):
        lamp.call_method("TurnOn" if on else "TurnOff")
        for driver in controls:
            driver.call_method("UpdateRugPool")
            observed = driver.static_mesh_component.get_material(0).get_scalar_parameter_value(FADE)
            assert abs(observed - lamp.get_editor_property("K")) < 1e-6
finally:
    u.MaterialLibrary.set_scalar_parameter_value(world, mpc, "PowerAvailable", power)
    for key, value in saved.items():
        lamp.set_editor_property(key, value, u.PropertyAccessChangeNotifyMode.NEVER)
    for driver in controls:
        driver.call_method("UpdateRugPool")
u.log(f"LUNDEN_RUG_POOL_NATIVE_OK: {len(controls)} original receivers, linear mask, source lamp/power fades; rendered depth/colour pending")
