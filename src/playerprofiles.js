// Each loaded page pins its player: another tab changing player cannot redirect its writes.
export const PROFILE_KEY = 'lunden.players.v1';
const PERSONAL = new Set(['name', 'playerId', 'stats', 'avatar', 'life', 'blinds', 'paddockGrass',
  'furniture', 'furniture.layout', 'furniture.unlocked', 'catCards.migrated', 'taskHints',
  'target', 'resume', 'session', 'nameSkipped', 'resetDone', 'resetHideMenu', 'playerWorld']);
const personal = key => PERSONAL.has(String(key).replace(/^lunden\./, '')) && String(key).startsWith('lunden.');
export function createProfiles(local, session, uuid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`) {
  let registry;
  try { registry = JSON.parse(local.getItem(PROFILE_KEY)); } catch { /* unavailable */ }
  if (!registry || registry.v !== 1 || !Array.isArray(registry.players) || !registry.players.some(p => p.id === registry.active)) {
    const id = local.getItem('lunden.playerId') || uuid();
    registry = { v: 1, active: id, players: [{ id, name: local.getItem('lunden.name') || '', legacy: true }] };
    local.setItem(PROFILE_KEY, JSON.stringify(registry));
  }
  const id = registry.active;
  const read = () => JSON.parse(local.getItem(PROFILE_KEY));
  const current = () => read().players.find(p => p.id === id);
  const keyFor = (p, key) => p.legacy ? key : `lunden.player.${p.id}.${key.slice(7)}`;
  const wrap = store => ({
    getItem(key) { const p = current(); return personal(key) ? (p ? store.getItem(keyFor(p, key)) : null) : store.getItem(key); },
    setItem(key, value) {
      const p = current();
      if (!p) throw new Error('Spelaren har tagits bort. Ladda om sidan.');
      store.setItem(personal(key) ? keyFor(p, key) : key, value);
      if (key === 'lunden.name') { const r = read(); r.players.find(p => p.id === id).name = String(value); local.setItem(PROFILE_KEY, JSON.stringify(r)); }
    },
    removeItem(key) { const p = current(); if (!personal(key) || p) store.removeItem(personal(key) ? keyFor(p, key) : key); },
    keys() {
      const p = current(), keys = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k === PROFILE_KEY || k.startsWith('lunden.player.')) {
          if (p && k.startsWith(`lunden.player.${p.id}.`)) keys.push(`lunden.${k.slice(`lunden.player.${p.id}.`.length)}`);
        } else if (!personal(k) || p?.legacy) keys.push(k);
      }
      return keys;
    },
    get length() { return this.keys().length; },
    key(i) { return this.keys()[i] ?? null; },
  });
  const localView = wrap(local), sessionView = wrap(session);
  if (!localView.getItem('lunden.playerId')) localView.setItem('lunden.playerId', id);
  return {
    id, local: localView, session: sessionView,
    list: () => read().players.map(p => ({ ...p, avatar: local.getItem(keyFor(p, 'lunden.avatar')) })),
    select(target) { const r = read(); if (!r.players.some(p => p.id === target)) throw new Error('Spelaren finns inte kvar.'); r.active = target; local.setItem(PROFILE_KEY, JSON.stringify(r)); },
    create(name) {
      const r = read(), existing = r.players.find(p => p.name.toLocaleLowerCase('sv') === name.toLocaleLowerCase('sv'));
      if (existing) return existing.id;
      const p = { id: uuid(), name };
      // Publish only after the initial identity writes succeed.
      try {
        local.setItem(keyFor(p, 'lunden.name'), name);
        local.setItem(keyFor(p, 'lunden.playerId'), p.id);
        r.players.push(p); local.setItem(PROFILE_KEY, JSON.stringify(r));
      } catch (error) { local.removeItem(keyFor(p, 'lunden.name')); local.removeItem(keyFor(p, 'lunden.playerId')); throw error; }
      return p.id;
    },
    database(store) { const p = current(); if (!p) throw new Error('Spelaren har tagits bort.'); return store === 'drawings' || p?.legacy ? 'lunden' : `lunden-player-${id}`; },
    async remove(target, deleteDatabase) {
      const r = read(), p = r.players.find(p => p.id === target);
      if (!p) return;
      // Delete photos before removing the registry entry so a failure remains retryable.
      await deleteDatabase(p);
      for (const store of [local, session]) {
        for (const key of PERSONAL) store.removeItem(keyFor(p, `lunden.${key}`));
      }
      const queue = JSON.parse(local.getItem('lunden.scoreQueue') ?? '[]');
      if (Array.isArray(queue)) local.setItem('lunden.scoreQueue', JSON.stringify(queue.filter(row => row.id !== target)));
      const latest = read(); latest.players = latest.players.filter(p => p.id !== target);
      if (latest.active === target) {
        const next = latest.players[0] ?? { id: uuid(), name: '' };
        if (!latest.players.length) latest.players.push(next);
        latest.active = next.id;
      }
      local.setItem(PROFILE_KEY, JSON.stringify(latest));
    },
  };
}
let profiles;
try { profiles = createProfiles(globalThis.localStorage, globalThis.sessionStorage); } catch { /* normal storage fallback stays visit-only */ }
export { profiles };
const fallback = type => ({
  getItem(key) { try { return globalThis[type]?.getItem(key) ?? null; } catch { return null; } },
  setItem(key, value) { if (!globalThis[type]) throw new Error('Webbläsaren tillåter inte sparande.'); globalThis[type].setItem(key, value); },
  removeItem(key) { globalThis[type]?.removeItem(key); },
  get length() { return globalThis[type]?.length ?? 0; },
  key(i) { return globalThis[type]?.key(i) ?? null; },
});
export const playerLocalStorage = profiles?.local ?? fallback('localStorage');
export const playerSessionStorage = profiles?.session ?? fallback('sessionStorage');
