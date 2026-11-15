"""Regression checks for scripts/check-release.sh in a disposable repository."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("check-release.sh")
ENV = dict(
    os.environ,
    GIT_AUTHOR_NAME="test", GIT_AUTHOR_EMAIL="test@example.invalid",
    GIT_COMMITTER_NAME="test", GIT_COMMITTER_EMAIL="test@example.invalid",
    GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull,
)
PINNED = ("README.md", "INSTALL.md", "docs/index.html")


def pin(version):
    return ("git subtree add --prefix=.orchestra/shared \\\n"
            f"  https://github.com/solwation/dirigenten-och-orkestern.git {version} --squash\n")


@unittest.skipUnless(shutil.which("sh") and shutil.which("git"), "needs sh and git")
class CheckReleaseTests(unittest.TestCase):
    """The script checks the repository it lives in, so each test builds a small copy."""

    def setUp(self):
        self.repo = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.repo, ignore_errors=True)
        (self.repo / "scripts").mkdir()
        (self.repo / "docs").mkdir()
        shutil.copy(SCRIPT, self.repo / "scripts" / SCRIPT.name)
        for name in PINNED:
            (self.repo / name).write_text(pin("v0.10.0"))
        (self.repo / "CHANGELOG.md").write_text(
            "# Changelog\n\n## Unreleased\n\n## 0.10.0 — 2026-01-02\n\n## 0.9.0 — 2026-01-01\n")
        self.releases = self.repo / "releases.txt"
        self.releases.write_text("v0.10.0\nv0.9.0\n")
        subprocess.run(["git", "init", "-q", "-b", "main"], cwd=self.repo, env=ENV, check=True)
        subprocess.run(["git", "commit", "-q", "--allow-empty", "-m", "init"],
                       cwd=self.repo, env=ENV, check=True)
        for tag in ("v0.9.0", "v0.10.0"):  # v0.10.0 is the latest by version, not by name
            subprocess.run(["git", "tag", tag], cwd=self.repo, env=ENV, check=True)

    def run_script(self):
        # RELEASES_FILE stands in for the GitHub release list, so no network is used
        return subprocess.run(
            ["sh", str(self.repo / "scripts" / SCRIPT.name)],
            cwd=self.repo, env=dict(ENV, RELEASES_FILE=str(self.releases)),
            capture_output=True, text=True)

    def test_consistent_release_passes(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("OK: pins, releases and CHANGELOG match v0.10.0", result.stdout)

    def test_stale_pin_fails_for_each_pinned_file(self):
        for name in PINNED:
            with self.subTest(file=name):
                (self.repo / name).write_text(pin("v0.9.0"))
                result = self.run_script()
                self.assertEqual(result.returncode, 1)
                self.assertIn(f"{name}: pin v0.9.0 differs from latest tag v0.10.0",
                              result.stdout)
                (self.repo / name).write_text(pin("v0.10.0"))

    def test_missing_pin_fails(self):
        (self.repo / "docs" / "index.html").write_text("<p>no install command</p>\n")
        result = self.run_script()
        self.assertEqual(result.returncode, 1)
        self.assertIn("docs/index.html: no version pin found", result.stdout)

    def test_tag_without_release_fails(self):
        self.releases.write_text("v0.10.0\n")
        result = self.run_script()
        self.assertEqual(result.returncode, 1)
        self.assertIn("v0.9.0: tag has no GitHub release", result.stdout)

    def test_missing_changelog_heading_fails(self):
        (self.repo / "CHANGELOG.md").write_text("# Changelog\n\n## 0.9.0 — 2026-01-01\n")
        result = self.run_script()
        self.assertEqual(result.returncode, 1)
        self.assertIn("CHANGELOG.md: no '## 0.10.0 — YYYY-MM-DD' heading for v0.10.0",
                      result.stdout)


if __name__ == "__main__":
    unittest.main()
