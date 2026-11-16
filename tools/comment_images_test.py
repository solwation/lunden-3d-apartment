import os, sys, unittest
sys.path.insert(0, os.path.dirname(__file__))
from comment_images import problems

U = 'https://raw.githubusercontent.com/o/r/abc/docs/verification/1/x.png'


class CommentImages(unittest.TestCase):
    def test_embedded_image_ok(self):
        self.assertEqual(problems(f'Text\n\n![x]({U})\n'), [])

    def test_backtick_pattern_from_1968(self):
        self.assertEqual(len(problems(f'[66 m](`` {U}) ``\n[89 m](``` {U} ```)')), 2)

    def test_missing_bang(self):
        self.assertEqual(len(problems(f'[x]({U})')), 1)

    def test_bare_url(self):
        self.assertEqual(len(problems(f'see {U}')), 1)

    def test_link_allowed_with_flag(self):
        self.assertEqual(problems(f'([före]({U}?raw=true))', allow_links=True), [])

    def test_code_fence_ignored(self):
        self.assertEqual(problems(f'```\n[x](`` {U} ``)\n```'), [])

    def test_non_image_links_ok(self):
        self.assertEqual(problems('[README](https://github.com/o/r/blob/abc/README.md)'), [])


if __name__ == '__main__':
    unittest.main()
