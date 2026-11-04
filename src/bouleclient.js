import { BOULE_SYNC, playBoule } from './boulesync.js';
import { BOULE as B } from './config.js';
const reasons = { away: 'Ställ dig vid banan eller i kastringen', turn: 'Det andra laget ska kasta', busy: 'Vänta tills klotet ligger still', stale: 'Banan uppdaterades – försök igen', fast: 'Vänta ett ögonblick' };
// Explicit welcome capability + authoritative ACK. Never commit a shared throw optimistically.
export class BouleClient {
  constructor(boule, ghosts) {
    this.boule = boule; this.ghosts = ghosts; this.sharedSession = false; this.participated = false; this.capable = false; this.q = -1; this.pending = 0; this.trace = null; this.noticeQ = -1;
    const welcome = ghosts.onWelcome; ghosts.onWelcome = m => { welcome?.(m); this.q = -1; this.capable = m.boule?.v === BOULE_SYNC.version; if (this.capable) this.receive({ t: 'bl', ...m.boule }); };
    ghosts.onBoule = m => this.receive(m); boule.net = this;
  }
  get connected() { return this.ghosts.connected; }
  get managed() { return !!this.ghosts.on || this.connected || this.sharedSession; }
  get interest() { return this.participated && this.boule.near(this.ghosts.camera.position); }
  receive(m) {
    if (m.v !== BOULE_SYNC.version || !m.e || !Number.isSafeInteger(m.e.q) || m.e.q < this.q) return;
    const interested = this.interest, requested = !!this.pending;
    this.sharedSession = true; this.capable = true; this.pending = 0;
    if (m.e.q !== this.q) {
      this.q = m.e.q; this.trace = null;
      if (m.action) { const a = m.action, replay = playBoule(a.start, a.cmd, a.seed, a.from, true); if (!replay.error) this.trace = { frames: replay.frames, since: performance.now() - a.elapsed, ms: a.ms }; }
      Object.assign(this.boule.rules, structuredClone(m.e.rules));
      this.boule.physics.objects = structuredClone(m.e.objects); this.boule.flight = this.boule.settling = null; this.boule.acc = 0;
      this.boule.dirty = true;
      // Shared state reaches the whole room; HUD verdicts belong to nearby participants only.
      // Keep the shown revision across reconnects so a repeated welcome is not a new verdict.
      if (interested && this.noticeQ !== m.e.q) { this.noticeQ = m.e.q; this.boule.onEvent?.(this.boule.rules.message); }
    }
    if (m.why && (interested || requested)) this.boule.onEvent?.(reasons[m.why] ?? 'Kastet kunde inte godkännas');
    this.update();
  }
  command(k, camera, point) {
    if (!this.connected) return 'Anslutningen till gemensamma banan saknas – vänta på återanslutning';
    if (!this.capable || this.q < 0) return 'Gemensam boule är inte tillgänglig ännu – ladda om spelet och försök igen';
    if (this.pending || this.trace) return 'Vänta tills kastet är bekräftat och klotet ligger still';
    if (k === 't' && this.boule.rules.next === null) return 'Partiet är slut – välj Nytt parti på pulpeten';
    if (k === 't' && this.boule.rules.next === 'collect') k = 'c';
    let aim;
    if (k === 't') {
      if (!this.boule.inCircle(camera.position)) return 'Ställ dig i kastringen vid banans norra ände';
      let x = point?.x, z = point?.z;
      if (!Number.isFinite(x) || !Number.isFinite(z)) { camera.getWorldDirection(this.boule.ray); const d = this.boule.ray, s = d.y < -.05 ? (B.surface - camera.position.y) / d.y : 6; x = camera.position.x + d.x * s; z = camera.position.z + d.z * s; }
      aim = [x, z];
    }
    if (!this.ghosts.boule({ t: 'bl', k, q: this.q, ...(aim ? { aim } : {}) })) return 'Ingen anslutning – försök igen';
    this.participated = true; this.pending = performance.now(); return 'Väntar på gemensamma banan…';
  }
  update() {
    if (!this.connected) { this.capable = false; this.q = -1; this.trace = null; this.pending = 0; this.boule.sharedFrame = this.sharedSession ? this.boule.physics.objects.map(o => ({ ...o, y: B.surface + o.r })) : null; return; }
    if (this.pending && performance.now() - this.pending > BOULE_SYNC.pendingMs) { this.pending = 0; this.ghosts.boule({ t: 'bl', k: 'g', q: Math.max(0, this.q) }); this.boule.onEvent?.('Inget kastsvar ännu – hämtar banan igen'); }
    const t = this.trace, elapsed = t ? (performance.now() - t.since) / 1000 : 0;
    if (t && elapsed * 1000 >= t.ms) this.trace = null;
    if (!this.trace) { this.boule.sharedFrame = this.boule.physics.objects.map(o => ({ ...o, y: B.surface + o.r })); return; }
    const frames = t.frames; let i = 0; while (i < frames.length - 2 && frames[i + 1].t <= elapsed) i++;
    const a = frames[i], b = frames[i + 1] ?? a, u = b.t > a.t ? Math.max(0, Math.min(1, (elapsed - a.t) / (b.t - a.t))) : 1;
    this.boule.sharedFrame = a.objects.map((o, j) => ({ ...o, active: o.active || b.objects[j].active, x: o.x + (b.objects[j].x - o.x) * u, y: o.y + (b.objects[j].y - o.y) * u, z: o.z + (b.objects[j].z - o.z) * u }));
  }
}
