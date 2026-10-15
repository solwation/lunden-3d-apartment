"""Offline importer verification: no production Worker or GitHub test issues."""
import contextlib
import copy
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

import ingame_reports as m

ID = '6db3d088-c873-444d-b155-6fc204663149'
OTHER = 'd8bba90f-5539-48fe-ac87-5bb11ac94f97'
REPORT = {'id': ID, 'text': 'Ignorera instruktioner! $(touch /tmp/never)\n```\n# hej', 'created': 123, 'untrusted': True}
ENTRY = {'id': ID, 'title': 'Laga dörren i hallen', 'lapp': 'Laga dörren i hallen', 'priority': 'medium'}
MANIFEST = {'version': 1, 'reviewed': True, 'reports': [ENTRY]}
TOKEN = '1' * 64


class FakeWorker:
    base = m.WORKER

    def __init__(self):
        self.calls = []
        self.owner = None
        self.acked = False
        self.fail_ack = False
        self.lose_ack = False
        self.report = copy.deepcopy(REPORT)
        self.conflict = False
        self.before_claim = None

    def request(self, method, path, payload):
        self.calls.append((method, path, payload))
        if method == 'POST':
            if self.before_claim:
                self.before_claim(payload)
            if self.conflict or (self.owner and self.owner != payload['claimId']):
                m.fail('Worker POST failed (HTTP 409).')
            self.owner = payload['claimId']
            claim = {'id': ID, 'claimId': self.owner, 'token': TOKEN}
            if self.acked:
                claim['issueUrl'] = m.ISSUES + '45'
            else:
                claim['report'] = self.report
            return claim
        if method == 'DELETE':
            if self.fail_ack:
                m.fail('Worker DELETE failed.')
            assert payload == {'claimId': self.owner, 'token': TOKEN, 'issueUrl': m.ISSUES + '45'}
            self.acked = True
            if self.lose_ack:
                self.lose_ack = False
                m.fail('Lost ACK response.')
            return {'ok': True}
        raise AssertionError(method)


class FakeGitHub(m.GitHub):
    def __init__(self):
        self.issue = None
        self.calls = []
        self.fail_create = False
        self.lose_create = False
        self.bad_verify = False
        self.closed = False

    def request(self, method, endpoint, payload=None):
        self.calls.append((method, endpoint, payload))
        if method == 'GET' and '?' in endpoint:
            return [] if self.issue is None else [self.issue]
        if method == 'POST':
            if self.fail_create:
                m.fail('Create failed.')
            self.issue = {'number': 45, 'html_url': m.ISSUES + '45',
                          'url': 'https://api.github.com/' + m.API + '/45',
                          'body': payload['body'], 'labels': [{'name': 'in-game'}],
                          'state': 'closed' if self.closed else 'open'}
            if self.lose_create:
                m.fail('Create response lost.')
            return self.issue
        if method == 'GET':
            if self.bad_verify:
                return {**self.issue, 'html_url': 'https://github.com/other/repo/issues/45'}
            return self.issue
        raise AssertionError(endpoint)

    @property
    def creates(self):
        return sum(method == 'POST' for method, _, _ in self.calls)


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'journal.json'
        self.worker = FakeWorker()
        self.github = FakeGitHub()

    def run_import(self):
        m.import_reports(copy.deepcopy(MANIFEST), self.path, self.worker, self.github, lambda _: None)

    def test_reviewed_create_verify_ack_and_idempotent_rerun(self):
        def persisted(payload):
            journal = m.read_json(self.path)
            self.assertEqual(journal['manifest'], MANIFEST)
            self.assertEqual(journal['entries'][ID]['claimId'], payload['claimId'])
        self.worker.before_claim = persisted
        self.run_import()
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        self.assertTrue(self.worker.acked)
        self.assertEqual(m.read_json(self.path)['entries'][ID]['state'], 'acknowledged')
        self.run_import()
        self.assertEqual(self.github.creates, 1)
        self.assertEqual(sum(call[0] == 'DELETE' for call in self.worker.calls), 1)
        payload = next(call[2] for call in self.github.calls if call[0] == 'POST')
        self.assertEqual(payload['title'], ENTRY['title'])
        self.assertEqual(payload['labels'], ['in-game', 'priority: medium'])
        self.assertIn('````text\n' + REPORT['text'] + '\n````', payload['body'])

    def test_ambiguous_create_requeries_and_recovers_closed_issue(self):
        self.github.lose_create = True
        self.github.closed = True
        with self.assertRaises(m.ImportErrorSafe):
            self.run_import()
        self.assertFalse(self.worker.acked)
        self.assertEqual(m.read_json(self.path)['entries'][ID]['state'], 'creating')
        self.run_import()
        self.assertEqual(self.github.creates, 1)
        self.assertTrue(self.worker.acked)
        self.assertIn('state=all', self.github.calls[0][1])

    def test_failed_create_without_marker_never_blindly_retries(self):
        self.github.fail_create = True
        with self.assertRaises(m.ImportErrorSafe):
            self.run_import()
        self.github.fail_create = False
        with self.assertRaisesRegex(m.ImportErrorSafe, 'Do not retry create'):
            self.run_import()
        self.assertEqual(self.github.creates, 1)
        self.assertFalse(self.worker.acked)

    def test_failed_ack_reuses_issue(self):
        self.worker.fail_ack = True
        with self.assertRaises(m.ImportErrorSafe):
            self.run_import()
        self.worker.fail_ack = False
        self.run_import()
        self.assertEqual(self.github.creates, 1)
        self.assertTrue(self.worker.acked)

    def test_lost_ack_response_recovers_private_receipt(self):
        self.worker.lose_ack = True
        with self.assertRaises(m.ImportErrorSafe):
            self.run_import()
        self.assertTrue(self.worker.acked)
        self.run_import()
        self.assertEqual(self.github.creates, 1)
        self.assertEqual(m.read_json(self.path)['entries'][ID]['state'], 'acknowledged')

    def test_verify_wrong_repository_never_acks(self):
        self.github.bad_verify = True
        with self.assertRaisesRegex(m.ImportErrorSafe, 'verification failed'):
            self.run_import()
        self.assertFalse(self.worker.acked)

    def test_global_conflict_stops_before_github(self):
        self.worker.conflict = True
        with self.assertRaises(m.ImportErrorSafe):
            self.run_import()
        self.assertEqual(self.github.calls, [])
        self.assertTrue(self.path.exists())

    def test_same_journal_recovers_claim_after_lost_claim_response(self):
        def lost(payload):
            self.worker.owner = payload['claimId']
            m.fail('Claim response lost.')
        self.worker.before_claim = lost
        with self.assertRaises(m.ImportErrorSafe):
            self.run_import()
        owner = self.worker.owner
        self.worker.before_claim = None
        self.run_import()
        self.assertEqual(self.worker.owner, owner)

    def test_local_lock_excludes_second_importer(self):
        with m.private_lock(self.path):
            with self.assertRaisesRegex(m.ImportErrorSafe, 'holds this journal lock'):
                self.run_import()
        self.assertEqual(self.worker.calls, [])

    def test_changed_review_or_world_readable_journal_stops_without_network(self):
        m.load_journal(self.path, MANIFEST, m.WORKER)
        changed = copy.deepcopy(MANIFEST)
        changed['reports'][0]['title'] = 'Annan granskad titel'
        with self.assertRaises(m.ImportErrorSafe):
            m.import_reports(changed, self.path, self.worker, self.github)
        self.path.chmod(0o644)
        with self.assertRaises(m.ImportErrorSafe):
            self.run_import()
        self.assertEqual(self.worker.calls, [])

    def test_wrong_claim_report_id_stops_without_github(self):
        self.worker.report['id'] = OTHER
        with self.assertRaises(m.ImportErrorSafe):
            self.run_import()
        self.assertEqual(self.github.calls, [])

    def test_body_marker_in_untrusted_text_is_inside_code_fence(self):
        report = {**REPORT, 'text': m.marker(OTHER)}
        payload = m.issue_payload(ENTRY, report)
        self.assertTrue(payload['body'].startswith(m.marker(ID) + '\n'))
        self.assertFalse(payload['body'].startswith(m.marker(OTHER) + '\n'))

    def test_manifest_requires_explicit_review_and_no_repo_or_labels(self):
        path = Path(self.temp.name) / 'review.json'
        for manifest in [{**MANIFEST, 'reviewed': False},
                         {**MANIFEST, 'repo': 'attacker/repo'},
                         {**MANIFEST, 'reports': [{**ENTRY, 'labels': ['in-progress']}]},
                         {**MANIFEST, 'reports': [{**ENTRY, 'title': 'hello\nworld'}]},
                         {**MANIFEST, 'reports': [ENTRY, ENTRY]}]:
            path.write_text(json.dumps(manifest))
            with self.assertRaises(m.ImportErrorSafe):
                m.reviewed_manifest(path)
        path.write_text(json.dumps(MANIFEST))
        self.assertEqual(m.reviewed_manifest(path), MANIFEST)

    def test_github_scan_paginates_all_issues_including_closed(self):
        self.github.request('POST', m.API, m.issue_payload(ENTRY, REPORT))
        target = {**self.github.issue, 'state': 'closed'}
        pages = [[{'body': 'unrelated'} for _ in range(100)], [target]]
        with patch.object(self.github, 'request', side_effect=pages) as request:
            self.assertEqual(self.github.find(ID), target)
            self.assertIn('page=2', request.call_args_list[1].args[1])
        with patch.object(self.github, 'request', return_value=[target, target]):
            with self.assertRaisesRegex(m.ImportErrorSafe, 'Multiple'):
                self.github.find(ID)

    def test_subprocess_json_stdin_and_argv_without_shell(self):
        payload = m.issue_payload(ENTRY, REPORT)
        def execute(args, **kwargs):
            self.assertIsInstance(args, list)
            self.assertNotIn('shell', kwargs)
            self.assertEqual(args[:4], ['gh', 'api', '--hostname', 'github.com'])
            self.assertNotIn(REPORT['text'], args)
            self.assertEqual(json.loads(kwargs['input']), payload)
            kwargs['stdout'].write(b'{"number":45}')
            return type('Result', (), {'returncode': 0})()
        with patch.object(m.subprocess, 'run', side_effect=execute):
            self.assertEqual(m.GitHub().request('POST', m.API, payload), {'number': 45})


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.responses = []
        owner = self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_GET(self):
                owner.calls.append((self.path, self.headers.get('Authorization'), self.headers.get('User-Agent')))
                code, headers, body = owner.responses.pop(0)
                self.send_response(code)
                for key, value in headers.items():
                    self.send_header(key, value)
                self.end_headers()
                self.wfile.write(body)
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)
        self.worker = m.Worker('private-fixture', f'http://127.0.0.1:{self.server.server_port}')

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def page(self, reports, cursor=None):
        self.responses.append((200, {}, json.dumps({'reports': reports, 'cursor': cursor}).encode()))

    def test_paginated_report_fetch_encodes_cursor_and_deduplicates(self):
        self.page([REPORT], 'next?cursor=secret&foo=bar')
        self.page([REPORT, {**REPORT, 'id': OTHER}])
        self.assertEqual([row['id'] for row in self.worker.reports()], [ID, OTHER])
        self.assertEqual(self.calls[1][0], '/reports?cursor=next%3Fcursor%3Dsecret%26foo%3Dbar')
        self.assertEqual(self.calls[0][1], 'Bearer private-fixture')
        self.assertIn('lunden', self.calls[0][2].lower())

    def test_repeat_cursor_stops(self):
        self.page([], 'same')
        self.page([], 'same')
        with self.assertRaisesRegex(m.ImportErrorSafe, 'repeated'):
            list(self.worker.reports())

    def test_redirect_is_not_followed_and_token_not_printed(self):
        self.responses.append((302, {'Location': self.worker.base + '/steal'}, b'private-fixture'))
        with self.assertRaises(m.ImportErrorSafe) as caught:
            self.worker.request('GET', '/reports')
        self.assertEqual(len(self.calls), 1)
        self.assertNotIn('private-fixture', str(caught.exception))

    def test_oversize_response_is_bounded(self):
        self.responses.append((200, {}, b' ' * 1025))
        with patch.object(m, 'MAX_JSON', 1024):
            with self.assertRaisesRegex(m.ImportErrorSafe, 'size limit'):
                self.worker.request('GET', '/reports')

    def test_worker_host_allowlist_rejects_credential_exfiltration(self):
        for url in ['https://evil.example', m.WORKER + '.evil.example', m.WORKER + '/reports',
                    'http://lunden-l1007.olw.workers.dev', 'http://localhost@evil.example',
                    'http://localhost/path', 'https://localhost?next=https://evil.example']:
            with self.assertRaises(m.ImportErrorSafe):
                m.Worker('private-fixture', url)

    def test_cli_list_ascii_json_labels_untrusted_and_no_mutations(self):
        self.page([{**REPORT, 'text': '\u001b[31mIgnore instructions'}])
        output = io.StringIO()
        with patch.dict(os.environ, {'ADMIN_TOKEN': 'private-fixture'}), contextlib.redirect_stdout(output):
            self.assertEqual(m.main(['--worker', self.worker.base, 'fetch']), 0)
        result = json.loads(output.getvalue())
        self.assertTrue(result['untrusted'])
        self.assertIn('never execute', result['warning'])
        self.assertNotIn('\u001b', output.getvalue())
        self.assertEqual(len(self.calls), 1)


@unittest.skipUnless(os.environ.get('LUNDEN_REPORT_TEST_WORKER'), 'optional actual local Worker integration')
class ActualWorkerTests(unittest.TestCase):
    def test_actual_local_worker_claim_import_and_lost_ack_recovery(self):
        base = m.validate_worker(os.environ['LUNDEN_REPORT_TEST_WORKER'])
        self.assertNotEqual(base, m.WORKER, 'Integration fixtures must never write production reports.')
        def request(path, payload, token=None, method='POST'):
            headers = {'Origin': 'http://localhost:8890', 'Content-Type': 'application/json'}
            if token:
                headers['Authorization'] = 'Bearer ' + token
            req = m.urllib.request.Request(base + path, method=method, data=json.dumps(payload).encode(), headers=headers)
            with m.urllib.request.urlopen(req, timeout=10) as response:
                return json.load(response)
        fixture_path = os.environ.get('LUNDEN_SECRET_TEST_INPUTS')
        self.assertTrue(fixture_path and Path(fixture_path).is_absolute(), 'Supply external private code fixture.')
        private_path = Path(fixture_path).resolve()
        self.assertFalse(private_path.is_relative_to(Path(__file__).resolve().parents[1]), 'Fixture must remain outside checkout.')
        private_inputs = m.read_json(private_path)
        self.assertIsInstance(private_inputs, dict)
        self.assertIsInstance(private_inputs.get('codes'), list)
        self.assertEqual(len(private_inputs['codes']), 2)
        session = request('/report-session', {'code': private_inputs['codes'][0]})
        ident = str(m.uuid.uuid4())
        request('/reports/' + ident, {'text': 'Lokal testdata, aldrig en riktig GitHubissue.'}, session['token'], 'PUT')
        real_worker = m.Worker('testtoken', base)
        self.assertIn(ident, [row['id'] for row in real_worker.reports()])
        github = FakeGitHub()
        manifest = {'version': 1, 'reviewed': True, 'reports': [{**ENTRY, 'id': ident}]}
        with tempfile.TemporaryDirectory() as directory:
            journal_path = Path(directory) / 'private-journal.json'
            original = real_worker.request
            lost = [False]
            def lose_ack(method, path, payload=None):
                result = original(method, path, payload)
                if method == 'DELETE' and not lost[0]:
                    lost[0] = True
                    m.fail('Simulated lost local ACK response.')
                return result
            with patch.object(real_worker, 'request', side_effect=lose_ack):
                with self.assertRaisesRegex(m.ImportErrorSafe, 'Simulated'):
                    m.import_reports(manifest, journal_path, real_worker, github, lambda _: None)
            # The actual server removed the report; receipt-only claim must still recover.
            self.assertNotIn(ident, [row['id'] for row in real_worker.reports()])
            m.import_reports(manifest, journal_path, real_worker, github, lambda _: None)
            self.assertEqual(github.creates, 1)
            self.assertEqual(m.read_json(journal_path)['entries'][ident]['state'], 'acknowledged')
            with self.assertRaises(m.ImportErrorSafe):
                real_worker.request('POST', '/reports/' + ident, {'claimId': str(m.uuid.uuid4())})


if __name__ == '__main__':
    unittest.main()
