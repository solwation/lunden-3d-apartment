"""#2467: Linux editor failures must never be reported as a successful Unreal check."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("linux_runner", Path(__file__).parents[1] / "run-linux.py")
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class LinuxRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.engine = self.root / "engine"
        self.editor = self.engine / "Engine/Binaries/Linux/UnrealEditor"
        self.editor.parent.mkdir(parents=True)
        self.editor.touch()
        version = self.engine / "Engine/Build/Build.version"
        version.parent.mkdir(parents=True)
        version.write_text(json.dumps({"MajorVersion": 5, "MinorVersion": 8, "PatchVersion": 4}))
        self.project = self.root / "project"
        self.project.mkdir()
        (self.project / "ENGINE_VERSION").write_text("5.8.4\n")
        (self.project / "Config").mkdir()
        (self.project / "Config/DefaultEngine.ini").write_text("[Retained]\nValue=from-project\n")
        self.script = self.root / "check.py"
        self.script.write_text("pass\n")
        self.patch_project = patch.object(runner, "PROJECT", self.project)
        self.patch_project.start()
        self.addCleanup(self.patch_project.stop)
        self.patch_settings = patch.object(runner, "SETTINGS", self.root / "absent-settings.json")
        self.patch_settings.start()
        self.addCleanup(self.patch_settings.stop)
        self.arguments = ["--engine-root", str(self.engine), "--data-dir", str(self.root / "data")]

    def invoke(self, mode, *, exit_code=0, log="Normal log", report=None):
        def engine_process(command, env, timeout):
            path = Path(next(a.split("=", 1)[1] for a in command if a.startswith("-abslog=")))
            if log is not None:
                path.write_text(log)
            if report is not None:
                directory = path.parent / "automation"
                directory.mkdir()
                (directory / "index.json").write_text(json.dumps(report))
            return exit_code
        with patch.object(runner, "editor_slot", return_value=runner.contextlib.nullcontext()), \
                patch.object(runner, "run_process", side_effect=engine_process):
            return runner.main(self.arguments + mode)

    def test_wrong_engine_never_starts_editor(self):
        (self.project / "ENGINE_VERSION").write_text("5.8.3")
        with patch.object(runner, "run_process") as process:
            self.assertEqual(runner.main(self.arguments + ["check"]), 3)
            process.assert_not_called()

    def test_zero_exit_with_python_error_fails(self):
        self.assertEqual(self.invoke(["python", str(self.script)], log="LogPython: Error: script failed"), 1)

    def test_missing_log_and_failed_process_fail(self):
        self.assertEqual(self.invoke(["python", str(self.script)], log=None), 1)
        self.assertEqual(self.invoke(["python", str(self.script)], exit_code=1), 1)

    def test_tests_require_complete_nonempty_passing_report(self):
        for report in (None, {"succeeded": 0, "failed": 0, "notRun": 0},
                       {"succeeded": 1, "failed": 0, "notRun": 1},
                       {"succeeded": 1, "failed": 1, "notRun": 0}):
            self.assertEqual(self.invoke(["tests"], report=report), 1)
        self.assertEqual(self.invoke(["tests"], report={"succeeded": 1, "failed": 0, "notRun": 0}), 0)

    def test_low_profile_retains_project_config_without_writing_it(self):
        before = (self.project / "Config/DefaultEngine.ini").read_bytes()
        ini = runner.low_ini()
        self.assertIn("Value=from-project", ini)
        self.assertIn("+TargetedRHIs=SF_VULKAN_SM5", ini)
        self.assertIn("r.DynamicGlobalIlluminationMethod=0", ini)
        self.assertEqual((self.project / "Config/DefaultEngine.ini").read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
