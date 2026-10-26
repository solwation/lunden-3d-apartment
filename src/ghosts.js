import { playerLocalStorage as localStorage } from './playerprofiles.js';
import { applyRestPose } from './remote-pose.js';
import { poseOlof } from './olof.js';
import * as THREE from 'three';
import { FALL, TOAST, SOUNDS, KISS, HUG } from './config.js';
import { makesSteps, strideFor } from './spatialsound.js';
import { GHOSTS as G, COMBAT, AVATAR, AVATAR_CROUCH, CHAT, encodeAvatarLook, encodeAvatarWireLook, decodeAvatarLook, splitAvatarCode, playerBodySegment } from './config.js';
import { Avatar, armTarget } from './avatar.js';
import { totalScore } from './stats.js';
import { acquireBadge, releaseBadge, badgeScore, badgeLives } from './ghostbadge.js';
import { setMirrorExtra } from './reflections.js';
import { GhostCat } from './ghostcat.js';
import { JoinNotice } from './joinnotice.js';
import { canKiss, kissAmount } from './kiss.js';
import { canHug, hugAmount, playerChoices } from './hug.js';
import { Hearts } from './pingping.js';
import { cleanHeldCategory } from './heldcategory.js';
import { ghostProp, ghostJetpack, ghostBike, ghostItem } from './ghostprops.js'; // what an armed player holds: their weapon's own model (#667, #1126)

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

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a, b, t) => a + wrap(b - a) * t;
const SWING = 0.35; // s the saber's cut lasts
const tmpV = new THREE.Vector3();
const pickMat = new THREE.MeshBasicMaterial();

export class Ghost { // (exported for tools/ghostprops.html)
  /** `self`: our own reflection in the mirrors (#691): no name tag, never shown to the main camera. */
  constructor(parent, id, name, self = false, look = null) {
    this.id = id; this.name = name || ANON; this.snaps = []; this.h = ''; this.hi = ''; this.itemProp = null; this.solid = false; this.prop = null; this.self = self;
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
      this.door = { name: this.name, kind: 'ghost', verb: 'hälsa på', ghost: this, pickable: this.pick, options: () => this.menu?.(this) ?? [] }; // (#1405: Ghosts sets `menu`)
      this.pick.userData.door = this.door;
      this.root.add(this.pick);
    }
    this.heldCat = new GhostCat();
    this.waveT = 0;
    this.root.visible = false; // until its first state
    // #1558: our mirror image is hidden outside the reflector pass, so its first mirror frame uploaded the skinned
    // body's ~3 MB of buffers and bone texture and drew its programs for the first time: a ~230 ms stall in front of
    // the living-room mirrors. The desktop warm-up's full draw passes (screen and mirror target) draw it once instead.
    // (Sliced phone draws only show warmDraw renderables, not this group, so phones keep it lazy as before, #628.)
    if (self) this.root.userData.warmDraw = true;
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
    if (this.pack) { this.avatar.bones.torso.add(this.pack); }
    this.mesh = this.avatar.mesh;
    this.mesh.name = `ghost:${this.name}`;
    this.root.add(this.avatar.object);
    if (this.tag) {
      this.tagY = G.tagY + (this.avatar.look.tall - 1) * 1.8;
      this.tag.position.y = this.tagY;
    }
  }

  /** A state from the room at time t (ms). After a pause the last one is repeated just before it, so it walks off smoothly. */
  push({ p, r, h = '', hi = '', score = 0, l, c = false, sp = false, jp = 0, bk, pose = 0, look = [0, 0], av, ax, cat, dn }, t) {
    if (av && typeof ax === 'string') av += ax; // #1138: the face extension beside the digits
    if (av && av !== this.avatarCode) {
      this.avatarCode = av;
      this.setAvatarLook(decodeAvatarLook(av, this.id));
    }
    this.score = badgeScore(score);
    this.lives = badgeLives(l); // never infer remote health from a client's default maximum
    this.setHeld(h);
    this.setItem(hi); // (#1297: an ordinary held thing, by category)
    this.heldCat.set(cat, this.root);
    this.avatar.setSuit(sp);
    this.bikeWire = Number.isFinite(bk) ? bk : null; // (#1286: the bicycle's heading while riding)
    this.setJetpack(h === 'jetpack' && !jp ? 1 : jp); // (an older client only says h: 'jetpack')
    this.refreshBadge();
    const prev = this.snaps.at(-1);
    if (prev && Math.hypot(p[0] - prev.p.x, p[1] - prev.p.y, p[2] - prev.p.z) > G.jump) this.snaps.length = 0; // a teleport (#1319: into / out of the children's room): appear there, no streak across the map
    const last = this.snaps.at(-1);
    if (last && t - last.t > 1000 / G.hz * 1.5) this.snaps.push({ t: t - 1000 / G.hz, p: last.p, r: last.r, c: last.c, pose: last.pose, look: last.look, bk: last.bk, dn: last.dn });
    this.snaps.push({ t, look, dn: dn === 1 ? 1 : 0, bk: this.bikeWire, p: new THREE.Vector3(...p), r, c: c === true ? 1 : 0, pose: pose >= 1 && pose <= 3 && Number.isInteger(pose) ? pose : 0 });
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
    this.tagH = height; this.tag.scale.y = height;
    this.tag.position.y = this.tagY + (height - G.tagHeight) / 2; // name/score keep their original world positions
    releaseBadge(previous);
  }

  /** A weapon in the hand (#667): the prop follows the avatar's right hand (the jetpack sits on the back). */
  setHeld(h) {
    if (h === this.h) return;
    this.h = h;
    this.prop?.removeFromParent();
    this.prop = ghostProp(h);
    if (this.prop) this.root.add(this.prop);
  }

  /** What it holds besides a weapon (#1297): `hi` a category key (heldcategory.js) or ''. A cheap proxy mesh at the right hand (see animate). */
  setItem(hi) {
    hi = cleanHeldCategory(hi);
    if (hi === this.hi) return;
    this.hi = hi;
    this.itemProp?.removeFromParent();
    this.itemProp = hi ? ghostItem(hi) : null;
    if (this.itemProp) this.root.add(this.itemProp);
  }

  /** The jetpack on the back (#1286): `jp` 0 off, 1 worn, 2 thrusting (flames). One mesh on the torso bone, one more for the flames. */
  setJetpack(jp) {
    jp = jp === 2 ? 2 : jp === 1 ? 1 : 0;
    if (jp === this.jp) return;
    this.jp = jp;
    if (!jp) { this.pack?.removeFromParent(); this.pack = null; return; }
    if (!this.pack) { this.pack = ghostJetpack(); this.avatar.bones.torso.add(this.pack); }
    this.pack.children[0].visible = jp === 2;
  }

  /** The bicycle under a rider (#1286): `bk` the bike's heading (camera-yaw convention, as `r`), null when not riding. */
  setBike(on) {
    if (on === !!this.bikeMesh) return;
    if (!on) { this.bikeMesh.removeFromParent(); this.bikeMesh = null; this.bikeYaw = null; return; }
    this.bikeMesh = ghostBike(); this.root.add(this.bikeMesh);
  }

  /** The riding state at render time: the heading is interpolated like `r`. */
  bikeAt(a, b, k) {
    const s = (k < 1 ? a : b).bk ?? null;
    this.setBike(s !== null);
    this.bikeYaw = s === null ? null : (a.bk != null && b.bk != null ? lerpAngle(a.bk, b.bk, k) : s);
    if (this.bikeMesh) this.bikeMesh.rotation.y = Math.PI / 2 + wrap(this.bikeYaw - this.root.rotation.y); // (the bike's heading against the look; its x is forward)
  }

  /** Seated on the saddle, the hands on the handlebar, the feet turning the pedals (animate, after the ordinary pose). */
  poseBike(dt, speed, turn = 0) {
    this.bikePhase = ((this.bikePhase ?? 0) + dt * speed * 5) % (Math.PI * 2);
    const ph = this.bikePhase, pedal = (s) => [s * 0.115, 0.44 + 0.17 * Math.sin(ph + (s > 0 ? 0 : Math.PI)), -0.05 + 0.17 * Math.cos(ph + (s > 0 ? 0 : Math.PI))];
    poseOlof(this.avatar, { hip: [0.86, -0.12], lean: -0.45, head: -0.25 + (this.look?.[1] ?? 0), turn,
      feet: [pedal(1), pedal(-1)], knee: [0.3, 0.9, 1],
      hands: [1, -1].map((s) => ({ at: [s * 0.27, 0.95, 0.31], pole: [s, 0, -0.5] })), can: null });
  }

  /** A hug (#1405), `amount` 0 … 1: the body turns to the partner and steps half the way in (the feet's network
   * positions stay; only the drawn figure moves), the arms go round them. */
  poseHug(hug, amount, hands) {
    const dx = hug.toward.x - this.root.position.x, dz = hug.toward.z - this.root.position.z;
    const direction = Math.atan2(dx, dz), shift = Math.max(0, Math.hypot(dx, dz) - HUG.gap) / 2 * amount;
    this.avatar.object.rotation.y = lerpAngle(this.avatar.object.rotation.y, direction - this.root.rotation.y, amount);
    const yaw = -this.root.rotation.y, sx = Math.sin(direction) * shift, sz = Math.cos(direction) * shift; // world → root frame
    this.avatar.object.position.set(sx * Math.cos(yaw) + sz * Math.sin(yaw), 0, -sx * Math.sin(yaw) + sz * Math.cos(yaw));
    for (const [key, side] of [['L', 1], ['R', -1]]) {
      const from = hands[key] ?? armTarget.rest(side), to = HUG.hands[key];
      hands[key] = { at: from.at.map((v, i) => v + (to[i] - v) * amount), pole: from.pole.map((v, i) => v + ((i ? HUG.pole[i] : side * HUG.pole[0]) - v) * amount) };
    }
  }

  /** A wave (#673): the right arm up and waving for GHOSTS.wave s (armTarget.up, the surface #705 left for it). */
  wave() { this.waveT = G.wave; }

  /** Over its head (the speech bubble's anchor, greet.js). */
  get head() { return this.pose ? this.avatar.bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0)) : this.root.position.clone().setY(this.root.position.y + 1.78 * this.avatar.look.tall); }

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
    this.pose = (k < 1 ? a : b).pose;
    this.dance = (k < 1 ? a : b).dn === 1; // #1622
    this.look = [THREE.MathUtils.lerp(a.look[0], b.look[0], k), THREE.MathUtils.lerp(a.look[1], b.look[1], k)];
    this.bikeAt(a, b, k);
    const d = this.root.position.distanceTo(eye), sec = b === a ? 0 : (b.t - a.t) / 1000;
    this.root.visible = d < G.far;
    this.dEye = d; this.vh = sec ? Math.hypot(b.p.x - a.p.x, b.p.z - a.p.z) / sec : 0; this.vy = sec ? (b.p.y - a.p.y) / sec : 0; // (#1302: what the footsteps derive from)
    if (this.tag) { // (#1296) beyond tagFar the tag grows with distance: constant size on screen, no pop-out
      this.tag.visible = d < G.far;
      const f = Math.max(1, d / G.tagFar);
      this.tag.scale.set(G.tagWidth * f, (this.tagH ?? G.tagHeight) * f, 1);
    }
    if (this.root.visible) this.animate(t, d, sec ? (b.p.x - a.p.x) / sec : 0, sec ? (b.p.z - a.p.z) / sec : 0);
  }

  /** The avatar's pose: the gait follows the ground speed (vx, vz) m/s; the body turns towards where it goes, the head to
   * where it looks; a weapon is held out in the right hand and the prop sits in it. `d`: distance to the eye (far away: not
   * posed). `this.hands` (optional { L, R }, see armTarget in avatar.js) overrides an arm: the surface for a wave (#673). */
  animate(t, d, vx, vz) {
    const dt = this.lastDraw ? Math.min(0.1, (t - this.lastDraw) / 1000) : 0;
    this.lastDraw = t;
    const hug = this.hug, hugAge = hug ? (t - hug.start) / 1000 : -1, hugged = hugAmount(hugAge); // (#1405)
    if (hug && hugAge >= HUG.duration) this.hug = null;
    if (!hugged) this.avatar.object.position.set(0, 0, 0); // back where the body stands after a hug, also when not posed
    if (d > AVATAR.poseFar) { if (this.itemProp) this.itemProp.visible = false; return; } // (#1297: the hand prop only near, with the posed avatar)
    const gaze = this.root.rotation.y, sp = this.pose ? 0 : Math.hypot(vx, vz);
    this.speed += ((sp > 8 ? 0 : sp) - this.speed) * Math.min(1, dt * 10);
    if (this.pose) { this.body = gaze; this.speed = 0; }
    if (!this.have) { this.body = gaze; this.have = true; }
    if (this.speed > AVATAR.walkSpeed) { // the body faces where it goes, unless that is backwards / sideways to the look
      const going = Math.atan2(-vx, -vz);
      this.body += wrap((Math.abs(wrap(going - gaze)) < 1.3 ? going : gaze) - this.body) * Math.min(1, dt * 8);
    } else {
      const off = wrap(gaze - this.body);
      if (Math.abs(off) > AVATAR.bodyTurn) this.body += (off - Math.sign(off) * AVATAR.bodyTurn * 0.5) * Math.min(1, dt * 5);
    }
    if (this.bikeMesh) { this.body = this.bikeYaw; this.speed = 0; } // (#1286: the body faces where the bike goes)
    const turn = THREE.MathUtils.clamp(wrap(gaze - this.body), -1.1, 1.1);
    this.avatar.object.rotation.y = Math.PI + wrap(this.body - gaze);
    const sw = this.swingT > 0 ? Math.sin((1 - this.swingT / SWING) * Math.PI) : 0;
    if (this.swingT > 0) this.swingT = Math.max(0, this.swingT - dt);
    const hands = {};
    if (this.h && this.h !== 'jetpack') { // out in front; the saber's cut sweeps across
      hands.R = armTarget.forward(-1, 0.04);
      hands.R.at[0] += 0.45 * sw; hands.R.at[1] += 0.1 * sw;
    }
    const showItem = !!this.itemProp && !this.prop && !this.bikeMesh; // a weapon or the handlebar has the hands (#1297)
    if (this.itemProp) this.itemProp.visible = showItem;
    if (showItem) hands.R = armTarget.forward(-1, 0.04);
    if (this.waveT > 0) { // (#673) up for the wave, the hand going side to side; down again at the end
      this.waveT = Math.max(0, this.waveT - dt);
      hands.R = armTarget.up(-1, (G.wave - this.waveT) * 11);
    }
    if (this.heldCat.object) Object.assign(hands, this.heldCat.hands());
    Object.assign(hands, this.hands);
    const kiss = this.kiss;
    const age = kiss ? (t - kiss.start) / 1000 : -1, kissed = kissAmount(age);
    if (kiss && age >= KISS.duration) this.kiss = null;
    if (kissed) {
      const direction = Math.atan2(kiss.toward.x - this.root.position.x, kiss.toward.z - this.root.position.z);
      this.avatar.object.rotation.y = lerpAngle(this.avatar.object.rotation.y, direction - this.root.rotation.y, kissed);
    }
    if (hugged) this.poseHug(hug, hugged, hands);
    const amount = Math.max(kissed, hugged); // (the look and gait give way to either embrace)
    this.avatar.update(dt, { speed: this.speed * (1 - amount), turn: turn * (1 - amount), pitch: (this.look?.[1] ?? 0) * (1 - amount) - HUG.head * hugged, hands, crouch: this.crouch ?? 0, dance: !!this.dance && !amount, kiss: kissed, kissReach: kiss?.reach ?? 1, kissLift: kiss?.lift ?? 0 });
    applyRestPose(this.avatar, this.pose, this.look);
    if (this.bikeMesh) this.poseBike(dt, Math.hypot(vx, vz), turn);
    this.heldCat.update(this.avatar, this.root);
    if (this.tag) {
      if (this.pose) { this.tag.position.copy(this.root.worldToLocal(this.head)); this.tag.position.y += (G.tagY - 1.78) * this.avatar.look.tall; }
      else this.tag.position.set(0, this.tagY, 0);
    }
    if (this.pick) {
      if (this.pose) {
        const ends = playerBodySegment(this.id, { p: this.feet.toArray(), r: gaze, pose: this.pose, ...splitAvatarCode(this.avatarCode) }).map(p => this.root.worldToLocal(new THREE.Vector3(...p)));
        this.pick.position.copy(ends[0]).add(ends[1]).multiplyScalar(0.5);
        const axis = ends[1].sub(ends[0]);
        this.pick.scale.y = (axis.length() + 0.6) / 1.8;
        this.pick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
      } else { this.pick.position.set(0, 0.9, 0); this.pick.scale.set(1, 1, 1); this.pick.quaternion.identity(); }
    }
    if (showItem) {
      this.avatar.object.updateMatrixWorld(true);
      this.root.worldToLocal(this.avatar.hand('R', tmpV));
      this.itemProp.position.copy(tmpV);
    }
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

  dispose() { this.heldCat.dispose(); this.clearMirrorTyping(); this.root.removeFromParent(); this.avatar.dispose(); if (this.badge) releaseBadge(this.badge); }
}

/** Our look code on the wire (#1138): the digits as `av` (what older clients read), the extension as `ax`. */
function avatarWire(code) {
  const { av, ax } = splitAvatarCode(code);
  return ax ? { av, ax } : { av };
}

export class Ghosts {
  /** scene; url: the Worker ('' = off); name(): our name; state(): { p: [x, y, z] feet, r: yaw, c?: actual crouched boolean }; active(): playing (not the
   * start screen); weapon(): the key (COMBAT.weapons) of what we hold or ''; score(): displayed points (defaults to stats.totalScore); onHit / onHurt: the room's word on a hit (#667). */
  constructor({ scene, camera, url, name = () => '', state, active = () => true, weapon = () => '', score = totalScore, onHit = () => {}, onHurt = () => {}, mirrored = () => true }) {
    Object.assign(this, { scene, camera, name, state, active, weapon, score, onHit, onHurt, mirrored, mine: null, myGhost: null, rules: null, ws: null, me: null, others: new Map(), sent: null, prev: null,
      lastSent: 0, lastBeat: 0, outbox: [], shots: 0, dropped: 0, greetAt: -1e9, greetsSeen: 0, lastMove: -Infinity, retryAt: 0, backoff: 0, openedAt: 0, connects: 0, messages: 0 });
    const savedAv = (() => { try { return localStorage.getItem('lunden.avatar'); } catch { return null; } })();
    this.myLook = decodeAvatarLook(savedAv, this.name());
    if (!savedAv) { try { localStorage.setItem('lunden.avatar', encodeAvatarLook(this.myLook)); } catch { /* visit-only */ } }
    this.avatarCode = encodeAvatarWireLook(this.myLook);
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
    this.notice = new JoinNotice((text) => this.onNotice?.(text)); // #1333: "<name> kom in i / lämnade spelet"; onNotice(text) is set by main.js
    setInterval(() => { this.beat(); this.notice.tick(); }, 1000); // the heartbeat runs on a timer: slow frames must not let the room think us gone
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

  reset() { this.kisses = []; this.hugs = []; this.myGhost && (this.myGhost.kiss = this.myGhost.hug = null); if (this.kissHearts) this.kissHearts.points.visible = false; this.finishFall(null); this.finishConsume(null); this.myGhost?.clearMirrorTyping(); this.me = null; this.sent = null; this.outbox = []; this.talkbox = []; for (const g of this.others.values()) g.dispose(); this.others.clear(); this.notice?.reset(); this.onTypingReset?.(); }

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
      for (const p of m.ps ?? []) { const g = this.add(p.i, p.n, p.av && typeof p.ax === 'string' ? p.av + p.ax : p.av); if (g && p.p) g.push(p, t); }
    } else if (m.t === 'j') { if (this.add(m.i, m.n, m.av)) this.notice.joined(m.n); }
    else if (m.t === 's') (this.others.get(m.i) ?? this.add(m.i, '', m.av && typeof m.ax === 'string' ? m.av + m.ax : m.av))?.push(m, t);
    else if (m.t === 'x') { const g = this.others.get(m.i); if (g) this.notice.left(g.name === ANON ? '' : g.name); g?.dispose(); this.others.delete(m.i); }
    else if (m.t === 'hit') this.onHit(m, this.others.get(m.to));
    else if (m.t === 'life') this.onLife?.(m);
    else if (m.t === 'fall') { if (m.id === this.pendingFall?.id) this.finishFall(m); }
    else if (m.t === 'consume') { if (m.id === this.pendingConsume?.id) this.finishConsume(m); }
    else if (m.t === 'hurt') this.onHurt(m, this.others.get(m.by));
    else if (m.t === 'a') { const g = this.others.get(m.i); if (g) this.onShot?.(m, g); }
    else if (m.t === 'g') {
      if (m.k === KISS.phrase) this.startKiss(m, t);
      else if (m.k === HUG.phrase) this.startHug(m, t);
      else { const g = this.others.get(m.i); if (g) { g.wave(); this.greetsSeen++; this.onGreet?.(m, g, this.others.get(m.to) ?? null); } }
    }
    else if (m.t === 'c') { const g = this.others.get(m.i); if (g) this.onToast?.(m, g); } // a toast (#1222): the room sends it only from within PLAYERS.toastRange
    else if (m.t === 'snd') { const g = this.others.get(m.i); if (g && SOUNDS.kinds.includes(m.k)) this.onPlayerSound?.(m, g); } // a sound event (#1302): the room sends it only from within PLAYERS.soundRange
    else if (m.t === 'cinema') this.onCinema?.(m);
    else if (m.t === 'snake') this.onSnake?.(m);
    else if (m.t === 'mus') this.onMusic?.(m); // the shared children's-room music (#1624, src/playroommusic.js): only sent to players inside the room
    else if (m.t === 'pool') this.onPool?.(m); // the shared billiard table (#1355, src/billiards.js): only sent to players inside the children's room
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
    this.avatarCode = encodeAvatarWireLook(look);
    this.sentAv = null;
    if (this.myGhost) {
      this.myGhost.key = `${this.name() || ''}:${this.avatarCode}`;
      this.myGhost.setAvatarLook(look);
    }
  }

  /** Each frame: connect / disconnect, send what changed (≤ hz), and place the ghosts. */
  update(dt = 1 / 60) {
    this.kissHearts?.update(dt);
    const t = performance.now(), s = this.state(), w = this.weapon();
    s.h = COMBAT.weapons.includes(w) ? w : '';
    s.c = s.c === true;
    s.pose = s.pose >= 1 && s.pose <= 3 && Number.isInteger(s.pose) ? s.pose : 0; // 3: long sit (#1237)
    s.sp = s.sp === true;
    s.jp = s.jp === 1 || s.jp === 2 ? s.jp : 0;
    s.dn = s.dn === 1 ? 1 : 0; // #1622: floss, offered while the playroom music plays
    s.hi = cleanHeldCategory(s.hi);
    s.bk = Number.isFinite(s.bk) ? s.bk : null;
    s.look = s.pose !== 2 && Array.isArray(s.look) ? s.look : [0, 0];
    s.catKey = JSON.stringify(s.cat ?? null);
    this.track(s, t);
    if (!this.on) return;
    s.score = badgeScore(this.score());
    const prev = this.prev;
    if (!prev || Math.hypot(s.p[0] - prev.p[0], s.p[1] - prev.p[1], s.p[2] - prev.p[2]) > G.move || Math.abs(s.r - prev.r) > G.turn || s.h !== prev.h || s.hi !== prev.hi || s.c !== prev.c || s.pose !== prev.pose || Math.abs(s.look[0] - prev.look[0]) > G.turn || Math.abs(s.look[1] - prev.look[1]) > G.turn || s.sp !== prev.sp || s.jp !== prev.jp || s.dn !== prev.dn || (s.bk === null) !== (prev.bk === null) || Math.abs((s.bk ?? 0) - (prev.bk ?? 0)) > G.turn || s.catKey !== prev.catKey || this.sentAv !== this.avatarCode) { this.lastMove = t; this.prev = s; }
    if (this.prev?.score !== s.score) this.prev = s; // score changes use the same 5 Hz slot; do not reset movement idle time
    const playing = this.active() && !document.hidden && (this.keepConnected?.() || t - this.lastMove < G.idleMs);
    if (!playing) { if (this.ws) this.disconnect(); }
    else if (!this.ws && !this.capped && t >= this.retryAt) this.connect();
    if (this.connected && !this.sendTalk() && !this.sendShot()) {
      const sent = this.sent;
      if (t - this.lastSent >= 1000 / G.hz && (!sent || sent !== this.prev || this.sentAv !== this.avatarCode)) {
        const p = this.prev ?? s;
        this.ws.send(JSON.stringify({ p: p.p.map((v) => Math.round(v * 100) / 100), r: Math.round(p.r * 100) / 100, score: p.score, ...(p.h ? { h: p.h } : {}), ...(p.hi ? { hi: p.hi } : {}), ...(p.c ? { c: true } : {}), ...(p.pose ? { pose: p.pose } : {}), ...(p.pose !== 2 ? { look: p.look.map(v => Math.round(v * 100) / 100) } : {}), ...(p.sp ? { sp: true } : {}), ...(p.jp ? { jp: p.jp } : {}), ...(p.dn ? { dn: 1 } : {}), ...(p.bk !== null && p.bk !== undefined ? { bk: Math.round(p.bk * 100) / 100 } : {}), ...(p.cat ? { cat: p.cat } : {}), ...(this.avatarCode ? avatarWire(this.avatarCode) : {}) }));
        this.sent = p; this.sentAv = this.avatarCode; this.lastSent = this.lastBeat = t; this.messages++;
      }
    }
    const eye = this.camera.position, armed = !!s.h;
    for (const g of this.others.values()) { g.draw(t, eye); g.setSolid(armed && !!g.h); }
    this.updateKisses(t);
    this.updateHugs(t);
    if (this.onStep || this.onJet) this.soundTick(t);
  }

  /** The others' footsteps and jetpack roar (#1302), derived locally from their state (speed, crouch, pose, `bk`, `jp`): no
   * extra traffic and no allocation per frame. `onStep(ghost)` once per stride of a ghost walking on the ground within
   * SOUNDS.range.step; `onJet(ghost)` every SOUNDS.jetEvery s from the SOUNDS.jetNearest nearest thrusting ghosts in range. */
  soundTick(t) {
    const dt = this.soundAt ? Math.min(0.1, (t - this.soundAt) / 1000) : 0;
    this.soundAt = t;
    if (!dt) return;
    for (const g of this.others.values()) {
      if (!g.root.visible || g.dEye > SOUNDS.range.step + SOUNDS.range.jet) { g.stride = 0; continue; }
      if (g.jp === 2 && g.dEye < SOUNDS.range.jet) {
        let nearer = 0;
        for (const o of this.others.values()) if (o !== g && o.jp === 2 && o.dEye < g.dEye) nearer++;
        g.jetT = (g.jetT ?? 0) - dt;
        if (nearer < SOUNDS.jetNearest && g.jetT <= 0) { g.jetT = SOUNDS.jetEvery; this.onJet?.(g); }
      }
      if (g.dEye < SOUNDS.range.step && makesSteps({ speed: g.vh, vy: g.vy, crouch: g.crouch, pose: g.pose, riding: !!g.bikeMesh, jp: g.jp }, SOUNDS)) {
        g.stride = (g.stride ?? 0) + g.vh * dt;
        if (g.stride >= strideFor(g.vh, SOUNDS)) { g.stride = 0; this.onStep?.(g); }
      } else g.stride = 0;
    }
  }

  /** Our own sound event (#1302): `k` a key of SOUNDS.kinds (never text). One small message; the room passes it to the players
   * near us. At most one every SOUNDS.every s. False when not connected / too soon. */
  sound(k) {
    const t = performance.now();
    if (!this.connected || !SOUNDS.kinds.includes(k) || t - (this.soundSentAt ?? -1e9) < SOUNDS.every * 1000) return false;
    this.soundSentAt = t;
    this.outbox.push({ t: 'snd', k });
    while (this.outbox.length > G.outbox) this.outbox.splice(this.outbox.findIndex(m => m.t !== 'fall' && m.t !== 'consume'), 1);
    this.sendShot();
    return true;
  }

  /** A billiard table request (#1355) { t: 'pool', k, q, d? }; the room answers the sender (and everybody in the children's room). False when not connected. */
  pool(msg) {
    if (!this.connected) return false;
    this.outbox.push(msg);
    this.lastMove = performance.now(); this.sendShot();
    return true;
  }

  /** A room-music command (#1624) { t: 'mus', k, ix? }; the room answers everybody inside the children's room. False when not connected. */
  music(msg) {
    if (!this.connected) return false;
    this.outbox.push(msg);
    this.lastMove = performance.now(); this.sendShot();
    return true;
  }

  /** Shared cinema requests are event-driven and use the existing bounded outbox. */
  cinema(msg) {
    if (!this.connected) return false;
    this.outbox.push(msg); this.lastMove = performance.now(); this.sendShot(); return true;
  }

  /** Coalesce headings in the existing shared 5 Hz budget; never grow a game-input queue. */
  snake(msg) {
    if(!this.connected)return false;
    this.outbox=this.outbox.filter(m=>m.t!=='snake'||m.k!=='input');
    if(msg.k==='input'&&this.outbox.length>=G.outbox)return false;
    if(msg.k==='get'&&this.outbox.some(m=>m.t==='snake'&&m.k==='get'))return true;
    this.outbox.push(msg);this.lastMove=performance.now();this.sendShot();return true;
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
    m.p.set(...s.p); m.r = s.r; m.h = s.h; m.hi = s.hi; m.c = s.c; m.pose = s.pose; m.look = s.look; m.sp = s.sp; m.jp = s.jp; m.dn = s.dn; m.bk = s.bk; m.cat = s.cat; m.t = t;
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
    g.setItem(m.hi);
    g.heldCat.set(m.cat, g.root);
    g.pose = m.pose;
    g.look = m.look;
    g.avatar.setSuit(m.sp);
    g.setJetpack(m.jp);
    g.dance = m.dn === 1; // #1622
    g.root.position.copy(m.p);
    g.root.rotation.y = m.r;
    g.bikeAt({ bk: m.bk }, { bk: m.bk }, 1);
    const now = performance.now(), goal = m.c ? 1 : 0, last = g.mirrorAt ?? -Infinity; // (#1149: goes down / up over AVATAR_CROUCH.time, as the eye)
    g.mirrorAt = now;
    g.crouch = now - last < 250 ? THREE.MathUtils.clamp(goal, (g.crouch ?? goal) - (now - last) / 1000 / AVATAR_CROUCH.time, (g.crouch ?? goal) + (now - last) / 1000 / AVATAR_CROUCH.time) : goal;
    g.root.visible = true;
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
  targets() { return this.connected ? [...this.others.values()].filter((g) => g.pick && g.root.visible && g.snaps.length).map((g) => {
    g.door.verb = this.canKiss(g) ? 'pussa' : 'hälsa på'; g.menu ??= (x) => this.choices(x); return g.pick;
  }) : []; }

  /** #1405: the menu rows for another player (main.js shows them with the other choice menus): greet and hug for everybody,
   * kiss as well for a Sarah/Olof pair. A row too far away stays listed with its reason, so the rows never shift; `run`
   * goes to `onChoose(ghost, kind)` (main.js). Kiss/hug rows don't reach out the hand: the embrace waits for the room. */
  choices(g) {
    const labels = { greet: 'hälsa på', hug: 'krama', kiss: 'pussa' };
    return playerChoices(this.name(), g.name).map(id => {
      const ok = id === 'greet' || (id === 'hug' ? this.canHug(g) : this.canKiss(g));
      return { id, label: `${labels[id]} ${g.name}`, ...(ok ? {} : { reason: 'gå närmare' }), ...(id === 'greet' ? {} : { noReach: true }), run: () => this.onChoose?.(g, id) };
    });
  }

  canHug(g) { return !this.weapon() && !g.h && canHug(this.state().p, g.root.position.toArray()); }

  /** An accepted hug (#1405) from the room: both avatars (and our mirror image) for HUG.duration s; same receipts as kisses. */
  startHug(m, now) {
    if (typeof m.id !== 'string' || m.id.length > 80 || !Number.isFinite(m.at)) return; // old server: a plain greeting, no embrace
    this.kissSeen ??= new Set();
    if (this.kissSeen.has(m.id)) return;
    const a = m.i === this.me ? this.selfGhost() : this.others.get(m.i);
    const b = m.to === this.me ? this.selfGhost() : this.others.get(m.to);
    if (!a || !b || a === b) return;
    const from = m.i === this.me ? this.state().p : a.root.position.toArray();
    const to = m.to === this.me ? this.state().p : b.root.position.toArray();
    if (!canHug(from, to, HUG.serverRange)) return;
    this.kissSeen.add(m.id);
    if (this.kissSeen.size > KISS.receipts) this.kissSeen.delete(this.kissSeen.values().next().value);
    a.waveT = b.waveT = 0;
    a.hug = { start: now, toward: new THREE.Vector3(...to) };
    b.hug = { start: now, toward: new THREE.Vector3(...from) };
    (this.hugs ??= []).push({ m, a, b, start: now });
    this.onHug?.(m, a, b);
  }

  /** Let go early when a partner leaves, draws a weapon or walks off; otherwise drop the event once it is over. */
  updateHugs(now) {
    if (!this.hugs?.length) return;
    this.hugs = this.hugs.filter(({ m, a, b, start }) => {
      const from = m.i === this.me ? this.state().p : this.others.get(m.i)?.root.position.toArray();
      const to = m.to === this.me ? this.state().p : this.others.get(m.to)?.root.position.toArray();
      const over = (now - start) / 1000 >= HUG.duration;
      if (over || !canHug(from, to, HUG.serverRange) || (m.i === this.me ? this.weapon() : a.h) || (m.to === this.me ? this.weapon() : b.h)) {
        if (a.hug?.start === start) a.hug = null; // (the next animate puts the drawn body back on its feet)
        if (b.hug?.start === start) b.hug = null;
        return false;
      }
      return true;
    });
  }

  canKiss(g) { return !this.weapon() && !g.h && canKiss(this.name(), g.name, this.state().p, g.root.position.toArray()); }

  startKiss(m, now) {
    if (typeof m.id !== 'string' || m.id.length > 80 || !Number.isFinite(m.at)) return; // old server: greet only, no unconfirmed reward
    this.kissSeen ??= new Set();
    if (this.kissSeen.has(m.id)) return;
    const a = m.i === this.me ? this.selfGhost() : this.others.get(m.i);
    const b = m.to === this.me ? this.selfGhost() : this.others.get(m.to);
    if (!a || !b || a === b) return;
    const from = m.i === this.me ? this.state().p : a.root.position.toArray();
    const to = m.to === this.me ? this.state().p : b.root.position.toArray();
    if (!canKiss(a.name, b.name, from, to, KISS.serverRange)) return;
    this.kissSeen.add(m.id);
    if (this.kissSeen.size > KISS.receipts) this.kissSeen.delete(this.kissSeen.values().next().value);
    const start = now; // one room broadcast starts every local monotonic clock; no wall-clock skew dependency
    a.waveT = b.waveT = 0;
    const reach = THREE.MathUtils.clamp((Math.hypot(to[0] - from[0], to[2] - from[2]) - KISS.faceGap) / (KISS.range - KISS.faceGap), 0, 1);
    const heightA = from[1] + a.avatar.look.tall * KISS.mouthHeight, heightB = to[1] + b.avatar.look.tall * KISS.mouthHeight;
    a.kiss = { start, toward: new THREE.Vector3(...to), reach, lift: Math.min(0, heightB - heightA) / a.avatar.look.tall };
    b.kiss = { start, toward: new THREE.Vector3(...from), reach, lift: Math.min(0, heightA - heightB) / b.avatar.look.tall };
    (this.kisses ??= []).push({ m, a, b, start, done: false });
  }

  updateKisses(now) {
    if (!this.kisses?.length) return;
    this.kisses = (this.kisses ?? []).filter(event => {
      const { m, a, b, start } = event, age = (now - start) / 1000;
      const from = m.i === this.me ? this.state().p : this.others.get(m.i)?.root.position.toArray();
      const to = m.to === this.me ? this.state().p : this.others.get(m.to)?.root.position.toArray();
      if (!canKiss(a.name, b.name, from, to, KISS.serverRange) || (m.i === this.me ? this.weapon() : a.h) || (m.to === this.me ? this.weapon() : b.h)) {
        a.kiss = b.kiss = null; return false;
      }
      const at = new THREE.Vector3(...from).add(new THREE.Vector3(...to)).multiplyScalar(.5);
      at.y += Math.min(a.avatar.look.tall, b.avatar.look.tall) * KISS.mouthHeight;
      const near = at.distanceTo(this.camera.position) <= KISS.soundRange;
      if (!event.sounded && age >= KISS.contact - KISS.hum) {
        event.sounded = true;
        if (near) this.onKiss?.(m, at);
      }
      if (!event.done && age >= KISS.contact) {
        event.done = true;
        if (near) {
          this.kissHearts ??= new Hearts(this.scene, KISS.hearts, KISS.scale);
          this.kissHearts.burst(at);
        }
        if (m.i === this.me) this.onLove?.(m.id);
      }
      return age < KISS.duration;
    });
  }

  /** Greet `g` (#673): a phrase from GHOSTS.hello (an index, never free text), one message to the room, at most one every
   * GHOSTS.greetEvery s. Returns the line said ("{n}" = their name), or null. */
  greet(g, kind = 'greet') { // #1405: kind 'greet' | 'hug' | 'kiss', chosen by the player (never upgraded automatically)
    const t = performance.now();
    if (!this.connected || t - this.greetAt < G.greetEvery * 1000 || !this.others.has(g.id)) return null;
    const kiss = kind === 'kiss', hug = kind === 'hug';
    if ((kiss && !this.canKiss(g)) || (hug && !this.canHug(g))) return null;
    this.greetAt = t;
    const k = kiss ? KISS.phrase : hug ? HUG.phrase : Math.floor(Math.random() * G.hello.length);
    this.outbox.push({ t: 'g', to: g.id, k, ...(kiss || hug ? { q: this.kissSeq = (this.kissSeq ?? 0) + 1 } : {}) });
    while (this.outbox.length > G.outbox) this.outbox.splice(this.outbox.findIndex(m => m.t !== 'fall' && m.t !== 'consume'), 1);
    this.sendShot();
    return (kiss ? KISS.line : hug ? HUG.line : G.hello[k]).replace('{n}', g.name);
  }

  /** Our toast (#1222): line index `k` of TOAST_LINES (never text), `back` when it answers one. One small message; the room
   * passes it to the players near us. At most one every TOAST.every s. False when not connected / too soon. */
  toast(k, back = false) {
    const t = performance.now();
    if (!this.connected || t - (this.toastAt ?? -1e9) < TOAST.every * 1000) return false;
    this.toastAt = t;
    this.outbox.push({ t: 'c', k, ...(back ? { b: true } : {}) });
    while (this.outbox.length > G.outbox) this.outbox.splice(this.outbox.findIndex(m => m.t !== 'fall' && m.t !== 'consume'), 1);
    this.sendShot();
    return true;
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
