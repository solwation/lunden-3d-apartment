#!/usr/bin/env python3
"""Check first-publication timestamps against an actual Git merge."""
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

STAMP = Path(__file__).with_name('changelog_stamp.py').resolve()


class ChangelogStampTest(unittest.TestCase):
    def test_merge_introduces_entries_and_preserves_existing_time(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)

            def git(*args, time=None):
                env = os.environ.copy()
                if time is not None:
                    env.update(GIT_AUTHOR_DATE=f'{time} +0000', GIT_COMMITTER_DATE=f'{time} +0000')
                subprocess.run(['git', *args], cwd=root, env=env, check=True, capture_output=True)

            def write_entries(*entries):
                rows = [json.dumps({'id': number, 'text': text}) for number, text in entries]
                (root / 'data/changelog.json').write_text('[\n' + ',\n'.join(rows) + '\n]\n', encoding='utf-8')
                git('add', 'data/changelog.json')

            git('init', '--initial-branch=main')
            git('config', 'user.name', 'Changelog test')
            git('config', 'user.email', 'test@example.invalid')
            git('config', 'commit.gpgsign', 'false')
            (root / 'data').mkdir()
            first, topic, merge, edit = 1_700_000_001, 1_700_000_002, 1_700_000_003, 1_700_000_004
            write_entries((1, 'Published first'))
            git('commit', '-m', 'Publish an entry', time=first)
            git('switch', '-c', 'topic')
            write_entries((2, 'Prepared on the topic branch'), (1, 'Published first'))
            git('commit', '-m', 'Prepare another entry', time=topic)
            git('switch', 'main')
            git('merge', '--no-ff', '--no-commit', 'topic', time=merge)
            write_entries((3, 'Added during the merge'), (2, 'Prepared on the topic branch'), (1, 'Reworded'))
            git('commit', '-m', 'Publish both new entries', time=merge)
            write_entries((3, 'Edited after publication'), (2, 'Prepared on the topic branch'), (1, 'Reworded'))
            git('commit', '-m', 'Edit a published entry', time=edit)

            out = root / 'stamped.json'
            subprocess.run([sys.executable, STAMP, out], cwd=root, check=True)
            stamped = json.loads(out.read_text(encoding='utf-8'))
            self.assertEqual([(row['id'], row['t']) for row in stamped], [(3, merge), (2, merge), (1, first)])


if __name__ == '__main__':
    unittest.main()
