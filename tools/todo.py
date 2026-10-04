#!/usr/bin/env python3
"""The repo's open issues → the TODO post-its on the fridge (#340): tools/todo.py OUT.json

Called by tools/stamp.sh when the site is published (stdlib only). Uses GITHUB_TOKEN when set (the Pages workflow),
else the public REST API (the repo is public). Writes [{ n, text, title, kind, inProgress }]: `text` = the issue's
"Lapp: …" line (src/todo.js cleans the title when it is empty), kind 'bugg' for a title starting with "Bugg" or a
`bug` label, else 'nytt'; pull requests are skipped. On any error it writes [] (no notes) and exits 0 so a
deploy never fails over it.
"""
import json
import os
import re
import sys
import urllib.request

REPO = os.environ.get('TODO_REPO', 'solwation/lunden-3d-apartment')
LAPP = re.compile(r'^\s*(?:\*\*)?Lapp:(?:\*\*)?\s*(.+?)\s*$', re.M | re.I)


def fetch(url):
    req = urllib.request.Request(url, headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'lunden-stamp'})
    token = os.environ.get('GITHUB_TOKEN')
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r), r.headers.get('Link', '')


def main(out):
    items = []
    try:
        url = f'https://api.github.com/repos/{REPO}/issues?state=open&per_page=100'
        while url:
            page, link = fetch(url)
            for i in page:
                if 'pull_request' in i:
                    continue
                labels = [l['name'] for l in i.get('labels', [])]
                if 'orkester' in labels:  # the orchestrators' shared status issue, not a todo
                    continue
                m = LAPP.search(i.get('body') or '')
                items.append({
                    'n': i['number'],
                    'text': m.group(1).strip().strip('"') if m else '',
                    'title': i['title'],
                    'kind': 'bugg' if re.match(r'\s*bugg', i['title'], re.I) or 'bug' in labels else 'nytt',
                    'inProgress': 'in-progress' in labels,
                })
            nxt = re.search(r'<([^>]+)>;\s*rel="next"', link)
            url = nxt.group(1) if nxt else None
    except Exception as e:  # no network, rate limit …: no notes rather than a failed deploy
        print(f'todo.py: {e}; writing no notes', file=sys.stderr)
        items = []
    items.sort(key=lambda t: -t['n'])
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=0)
        f.write('\n')
    print(f'todo.py: {len(items)} open issues → {out}', file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1])
