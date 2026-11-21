"""#2311: keep the player's save file out of the PIE tests.

BPC_LundenSave (#2288) puts the player back at the saved place when a game starts on the map the save was made on and
saves the place every 2 s and at EndPlay. A PIE test that leaves Saved/SaveGames/LundenSave.sav behind therefore moves
the next test's player away from START, and every test would overwrite the save of whoever plays in that editor.

Each PIE test calls, just before levels.editor_request_begin_play():
    saved_slot = save_isolation.isolate()
and ends its latent command's finally with:
    levels.editor_request_end_play()
    yield from save_isolation.restore_after_play(saved_slot, editor)
isolate() moves an existing slot file aside to LundenSave.sav.before-test, so the game starts with no save.
restore_after_play() waits until PIE has ended (EndPlay writes the slot one last time), removes the file the test wrote
and puts the moved file back, also when the test failed. If an editor stopped between the two, the next isolate() finds
the .before-test file, keeps it as the user's file and deletes the slot left by the stopped test.

test_save.py tests the slot itself and keeps its own handling (it rewrites the slot on purpose).
The file operations take a plain path, so save_isolation_test.py checks them without Unreal.
Tests are copied into Content/Python to run; they import this module from tools/unreal-engine/tests via sys.path.
"""
import os
from pathlib import Path
import time

SLOT = "LundenSave"  # BFL_LundenSave's slot name (build_save.py), user index 0
BACKUP_SUFFIX = ".before-test"


class SaveIsolation:
    """Moves one slot file aside while a test runs and puts it back afterwards."""

    def __init__(self, file):
        self.file = Path(file)
        self.backup = self.file.with_name(self.file.name + BACKUP_SUFFIX)
        self.active = False

    def start(self):
        self.file.parent.mkdir(parents=True, exist_ok=True)
        if self.backup.exists():  # left by a run that stopped before restoring: that is the user's file
            if self.file.exists():
                self.file.unlink()
        elif self.file.exists():
            os.replace(self.file, self.backup)
        self.active = True
        return self

    def restore(self):
        if not self.active:  # never started (or already restored): do not touch the user's file
            return
        if self.backup.exists():
            os.replace(self.backup, self.file)
        elif self.file.exists():
            self.file.unlink()
        self.active = False

    def __enter__(self):
        return self.start()

    def __exit__(self, *exc):
        self.restore()
        return False


def slot_file(slot=SLOT):
    """The editor's slot file: <project>/Saved/SaveGames/<slot>.sav, as test_save.py finds it."""
    import unreal as u
    return Path(u.Paths.convert_relative_path_to_full(u.Paths.project_saved_dir())) / "SaveGames" / (slot + ".sav")


def isolate(file=None):
    """Move the slot file aside before PIE starts; returns the SaveIsolation to restore."""
    return SaveIsolation(file if file is not None else slot_file()).start()


def restore_after_play(isolation, editor, timeout=30.0, clock=time.monotonic):
    """For a latent command's finally, after editor_request_end_play(): yield until the game world is gone, then restore.

    The restore runs even when the wait is cut short (timeout, or the generator is closed).
    """
    try:
        deadline = clock() + timeout
        while editor.get_game_world() and clock() < deadline:
            yield
    finally:
        isolation.restore()
