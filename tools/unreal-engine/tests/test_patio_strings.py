"""#2373: run Editor.Python.Lunden.test_patio_strings on the composed map after importing the patio and lighting."""
import json
from pathlib import Path
import struct
import sys
import time

import unreal as u

project = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
sys.path.insert(0, str(project.parents[1] / "tools/unreal-engine/tests"))
import save_isolation  # noqa: E402

with (project / "Import/l1007-uteplats.glb").open("rb") as glb:
    glb.seek(12)
    length, kind = struct.unpack("<I4s", glb.read(8))
    assert kind == b"JSON"
    nodes = json.loads(glb.read(length))["nodes"]
bulb_ids = {n["extras"]["id"] for n in nodes if n.get("extras", {}).get("patioStringBulb")}
measurements = json.loads((project / "Import/measurements.json").read_text(encoding="utf-8"))
lights = [row for row in measurements["lights"] if row.get("name") == "ljusslingan"]
driver_spec, = [row for row in lights if row.get("patioBulbs")]
if not bulb_ids or len(lights) != 2:
    raise RuntimeError("Expected the exported patio bulbs and both light pools")

if not u.EditorLoadingAndSavingUtils.load_map("/Game/Lunden/Maps/L_Lunden"):
    raise RuntimeError("Cannot load the composed L_Lunden map")
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
saved = save_isolation.isolate()
levels.editor_request_begin_play()


@u.AutomationScheduler.add_latent_command
def patio_strings():
    try:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            game = editor.get_game_world()
            if game:
                bulbs = u.GameplayStatics.get_all_actors_with_tag(game, "patio:string-bulb")
                skies = u.GameplayStatics.get_all_actors_with_tag(game, "lunden:sky")
                drivers = u.GameplayStatics.get_all_actors_with_tag(game, "patio:string-driver")
                if len(bulbs) == len(bulb_ids) and len(skies) == len(drivers) == 1:
                    break
            yield
        else:
            raise RuntimeError("The composed patio, sky and string driver did not finish loading")

        if {str(a.tags[0]) for a in bulbs} != bulb_ids:
            raise RuntimeError("Imported bulb identifiers differ from the patio GLB")
        sky, driver = skies[0], drivers[0]
        pools = [u.GameplayStatics.get_all_actors_with_tag(game, "lamp:" + row["id"])[0] for row in lights]
        if driver not in pools:
            raise RuntimeError("The material driver is not one of the two exported patio lights")
        for name, value in (("UseClock", False), ("TimeScale", 0.0), ("Year", 2026), ("Month", 6),
                            ("Day", 21), ("Rain", 0.0)):
            sky.set_editor_property(name, value)
        rgb = bytes.fromhex(driver_spec["color"].lstrip("#"))
        base = u.LinearColor()
        base.set_from_srgb(u.Color(r=rgb[0], g=rgb[1], b=rgb[2], a=255))
        glow = driver_spec["patioBulbs"]
        mpc = u.load_asset("/Game/Lunden/Lighting/MPC_LundenWeather")
        for hour, rain, supply, on in ((14.0, 0.0, 1.0, False), (21.25, 1.0, 1.0, False),
                                       (23.5, 0.0, 1.0, True), (23.5, 0.0, 0.0, True),
                                       (23.5, 0.0, 1.0, True), (14.0, 0.0, 1.0, False)):
            sky.set_editor_property("Rain", rain)
            u.MaterialLibrary.set_scalar_parameter_value(game, mpc, "PowerAvailable", supply)
            sky.set_editor_property("Hour", hour)
            sky.call_method("UpdateSky")
            for _ in range(3):
                yield
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                yield
                if all(abs(lamp.get_editor_property("K") - float(on)) < 1e-4
                       and abs(lamp.get_editor_property("Supply") - supply) < 1e-4 for lamp in pools):
                    break
            else:
                raise RuntimeError(f"At {hour}, the two patio light pools did not reach the expected fade")
            mid = driver.get_editor_property("StringMaterial")
            if not mid or any(a.get_component_by_class(u.StaticMeshComponent).get_material(0) != mid for a in bulbs):
                raise RuntimeError(f"At {hour}, the {len(bulbs)} bulbs do not share the driver's dynamic material")
            actual = mid.get_vector_parameter_value("BaseColorFactor")
            factor = glow["idle"] + glow["boost"] * on * supply
            if any(abs(a - b * factor) > 1e-4 for a, b in zip((actual.r, actual.g, actual.b), (base.r, base.g, base.b))):
                raise RuntimeError(f"At {hour}, unexpected patio bulb colour {actual}")
            for lamp in pools:
                intensity = lamp.get_component_by_class(u.PointLightComponent).intensity
                if abs(intensity - lamp.get_editor_property("Candela") * on * supply) > 1e-3:
                    raise RuntimeError(f"At {hour}, unexpected pool intensity {intensity}")
        u.log(f"LUNDEN_PATIO_STRINGS_TEST_OK {len(bulbs)} bulbs and two pools across rain, dusk and a power cut")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved, editor)
