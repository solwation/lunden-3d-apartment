'use strict';

const { setTimeout: sleep } = require('node:timers/promises');

// deploy-pages@v4 lists via @actions/artifact's Results client. The public REST
// endpoint has a separate view. The runner supplies these credentials to the JavaScript action.
async function waitForArtifact(env, request = fetch, pause = sleep) {
  const expectedId = env['INPUT_ARTIFACT-ID'];
  if (!/^[1-9]\d*$/.test(expectedId)) throw new Error('Upload did not return a valid Pages artifact ID.');

  const token = env.ACTIONS_RUNTIME_TOKEN;
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const scope = claims.scp?.split(' ').find(value => value.startsWith('Actions.Results:'));
  const [, runId, jobId] = scope?.split(':') ?? [];
  if (!runId || !jobId) throw new Error('Actions Results run and job identifiers are missing.');

  const url = new URL('/twirp/github.actions.results.api.v1.ArtifactService/ListArtifacts', env.ACTIONS_RESULTS_URL);
  const body = JSON.stringify({ workflow_run_backend_id: runId, workflow_job_run_backend_id: jobId });
  const attempts = 13;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await request(url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(4000),
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body
    });
    if (!response.ok) throw new Error('Actions Results ListArtifacts returned HTTP ' + response.status);
    // ProtoJSON may omit an empty repeated field, and permits both spellings for database_id.
    const { artifacts = [] } = await response.json();
    const matches = artifacts.filter(artifact => artifact.name === 'github-pages');
    if (matches.length > 1) throw new Error('Multiple github-pages artifacts in this run; use a fresh workflow run.');
    if (matches.length === 1) {
      if (String(matches[0].database_id ?? matches[0].databaseId) !== expectedId)
        throw new Error('Listed github-pages artifact ID differs from the upload; use a fresh workflow run.');
      console.log(`Pages artifact ${expectedId} is visible (check ${attempt}/${attempts}).`);
      return;
    }
    if (attempt < attempts) {
      console.log(`Waiting for github-pages artifact ${expectedId} (check ${attempt}/${attempts}).`);
      await pause(5000);
    }
  }
  throw new Error(`Uploaded github-pages artifact ${expectedId} is still missing after ${attempts} checks in this run.`);
}

if (require.main === module) {
  waitForArtifact(process.env).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { waitForArtifact };
