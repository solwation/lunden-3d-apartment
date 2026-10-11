import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GHOSTS as G } from './config.js';

// Other players as ghosts (#666): a WebSocket to the Worker's players' room (cloudflare/players.js, one Durable Object for
// everybody). Inert without the cloud (cloud.js `cloudUrl`), with GHOSTS.enabled false or ?mp=0. We send our feet and
// heading at most GHOSTS.hz times a second and only when they changed, a heartbeat 'p' every GHOSTS.beatMs (answered by
// the runtime, never billed), and disconnect when the tab is hidden, on the start screen, or after GHOSTS.idleMs standing
// still. The room's cost cap (close 4001) keeps us off for the rest of the month (localStorage 'lunden.mp.capMonth').
//
// Each other player is one mesh (one draw call: a simple merged body with vertex colours, see-through at GHOSTS.opacity,
// no shadow, depth-tested so walls and floors hide it) and one name tag sprite ("Anonym" without a name; the canvas
// texture is shared by everyone with the same name). States are drawn GHOSTS.delay ms late, interpolated between the
// last two received, so the motion is smooth at 5 Hz.

const CAP_KEY = 'lunden.mp.capMonth';
const monthNow = () => new Date().toISOString().slice(0, 7);
const params = new URLSearchParams(location.search);
export const ANON = 'Anonym';

let bodyGeometry = null;
/** The body, built once and shared: legs, torso, arms, head with two dark eyes at the front (−z, the way it looks). */
function body() {
  if (bodyGeometry) return bodyGeometry;
  const parts = [];
  const add = (g, [x, y, z], shade = 1) => {
    g = g.toNonIndexed(); g.deleteAttribute('uv'); g.translate(x, y, z);
    const c = new Float32Array(g.attributes.position.count * 3).fill(shade);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    parts.push(g);
  };
  for (const s of [-1, 1]) {
    add(new THREE.CapsuleGeometry(0.075, 0.62, 3, 8), [s * 0.1, 0.42, 0]);
    add(new THREE.CapsuleGeometry(0.055, 0.5, 3, 8).rotateZ(s * 0.12), [s * 0.27, 1.08, 0]);
    add(new THREE.SphereGeometry(0.022, 8, 6), [s * 0.045, 1.63, -0.115], 0.15);
  }
  add(new THREE.CapsuleGeometry(0.19, 0.42, 4, 12).scale(1, 1, 0.7), [0, 1.12, 0]);
  add(new THREE.SphereGeometry(0.13, 14, 10), [0, 1.6, 0]);
  bodyGeometry = mergeGeometries(parts);
  bodyGeometry.computeVertexNormals();
  return bodyGeometry;
}

const tags = new Map(); // text → { material, users }
/** A name tag's sprite material (shared by everybody with the same name; 256 × 64 canvas). */
function tagMaterial(text) {
  let t = tags.get(text);
  if (!t) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = '600 30px system-ui, -apple-system, "Segoe UI", sans-serif';
    const w = Math.min(248, g.measureText(text).width + 28), x = (256 - w) / 2;
    g.fillStyle = 'rgba(18, 22, 30, 0.72)';
    g.beginPath(); if (g.roundRect) g.roundRect(x, 8, w, 48, 24); else g.rect(x, 8, w, 48); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 33, 230);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    t = { material: new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }), users: 0 };
    tags.set(text, t);
  }
  t.users++;
  return t.material;
}
function releaseTag(text) {
  const t = tags.get(text);
  if (t && --t.users <= 0) { t.material.map.dispose(); t.material.dispose(); tags.delete(text); }
}

/** A soft colour of its own per name (Anonym: a pale blue-white). */
function tint(name) {
  if (!name) return new THREE.Color(0.85, 0.92, 1);
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.55, 0.72);
}

const lerpAngle = (a, b, t) => a + (Math.atan2(Math.sin(b - a), Math.cos(b - a))) * t;

class Ghost {
  constructor(parent, id, name) {
    this.id = id; this.name = name || ANON; this.snaps = []; this.phase = Math.random() * 6;
    const color = tint(name);
    this.material = new THREE.MeshLambertMaterial({ color, emissive: color.clone().multiplyScalar(0.35), vertexColors: true, transparent: true, opacity: G.opacity, depthWrite: false });
    this.mesh = new THREE.Mesh(body(), this.material);
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    this.mesh.name = `ghost:${this.name}`;
    this.tag = new THREE.Sprite(tagMaterial(this.name));
    this.tag.scale.set(0.8, 0.2, 1);
    this.tag.position.y = 1.98;
    this.root = new THREE.Group();
    this.root.add(this.mesh, this.tag);
    this.root.visible = false; // until its first state
    parent.add(this.root);
  }

  /** A state from the room at time t (ms). After a pause the last one is repeated just before it, so it walks off smoothly. */
  push({ p, r }, t) {
    const last = this.snaps.at(-1);
    if (last && t - last.t > 1000 / G.hz * 1.5) this.snaps.push({ t: t - 1000 / G.hz, p: last.p, r: last.r });
    this.snaps.push({ t, p: new THREE.Vector3(...p), r });
    if (this.snaps.length > 8) this.snaps.splice(0, this.snaps.length - 8);
  }

  /** Place it at render time t − delay; hide it far away, the tag sooner. */
  draw(t, eye) {
    const s = this.snaps;
    if (!s.length) return;
    const at = t - G.delay;
    let a = s[0], b = s[0];
    for (let i = s.length - 1; i >= 0; i--) if (s[i].t <= at) { a = s[i]; b = s[i + 1] ?? s[i]; break; }
    const k = b === a ? 1 : THREE.MathUtils.clamp((at - a.t) / (b.t - a.t), 0, 1);
    this.root.position.lerpVectors(a.p, b.p, k);
    this.root.rotation.y = lerpAngle(a.r, b.r, k);
    this.mesh.position.y = 0.05 + 0.03 * Math.sin(t / 600 + this.phase); // floats a little
    const d = this.root.position.distanceTo(eye);
    this.root.visible = d < G.far;
    this.tag.visible = d < G.tagFar;
  }

  dispose() { this.root.removeFromParent(); this.material.dispose(); releaseTag(this.name); }
}

export class Ghosts {
  /** scene; url: the Worker ('' = off); name(): our name; state(): { p: [x, y, z] feet, r: yaw }; active(): playing (not the start screen). */
  constructor({ scene, camera, url, name = () => '', state, active = () => true }) {
    Object.assign(this, { camera, name, state, active, ws: null, me: null, others: new Map(), sent: null, prev: null,
      lastSent: 0, lastBeat: 0, lastMove: -Infinity, retryAt: 0, backoff: 0, openedAt: 0, connects: 0, messages: 0 });
    this.on = !!url && G.enabled && params.get('mp') !== '0';
    this.url = url ? `${url.replace(/^http/, 'ws')}/players` : '';
    this.group = new THREE.Group();
    this.group.name = 'ghosts';
    scene.add(this.group);
    if (!this.on) return;
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.disconnect(); });
    setInterval(() => this.beat(), 1000); // the heartbeat runs on a timer: slow frames must not let the room think us gone
    addEventListener('pagehide', () => this.disconnect());
  }

  get capped() { try { return localStorage.getItem(CAP_KEY) === monthNow(); } catch { return false; } }
  get connected() { return !!this.me && this.ws?.readyState === 1; }

  connect() {
    const n = this.name() || '';
    const ws = new WebSocket(`${this.url}${n ? `?n=${encodeURIComponent(n)}` : ''}`);
    this.ws = ws; this.openedAt = performance.now(); this.connects++;
    ws.onmessage = (e) => this.message(e.data);
    ws.onclose = (e) => this.closed(ws, e.code);
  }

  /** Our side closes (hidden, start screen, standing still): everyone's ghost goes too. */
  disconnect() {
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(1000, 'bye'); } catch { /* not open yet */ } }
    this.reset();
  }

  reset() { this.me = null; this.sent = null; for (const g of this.others.values()) g.dispose(); this.others.clear(); }

  closed(ws, code) {
    if (ws !== this.ws) return;
    this.ws = null;
    this.reset();
    const t = performance.now();
    if (code === 4001) { try { localStorage.setItem(CAP_KEY, monthNow()); } catch { /* blocked: retries stay rare anyway */ } this.retryAt = t + G.offRetry; return; }
    if (code === 4003) { this.retryAt = t + G.offRetry; return; }
    if (code === 4029) { this.retryAt = t + G.fullRetry; return; }
    if (code === 4000) { this.lastMove = -Infinity; return; } // the room thought us idle: back on the next step
    if (t - this.openedAt > 30_000) this.backoff = 0;
    this.retryAt = t + G.retry[Math.min(this.backoff++, G.retry.length - 1)];
  }

  message(data) {
    if (data === 'q') return; // the heartbeat's answer
    let m;
    try { m = JSON.parse(data); } catch { return; }
    const t = performance.now();
    if (m.t === 'w') {
      this.me = m.i;
      for (const p of m.ps ?? []) { const g = this.add(p.i, p.n); if (g && p.p) g.push(p, t); }
    } else if (m.t === 'j') this.add(m.i, m.n);
    else if (m.t === 's') (this.others.get(m.i) ?? this.add(m.i, ''))?.push(m, t);
    else if (m.t === 'x') { this.others.get(m.i)?.dispose(); this.others.delete(m.i); }
  }

  add(id, name) {
    if (id === this.me) return null;
    let g = this.others.get(id);
    if (!g && this.others.size < G.max) { g = new Ghost(this.group, id, name); this.others.set(id, g); }
    return g ?? null;
  }

  /** Each frame: connect / disconnect, send what changed (≤ hz), and place the ghosts. */
  update() {
    if (!this.on) return;
    const t = performance.now(), s = this.state();
    const prev = this.prev;
    if (!prev || Math.hypot(s.p[0] - prev.p[0], s.p[1] - prev.p[1], s.p[2] - prev.p[2]) > G.move || Math.abs(s.r - prev.r) > G.turn) { this.lastMove = t; this.prev = s; }
    const playing = this.active() && !document.hidden && t - this.lastMove < G.idleMs;
    if (!playing) { if (this.ws) this.disconnect(); }
    else if (!this.ws && !this.capped && t >= this.retryAt) this.connect();
    if (this.connected) {
      const sent = this.sent;
      if (t - this.lastSent >= 1000 / G.hz && (!sent || sent !== this.prev)) {
        const p = this.prev ?? s;
        this.ws.send(JSON.stringify({ p: p.p.map((v) => Math.round(v * 100) / 100), r: Math.round(p.r * 100) / 100 }));
        this.sent = p; this.lastSent = this.lastBeat = t; this.messages++;
      }
    }
    const eye = this.camera.position;
    for (const g of this.others.values()) g.draw(t, eye);
  }

  beat() {
    const t = performance.now();
    if (this.connected && t - this.lastBeat >= G.beatMs) { this.ws.send('p'); this.lastBeat = t; }
  }

  /** For tests: what is shown. */
  list() {
    return [...this.others.values()].map((g) => ({ id: g.id, name: g.name, visible: g.root.visible, tag: g.tag.visible,
      pos: g.root.position.toArray().map((v) => Math.round(v * 100) / 100), opacity: g.material.opacity }));
  }
}
