// Personal, local discovery data. Photos and disposable model thumbnails live in IndexedDB.
const EMPTY = () => ({ seen: false, found: false, firstSeen: null, lastSeen: null, seenCount: 0, foundCount: 0, actions: {}, best: {}, photos: [] });
const ACTIONS = new Set(['pet', 'hug', 'feed', 'catch', 'scare', 'greet', 'find']);
export class BestiaryCollection {
  constructor({ registry, storage, store, now = Date.now, maxPhotos = 3 }) {
    Object.assign(this, { registry, storage, store, now, maxPhotos }); this.listeners = new Set(); this.photoQueue = new Map(); this.tokens = new Set(); this.lastSeen = new Map(); this.error = ''; this.rows = {};
    try { const saved = JSON.parse(storage?.getItem('lunden.bestiary') ?? 'null'); if (saved?.v === 1 && saved.rows && typeof saved.rows === 'object') this.rows = saved.rows; } catch { this.error = 'Samlingen kunde inte läsas.'; }
  }
  get(id) { const row = this.rows[id]; return { ...EMPTY(), ...row, actions: { ...row?.actions }, best: { ...row?.best }, photos: Array.isArray(row?.photos) ? [...row.photos] : [] }; }
  summary() {
    const entries = this.registry.list(), groups = new Map(); let seen = 0, found = 0;
    for (const e of entries) { const row = this.get(e.id); let f = groups.get(e.family.id); if (!f) groups.set(e.family.id, f = { ...e.family, seen: 0, found: 0, total: 0 }); f.total++; if (row.seen) { seen++; f.seen++; } if (row.found) { found++; f.found++; } }
    return { seen, found, total: entries.length, families: [...groups.values()].sort((a, b) => a.order - b.order) };
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() {
    try { this.storage?.setItem('lunden.bestiary', JSON.stringify({ v: 1, rows: Object.fromEntries(Object.entries(this.rows).map(([id, row]) => [id, { ...row, photos: [] }])) })); this.error = ''; } catch { this.error = 'Samlingen sparas bara under detta besök: lagringen är full eller avstängd.'; }
    for (const fn of this.listeners) fn();
  }
  record(id, action = 'seen', { token, cm, kg, name } = {}) {
    if (!this.registry.get(id) || (action !== 'seen' && !ACTIONS.has(action))) return false;
    const time = this.now();
    if (token) { const key = `${id}:${action}:${token}`; if (this.tokens.has(key)) return false; this.tokens.add(key); if (this.tokens.size > 512) this.tokens.delete(this.tokens.values().next().value); }
    if (action === 'seen' && time - (this.lastSeen.get(id) ?? -Infinity) < 60000) return false;
    this.lastSeen.set(id, time);
    const row = this.rows[id] = this.get(id), first = !row.seen; row.seen = true; row.firstSeen ??= time; row.lastSeen = time;
    if (action === 'seen') row.seenCount++;
    else { if (first) row.seenCount++; row.found = true; row.foundCount++; row.actions[action] = (row.actions[action] ?? 0) + 1; }
    if (name) row.lastName = String(name).slice(0, 80);
    if (Number.isFinite(cm) && cm > 0) row.best.cm = Math.max(row.best.cm ?? 0, cm);
    if (Number.isFinite(kg) && kg > 0) row.best.kg = Math.max(row.best.kg ?? 0, kg);
    this.changed(); this.onRecord?.(id, action, first); return true;
  }
  async load() {
    if (!this.store) return;
    try { const photos = await this.store('bestiaryPhotos', 'readonly', s => s.getAll());
      for (const p of photos ?? []) if (this.registry.get(p.entry)) { const r = this.rows[p.entry] ??= EMPTY(); r.photos ??= []; if (!r.photos.some(q => q.id === p.id)) r.photos.push({ id: p.id, time: p.time, data: p.data }); }
      for (const r of Object.values(this.rows)) r.photos = (r.photos ?? []).sort((a, b) => b.time - a.time).slice(0, this.maxPhotos);
      for (const fn of this.listeners) fn();
    } catch { this.error = 'Foton kunde inte läsas. Upptäckter och statistik finns kvar.'; }
  }
  addPhoto(id, data) {
    const task = (this.photoQueue.get(id) ?? Promise.resolve()).then(() => this.writePhoto(id, data));
    this.photoQueue.set(id, task.catch(() => {})); return task;
  }
  async writePhoto(id, data) {
    if (!this.registry.get(id) || typeof data !== 'string' || !data.startsWith('data:image/') || data.length > 1500000) return false;
    const time = this.now(), photo = { id: `${id}:${time}:${Math.random().toString(36).slice(2, 8)}`, entry: id, time, data };
    try {
      if (!this.store) throw new Error('Storage unavailable');
      const row = this.rows[id] ??= EMPTY(), removed = (row.photos ?? []).slice(this.maxPhotos - 1);
      await this.store('bestiaryPhotos', 'readwrite', s => { s.put(photo); for (const p of removed) s.delete(p.id); });
      row.photos = [{ id: photo.id, time, data }, ...(row.photos ?? [])].slice(0, this.maxPhotos);
      // Photo data stays out of synchronous localStorage; only discovery metadata is serialised.
      this.changed(); return true;
    } catch { this.error = 'Fotot kunde inte sparas. Tidigare foton och upptäckter behålls.'; for (const fn of this.listeners) fn(); return false; }
  }
}
