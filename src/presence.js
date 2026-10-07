// Live visitors (#424): a short-lived KV heartbeat, shown beside the score.
const KEY = 'lunden.presenceId', EVERY = 30_000;

const visitorId = () => {
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) { id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; sessionStorage.setItem(KEY, id); }
    return id;
  } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
};

export class Presence {
  constructor(url, el, { getName = () => '', getScore = () => 0, onUpdate = () => {} } = {}) {
    Object.assign(this, { url, el, getName, getScore, onUpdate, id: visitorId(), timer: null, count: 0, names: [], players: [] });
    if (!this.on) return;
    this.beat();
    this.timer = setInterval(() => this.beat(), EVERY);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.beat(); });
  }

  get on() { return !!this.url; }

  async beat() {
    try {
      const name = this.getName?.() ?? '';
      const score = Number(this.getScore?.() ?? 0) | 0;
      const body = name ? JSON.stringify({ name, score }) : undefined;
      const headers = body ? { 'Content-Type': 'application/json' } : undefined;
      const r = await fetch(`${this.url}/presence/${this.id}`, { method: 'PUT', headers, body, cache: 'no-store' });
      if (r.ok) {
        const data = await r.json();
        if (Number.isInteger(data.count)) {
          this.count = data.count;
          if (this.el) {
            this.el.innerHTML = `<span class="presence-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-5.784 6A2.238 2.238 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.325 6.325 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1h4.216zM4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg></span><b class="presence-count">${data.count}</b>`;
          }
        }
        if (Array.isArray(data.names)) {
          this.names = data.names;
        }
        if (Array.isArray(data.players)) {
          this.players = data.players;
        } else if (Array.isArray(data.names)) {
          this.players = data.names.map((n) => ({ name: n, score: 0 }));
        }
        this.onUpdate?.(this);
      }
    } catch { /* offline: the next heartbeat will try again */ }
  }
}
