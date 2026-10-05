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
  constructor(url, el) {
    Object.assign(this, { url, el, id: visitorId(), timer: null });
    if (!this.on) return;
    this.beat();
    this.timer = setInterval(() => this.beat(), EVERY);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.beat(); });
  }

  get on() { return !!this.url; }

  async beat() {
    try {
      const r = await fetch(`${this.url}/presence/${this.id}`, { method: 'PUT', cache: 'no-store' });
      if (r.ok) {
        const { count } = await r.json();
        if (Number.isInteger(count)) this.el.textContent = `👥 ${count}`;
      }
    } catch { /* offline: the next heartbeat will try again */ }
  }
}
