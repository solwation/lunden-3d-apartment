#!/usr/bin/env python3
"""Tests for tools/image_retention.py (#1879)."""
from datetime import datetime, timedelta, timezone
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import image_retention as m  # noqa: E402

NOW = datetime(2026, 11, 6, tzinfo=timezone.utc)
GRACE = timedelta(days=30)


class IssueNumbers(unittest.TestCase):
    def test_paths(self):
        self.assertEqual(m.issue_numbers('docs/verification/1848/a.png'), (1848,))
        self.assertEqual(m.issue_numbers('docs/verification/1848-ui/diagnostics/a.png'), (1848,))
        self.assertEqual(m.issue_numbers('docs/validation/issue-1500-1503/a.png'), (1500, 1503))
        self.assertEqual(m.issue_numbers('docs/verification/1823/after/entrance.png'), (1823,))
        self.assertEqual(m.issue_numbers('docs/sekretar-bang-oppen.png'), ())
        self.assertEqual(m.issue_numbers('docs/references/karpvagen/a.jpg'), ())


class Classify(unittest.TestCase):
    FILES = [
        'docs/peab/flygbild-render.jpg',
        'docs/ingame-reports/abc.jpg',
        'docs/sekretar-bang-oppen.png',
        'docs/verification/100/open.png',
        'docs/verification/200/recent.png',
        'docs/verification/300/old.png',
        'docs/verification/300/README.md',
        'docs/verification/300/linked.png',
        'docs/validation/issue-400-401/half-open.png',
        'docs/verification/500/unknown.png',
    ]
    CLOSED = {200: NOW - timedelta(days=3), 300: NOW - timedelta(days=90), 400: NOW - timedelta(days=90)}

    def test_split(self):
        long_term, kept, loose, prunable = m.classify(self.FILES, {'linked.png'}, self.CLOSED, NOW, GRACE)
        self.assertEqual(long_term, ['docs/peab/flygbild-render.jpg', 'docs/ingame-reports/abc.jpg'])
        self.assertEqual(loose, ['docs/sekretar-bang-oppen.png'])
        self.assertEqual(prunable, ['docs/verification/300/old.png'])
        self.assertEqual(kept, ['docs/verification/100/open.png', 'docs/verification/200/recent.png',
                                'docs/verification/300/linked.png',
                                'docs/validation/issue-400-401/half-open.png',
                                'docs/verification/500/unknown.png'])

    def test_zero_grace_prunes_recent_closures(self):
        _, kept, _, prunable = m.classify(self.FILES, set(), self.CLOSED, NOW, timedelta(0))
        self.assertIn('docs/verification/200/recent.png', prunable)
        self.assertIn('docs/verification/300/linked.png', prunable)
        self.assertNotIn('docs/verification/100/open.png', prunable)


if __name__ == '__main__':
    unittest.main()
