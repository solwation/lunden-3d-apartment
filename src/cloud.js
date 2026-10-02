import { CLOUD_URL } from './config.js';
import { BUILD } from './version.js';

// The shared world (#178, #119): taped-up drawings and the sheet on the Sovrum 3 desk go
// to the Cloudflare Worker in cloudflare/ (when CLOUD_URL is set), so visitors find things others made. Silent:
// no icon, no message — things are just there. Everything is saved locally first (posters.js, drawing.js)
// and works without the Worker; changes go into a queue (localStorage) that is sent in order and
// kept while offline. A pull at the start, every minute and when the tab comes back merges the server in:
// drawings — the newer `updated` wins, a drawing gone from the server (thrown away elsewhere) comes down here
// too; the desk sheet — the newer one wins. Cat photos are personal and never leave the browser (#211).
// &sync=debug logs what happens to the console.

const QKEY = 'lunden.cloud.queue', PAPER_T = 'lunden.drawing.updated';
const POLL = 60_000;
const params = new URLSearchParams(location.search);
const debug = params.get('sync') === 'debug';
const log = (...a) => { if (debug) console.log('[cloud]', ...a); };

/** The Worker's address, or '' = off. &cloud=<url> wins (also locally and in tests); else CLOUD_URL, published only. */
export function cloudUrl() {
  const p = params.get('cloud');
  if (p !== null) return p.replace(/\/+$/, '');
  return BUILD === 'dev' ? '' : CLOUD_URL.replace(/\/+$/, '');
}

const readJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k) ?? '') ?? d; } catch { return d; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } };

const toDataURL = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

class Retry extends Error {}

export class Cloud {
  /** posters (posters.js), drawing (drawing.js), holding(): is the desk sheet in the hand? */
  constructor({ posters, drawing, holding = () => false }, url = cloudUrl()) {
    Object.assign(this, { url, posters, drawing, holding, busy: false, pulling: false });
    // cat photos queued by an older version are never sent (#211)
    this.queue = readJSON(QKEY, []).filter((q) => q.type !== 'cat');
    try { localStorage.removeItem('lunden.cloud.seenCats'); } catch { /* blocked */ }
    if (!this.on) return; // off: nothing is hooked up, nothing is sent
    posters.onPut = (rec) => this.push({ type: 'drawing', key: `d:${rec.id}`, id: rec.id });
    posters.onDelete = (id) => this.push({ type: 'undraw', key: `d:${id}`, id });
    drawing.onSaved = () => { writeJSON(PAPER_T, Date.now()); this.push({ type: 'paper', key: 'paper' }); };
    this.timer = setInterval(() => this.sync(), POLL);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.sync(); });
    addEventListener('online', () => this.sync());
  }

  get on() { return !!this.url; }

  /** Queue a change (a later change of the same thing replaces an unsent earlier one) and try to send it. */
  push(op) {
    this.queue = [...this.queue.filter((q) => q.key !== op.key), op];
    writeJSON(QKEY, this.queue);
    log('queued', op);
    this.flush();
  }

  async req(method, path, body) {
    let r;
    try {
      r = await fetch(this.url + path, { method, cache: 'no-store', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    } catch (e) { throw new Retry(e.message); } // offline
    if (r.status === 429 || r.status >= 500) throw new Retry(`HTTP ${r.status}`);
    return r;
  }

  /** Send the queue in order; stops (keeping the rest) at the first network / server trouble. */
  flush() {
    if (!this.on) return Promise.resolve();
    this.flushing ??= this.sendAll().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  async sendAll() {
    this.busy = true;
    try {
      while (this.queue.length) {
        const op = this.queue[0];
        try { await this.send(op); } catch (e) { if (e instanceof Retry) { log('later:', e.message); break; } log('dropped', op, e); }
        this.queue = this.queue.filter((q) => q !== op);
        writeJSON(QKEY, this.queue);
      }
    } finally { this.busy = false; }
  }

  async send(op) {
    if (op.type === 'drawing') {
      const p = this.posters.byId(op.id);
      if (!p) return; // gone again before it was sent
      const { image, synced, ...meta } = p.rec;
      const r = await this.req('PUT', `/drawings/${op.id}`, { ...meta, image });
      if (r.ok) this.posters.markSynced(op.id);
      log('put drawing', op.id, r.status);
    } else if (op.type === 'undraw') {
      const r = await this.req('DELETE', `/drawings/${op.id}`);
      log('delete drawing', op.id, r.status);
    } else if (op.type === 'paper') {
      const updated = readJSON(PAPER_T, Date.now());
      const r = await this.req('PUT', '/paper', { image: this.drawing.canvas.toDataURL('image/jpeg', 0.85), updated });
      log('put paper', r.status);
    }
  }

  async image(path) {
    const r = await this.req('GET', path);
    if (!r.ok) return null;
    return toDataURL(await r.blob());
  }

  /** Send what is waiting, then merge in what the server has. */
  async sync() {
    if (!this.on || this.pulling) return;
    this.pulling = true;
    try {
      // drawings made before the cloud was switched on (or never sent): up they go
      for (const p of this.posters.list) if (!p.rec.synced && !this.queue.some((q) => q.key === `d:${p.rec.id}`)) this.push({ type: 'drawing', key: `d:${p.rec.id}`, id: p.rec.id });
      await this.flush();
      await this.pullDrawings();
      await this.pullPaper();
    } catch (e) { log('sync stopped:', e.message); } finally { this.pulling = false; }
  }

  async pullDrawings() {
    const t0 = Date.now(); // a drawing sent after this may not be in the list yet
    const r = await this.req('GET', '/drawings');
    if (!r.ok) return;
    const list = await r.json(), remote = new Map(list.map((d) => [d.id, d]));
    const pending = new Set(this.queue.map((q) => q.key));
    for (const p of [...this.posters.list]) {
      const id = p.rec.id, rm = remote.get(id);
      if (pending.has(`d:${id}`)) continue;
      if (!rm) { if (p.rec.synced && (p.rec.synced === true || p.rec.synced < t0)) { log('gone on the server', id); await this.posters.drop(p); } }
      else if (rm.updated > p.rec.updated) { log('newer on the server', id); await this.posters.drop(p); await this.posters.addRemote({ ...p.rec, ...rm, synced: true }); }
    }
    for (const rm of list) {
      if (this.posters.byId(rm.id) || pending.has(`d:${rm.id}`) || this.posters.full) continue;
      const image = await this.image(`/drawings/${rm.id}`);
      if (image && !this.posters.byId(rm.id)) { log('new from the server', rm.id); await this.posters.addRemote({ ...rm, image, synced: true }); }
    }
  }

  async pullPaper() {
    if (this.queue.some((q) => q.key === 'paper') || this.drawing.active || this.holding()) return;
    const r = await this.req('GET', '/paper');
    if (!r.ok) return;
    const { image, updated } = await r.json();
    if (updated > readJSON(PAPER_T, 0)) { log('a newer desk sheet'); writeJSON(PAPER_T, updated); this.drawing.restore(image, true); }
  }
}
