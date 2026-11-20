'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { waitForArtifact } = require('./index.cjs');

const payload = Buffer.from(JSON.stringify({ scp: 'Other Actions.Results:test-run:test-job' })).toString('base64url');
const env = {
  ACTIONS_RUNTIME_TOKEN: 'fake.' + payload + '.fake',
  ACTIONS_RESULTS_URL: 'https://results.example/',
  'INPUT_ARTIFACT-ID': '42'
};
const uploaded = { name: 'github-pages', database_id: '42' };

function probe(responses) {
  let requests = 0, pauses = 0;
  const request = async (url, options) => {
    assert.equal(url.href, 'https://results.example/twirp/github.actions.results.api.v1.ArtifactService/ListArtifacts');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer ' + env.ACTIONS_RUNTIME_TOKEN);
    assert.deepEqual(JSON.parse(options.body), { workflow_run_backend_id: 'test-run', workflow_job_run_backend_id: 'test-job' });
    assert.equal(requests, pauses);
    const body = responses[requests++];
    assert.ok(body, 'unexpected additional listing');
    return Response.json(body);
  };
  const done = waitForArtifact(env, request, async ms => {
    assert.equal(ms, 5000);
    pauses++;
  });
  return { done, counts: () => [requests, pauses] };
}

test('ready immediately', async () => {
  const p = probe([{ artifacts: [uploaded] }]);
  await p.done;
  assert.deepEqual(p.counts(), [1, 0]);
});

test('waits across empty and unrelated listings until the uploaded ID appears', async () => {
  const p = probe([{}, { artifacts: [{ name: 'other', database_id: '42' }] },
    { artifacts: [{ name: 'github-pages', databaseId: '42' }] }]);
  await p.done;
  assert.deepEqual(p.counts(), [3, 2]);
});

test('persistent absence fails after bounded checks without another sleep', async () => {
  const p = probe(Array(13).fill({ artifacts: [] }));
  await assert.rejects(p.done, /42 is still missing after 13 checks/);
  assert.deepEqual(p.counts(), [13, 12]);
});

test('duplicate or stale same-name listings stop deployment immediately', async () => {
  const older = { name: 'github-pages', database_id: '41' };
  for (const [artifacts, reason] of [[[older, uploaded], /Multiple/], [[older], /differs/]]) {
    const p = probe([{ artifacts }]);
    await assert.rejects(p.done, reason);
    assert.deepEqual(p.counts(), [1, 0]);
  }
});
