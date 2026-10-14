// Shared owned-local-Worker fixture for browser drivers and tests (#927).
// Freezes source hashes before boot, starts an OWNED Worker process (or transient systemd unit),
// verifies port ownership via Linux /proc and process birth time, stores provenance,
// and guarantees clean teardown of ONLY fixture-owned processes without global pkill or orphan zombies.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');

const DEFAULT_ROOT = path.resolve(__dirname, '..');

// Track all owned PIDs and units so exit handlers can cleanly terminate them
const activeOwnedPids = new Set();
const activeOwnedUnits = new Set();
let globalActiveFixture = null;

function registerExitHandlers() {
  if (global.__lundenWorkerFixtureCleanupRegistered) return;
  global.__lundenWorkerFixtureCleanupRegistered = true;

  const cleanupAll = () => {
    for (const pid of activeOwnedPids) {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        try { process.kill(pid, 'SIGTERM'); } catch {}
      }
    }
    for (const unit of activeOwnedUnits) {
      try {
        execFileSync('systemctl', ['--user', 'stop', unit], { stdio: 'ignore' });
      } catch {}
    }
    activeOwnedPids.clear();
    activeOwnedUnits.clear();
  };

  process.once('exit', cleanupAll);
  process.once('SIGINT', () => { cleanupAll(); process.exit(130); });
  process.once('SIGTERM', () => { cleanupAll(); process.exit(143); });
}

registerExitHandlers();

function defaultWorkerFiles(root = DEFAULT_ROOT) {
  try {
    const gitFiles = execFileSync('git', ['ls-files', 'src', 'cloudflare', 'index.html'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .trim()
      .split('\n')
      .map(s => s.trim())
      .filter(p => p && /\.(js|mjs|html)$/.test(p) && !p.endsWith('.test.mjs'));
    return [...new Set(gitFiles)].sort();
  } catch {
    return [
      'cloudflare/beershelf.js',
      'cloudflare/crash.js',
      'cloudflare/dev.mjs',
      'cloudflare/devws.mjs',
      'cloudflare/layout.js',
      'cloudflare/players.js',
      'cloudflare/worker.js',
      'src/config.js',
      'src/privatecodes.js',
      'src/version.js',
      'index.html'
    ].filter(f => fs.existsSync(path.join(root, f))).sort();
  }
}

function sourcePaths(options = {}) {
  const root = options.root || DEFAULT_ROOT;
  let files;
  if (Array.isArray(options)) {
    files = options;
  } else if (Array.isArray(options.files)) {
    files = options.files;
  } else {
    files = defaultWorkerFiles(root);
  }
  const extra = Array.isArray(options.extraSources) ? options.extraSources : [];
  return [...new Set([...files, ...extra])].filter(f => fs.existsSync(path.join(root, f))).sort();
}

function sourceHashes(options = {}) {
  const root = (options && options.root) || DEFAULT_ROOT;
  const paths = Array.isArray(options) ? options : sourcePaths(options);
  const out = {};
  for (const p of paths) {
    const full = path.join(root, p);
    try {
      const content = fs.readFileSync(full);
      out[p] = crypto.createHash('sha256').update(content).digest('hex');
    } catch {
      // Omit unreadable or missing files
    }
  }
  return out;
}

function checkFreshness(frozenHashes, options = {}) {
  const root = (options && options.root) || DEFAULT_ROOT;
  const current = {};
  const changed = [];
  for (const p of Object.keys(frozenHashes)) {
    const full = path.join(root, p);
    try {
      const hash = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
      current[p] = hash;
      if (hash !== frozenHashes[p]) {
        changed.push(p);
      }
    } catch {
      changed.push(p);
    }
  }
  return {
    fresh: changed.length === 0,
    changed,
    currentHashes: current
  };
}

function assertFresh(frozenHashes, options = {}) {
  const { fresh, changed } = checkFreshness(frozenHashes, options);
  if (!fresh) {
    throw new Error(`Source files modified since Worker startup: ${changed.join(', ')}`);
  }
}

function getSocketInodes(pid) {
  if (process.platform !== 'linux') return new Set();
  try {
    const fds = fs.readdirSync(`/proc/${pid}/fd`);
    const inodes = new Set();
    for (const fd of fds) {
      try {
        const link = fs.readlinkSync(`/proc/${pid}/fd/${fd}`);
        const m = link.match(/^socket:\[(\d+)\]$/);
        if (m) inodes.add(m[1]);
      } catch {}
    }
    return inodes;
  } catch {
    return new Set();
  }
}

function ownsPort(pid, port) {
  if (process.platform !== 'linux') {
    throw new Error('owned Worker socket provenance currently requires Linux /proc');
  }
  const inodes = getSocketInodes(pid);
  if (inodes.size === 0) return false;
  const targetPort = Number(port);
  return ['tcp', 'tcp6'].some(net => {
    try {
      const rows = fs.readFileSync(`/proc/net/${net}`, 'utf8').trim().split('\n').slice(1);
      return rows.some(row => {
        const c = row.trim().split(/\s+/);
        return c[3] === '0A' && parseInt(c[1]?.split(':')[1], 16) === targetPort && inodes.has(c[9]);
      });
    } catch {
      return false;
    }
  });
}

function getPortListener(port) {
  if (process.platform !== 'linux') return null;
  const targetPort = Number(port);
  const inodes = new Set();
  for (const net of ['tcp', 'tcp6']) {
    try {
      const rows = fs.readFileSync(`/proc/net/${net}`, 'utf8').trim().split('\n').slice(1);
      for (const row of rows) {
        const c = row.trim().split(/\s+/);
        if (c[3] === '0A' && parseInt(c[1]?.split(':')[1], 16) === targetPort) {
          inodes.add(c[9]);
        }
      }
    } catch {}
  }
  if (inodes.size === 0) return null;

  try {
    for (const pidStr of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(pidStr)) continue;
      const pid = Number(pidStr);
      try {
        const fds = fs.readdirSync(`/proc/${pid}/fd`);
        for (const fd of fds) {
          try {
            const link = fs.readlinkSync(`/proc/${pid}/fd/${fd}`);
            const m = link.match(/^socket:\[(\d+)\]$/);
            if (m && inodes.has(m[1])) {
              return pid;
            }
          } catch {}
        }
      } catch {}
    }
  } catch {}
  return 'unknown';
}

function getProcessStartTicks(pid) {
  if (process.platform !== 'linux') return null;
  try {
    const raw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = raw.slice(raw.lastIndexOf(')') + 2).trim().split(/\s+/);
    return Number(fields[19]);
  } catch {
    return null;
  }
}

function getSystemClockHz() {
  try {
    return Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim() || 100);
  } catch {
    return 100;
  }
}

class WorkerFixture {
  constructor(options = {}) {
    this.root = options.root || DEFAULT_ROOT;
    this.port = options.port ? Number(options.port) : 8144;
    this.adminToken = options.adminToken || 'testtoken';
    this.outDir = options.outDir || null;
    this.extraSources = options.extraSources || [];
    this.runner = options.runner || 'process'; // 'process' | 'systemd'
    this.allowExternal = !!options.allowExternal;
    this.compatibility = options.compatibility || 'old-versioncompatibility';
    this.timeoutMs = options.timeoutMs || 5000;

    this.child = null;
    this.unitName = null;
    this.pid = null;
    this.workerLog = null;
    this.provenance = null;
    this.frozenHashes = null;
  }

  async start() {
    // 1. Check if an external worker was explicitly requested
    if (this.allowExternal) {
      return this._attachExternal();
    }

    // 2. Pre-spawn safety check: ensure the port is NOT in use
    const listener = getPortListener(this.port);
    if (listener !== null) {
      throw new Error(`Cannot start owned Worker: port ${this.port} is already in use by PID ${listener} (unowned)`);
    }

    // 3. Freeze source hashes before spawning
    const freezeUptime = os.uptime();
    const freezeUTC = new Date().toISOString();
    this.frozenHashes = sourceHashes({ root: this.root, extraSources: this.extraSources });

    if (this.outDir) {
      fs.mkdirSync(this.outDir, { recursive: true });
      fs.writeFileSync(path.join(this.outDir, 'source-freeze.json'), JSON.stringify(this.frozenHashes, null, 2));
    }

    // 4. Start via selected runner
    if (this.runner === 'systemd') {
      await this._startSystemd(freezeUptime, freezeUTC);
    } else {
      await this._startProcess(freezeUptime, freezeUTC);
    }

    globalActiveFixture = this;

    const result = Object.assign({}, this.frozenHashes);
    Object.defineProperty(result, 'provenance', { value: this.provenance, enumerable: false });
    Object.defineProperty(result, 'pid', { value: this.pid, enumerable: false });
    Object.defineProperty(result, 'port', { value: this.port, enumerable: false });
    Object.defineProperty(result, 'url', { value: `http://localhost:${this.port}`, enumerable: false });
    Object.defineProperty(result, 'stop', { value: () => this.stop(), enumerable: false });
    Object.defineProperty(result, 'verifyFreshness', { value: () => assertFresh(this.frozenHashes, { root: this.root }), enumerable: false });

    return result;
  }

  async _startProcess(freezeUptime, freezeUTC) {
    if (this.outDir) {
      this.workerLog = fs.createWriteStream(path.join(this.outDir, 'owned-worker.log'));
    }

    const stderrBuf = [];
    this.child = spawn(process.execPath, ['cloudflare/dev.mjs', String(this.port), this.adminToken], {
      cwd: this.root,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.pid = this.child.pid;
    activeOwnedPids.add(this.pid);

    if (this.workerLog) {
      this.child.stdout.pipe(this.workerLog);
      this.child.stderr.pipe(this.workerLog, { end: false });
    }

    this.child.stderr.on('data', chunk => {
      stderrBuf.push(chunk.toString());
      if (stderrBuf.length > 20) stderrBuf.shift();
    });

    const hz = getSystemClockHz();
    const startTicks = getProcessStartTicks(this.pid);
    if (startTicks !== null) {
      const bornUptime = startTicks / hz;
      if (bornUptime < freezeUptime - 1.0) {
        await this.stop();
        throw new Error(`Worker PID ${this.pid} was born before source freeze (${bornUptime} < ${freezeUptime})`);
      }
    }

    const startWait = Date.now();
    let owned = false;
    while (Date.now() - startWait < this.timeoutMs) {
      if (this.child.exitCode !== null) {
        const errDetails = stderrBuf.join('').trim();
        await this.stop();
        throw new Error(`Fresh Worker exited before socket ownership (exitCode: ${this.child.exitCode}, signal: ${this.child.signalCode}): ${errDetails}`);
      }
      try {
        if (ownsPort(this.pid, this.port)) {
          owned = true;
          break;
        }
      } catch (e) {
        if (!e.message.includes('ENOENT')) {
          await this.stop();
          throw e;
        }
      }
      await new Promise(r => setTimeout(r, 50));
    }

    if (!owned) {
      await this.stop();
      throw new Error(`Fresh owned Worker bind timeout on port ${this.port}`);
    }

    // 5. Verify that source files did not mutate during boot
    const currentHashes = sourceHashes({ root: this.root, extraSources: this.extraSources });
    const changed = Object.keys(this.frozenHashes).filter(p => currentHashes[p] !== this.frozenHashes[p]);
    if (changed.length > 0) {
      await this.stop();
      throw new Error(`Server modules changed during fresh boot: ${changed.join(', ')}`);
    }

    this.provenance = {
      pid: this.pid,
      port: this.port,
      url: `http://localhost:${this.port}`,
      cwd: this.root,
      startUTC: new Date().toISOString(),
      freezeUTC,
      freezeUptime,
      startTicks,
      hz,
      ownedListeningSocket: true,
      mode: 'owned',
      runner: 'process',
      verifiedFresh: true,
      hashes: this.frozenHashes
    };

    if (this.outDir) {
      fs.writeFileSync(path.join(this.outDir, 'worker-provenance.json'), JSON.stringify(this.provenance, null, 2));
    }
  }

  async _startSystemd(freezeUptime, freezeUTC) {
    this.unitName = `lunden-worker-${Date.now()}-${this.port}`;
    activeOwnedUnits.add(this.unitName);

    const devMjsPath = path.join(this.root, 'cloudflare/dev.mjs');
    execFileSync('systemd-run', [
      '--user',
      `--unit=${this.unitName}`,
      '--property=TimeoutStopSec=5',
      process.execPath,
      devMjsPath,
      String(this.port),
      this.adminToken
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    const startWait = Date.now();
    let owned = false;
    let mainPid = 0;
    while (Date.now() - startWait < this.timeoutMs) {
      if (!mainPid) {
        try {
          const pidStr = execFileSync('systemctl', ['--user', 'show', '-p', 'MainPID', '--value', this.unitName], { encoding: 'utf8' }).trim();
          mainPid = Number(pidStr);
          if (mainPid > 0) {
            this.pid = mainPid;
            activeOwnedPids.add(this.pid);
          }
        } catch {}
      }
      if (mainPid > 0) {
        try {
          if (ownsPort(mainPid, this.port)) {
            owned = true;
            break;
          }
        } catch {}
      }
      await new Promise(r => setTimeout(r, 50));
    }

    if (!owned) {
      await this.stop();
      throw new Error(`Systemd-run worker failed to bind port ${this.port} within ${this.timeoutMs}ms`);
    }

    const currentHashes = sourceHashes({ root: this.root, extraSources: this.extraSources });
    const changed = Object.keys(this.frozenHashes).filter(p => currentHashes[p] !== this.frozenHashes[p]);
    if (changed.length > 0) {
      await this.stop();
      throw new Error(`Server modules changed during fresh boot: ${changed.join(', ')}`);
    }

    this.provenance = {
      unit: this.unitName,
      pid: this.pid,
      port: this.port,
      url: `http://localhost:${this.port}`,
      cwd: this.root,
      startUTC: new Date().toISOString(),
      freezeUTC,
      freezeUptime,
      ownedListeningSocket: true,
      mode: 'owned',
      runner: 'systemd',
      verifiedFresh: true,
      hashes: this.frozenHashes
    };

    if (this.outDir) {
      fs.writeFileSync(path.join(this.outDir, 'worker-provenance.json'), JSON.stringify(this.provenance, null, 2));
    }
  }

  async _attachExternal() {
    const url = `http://localhost:${this.port}`;
    this.frozenHashes = sourceHashes({ root: this.root, extraSources: this.extraSources });
    this.provenance = {
      url,
      port: this.port,
      mode: 'external',
      verifiedFresh: false,
      status: 'unverified',
      compatibility: this.compatibility,
      warning: 'External Worker cannot verify current-source acceptance without fresh provenance',
      recordedAt: new Date().toISOString(),
      hashes: this.frozenHashes
    };

    if (this.outDir) {
      fs.mkdirSync(this.outDir, { recursive: true });
      fs.writeFileSync(path.join(this.outDir, 'worker-provenance.json'), JSON.stringify(this.provenance, null, 2));
    }

    const result = Object.assign({}, this.frozenHashes);
    Object.defineProperty(result, 'provenance', { value: this.provenance, enumerable: false });
    Object.defineProperty(result, 'port', { value: this.port, enumerable: false });
    Object.defineProperty(result, 'url', { value: url, enumerable: false });
    Object.defineProperty(result, 'stop', { value: async () => {}, enumerable: false });
    return result;
  }

  async stop() {
    if (this.child) {
      const pidToKill = this.pid;
      if (pidToKill && activeOwnedPids.has(pidToKill)) {
        try {
          process.kill(-pidToKill, 'SIGTERM');
        } catch (e) {
          if (e.code !== 'ESRCH') {
            try { process.kill(pidToKill, 'SIGTERM'); } catch {}
          }
        }
        await Promise.race([
          new Promise(r => this.child.once('exit', r)),
          new Promise(r => setTimeout(r, 2000))
        ]);
        if (this.child.exitCode === null) {
          try { process.kill(-pidToKill, 'SIGKILL'); } catch {
            try { process.kill(pidToKill, 'SIGKILL'); } catch {}
          }
        }
        activeOwnedPids.delete(pidToKill);
      }
      this.child = null;
    }

    if (this.unitName && activeOwnedUnits.has(this.unitName)) {
      try {
        const execStatus = execFileSync('systemctl', ['--user', 'show', '-p', 'ExecMainCode,ExecMainStatus,ActiveState', this.unitName], { encoding: 'utf8' }).trim();
        if (this.outDir) {
          fs.writeFileSync(path.join(this.outDir, 'systemd-status.txt'), execStatus + '\n');
        }
        execFileSync('systemctl', ['--user', 'stop', this.unitName], { stdio: 'ignore' });
      } catch {}
      activeOwnedUnits.delete(this.unitName);
      this.unitName = null;
    }

    if (this.pid) {
      activeOwnedPids.delete(this.pid);
      this.pid = null;
    }

    if (this.workerLog) {
      try { this.workerLog.end(); } catch {}
      this.workerLog = null;
    }

    if (globalActiveFixture === this) {
      globalActiveFixture = null;
    }
  }
}

async function startOwnedWorker(urlOrPort, options = {}) {
  let opts = {};
  if (typeof options === 'string') {
    opts = { outDir: options };
  } else if (options && typeof options === 'object') {
    opts = { ...options };
  }

  let port = opts.port || 8144;
  if (typeof urlOrPort === 'number') {
    port = urlOrPort;
  } else if (typeof urlOrPort === 'string') {
    if (/^https?:\/\//i.test(urlOrPort)) {
      const u = new URL(urlOrPort);
      if (!['localhost', '127.0.0.1'].includes(u.hostname) && !opts.allowExternal) {
        throw new Error('external/stale Worker forbidden; use allowExternal: true for explicit old-versioncompatibility');
      }
      port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
    } else if (/^\d+$/.test(urlOrPort)) {
      port = Number(urlOrPort);
    }
  }

  opts.port = port;
  const fixture = new WorkerFixture(opts);
  return fixture.start();
}

async function stopOwnedWorker(handle) {
  if (handle && typeof handle.stop === 'function') {
    return handle.stop();
  }
  if (globalActiveFixture) {
    return globalActiveFixture.stop();
  }
}

function createWorkerFixture(options = {}) {
  return new WorkerFixture(options);
}

module.exports = {
  startOwnedWorker,
  stopOwnedWorker,
  sourcePaths,
  sourceHashes,
  checkFreshness,
  assertFresh,
  ownsPort,
  getPortListener,
  createWorkerFixture,
  WorkerFixture
};
