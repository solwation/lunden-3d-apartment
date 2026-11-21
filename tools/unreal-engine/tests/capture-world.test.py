"""Run with python3 under WSL. Exercise capture state, including descriptors which exist without a loaded ULevel."""
from pathlib import Path
import runpy
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

with patch.dict(sys.modules, {"unreal": Mock()}):
    import capture_world as capture


def object_in_package(package):
    obj = Mock()
    obj.get_outermost.return_value.get_name.return_value = package
    return obj


class CaptureWorldTest(unittest.TestCase):
    def setUp(self):
        self.unreal = capture.u
        self.world = object_in_package(capture.MANIFEST["map"])
        self.packages = [e["package"] for e in capture.MANIFEST["levels"]]
        self.streams = {}
        self.levels = []
        for package in self.packages:
            level = object_in_package(package)
            stream = Mock()
            stream.get_world_asset_package_f_name.return_value = package
            stream.get_loaded_level.return_value = level
            stream.is_level_visible.return_value = True
            self.streams[package] = stream
            self.levels.append(level)
        self.unreal.EditorLevelUtils.get_levels.side_effect = lambda world: self.levels if world is self.world else []
        self.unreal.GameplayStatics.get_streaming_level.side_effect = lambda world, p: self.streams.get(p)
        self.vegetation = next(p for p in self.packages if "VegetationWorld" in p)

    def test_requires_visible_loaded_objects_in_the_capture_world(self):
        self.assertEqual(capture.loaded_capture_levels(self.world), self.packages)
        for missing in self.packages:
            with self.subTest(package=missing):
                stream = self.streams.pop(missing)
                with self.assertRaisesRegex(RuntimeError, missing):
                    capture.loaded_capture_levels(self.world)
                self.streams[missing] = stream

        stream = self.streams[self.vegetation]
        real = stream.get_loaded_level.return_value
        for invalid, reason in [(None,"not loaded"), (object_in_package(self.vegetation),"not loaded")]:
            with self.subTest(reason=reason):
                stream.get_loaded_level.return_value = invalid
                with self.assertRaisesRegex(RuntimeError, reason):
                    capture.loaded_capture_levels(self.world)
        stream.get_loaded_level.return_value = real
        stream.is_level_visible.return_value = False
        with self.assertRaisesRegex(RuntimeError, "hidden"):
            capture.loaded_capture_levels(self.world)
        stream.is_level_visible.return_value = True
        stream.get_world_asset_package_f_name.return_value = "/Game/Elsewhere/" + self.vegetation.rsplit("/",1)[1]
        with self.assertRaisesRegex(RuntimeError, "missing streaming level"):
            capture.loaded_capture_levels(self.world)

    def test_all_composed_capture_entry_points_reject_stale_vegetation(self):
        self.streams[self.vegetation].get_loaded_level.return_value = None
        sky = Mock(tags=["lunden:sky"])
        subsystem = self.unreal.get_editor_subsystem.return_value
        subsystem.get_editor_world.return_value = self.world
        subsystem.get_all_level_actors.return_value = [sky]
        render = Mock()
        stubs = {"unreal": self.unreal, "capture_world": capture, "capture_pilot": Mock(),
                 "screenshot_level": render, "prepare_nanite_materials": Mock()}
        with tempfile.TemporaryDirectory() as folder, patch.dict(sys.modules, stubs):
            scene = Path(folder) / "scene.json"
            scene.write_text('{"cameras":[]}')
            output = Path(folder) / "shots"
            for script in ("capture_lighting", "capture_l1007", "capture_exterior", "capture_vegetation",
                           "capture_entrances", "capture_seasons"):
                path = Path(__file__).with_name(script+".py")
                args = [str(output)] if script == "capture_entrances" else [str(scene),str(output)]
                with self.subTest(script=script), patch.object(sys, "argv", [str(path),*args]):
                    with self.assertRaisesRegex(RuntimeError, self.vegetation):
                        runpy.run_path(str(path))
            self.assertFalse(output.exists())
            render.render_view.assert_not_called()

    def test_applies_each_date_and_preserves_other_lamp_visibility(self):
        tree, bulb, hidden_bulb, armchair = [Mock() for _ in range(4)]
        tree.get_component_by_class.return_value = armchair.get_component_by_class.return_value = None
        bulb.is_temporarily_hidden_in_editor.return_value = False
        hidden_bulb.is_temporarily_hidden_in_editor.return_value = True
        actors = [tree,bulb,hidden_bulb,armchair]
        self.unreal.GameplayStatics.get_all_actors_with_tag.return_value = actors
        dates = []
        def apply(event, date):
            self.assertEqual(event,"ApplySeason")
            dates.append(date)
            for actor in (tree,bulb,hidden_bulb):
                actor.get_editor_property.return_value = date[1] == 6
            armchair.get_editor_property.return_value = date[1] == 12
        self.unreal.new_object.return_value.call_method.side_effect = apply
        seasons = capture.CaptureSeasons(self.world)
        for month, day, expected in [(6,21,[tree,bulb,hidden_bulb]),(12,24,[armchair]),(6,21,[tree,bulb,hidden_bulb])]:
            self.assertEqual(seasons.apply([2026, month, day]), expected)
            bulb.set_is_temporarily_hidden_in_editor.assert_called_with(month == 6)
            hidden_bulb.set_is_temporarily_hidden_in_editor.assert_called_with(True)
        self.assertEqual(dates,[(2026,6,21),(2026,12,24),(2026,6,21)])
        for actor in actors:
            actor.call_method.assert_not_called()  # never override TurnOn / TurnOff or change light intensity


if __name__ == "__main__":
    unittest.main()
