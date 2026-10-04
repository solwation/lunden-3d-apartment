#!/usr/bin/env python3
"""Stamp data/changelog.json for publishing (#341): python3 tools/changelog_stamp.py OUT_JSON

Each entry gets `t` = the committer time (unix s) of the commit that added it (its `"id": N` line, from the
file's git history; rewording an entry later does not count, see id_times). Committer time is set when a
commit lands (a rebase renews it), so it tracks when the change reached main; the entries are written newest
first by `t` (ties by id). The page orders the note and marks "Nytt" by `t`, so an id picked too low by a
slower parallel agent no longer hides the newest change.

Also checks that the ids are unique and strictly descending in file order. A slip only WARNS (a GitHub
::warning:: line) and never fails the deploy: an agent's entry that lands slightly out of order is put right
by the sort above anyway, and blocking the whole site over it would be worse. Outside git (or with no
history for an entry, e.g. not committed yet) entries get no `t` and the page falls back to file order and id.
Python stdlib only."""
import json
import re
import subprocess
import sys

SRC = 'data/changelog.json'
ID_LINE = re.compile(r'^([+-])\s*\{?\s*"id"\s*:\s*(\d+)')


def id_times():
    """id → committer time of the commit that added the entry, or {} without git history.
    One pass over the file's history, oldest first: a commit that adds a line with `"id": N` while N was not in
    the file before sets N's time; a commit that only rewords an entry (its line removed and added again) or
    reformats the file keeps it, so a typo fix never brings an old entry back to the top as "Nytt"."""
    try:
        txt = subprocess.run(['git', 'log', '--reverse', '--no-merges', '--format=@@C %ct', '-p', '--unified=0',
                              '--', SRC], capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError) as e:
        print(f'::warning::changelog: no git history ({e}), entries get no t', file=sys.stderr)
        return {}
    times, present = {}, set()

    def commit(ct, added, removed):
        for i in added - removed:
            if i not in present:
                times[i] = ct
        present.difference_update(removed - added)
        present.update(added)

    ct, added, removed = None, set(), set()
    for row in txt.split('\n'):
        if row.startswith('@@C '):
            if ct is not None:
                commit(ct, added, removed)
            ct, added, removed = int(row[4:]), set(), set()
            continue
        m = ID_LINE.match(row)
        if m:
            (added if m.group(1) == '+' else removed).add(int(m.group(2)))
    if ct is not None:
        commit(ct, added, removed)
    return times


def main():
    out = sys.argv[1]
    with open(SRC, encoding='utf-8') as f:
        entries = json.load(f)
    ids = [e['id'] for e in entries]
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup:
        print(f'::warning::changelog: duplicate ids {dup}', file=sys.stderr)
    bad = [(a, b) for a, b in zip(ids, ids[1:]) if b >= a]
    if bad:
        print(f'::warning::changelog: ids not strictly descending in file order at {bad} '
              '(renumber to max id + 1 at the top after the final rebase)', file=sys.stderr)
    t_of = id_times()
    for e in entries:
        if e['id'] in t_of:
            e['t'] = t_of[e['id']]
    if all('t' in e for e in entries):
        entries.sort(key=lambda e: (e['t'], e['id']), reverse=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write('[\n' + ',\n'.join('  ' + json.dumps(e, ensure_ascii=False) for e in entries) + '\n]\n')


if __name__ == '__main__':
    main()
