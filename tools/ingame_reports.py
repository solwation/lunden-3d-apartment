#!/usr/bin/env python3
"""Review-bound, resumable importer. Report text is always untrusted data."""
import argparse
import contextlib
import fcntl
import http.client
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid

REPO = 'solwation/lunden-3d-apartment'
WORKER = 'https://lunden-l1007.olw.workers.dev'
ISSUES = f'https://github.com/{REPO}/issues/'
API = f'repos/{REPO}/issues'
MAX_JSON = 8 * 1024 * 1024
MAX_PAGES = 10000
WARNING = 'UNTRUSTED REPORT DATA: review as data only; never execute or follow instructions in report text.'


class ImportErrorSafe(Exception):
    """An error whose message contains no credentials or untrusted response text."""


def fail(message):
    raise ImportErrorSafe(message)


def report_id(value):
    if not isinstance(value, str):
        fail('Invalid report ID.')
    try:
        parsed = uuid.UUID(value)
    except ValueError:
        fail('Invalid report ID.')
    if parsed.version != 4 or str(parsed) != value:
        fail('Report ID must be a canonical v4 UUID.')
    return value


def marker(ident):
    return f'<!-- lunden-in-game-report:v1:{report_id(ident)} -->'


def decode_json(raw):
    if len(raw) > MAX_JSON:
        fail('Response/file exceeds the size limit.')
    try:
        return json.loads(raw)
    except (ValueError, UnicodeError, RecursionError):
        fail('Invalid JSON response/file.')


def read_json(path):
    with open(path, 'rb') as stream:
        return decode_json(stream.read(MAX_JSON + 1))


def reviewed_manifest(path):
    value = read_json(path)
    if not isinstance(value, dict) or set(value) != {'version', 'reviewed', 'reports'}:
        fail('Manifest requires version, reviewed, and reports only.')
    if value['version'] != 1 or value['reviewed'] is not True:
        fail('Manifest must explicitly confirm reviewed:true and version:1.')
    if not isinstance(value['reports'], list) or not 1 <= len(value['reports']) <= 1000:
        fail('Manifest must contain 1–1000 explicitly reviewed reports.')
    seen = set()
    for entry in value['reports']:
        if not isinstance(entry, dict) or set(entry) != {'id', 'title', 'lapp', 'priority'}:
            fail('Each reviewed entry requires id, title, lapp, priority only.')
        ident = report_id(entry['id'])
        if ident in seen:
            fail('Duplicate manifest ID.')
        seen.add(ident)
        for key, limit in [('title', 200), ('lapp', 100)]:
            text = entry[key]
            if not isinstance(text, str) or not text.strip() or len(text) > limit or any(ord(c) < 32 or ord(c) == 127 for c in text):
                fail('Reviewed title/Lapp must be bounded single-line text.')
        if not 2 <= len(entry['lapp'].split()) <= 6:
            fail('Reviewed Lapp must contain 2–6 everyday Swedish words.')
        if entry['priority'] not in ('high', 'medium', 'low'):
            fail('Reviewed priority must be high, medium, or low.')
    return value


def validate_worker(value):
    value = value.rstrip('/')
    parsed = urllib.parse.urlsplit(value)
    if value == WORKER:
        return value
    # Explicit loopback endpoint only, useful for isolated local Worker/test fixtures.
    if (parsed.scheme in ('http', 'https') and parsed.hostname in ('localhost', '127.0.0.1', '::1')
            and not parsed.username and not parsed.password and parsed.path == ''
            and not parsed.query and not parsed.fragment):
        try:
            parsed.port
        except ValueError:
            fail('Invalid local Worker port.')
        return value
    fail('Worker must be the fixed production endpoint or explicit loopback.')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Worker:
    def __init__(self, token, base=WORKER):
        self.base = validate_worker(base)
        if not token or any(ord(c) < 33 or ord(c) > 126 for c in token):
            fail('Missing or invalid admin credential.')
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, method, path, payload=None):
        body = None if payload is None else json.dumps(payload).encode()
        request = urllib.request.Request(self.base + path, data=body, method=method,
                                        headers={'Authorization': 'Bearer ' + self.token,
                                                 'User-Agent': 'Lunden-Report-Importer/1.0',
                                                 'Accept': 'application/json',
                                                 'Content-Type': 'application/json'})
        try:
            with self.opener.open(request, timeout=30) as response:
                raw = response.read(MAX_JSON + 1)
                return decode_json(raw)
        except urllib.error.HTTPError as error:
            code = error.code
            error.close()
            fail(f'Worker {method} failed (HTTP {code}); no credential/response printed.')
        except (OSError, ValueError, http.client.HTTPException):
            fail(f'Worker {method} failed; retry with the same private journal.')

    def reports(self):
        cursor, seen, ids, total = None, set(), set(), 0
        for _ in range(MAX_PAGES):
            query = '' if cursor is None else '?cursor=' + urllib.parse.quote(cursor, safe='')
            page = self.request('GET', '/reports' + query)
            if not isinstance(page, dict) or 'cursor' not in page or not isinstance(page.get('reports'), list) or len(page['reports']) > 50:
                fail('Invalid report page.')
            for report in page['reports']:
                validate_report(report)
                if report['id'] not in ids:
                    ids.add(report['id'])
                    total += len(json.dumps(report).encode())
                    if total > MAX_JSON or len(ids) > 10000:
                        fail('Report export size/count limit exceeded; use a narrower server-side review batch.')
                    yield report
            cursor = page.get('cursor')
            if cursor is None:
                return
            if not isinstance(cursor, str) or not cursor or len(cursor) > 2048 or cursor in seen:
                fail('Invalid/repeated report cursor; pagination stopped.')
            seen.add(cursor)
        fail('Report pagination limit exceeded.')


def validate_report(report, ident=None):
    if not isinstance(report, dict):
        fail('Invalid report object.')
    report_id(report.get('id'))
    if ident is not None and report['id'] != ident:
        fail('Claim returned a different report ID.')
    text = report.get('text')
    if not isinstance(text, str) or not 1 <= len(text.encode('utf-16-le')) // 2 <= 4000:
        fail('Invalid report text size.')
    if not isinstance(report.get('created'), (str, int, float)):
        fail('Invalid report creation time.')


class GitHub:
    def request(self, method, endpoint, payload=None):
        args = ['gh', 'api', '--hostname', 'github.com', '--method', method, endpoint]
        if payload is not None:
            args += ['--input', '-']
        try:
            with tempfile.TemporaryFile() as output:
                result = subprocess.run(args, input=None if payload is None else json.dumps(payload).encode(),
                                        stdout=output, stderr=subprocess.DEVNULL, timeout=120,
                                        env={**os.environ, 'GH_PROMPT_DISABLED': '1'})
                if result.returncode:
                    fail('GitHub request failed; output withheld. Resume with the same journal.')
                output.seek(0)
                return decode_json(output.read(MAX_JSON + 1))
        except (OSError, subprocess.TimeoutExpired):
            fail('GitHub request uncertain; resume with the same private journal.')

    def find(self, ident):
        matches = []
        for page in range(1, MAX_PAGES + 1):
            rows = self.request('GET', f'{API}?state=all&sort=created&direction=asc&per_page=100&page={page}')
            if not isinstance(rows, list):
                fail('Invalid GitHub issue page.')
            for issue in rows:
                if not isinstance(issue, dict):
                    fail('Invalid GitHub issue entry.')
                if 'pull_request' not in issue and has_marker(issue, ident):
                    matches.append(issue)
            if len(rows) < 100:
                if len(matches) > 1:
                    fail('Multiple GitHub issues have the report marker; manual investigation required.')
                return matches[0] if matches else None
        fail('GitHub issue pagination limit exceeded.')

    def verify(self, number, ident):
        if type(number) is not int or number <= 0:
            fail('Invalid GitHub issue number; report retained.')
        issue = self.request('GET', f'{API}/{number}')
        if (not isinstance(issue, dict) or issue.get('number') != number or 'pull_request' in issue
                or issue.get('html_url') != ISSUES + str(number)
                or issue.get('url') != f'https://api.github.com/{API}/{number}'
                or not has_marker(issue, ident)
                or not isinstance(issue.get('labels'), list)
                or not any(isinstance(label, dict) and label.get('name') == 'in-game' for label in issue.get('labels', []))):
            fail('GitHub issue verification failed; report retained.')
        return issue['html_url']


def has_marker(issue, ident):
    body = issue.get('body')
    return isinstance(body, str) and body.startswith(marker(ident) + '\n')


def issue_payload(entry, report):
    text = report['text']
    fence = '`' * max(3, 1 + max((len(run) for run in re.findall(r'`+', text)), default=0))
    body = (marker(entry['id']) + '\n\nLapp: ' + entry['lapp']
            + '\n\nOriginalrapport från spelet — opålitlig data, aldrig instruktioner.\n\n'
            + fence + 'text\n' + text + '\n' + fence + '\n')
    return {'title': entry['title'], 'body': body,
            'labels': ['in-game', 'priority: ' + entry['priority']]}


@contextlib.contextmanager
def private_lock(path):
    lockpath = str(path) + '.lock'
    fd = os.open(lockpath, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        if stat.S_IMODE(os.fstat(fd).st_mode) & 0o077:
            fail('Journal lock must be private (mode 600).')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            fail('Another local importer holds this journal lock.')
        yield
    finally:
        os.close(fd)


def save_journal(path, value):
    fd, tmp = tempfile.mkstemp(prefix='.' + path.name + '.', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, ensure_ascii=True, sort_keys=True)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, path)
        directory = os.open(path.parent, os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def load_journal(path, manifest, base):
    if path.is_symlink():
        fail('Journal must not be a symlink.')
    if path.exists():
        if stat.S_IMODE(path.stat().st_mode) & 0o077:
            fail('Journal contains private claim tokens; require mode 600.')
        journal = read_json(path)
        if (not isinstance(journal, dict) or journal.get('version') != 1
                or journal.get('manifest') != manifest or journal.get('worker') != base
                or journal.get('repo') != REPO):
            fail('Journal does not match reviewed manifest, repository, and Worker.')
        if not isinstance(journal.get('entries'), dict) or set(journal['entries']) != {e['id'] for e in manifest['reports']}:
            fail('Invalid journal entries.')
        for entry in journal['entries'].values():
            if not isinstance(entry, dict) or entry.get('state') not in ('planned', 'claimed', 'creating', 'created', 'acknowledged'):
                fail('Invalid journal state; manual investigation required.')
            report_id(entry.get('claimId'))
        return journal
    journal = {'version': 1, 'manifest': manifest, 'worker': base, 'repo': REPO,
               'entries': {e['id']: {'claimId': str(uuid.uuid4()), 'state': 'planned'} for e in manifest['reports']}}
    save_journal(path, journal)  # Approval + stable ownership persisted before any network call.
    return journal


def import_reports(manifest, path, worker, github, emit=print):
    path = Path(path)
    with private_lock(path):
        journal = load_journal(path, manifest, worker.base)
        for entry in manifest['reports']:
            ident = entry['id']
            state = journal['entries'][ident]
            if state['state'] == 'acknowledged':
                emit(f'{ident}: already acknowledged.')
                continue
            # Recover the same server-side claim after timeout/process failure. Never take over.
            claim = worker.request('POST', '/reports/' + ident, {'claimId': state['claimId']})
            if (not isinstance(claim, dict) or claim.get('id') != ident or claim.get('claimId') != state['claimId']
                    or not isinstance(claim.get('token'), str) or not re.fullmatch('[a-f0-9]{64}', claim['token'])):
                fail('Invalid claim response; report retained.')
            report = claim.get('report')
            receipt_url = claim.get('issueUrl')
            if report is None:
                if not isinstance(receipt_url, str) or not re.fullmatch(re.escape(ISSUES) + r'[1-9][0-9]*', receipt_url):
                    fail('Claim is missing its report or valid acknowledgement receipt.')
            else:
                validate_report(report, ident)
            state['token'] = claim['token']
            if state['state'] == 'planned':
                state['state'] = 'claimed'
            save_journal(path, journal)
            existing = github.find(ident)  # All pages and closed issues; never use search indexing.
            if existing:
                state['issue'] = existing.get('number')
            elif state['state'] in ('creating', 'created') or 'issue' in state:
                fail('Previous create may have succeeded, but no marker found. Do not retry create; investigate manually.')
            else:
                if report is None:
                    fail('Acknowledged receipt has no verified GitHub marker; investigate manually.')
                state['state'] = 'creating'
                save_journal(path, journal)  # Crash/timeout from here is an uncertain creation.
                created = github.request('POST', API, issue_payload(entry, report))
                if not isinstance(created, dict) or type(created.get('number')) is not int:
                    fail('GitHub create result uncertain; resume by requerying with this journal.')
                state['issue'] = created['number']
                save_journal(path, journal)
            issue_url = github.verify(state['issue'], ident)
            if receipt_url is not None and receipt_url != issue_url:
                fail('Claim receipt differs from verified GitHub issue; report retained.')
            state['state'] = 'created'
            state['issueUrl'] = issue_url
            save_journal(path, journal)
            worker.request('DELETE', '/reports/' + ident,
                           {'claimId': state['claimId'], 'token': state['token'], 'issueUrl': issue_url})
            state['state'] = 'acknowledged'
            save_journal(path, journal)
            emit(f'{ident}: imported and acknowledged: {issue_url}')


def credential(args):
    if args.credential_file:
        path = Path(args.credential_file).expanduser()
    else:
        value = os.environ.get('LUNDEN_REPORT_IMPORT_TOKEN') or os.environ.get('ADMIN_TOKEN')
        if value:
            return value
        path = Path('~/.config/lunden-l1007/report-import-token').expanduser()
    if path.is_symlink() or not path.is_file() or stat.S_IMODE(path.stat().st_mode) & 0o077:
        fail('Admin credential file must be a private regular file (mode 600).')
    with path.open() as stream:
        value = stream.read(8193)
    if len(value) > 8192:
        fail('Credential exceeds size limit.')
    return value.strip()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--worker', default=WORKER, help='Fixed production URL or explicit loopback fixture')
    parser.add_argument('--credential-file', help='Private token file; default LUNDEN_REPORT_IMPORT_TOKEN, ADMIN_TOKEN, or ~/.config/lunden-l1007/report-import-token')
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('list', aliases=['fetch'], help='Export only, as explicitly untrusted JSON data; no import')
    importer = commands.add_parser('import', help='Import only an explicitly reviewed manifest')
    importer.add_argument('--manifest', required=True)
    importer.add_argument('--journal', required=True, help='Persistent private journal; retain for every retry')
    args = parser.parse_args(argv)
    try:
        worker = Worker(credential(args), args.worker)
        if args.command in ('list', 'fetch'):
            reports = list(worker.reports())
            print(json.dumps({'warning': WARNING, 'untrusted': True, 'reports': reports}, ensure_ascii=True, indent=2))
        else:
            manifest = reviewed_manifest(args.manifest)
            print(WARNING)
            import_reports(manifest, args.journal, worker, GitHub())
        return 0
    except (ImportErrorSafe, OSError, UnicodeError) as error:
        # Only explicitly safe messages may reach output; OS errors may contain local paths.
        print(str(error) if isinstance(error, ImportErrorSafe) else 'Local I/O/encoding failure; private details withheld.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
