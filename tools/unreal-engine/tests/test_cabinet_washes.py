"""#2322. Verify the five original cabinet fields, dusk transition and grid supply in the composed UE world."""
import json
from pathlib import Path

import unreal as u

project = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
data = json.loads((project / "Import/measurements.json").read_text(encoding="utf-8"))
[row] = [light for light in data["lights"] if "cabinetWashes" in light]
fans = row["cabinetWashes"]["fans"]
assert sorted(f["opacity"] for f in fans) == [.35, .35, .35, .5, .5]
world = u.EditorLoadingAndSavingUtils.load_map("/Game/Lunden/Maps/L_Lunden")
[lamp] = u.GameplayStatics.get_all_actors_with_tag(world, "lamp:" + row["id"])
actors = u.GameplayStatics.get_all_actors_with_tag(world, "lunden:cabinet-washes")
assert len(actors) == len(fans)
by_id = {str(a.tags[1]): a for a in actors}
plane = u.load_asset("/Engine/BasicShapes/Plane.Plane")
for i, fan in enumerate(fans):
    actor = by_id[row["id"] + ":wash:" + str(i)]
    mesh = actor.static_mesh_component
    assert mesh.static_mesh == plane, (mesh.static_mesh, plane)
    assert mesh.get_collision_enabled() == u.CollisionEnabled.NO_COLLISION, (actor.get_actor_label(), mesh.get_collision_profile_name(), mesh.get_collision_enabled())
    assert not mesh.get_editor_property("cast_shadow")
    for corner, xyz in fan["corners"].items():
        x, y = (100 * int(v) - 50 for v in corner.split(","))
        actual = u.MathLibrary.transform_location(actor.get_actor_transform(), u.Vector(x, y, 0))
        assert (actual - u.Vector(*xyz)).length() < .02, (corner, xyz, actual)
veneer_key = row["cabinetWashes"].get("veneerKey")
if veneer_key:
    original = u.load_asset("/Game/Lunden/Generated/l1007/Materials/" + veneer_key)
    matched = []
    for a in u.GameplayStatics.get_all_actors_of_class(world, u.StaticMeshActor):
        if not a.tags or not str(a.tags[0]).startswith(row["id"] + "__"):
            continue
        comp = a.static_mesh_component
        if comp.static_mesh and comp.static_mesh.get_material(0) == original:
            active = comp.get_material(0)
            assert active.get_editor_property("parent") == original
            assert u.MaterialEditingLibrary.get_material_instance_scalar_parameter_value(active, "SpecularFactor") == 0
            matched.append(a)
    assert len(matched) == 4
weather = u.load_asset("/Game/Lunden/Lighting/MPC_LundenWeather")
saved_power = u.MaterialLibrary.get_scalar_parameter_value(world, weather, "PowerAvailable")
saved_lamp = lamp.get_editor_property("IsOn")
[driver] = [a for a in actors if a.get_editor_property("PointCandela") > 0]
point = lamp.get_component_by_class(u.PointLightComponent)
try:
    for on, fade, power in [(True, 1, 1), (True, .35, 1), (True, 1, .4), (True, 1, 0), (False, 0, 1)]:
        lamp.call_method("TurnOn" if on else "TurnOff")
        lamp.set_editor_property("K", fade, u.PropertyAccessChangeNotifyMode.NEVER)
        u.MaterialLibrary.set_scalar_parameter_value(world, weather, "PowerAvailable", power)
        for wash in actors:
            wash.call_method("UpdateWashes")
            assert wash.get_editor_property("SourceLamp") == lamp
            assert abs(wash.get_editor_property("AppliedFade") - fade * power) < .00001
            m = wash.static_mesh_component.get_material(0)
            assert isinstance(m, u.MaterialInstanceDynamic)
            assert abs(m.get_scalar_parameter_value("LampFade") - fade * power) < .00001
        assert abs(point.get_editor_property("intensity") - driver.get_editor_property("PointCandela") * fade * power) < .0001
finally:
    u.MaterialLibrary.set_scalar_parameter_value(world, weather, "PowerAvailable", saved_power)
    lamp.call_method("TurnOn" if saved_lamp else "TurnOff")
    for wash in actors:
        wash.call_method("UpdateWashes")
u.log("LUNDEN_CABINET_WASH_TEST_OK: five fields, two materials, dusk fade, manual light and power")
