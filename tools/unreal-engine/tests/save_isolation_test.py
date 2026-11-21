#!/usr/bin/env python3
"""Tests for tools/unreal-engine/tests/save_isolation.py (#2311), without Unreal.

    python3 tools/unreal-engine/tests/save_isolation_test.py
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import save_isolation as m  # noqa: E402


class FakeEditor:
    """get_game_world() is truthy for `frames` calls, like PIE ending a few ticks after the request."""

    def __init__(self, frames, on_end=None):
        self.frames, self.on_end = frames, on_end

    def get_game_world(self):
        if self.frames > 0:
            self.frames -= 1
            if self.frames == 0 and self.on_end:
                self.on_end()  # EndPlay writes the slot as the world goes away
            return object()
        return None


def latent_test(file, editor, body):
    """The shape of a PIE test: isolate, begin play, run, finally end play and restore."""
    slot = m.isolate(file)
    try:
        body()
    finally:
        yield from m.restore_after_play(slot, editor)


class SaveIsolation(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.file = Path(self.tmp.name) / "Saved" / "SaveGames" / "LundenSave.sav"
        self.backup = self.file.with_name("LundenSave.sav.before-test")

    def tearDown(self):
        self.tmp.cleanup()

    def run_test(self, body, frames=3, end_write=b"endplay"):
        editor = FakeEditor(frames, lambda: self.file.write_bytes(end_write))
        steps = 0
        for _ in latent_test(self.file, editor, body):
            steps += 1
        return steps

    def test_existing_file_moved_aside_and_restored(self):
        self.file.parent.mkdir(parents=True)
        self.file.write_bytes(b"user")
        seen = []
        self.run_test(lambda: seen.append(self.file.exists()))
        self.assertEqual(seen, [False])  # the game started with no save
        self.assertEqual(self.file.read_bytes(), b"user")
        self.assertFalse(self.backup.exists())

    def test_file_written_by_test_removed(self):
        steps = self.run_test(lambda: self.file.write_bytes(b"autosave"))
        self.assertGreater(steps, 0)  # waited for PIE to end, so EndPlay's write is removed too
        self.assertFalse(self.file.exists())
        self.assertFalse(self.backup.exists())

    def test_restored_on_exception(self):
        self.file.parent.mkdir(parents=True)
        self.file.write_bytes(b"user")

        def fail():
            self.file.write_bytes(b"autosave")
            raise RuntimeError("test failed")
        with self.assertRaises(RuntimeError):
            self.run_test(fail)
        self.assertEqual(self.file.read_bytes(), b"user")
        self.assertFalse(self.backup.exists())

    def test_twice_in_a_row(self):
        self.file.parent.mkdir(parents=True)
        self.file.write_bytes(b"user")
        for _ in range(2):
            seen = []
            self.run_test(lambda: (seen.append(self.file.exists()), self.file.write_bytes(b"autosave")))
            self.assertEqual(seen, [False])
            self.assertEqual(self.file.read_bytes(), b"user")
        os.remove(self.file)
        for _ in range(2):  # and with no user file at all
            self.run_test(lambda: self.file.write_bytes(b"autosave"))
            self.assertFalse(self.file.exists())
            self.assertFalse(self.backup.exists())

    def test_closed_generator_still_restores(self):
        self.file.parent.mkdir(parents=True)
        self.file.write_bytes(b"user")
        gen = latent_test(self.file, FakeEditor(100), lambda: self.file.write_bytes(b"autosave"))
        next(gen)
        gen.close()
        self.assertEqual(self.file.read_bytes(), b"user")

    def test_timeout_still_restores(self):
        self.file.parent.mkdir(parents=True)
        self.file.write_bytes(b"user")
        slot = m.isolate(self.file)
        now = [0.0]

        def clock():
            now[0] += 10.0
            return now[0]
        steps = sum(1 for _ in m.restore_after_play(slot, FakeEditor(10 ** 6), timeout=30.0, clock=clock))
        self.assertLess(steps, 10)
        self.assertEqual(self.file.read_bytes(), b"user")

    def test_leftover_backup_from_stopped_run_wins(self):
        self.file.parent.mkdir(parents=True)
        self.backup.write_bytes(b"user")  # an editor stopped mid-test: backup is the user's, slot is residue
        self.file.write_bytes(b"residue")
        self.run_test(lambda: self.assertFalse(self.file.exists()))
        self.assertEqual(self.file.read_bytes(), b"user")
        self.assertFalse(self.backup.exists())

    def test_restore_without_start_leaves_file(self):
        self.file.parent.mkdir(parents=True)
        self.file.write_bytes(b"user")
        slot = m.SaveIsolation(self.file)
        slot.restore()
        self.assertEqual(self.file.read_bytes(), b"user")


if __name__ == "__main__":
    unittest.main()
