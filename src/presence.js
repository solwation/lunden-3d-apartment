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
  constructor(url, el, { getName = () => '' } = {}) {
    Object.assign(this, { url, el, getName, id: visitorId(), timer: null, count: 0, names: [] });
    if (!this.on) return;
    this.beat();
    this.timer = setInterval(() => this.beat(), EVERY);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.beat(); });
  }

  get on() { return !!this.url; }

  async beat() {
    try {
      const name = this.getName?.() ?? '';
      const body = name ? JSON.stringify({ name }) : undefined;
      const headers = body ? { 'Content-Type': 'application/json' } : undefined;
      const r = await fetch(`${this.url}/presence/${this.id}`, { method: 'PUT', headers, body, cache: 'no-store' });
      if (r.ok) {
        const data = await r.json();
        if (Number.isInteger(data.count)) {
          this.count = data.count;
          if (this.el) this.el.textContent = `👥 ${data.count}`;
        }
        if (Array.isArray(data.names)) {
          this.names = data.names;
        }
      }
    } catch { /* offline: the next heartbeat will try again */ }
  }
}
