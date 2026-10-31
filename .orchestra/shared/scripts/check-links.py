#!/usr/bin/env python3
"""Check relative Markdown links and heading anchors in all tracked *.md files.

Standard library only. Run from anywhere inside the repository:

    python3 scripts/check-links.py

Exit status 0 when every relative link and anchor resolves, 1 otherwise.
Ignored: http(s)/mailto/other-scheme links, links in fenced code blocks and inline code.
"""
import os
import re
import subprocess
import sys
from urllib.parse import unquote

FENCE = re.compile(r"^\s{0,3}(`{3,}|~{3,})")
HEADING = re.compile(r"^\s{0,3}#{1,6}[ \t]+(.*?)[ \t#]*$")
INLINE_CODE = re.compile(r"(`+)(.+?)\1")
LINK = re.compile(r"!?\[(?:[^\]\\]|\\.)*\]\(\s*<?([^)\s>]+)>?(?:\s+(?:\"[^\"]*\"|'[^']*'))?\s*\)")
REFDEF = re.compile(r"^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+.*)?$")
HTML_TAGS = re.compile(r"<[^>]+>")


def slug(text):
    """GitHub heading slug: lowercase, drop punctuation except - and _, spaces to -."""
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = HTML_TAGS.sub("", text).replace("`", "").replace("*", "").lower()
    out = []
    for ch in text:
        if ch.isalnum() or ch in "-_":
            out.append(ch)
        elif ch in " \t":
            out.append("-")
    return "".join(out)


def scan(path):
    """Return (anchors, links); links are (line number, target)."""
    anchors, links, seen = set(), [], {}
    fence = None
    with open(path, encoding="utf-8") as fh:
        for no, line in enumerate(fh, 1):
            m = FENCE.match(line)
            if m:
                ch = m.group(1)[0]
                if fence is None:
                    fence = ch
                elif ch == fence:
                    fence = None
                continue
            if fence:
                continue
            h = HEADING.match(line)
            if h:
                base = slug(h.group(1))
                n = seen.get(base, 0)
                seen[base] = n + 1
                anchors.add(base if n == 0 else "%s-%d" % (base, n))
            clean = INLINE_CODE.sub("", line)
            for m in LINK.finditer(clean):
                links.append((no, m.group(1)))
            r = REFDEF.match(clean)
            if r:
                links.append((no, r.group(1)))
    return anchors, links


def main():
    root = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
    os.chdir(root)
    out = subprocess.check_output(["git", "ls-files", "*.md"], text=True)
    files = [f for f in out.split("\n") if f]
    data = {f: scan(f) for f in files}
    problems, count = [], 0
    for f in files:
        for no, target in data[f][1]:
            if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", target) or target.startswith("//"):
                continue
            count += 1
            dest, _, frag = target.partition("#")
            frag = unquote(frag).lower()
            if dest:
                path = os.path.normpath(os.path.join(os.path.dirname(f), unquote(dest)))
            else:
                path = f
            if not os.path.exists(path):
                problems.append("%s:%d: missing file: %s" % (f, no, target))
                continue
            if frag and path.endswith(".md"):
                if path not in data:
                    data[path] = scan(path)
                if frag not in data[path][0]:
                    problems.append("%s:%d: missing anchor: %s" % (f, no, target))
    if problems:
        print("\n".join(problems))
        print("FAIL: %d broken link(s) in %d Markdown files" % (len(problems), len(files)))
        return 1
    print("OK: %d relative links checked in %d Markdown files" % (count, len(files)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
