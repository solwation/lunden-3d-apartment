"""#2370: old measurements without the new field keep the original web pitch stop."""
import math
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from player_pitch import pitch_limit_rad


class PlayerPitchTest(unittest.TestCase):
    def test_legacy_and_current(self):
        legacy = {"eye": 1.62, "mouseSens": 0.0013}
        self.assertEqual(pitch_limit_rad(legacy), 1.45)
        self.assertEqual(pitch_limit_rad({**legacy, "pitchLimit": 1.2}), 1.2)

    def test_invalid_values_do_not_use_legacy_default(self):
        for value in (None, False, True, "1.45", 0, -1, math.pi / 2, math.inf, math.nan):
            with self.subTest(value=value), self.assertRaises(ValueError):
                pitch_limit_rad({"pitchLimit": value})


if __name__ == "__main__":
    unittest.main()
