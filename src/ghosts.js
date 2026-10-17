import * as THREE from 'three';
import { FALL } from './config.js';
import { GHOSTS as G, COMBAT, AVATAR, CHAT, encodeAvatarLook, decodeAvatarLook } from './config.js';
import { Avatar, armTarget } from './avatar.js';
import { totalScore } from './stats.js';
import { acquireBadge, releaseBadge, badgeScore, badgeLives } from './ghostbadge.js';
import { setMirrorExtra } from './reflections.js';

// Other players as ghosts (#666): a WebSocket to the Worker's players' room (cloudflare/players.js, one Durable Object for
// everybody). Inert without the cloud (cloud.js `cloudUrl`), with GHOSTS.enabled false or ?mp=0. We send our feet and
// heading at most GHOSTS.hz times a second and only when they changed, a heartbeat 'p' every GHOSTS.beatMs (answered by
// the runtime, never billed), and disconnect when the tab is hidden, on the start screen, or after GHOSTS.idleMs standing
// still. The room's cost cap (close 4001) keeps us off for the rest of the month (localStorage 'lunden.mp.capMonth').
//
// Each other player is one avatar (#705, src/avatar.js: a human figure, one skinned mesh = one draw call, shared geometry per
// variant; an outline without a weapon, solid when both are armed; no shadow, depth-tested so walls and floors hide it) and one name tag sprite ("Anonym" without a name; the canvas
// texture is shared by everyone with the same name and score, released when unused). States are drawn GHOSTS.delay ms late, interpolated between the
// last two received, so the motion is smooth at 5 Hz.

const CAP_KEY = 'lunden.mp.capMonth';
const monthNow = () => new Date().toISOString().slice(0, 7);
const params = new URLSearchParams(location.search);
export const ANON = 'Anonym';

// #743: remote chat bubbles are DOM. The local reflection uses one shared, lazily allocated sprite atlas instead.
// Twelve pre-drawn dot phases fit in 512x96 pixels (192 KiB RGBA, no mipmaps); only UV offsets change during use.
let mirrorTypingAtlas = null;
function acquireMirrorTyping() {
  if (!mirrorTypingAtlas) {
    const C = CHAT.mirrorTyping, rows = Math.ceil(C.frames / C.columns), canvas = document.createElement('canvas');
    canvas.width = C.frameWidth * C.columns; canvas.height = C.frameHeight * rows;
    const ctx = canvas.getContext('2d');
    ctx.font = `italic 500 ${C.fontPx}px system-ui, sans-serif`;
    const textWidth = ctx.measureText('Skriver').width, dotPitch = C.dotPx + C.gapPx;
    const width = textWidth + C.paddingPx * 2 + dotPitch * 3;
    for (let f = 0; f < C.frames; f++) {
      ctx.save(); ctx.translate((f % C.columns) * C.frameWidth, Math.floor(f / C.columns) * C.frameHeight);
      const x = (C.frameWidth - width) / 2, bottom = C.frameHeight - C.dotPx;
      ctx.fillStyle = '#fff'; ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, C.gapPx, width, bottom - C.gapPx, C.frameHeight / 4);
      else ctx.rect(x, C.gapPx, width, bottom - C.gapPx);
      ctx.fill();
      ctx.beginPath(); ctx.moveTo(C.frameWidth / 2 - C.dotPx, bottom); ctx.lineTo(C.frameWidth / 2, C.frameHeight);
      ctx.lineTo(C.frameWidth / 2 + C.dotPx, bottom); ctx.fill();
      ctx.fillStyle = '#4a5560'; ctx.textBaseline = 'middle'; ctx.fillText('Skriver', x + C.paddingPx, bottom / 2);
      for (let dot = 0; dot < 3; dot++) {
        const phase = (f / C.frames - dot * C.stagger / C.period + 1) % 1;
        const rise = phase < .4 ? phase / .4 : phase < .8 ? (.8 - phase) / .4 : 0;
        const eased = (1 - Math.cos(Math.PI * rise)) / 2;
        ctx.globalAlpha = C.dim + (1 - C.dim) * eased;
        ctx.beginPath(); ctx.arc(x + C.paddingPx + textWidth + dotPitch * (dot + .5), bottom / 2 - C.dotLift * eased, C.dotPx / 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace; map.generateMipmaps = false; map.minFilter = map.magFilter = THREE.LinearFilter;
    map.repeat.set(1 / C.columns, 1 / rows);
    mirrorTypingAtlas = { material: new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }), users: 0, rows };
  }
  mirrorTypingAtlas.users++;
  return mirrorTypingAtlas;
}
function releaseMirrorTyping(atlas) {
  if (atlas && --atlas.users === 0) {
    atlas.material.map.dispose(); atlas.material.dispose(); mirrorTypingAtlas = null;
  }
}

/** A soft colour of its own per name (Anonym: a pale blue-white). */
function tint(name) {
  if (!name) return new THREE.Color(0.85, 0.92, 1);
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.55, 0.72);
}

// What an armed player carries (#667), seen by the others: one small shape per weapon (shared geometry + material), at the
// right hand pointing forward (−z), the jetpack on the back. The suit's web has none (empty hands).
const PROPS = {
  saber: () => [new THREE.CylinderGeometry(0.016, 0.016, 0.9, 8).rotateX(Math.PI / 2).translate(0, 0, -0.45), new THREE.MeshBasicMaterial({ color: 0x7fe3ff })],
  nerf: () => [new THREE.BoxGeometry(0.06, 0.13, 0.36).translate(0, 0, -0.12), new THREE.MeshLambertMaterial({ color: 0xf08a24 })],
  wand: () => [new THREE.CylinderGeometry(0.006, 0.01, 0.36, 6).rotateX(Math.PI / 2).translate(0, 0, -0.16), new THREE.MeshLambertMaterial({ color: 0x6b4423 })],
  rifle: () => [new THREE.BoxGeometry(0.05, 0.1, 0.72).translate(0, 0, -0.26), new THREE.MeshLambertMaterial({ color: 0x3a3226 })],
  ball: () => [new THREE.SphereGeometry(0.12, 14, 10).translate(0, 0, -0.08), new THREE.MeshLambertMaterial({ color: 0xd8641e })],
  jetpack: () => [new THREE.BoxGeometry(0.32, 0.46, 0.18), new THREE.MeshLambertMaterial({ color: 0xc8ccd0 })],
};
const props = new Map();
function prop(key) {
  if (!PROPS[key]) return null;
  if (!props.has(key)) props.set(key, PROPS[key]());
  const [geo, mat] = props.get(key), m = new THREE.Mesh(geo, mat);
  if (key === 'jetpack') m.position.set(0, 1.2, 0.2); // (the others follow the hand, Ghost.animate)
  m.name = `ghost-prop:${key}`;
  return m;
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a, b, t) => a + wrap(b - a) * t;
const SWING = 0.35; // s the saber's cut lasts
const tmpV = new THREE.Vector3();
const pickMat = new THREE.MeshBasicMaterial();

class Ghost {
  /** `self`: our own reflection in the mirrors (#691): no name tag, never shown to the main camera. */
  constructor(parent, id, name, self = false, look = null) {
    this.id = id; this.name = name || ANON; this.snaps = []; this.h = ''; this.solid = false; this.prop = null; this.self = self;
    this.avatarLook = look ?? (self ? `me:${name}` : id);
    this.avatar = new Avatar(this.avatarLook, tint(name));
    this.avatar.setSolid(true); // always solid (#1025)
    this.mesh = this.avatar.mesh;
    this.mesh.name = `ghost:${this.name}`;
    this.root = new THREE.Group();
    this.root.add(this.avatar.object);
    if (!self) {
      this.badge = acquireBadge(this.name, 0);
      this.score = 0; this.lives = null;
      this.tag = new THREE.Sprite(this.badge.material);
      this.tag.scale.set(G.tagWidth, G.tagHeight, 1);
      this.tagY = G.tagY + (this.avatar.look.tall - 1) * 1.8;
      this.tag.position.y = this.tagY; // (above the head of a taller / shorter avatar)
      this.root.add(this.tag);
      // what the look ray hits to greet it (#673; main.js, an invisible box round the body: the raycaster ignores `visible`)
      this.pick = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), pickMat);
      this.pick.position.y = 0.9;
      this.pick.visible = false;
      this.door = { name: this.name, kind: 'ghost', verb: 'hälsa på', ghost: this, pickable: this.pick };
      this.pick.userData.door = this.door;
      this.root.add(this.pick);
    }
    this.waveT = 0;
    this.root.visible = false; // until its first state
    this.body = 0; this.speed = 0; this.have = false;
    parent.add(this.root);
  }

  setAvatarLook(look) {
    this.avatarLook = look;
    const hadSuit = !!this.avatar.suit;
    this.avatar.object.removeFromParent();
    this.avatar.dispose();
    this.avatar = new Avatar(look, tint(this.name));
    this.avatar.setSolid(true); // always solid (#1025)
    if (hadSuit) this.avatar.setSuit(true);
    this.mesh = this.avatar.mesh;
    this.mesh.name = `ghost:${this.name}`;
    this.root.add(this.avatar.object);
    if (this.tag) {
      this.tagY = G.tagY + (this.avatar.look.tall - 1) * 1.8;
      this.tag.position.y = this.tagY;
    }
  }

  /** A state from the room at time t (ms). After a pause the last one is repeated just before it, so it walks off smoothly. */
  push({ p, r, h = '', score = 0, l, c = false, sp = false, av }, t) {
    if (av && av !== this.avatarCode) {
      this.avatarCode = av;
      this.setAvatarLook(decodeAvatarLook(av, this.id));
    }
    this.score = badgeScore(score);
    this.lives = badgeLives(l); // never infer remote health from a client's default maximum
    this.setHeld(h);
    this.avatar.setSuit(sp);
    this.refreshBadge();
    const last = this.snaps.at(-1);
    if (last && t - last.t > 1000 / G.hz * 1.5) this.snaps.push({ t: t - 1000 / G.hz, p: last.p, r: last.r, c: last.c });
    this.snaps.push({ t, p: new THREE.Vector3(...p), r, c: c === true ? 1 : 0 });
    if (this.snaps.length > 8) this.snaps.splice(0, this.snaps.length - 8);
  }

  /** One cached sprite: lives only during the existing armed-vs-armed encounter (#1025). */
  refreshBadge() {
    if (!this.badge) return; // local reflection has no label
    const lives = this.solid && this.h ? this.lives : null;
    if (this.badge.score === this.score && this.badge.lives === lives) return;
    const previous = this.badge;
    this.badge = acquireBadge(this.name, this.score, lives);
    this.tag.material = this.badge.material;
    const height = G.tagHeight * this.badge.height / 64;
    this.tag.scale.y = height;
    this.tag.position.y = this.tagY + (height - G.tagHeight) / 2; // name/score keep their original world positions
    releaseBadge(previous);
  }

  /** A weapon in the hand (#667): the prop follows the avatar's right hand (the jetpack sits on the back). */
  setHeld(h) {
    if (h === this.h) return;
    this.h = h;
    this.prop?.removeFromParent();
    this.prop = prop(h);
    if (this.prop) this.root.add(this.prop);
  }

  /** A wave (#673): the right arm up and waving for GHOSTS.wave s (armTarget.up, the surface #705 left for it). */
  wave() { this.waveT = G.wave; }

  /** Over its head (the speech bubble's anchor, greet.js). */
  get head() { return this.root.position.clone().setY(this.root.position.y + 1.78 * this.avatar.look.tall); }

  /** A swing of what it holds (#667: the saber's cut, seen by the others). */
  swing() { this.swingT = SWING; }

  /** Solid when both of us hold a weapon (#667); avatar appearance is always visually solid (#1025). */
  setSolid(on) {
    if (on === this.solid) return;
    this.solid = on;
    this.avatar.setSolid(true, COMBAT.solid);
    this.refreshBadge();
  }

  /** Where its body is now (world): feet and the top of the hit capsule. */
  get feet() { return this.root.position; }

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
    this.crouch = THREE.MathUtils.lerp(a.c, b.c, k);
    const d = this.root.position.distanceTo(eye), sec = b === a ? 0 : (b.t - a.t) / 1000;
    this.root.visible = d < G.far;
    if (this.tag) this.tag.visible = d < G.tagFar;
    if (this.root.visible) this.animate(t, d, sec ? (b.p.x - a.p.x) / sec : 0, sec ? (b.p.z - a.p.z) / sec : 0);
  }

  /** The avatar's pose: the gait follows the ground speed (vx, vz) m/s; the body turns towards where it goes, the head to
   * where it looks; a weapon is held out in the right hand and the prop sits in it. `d`: distance to the eye (far away: not
   * posed). `this.hands` (optional { L, R }, see armTarget in avatar.js) overrides an arm: the surface for a wave (#673). */
  animate(t, d, vx, vz) {
    const dt = this.lastDraw ? Math.min(0.1, (t - this.lastDraw) / 1000) : 0;
    this.lastDraw = t;
    if (d > AVATAR.poseFar) return;
    const gaze = this.root.rotation.y, sp = Math.hypot(vx, vz);
    this.speed += ((sp > 8 ? 0 : sp) - this.speed) * Math.min(1, dt * 10);
    if (!this.have) { this.body = gaze; this.have = true; }
    if (this.speed > AVATAR.walkSpeed) { // the body faces where it goes, unless that is backwards / sideways to the look
      const going = Math.atan2(-vx, -vz);
      this.body += wrap((Math.abs(wrap(going - gaze)) < 1.3 ? going : gaze) - this.body) * Math.min(1, dt * 8);
    } else {
      const off = wrap(gaze - this.body);
      if (Math.abs(off) > AVATAR.bodyTurn) this.body += (off - Math.sign(off) * AVATAR.bodyTurn * 0.5) * Math.min(1, dt * 5);
    }
    const turn = THREE.MathUtils.clamp(wrap(gaze - this.body), -1.1, 1.1);
    this.avatar.object.rotation.y = Math.PI + wrap(this.body - gaze);
    const sw = this.swingT > 0 ? Math.sin((1 - this.swingT / SWING) * Math.PI) : 0;
    if (this.swingT > 0) this.swingT = Math.max(0, this.swingT - dt);
    const hands = {};
    if (this.h && this.h !== 'jetpack') { // out in front; the saber's cut sweeps across
      hands.R = armTarget.forward(-1, 0.04);
      hands.R.at[0] += 0.45 * sw; hands.R.at[1] += 0.1 * sw;
    }
    if (this.waveT > 0) { // (#673) up for the wave, the hand going side to side; down again at the end
      this.waveT = Math.max(0, this.waveT - dt);
      hands.R = armTarget.up(-1, (G.wave - this.waveT) * 11);
    }
    Object.assign(hands, this.hands);
    this.avatar.update(dt, { speed: this.speed, turn, hands, crouch: this.crouch ?? 0 });
    if (this.prop && this.prop.name !== 'ghost-prop:jetpack') {
      this.avatar.object.updateMatrixWorld(true);
      this.root.worldToLocal(this.avatar.hand('R', tmpV));
      this.prop.position.copy(tmpV);
      this.prop.rotation.set(-0.6 * sw, 1.4 * sw, 0);
    }
  }

  mirrorTyping(on, now) {
    if (!on) { if (this.typingSprite) this.typingSprite.visible = false; return; }
    if (!this.typingSprite) {
      this.typingAtlas = acquireMirrorTyping();
      this.typingSprite = new THREE.Sprite(this.typingAtlas.material);
      this.typingSprite.name = 'mirror-typing'; this.typingSprite.userData.ghost = true;
      this.typingSprite.raycast = () => {};
      this.typingSprite.scale.set(G.tagWidth, G.tagHeight, 1);
      // Own mirrors have no name tag: its existing above-head anchor leaves the bubble inside normal hall glass.
      this.typingSprite.position.y = G.tagY + (this.avatar.look.tall - 1) * 1.8;
      this.root.add(this.typingSprite);
    }
    const C = CHAT.mirrorTyping, frame = Math.floor((now % (C.period * 1000)) / (C.period * 1000) * C.frames);
    this.typingAtlas.material.map.offset.set((frame % C.columns) / C.columns, 1 - (Math.floor(frame / C.columns) + 1) / this.typingAtlas.rows);
    this.typingSprite.visible = true;
  }

  clearMirrorTyping() {
    this.typingSprite?.removeFromParent(); releaseMirrorTyping(this.typingAtlas);
    this.typingSprite = null; this.typingAtlas = null;
  }

  dispose() { this.clearMirrorTyping(); this.root.removeFromParent(); this.avatar.dispose(); if (this.badge) releaseBadge(this.badge); }
}

export class Ghosts {
  /** scene; url: the Worker ('' = off); name(): our name; state(): { p: [x, y, z] feet, r: yaw, c?: actual crouched boolean }; active(): playing (not the
   * start screen); weapon(): the key (COMBAT.weapons) of what we hold or ''; score(): displayed points (defaults to stats.totalScore); onHit / onHurt: the room's word on a hit (#667). */
  constructor({ scene, camera, url, name = () => '', state, active = () => true, weapon = () => '', score = totalScore, onHit = () => {}, onHurt = () => {}, mirrored = () => true }) {
    Object.assign(this, { camera, name, state, active, weapon, score, onHit, onHurt, mirrored, mine: null, myGhost: null, rules: null, ws: null, me: null, others: new Map(), sent: null, prev: null,
      lastSent: 0, lastBeat: 0, outbox: [], shots: 0, dropped: 0, greetAt: -1e9, greetsSeen: 0, lastMove: -Infinity, retryAt: 0, backoff: 0, openedAt: 0, connects: 0, messages: 0 });
    const savedAv = (() => { try { return localStorage.getItem('lunden.avatar'); } catch { return null; } })();
    this.myLook = decodeAvatarLook(savedAv, this.name());
    this.avatarCode = encodeAvatarLook(this.myLook);
    this.sentAv = null;
    this.on = !!url && G.enabled && params.get('mp') !== '0';
    this.url = url ? `${url.replace(/^http/, 'ws')}/players` : '';
    this.group = new THREE.Group();
    this.group.name = 'ghosts';
    scene.add(this.group);
    // a hidden outline avatar so that the warm-up compiles the others' program with the scene's (#705): nothing to compile when the first one turns up
    this.sample = new Avatar('warm');
    this.sample.object.visible = false;
    this.group.add(this.sample.object);
    // our own image in the mirrors (#691): made now and hidden, so that the warm-up compiles its (solid) program too
    setMirrorExtra({ before: () => this.beforeMirror(), after: () => this.afterMirror() });
    this.selfGhost();
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
    ws.onmessage = (e) => { if (ws === this.ws) this.message(e.data); };
    ws.onclose = (e) => this.closed(ws, e.code);
  }

  /** Our side closes (hidden, start screen, standing still): everyone's ghost goes too. */
  disconnect() {
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(1000, 'bye'); } catch { /* not open yet */ } }
    this.reset();
  }

  reset() { this.finishFall(null); this.finishConsume(null); this.myGhost?.clearMirrorTyping(); this.me = null; this.sent = null; this.outbox = []; this.talkbox = []; for (const g of this.others.values()) g.dispose(); this.others.clear(); this.onTypingReset?.(); }

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
      this.me = m.i; this.rules = m.c ?? null; this.onWelcome?.(m);
      for (const p of m.ps ?? []) { const g = this.add(p.i, p.n, p.av); if (g && p.p) g.push(p, t); }
    } else if (m.t === 'j') this.add(m.i, m.n, m.av);
    else if (m.t === 's') (this.others.get(m.i) ?? this.add(m.i, '', m.av))?.push(m, t);
    else if (m.t === 'x') { this.others.get(m.i)?.dispose(); this.others.delete(m.i); }
    else if (m.t === 'hit') this.onHit(m, this.others.get(m.to));
    else if (m.t === 'life') this.onLife?.(m);
    else if (m.t === 'fall') { if (m.id === this.pendingFall?.id) this.finishFall(m); }
    else if (m.t === 'consume') { if (m.id === this.pendingConsume?.id) this.finishConsume(m); }
    else if (m.t === 'hurt') this.onHurt(m, this.others.get(m.by));
    else if (m.t === 'a') { const g = this.others.get(m.i); if (g) this.onShot?.(m, g); }
    else if (m.t === 'g') { const g = this.others.get(m.i); if (g) { g.wave(); this.greetsSeen++; this.onGreet?.(m, g, m.to === this.me ? null : this.others.get(m.to) ?? null); } }
    else if (m.t === 'm' || m.t === 'mx' || m.t === 'k') this.onTalk?.(m, this.others.get(m.i)); // chat (#675) and "skriver…" (#676), src/chat.js
  }

  add(id, name, av = null) {
    if (id === this.me) return null;
    let g = this.others.get(id);
    if (!g && this.others.size < G.max) {
      const look = av ? decodeAvatarLook(av, id) : null;
      g = new Ghost(this.group, id, name, false, look);
      if (av) g.avatarCode = av;
      this.others.set(id, g);
    } else if (g && av && av !== g.avatarCode) {
      g.avatarCode = av;
      g.setAvatarLook(decodeAvatarLook(av, id));
    }
    return g ?? null;
  }

  setMyLook(look) {
    this.myLook = look;
    this.avatarCode = encodeAvatarLook(look);
    this.sentAv = null;
    if (this.myGhost) {
      this.myGhost.key = `${this.name() || ''}:${this.avatarCode}`;
      this.myGhost.setAvatarLook(look);
    }
  }

  /** Each frame: connect / disconnect, send what changed (≤ hz), and place the ghosts. */
  update() {
    const t = performance.now(), s = this.state(), w = this.weapon();
    s.h = COMBAT.weapons.includes(w) ? w : '';
    s.c = s.c === true;
    s.sp = s.sp === true;
    this.track(s, t);
    if (!this.on) return;
    s.score = badgeScore(this.score());
    const prev = this.prev;
    if (!prev || Math.hypot(s.p[0] - prev.p[0], s.p[1] - prev.p[1], s.p[2] - prev.p[2]) > G.move || Math.abs(s.r - prev.r) > G.turn || s.h !== prev.h || s.c !== prev.c || s.sp !== prev.sp || this.sentAv !== this.avatarCode) { this.lastMove = t; this.prev = s; }
    if (this.prev?.score !== s.score) this.prev = s; // score changes use the same 5 Hz slot; do not reset movement idle time
    const playing = this.active() && !document.hidden && t - this.lastMove < G.idleMs;
    if (!playing) { if (this.ws) this.disconnect(); }
    else if (!this.ws && !this.capped && t >= this.retryAt) this.connect();
    if (this.connected && !this.sendTalk() && !this.sendShot()) {
      const sent = this.sent;
      if (t - this.lastSent >= 1000 / G.hz && (!sent || sent !== this.prev || this.sentAv !== this.avatarCode)) {
        const p = this.prev ?? s;
        this.ws.send(JSON.stringify({ p: p.p.map((v) => Math.round(v * 100) / 100), r: Math.round(p.r * 100) / 100, score: p.score, ...(p.h ? { h: p.h } : {}), ...(p.c ? { c: true } : {}), ...(p.sp ? { sp: true } : {}), ...(this.avatarCode ? { av: this.avatarCode } : {}) }));
        this.sent = p; this.sentAv = this.avatarCode; this.lastSent = this.lastBeat = t; this.messages++;
      }
    }
    const eye = this.camera.position, armed = !!s.h;
    for (const g of this.others.values()) { g.draw(t, eye); g.setSolid(armed && !!g.h); }
  }

  /** Our own state for the mirror image (#691): where we stand, which way we look, what we hold and how fast we walk (the
   * ground speed from the last frames, smoothed). Cheap; the avatar is posed only when a mirror draws it. */
  track(s, t) {
    const m = this.mine ??= { p: new THREE.Vector3(...s.p), vx: 0, vz: 0, t, r: s.r, h: '' };
    const dt = (t - m.t) / 1000;
    if (dt > 0) {
      const vx = (s.p[0] - m.p.x) / dt, vz = (s.p[2] - m.p.z) / dt, far = Math.hypot(vx, vz) > 12; // (a jump: a teleport, not a run)
      const k = Math.min(1, dt * 8);
      m.vx += ((far ? 0 : vx) - m.vx) * k; m.vz += ((far ? 0 : vz) - m.vz) * k;
    }
    m.p.set(...s.p); m.r = s.r; m.h = s.h; m.c = s.c; m.sp = s.sp; m.t = t;
  }

  /** Our avatar for the mirrors: one per name (the look comes from it); hidden but for the mirror's pass. */
  selfGhost() {
    const n = this.name() || '';
    const key = `${n}:${this.avatarCode}`;
    if (!this.myGhost || this.myGhost.key !== key) { this.myGhost?.dispose(); this.myGhost = new Ghost(this.group, 'me', n, true, this.myLook); this.myGhost.key = key; }
    return this.myGhost;
  }

  /** Our mirror image says `text` (#1122: a sent chat line moves its mouth for as long as a bubble would show). */
  selfTalk(text) { this.selfGhost().avatar.talk(text, CHAT.bubbleTtl); }

  /** The mirror's pass is about to draw (reflections.js): put our solid avatar where we stand. */
  beforeMirror() {
    const m = this.mine;
    if (!m || !this.mirrored()) return;
    const g = this.selfGhost();
    g.setHeld(m.h);
    g.avatar.setSuit(m.sp);
    g.root.position.copy(m.p);
    g.root.rotation.y = m.r;
    g.crouch = m.c ? 1 : 0;
    g.root.visible = true;
    const now = performance.now();
    g.mirrorTyping(!!this.mirrorTyping?.(now), now);
    g.animate(now, 0, m.vx, m.vz);
  }

  afterMirror() { if (this.myGhost) { this.myGhost.root.visible = false; if (this.myGhost.typingSprite) this.myGhost.typingSprite.visible = false; } }

  /** One bounded self-damage request; never send client HP or replay it after a disconnect. */
  fall(drop, gap) {
    if (!this.connected || this.pendingFall) return Promise.resolve(null);
    const id = this.fallId = (this.fallId ?? 0) + 1;
    return new Promise(resolve => {
      this.pendingFall = { id, resolve, timer: setTimeout(() => this.finishFall(null), FALL.ackMs) };
      this.outbox.unshift({ t: 'fall', id, drop, gap });
      this.sendShot();
    });
  }
  finishFall(result) {
    const pending = this.pendingFall;
    if (!pending) return;
    clearTimeout(pending.timer); this.pendingFall = null;
    this.outbox = this.outbox.filter(m => m.t !== 'fall' || m.id !== pending.id);
    pending.resolve(result);
  }

  /** One bounded food/beer consumption claim; never send client HP or replay it after a disconnect (#1004). */
  consume(portion) {
    if (!this.connected || this.pendingConsume) return Promise.resolve(null);
    const id = this.consumeId = (this.consumeId ?? 0) + 1;
    return new Promise(resolve => {
      this.pendingConsume = { id, resolve, timer: setTimeout(() => this.finishConsume(null), 5000) };
      this.outbox.unshift({ t: 'consume', id, portion });
      this.sendShot();
    });
  }
  finishConsume(result) {
    const pending = this.pendingConsume;
    if (!pending) return;
    clearTimeout(pending.timer); this.pendingConsume = null;
    this.outbox = this.outbox.filter(m => m.t !== 'consume' || m.id !== pending.id);
    pending.resolve(result);
  }

  /** Our own saber cut, for the mirror image. */
  swingSelf() { this.myGhost?.swing(); }

  /** The other players one can greet (#673): their invisible pick boxes (main.js adds them to what the look ray tries). */
  targets() { return this.connected ? [...this.others.values()].filter((g) => g.pick && g.root.visible && g.snaps.length).map((g) => g.pick) : []; }

  /** Greet `g` (#673): a phrase from GHOSTS.hello (an index, never free text), one message to the room, at most one every
   * GHOSTS.greetEvery s. Returns the line said ("{n}" = their name), or null. */
  greet(g) {
    const t = performance.now();
    if (!this.connected || t - this.greetAt < G.greetEvery * 1000 || !this.others.has(g.id)) return null;
    this.greetAt = t;
    const k = Math.floor(Math.random() * G.hello.length);
    this.outbox.push({ t: 'g', to: g.id, k });
    while (this.outbox.length > G.outbox) this.outbox.splice(this.outbox.findIndex(m => m.t !== 'fall' && m.t !== 'consume'), 1);
    this.sendShot();
    return G.hello[k].replace('{n}', g.name);
  }

  /** A shot (#667): { w, o: [x, y, z], d: [dx, dy, dz] unit, s?: speed, to?: the id it hit }, every one, misses too, so
   * the others can draw it. Shots share the GHOSTS.hz budget with the states and go first; at most GHOSTS.outbox wait
   * (when full the oldest miss goes, never a hit before a miss). */
  fire(shot) {
    if (!this.connected) return false;
    const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
    this.outbox.push({ t: 'a', w: shot.w, o: shot.o.map(r2), d: shot.d.map(r3), ...(shot.s ? { s: r2(shot.s) } : {}), ...(shot.to ? { to: shot.to } : {}), ...(shot.hc ? { hc: [shot.hc[0], ...shot.hc.slice(1).map(r3)] } : {}) });
    while (this.outbox.length > G.outbox) {
      const miss = this.outbox.findIndex((x) => x.t !== 'fall' && x.t !== 'consume' && !x.to);
      this.outbox.splice(miss >= 0 ? miss : this.outbox.findIndex(x => x.t !== 'fall' && x.t !== 'consume'), 1);
      this.dropped++;
    }
    this.sendShot();
    return true;
  }

  sendShot() {
    const t = performance.now();
    if (!this.outbox.length || !this.connected || t - this.lastSent < 1000 / G.hz) return false;
    const message = this.outbox.shift();
    this.ws.send(JSON.stringify(message));
    this.lastSent = this.lastBeat = t; if (message.t !== 'fall' && message.t !== 'consume') this.shots++; this.messages++;
    return true;
  }

  /** Chat (#675): a message { t: 'm', m } for the room, in the same GHOSTS.hz budget as states and shots (sent first, a
   * few at most waiting). Chatting counts as activity: we stay connected while typing. False when not connected. */
  talk(msg) {
    if (!this.connected) return false;
    (this.talkbox ??= []).push(msg);
    if (this.talkbox.length > 4) this.talkbox.shift();
    this.lastMove = performance.now();
    this.sendTalk();
    return true;
  }

  sendTalk() {
    const t = performance.now();
    if (!this.talkbox?.length || !this.connected || t - this.lastSent < 1000 / G.hz) return false;
    this.ws.send(JSON.stringify(this.talkbox.shift()));
    this.lastSent = this.lastBeat = t; this.messages++;
    return true;
  }

  beat() {
    const t = performance.now();
    if (this.connected && t - this.lastBeat >= G.beatMs) { this.ws.send('p'); this.lastBeat = t; }
  }

  /** For tests: what is shown. */
  list() {
    return [...this.others.values()].map((g) => ({ id: g.id, name: g.name, score: g.score, lives: g.lives, lifeShown: g.badge.lives !== null, visible: g.root.visible, tag: g.tag.visible,
      pos: g.root.position.toArray().map((v) => Math.round(v * 100) / 100), opacity: COMBAT.solid, outline: false, speed: Math.round(g.speed * 100) / 100, h: g.h, solid: g.solid }));
  }
}
