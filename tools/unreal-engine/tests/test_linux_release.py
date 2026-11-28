"""Release prerequisites/command boundary: never invokes Unreal."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

FILE = Path(__file__).resolve().parents[1] / "release-linux.py"
spec = importlib.util.spec_from_file_location("release_linux_under_test", FILE)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


@unittest.skipUnless(release.sys.platform == "linux", "Linux packaging command")
class LinuxReleaseTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "source"
        self.engine = Path(self.temp.name) / "Epic Linux"
        self.out = Path(self.temp.name) / "Shipping output"
        for name, text in {
            "Engine/Build/Build.version": json.dumps(dict(MajorVersion=5, MinorVersion=8, PatchVersion=4)),
            release.RUNTIME: "runtime fixture, not executable",
            "Engine/Build/BatchFiles/RunUAT.sh": "not executable",
        }.items():
            p = self.engine / name; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(text)
        p = self.root / "unreal/Lunden/Import/export-manifest.json"
        p.parent.mkdir(parents=True)
        p.write_text(json.dumps({"sourceCommit": "a" * 40, "sourceHash": "b" * 64}))
        self.args = ["--engine-root", str(self.engine), "--output", str(self.out), "--version", "1.2.3", "--content", "4"]

    def test_plan_checks_real_freshness_gate_without_engine_launch_or_completion_marker(self):
        log = io.StringIO()
        with patch.object(release, "ROOT", self.root), patch.object(release, "revision", return_value="a" * 40), \
                patch.object(release.subprocess, "run") as run, contextlib.redirect_stdout(log):
            release.main([*self.args, "--plan"])
        run.assert_called_once_with(["node", str(self.root / "tools/unreal-engine/check-import.mjs")], cwd=self.root, check=True)
        plan = json.loads(log.getvalue())
        self.assertTrue(plan["dryRun"])
        command = plan["command"]
        self.assertIn("-platform=Linux", command)
        self.assertIn("-clientconfig=Shipping", command)
        self.assertIn(f"-project={self.root / 'unreal/Lunden/Lunden.uproject'}", command)
        self.assertFalse(any(flag in command for flag in ["-NullRHI", "-AllowCPUDevices", "-RenderOffscreen", "-platform=Win64"]))
        self.assertFalse(self.out.exists())

    def test_failed_gate_or_foreign_engine_cannot_create_archive_or_launch_uat(self):
        with patch.object(release, "ROOT", self.root), patch.object(release, "revision", return_value="a" * 40), \
                patch.object(release.subprocess, "run", side_effect=subprocess.CalledProcessError(1, "check-import")) as run:
            with self.assertRaises(subprocess.CalledProcessError): release.main(self.args)
            self.assertEqual(1, run.call_count)
        self.assertFalse(self.out.exists())
        (self.engine / "Engine/Build/Build.version").write_text(json.dumps(dict(MajorVersion=5, MinorVersion=9, PatchVersion=0)))
        with patch.object(release, "ROOT", self.root), patch.object(release, "revision", return_value="a" * 40), \
                patch.object(release.subprocess, "run") as run:
            with self.assertRaisesRegex(RuntimeError, "5.8.4"): release.main(self.args)
            run.assert_not_called()
        self.assertFalse(self.out.exists())

    def test_refuse_source_or_engine_output_and_unclean_revision(self):
        with patch.object(release, "ROOT", self.root):
            with self.assertRaisesRegex(ValueError, "outside"):
                release.main([*self.args, "--output", str(self.root / "build")])
            with self.assertRaisesRegex(ValueError, "outside"):
                release.main([*self.args, "--output", str(self.engine / "build")])
        with patch.object(release.subprocess, "check_output", return_value=b" M authored.uasset\n"):
            with self.assertRaisesRegex(RuntimeError, "clean checkout"): release.revision(self.root)


if __name__ == "__main__":
    unittest.main()
