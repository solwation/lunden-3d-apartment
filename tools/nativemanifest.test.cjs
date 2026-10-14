// Test suite for read-only native manifest verification and safe phase reuse (#948).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const {
  getThreeVersion,
  createNativeManifest,
  saveNativeManifest,
  verifyNativeManifest,
  loadVerifiedNativeManifest
} = require('./nativemanifest.cjs');

const TEST_DIR = path.join(os.tmpdir(), 'lunden-nativemanifest-test');
fs.mkdirSync(TEST_DIR, { recursive: true });

function setupFixture() {
  const runDir = path.join(TEST_DIR, `run-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(runDir, { recursive: true });

  const rawParity = {
    models: ['0/0/1', '1/1/1'],
    counts: { positive: 1200, bad: 0, negative: 1500, hidden: 1100, corners: 1200, cornerBad: 0 },
    timeout: false
  };
  const artifactPath = path.join(runDir, 'parity.json');
  fs.writeFileSync(artifactPath, JSON.stringify(rawParity, null, 2));

  const manifest = createNativeManifest({
    phase: 'test-geometry-grid',
    driver: 'tools/rifleturnfronttest.cjs',
    canonicalMatrix: {
      variants: 60,
      styles: 4,
      builds: 3
    },
    rawResult: rawParity,
    exitCode: 0,
    completed: true,
    timeout: false,
    artifacts: {
      'parity.json': artifactPath
    },
    skippedDescription: 'simulated native CPU raycast grid measurement'
  });

  const manifestPath = path.join(runDir, 'native-manifest.json');
  saveNativeManifest(manifestPath, manifest);

  return { runDir, artifactPath, manifestPath, manifest, rawParity };
}

test('1. valid manifest matches current sources and artifact, returns provenance and reuse record', () => {
  const { manifestPath, manifest, runDir, rawParity } = setupFixture();

  const res = verifyNativeManifest(manifestPath, {
    expectedPhase: 'test-geometry-grid',
    expectedDriver: 'tools/rifleturnfronttest.cjs',
    artifactsDir: runDir
  });

  assert.equal(res.verified, true);
  assert.equal(res.phase, 'test-geometry-grid');
  assert.equal(res.threeVersion, getThreeVersion());
  assert.deepEqual(res.rawResult, rawParity);
  assert.equal(res.reuseRecord.reused, true);
  assert.equal(res.reuseRecord.producerDriver, 'tools/rifleturnfronttest.cjs');
  assert.equal(res.reuseRecord.producerExitCode, 0);
  assert.equal(res.reuseRecord.skipped, 'simulated native CPU raycast grid measurement');
  assert.ok(res.verifiedHashesCount > 200, 'verified comprehensive source inventory');
  assert.equal(res.verifiedArtifactsCount, 1);
});

test('2. rejects missing manifest file with descriptive error', () => {
  const missingPath = path.join(TEST_DIR, 'nonexistent-manifest.json');
  assert.throws(
    () => verifyNativeManifest(missingPath),
    /Native manifest file not found/
  );
});

test('3. rejects when referenced raw artifact file is missing on disk', () => {
  const { manifestPath, artifactPath, runDir } = setupFixture();
  fs.unlinkSync(artifactPath);

  assert.throws(
    () => verifyNativeManifest(manifestPath, { artifactsDir: runDir }),
    /Referenced raw artifact missing on disk: parity\.json/
  );
});

test('4. rejects when referenced raw artifact has been tampered or modified', () => {
  const { manifestPath, artifactPath, runDir } = setupFixture();
  fs.writeFileSync(artifactPath, JSON.stringify({ tampered: true }));

  assert.throws(
    () => verifyNativeManifest(manifestPath, { artifactsDir: runDir }),
    /Referenced raw artifact tampered or modified: parity\.json/
  );
});

test('5. rejects when a runtime source file has changed hash', () => {
  const { manifest, runDir } = setupFixture();
  // Tamper with one of the stored source hashes
  const tamperedManifest = {
    ...manifest,
    sourceHashes: {
      ...manifest.sourceHashes,
      'src/config.js': '0000000000000000000000000000000000000000000000000000000000000000'
    }
  };

  assert.throws(
    () => verifyNativeManifest(tamperedManifest, { artifactsDir: runDir }),
    /Source files modified or missing since manifest creation: src\/config\.js/
  );
});

test('6. rejects when driver source file has changed hash', () => {
  const { manifest, runDir } = setupFixture();
  const tamperedManifest = {
    ...manifest,
    producer: {
      ...manifest.producer,
      driverHash: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    }
  };

  assert.throws(
    () => verifyNativeManifest(tamperedManifest, { artifactsDir: runDir }),
    /Driver source modified since manifest creation: tools\/rifleturnfronttest\.cjs/
  );
});

test('7. rejects nonzero producer exit codes (CLI1, 143, etc.)', () => {
  const { manifest, runDir } = setupFixture();

  const cli1 = { ...manifest, producer: { ...manifest.producer, exitCode: 1 } };
  assert.throws(
    () => verifyNativeManifest(cli1, { artifactsDir: runDir }),
    /Nonzero producer exit code: 1/
  );

  const sigterm143 = { ...manifest, producer: { ...manifest.producer, exitCode: 143 } };
  assert.throws(
    () => verifyNativeManifest(sigterm143, { artifactsDir: runDir }),
    /Nonzero producer exit code: 143/
  );
});

test('8. rejects incomplete phase or phase timeout', () => {
  const { manifest, runDir } = setupFixture();

  const incomplete = { ...manifest, producer: { ...manifest.producer, completed: false } };
  assert.throws(
    () => verifyNativeManifest(incomplete, { artifactsDir: runDir }),
    /Incomplete producer phase/
  );

  const timedOut = { ...manifest, producer: { ...manifest.producer, timeout: true } };
  assert.throws(
    () => verifyNativeManifest(timedOut, { artifactsDir: runDir }),
    /Producer phase timed out/
  );
});

test('9. rejects Three.js version mismatch', () => {
  const { manifest, runDir } = setupFixture();
  const wrongThree = { ...manifest, threeVersion: '0.169.0' };

  assert.throws(
    () => verifyNativeManifest(wrongThree, { artifactsDir: runDir }),
    /Three\.js version mismatch/
  );
});

test('10. rejects canonical matrix mismatch or phase mismatch', () => {
  const { manifestPath, runDir } = setupFixture();

  assert.throws(
    () => verifyNativeManifest(manifestPath, {
      expectedPhase: 'different-phase',
      artifactsDir: runDir
    }),
    /Phase mismatch/
  );

  assert.throws(
    () => verifyNativeManifest(manifestPath, {
      expectedCanonicalMatrix: { variants: 999 },
      artifactsDir: runDir
    }),
    /Canonical matrix mismatch/
  );
});

test('11. CLI interface exits 0 on valid manifest and 1 on tampered/invalid', () => {
  const { manifestPath, artifactPath, runDir } = setupFixture();

  // Valid run
  const out0 = execFileSync(process.execPath, [
    'tools/nativemanifest.cjs',
    'verify',
    manifestPath,
    '--phase', 'test-geometry-grid',
    '--artifacts', runDir
  ], { encoding: 'utf8' });
  assert.match(out0, /PASS: verified native manifest/);

  // Tamper artifact
  fs.writeFileSync(artifactPath, 'bad content');
  assert.throws(
    () => execFileSync(process.execPath, [
      'tools/nativemanifest.cjs',
      'verify',
      manifestPath,
      '--phase', 'test-geometry-grid',
      '--artifacts', runDir
    ], { stdio: 'pipe' }),
    err => {
      assert.equal(err.status, 1);
      assert.match(err.stderr.toString(), /tampered or modified/);
      return true;
    }
  );
});

test('12. loadVerifiedNativeManifest logs reuse and what was skipped', () => {
  const { manifestPath, runDir, rawParity } = setupFixture();

  let logged = '';
  const origLog = console.log;
  try {
    console.log = msg => { logged += msg; };
    const res = loadVerifiedNativeManifest(manifestPath, { artifactsDir: runDir });
    assert.deepEqual(res.rawResult, rawParity);
    assert.match(logged, /REUSED verified phase 'test-geometry-grid'/);
    assert.match(logged, /Skipped: simulated native CPU raycast grid measurement/);
  } finally {
    console.log = origLog;
  }
});
