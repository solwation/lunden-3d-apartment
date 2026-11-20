'use strict';

const {setTimeout: sleep} = require('node:timers/promises');

const create = 'POST /repos/{owner}/{repo}/pages/deployments';
const status = 'GET /repos/{owner}/{repo}/pages/deployments/{pages_deployment_id}';
const cancel = 'POST /repos/{owner}/{repo}/pages/deployments/{pages_deployment_id}/cancel';
const finalErrors = new Set(['deployment_failed', 'deployment_perms_error', 'deployment_content_failed',
  'deployment_cancelled', 'deployment_lost']);

async function deploy({github, context, core}, artifactId, signal, pause = sleep) {
  const id = Number(artifactId);
  if (!/^[1-9]\d*$/.test(artifactId) || !Number.isSafeInteger(id)) throw new Error('Invalid upload artifact ID.');

  signal.throwIfAborted();
  const oidc = await core.getIDToken();
  let deployment;
  for (let attempt = 1; attempt <= 13; attempt++) {
    signal.throwIfAborted();
    try {
      // If cancellation arrives during creation, retain the response ID so we can cancel that deployment.
      ({data: deployment} = await github.request(create, {...context.repo, artifact_id: id,
        pages_build_version: context.sha, oidc_token: oidc, request: {signal: AbortSignal.timeout(15000)}}));
      break;
    } catch (error) {
      // Only an explicit rejection for a missing artifact proves that this POST created nothing.
      const message = error.response?.data?.message ?? '';
      const missing = [400, 404, 422].includes(error.status) && /\bartifact\b[^.\n]*(?:not found|could not be found|does not exist)/i.test(message);
      if (!missing) throw new Error(`Pages deployment creation failed (${error.status ?? 'transport error'}) for artifact ${id}. Check the run before retrying.`);
      if (attempt === 13) throw new Error(`Pages still cannot find uploaded artifact ${id} after 13 checks.`);
      core.info(`Pages cannot find artifact ${id} yet (check ${attempt}/13).`);
      await pause(5000, undefined, {signal});
    }
  }

  if (!deployment?.id) throw new Error('Pages accepted creation without returning a deployment ID. Check the run before retrying.');
  const target = {...context.repo, pages_deployment_id: deployment.id};
  const monitor = AbortSignal.any([signal, AbortSignal.timeout(600000)]);
  let pending = true;
  try {
    core.info(`Created Pages deployment ${deployment.id} for ${context.sha} using artifact ${id}.`);
    let errors = 0;
    for (;;) {
      monitor.throwIfAborted();
      let state;
      try {
        const {data} = await github.request(status, {...target,
          request: {signal: AbortSignal.any([monitor, AbortSignal.timeout(15000)])}});
        state = data.status;
        errors = 0;
      } catch (error) {
        monitor.throwIfAborted();
        const transient = !error.status || [404, 408, 429].includes(error.status) || error.status >= 500;
        if (!transient || ++errors >= 10) throw new Error(`Pages status lookup failed (${error.status ?? 'transport error'}).`);
      }
      if (state === 'succeed') {
        pending = false;
        core.setOutput('page_url', deployment.page_url);
        core.info('Pages deployment succeeded.');
        return;
      }
      if (finalErrors.has(state)) {
        pending = false;
        throw new Error(`Pages reported ${state}.`);
      }
      await pause(5000, undefined, {signal: monitor});
    }
  } finally {
    if (pending) {
      try {
        await github.request(cancel, {...target, request: {signal: AbortSignal.timeout(5000)}});
        core.info(`Cancelled pending Pages deployment ${deployment.id}.`);
      } catch (error) {
        core.warning(`Could not confirm cancellation of ${deployment.id} (${error.status ?? 'transport error'}).`);
      }
    }
  }
}

module.exports = async function run(client, artifactId) {
  const controller = new AbortController();
  const stop = () => controller.abort(new Error('Workflow cancelled.'));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try { await deploy(client, artifactId, controller.signal); }
  finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
};
module.exports.deploy = deploy;
