"""Regression checks for scripts/prune-worktrees.sh in disposable repositories."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest


SCRIPT = Path(__file__).with_name("prune-worktrees.sh")
ENV = dict(
    os.environ,
    GIT_AUTHOR_NAME="test", GIT_AUTHOR_EMAIL="test@example.invalid",
    GIT_COMMITTER_NAME="test", GIT_COMMITTER_EMAIL="test@example.invalid",
    GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull,
)


def git(*args, cwd):
    return subprocess.run(["git", *args], cwd=cwd, env=ENV, check=True,
                          capture_output=True, text=True).stdout.strip()


@unittest.skipUnless(shutil.which("bash") and shutil.which("git"), "needs bash and git")
class PruneWorktreesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        git("init", "-q", "--bare", "-b", "main", "origin.git", cwd=self.tmp)
        git("clone", "-q", "origin.git", "main", cwd=self.tmp)
        self.main = self.tmp / "main"
        git("commit", "-q", "--allow-empty", "-m", "init", cwd=self.main)
        git("push", "-q", "origin", "main", cwd=self.main)
        self.root = self.tmp / "root"
        self.root.mkdir()

    def run_script(self, *args, cwd=None, issues=False, env=ENV):
        result = subprocess.run(
            ["bash", str(SCRIPT), *(() if issues else ("--no-issues",)), *args, str(self.root)],
            cwd=cwd or self.main, env=env, capture_output=True, text=True, check=True)
        rows = {}
        for line in result.stdout.splitlines()[1:]:
            fields = line.split()
            if fields and fields[0] in ("integrated", "active", "unproven", "protected"):
                rows[Path(fields[2].replace("~", str(Path.home()), 1)).name] = (fields[0], line)
        return rows, result.stdout

    def worktree(self, name, age_hours=0, claim=None):
        path = self.root / name
        git("worktree", "add", "-q", "--detach", str(path), "origin/main", cwd=self.main)
        gitdir = Path(git("rev-parse", "--absolute-git-dir", cwd=path))
        if claim:
            (gitdir / "orchestra-claim").write_text(f"issue={claim}\nsession=test\n")
        if age_hours:
            then = time.time() - age_hours * 3600
            for f in (gitdir / "HEAD", gitdir / "logs" / "HEAD"):
                os.utime(f, (then, then))
        return path

    def test_empty_root_reports_no_checkout_from_inside_a_clone(self):
        (self.root / "evidence").mkdir()  # a non-git folder only
        for args in ((), ("--apply",)):
            with self.subTest(args=args):
                rows, out = self.run_script(*args)
                self.assertEqual(rows, {})
                self.assertIn("checkouts: 0 ", out)
        self.assertTrue((self.main / ".git").is_dir())

    def test_fresh_and_claimed_checkouts_are_active(self):
        self.worktree("claimed", age_hours=3, claim="#57")
        self.worktree("fresh")
        self.worktree("old", age_hours=3)
        rows, _ = self.run_script()
        self.assertEqual(rows["claimed"][0], "active")
        self.assertEqual(rows["fresh"][0], "active")
        self.assertEqual(rows["old"][0], "integrated")
        rows, _ = self.run_script("--min-age", "0")
        self.assertEqual(rows["fresh"][0], "integrated")

    def test_apply_removes_only_integrated(self):
        claimed = self.worktree("claimed", age_hours=3, claim="#57")
        (claimed / "edit.txt").write_text("work in progress\n")
        fresh = self.worktree("fresh")
        old = self.worktree("old", age_hours=3)
        self.run_script("--apply", "--archive", str(self.tmp / "archive"))
        self.assertTrue(claimed.exists())
        self.assertTrue(fresh.exists())
        self.assertFalse(old.exists())
        self.assertFalse((self.tmp / "archive").exists())

    def test_open_issue_in_branch_name_is_active(self):
        bindir = self.tmp / "bin"
        bindir.mkdir()
        gh = bindir / "gh"  # stands in for GitHub: issues 7 and 57 are open
        gh.write_text('#!/bin/sh\ncase "$2" in */issues/7|*/issues/57) echo open ;;'
                      ' *) echo closed ;; esac\n')
        gh.chmod(0o755)
        env = dict(ENV, PATH=f"{bindir}{os.pathsep}{ENV['PATH']}")
        git("remote", "set-url", "origin", "https://github.com/example/demo.git", cwd=self.main)
        paths = {}
        for name in ("issue-7", "issue-57", "issue-8"):
            paths[name] = self.root / name
            git("worktree", "add", "-q", "-b", name, str(paths[name]), "origin/main",
                cwd=self.main)
            (paths[name] / "edit.txt").write_text("work in progress\n")
        args = ("--no-fetch", "--min-age", "0")
        rows, _ = self.run_script(*args, issues=True, env=env)
        self.assertEqual(rows["issue-7"][0], "active")
        self.assertEqual(rows["issue-57"][0], "active")
        self.assertEqual(rows["issue-8"][0], "unproven")
        archive = self.tmp / "archive"
        self.run_script(*args, "--apply", "--archive", str(archive), issues=True, env=env)
        self.assertTrue(paths["issue-7"].exists())
        self.assertTrue(paths["issue-57"].exists())
        self.assertFalse(paths["issue-8"].exists())
        self.assertTrue((archive / "root__issue-8.patch").exists())

    def test_apply_deletes_branch_delivered_as_cherry_pick(self):
        path = self.root / "issue-5"
        git("worktree", "add", "-q", "-b", "issue-5", str(path), "origin/main", cwd=self.main)
        (path / "f").write_text("a\n")
        git("add", "f", cwd=path)
        git("commit", "-q", "-m", "change (#5)", cwd=path)
        git("commit", "-q", "--allow-empty", "-m", "other", cwd=self.main)
        git("cherry-pick", "issue-5", cwd=self.main)
        git("push", "-q", "origin", "main", cwd=self.main)
        gitdir = Path(git("rev-parse", "--absolute-git-dir", cwd=path))
        then = time.time() - 3 * 3600
        for f in (gitdir / "HEAD", gitdir / "logs" / "HEAD"):
            os.utime(f, (then, then))
        rows, out = self.run_script("--apply")
        self.assertEqual(rows["issue-5"][0], "integrated")
        self.assertIn("integrated branch issue-5", out)
        self.assertFalse(path.exists())
        self.assertEqual(git("branch", "--list", "issue-5", cwd=self.main), "")


if __name__ == "__main__":
    unittest.main()
