#!/usr/bin/env python3
"""Extract images the user pasted into a Claude Code chat (#1746).

Claude Code does not save pasted images as files; they live as base64 blocks in the
session transcript (~/.claude/projects/<project-dir>/<session>.jsonl). This writes each
distinct pasted image to a private output directory so it can be viewed, given a
descriptive name and committed under docs/ (CLAUDE.md, "Reference images").

Usage:
  python3 tools/pasted_images.py [--transcript FILE] [--out DIR]

Without --transcript the most recently modified transcript of this checkout's project
directory is used (the current session). Without --out, images go to
~/.local/state/lunden-pasted-images/<session>/ (mode 700). Only images the user pasted
(user messages, not tool results such as screenshots read by the agent) are extracted.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import sys

EXT = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp'}


def project_dir(cwd):
    """Claude Code names a project's transcript folder after its path with / and . as -."""
    return Path.home() / '.claude' / 'projects' / re.sub(r'[^A-Za-z0-9]', '-', str(cwd))


def latest_transcript(cwd):
    candidates = []
    for base in {Path(cwd).resolve(), Path(os.environ.get('PWD', cwd))}:
        folder = project_dir(base)
        if folder.is_dir():
            candidates += folder.glob('*.jsonl')
    if not candidates:
        sys.exit(f'No transcript found under {project_dir(Path(cwd).resolve())}; pass --transcript.')
    return max(candidates, key=lambda p: p.stat().st_mtime)


def pasted_images(transcript):
    """Yield (timestamp, media_type, bytes) for each image block in a user message.

    Mid-turn pastes arrive as a text block "[Image #N]" followed by the image inside a
    tool-result message, so image blocks in any user-role message count, but images
    nested inside tool_result content (the agent's own Read/screenshot output) do not.
    """
    with open(transcript, encoding='utf-8') as stream:
        for line in stream:
            try:
                record = json.loads(line)
            except ValueError:
                continue
            message = record.get('message')
            if not isinstance(message, dict) or message.get('role') != 'user':
                continue
            content = message.get('content')
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict) or block.get('type') != 'image':
                    continue
                source = block.get('source') or {}
                if source.get('type') != 'base64':
                    continue
                yield record.get('timestamp', ''), source.get('media_type', ''), base64.b64decode(source['data'])


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--transcript', type=Path, help='session .jsonl (default: newest for this checkout)')
    parser.add_argument('--out', type=Path, help='output directory (default: private state directory)')
    args = parser.parse_args()
    transcript = args.transcript or latest_transcript(Path.cwd())
    out = args.out or Path.home() / '.local' / 'state' / 'lunden-pasted-images' / transcript.stem
    out.mkdir(mode=0o700, parents=True, exist_ok=True)
    seen = set()
    for timestamp, media_type, data in pasted_images(transcript):
        digest = hashlib.sha256(data).hexdigest()
        if digest in seen:
            continue
        seen.add(digest)
        path = out / f'pasted-{len(seen)}-{digest[:8]}.{EXT.get(media_type, "bin")}'
        path.write_bytes(data)
        print(f'{path}\t{timestamp}\t{media_type}\t{len(data)} bytes')
    if not seen:
        print(f'No pasted images in {transcript}', file=sys.stderr)


if __name__ == '__main__':
    main()
