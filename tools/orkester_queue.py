#!/usr/bin/env python3
"""Read-only fresh GitHub queue snapshot (#926); no cached-input or mutation mode."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess
import sys
import time
import unicodedata
import uuid

PRIORITIES = {'priority: high': 0, 'priority: medium': 1, 'priority: low': 2}


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds')


def clean(value, limit=80):
    text = ''.join(' ' if unicodedata.category(c).startswith('C') else c for c in str(value))
    return ' '.join(text.replace('|', '¦').split())[:limit]


def responses(raw):
    """Decode gh --include framing; plain --paginate may merge arrays in older gh."""
    raw = raw.decode('utf-8').replace('\r\n', '\n')
    decoder, offset, frames = json.JSONDecoder(), 0, []
    while offset < len(raw):
        while offset < len(raw) and raw[offset].isspace():
            offset += 1
        if offset == len(raw):
            break
        status = re.match(r'HTTP/\S+ (\d{3})[^\n]*\n', raw[offset:])
        if not status:
            raise ValueError('missing HTTP response status from gh --include')
        end = raw.find('\n\n', offset)
        if end < 0:
            raise ValueError('incomplete HTTP response headers')
        headers = {}
        for line in raw[offset + status.end():end].splitlines():
            key, separator, value = line.partition(':')
            if not separator:
                raise ValueError('malformed HTTP response header')
            headers[key.lower()] = value.strip()
        begin = end + 2
        while begin < len(raw) and raw[begin].isspace():
            begin += 1
        value, offset = decoder.raw_decode(raw, begin)
        frames.append({'status': int(status[1]), 'headers': headers, 'data': value,
                       'body_bytes': len(raw[begin:offset].encode('utf-8'))})
    if not frames or any(frame['status'] != 200 for frame in frames):
        raise ValueError('missing/non-200 HTTP response')
    return frames


def pages(value, kind):
    if not isinstance(value, list) or not value or any(not isinstance(p, list) for p in value):
        raise ValueError(f'{kind}: expected all paginated JSON arrays from gh --paginate')
    if any(len(p) != 100 for p in value[:-1]) or len(value[-1]) > 100:
        raise ValueError(f'{kind}: inconsistent per_page=100 pagination')
    items = [item for page in value for item in page]
    ids = [item.get('id') if isinstance(item, dict) else None for item in items]
    if any(type(i) is not int or i <= 0 for i in ids) or len(set(ids)) != len(ids):
        raise ValueError(f'{kind}: invalid/duplicate identifiers; snapshot may have shifted during pagination')
    return items


def queue_rows(issues):
    rows = []
    for issue in issues:
        labels = issue.get('labels')
        if not isinstance(labels, list) or any(not isinstance(l, dict) or not isinstance(l.get('name'), str) for l in labels):
            raise ValueError('issue has malformed labels')
        labels = [l['name'] for l in labels]
        if 'pull_request' in issue or issue.get('number') == 420 or 'orkester' in labels:
            continue
        number, created = issue.get('number'), issue.get('created_at')
        if type(number) is not int or number <= 0 or issue.get('state') != 'open':
            raise ValueError('open-issue listing contains invalid issue identity/state')
        if not isinstance(created, str) or not created.endswith('Z'):
            raise ValueError(f'#{number}: missing UTC created_at')
        stamp = datetime.fromisoformat(created.replace('Z', '+00:00'))
        priority_labels = [label for label in labels if label in PRIORITIES]
        if len(priority_labels) > 1:
            raise ValueError(f'#{number}: conflicting priority labels; cannot sort safely')
        priority = PRIORITIES[priority_labels[0]] if priority_labels else 1
        body = issue.get('body') or ''
        parents = re.findall(r'^\s*Del av\s+#(\d+)\b', body, flags=re.I | re.M)
        children = (issue.get('sub_issues_summary') or {}).get('total', 0)
        rows.append({'number': number, 'priority': priority, 'created_at': created,
                     'sort_time': stamp, 'title': issue.get('title', ''),
                     'active': 'in-progress' in labels,
                     'owners': [l for l in labels if l.startswith('orkester:')],
                     'parents': list(dict.fromkeys(parents)), 'children': children})
    rows.sort(key=lambda r: (r['priority'], r['sort_time'], r['number']))
    return rows


def table(rows):
    lines = ['Priority | Created UTC | Issue | Active / owner | Parent info only | Title',
             '--- | --- | --- | --- | --- | ---']
    for row in rows:
        status = ('in-progress; ' if row['active'] else '') + ', '.join(row['owners'])
        parent = ','.join('#' + p for p in row['parents'])
        if row['children']:
            parent += f" children:{row['children']}"
        lines.append(f"{['high', 'medium', 'low'][row['priority']]} | {row['created_at']} | "
                     f"#{row['number']} | {clean(status)} | {clean(parent)} | {clean(row['title'])}")
    return '\n'.join(lines) + '\n'


class Fetcher:
    def __init__(self, snapshot):
        self.snapshot = snapshot

    def get(self, endpoint, paginated=False):
        command = ['gh', 'api', '--method', 'GET', '-H', 'Cache-Control: no-cache', '--include']
        if paginated:
            command += ['--paginate']
        command.append(endpoint)
        start = time.monotonic()
        record = {'endpoint': endpoint, 'started_at': utc_now(), 'paginated': paginated}
        self.snapshot['requests'].append(record)
        try:
            result = subprocess.run(command, capture_output=True, timeout=120, check=False)
        except (OSError, subprocess.TimeoutExpired) as error:
            record['error'] = type(error).__name__
            raise ValueError(f'GET {endpoint}: {error}') from error
        record.update(elapsed_seconds=time.monotonic() - start, exit_code=result.returncode,
                      response_bytes=len(result.stdout), completed_at=utc_now())
        if result.returncode:
            record['partial_stdout'] = result.stdout.decode('utf-8', errors='replace')
            record['stderr'] = result.stderr.decode('utf-8', errors='replace')
            raise ValueError(f"GET {endpoint}: gh exit {result.returncode}: {clean(record['stderr'], 300)}")
        try:
            frames = responses(result.stdout)
            if paginated:
                for index, frame in enumerate(frames):
                    has_next = bool(re.search(r'rel="next"', frame['headers'].get('link', '')))
                    if has_next != (index < len(frames) - 1):
                        raise ValueError('incomplete/inconsistent pagination Link chain')
                data = [frame['data'] for frame in frames]
            else:
                if len(frames) != 1:
                    raise ValueError('multiple responses for a single issue request')
                data = frames[0]['data']
        except (ValueError, UnicodeError) as error:
            record['invalid_stdout'] = result.stdout.decode('utf-8', errors='replace')
            raise ValueError(f'GET {endpoint}: invalid HTTP/JSON: {error}') from error
        record['http'] = [{'status': f['status'], 'headers': f['headers'], 'body_bytes': f['body_bytes']} for f in frames]
        record['body_bytes'] = sum(f['body_bytes'] for f in frames)
        record['data'] = data  # All raw fields/pages, never a jq subset or latest-comments slice.
        if paginated:
            items = pages(data, endpoint)
            record.update(pages=len(data), total=len(items))
            return items
        if not isinstance(data, dict):
            raise ValueError(f'GET {endpoint}: expected issue object')
        record.update(pages=1)
        return data


def output_directory(value):
    directory = Path(value).expanduser().resolve()
    # .git is a file in linked worktrees; resolving symlinks prevents an in-repo alias.
    if any((parent / '.git').exists() for parent in (directory, *directory.parents)):
        raise ValueError('snapshot directory must be outside every Git repository/worktree')
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def save(directory, name, snapshot, failed=False):
    destination = directory / (name + ('.failed.json' if failed else '.json'))
    temporary = directory / (name + '.tmp')
    try:
        with temporary.open('x', encoding='utf-8') as stream:
            json.dump(snapshot, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
        temporary.rename(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return destination


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', default='solwation/lunden-3d-apartment')
    parser.add_argument('--issue', type=int, action='append', default=[], help='fetch current body and ALL comments; repeatable')
    parser.add_argument('--out-dir', default='/tmp/lunden-orkester-queue')
    args = parser.parse_args(argv)
    started = time.monotonic()
    snapshot = {'schema': 1, 'repo': args.repo, 'status': 'fetching', 'started_at': utc_now(),
                'completed_at': None, 'requests': [], 'selected': {}}
    directory = None
    name = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + uuid.uuid4().hex
    try:
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', args.repo) or any(i <= 0 for i in args.issue):
            raise ValueError('expected owner/repo and positive issue numbers')
        directory = output_directory(args.out_dir)
        fetch = Fetcher(snapshot)
        base = f'repos/{args.repo}/issues'
        issues = fetch.get(base + '?state=open&per_page=100', paginated=True)
        rows = queue_rows(issues)
        for number in dict.fromkeys([420, *args.issue]):
            issue = fetch.get(f'{base}/{number}')
            if issue.get('number') != number or 'pull_request' in issue:
                raise ValueError(f'#{number}: wrong issue/PR returned')
            expected = issue.get('comments')
            if type(expected) is not int or expected < 0:
                raise ValueError(f'#{number}: invalid comment total')
            comments = fetch.get(f'{base}/{number}/comments?per_page=100', paginated=True)
            if len(comments) < expected:
                raise ValueError(f'#{number}: fetched {len(comments)} comments, body advertised {expected}; not complete')
            snapshot['selected'][str(number)] = {'body_request': f'{base}/{number}',
                'comments_request': f'{base}/{number}/comments?per_page=100',
                'comments_advertised_at_body_fetch': expected, 'comments_fetched': len(comments)}
        compact = table(rows)
        snapshot.update(status='complete', completed_at=utc_now(),
                        metrics={'issue_records': len(issues), 'queue_issues': len(rows),
                                 'get_pages': sum(r['pages'] for r in snapshot['requests']),
                                 'gh_invocations': len(snapshot['requests']),
                                 'raw_response_bytes': sum(r['response_bytes'] for r in snapshot['requests']),
                                 'queue_body_bytes': snapshot['requests'][0]['body_bytes'],
                                 'selected_body_bytes': sum(r['body_bytes'] for r in snapshot['requests'][1:]),
                                 'table_bytes': len(compact.encode('utf-8')),
                                 'elapsed_seconds': time.monotonic() - started},
                        queue_numbers=[row['number'] for row in rows])
        path = save(directory, name, snapshot)
    except (ValueError, OSError) as error:
        snapshot.update(status='failed', completed_at=None, error=str(error), failed_at=utc_now())
        path = None
        if directory is not None:
            try:
                path = save(directory, name, snapshot, failed=True)
            except OSError:
                pass
        print(f'ERROR: no complete fresh snapshot: {clean(error, 500)}', file=sys.stderr)
        if path:
            print(f'Failed attempt (not fresh): {path}', file=sys.stderr)
        return 1
    print(compact, end='')
    print(f"Complete collection {snapshot['started_at']} → {snapshot['completed_at']} (not an atomic GitHub view)")
    print(f'Raw snapshot: {path}')
    print('Selected comment totals: ' + ', '.join(f'#{n}={d["comments_fetched"]}' for n, d in snapshot['selected'].items()))
    print('Measured on this collection: ' + json.dumps(snapshot['metrics'], ensure_ascii=False))
    print('Read selected raw bodies/ALL comments and #420 before choosing; parent info is not a blocker decision.')
    print('Every new choice/race reread requires a new invocation. No reservation or mutation was performed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
