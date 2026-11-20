'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {deploy} = require('./deploy.cjs');

const repo = {owner: 'owner', repo: 'site'};
const sha = 'f'.repeat(40);
const created = {id: 'this-deployment', page_url: 'https://site.example'};
const success = {status: 'succeed'};
const failure = (status, message) => Object.assign(new Error(message), {status, response: {data: {message}}});

function probe(replies, onRequest) {
  const calls = [], output = {}, logs = [];
  const controller = new AbortController();
  const github = {async request(route, params) {
    const kind = route.endsWith('/cancel') ? 'cancel' : route.startsWith('POST ') ? 'create' : 'status';
    calls.push(kind);
    assert.equal(params.owner, repo.owner);
    assert.equal(params.repo, repo.repo);
    if (kind === 'create') {
      assert.equal(params.artifact_id, 14662957175);
      assert.equal(params.pages_build_version, sha);
      assert.equal(params.oidc_token, 'test-identity-token');
    } else { assert.equal(params.pages_deployment_id, created.id); }
    onRequest?.(kind, controller);
    const next = replies.shift();
    if (next instanceof Error) throw next;
    assert.ok(next, 'unexpected extra HTTP request');
    return {data: next};
  }};
  const core = {async getIDToken() { return 'test-identity-token'; }, info: s => logs.push(s),
    warning: s => logs.push(s), setOutput: (name, value) => {output[name] = value;}};
  const done = deploy({github, core, context: {repo, sha}}, '14662957175', controller.signal,
    async (ms, _, {signal}) => { assert.equal(ms, 5000); signal.throwIfAborted(); });
  return {done, calls, output, logs};
}

test('creates the upload ID directly, then polls only that deployment until success', async () => {
  const p = probe([created, {status: 'deployment_in_progress'}, failure(503, 'unavailable'), success]);
  await p.done;
  assert.deepEqual(p.calls, ['create', 'status', 'status', 'status']);
  assert.deepEqual(p.output, {page_url: created.page_url});
  assert.ok(!p.logs.join(' ').includes('test-identity-token'));
});

test('only explicit artifact absence allows another create and has a bounded wait', async () => {
  const missing = failure(422, 'Artifact was not found for this run');
  const delayed = probe([missing, created, success]);
  await delayed.done;
  assert.deepEqual(delayed.calls, ['create', 'create', 'status']);
  const absent = probe(Array(13).fill(missing));
  await assert.rejects(absent.done, /after 13/);
  assert.deepEqual(absent.calls, Array(13).fill('create'));
});

test('ambiguous create and ordinary rejections never publish a second time or log request contents', async () => {
  for (const error of [failure(502, 'test-identity-token'), failure(403, 'forbidden'),
    failure(404, 'Not Found'), failure(422, 'Invalid content'), new Error('network lost')]) {
    const p = probe([error]);
    await assert.rejects(p.done, e => /creation failed/.test(e.message) && !e.message.includes('test-identity-token'));
    assert.deepEqual(p.calls, ['create']);
  }
});

test('terminal server failure never reports success or cancels again', async () => {
  const p = probe([created, {status: 'deployment_content_failed'}]);
  await assert.rejects(p.done, /deployment_content_failed/);
  assert.deepEqual(p.calls, ['create', 'status']);
  assert.deepEqual(p.output, {});
});

test('a lost monitor or denied status read cancels its pending deployment once', async () => {
  for (const errors of [[failure(403, 'forbidden')], Array(10).fill(failure(503, 'retry'))]) {
    const p = probe([created, ...errors, {}]);
    await assert.rejects(p.done, /status lookup failed/);
    assert.deepEqual(p.calls, ['create', ...errors.map(() => 'status'), 'cancel']);
  }
});

test('cancellation during creation cancels the returned ID without another publish', async () => {
  const p = probe([created, {}], (kind, controller) => {if (kind === 'create') controller.abort();});
  await assert.rejects(p.done, /abort/i);
  assert.deepEqual(p.calls, ['create', 'cancel']);
});
