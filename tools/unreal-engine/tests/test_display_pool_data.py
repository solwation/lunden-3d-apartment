"""Reject unsafe source geometry before any native graph or assets are touched."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('lunden_display_pool_data', Path(__file__).parents[1]/'python/display_pools.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SourceGeometry(unittest.TestCase):
    def setUp(self):
        self.data = {'mask': {'width': 128, 'height': 128, 'colorSpace': 'linear', 'flipY': True},
                     'fields': [{'lamp': 'room_source', 'kind': 'floor', 'opacity': 1,
                                 'colour': [.2, .13877435, .0783145],
                                 'corners': {'0,0': [244, 936, 1.2], '1,0': [484, 936, 1.2],
                                             '1,1': [484, 1176, 1.2], '0,1': [244, 1176, 1.2]}}]}

    def test_nonfinite_and_degenerate_sources_abort(self):
        for mutate in (lambda d: d['fields'][0]['colour'].__setitem__(1, float('nan')),
                       lambda d: d['fields'][0]['corners'].__setitem__('1,0', [244, 936, 1.2]),
                       lambda d: d['fields'][0]['corners'].__setitem__('1,1', [484, 1176, 10])):
            data = copy.deepcopy(self.data)
            mutate(data)
            with self.assertRaises(ValueError):
                module.code(data)

    def test_source_mask_transfer_contract_cannot_change_silently(self):
        for key, value in (('colorSpace', 'srgb'), ('flipY', False), ('width', 256)):
            data = copy.deepcopy(self.data)
            data['mask'][key] = value
            with self.assertRaises(ValueError):
                module.code(data)

    def test_actual_source_field_is_valid_without_editing_input(self):
        before = copy.deepcopy(self.data)
        module.validate(self.data)
        self.assertEqual(module.lamps(self.data), ['room_source'])
        self.assertEqual(self.data, before)


if __name__ == '__main__':
    unittest.main()
