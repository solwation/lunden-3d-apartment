"""#2467: Linux editor failures must never be reported as a successful Unreal check."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("linux_runner", Path(__file__).parents[1] / "run-linux.py")
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


@unittest.skipUnless(sys.platform == "linux", "Linux-only runner and process supervision")
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
        def engine_process(command, env, timeout, **kwargs):
            path = Path(next(a.split("=", 1)[1] for a in command if a.startswith("-abslog=")))
            if log is not None:
                path.write_text(log)
            if report is not None:
                directory = path.parent / "automation"
                directory.mkdir()
                (directory / "index.json").write_text("\ufeff" + json.dumps(report))
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

    def test_timeout_records_failed_result(self):
        with patch.object(runner, "editor_slot", return_value=runner.contextlib.nullcontext()), \
                patch.object(runner, "run_process", side_effect=runner.subprocess.TimeoutExpired("editor", 1)):
            self.assertEqual(runner.main(self.arguments + ["python", str(self.script)]), 1)
        result = json.loads(next((self.root / "data/runs").glob("*/result.json")).read_text())
        self.assertEqual(result["exitCode"], 124)
        self.assertTrue(result["timedOut"])
        self.assertFalse(result["passed"])

    def test_exited_editor_does_not_leave_resistant_worker(self):
        pid_file = self.root / "worker.pid"
        child = ("import os,signal,time;from pathlib import Path;"
                 "signal.signal(signal.SIGTERM,signal.SIG_IGN);"
                 f"Path({str(pid_file)!r}).write_text(str(os.getpid()));time.sleep(30)")
        parent = ("import subprocess,sys,time;from pathlib import Path;"
                  f"subprocess.Popen([sys.executable,'-c',{child!r}],start_new_session=True);"
                  f"p=Path({str(pid_file)!r});\nwhile not p.exists():time.sleep(.01)")
        try:
            with patch.object(runner, "STOP_GRACE_SECONDS", 0.1):
                self.assertEqual(runner.run_process([sys.executable, "-c", parent], os.environ.copy(), 5), 0)
            pid = int(pid_file.read_text())
            # An orphan can remain briefly as a zombie until PID1 reaps it, but must not run.
            state = Path(f"/proc/{pid}/stat")
            for _ in range(100):
                if not state.exists() or state.read_text().split(")", 1)[1].split()[0] == "Z":
                    break
                runner.time.sleep(0.01)
            else:
                self.fail("Worker survived editor exit and process-group cleanup")
        finally:
            if pid_file.exists():
                try:
                    os.kill(int(pid_file.read_text()), signal.SIGKILL)
                except ProcessLookupError:
                    pass

    def supervisor(self, editor_code, *, timeout=5, mode=None, render=False):
        self.editor.write_text("#!" + sys.executable + "\n" + editor_code)
        self.editor.chmod(0o755)
        program = self.root / "supervisor.py"
        program.write_text(
            "import importlib.util,sys\nfrom pathlib import Path\n"
            "from types import SimpleNamespace\nfrom unittest.mock import patch\n"
            f"s=importlib.util.spec_from_file_location('runner',{str(Path(runner.__file__).resolve())!r})\n"
            "r=importlib.util.module_from_spec(s);s.loader.exec_module(r)\n"
            f"r.PROJECT=Path({str(self.project)!r});r.SETTINGS=Path({str(self.root / 'absent.json')!r})\n"
            "r.STOP_GRACE_SECONDS=.1\n"
            f"with patch.object(r.Path,'home',return_value=Path({str(self.root)!r})), "
            "patch.object(r.os,'uname',return_value=SimpleNamespace(release='linux')):\n"
            f" sys.exit(r.main({self.arguments + ['--timeout', str(timeout)] + (['--render'] if render else []) + (mode or ['python', str(self.script)])!r}))\n")
        return subprocess.Popen([sys.executable, str(program)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    def test_real_zero_exit_shader_failure_is_rejected_in_both_modes(self):
        # Actual UE5.8.4 diagnostics from #2421, 20261127T215602997730-2566723.
        fallback = ("[2026.11.27-22.01.21:628][  0]LogShaderCompilers: Warning: Failed to compile Material "
                    "/Game/Lunden/Lighting/M_LundenPrecipitation.M_LundenPrecipitation for platform "
                    "SF_VULKAN_SM5, Default Material will be used in game.")
        compiler = "\t/Engine/Generated/Material.ush:3828:15: error: redefinition of 'offset' with a different type: 'float' vs 'float2'"
        cases = ((fallback + "\n" + compiler, True), (compiler, False), (fallback, False))
        for index, (diagnostic, render) in enumerate(cases):
            with self.subTest(diagnostic=diagnostic, render=render):
                mode = ["tests"] if index == 2 else ["python", str(self.script)]
                editor = ("import json,sys\nfrom pathlib import Path\n"
                          f"text={diagnostic!r}\nprint(text,flush=True)\n"
                          "Path(next(a.split('=',1)[1] for a in sys.argv if a.startswith('-abslog='))).write_text(text)\n"
                          "report=next((a.split('=',1)[1] for a in sys.argv if a.startswith('-ReportExportPath=')),None)\n"
                          "if report:\n p=Path(report);p.mkdir();(p/'index.json').write_text(json.dumps({'succeeded':1,'failed':0,'notRun':0}))\n")
                p = self.supervisor(editor, mode=mode, render=render)
                stdout, stderr = p.communicate(timeout=10)
                self.assertEqual(p.returncode, 1, (stdout, stderr))
                result = json.loads(max((self.root / "data/runs").glob("*/result.json")).read_text())
                self.assertEqual(result["exitCode"], 0)  # Preserve the actual native exit.
                self.assertFalse(result["passed"])
                self.assertTrue(result["completed"])
                self.assertTrue(result["logErrors"])
                self.assertFalse(list((self.root / ".local/state/lunden-editor-slots").glob("slot-*")))

    def test_shader_cache_warnings_do_not_reject_success(self):
        log = ("LogShaderCompilers: Warning: Shader cache unavailable; compiling locally.\n"
               "LogMaterial: Warning: Missing cached shadermap, compiling.\n"
               "LogShaderCompilers: Warning: Shader compiler error: cache miss, retrying cache lookup.\n"
               "LogShaderCompilers: Display: Finished compiling Material, 0 errors.\n")
        self.assertEqual(self.invoke(["python", str(self.script)], log=log), 0)
        self.assertEqual(self.invoke(["tests"], log=log, report={"succeeded": 1, "failed": 0, "notRun": 0}), 0)

    def test_adopted_worker_cannot_forward_cleanup_term_to_supervisor(self):
        # The old cleanup reproducibly died with -SIGTERM before result.json.
        child = ("import os,signal,time;"
                 "signal.signal(signal.SIGTERM,lambda *_: (os.kill(os.getppid(),signal.SIGTERM),exit(0)));"
                 "print('ready',flush=True);time.sleep(30)")
        editor = ("import subprocess,sys\nfrom pathlib import Path\n"
                  "log=Path(next(a.split('=',1)[1] for a in sys.argv if a.startswith('-abslog=')))\n"
                  "log.write_text('Commandlet finished execution (result 0)')\n"
                  f"c=subprocess.Popen([sys.executable,'-c',{child!r}],start_new_session=True,stdout=subprocess.PIPE,text=True)\n"
                  "assert c.stdout.readline().strip()=='ready'\n")
        p = self.supervisor(editor)
        stdout, stderr = p.communicate(timeout=10)
        self.assertEqual(p.returncode, 0, (stdout, stderr))
        result = json.loads(next((self.root / "data/runs").glob("*/result.json")).read_text())
        self.assertTrue(result["completed"])
        self.assertTrue(result["passed"])
        self.assertEqual(result["exitCode"], 0)

    def test_external_cancellation_records_failure_and_releases_slot(self):
        pid_file = self.root / "editor.pid"
        editor = ("import os,signal,sys,time\nfrom pathlib import Path\n"
                  "signal.signal(signal.SIGTERM,signal.SIG_IGN)\n"
                  "Path(next(a.split('=',1)[1] for a in sys.argv if a.startswith('-abslog='))).write_text('Normal log')\n"
                  f"Path({str(pid_file)!r}).write_text(str(os.getpid()))\n"
                  "time.sleep(30)\n")
        for sig in (signal.SIGTERM, signal.SIGINT):
            with self.subTest(signal=sig):
                pid_file.unlink(missing_ok=True)
                p = self.supervisor(editor)
                try:
                    deadline = runner.time.monotonic() + 5
                    while not pid_file.exists():
                        self.assertLess(runner.time.monotonic(), deadline)
                        runner.time.sleep(.01)
                    editor_pid = int(pid_file.read_text())
                    pending = json.loads(max((self.root / "data/runs").glob("*/result.json")).read_text())
                    self.assertFalse(pending["completed"])
                    self.assertFalse(pending["passed"])
                    os.kill(p.pid, sig)
                    stdout, stderr = p.communicate(timeout=10)
                    self.assertEqual(p.returncode, 128 + sig, (stdout, stderr))
                    results = [json.loads(path.read_text()) for path in (self.root / "data/runs").glob("*/result.json")]
                    result = next(r for r in results if r.get("signal") == sig)
                    self.assertTrue(result["completed"])
                    self.assertFalse(result["passed"])
                    self.assertEqual(result["exitCode"], 128 + sig)
                    self.assertFalse(Path(f"/proc/{editor_pid}").exists())
                    self.assertFalse(list((self.root / ".local/state/lunden-editor-slots").glob("slot-*")))
                finally:
                    if p.poll() is None:
                        p.kill()
                        p.communicate()

    def test_cleanup_failure_still_records_failed_result(self):
        with patch.object(runner, "editor_slot", return_value=runner.contextlib.nullcontext()), \
                patch.object(runner, "run_process", side_effect=RuntimeError("cleanup failed")):
            self.assertEqual(runner.main(self.arguments + ["python", str(self.script)]), 1)
        result = json.loads(next((self.root / "data/runs").glob("*/result.json")).read_text())
        self.assertTrue(result["completed"])
        self.assertFalse(result["passed"])
        self.assertEqual(result["error"], "cleanup failed")

    def test_preexisting_service_is_not_an_invocation_child(self):
        foreign = subprocess.Popen([sys.executable, "-c", "import time;time.sleep(30)"], start_new_session=True)
        try:
            self.assertEqual(runner.run_process([sys.executable, "-c", "pass"], os.environ.copy(), 5), 0)
            self.assertIsNone(foreign.poll())
        finally:
            foreign.kill()
            foreign.wait()

    def test_owner_managed_daemon_uses_identity_and_sponsor_contract(self):
        # A real detached executable at the exact engine service path, not a name
        # match. Its owner/sponsor is responsible for its shared-service lifetime.
        service = self.editor.with_name("UnrealTraceServer")
        shutil.copy2(sys.executable, service)
        pid_file = self.root / "daemon.pid"
        daemon = f"import os,time;from pathlib import Path;Path({str(pid_file)!r}).write_text(str(os.getpid()));time.sleep(30)"
        editor = ("import os,subprocess,sys,time\nfrom pathlib import Path\n"
                  f"subprocess.Popen([{str(service)!r},'-c',{daemon!r},'fork','--sponsor='+str(os.getpid())],start_new_session=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)\n"
                  f"p=Path({str(pid_file)!r})\nwhile not p.exists():time.sleep(.01)\n")
        self.editor.write_text("#!" + sys.executable + "\n" + editor)
        self.editor.chmod(0o755)
        try:
            with patch.object(runner, "STOP_GRACE_SECONDS", .1):
                self.assertEqual(runner.run_process([str(self.editor)], os.environ.copy(), 5), 0)
            self.assertTrue(Path(f"/proc/{int(pid_file.read_text())}").exists())
        finally:
            if pid_file.exists():
                pid = int(pid_file.read_text())
                try:
                    os.kill(pid, signal.SIGKILL)
                    os.waitpid(pid, 0)
                except ProcessLookupError:
                    pass

    def test_daemon_name_without_matching_sponsor_is_cleaned(self):
        service = self.editor.with_name("UnrealTraceServer")
        shutil.copy2(sys.executable, service)
        pid_file = self.root / "daemon.pid"
        daemon = f"import os,time;from pathlib import Path;Path({str(pid_file)!r}).write_text(str(os.getpid()));time.sleep(30)"
        editor = ("import subprocess,time\nfrom pathlib import Path\n"
                  f"subprocess.Popen([{str(service)!r},'-c',{daemon!r},'fork','--sponsor=0'],start_new_session=True)\n"
                  f"p=Path({str(pid_file)!r})\nwhile not p.exists():time.sleep(.01)\n")
        self.editor.write_text("#!" + sys.executable + "\n" + editor)
        self.editor.chmod(0o755)
        try:
            with patch.object(runner, "STOP_GRACE_SECONDS", .1):
                self.assertEqual(runner.run_process([str(self.editor)], os.environ.copy(), 5), 0)
            self.assertFalse(Path(f"/proc/{int(pid_file.read_text())}").exists())
        finally:
            if pid_file.exists():
                try:
                    os.kill(int(pid_file.read_text()), signal.SIGKILL)
                except ProcessLookupError:
                    pass

    def test_daemon_name_and_sponsor_without_engine_identity_is_cleaned(self):
        service = self.root / "UnrealTraceServer"  # Outside the engine's Binaries directory.
        shutil.copy2(sys.executable, service)
        pid_file = self.root / "daemon.pid"
        daemon = f"import os,time;from pathlib import Path;Path({str(pid_file)!r}).write_text(str(os.getpid()));time.sleep(30)"
        editor = ("import os,subprocess,time\nfrom pathlib import Path\n"
                  f"subprocess.Popen([{str(service)!r},'-c',{daemon!r},'fork','--sponsor='+str(os.getpid())],start_new_session=True)\n"
                  f"p=Path({str(pid_file)!r})\nwhile not p.exists():time.sleep(.01)\n")
        self.editor.write_text("#!" + sys.executable + "\n" + editor)
        self.editor.chmod(0o755)
        try:
            with patch.object(runner, "STOP_GRACE_SECONDS", .1):
                self.assertEqual(runner.run_process([str(self.editor)], os.environ.copy(), 5), 0)
            self.assertFalse(Path(f"/proc/{int(pid_file.read_text())}").exists())
        finally:
            if pid_file.exists():
                try:
                    os.kill(int(pid_file.read_text()), signal.SIGKILL)
                except ProcessLookupError:
                    pass

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
