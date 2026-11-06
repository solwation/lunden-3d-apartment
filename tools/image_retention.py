#!/usr/bin/env python3
"""List or prune committed issue images per the retention rules (#1879).

Rules (CLAUDE.md "Image retention", docs/development/verification.md "Image retention"):

* Long-term material is never touched here: `docs/peab/`, `docs/foton/`, `docs/references/`,
  `docs/ingame-reports/` (the report importer checks those paths on main), `textures/`, `icons/`,
  and any image referenced by name from a text file outside the issue directories
  (README.md, docs/development, src, tools, data...).
* Issue evidence under `docs/verification/<N>[-suffix]/` and `docs/validation/issue-N[-M]/`
  is kept while any named issue is open and for a grace period after it closes; afterwards the
  images are pruned and the text files (README, manifests, logs) stay.
* Loose `docs/<name>.<ext>` images are reference material or bug/before screenshots. The tool only
  reports loose images that nothing references (`--loose`); deciding which of them are product or
  site references worth keeping is a manual review, so they are never pruned automatically.

Usage:
  python3 tools/image_retention.py              # report counts/sizes and prunable candidates
  python3 tools/image_retention.py --loose      # also list unreferenced loose docs images
  python3 tools/image_retention.py --prune      # git rm the candidates (closed > --grace days)
  python3 tools/image_retention.py --grace 0    # treat every closed issue as expired

Issue states come from `gh issue list --state closed` (one paginated call). An issue whose
state is unknown counts as open, so nothing is pruned without evidence. Run from the
repository root of an ext4 checkout; commit the removal with the housekeeping issue reference.
"""
import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys

IMAGE_EXT = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.mp4', '.webm')
TEXT_EXT = ('.md', '.js', '.cjs', '.mjs', '.json', '.html', '.txt', '.yml', '.yaml', '.css', '.sh', '.py', '.csv')
LONG_TERM_PREFIXES = ('docs/peab/', 'docs/foton/', 'docs/references/', 'docs/ingame-reports/', 'textures/', 'icons/')
ISSUE_DIR = re.compile(r'^docs/(?:verification/|validation/issue-)([0-9][0-9-]*)(?:[^/]*)/')
NUMBER = re.compile(r'[0-9]+')
DEFAULT_GRACE_DAYS = 30


def git_files(root):
    out = subprocess.run(['git', 'ls-files', '-z'], cwd=root, check=True, capture_output=True).stdout
    return [p for p in out.decode('utf-8', 'surrogateescape').split('\0') if p]


def issue_numbers(path):
    """Issue numbers an evidence path belongs to, or () for anything else.

    `docs/verification/1848-ui/x.png` -> (1848,); `docs/validation/issue-1500-1503/x.png` -> (1500, 1503).
    """
    m = ISSUE_DIR.match(path)
    if not m:
        return ()
    return tuple(int(n) for n in NUMBER.findall(m.group(1)))


def is_image(path):
    return path.lower().endswith(IMAGE_EXT)


def referenced_basenames(root, files):
    """Basenames mentioned in any tracked text file outside the issue evidence directories."""
    names = set()
    candidates = {os.path.basename(p) for p in files if is_image(p)}
    for p in files:
        if not p.lower().endswith(TEXT_EXT) or issue_numbers(p):
            continue
        try:
            text = Path(root, p).read_text(encoding='utf-8', errors='replace')
        except OSError:
            continue
        for name in candidates:
            if name in text:
                names.add(name)
    return names


def closed_issues(root):
    """{number: closed_at datetime} for every closed issue, via gh."""
    out = subprocess.run(
        ['gh', 'issue', 'list', '--state', 'closed', '--limit', '5000', '--json', 'number,closedAt'],
        cwd=root, check=True, capture_output=True, text=True).stdout
    result = {}
    for item in json.loads(out):
        when = item.get('closedAt')
        if when:
            result[int(item['number'])] = datetime.fromisoformat(when.replace('Z', '+00:00'))
    return result


def classify(files, referenced, closed, now, grace):
    """Split tracked image paths into kept long-term, kept (open/recent/referenced) and prunable."""
    prunable, kept_evidence, loose, long_term = [], [], [], []
    for p in files:
        if not is_image(p):
            continue
        if p.startswith(LONG_TERM_PREFIXES):
            long_term.append(p)
            continue
        numbers = issue_numbers(p)
        if not numbers:
            loose.append(p)
            continue
        if os.path.basename(p) in referenced:
            kept_evidence.append(p)
            continue
        expired = all(n in closed and closed[n] + grace <= now for n in numbers)
        (prunable if expired else kept_evidence).append(p)
    return long_term, kept_evidence, loose, prunable


def total_size(root, paths):
    size = 0
    for p in paths:
        try:
            size += Path(root, p).stat().st_size
        except OSError:
            pass
    return size


def mb(size):
    return f'{size / 1e6:.1f} MB'


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--root', default='.', help='repository root (default: current directory)')
    ap.add_argument('--grace', type=int, default=DEFAULT_GRACE_DAYS, help='days after closing before pruning')
    ap.add_argument('--prune', action='store_true', help='git rm the prunable images')
    ap.add_argument('--loose', action='store_true', help='list unreferenced loose docs images for manual review')
    args = ap.parse_args(argv)
    root = os.path.abspath(args.root)
    files = git_files(root)
    referenced = referenced_basenames(root, files)
    closed = closed_issues(root)
    now = datetime.now(timezone.utc)
    long_term, kept, loose, prunable = classify(files, referenced, closed, now, timedelta(days=args.grace))
    print(f'long-term material: {len(long_term)} files, {mb(total_size(root, long_term))}')
    print(f'issue evidence kept (open, within {args.grace} days or referenced): {len(kept)} files, {mb(total_size(root, kept))}')
    print(f'loose docs images: {len(loose)} files, {mb(total_size(root, loose))}')
    print(f'prunable issue images: {len(prunable)} files, {mb(total_size(root, prunable))}')
    for p in prunable:
        print('  prune', p)
    if args.loose:
        unreferenced = [p for p in loose if os.path.basename(p) not in referenced]
        print(f'unreferenced loose docs images (manual review): {len(unreferenced)} files, {mb(total_size(root, unreferenced))}')
        for p in unreferenced:
            print('  review', p)
    if args.prune and prunable:
        subprocess.run(['git', 'rm', '-q', '--'] + prunable, cwd=root, check=True)
        print(f'removed {len(prunable)} files from the index; review `git status` and commit with the issue reference')
    return 0


if __name__ == '__main__':
    sys.exit(main())
