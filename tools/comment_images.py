#!/usr/bin/env python3
"""Check a Markdown issue comment before posting it (#1996): every image URL must be embedded as an image.

Usage:  python3 tools/comment_images.py comment.md      (or: ... - < comment.md)
Exit 0 when every .png/.jpg/.jpeg/.webp/.gif URL sits in a `![alt](url)` image, else 1 with the offending lines.
Catches the broken pattern seen on #1968: `[alt](`` url ``)` (no `!`, URL wrapped in backticks), and bare image URLs.
Links to images inside ordinary text links are allowed only when the line also embeds that image or with --allow-links.
"""
import re
import sys

IMG = r'https?://\S+?\.(?:png|jpe?g|webp|gif)(?:\?\S*?)?'
EMBED = re.compile(r'!\[[^\]]*\]\((' + IMG + r')\)')
ANY = re.compile(IMG, re.I)
BACKTICK_LINK = re.compile(r'\]\(\s*`')


def problems(text, allow_links=False):
    out = []
    fence = False
    for no, line in enumerate(text.split('\n'), 1):
        if line.lstrip().startswith('```') and not BACKTICK_LINK.search(line):
            fence = not fence
            continue
        if fence:
            continue
        if BACKTICK_LINK.search(line):
            out.append((no, 'link target wrapped in backticks', line))
            continue
        embedded = {m.group(1) for m in EMBED.finditer(line)}
        for m in ANY.finditer(line):
            url = m.group(0)
            if url in embedded:
                continue
            before = line[:m.start()]
            if allow_links and before.endswith('('):
                continue
            out.append((no, 'image URL not embedded as ![alt](url)', line))
            break
    return out


def main(argv):
    allow = '--allow-links' in argv
    args = [a for a in argv if a != '--allow-links']
    text = sys.stdin.read() if not args or args[0] == '-' else open(args[0], encoding='utf-8').read()
    found = problems(text, allow)
    for no, why, line in found:
        print(f'line {no}: {why}: {line.strip()[:160]}')
    if found:
        print('comment_images: FAIL — embed each image as ![alt](url) in its own paragraph (#1996)')
        return 1
    print('comment_images: OK')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
