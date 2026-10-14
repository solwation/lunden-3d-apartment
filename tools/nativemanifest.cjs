// Read-only native manifest tool for verifying and safely reusing native geometry phases (#948).
// Freezes and validates all relevant runtime/driver/fixture hashes, Three.js version,
// canonical input/pose/seed matrix, producer exit code, and raw artifact integrity.
// Rejects modified code, missing/tampered artifacts, nonzero exits, timeouts, or version mismatches.
// Geometry reuse never bypasses current Worker, protocol, or HUD verification.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { sourceHashes: baseSourceHashes } = require('./workerfixture.cjs');

const DEFAULT_ROOT = path.resolve(__dirname, '..');

function getThreeVersion(root = DEFAULT_ROOT) {
  try {
    const indexPath = path.join(root, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf8');
    const match = content.match(/three@([\d.]+)\//);
    if (match) return match[1];
  } catch {}
  return '0.170.0';
}

function computeFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return {
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    bytes: content.length
  };
}

function getDriverHash(driverRelPath, root = DEFAULT_ROOT) {
  const full = path.isAbsolute(driverRelPath) ? driverRelPath : path.join(root, driverRelPath);
  if (!fs.existsSync(full)) {
    throw new Error(`Driver file does not exist: ${driverRelPath}`);
  }
  return crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
}

function computeManifestSourceHashes(options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const extra = [];
  if (options.driver) {
    extra.push(options.driver);
  }
  if (Array.isArray(options.extraSources)) {
    extra.push(...options.extraSources);
  }
  return baseSourceHashes({ root, extraSources: extra });
}

function createNativeManifest(options = {}) {
  const {
    phase,
    driver,
    canonicalMatrix = null,
    rawResult = null,
    exitCode = 0,
    completed = true,
    timeout = false,
    artifacts = {},
    skippedDescription = null,
    root = DEFAULT_ROOT,
    threeVersion = getThreeVersion(root)
  } = options;

  if (!phase) throw new Error('Native manifest requires a phase name');
  if (!driver) throw new Error('Native manifest requires a driver path');

  const driverRel = path.isAbsolute(driver) ? path.relative(root, driver) : driver;
  const driverHash = getDriverHash(driverRel, root);

  const sourceHashes = computeManifestSourceHashes({
    root,
    driver: driverRel,
    extraSources: options.extraSources
  });

  const rawArtifacts = {};
  if (artifacts && typeof artifacts === 'object') {
    for (const [name, target] of Object.entries(artifacts)) {
      if (typeof target === 'string') {
        const full = path.isAbsolute(target) ? target : path.join(root, target);
        if (fs.existsSync(full)) {
          const info = computeFileHash(full);
          rawArtifacts[name] = {
            sha256: info.sha256,
            bytes: info.bytes,
            path: path.isAbsolute(target) ? path.relative(root, target) : target
          };
        }
      } else if (Buffer.isBuffer(target) || typeof target === 'string') {
        const buf = Buffer.isBuffer(target) ? target : Buffer.from(target);
        rawArtifacts[name] = {
          sha256: crypto.createHash('sha256').update(buf).digest('hex'),
          bytes: buf.length
        };
      }
    }
  }

  return {
    schemaVersion: 1,
    kind: 'lunden-native-manifest',
    phase,
    createdAt: new Date().toISOString(),
    threeVersion,
    producer: {
      driver: driverRel,
      driverHash,
      exitCode,
      completed: completed === true,
      timeout: timeout === true,
      skippedDescription: skippedDescription || `${phase} measurement execution`
    },
    canonicalMatrix,
    sourceHashes,
    rawArtifacts,
    rawResult
  };
}

function saveNativeManifest(manifestPath, manifest) {
  fs.mkdirSync(path.dirname(path.resolve(manifestPath)), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

function verifyNativeManifest(manifestOrPath, options = {}) {
  const root = options.root || DEFAULT_ROOT;
  let manifest;
  let manifestDir = root;

  if (typeof manifestOrPath === 'string') {
    const fullPath = path.isAbsolute(manifestOrPath) ? manifestOrPath : path.join(root, manifestOrPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Native manifest file not found: ${manifestOrPath}`);
    }
    manifestDir = path.dirname(fullPath);
    try {
      manifest = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (e) {
      throw new Error(`Corrupted or malformed native manifest JSON at ${manifestOrPath}: ${e.message}`);
    }
  } else if (manifestOrPath && typeof manifestOrPath === 'object') {
    manifest = manifestOrPath;
    manifestDir = options.artifactsDir || root;
  } else {
    throw new Error('Invalid manifest: expected file path or manifest object');
  }

  // 1. Kind and schema
  if (manifest.kind !== 'lunden-native-manifest') {
    throw new Error(`Unsupported manifest kind '${manifest.kind}'; expected 'lunden-native-manifest'`);
  }
  if (!manifest.phase) {
    throw new Error('Native manifest missing required phase field');
  }

  // 2. Expected phase check
  if (options.expectedPhase && manifest.phase !== options.expectedPhase) {
    throw new Error(`Phase mismatch: expected '${options.expectedPhase}', but manifest is for '${manifest.phase}'`);
  }

  // 3. Producer execution and completion checks
  const producer = manifest.producer || {};
  if (producer.exitCode !== 0) {
    throw new Error(`Nonzero producer exit code: ${producer.exitCode} (CLI1/143/etc cannot be reused)`);
  }
  if (producer.completed !== true) {
    throw new Error('Incomplete producer phase: completed is not true');
  }
  if (producer.timeout === true || manifest.rawResult?.timeout === true) {
    throw new Error('Producer phase timed out; timeout results cannot be reused');
  }

  // 4. Expected driver check
  if (options.expectedDriver && producer.driver !== options.expectedDriver) {
    throw new Error(`Driver mismatch: expected '${options.expectedDriver}', but manifest was produced by '${producer.driver}'`);
  }

  // 5. Three.js version check
  const currentThree = options.currentThreeVersion || getThreeVersion(root);
  if (manifest.threeVersion !== currentThree) {
    throw new Error(`Three.js version mismatch: manifest requires ${manifest.threeVersion}, current index.html uses ${currentThree}`);
  }

  // 6. Driver file integrity
  if (producer.driver) {
    const driverFull = path.join(root, producer.driver);
    if (!fs.existsSync(driverFull)) {
      throw new Error(`Producer driver file missing from workspace: ${producer.driver}`);
    }
    const currentDriverHash = crypto.createHash('sha256').update(fs.readFileSync(driverFull)).digest('hex');
    if (producer.driverHash && currentDriverHash !== producer.driverHash) {
      throw new Error(`Driver source modified since manifest creation: ${producer.driver}`);
    }
  }

  // 7. Runtime and fixture source hashes
  const sourceHashes = manifest.sourceHashes || {};
  const changedSources = [];
  for (const [relPath, expectedHash] of Object.entries(sourceHashes)) {
    const full = path.join(root, relPath);
    try {
      const current = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
      if (current !== expectedHash) {
        changedSources.push(relPath);
      }
    } catch {
      changedSources.push(relPath);
    }
  }
  if (changedSources.length > 0) {
    throw new Error(`Source files modified or missing since manifest creation: ${changedSources.sort().join(', ')}`);
  }

  // 8. Canonical matrix check
  if (options.expectedCanonicalMatrix) {
    const expectedStr = JSON.stringify(options.expectedCanonicalMatrix);
    const actualStr = JSON.stringify(manifest.canonicalMatrix);
    if (expectedStr !== actualStr) {
      throw new Error(`Canonical matrix mismatch: expected ${expectedStr}, got ${actualStr}`);
    }
  }

  // 9. Referenced raw artifacts existence and SHA-256 verification
  const rawArtifacts = manifest.rawArtifacts || {};
  const artifactsDir = options.artifactsDir || manifestDir;
  for (const [name, info] of Object.entries(rawArtifacts)) {
    const candidates = [
      path.join(artifactsDir, name),
      info.path ? (path.isAbsolute(info.path) ? info.path : path.join(root, info.path)) : null,
      path.join(root, name)
    ].filter(Boolean);

    const artifactPath = candidates.find(c => fs.existsSync(c));
    if (!artifactPath) {
      throw new Error(`Referenced raw artifact missing on disk: ${name}`);
    }

    const currentHash = crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');
    if (info.sha256 && currentHash !== info.sha256) {
      throw new Error(`Referenced raw artifact tampered or modified: ${name} (expected ${info.sha256}, got ${currentHash})`);
    }
  }

  const skipped = producer.skippedDescription || `${manifest.phase} execution`;

  return {
    verified: true,
    phase: manifest.phase,
    createdAt: manifest.createdAt,
    threeVersion: manifest.threeVersion,
    producer,
    canonicalMatrix: manifest.canonicalMatrix,
    rawResult: manifest.rawResult,
    rawArtifacts,
    verifiedHashesCount: Object.keys(sourceHashes).length,
    verifiedArtifactsCount: Object.keys(rawArtifacts).length,
    skipped,
    reuseRecord: {
      reused: true,
      phase: manifest.phase,
      manifestCreatedAt: manifest.createdAt,
      producerDriver: producer.driver,
      producerExitCode: producer.exitCode,
      skipped,
      verifiedHashesCount: Object.keys(sourceHashes).length,
      verifiedArtifactsCount: Object.keys(rawArtifacts).length,
      threeVersion: manifest.threeVersion
    }
  };
}

function loadVerifiedNativeManifest(manifestPath, options = {}) {
  const result = verifyNativeManifest(manifestPath, options);
  console.log(
    `[nativemanifest] REUSED verified phase '${result.phase}' from ${manifestPath} ` +
    `(run at ${result.createdAt} by ${result.producer.driver}). ` +
    `Skipped: ${result.reuseRecord.skipped}.`
  );
  return result;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'verify' && args[1]) {
    try {
      const manifestPath = args[1];
      const phaseIdx = args.indexOf('--phase');
      const expectedPhase = phaseIdx !== -1 ? args[phaseIdx + 1] : undefined;
      const driverIdx = args.indexOf('--driver');
      const expectedDriver = driverIdx !== -1 ? args[driverIdx + 1] : undefined;
      const artifactsIdx = args.indexOf('--artifacts');
      const artifactsDir = artifactsIdx !== -1 ? args[artifactsIdx + 1] : undefined;

      const res = verifyNativeManifest(manifestPath, {
        expectedPhase,
        expectedDriver,
        artifactsDir
      });

      console.log(`PASS: verified native manifest '${res.phase}'`);
      console.log(`- Created: ${res.createdAt}`);
      console.log(`- Driver: ${res.producer.driver} (exit ${res.producer.exitCode})`);
      console.log(`- Three: ${res.threeVersion}`);
      console.log(`- Verified source files: ${res.verifiedHashesCount}`);
      console.log(`- Verified raw artifacts: ${res.verifiedArtifactsCount}`);
      console.log(`- Skipped on reuse: ${res.skipped}`);
      process.exit(0);
    } catch (err) {
      console.error(`FAIL: native manifest verification rejected: ${err.message}`);
      process.exit(1);
    }
  } else if (command === 'show' && args[1]) {
    try {
      const full = path.resolve(args[1]);
      const m = JSON.parse(fs.readFileSync(full, 'utf8'));
      console.log(JSON.stringify({
        kind: m.kind,
        phase: m.phase,
        createdAt: m.createdAt,
        threeVersion: m.threeVersion,
        producer: m.producer,
        verifiedSources: Object.keys(m.sourceHashes || {}).length,
        rawArtifacts: Object.keys(m.rawArtifacts || {})
      }, null, 2));
      process.exit(0);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  } else {
    console.log('Usage:');
    console.log('  node tools/nativemanifest.cjs verify <manifest-path> [--phase <phase>] [--driver <driver>] [--artifacts <dir>]');
    console.log('  node tools/nativemanifest.cjs show <manifest-path>');
    process.exit(args.length ? 1 : 0);
  }
}

module.exports = {
  getThreeVersion,
  getDriverHash,
  computeManifestSourceHashes,
  createNativeManifest,
  saveNativeManifest,
  verifyNativeManifest,
  loadVerifiedNativeManifest
};
