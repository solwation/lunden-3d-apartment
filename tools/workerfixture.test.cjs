// Lifecycle, provenance, collision, and cleanup tests for owned-local-Worker fixture (#927).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { execFileSync } = require('node:child_process');

const {
  startOwnedWorker,
  stopOwnedWorker,
  sourceHashes,
  checkFreshness,
  assertFresh,
  ownsPort,
  getPortListener,
  createWorkerFixture
} = require('./workerfixture.cjs');

const TEST_OUT = path.join(os.tmpdir(), 'lunden-workerfixture-test');

test('1. real start -> request -> provenance -> clean shutdown of owned local Worker', { timeout: 30000 }, async () => {
  const port = 8875;
  const outDir = path.join(TEST_OUT, 'basic-lifecycle');
  fs.mkdirSync(outDir, { recursive: true });

  const frozen = await startOwnedWorker(`http://localhost:${port}`, { outDir });
  try {
    assert.ok(frozen.pid > 0, 'owned worker has valid PID');
    assert.equal(frozen.port, port, 'owned worker port matches');
    assert.equal(typeof frozen.provenance, 'object', 'provenance object attached');
    assert.equal(frozen.provenance.mode, 'owned', 'provenance mode is owned');
    assert.equal(frozen.provenance.verifiedFresh, true, 'provenance verified fresh');
    assert.ok(ownsPort(frozen.pid, port), 'Linux /proc confirms PID owns listening port');

    // Provenance file was written to disk
    const provOnDisk = JSON.parse(fs.readFileSync(path.join(outDir, 'worker-provenance.json'), 'utf8'));
    assert.equal(provOnDisk.pid, frozen.pid, 'disk provenance matches spawned PID');
    assert.equal(provOnDisk.ownedListeningSocket, true, 'disk provenance records owned socket');

    // Make an actual HTTP request to the running worker
    const res = await fetch(`http://localhost:${port}/drawings`);
    assert.equal(res.status, 200, 'worker responded 200 to GET /drawings');

    // Assert sources remain fresh
    assert.doesNotThrow(() => assertFresh(frozen), 'sources are fresh');
  } finally {
    const pid = frozen.pid;
    await stopOwnedWorker(frozen);
    assert.equal(ownsPort(pid, port), false, 'port is released after stop');
    assert.equal(getPortListener(port), null, 'no listener remaining on port');
  }
});

test('2. rejects starting on port already occupied by another process without killing it', { timeout: 15000 }, async () => {
  const dummyPort = 8876;
  const dummyServer = net.createServer();

  await new Promise((resolve, reject) => {
    dummyServer.once('error', reject);
    dummyServer.listen(dummyPort, '127.0.0.1', resolve);
  });

  try {
    const dummyListener = getPortListener(dummyPort);
    assert.equal(dummyListener, process.pid, 'getPortListener identifies our dummy server PID');

    // Attempt to start owned worker on the occupied port
    await assert.rejects(
      startOwnedWorker(dummyPort),
      err => {
        assert.match(err.message, /Cannot start owned Worker: port 8876 is already in use/);
        assert.match(err.message, /unowned/);
        return true;
      },
      'fails with descriptive error about occupied port'
    );

    // Verify the dummy server is still alive and listening (was NOT killed by the fixture)
    assert.equal(getPortListener(dummyPort), process.pid, 'dummy server was preserved untouched');
  } finally {
    await new Promise(r => dummyServer.close(r));
  }
});

test('3. source modification detection flags modified files and rejects acceptance', () => {
  const hashes = sourceHashes();
  assert.ok(Object.keys(hashes).length > 0, 'computed source hashes');

  // Freshness check with exact hashes
  const freshRes = checkFreshness(hashes);
  assert.equal(freshRes.fresh, true, 'unchanged files report fresh');
  assert.equal(freshRes.changed.length, 0, 'zero changed files');

  // Mutated hash simulation
  const mutated = { ...hashes, 'cloudflare/dev.mjs': '0000000000000000000000000000000000000000000000000000000000000000' };
  const staleRes = checkFreshness(mutated);
  assert.equal(staleRes.fresh, false, 'detects modified hash');
  assert.deepEqual(staleRes.changed, ['cloudflare/dev.mjs'], 'correctly identifies modified file');

  assert.throws(
    () => assertFresh(mutated),
    /Source files modified since Worker startup: cloudflare\/dev\.mjs/,
    'assertFresh throws with list of modified files'
  );
});

test('4. external worker requires explicit allowExternal and marks provenance unverified', async () => {
  // External URL rejected without allowExternal
  await assert.rejects(
    startOwnedWorker('http://example.com:8144'),
    /external\/stale Worker forbidden/,
    'rejects external worker URL without allowExternal flag'
  );

  // External worker with allowExternal marks provenance unverified
  const outDir = path.join(TEST_OUT, 'external-provenance');
  const external = await startOwnedWorker('http://localhost:8874', {
    allowExternal: true,
    compatibility: 'old-versioncompatibility',
    outDir
  });

  assert.equal(external.provenance.mode, 'external', 'marked as external');
  assert.equal(external.provenance.verifiedFresh, false, 'verifiedFresh is false');
  assert.equal(external.provenance.status, 'unverified', 'status is unverified');
  assert.equal(external.provenance.compatibility, 'old-versioncompatibility', 'records compatibility tier');

  const diskProv = JSON.parse(fs.readFileSync(path.join(outDir, 'worker-provenance.json'), 'utf8'));
  assert.equal(diskProv.mode, 'external');
  assert.equal(diskProv.verifiedFresh, false);
});

test('5. clean shutdown leaves no zombie processes', { timeout: 20000 }, async () => {
  const port = 8877;
  const fixture = createWorkerFixture({ port });
  await fixture.start();

  const pid = fixture.pid;
  assert.ok(pid > 0, 'fixture has PID');
  assert.ok(fs.existsSync(`/proc/${pid}`), 'PID exists in /proc before stop');

  await fixture.stop();

  // Wait a moment and check /proc
  await new Promise(r => setTimeout(r, 200));
  assert.ok(!fs.existsSync(`/proc/${pid}`), 'PID no longer exists in /proc (no zombie)');

  // Stopping already stopped fixture is a safe no-op
  await assert.doesNotReject(fixture.stop(), 'stopping already stopped fixture is safe');
});

test('6. optional systemd-user runner isolates unit and records lifecycle', { timeout: 30000 }, async () => {
  // Test only if systemctl --user is available
  let systemdAvailable = false;
  try {
    execFileSync('systemctl', ['--user', 'status'], { stdio: 'ignore' });
    systemdAvailable = true;
  } catch {}

  if (!systemdAvailable) {
    return;
  }

  const port = 8874;
  const outDir = path.join(TEST_OUT, 'systemd-lifecycle');
  fs.mkdirSync(outDir, { recursive: true });

  const frozen = await startOwnedWorker(port, {
    runner: 'systemd',
    outDir
  });

  try {
    assert.equal(frozen.provenance.runner, 'systemd', 'provenance records systemd runner');
    assert.ok(frozen.provenance.unit.startsWith('lunden-worker-'), 'unit has unique name');
    assert.ok(ownsPort(frozen.pid, port), 'systemd worker owns port in Linux /proc');

    const res = await fetch(`http://localhost:${port}/drawings`);
    assert.equal(res.status, 200, 'systemd worker responded to GET /drawings');
  } finally {
    const unit = frozen.provenance.unit;
    await stopOwnedWorker(frozen);
    assert.equal(getPortListener(port), null, 'port released after systemd stop');

    // Verify unit was cleaned up
    const state = execFileSync('systemctl', ['--user', 'show', '-p', 'ActiveState', unit], { encoding: 'utf8' }).trim();
    assert.ok(state === 'ActiveState=inactive' || state === 'ActiveState=dead', 'transient unit stopped cleanly');
  }
});
