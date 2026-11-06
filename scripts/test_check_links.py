"""Regression checks for the repository's lightweight Markdown link checker."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("check-links.py")
SPEC = importlib.util.spec_from_file_location("check_links", SCRIPT)
check_links = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(check_links)


class ScanTests(unittest.TestCase):
    def scan(self, markdown):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "document.md"
            path.write_text(markdown, encoding="utf-8")
            return check_links.scan(path)

    def test_shorter_fences_stay_inside_outer_block(self):
        for marker in ("`", "~"):
            with self.subTest(marker=marker):
                anchors, links = self.scan(
                    f"{marker * 4}markdown\n{marker * 3}\n"
                    "# Hidden\n[example](missing.md)\n"
                    f"{marker * 3}\n{marker * 4}\n"
                    "# Visible\n[real](README.md)\n"
                )
                self.assertEqual(anchors, {"visible"})
                self.assertEqual(links, [(8, "README.md")])

    def test_fence_with_info_text_does_not_close_block(self):
        for marker in ("`", "~"):
            with self.subTest(marker=marker):
                _, links = self.scan(
                    f"{marker * 3}markdown\n{marker * 3}python\n"
                    "[example](missing.md)\n"
                    f"{marker * 3}\n[real](README.md)\n"
                )
                self.assertEqual(links, [(5, "README.md")])

    def test_other_marker_cannot_close_block(self):
        for opener, other in (("```", "~~~"), ("~~~", "```")):
            with self.subTest(opener=opener):
                _, links = self.scan(
                    f"{opener}\n{other}\n[example](missing.md)\n"
                    f"{opener}\n[real](README.md)\n"
                )
                self.assertEqual(links, [(5, "README.md")])

    def test_longer_indented_closer_allows_trailing_whitespace(self):
        for marker in ("`", "~"):
            with self.subTest(marker=marker):
                _, links = self.scan(
                    f"  {marker * 3}markdown\n[example](missing.md)\n"
                    f"   {marker * 5} \t\n[real](README.md)\n"
                )
                self.assertEqual(links, [(4, "README.md")])

    def test_unclosed_fence_hides_rest_of_document(self):
        self.assertEqual(self.scan("```\n# Hidden\n[example](missing.md)\n"),
                         (set(), []))

    def test_backtick_in_info_text_is_not_an_opening_fence(self):
        _, links = self.scan("```invalid`info\n[real](README.md)\n")
        self.assertEqual(links, [(2, "README.md")])

    def test_heading_collision_with_generated_suffix(self):
        anchors, _ = self.scan("# Foo\n# Foo\n# Foo-1\n# Foo\n")
        self.assertEqual(anchors, {"foo", "foo-1", "foo-1-1", "foo-2"})

    def test_heading_suffix_skips_existing_explicit_heading(self):
        anchors, _ = self.scan("# Foo\n# Foo-1\n# Foo\n# Foo\n")
        self.assertEqual(anchors, {"foo", "foo-1", "foo-2", "foo-3"})


class CommandTests(unittest.TestCase):
    def run_checker(self, markdown):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "README.md").write_text(markdown, encoding="utf-8")
            subprocess.run(["git", "init", "-q", directory], check=True)
            subprocess.run(["git", "add", "README.md"], cwd=root, check=True)
            return subprocess.run([sys.executable, "-B", str(SCRIPT)], cwd=root,
                                  capture_output=True, text=True)

    def test_nested_examples_and_collision_anchor_pass(self):
        result = self.run_checker(
            "````markdown\n```\n[example](missing.md)\n```\n````\n"
            "# Foo\n# Foo\n# Foo-1\n# Foo\n[real](#foo-1-1)\n"
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("OK: 1 relative links checked", result.stdout)

    def test_broken_link_after_info_text_is_reported(self):
        result = self.run_checker(
            "```markdown\n```python\n[example](ignored.md)\n```\n"
            "[real](missing.md)\n"
        )
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("README.md:5: missing file: missing.md", result.stdout)
        self.assertNotIn("ignored.md", result.stdout)


if __name__ == "__main__":
    unittest.main()
