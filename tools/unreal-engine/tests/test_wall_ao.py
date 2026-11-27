"""Real depth, source falloff and shared-edge regression checks; no Unreal import."""
import copy
import math
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'python'))
import wall_ao


def source_quad():
    # Same winding, 1mm source offset and aDist layout as actual buildWallAO.
    a, b, c, d = ([5.5502, 2, 8], [5.5502, 2, 12], [5.5502, 3, 12], [5.5502, 3, 8])
    def distances(p):
        return [100, 3-p[1], 100, 100]
    return {'version': 1, 'blendSpace': 'display-srgb-multiply', 'runtimeCoverage': 'static-built-geometry',
            'coordinates': {'units': 'metres', 'axes': 'x east, y up, z south'},
            'wall': [5.5512, 8, 0, 12, 3], 'bandBottom': 2,
            'coefficients': {'floor': [.3, .12], 'ceil': [.25, .2], 'corner': [.3, .16]},
            'depth': {'depthTest': True, 'depthWrite': False, 'frontSide': True, 'polygonOffset': True,
                      'polygonOffsetFactor': -2, 'polygonOffsetUnits': -2, 'renderOrder': 1,
                      'toneMapped': False, 'blend': 'DstColor * source + Zero * destination'},
            'triangles': [{'positions': ps, 'aDist': [distances(p) for p in ps]} for ps in ([a, b, c], [a, c, d])]}


class WallAO(unittest.TestCase):
    def test_original_wall_receives_source_falloff_and_shared_edge_once(self):
        data = source_quad()
        expected = 1-.25*math.exp(-.5/.2)
        self.assertAlmostEqual(wall_ao.factor(data, [5.5512, 2.5, 10], [2.5, 2.5, 10]), expected)
        data['triangles'].reverse()
        self.assertAlmostEqual(wall_ao.factor(data, [5.5512, 2.5, 10], [2.5, 2.5, 10]), expected)
        self.assertLess(wall_ao.factor(data, [5.5512, 2.9, 10], [2.5, 2.9, 10]), expected)

    def test_foreground_picture_backface_and_outside_band_stay_unchanged(self):
        for point, camera in [([5.54, 2.5, 10], [2.5, 2.5, 10]),
                              ([5.5512, 2.5, 10], [6, 2.5, 10]),
                              ([5.5512, 1.9, 10], [2.5, 1.9, 10]),
                              ([5.5512, 2.5, 12.1], [2.5, 2.5, 12.1])]:
            self.assertEqual(wall_ao.factor(source_quad(), point, camera), 1)

    def test_real_corner_terms_and_source_space_not_a_light_intensity(self):
        data = source_quad()
        for triangle in data['triangles']:
            for row in triangle['aDist']:
                row[2:] = [.16, .32]
        self.assertAlmostEqual(wall_ao.factor(data, [5.5512, 2.5, 10], [2.5, 2.5, 10]),
                               (1-.25*math.exp(-2.5))*(1-.3*math.exp(-1))*(1-.3*math.exp(-2)))
        shader = wall_ao.code(data)
        self.assertIn('return Scene.rgb*multiplier;', shader)
        self.assertNotIn('Lamp', shader)

    def test_reject_overlap_or_changed_depth_or_escaped_band(self):
        bad = source_quad()
        bad['triangles'].append(copy.deepcopy(bad['triangles'][0]))
        with self.assertRaisesRegex(ValueError, 'Overlapping'):
            wall_ao.validate(bad)
        for mutate in (lambda d: d['depth'].update(depthTest=False),
                       lambda d: d['triangles'][0]['positions'][0].__setitem__(1, 1.5),
                       lambda d: d['coefficients']['ceil'].__setitem__(1, 0)):
            bad = source_quad()
            mutate(bad)
            with self.assertRaises(ValueError):
                wall_ao.validate(bad)


if __name__ == '__main__':
    unittest.main()
