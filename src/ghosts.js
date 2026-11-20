import { restBodyReady, standBodyReady, standRoot } from './avatarselfview.js'; // #2080
import { wetEnv } from './avatarweather.js'; // #2018
import { newOuter, stepOuter, wornLook } from './avataroutwear.js'; // #2147
import { transitionPose, copyPose } from './avatarmotion.js';
import {gymPoseWire} from './gymposewire.js';
import {applyGymBodyPose} from './gymbodypose.js';
import { playerLocalStorage as localStorage } from './playerprofiles.js';
import { applyRestPose } from './remote-pose.js';
import { newSleep, stepSleep, applySleepRoll } from './avatarsleep.js'; // #2163
import { seatedLegs, localFloor, seatPump } from './seatlegs.js'; // #2158
import { poseOlof } from './olof.js';
import { pumpWire } from './gympump.js';
import { updateFace } from './avatarface.js'; // #2031
import { updateBreath, BreathPuffs } from './avatarbreath.js'; // #2037
import * as THREE from 'three';
import { CUE_ARM, FALL, SELF_STAND, TOAST, SOUNDS, KISS, HUG, REACT, REST, SEAT_LEGS } from './config.js';
import { chooseGazeTarget } from './avatargaze.js';
import { AVATAR_GAZE, SCOOTER, SCOOTER_GHOST } from './config.js';
import { makesSteps, strideFor } from './spatialsound.js';
import { newPlayback, receive, playStep } from './ghostinterp.js'; // #2139
import { GHOST_PLAYBACK as PLAY } from './config.js';
import { sessionStartLook } from './olofname.js';
import { GHOSTS as G, COMBAT, AVATAR, AVATAR_CROUCH, AVATAR_MOTION as MOTION, CHAT, SWIM, encodeAvatarLook, outerValue, encodeAvatarWireLook, decodeAvatarLook, splitAvatarCode, playerBodySegment } from './config.js';
import { Avatar, armTarget, swimLineFar } from './avatar.js';
import { aheadSample } from './avatarjump.js'; // #2140
const finiteOr = (h) => (Number.isFinite(h) ? h : NaN); // (no ground under the feet, e.g. in the stairwell: unknown, not infinitely high)
import { gripFor } from './avatargrip.js';
import { AVATAR_GRIP as GRIP } from './config.js'; // #2016: the grip of what is held
import { totalScore } from './stats.js';
import { acquireBadge, releaseBadge, badgeScore, badgeLives } from './ghostbadge.js';
import { setMirrorExtra } from './reflections.js';
import { GhostCat } from './ghostcat.js';
import { JoinNotice } from './joinnotice.js';
import { newAwayToken, cleanAwayToken } from './awaypresence.js'; // #2216
import { AWAY } from './config.js';
import { canKiss, kissAmount } from './kiss.js';
import { canHug, hugAmount, playerChoices } from './hug.js';
import { Hearts } from './pingping.js';
import { cleanHeldCategory } from './heldcategory.js';
import { carryPose, newCarry, easeLean } from './avatarcarry.js'; // #2144: the carry pose by what is held
import { aimPose, newAim } from './avataraim.js'; // #2149: a weapon follows the gaze pitch, the support hand on it
import { trimOutbox } from './outbox.js';
import { AvatarLight } from './avatarlight.js'; // #2017: the avatars' light follows the room's light level
import { AvatarShadows } from './avatarshadow.js'; // #2010: soft contact shadows, one draw call
import { GhostFar } from './ghostfar.js'; // #1966: far players as one draw call
import { mouthPose, blendHand } from './avatarmouth.js'; // #2160
import { cueArms, newCueArms, strokePull } from './avatarcue.js'; // #2162
import { typeStep, typePose, typeAllowed } from './avatartype.js'; // #2174
import { phoneShown } from './avatarphone.js'; // #2217
import { reachPose, toFigureFrame, REACH_TOTAL } from './avatarreach.js'; // #2161
import { lifeEvent, nearestShooter, knockPose, KNOCK_TOTAL } from './avatarknock.js'; // #2167
import { flinch, hitDir } from './avatarhit.js';
import { stepBikeRide, bikeGrip, bikeSeat } from './bikeride.js';
import { ghostProp, ghostJetpack, ghostBike, ghostScooter, ghostItem } from './ghostprops.js'; // what an armed player holds: their weapon's own model (#667, #1126)

// Other players as ghosts (#666): a WebSocket to the Worker's players' room (cloudflare/players.js, one Durable Object for
// everybody). Inert without the cloud (cloud.js `cloudUrl`), with GHOSTS.enabled false or ?mp=0. We send our feet and
// heading at most GHOSTS.hz times a second and only when they changed, a heartbeat 'p' every GHOSTS.beatMs (answered by
// the runtime, never billed), and disconnect when the tab is hidden, on the start screen, or after GHOSTS.idleMs standing
// still. #2216: that close says AWAY.code and the connection carries a per-tab token (?a=), so the room keeps our figure for
// the others, marked away (`aw`, Ghost.away), for AWAY.ms and lets us back in under the same id; no socket stays open meanwhile. The room's cost cap (close 4001) keeps us off for the rest of the month (localStorage 'lunden.mp.capMonth').
//
// Each other player is one avatar (#705, src/avatar.js: a human figure, one skinned mesh = one draw call, shared geometry per
// variant; an outline without a weapon, solid when both are armed; no shadow, depth-tested so walls and floors hide it) and one name tag sprite ("Anonym" without a name; the canvas
// texture is shared by everyone with the same name and score, released when unused). States are drawn at least GHOSTS.delay ms late (#2139:
// more on a jittery link, src/ghostinterp.js) on a Hermite curve through the received ones, so the motion is smooth at 5 Hz.

const CAP_KEY = 'lunden.mp.capMonth';
const monthNow = () => new Date().toISOString().slice(0, 7);
const URGENT = new Set(['a', 'fall', 'consume', 'dr', 'rf', 'th', 'ch', 'li', 'lx', 'lm']); // #1763: outbox messages that go ahead of a due state (stateDue); #1777: wherever they wait, and the river fish's catch requests too
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
export const airMode = (am) => (am === 1 || am === 2 || am === 3 ? am : 0); // #1799: the `am` field (1 flying, 2 swinging, 3 climbing; else on the ground)
const SWING = 0.35; // s the saber's cut lasts
// #1943: is a figure with its feet at `p` swimming? Set by main.js (`Ghosts` option `swim`), so this module needs no terrain: (p) => null or
// { water: the surface's height there, cx, cz: the current (m/s) }. Derived from the position alone, so no new state field travels: a swimmer's
// feet follow the river bed, under the surface (player.js `swimStep`), and nobody else stands there.
let swimProbe = null;
const gazePoint = new THREE.Vector3();
const tmpV = new THREE.Vector3(), tmpW = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const pickMat = new THREE.MeshBasicMaterial();

export class Ghost { // (exported for tools/ghostprops.html)
  /** `self`: our own reflection in the mirrors (#691): no name tag, also reused for the resting first-person body (#2080). */
  constructor(parent, id, name, self = false, look = null) {
    this.id = id; this.name = name || ANON; this.snaps = []; this.play = newPlayback(1000 / G.hz); this.playOut = { p: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 } }; /* #2139 */ this.h = ''; this.hi = ''; this.itemProp = null; this.itemHold = new THREE.Vector3(); this.solid = false; this.prop = null; this.self = self;
    this.avatarLook = look ?? (self ? `me:${name}` : id);
    this.outer = newOuter(); // #2147
    this.avatar = new Avatar(this.wornOf(this.avatarLook), tint(name));
    this.avatar.idleSeed = id; this.avatar.idleLook = !self; // #2035: each player rests in its own rhythm; our mirror image keeps our view
    this.avatar.setPump(this.pump ?? 0);
    this.avatar.setSolid(true); // always solid (#1025)
    this.mesh = this.avatar.mesh;
    // #2211: dynamic bodies are positioned after static detail collection; Ghosts already owns their visibility/LOD.
    this.mesh.userData.noDetail = true;
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

  wornOf(look) { return this.outer.worn && look && typeof look === 'object' ? wornLook(look, true) : look; } // #2147

  setAvatarLook(look) {
    this.avatarLook = look;
    const hadSuit = !!this.avatar.suit, { wetState, wetAt, idleSeed, idleLook } = this.avatar;
    this.avatar.object.removeFromParent();
    this.avatar.dispose();
    this.avatar = new Avatar(this.wornOf(look), tint(this.name)); // #2147: with the layer on while it is worn
    Object.assign(this.avatar, { wetState, wetAt, idleSeed, idleLook }); // (a rebuilt body keeps its wetness and its idle)
    this.avatar.setPump(this.pump ?? 0);
    this.avatar.setSolid(true); // always solid (#1025)
    if (hadSuit) this.avatar.setSuit(true);
    this.onAvatar?.(this.avatar); // #1966: the new body fades by distance too
    if (this.pack) { this.avatar.bones.torso.add(this.pack); }
    this.mesh = this.avatar.mesh;
    // #2211: dynamic bodies are positioned after static detail collection; Ghosts already owns their visibility/LOD.
    this.mesh.userData.noDetail = true;
    this.mesh.name = `ghost:${this.name}`;
    this.root.add(this.avatar.object);
    if (this.tag) {
      this.tagY = G.tagY + (this.avatar.look.tall - 1) * 1.8;
      this.tag.position.y = this.tagY;
    }
  }

  /** #2147: the outer layer, derived locally from the chosen look, the weather and `outdoors`; the body is rebuilt only when it goes on or off.
   * `outerPreview` (the customizer is open): our own mirror image wears the chosen layer. */
  updateOuter(dt, outdoors) {
    const lk = this.avatarLook, was = this.outer.worn;
    if (typeof lk !== 'object' || !lk || (!outerValue(lk.outer) && !was)) return; // (a seed's look has no layer)
    const now = stepOuter(this.outer, dt, lk, outdoors, wetEnv, this.self && Ghost.outerPreview === true);
    if (now !== was) this.setAvatarLook(this.avatarLook);
  }

  /** A state from the room at time t (ms). After a pause the last one is repeated just before it, so it walks off smoothly. */
  push({ p, r, h = '', hi = '', score = 0, l, c = false, sp = false, jp = 0, bk, sc, pose = 0, look = [0, 0], av, ax, cat, dn, am, cq, fb, bp, gx, aw }, t) {
    this.away = aw === 1; // #2216: the player's tab is hidden (the room keeps them AWAY.ms); #2217's phone pose may read it
    this.lastP = p; // #2241: the last position as sent (Ghosts.near)
    this.bob = Array.isArray(fb) && fb.length === 4 && fb.every(Number.isFinite) ? fb : null; // #1753: their fishing float [x, y, z, bite] (src/fishing.js draws it)
    this.cue = Array.isArray(cq) && cq.length === 3 && cq.every(Number.isFinite) ? cq : null; // #1637: [dx, dz, power] while aiming at the billiard table (src/billiards.js draws it)
    if (av && typeof ax === 'string') av += ax; // #1138: the face extension beside the digits
    if (av && av !== this.avatarCode) {
      this.avatarCode = av;
      this.setAvatarLook(decodeAvatarLook(av, this.id));
    }
    this.pump = pumpWire(bp); this.avatar.setPump(this.pump);
    this.score = badgeScore(score);
    const prevLives = this.lives;
    this.lives = badgeLives(l); // never infer remote health from a client's default maximum
    this.setHeld(h);
    this.setItem(hi); // (#1297: an ordinary held thing, by category)
    this.heldCat.set(cat, this.root);
    this.avatar.setSuit(sp);
    this.scooterWire = Number.isFinite(sc) && !Number.isFinite(bk); // #2235: `sc` = the e-scooter's heading while standing on one (an older client sends nothing and is just seen standing)
    this.bikeWire = Number.isFinite(bk) ? bk : this.scooterWire ? sc : null; // (#1286: the bicycle's heading while riding; the scooter's heading rides the same snapshot slot)
    this.setJetpack(h === 'jetpack' && !jp ? 1 : jp); // (an older client only says h: 'jetpack', which is no weapon, #1705)
    this.refreshBadge();
    // #2139 (src/ghostinterp.js): the arrival feeds the jitter buffer; a teleport (#1319: into / out of the children's room; a respawn:
    // an implausible speed or GHOSTS.jump m) appears there, no streak across the map; after a pause it walks off from where it stood
    const p3 = new THREE.Vector3(...p);
    const had = this.snaps.length > 0;
    const ts = receive(this.play, this.snaps, p3, t, G.jump, PLAY, (last, at) => ({ t: at, p: last.p, r: last.r, c: last.c, pose: last.pose, look: last.look, bk: last.bk, sc: last.sc, dn: last.dn, am: last.am, gx:last.gx }));
    this.noteLives(prevLives, had && this.snaps.length === 0, t); // #2167 (before the new place is pushed: the figure still stands where it was drawn)
    this.snaps.push({ t: ts, look, gx:gymPoseWire(gx), dn: dn === 1 || dn === 2 ? dn : 0, am: airMode(am), bk: this.bikeWire, sc: this.scooterWire ? 1 : 0, p: p3, r, c: c === true ? 1 : 0, pose: pose >= 1 && pose <= 3 && Number.isInteger(pose) ? pose : 0 });
    if (this.snaps.length > 8) this.snaps.splice(0, this.snaps.length - 8);
  }

  /** #2167: onlookers see a flinch when the lives drop (away from the nearest armed player) and a collapse on the spot when the player is knocked out
   * (the lives back up together with a teleport); `teleported`: the playback was reset by this state. The network place (head boxes, pick body) is the new one at once. */
  noteLives(prev, teleported, t) {
    const ev = lifeEvent(prev, this.lives, teleported);
    if (!ev || !this.have || this.self) return;
    const at = this.root.position, from = this.shooterAt?.(this, at) ?? null, yaw = this.root.rotation.y + this.avatar.object.rotation.y;
    if (ev === 'hit') {
      if (from) { flinch(this.avatar, from, at, yaw, false); this.obsKickAt = performance.now(); }
      return;
    }
    const dir = from ? hitDir(from, at, yaw) : [0, -1]; // (no shooter near: it falls over backwards)
    if (from) { flinch(this.avatar, from, at, yaw, false); this.obsKickAt = performance.now(); }
    this.knock = { start: t, at: [at.x, at.y, at.z], yaw: this.root.rotation.y, objYaw: this.avatar.object.rotation.y, dir };
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
    this.itemHold.set(0, 0, 0); // #2016: a compact thing is held by its middle, a long one (a cue, a rod, a pan) by its own grip origin
    if (this.itemProp) {
      const g = this.itemProp.geometry; g.boundingBox ?? g.computeBoundingBox();
      g.boundingBox.getSize(tmpW); if (Math.max(tmpW.x, tmpW.y, tmpW.z) < GRIP.compact) g.boundingBox.getCenter(this.itemHold);
    }
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
  setBike(on, scooter = false) {
    if (on && this.bikeMesh && !!this.bikeMesh.userData.scooter !== scooter) this.setBike(false); // (a bicycle swapped for a scooter between two snapshots)
    if (on === !!this.bikeMesh) return;
    if (!on) { const sc = this.bikeMesh.userData.scooter; this.bikeMesh.removeFromParent(); if (!sc) this.bikeMesh.material.dispose(); this.bikeMesh = null; this.bikeYaw = null; this.avatar.object.rotation.set(0, this.avatar.object.rotation.y, 0, 'XYZ'); this.avatar.object.position.y = 0; return; }
    this.bikeMesh = scooter ? ghostScooter() : ghostBike(); this.root.add(this.bikeMesh); this.bikeLastYaw = null;
  }

  /** The riding state at render time: the heading is interpolated like `r`. */
  bikeAt(a, b, k) {
    const s = (k < 1 ? a : b).bk ?? null;
    this.setBike(s !== null, s !== null && !!(k < 1 ? a : b).sc); // (#2235: `sc` 1 = the heading belongs to an e-scooter)
    this.bikeYaw = s === null ? null : (a.bk != null && b.bk != null ? lerpAngle(a.bk, b.bk, k) : s);
    if (this.bikeMesh) this.bikeMesh.rotation.y = Math.PI / 2 + wrap(this.bikeYaw - this.root.rotation.y); // (the bike's heading against the look; its x is forward)
  }

  /** #2235: standing on an e-scooter's deck, the hands on the grips, the feet planted one behind the other, the body along the
   * direction of travel. Legs and arms stay still (no gait): the scooter carries the rider. */
  poseScooter() {
    const D = SCOOTER_GHOST, G = SCOOTER.grip, o = this.avatar.object;
    o.rotation.set(0, o.rotation.y, 0, 'XYZ'); o.position.y = SCOOTER.deck;
    poseOlof(this.avatar, { hip: D.hip, lean: D.lean, head: -0.05 + (this.look?.[1] ?? 0), turn: 0, feet: D.feet, knee: D.knee,
      hands: [1, -1].map((s) => ({ at: [s * G.z, G.y - SCOOTER.deck, G.x], pole: [s, 0, -0.5] })), can: null });
  }

  /** Seated on the saddle (or standing on a steep climb), the hands on the turned handlebar, the feet on the cranks, which turn
   * with a cadence from the speed and stop when freewheeling; the bike and the rider lean into the curve and follow the slope (#2148).
   * `vy`: the climb rate m/s; the yaw rate comes from the bicycle's heading between frames. */
  poseBike(dt, speed, turn = 0, vy = 0) {
    const ride = this.bikeMesh.userData.ride, yaw = this.bikeYaw;
    const yawRate = this.bikeLastYaw != null && dt > 0 ? wrap(yaw - this.bikeLastYaw) / dt : 0; this.bikeLastYaw = yaw;
    stepBikeRide(ride, dt, speed, yawRate, speed > 0.5 ? Math.atan2(vy, speed) : 0);
    const ph = ride.crank - Math.PI / 2, pedal = (s) => [s * 0.115, 0.44 + 0.17 * Math.sin(ph + (s > 0 ? 0 : Math.PI)), -0.05 + 0.17 * Math.cos(ph + (s > 0 ? 0 : Math.PI))];
    const seat = bikeSeat(ride.stand);
    this.bikeMesh.rotation.x = ride.roll; this.bikeMesh.rotation.z = ride.pitch;
    const o = this.avatar.object; o.rotation.order = 'YXZ'; o.rotation.x = -ride.pitch; o.rotation.z = ride.roll;
    poseOlof(this.avatar, { hip: seat.hip, lean: seat.lean, head: -0.25 + (this.look?.[1] ?? 0), turn,
      feet: [pedal(1), pedal(-1)], knee: [0.3, 0.9, 1],
      hands: [1, -1].map((s) => ({ at: bikeGrip(s, ride.steer), pole: [s, 0, -0.5] })), can: null });
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

  /** #2162: the arms of a figure aiming at the billiard table (billiards.js hands over `cueRig`, the world-space cue frame, while it draws their cue):
   * writes the bridge (L) and stroke (R) hand targets into `hands`, eased in and out; the forward stroke runs here when the cue vanishes after a charge.
   * Returns the torso lean to add (rad, negative = forward). Nothing happens, and nothing is allocated, for a figure that is not aiming. */
  poseCue(t, dt, hands) {
    const k = this.cueK ??= { w: 0, tip: [0, 0, 0], u: [0, 0, 0], pull: 0, shot: -1, v: null };
    const rig = this.cueRig, aiming = !!rig && !!this.cue && this.hi === 'cue' && t - rig.t < 400;
    if (aiming) {
      k.tip[0] = rig.tip[0]; k.tip[1] = rig.tip[1]; k.tip[2] = rig.tip[2]; k.u[0] = rig.u[0]; k.u[1] = rig.u[1]; k.u[2] = rig.u[2];
      k.pull = rig.pull; k.shot = -1; k.seen = true;
    } else if (k.seen) { // the cue vanished: after a charge that is the stroke (the table then draws it); after nothing it is only the end of aiming
      k.seen = false;
      if (k.pull > 0.02) k.shot = t;
    }
    let pull = k.pull;
    if (!aiming && k.shot >= 0) { const sp = strokePull(k.pull, (t - k.shot) / 1000); if (sp === null) k.shot = -1; else pull = sp; }
    const on = aiming || k.shot >= 0;
    k.w = on ? Math.min(1, k.w + dt * CUE_ARM.ease) : Math.max(0, k.w - dt * CUE_ARM.ease);
    if (!k.w) return 0;
    const o = this.avatar.object; o.updateWorldMatrix(true, false);
    const v = k.v ??= { tip: new THREE.Vector3(), end: new THREE.Vector3(), a: [0, 0, 0], u: [0, 0, 0], arms: newCueArms() };
    o.worldToLocal(v.tip.set(k.tip[0], k.tip[1], k.tip[2]));
    o.worldToLocal(v.end.set(k.tip[0] + k.u[0], k.tip[1] + k.u[1], k.tip[2] + k.u[2])).sub(v.tip);
    const len = v.end.length() || 1; // (the figure's own scale: its frame is in unscaled metres, the cue is not)
    v.a[0] = v.tip.x; v.a[1] = v.tip.y; v.a[2] = v.tip.z; v.u[0] = v.end.x / len; v.u[1] = v.end.y / len; v.u[2] = v.end.z / len;
    const arms = cueArms(v.a, v.u, pull / o.scale.y, v.arms);
    hands.L = blendHand(hands.L ?? armTarget.rest(1), arms.L, k.w);
    hands.R = blendHand(hands.R ?? armTarget.rest(-1), arms.R, k.w);
    return arms.lean * k.w;
  }

  /** #2160: start a sip / bite / toast move now (`t` as animate's clock); unknown kinds are ignored by mouthPose. */
  startMouth(kind, t = performance.now()) { this.mouth = { kind, start: t }; }
  /** #2161: reach for the world point `world` [x, y, z] (a door handle, a thing taken / put down) now; out of range it does nothing at animate time. */
  startReach(world, t = performance.now()) { this.reach = { world: [world[0], world[1], world[2]], start: t }; }

  /** A wave (#673): the right arm up and waving for GHOSTS.wave s (armTarget.up, the surface #705 left for it). */
  wave() { this.waveT = G.wave; }

  /** A BIO reaction (#1639): kind `k` of REACT.kinds from time `t` (ms) for REACT.duration s. */
  startReact(k, t = performance.now()) { if (REACT.kinds[k]) this.react = { kind: k, start: t }; }

  /** Over its head (the speech bubble's anchor, greet.js). */
  get head() { return this.pose || this.gx ? this.avatar.bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0)) : this.root.position.clone().setY(this.root.position.y + 1.78 * this.avatar.look.tall); }

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
    // #2139: the adaptive jitter buffer's playhead (never less than GHOSTS.delay behind), a Hermite curve through the snapshots,
    // a short decaying extrapolation when the next one is late; combat reads the figure placed here (`feet`, rotation, crouch, pose)
    const play = playStep(this.play, s, t, G.delay, PLAY, this.playOut), { a, b, k } = play, v = play.v;
    this.root.position.set(play.p.x, play.p.y, play.p.z);
    this.root.rotation.y = lerpAngle(a.r, b.r, k);
    this.crouch = THREE.MathUtils.lerp(a.c, b.c, k);
    this.poseCarry = k < 1 && a.pose !== b.pose && [0,1].includes(a.pose) && [0,1].includes(b.pose);
    this.pose = (k < 1 ? a : b).pose;this.gx=gymPoseWire((k<1?a:b).gx);
    this.dance = (k < 1 ? a : b).dn ?? 0; // #1622 / #1757: 0, 1 floss or 2 Gangnam Style (validated in push)
    this.air = (k < 1 ? a : b).am ?? 0; // #1799: 0 on the ground (or an older client), 1 flying, 2 swinging, 3 climbing
    this.look = [THREE.MathUtils.lerp(a.look[0], b.look[0], k), THREE.MathUtils.lerp(a.look[1], b.look[1], k)];
    this.bikeAt(a, b, k);
    const d = this.root.position.distanceTo(eye);
    let kd = Infinity; // #2167: a knocked-out figure still falls where it stood (drawn displaced; its network place is already the new one)
    if (this.knock) {
      if (t - this.knock.start >= KNOCK_TOTAL * 1000) { this.knock = null; this.avatar.object.position.set(0, 0, 0); this.avatar.object.rotation.set(0, this.avatar.object.rotation.y, 0); }
      else kd = Math.hypot(eye.x - this.knock.at[0], eye.y - this.knock.at[1], eye.z - this.knock.at[2]);
    }
    this.root.visible = d < G.far || kd < G.far;
    this.dEye = d; this.vh = Math.hypot(v.x, v.z); this.vy = v.y; // (#1302: what the footsteps derive from; #2139: the curve's velocity)
    if (this.tag) { // (#1296) beyond tagFar the tag grows with distance: constant size on screen, no pop-out
      this.tag.visible = d < G.far && !this.knock;
      const f = Math.max(1, d / G.tagFar);
      this.tag.scale.set(G.tagWidth * f, (this.tagH ?? G.tagHeight) * f, 1);
    }
    if (this.root.visible) this.animate(t, Math.min(d, kd), v.x, v.z);
  }

  /** #2158: the seated feet on the real floor under the seat (src/seatlegs.js). The floor is read once per seat, a little in front
   * of the root (`seatFloor`: a vehicle's cabin floor, else the walkable `ground`), and again only after the root moved
   * SEAT_LEGS.reread m (a moving car); the root and hips stay where restState put them. `dt` < 0: not seated (forget the seat).
   * On a swing the shins pump with its forward speed (vx, vz, m/s); never in a vehicle. */
  seatFeet(dt, vx = 0, vz = 0) {
    if (dt < 0) { this.seatAt = null; this.seatPumpK = 0; return null; }
    const rp = this.root.position, k = this.avatar.object.scale.y || 1, yaw = this.root.rotation.y, sx = -Math.sin(yaw), sz = -Math.cos(yaw);
    let at = this.seatAt;
    if (!at || Math.hypot(rp.x - at.x, rp.z - at.z) > SEAT_LEGS.reread) {
      const px = rp.x + sx * SEAT_LEGS.probe * k, pz = rp.z + sz * SEAT_LEGS.probe * k, py = rp.y + SEAT_LEGS.ankle * k;
      const v = this.seatFloor?.(px, pz, py) ?? null, y = v ?? this.ground?.(px, pz, py);
      at = this.seatAt = { x: rp.x, z: rp.z, y: Number.isFinite(y) ? y : NaN, vehicle: v !== null };
    }
    const pump = at.vehicle ? 0 : seatPump(vx * sx + vz * sz, Math.hypot(vx, vz));
    this.seatPumpK = (this.seatPumpK ?? 0) + (pump - (this.seatPumpK ?? 0)) * Math.min(1, dt * SEAT_LEGS.pumpEase);
    return (this.seatLegs = seatedLegs(REST.avatarSeat, localFloor(at.y, rp.y, k, REST.avatarSeat), this.seatPumpK, this.seatLegs ?? undefined)).feet;
  }

  /** #2163: the collected pose of rest pose `n` (1 seated, 2 lying) for the get-down / get-up sequence; the pending pose stays as it was. */
  restKey(n) {
    const av = this.avatar, was = av.pendingPose;
    applyRestPose(av, n, [0, 0], null, null);
    const p = copyPose({}, av.pendingPose); av.pendingPose = was; return p;
  }

  /** The avatar's pose: the gait follows the ground speed (vx, vz) m/s; the body turns towards where it goes, the head to
   * where it looks; a weapon is held out in the right hand and the prop sits in it. `d`: distance to the eye (far away: not
   * posed). `this.hands` (optional { L, R }, see armTarget in avatar.js) overrides an arm: the surface for a wave (#673). */
  animate(t, d, vx, vz) {
    const elapsed = this.lastDraw ? (t - this.lastDraw) / 1000 : 0, dt = Math.min(0.1, elapsed);
    if (elapsed > MOTION.resetTime) { this.avatar.groundMotion = null; this.avatar.poseMotion = null; }
    this.lastDraw = t;
    const hug = this.hug, hugAge = hug ? (t - hug.start) / 1000 : -1, hugged = hugAmount(hugAge); // (#1405)
    if (hug && hugAge >= HUG.duration) this.hug = null;
    if (!hugged) this.avatar.object.position.set(0, 0, 0); // back where the body stands after a hug, also when not posed
    // #1943: in the river (derived from the position): the figure is set so deep that only the head is above the surface, and its speed
    // is the one through the water (the current taken off), so someone only drifting treads water
    const wet = swimProbe && !this.pose && !this.gx && !this.bikeMesh && !this.air ? swimProbe(this.root.position) : null;
    this.swim = !!wet;
    // #1944: crouched in the water = diving (`crouch` 0 … 1, the existing `c` flag): the figure goes down until its head is SWIM.dive.eyeOverBed
    // over the bed (its feet position), wears the mask and lies level (avatar.js)
    const dive = wet ? this.crouch ?? 0 : 0;
    const sink = (amt, line, dv = dive) => {
      const top = wet.water - this.root.position.y - line * this.avatar.object.scale.y, deep = Math.min(top, SWIM.dive.eyeOverBed - line * this.avatar.object.scale.y);
      this.swimDy = amt * (top + (deep - top) * dv); this.avatar.object.position.y = this.swimDy;
    };
    if (wet) { vx -= wet.cx; vz -= wet.cz; sink(1, swimLineFar()); } else this.swimDy = 0;
    if (d > AVATAR.poseFar) { if (this.itemProp) this.itemProp.visible = false; return; } // (#1297: the hand prop only near, with the posed avatar)
    const gaze = this.root.rotation.y, sp = this.pose || this.gx ? 0 : Math.hypot(vx, vz);
    // #1951: a swim stroke (the jump button) shows as a jump in the speed through the water to more than the ordinary stroke ever gives
    if (wet && sp <= 8 && sp > SWIM.kick.avatar.over && sp - this.speed > SWIM.kick.avatar.jump) this.avatar.swimStroke();
    this.speed += ((sp > 8 ? 0 : sp) - this.speed) * Math.min(1, dt * 10);
    if (this.pose || this.gx) {
      // Ordinary sitting follows the existing rendered body heading into the seat;
      // explicit gym/lying anchors keep their exact heading.
      if (this.pose === 1 && !this.gx && this.have) {
        const off = wrap(gaze - this.body); this.body += off * (1 - Math.exp(-dt * MOTION.seatTurnEase));
        if (Math.abs(off) < MOTION.seatTurnSnap) this.body = gaze;
      } else this.body = gaze;
      this.speed = 0;
    }
    if (!this.have) { this.body = gaze; this.have = true; }
    if (this.speed > AVATAR.walkSpeed && this.air !== 3) { // the body faces where it goes, unless that is backwards / sideways to the look (#1799: on a wall it faces the wall)
      const going = Math.atan2(-vx, -vz);
      this.body += wrap((Math.abs(wrap(going - gaze)) < 1.3 ? going : gaze) - this.body) * Math.min(1, dt * 8);
    } else {
      const off = wrap(gaze - this.body);
      if (Math.abs(off) > AVATAR.bodyTurn) this.body += (off - Math.sign(off) * AVATAR.bodyTurn * 0.5) * Math.min(1, dt * 5);
    }
    if (this.bikeMesh) { this.body = this.bikeYaw; this.speed = 0; } // (#1286: the body faces where the bike goes)
    const turn = THREE.MathUtils.clamp(wrap(gaze - this.body), -1.1, 1.1);
    if (this.knockTilt) { this.avatar.object.rotation.x = 0; this.avatar.object.rotation.z = 0; this.knockTilt = false; } // #2167: the toppled quaternion rewrote the Euler angles last frame
    this.avatar.object.rotation.y = Math.PI + wrap(this.body - gaze);
    const sw = this.swingT > 0 ? Math.sin((1 - this.swingT / SWING) * Math.PI) : 0;
    if (this.swingT > 0) this.swingT = Math.max(0, this.swingT - dt);
    const hands = {};
    if (this.h && this.h !== 'jetpack') { // out in front; the saber's cut sweeps across
      hands.R = armTarget.forward(-1, 0.04);
      hands.R.at[0] += 0.45 * sw; hands.R.at[1] += 0.1 * sw;
    }
    const aim = this.aim ??= newAim();
    aimPose(this.h && this.h !== 'jetpack' ? this.h : '', this.look?.[1] ?? 0, aim); // #2149: a weapon follows the gaze pitch (no new wire field); the saber keeps its swing
    if (aim.R) { hands.R = aim.R; hands.R.at[2] -= 0.05 * sw; if (aim.L) hands.L = aim.L; } // (a small recoil on a shot)
    const showItem = !!this.itemProp && !this.prop && !this.bikeMesh && !(this.hi === 'cue' && this.cue); // (while aiming at the table billiards.js draws their cue, #1637 / #1687) // a weapon or the handlebar has the hands (#1297)
    if (this.itemProp) this.itemProp.visible = showItem;
    const carry = this.carry ??= newCarry();
    if (showItem) { // #2144: both hands / a hanging arm / up to the eyes / following the gaze, by what is held (a plain one-handed thing: out in front as before)
      carryPose(this.hi, this.look?.[1] ?? 0, carry);
      hands.R = carry.R ?? armTarget.forward(-1, 0.04);
      if (carry.L) hands.L = carry.L;
    } else carryPose('', 0, carry);
    if (aim.R) carry.lean = aim.lean; // #2149: leans back looking up / forward looking down (a weapon takes precedence over what is held)
    if (this.waveT > 0) { // (#673) up for the wave, the hand going side to side; down again at the end
      this.waveT = Math.max(0, this.waveT - dt);
      hands.R = armTarget.up(-1, (G.wave - this.waveT) * 11);
    }
    if (this.heldCat.object) Object.assign(hands, this.heldCat.hands());
    this.avatar.setGrip('R', gripFor(showItem || this.cueK?.w > 0.5 ? this.hi : '', this.prop ? this.h : '')); // #2016: the fingers close round what is held (no new wire field: `hi` / `h`)
    Object.assign(hands, this.hands);
    const cueLean = this.poseCue(t, dt, hands); // #2162: aiming at the billiard table: bent over it, the bridge hand near the tip, the stroke hand on the butt
    let mouthHead = 0, mouthLean = 0; // #2160: a sip / bite / toast: the right wrist to the mouth (or the glass up), the head tipped back
    if (this.mouth) {
      const mp = mouthPose(this.mouth.kind, (t - this.mouth.start) / 1000, -1, this.mouthOut ??= { w: 0, hand: { at: [0, 0, 0], pole: [0, 0, 0] }, head: 0, lean: 0 });
      if (!mp) this.mouth = null;
      else { hands.R = blendHand(hands.R ?? armTarget.rest(-1), mp.hand, mp.w); mouthHead = mp.head; mouthLean = mp.lean; }
    }
    let reachCrouch = 0;
    if (this.reach) { // #2161: a door handle / a thing: the free nearer wrist goes to it, the body bends for a low one (skipped when seated, riding or posed)
      const ra = (t - this.reach.start) / 1000;
      if (!(ra < REACH_TOTAL)) this.reach = null;
      else if (!this.pose && !this.gx && !this.bikeMesh && !wet) {
        const rp = reachPose(toFigureFrame(this.reach.world, this.root.position.x, this.root.position.z, this.root.rotation.y + this.avatar.object.rotation.y, this.root.position.y, this.reachLocal ??= [0, 0, 0]), ra, this.reachOut ??= { w: 0, side: -1, hand: { at: [0, 0, 0], pole: [0, 0, 0] }, crouch: 0, lean: 0, head: 0 });
        if (rp) {
          const near = rp.side < 0 ? 'R' : 'L', far = near === 'R' ? 'L' : 'R', key = !hands[near] ? near : !hands[far] ? far : null; // the nearer hand, else the other when it is busy
          if (key) { const sd = key === 'R' ? -1 : 1, h = this.reachHand ??= { at: [0, 0, 0], pole: [0, 0, 0] }, f = sd === rp.side ? 1 : -1;
            for (let i = 0; i < 3; i++) { h.at[i] = rp.hand.at[i]; h.pole[i] = rp.hand.pole[i]; } h.at[0] *= f; h.pole[0] *= f;
            hands[key] = blendHand(armTarget.rest(sd), h, rp.w); }
          reachCrouch = rp.crouch; mouthHead += rp.head; mouthLean += rp.lean;
        }
      }
    }
    let knockCrouch = 0, kp = null;
    if (this.knock) { // #2167: sinking, then toppling away from the shooter; the arms go slack (rest)
      kp = knockPose((t - this.knock.start) / 1000, this.knock.dir, this.knockOut ??= { crouch: 0, lean: 0, head: 0, tilt: 0, axis: [0, 0], lift: 0 });
      if (!kp) this.knock = null;
      else { knockCrouch = kp.crouch; mouthHead += kp.head; mouthLean += kp.lean; hands.R = armTarget.rest(-1); hands.L = armTarget.rest(1); }
    }
    const kiss = this.kiss;
    const age = kiss ? (t - kiss.start) / 1000 : -1, kissed = kissAmount(age);
    if (kiss && age >= KISS.duration) this.kiss = null;
    if (kissed) {
      const direction = Math.atan2(kiss.toward.x - this.root.position.x, kiss.toward.z - this.root.position.z);
      this.avatar.object.rotation.y = lerpAngle(this.avatar.object.rotation.y, direction - this.root.rotation.y, kissed);
    }
    if (hugged) this.poseHug(hug, hugged, hands);
    { // #2174: typing in the chat: the head tips down, the right hand holds a phone up in front of the chest (eases in / out; nothing else may own the body)
      const busy = showItem || !!this.mouth || !!this.reach || this.waveT > 0 || !!this.dance || !!this.cue || !!kp || !!this.heldCat.object;
      const ok = typeAllowed({ bike: !!this.bikeMesh, swim: !!wet, armed: !!this.h, air: !!this.air, gym: !!this.gx, lying: this.pose === 2, knock: !!this.knock, kiss: !!kissed, hug: !!hugged, busy });
      this.typeW = typeStep(this.typeW ?? 0, (!!this.typing || !!this.away) && ok, dt); // (#2216: away looks down at the phone too)
      const tp = typePose(this.typeW, -1, this.typeOut ??= { w: 0, hand: { at: [0, 0, 0], pole: [0, 0, 0] }, head: 0, lean: 0 });
      if (tp) { hands.R = blendHand(hands.R ?? armTarget.rest(-1), tp.hand, tp.w); mouthHead += tp.head; mouthLean += tp.lean; }
      this.avatar.setPhone?.(this.typeW, dt); // #2217: the smartphone in that hand, its screen lighting the face (src/avatarphone.js)
      if (phoneShown(this.typeW)) this.avatar.setGrip('R', 'flat'); // (the phone lies on the open hand)
    }
    const carryOn = !this.pose && !this.gx && !this.bikeMesh && !wet && !this.dance && !this.waveT;
    this.carryLean = easeLean(this.carryLean ?? 0, carryOn ? carry.lean : 0, dt); // #2144: the back-lean under a heavy thing, eased in and out
    let react = null; // #1639
    if (this.react) { const ra = (t - this.react.start) / 1000; if (ra >= REACT.duration) this.react = null; else if (!kissed && !hugged) react = { kind: this.react.kind, age: ra }; }
    const amount = Math.max(kissed, hugged); // (the look and gait give way to either embrace)
    const air = this.pose || this.bikeMesh || amount ? 0 : this.air ?? 0, by = this.body + Math.PI; // #1799: the velocity in the figure's frame (+z forward, +x its left)
    const airV = air ? [vx * Math.cos(by) - vz * Math.sin(by), this.vy ?? 0, vx * Math.sin(by) + vz * Math.cos(by)] : null;
    let gaitDir = null; // #2003: the travel direction in the figure's frame (+z forward, +x its left), so that walking backwards / sideways steps that way
    if (this.speed > AVATAR.walkSpeed && !air) { const gv = this.gaitV ??= [0, 1], hv = Math.hypot(vx, vz); if (hv > 1e-3) { gv[0] = (vx * Math.cos(by) - vz * Math.sin(by)) / hv; gv[1] = (vx * Math.sin(by) + vz * Math.cos(by)) / hv; gaitDir = gv; } }
    const previousFrame = this.motionFrame;
    const groundSpeed = previousFrame && dt > 0 ? Math.hypot(this.root.position.x - previousFrame[0], this.root.position.z - previousFrame[1]) / dt : sp;
    const motionFrame = this.motionFrame ??= [0, 0, 0];
    motionFrame[0] = this.root.position.x; motionFrame[1] = this.root.position.z; motionFrame[2] = by;
    const groundEnabled = !this.pose && !this.gx && !this.bikeMesh && !amount;
    // #2140: the jump pose derives from the vertical speed and the height over the ground; a remote figure's delayed snapshots also show the take-off coming
    const ji = this.jumpArg ??= { vy: 0, height: NaN, ahead: null, off: false, aheadIn: { vy: 0, height: NaN } }, rp = this.root.position;
    ji.vy = this.vy ?? 0; ji.height = this.ground ? finiteOr(rp.y - this.ground(rp.x, rp.z, rp.y + 0.3)) : NaN; ji.off = !!(this.jp || this.pose || this.gx || this.bikeMesh || amount || react || this.dance);
    const nx = this.snaps.length > 1 ? aheadSample(this.snaps, this.playOut.at ?? t - G.delay) : null; // (#2139: from the jitter buffer's playhead)
    ji.ahead = nx ? Object.assign(ji.aheadIn, { vy: nx.vy, height: this.ground ? finiteOr(nx.y - this.ground(nx.x, nx.z, nx.y + 0.3)) : NaN }) : null;
    const sl = this.avatar.sleep ??= newSleep(); // #2163: asleep after a while in pose 2 (eyes shut, slower breath, now and then on the side)
    stepSleep(sl, dt, this.pose === 2 && !this.gx && !this.bikeMesh);
    this.avatar.sleepEyes = sl.eyes;
    this.avatar.collectPose = true;
    const outdoors = wetEnv.outdoorAt(this);
    this.updateOuter(dt, outdoors); // #2147
    this.avatar.updateWeather(outdoors); // #2018
    this.avatar.update(dt, { ground: this.ground, floorY: this.root.position.y, motionFrame, groundSpeed: groundEnabled && groundSpeed <= 8 ? groundSpeed : 0, groundEnabled, gaitDir, speed: this.speed * (1 - amount), turn: turn * (1 - amount), pitch: (this.look?.[1] ?? 0) * (1 - amount) - HUG.head * hugged + mouthHead, hands, crouch: wet ? 0 : Math.max(this.crouch ?? 0, reachCrouch, knockCrouch), dance: !amount && !react ? this.dance || 0 : 0, react, kiss: kissed, kissReach: kiss?.reach ?? 1, kissLift: kiss?.lift ?? 0, air, airV, swim: !!wet && !amount, dive, jump: ji, fwd: groundEnabled && sp <= 8 ? vx * Math.sin(by) + vz * Math.cos(by) : 0 }); // #2159: the playback curve's forward speed (its change leans the body)
    updateFace(this.avatar, dt, { wave: this.waveT > 0, hug: hugged, kiss: kissed, react: react ? REACT.kinds[react.kind]?.id : null, gym: this.gx ? 0.6 + 0.4 * Math.sin(Math.PI * this.gx[1]) : 0, run: this.avatar.gt?.run ?? 0 }); // #2031: the face follows what the figure does
    updateBreath(this.avatar, dt, { run: this.avatar.gt?.run ?? 0, gym: this.gx ? 1 : 0, sleep: sl.depth }, this.self ? null : this); // #2037: the face's run / gym signal: flush, sweat, breath in the cold
    if (wet) sink(this.avatar.swimAmt, this.avatar.swimLine, this.avatar.diveAmt); // (blending in from standing on the bed)
    applyRestPose(this.avatar, this.pose, this.look, react, this.pose === 1 && !this.gx ? this.seatFeet(dt, vx, vz) : this.seatFeet(-1));
    applyGymBodyPose(this.avatar,this.gx,this.look);
    if (this.bikeMesh) { if (this.bikeMesh.userData.scooter) this.poseScooter(); else this.poseBike(dt, Math.hypot(vx, vz), turn, this.vy ?? 0); }
    const poseKey = this.gx || this.bikeMesh || air || wet || amount ? -1 : this.pose || 0;
    const poseFrame = this.poseFrame ??= [0, 0, 0, 0, 1, 1];
    poseFrame[0] = this.root.position.x; poseFrame[1] = this.root.position.y; poseFrame[2] = this.root.position.z;
    poseFrame[3] = by; poseFrame[4] = this.avatar.object.scale.z; poseFrame[5] = this.avatar.object.scale.y;
    transitionPose(this.avatar, dt, poseKey, hands, poseFrame, this.poseCarry, n => this.restKey(n)); // #2163
    this.avatar.collectPose = false;
    if (this.carryLean && this.avatar.pendingPose && !amount && !air) this.avatar.pendingPose.lean += this.carryLean; // #2144
    if (mouthLean && this.avatar.pendingPose && !amount && !air) this.avatar.pendingPose.lean += mouthLean; // #2160
    if (cueLean && this.avatar.pendingPose && !amount && !air && !this.pose) this.avatar.pendingPose.lean += cueLean; // #2162
    poseOlof(this.avatar, this.avatar.pendingPose);
    if (sl.roll || this.sleepRolled) { applySleepRoll(this.avatar.object, sl.roll, REST.avatarLieHip); this.sleepRolled = !!sl.roll; } // #2163
    if (kp && this.knock) { // #2167: where it fell (the old place, in the root's frame), with the heading it had, toppled about its feet
      const o = this.avatar.object, rp = this.root.position, k = this.knock, pos = toFigureFrame(k.at, rp.x, rp.z, this.root.rotation.y, rp.y, this.knockLocal ??= [0, 0, 0]);
      o.rotation.y = k.objYaw + k.yaw - this.root.rotation.y;
      o.quaternion.multiply(tmpQ.setFromAxisAngle(tmpV.set(kp.axis[0], 0, kp.axis[1]), kp.tilt));
      o.position.set(pos[0], pos[1] + kp.lift, pos[2]);
      this.knockTilt = true;
    }
    this.heldCat.update(this.avatar, this.root);
    if (this.tag) {
      const lift = ((this.tagH ?? G.tagHeight) - G.tagHeight) / 2; // #2007: the life row grows the badge upwards; name/score keep their place
      if (this.pose || this.gx) { this.tag.position.copy(this.root.worldToLocal(this.head)); this.tag.position.y += (G.tagY - 1.78) * this.avatar.look.tall + lift; }
      else this.tag.position.set(0, this.tagY + (this.swimDy ?? 0) + lift, 0); // (#1943: over a swimmer's head)
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
      this.root.worldToLocal(this.avatar.gripAt('R', tmpV)); // #2016: where the curled fingers close round it (a compact thing by its middle)
      this.itemProp.position.copy(tmpV).sub(this.itemHold);
      this.itemProp.rotation.x = carry.tilt; // #2144: a torch / spray can / harpoon points where the gaze goes
      if (carry.item) this.itemProp.position.x += carry.item[0], this.itemProp.position.y += carry.item[1], this.itemProp.position.z += carry.item[2]; // #2144: centred between two hands
    }
    if (this.prop && this.prop.name !== 'ghost-prop:jetpack') {
      this.avatar.object.updateMatrixWorld(true);
      this.root.worldToLocal(this.avatar.hand('R', tmpV));
      this.prop.position.copy(tmpV);
      this.prop.rotation.set(-0.6 * sw + (aim.R ? aim.tilt : 0), 1.4 * sw, 0); // #2149: the barrel / bow follows the gaze
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
  constructor({ scene, camera, url, name = () => '', state, active = () => true, weapon = () => '', score = totalScore, onHit = () => {}, onHurt = () => {}, mirrored = () => true, swim = null, ground = null, seatFloor = null }) {
    swimProbe = swim ?? swimProbe; // #1943
    Object.assign(this, { scene, camera, name, state, active, weapon, score, onHit, onHurt, mirrored, mine: null, myGhost: null, rules: null, ws: null, me: null, others: new Map(), sent: null, prev: null,
      lastSent: 0, lastBeat: 0, outbox: [], shots: 0, dropped: 0, greetAt: -1e9, greetsSeen: 0, lastMove: -Infinity, retryAt: 0, backoff: 0, openedAt: 0, connects: 0, messages: 0, resends: 0, resent: null, stateAt: 0 });
    const savedAv = (() => { try { return localStorage.getItem('lunden.avatar'); } catch { return null; } })();
    this.myLook = sessionStartLook(this.name(), savedAv, this.name()); // #2218: an "Olof" name starts as Olof's look
    if (!savedAv) { try { localStorage.setItem('lunden.avatar', encodeAvatarLook(this.myLook)); } catch { /* visit-only */ } }
    this.avatarCode = encodeAvatarWireLook(this.myLook);
    this.sentAv = null;
    this.on = !!url && G.enabled && params.get('mp') !== '0';
    this.url = url ? `${url.replace(/^http/, 'ws')}/players` : '';
    this.group = new THREE.Group();
    this.group.name = 'ghosts';
    scene.add(this.group);
    this.light = new AvatarLight(); // #2017: main.js sets zone / env / lights
    this.breath = new BreathPuffs(this.group, this.light).share(); // #2037: all avatars' breath puffs, one draw call
    this.shadows = new AvatarShadows(this.group); this.ground = ground; this.shadows.ground = ground; // #2010: ground(x, z, feetY) = the walkable height
    this.seatFloor = seatFloor; // #2158: seatFloor(x, z, y) = a vehicle cabin's floor there (world y), else null
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
    const n = this.name() || '', q = new URLSearchParams();
    if (n) q.set('n', n);
    q.set('a', this.awayToken); // #2216: the room knows us again when we come back within AWAY.ms (an old Worker ignores it)
    const ws = new WebSocket(`${this.url}?${q}`);
    this.ws = ws; this.openedAt = performance.now(); this.connects++;
    ws.onmessage = (e) => { if (ws === this.ws) this.message(e.data); };
    ws.onclose = (e) => this.closed(ws, e.code);
  }

  /** #2216: this tab's away token (sessionStorage: kept over a reload of the same tab, not shared with other tabs). */
  get awayToken() {
    if (this.awayTok) return this.awayTok;
    let t = '';
    try { t = cleanAwayToken(sessionStorage.getItem(AWAY.tokenKey)); } catch { /* blocked */ }
    if (!t) { t = newAwayToken(); try { sessionStorage.setItem(AWAY.tokenKey, t); } catch { /* this page load only */ } }
    return (this.awayTok = t);
  }

  /** Our side closes (hidden, start screen, standing still): everyone's ghost goes for us; the others keep ours, away, for AWAY.ms (#2216). */
  disconnect() {
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(AWAY.code, 'away'); } catch { /* not open yet */ } }
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
      if (m.target) this.onTarget?.(m.target, true);
      this.onFootball?.(m.football ?? null,true); // capability guard for an older Worker

      this.onPicnic?.(m.picnic??null,true);
      this.onSharedFish?.(m.sharedFish??null,true);
      this.onSquirrels?.(m.nutDrops??{k:'D',v:0},true);
      if (Array.isArray(m.doors)) this.onDoors?.({ t: 'dr', list: m.doors }); // the doors standing open (#1775, src/doorsync.js)
      this.onMess?.({ t: 'lm', k: 'reset' }); this.onParts?.({ t: 'lx', k: 'reset' }); this.onKitchen?.({ t: 'li', k: 'reset' }); // #1981: the room's kitchen follows in its own messages
      this.onChores?.({ welcome: true }); // #1976: say who we are; the room answers with what it remembers
      this.onThings?.({ welcome: Array.isArray(m.things) ? m.things : [] }); // #1975: the loose things that are not at home (src/thingshare.js)
      if (m.tm) this.onTime?.(m.tm, null); // the room's shared game time (#1774, src/timesync.js)
      for (const p of m.ps ?? []) { const g = this.add(p.i, p.n, p.av && typeof p.ax === 'string' ? p.av + p.ax : p.av); if (g && p.p) g.push(p, t); }
    } else if (m.t === 'j') { if (this.add(m.i, m.n, m.av)) this.notice.joined(m.n); }
    else if (m.t === 's') (this.others.get(m.i) ?? this.add(m.i, '', m.av && typeof m.ax === 'string' ? m.av + m.ax : m.av))?.push(m, t);
    else if (m.t === 'x') { const g = this.others.get(m.i); if (g) this.notice.left(g.name === ANON ? '' : g.name, '', m.aw === 1 ? 0 : undefined); g?.dispose(); this.others.delete(m.i); } // (#2216 aw: their away time already passed: announce now)
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
    else if (m.t === 'cv') this.onConversation?.(m);
    else if (m.t === 'c') { const g = this.others.get(m.i); if (g) { g.startMouth('toast'); this.onToast?.(m, g); } } // a toast (#1222): the room sends it only from within PLAYERS.toastRange
    else if (m.t === 'rx') { const g = this.others.get(m.i); if (g && Number.isInteger(m.k)) { g.startReact(m.k, t); this.onReact?.(m, g); } } // a BIO reaction (#1639): the room sends it only from within PLAYERS.soundRange
    else if (m.t === 'snd') { const g = this.others.get(m.i); if (g && SOUNDS.kinds.includes(m.k)) { if (m.k === 'sip' || m.k === 'bite') g.startMouth(m.k); else this.onPlayerSound?.(m, g); } } // a sound event (#1302): the room sends it only from within PLAYERS.soundRange
    else if (m.t === 'cinema') this.onCinema?.(m);
    else if (m.t === 'snake') this.onSnake?.(m);
    else if (m.t === 'scr') this.onScreen?.(m); // #2241: a computer game's picture from its controller (the room sends it only to that computer's viewers)
    else if (m.t === 'mus') this.onMusic?.(m); // the shared children's-room music (#1624, src/playroommusic.js): only sent to players inside the room
    else if (m.t === 'pc') this.onPicnic?.(m,false);
    else if (m.t === 'df') this.onSharedFish?.(m,false);
    else if (m.t === 'sq') this.onSquirrels?.(m); // the shared squirrels and nuts (#1686, src/squirrelsync.js): only sent to players near them
    else if (m.t === 'tm') this.onTime?.(m, m.i === this.me ? null : this.others.get(m.i) ?? { name: '' }); // (a player we have no pose from yet: no name) // somebody set the game time (#1774, src/timesync.js)
    else if (m.t === 'rf') this.onRiverFish?.(m); // the shared fish in Höje å (#1752, src/riverfishsync.js): the room's clock, seed and caught fish
    else if (m.t === 'pk' || m.t === 'pkg') this.onPaddock?.(m); // the shared pony paddock (#1644, src/paddock.js): only sent to players near it
    else if (m.t === 'ft') this.onFootball?.(m,false);
    else if (m.t === 'tg') this.onTarget?.(m, false);
    else if (m.t === 'dr') this.onDoors?.(m); // a door opened / shut by somebody (#1775, src/doorsync.js)
    else if (m.t === 'ch') this.onChores?.(m); // #1976: a chore's goal completed by somebody / what the room remembers (src/choresync.js)
    else if (m.t === 'lm') this.onMess?.(m); // #1990: crumbs and dust
    else if (m.t === 'lx') this.onParts?.(m); // #1981: the home's other shared state
    else if (m.t === 'li') this.onKitchen?.(m); // #1981: the room's kitchen (src/lifeshare.js)
    else if (m.t === 'th') this.onThings?.(m); // #1975: a loose thing taken / put down / sent home by somebody (src/thingshare.js)
    else if (m.t === 'gf') this.onGraffiti?.(m); // the shared spray paint (#1724, src/graffitisync.js)
    else if (m.t === 'bl') this.onBoule?.(m); // #1854 shared courtyard boule
    else if (m.t === 'pool') this.onPool?.(m); // the shared billiard table (#1355, src/billiards.js): only sent to players inside the children's room
    else if (m.t === 'm' || m.t === 'mx' || m.t === 'k') this.onTalk?.(m, this.others.get(m.i)); // chat (#675) and "skriver…" (#676), src/chat.js
  }

  add(id, name, av = null) {
    if (id === this.me) return null;
    let g = this.others.get(id);
    if (!g && this.others.size < G.max) {
      const look = av ? decodeAvatarLook(av, id) : null;
      g = new Ghost(this.group, id, name, false, look); g.ground = this.ground; g.seatFloor = this.seatFloor; // #2015: the feet follow the stairs / slope; #2158 a seat's floor
      g.shooterAt = (me, at) => this.shooterFor(me, at); // #2167
      g.onAvatar = (av) => (this.far ??= new GhostFar(this.group)).adopt(av); g.onAvatar(g.avatar); // #1966: its body fades into the shared far figure
      if (av) g.avatarCode = av;
      this.others.set(id, g);
    } else if (g && av && av !== g.avatarCode) {
      g.avatarCode = av;
      g.setAvatarLook(decodeAvatarLook(av, id));
    }
    return g ?? null;
  }

  /** #2167: the nearest armed player to `at` other than `ghost` (the other figures and ourselves), as a world { x, z }, or null. */
  shooterFor(ghost, at) {
    const list = this.shooterList ??= [];
    list.length = 0;
    for (const g of this.others.values()) if (g !== ghost && g.h && g.have) list.push(g.root.position);
    if (this.weapon()) list.push(this.camera.position);
    return nearestShooter(at, list);
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
    this.breath.update(dt); // #2037 (last frame's exhales drift and fade)
    const t = performance.now(), s = this.state(), w = this.weapon();
    s.h = COMBAT.weapons.includes(w) ? w : '';
    s.c = s.c === true;
    s.pose = s.pose >= 1 && s.pose <= 3 && Number.isInteger(s.pose) ? s.pose : 0; // 3: long sit (#1237)
    s.sp = s.sp === true;
    s.jp = s.jp === 1 || s.jp === 2 ? s.jp : 0;
    s.dn = s.dn === 1 || s.dn === 2 ? s.dn : 0; // #1622 floss / #1757 Gangnam Style, offered while the playroom music plays
    s.bp = pumpWire(s.bp);s.gx=gymPoseWire(s.gx);s.gxKey=JSON.stringify(s.gx);
    s.am = airMode(s.am); // #1799
    s.hi = cleanHeldCategory(s.hi);
    s.bk = Number.isFinite(s.bk) ? s.bk : null;
    s.sc = Number.isFinite(s.sc) ? s.sc : null; // #2235: the e-scooter's heading
    s.cq = Array.isArray(s.cq) ? s.cq.map((v) => Math.round(v * 100) / 100) : null; // #1637: the billiard cue while aiming / charging
    s.cqKey = s.cq ? s.cq.join() : '';
    s.fb = Array.isArray(s.fb) && s.fb.length === 4 && s.fb.every(Number.isFinite) ? s.fb : null; // #1753: the fishing float while it is out
    s.fbKey = s.fb ? s.fb.join() : '';
    s.look = s.pose !== 2 && Array.isArray(s.look) ? s.look : [0, 0];
    s.catKey = JSON.stringify(s.cat ?? null);
    this.track(s, t);
    if (!this.on) return;
    s.score = badgeScore(this.score());
    const prev = this.prev;
    if (!prev || Math.hypot(s.p[0] - prev.p[0], s.p[1] - prev.p[1], s.p[2] - prev.p[2]) > G.move || Math.abs(s.r - prev.r) > G.turn || s.h !== prev.h || s.hi !== prev.hi || s.c !== prev.c || s.pose !== prev.pose || s.gxKey !== prev.gxKey || Math.abs(s.look[0] - prev.look[0]) > G.turn || Math.abs(s.look[1] - prev.look[1]) > G.turn || s.sp !== prev.sp || s.jp !== prev.jp || s.dn !== prev.dn || s.am !== prev.am || (s.bk === null) !== (prev.bk === null) || (s.sc === null) !== (prev.sc === null) || Math.abs((s.sc ?? 0) - (prev.sc ?? 0)) > G.turn || Math.abs((s.bk ?? 0) - (prev.bk ?? 0)) > G.turn || s.catKey !== prev.catKey || s.cqKey !== prev.cqKey || s.fbKey !== prev.fbKey || this.sentAv !== this.avatarCode) { this.lastMove = t; this.prev = s; }
    if (this.prev?.score !== s.score || this.prev?.bp !== s.bp) this.prev = s; // score changes use the same 5 Hz slot; do not reset movement idle time
    const playing = this.active() && !document.hidden && (this.keepConnected?.() || t - this.lastMove < G.idleMs);
    if (!playing) { if (this.ws) this.disconnect(); }
    else if (!this.ws && !this.capped && t >= this.retryAt) this.connect();
    if (this.connected && !this.sendTalk() && !this.sendShot()) {
      const sent = this.sent, fresh = !sent || sent !== this.prev || this.sentAv !== this.avatarCode;
      // #1759: the last state before we settle is sent once more after G.resendMs: the room drops messages over its per-second
      // limit (a burst after a network stall) and only a later change would correct it. No new activity: lastMove is untouched.
      const again = !fresh && this.resent !== sent && t - this.stateAt >= G.resendMs;
      if (t - this.lastSent >= 1000 / G.hz && (fresh || again)) {
        const p = this.prev ?? s;
        this.ws.send(JSON.stringify({ p: p.p.map((v) => Math.round(v * 100) / 100), r: Math.round(p.r * 100) / 100, score: p.score, ...(p.bp ? { bp: p.bp } : {}), ...(p.gx?{gx:p.gx}:{}), ...(p.h ? { h: p.h } : {}), ...(p.hi ? { hi: p.hi } : {}), ...(p.c ? { c: true } : {}), ...(p.pose ? { pose: p.pose } : {}), ...(p.pose !== 2 ? { look: p.look.map(v => Math.round(v * 100) / 100) } : {}), ...(p.sp ? { sp: true } : {}), ...(p.jp ? { jp: p.jp } : {}), ...(p.dn ? { dn: p.dn } : {}), ...(p.am ? { am: p.am } : {}), ...(p.bk !== null && p.bk !== undefined ? { bk: Math.round(p.bk * 100) / 100 } : {}), ...(p.sc !== null && p.sc !== undefined ? { sc: Math.round(p.sc * 100) / 100 } : {}), ...(p.cat ? { cat: p.cat } : {}), ...(p.cq ? { cq: p.cq } : {}), ...(p.fb ? { fb: p.fb } : {}), ...(this.avatarCode ? avatarWire(this.avatarCode) : {}) }));
        if (fresh) this.stateAt = t;
        this.resent = fresh ? null : p; this.sent = p; this.sentAv = this.avatarCode; this.lastSent = this.lastBeat = t; this.messages++; if (!fresh) this.resends++;
      }
    }
    const eye = this.camera.position, armed = !!s.h;
    this.updateGazes(t, eye);
    for (const g of this.others.values()) { g.draw(t, eye); g.setSolid(armed && !!g.h); if (g.root.visible) { const p = g.root.position; this.light.apply(g.avatar, g.lightSt ??= {}, p.x, p.y, p.z, t); } } // #2017
    if (this.far && (this.others.size || this.far.mesh.visible)) this.far.update(this.others.values(), eye); // #1966
    this.updateKisses(t);
    this.updateHugs(t);
    this.shadows.update(this.others.values(), eye); // #2010
    if (this.onStep || this.onJet) this.soundTick(t);
  }

  /** #2011: every AVATAR_GAZE.retarget s each nearby player looks at the nearest other player (us included, at the camera), the one talking
   * first; nobody in range, or too far away to matter: no target. Local only, nothing is sent. */
  updateGazes(t, eye) {
    if (t - (this.gazeAt ?? -1e9) < AVATAR_GAZE.retarget * 1000) return;
    this.gazeAt = t;
    const cands = this.gazeCands ??= [], me = this.myGhost?.avatar;
    cands.length = 0;
    cands.push({ x: eye.x, y: eye.y, z: eye.z, talking: !!me?.talking, skip: false }); // (0: us)
    const list = [];
    for (const g of this.others.values()) {
      const p = g.root.position, visible = g.root.visible && g.dEye < G.far;
      list.push(g);
      cands.push({ x: p.x, y: p.y + 1.6 * (g.avatar.look?.tall ?? 1), z: p.z, talking: g.avatar.talking, skip: !visible || g.dEye > 60 });
    }
    for (let i = 0; i < list.length; i++) {
      const g = list[i], p = g.root.position;
      if (!g.root.visible || g.dEye > 60) { g.avatar.lookAt(null); continue; }
      cands[i + 1].skip = true; // (not itself)
      const k = chooseGazeTarget(p, cands);
      cands[i + 1].skip = !g.root.visible || g.dEye > 60;
      if (k < 0) g.avatar.lookAt(null); else g.avatar.lookAt(gazePoint.set(cands[k].x, cands[k].y, cands[k].z));
    }
  }

  /** The others' footsteps and jetpack roar (#1302), derived locally from their state (speed, crouch, pose, `bk`, `jp`): no
   * extra traffic and no allocation per frame. `onStep(ghost)` once per stride of a ghost walking on the ground within
   * SOUNDS.range.step; `onJet(ghost)` every SOUNDS.jetEvery s from the SOUNDS.jetNearest nearest thrusting ghosts in range. */
  soundTick(t) {
    const dt = this.soundAt ? Math.min(0.1, (t - this.soundAt) / 1000) : 0;
    this.soundAt = t;
    if (!dt) return;
    for (const g of this.others.values()) {
      if (!g.root.visible || g.dEye > SOUNDS.range.step + SOUNDS.range.jet) { g.stride = 0; g.stepSeen = undefined; continue; }
      if (g.jp === 2 && g.dEye < SOUNDS.range.jet) {
        let nearer = 0;
        for (const o of this.others.values()) if (o !== g && o.jp === 2 && o.dEye < g.dEye) nearer++;
        g.jetT = (g.jetT ?? 0) - dt;
        if (nearer < SOUNDS.jetNearest && g.jetT <= 0) { g.jetT = SOUNDS.jetEvery; this.onJet?.(g); }
      }
      if (g.dEye < SOUNDS.range.step && !g.swim && makesSteps({ speed: g.vh, vy: g.vy, crouch: g.crouch, pose: g.pose, riding: !!g.bikeMesh, jp: g.jp }, SOUNDS)) {
        if (typeof g.avatar?.footfalls === 'number') { // #2003: one step per footfall of the avatar's own gait (its contact phase), so sound and feet stay in step
          const n = g.avatar.footfalls;
          if (g.stepSeen !== undefined && n !== g.stepSeen) this.onStep?.(g);
          g.stepSeen = n;
        } else {
          g.stride = (g.stride ?? 0) + g.vh * dt;
          if (g.stride >= strideFor(g.vh, SOUNDS)) { g.stride = 0; this.onStep?.(g); }
        }
      } else { g.stride = 0; g.stepSeen = undefined; }
    }
  }

  /** Our own BIO reaction (#1639): kind `k` of REACT.kinds (an index, never text) - our mirror image plays it and one small message tells
   * the room, which passes it to the players near us. At most one every REACT.every s (and not while one plays). False when too soon / not connected. */
  react(k) {
    const t = performance.now();
    if (!REACT.kinds[k] || t - (this.reactAt ?? -1e9) < REACT.every * 1000) return false;
    this.reactAt = t;
    this.myReact = { kind: k, start: t };
    if (this.connected) {
      this.outbox.push({ t: 'rx', k });
      this.trimOutbox();
      this.sendShot();
    }
    return true;
  }

  /** Our own sound event (#1302): `k` a key of SOUNDS.kinds (never text). One small message; the room passes it to the players
   * near us. At most one every SOUNDS.every s. False when not connected / too soon. */
  sound(k) {
    const t = performance.now();
    if (!this.connected || !SOUNDS.kinds.includes(k) || t - (this.soundSentAt ?? -1e9) < SOUNDS.every * 1000) return false;
    this.soundSentAt = t;
    this.outbox.push({ t: 'snd', k });
    this.trimOutbox();
    this.sendShot();
    return true;
  }

  /** A billiard table request (#1355) { t: 'pool', k, q, d? }; the room answers the sender (and everybody in the children's room). False when not connected. */
  pool(msg) {
    if (!this.connected) return false;
    this.outbox.push(msg); this.trimOutbox();
    this.lastMove = performance.now(); this.sendShot();
    return true;
  }

  /** #1854: discrete courtyard actions share the existing 5 Hz action outbox. */
  boule(msg) {
    if (!this.connected) return false;
    this.outbox.push(msg); this.trimOutbox();
    this.lastMove = performance.now(); this.sendShot(); return true;
  }

  /** A room-music command (#1624) { t: 'mus', k, ix? }; the room answers everybody inside the children's room. False when not connected. */
  music(msg) {
    if (!this.connected) return false;
    this.outbox.push(msg); this.trimOutbox();
    this.lastMove = performance.now(); this.sendShot();
    return true;
  }

  /** A paddock message (#1644): the leader's pony snapshot / grass mask or a pat { t: 'pk' | 'pkg', … }. Unlike a player's own
   * actions it does not count as activity (a leader standing still may still go idle). False when not connected. */
  paddock(msg) {
    if (!this.connected) return false;
    this.outbox = this.outbox.filter((m) => m.t !== msg.t || m.k !== msg.k); // only the newest snapshot / mask waits
    this.outbox.push(msg);
    this.trimOutbox();
    this.sendShot();
    return true;
  }

  /** A squirrel message (#1686): the leader's pose / nut snapshots ('s' / 'n': only the newest waits) and the one-off take / put / feed events. */
  picnic(msg){if(!this.connected)return false;this.outbox.push(msg);this.trimOutbox();this.lastMove=performance.now();this.sendShot();return true;}
  sharedFish(msg){if(!this.connected)return false;this.outbox.push(msg);this.trimOutbox();this.lastMove=performance.now();this.sendShot();return true;}

  squirrels(msg) {
    if (!this.connected) return false;
    if (msg.k === 's' || msg.k === 'n') this.outbox = this.outbox.filter((m) => m.t !== 'sq' || m.k !== msg.k);
    this.outbox.push(msg);
    this.trimOutbox();
    this.sendShot();
    return true;
  }

  /** #1820: one scored hit; the room owns the target's destination and rotation. */
  target(msg) {
    if (!this.connected) return false;
    this.outbox.push(msg); this.trimOutbox(); this.sendShot(); return true;
  }

  /** #1853 actions share the existing state/shot budget; no ball position stream. */
  football(msg){if(!this.connected)return false;this.outbox.push(msg);this.trimOutbox();this.lastMove=performance.now();this.sendShot();return true;}

  /** #1976: a chore message (src/choresync.js): kept in order. False when not connected. */
  chores(msg) {
    this.lastMove = performance.now(); // (a completed goal is activity: an idle, disconnected player comes back, and the welcome re-sends the day's own goals)
    if (!this.connected) return false;
    this.outbox.push(msg);
    this.trimOutbox();
    this.sendShot();
    return true;
  }

  /** #1981: a batch of the life simulator's changes (src/lifeshare.js) { t: 'li', n, s?, x? }: one at a time (false while the last
   *  one still waits, or when not connected: the caller keeps its changes and tries again). */
  life(msg) {
    if (!this.connected || this.outbox.some((m) => m.t === 'li')) return false;
    this.lastMove = performance.now(); // (handling the food / the dishes is activity)
    this.outbox.push(msg);
    this.trimOutbox();
    this.sendShot();
    return true;
  }

  /** #1981: a part of the home's shared state (src/lifeshare.js LifeParts) { t: 'lx', k, d }: only the newest per part waits. */
  parts(msg) {
    if (!this.connected) return false;
    this.outbox = this.outbox.filter((m) => m.t !== 'lx' || m.k !== msg.k);
    this.outbox.push(msg);
    this.trimOutbox();
    this.sendShot();
    return true;
  }

  /** #1990: changes of the crumbs / dust (src/lifeshare.js MessShare) { t: 'lm', o }: one at a time (false while one waits). */
  messy(msg) {
    if (!this.connected || this.outbox.some((m) => m.t === 'lm')) return false;
    this.outbox.push(msg);
    this.trimOutbox();
    this.sendShot();
    return true;
  }
  /** #1990: are we the one who makes what only one player should make (dust)? The smallest connection id in the room. */
  get first() { if (!this.connected || !this.me) return true; for (const [i, g] of this.others) if (!g.away && String(i) < String(this.me)) return false; return true; } // (#2216: an away player leads nothing)

  /** #1975: a loose thing's take / put / home (src/thingsync.js) { t: 'th', i, k, n, p?, q? }: every one is kept, in order. False when not connected. */
  things(msg) {
    this.lastMove = performance.now(); // (taking / putting down is activity, as the other own actions)
    if (!this.connected) return false;
    this.outbox.push(msg);
    this.trimOutbox();
    this.sendShot();
    return true;
  }

  /** A door message (#1775, src/doorsync.js) { t: 'dr', i, o }: only the newest for a door waits in the outbox. False when not connected. */
  doors(msg) {
    if (!this.connected) return false;
    this.outbox = this.outbox.filter((m) => m.t !== 'dr' || m.i !== msg.i);
    this.outbox.push(msg);
    this.trimOutbox();
    this.sendShot();
    return true;
  }

  /** The game time we just set (#1774, src/timesync.js) { t: 'tm', o, p? }: a one-off event; the room rate-limits it. */
  time(msg) {
    if (!this.connected) return false;
    this.lastMove = performance.now(); // an explicit time edit is activity, like chat/other own actions
    this.outbox.push(msg);
    this.trimOutbox();
    this.sendShot();
    return true;
  }

  /** A river-fish message (#1752, src/riverfishsync.js): 'on' / 'off' and a catch request, all one-off events. */
  riverFish(msg) {
    if (!this.connected) return false;
    this.outbox.push(msg);
    this.trimOutbox();
    this.sendShot();
    return true;
  }

  /** A block of spray paint (#1724, src/graffitisync.js) { t: 'gf', s }: one waits at a time in the 5 Hz budget, and it does not count as
   * activity. False when not connected or a block is still waiting (the caller sends it later). */
  graffiti(msg) {
    if (!this.connected || this.outbox.some((m) => m.t === 'gf')) return false;
    this.outbox.push(msg);
    this.trimOutbox();
    this.sendShot();
    return true;
  }

  /** Shared cinema requests are event-driven and use the existing bounded outbox. */
  cinema(msg) {
    if (!this.connected) return false;
    this.outbox.push(msg); this.trimOutbox(); this.lastMove = performance.now(); this.sendShot(); return true;
  }

  /** #2241: a computer game's picture { t: 'scr', screen, … } for the onlookers: only the newest per screen waits (a snapshot, the
   * next replaces it), in the shared GHOSTS.hz budget; not activity. False when not connected. */
  screen(msg) {
    if (!this.connected) return false;
    this.outbox = this.outbox.filter((m) => m.t !== 'scr' || m.screen !== msg.screen);
    this.outbox.push(msg); this.trimOutbox(); this.sendShot(); return true;
  }

  /** #2241: does another (not away) player's last known feet position pass `test` ([x, y, z])? */
  near(test) { for (const g of this.others.values()) if (!g.away && g.lastP && test(g.lastP)) return true; return false; }

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
    const m = this.mine ??= { p: new THREE.Vector3(...s.p), vx: 0, vy: 0, vz: 0, t, r: s.r, h: '' };
    const dt = (t - m.t) / 1000;
    if (dt > 0) {
      const vx = (s.p[0] - m.p.x) / dt, vz = (s.p[2] - m.p.z) / dt, far = Math.hypot(vx, vz) > 12; // (a jump: a teleport, not a run)
      const k = Math.min(1, dt * 8);
      m.vx += ((far ? 0 : vx) - m.vx) * k; m.vz += ((far ? 0 : vz) - m.vz) * k;
      const vy = (s.p[1] - m.p.y) / dt; m.vy += ((far || Math.abs(vy) > 12 ? 0 : vy) - m.vy) * k; // (#1799: the climbing steps follow it)
    }
    m.gx=s.gx; m.bp = s.bp; m.p.set(...s.p); m.r = s.r; m.h = s.h; m.hi = s.hi; m.c = s.c; m.pose = s.pose; m.look = s.look; m.sp = s.sp; m.jp = s.jp; m.dn = s.dn; m.am = s.am; m.bk = s.bk; m.sc = s.sc; m.cat = s.cat; m.t = t;
  }

  /** Our avatar for the mirrors: one per name (the look comes from it); shared by mirrors and the resting first-person view. */
  selfGhost() {
    const n = this.name() || '';
    const key = `${n}:${this.avatarCode}`;
    if (!this.myGhost || this.myGhost.key !== key) { this.myGhost?.dispose(); this.myGhost = new Ghost(this.group, 'me', n, true, this.myLook); this.myGhost.ground = this.ground; this.myGhost.seatFloor = this.seatFloor; this.myGhost.key = key; }
    this.myGhost.pump = pumpWire(this.mine?.bp); this.myGhost.avatar.setPump(this.myGhost.pump);
    return this.myGhost;
  }

  /** Our mirror image says `text` (#1122: a sent chat line moves its mouth for as long as a bubble would show). */
  selfTalk(text) { this.selfGhost().avatar.talk(text, CHAT.bubbleTtl); }

  /** The mirror's pass is about to draw (reflections.js): put our solid avatar where we stand. */
  beforeMirror() {
    const g = this.myGhost;
    this.mirrorSelfView = { visible: g?.root.visible ?? false, body: this.selfBody, arms: this.selfArms,
      typing: g?.typingSprite?.visible ?? false };
    // A reflector can exit early; afterMirror always restores this exact view in its finally block.
    this.setSelfView(false);
    if (this.mine && this.mirrored()) this.showSelf(true);
    else if (g) g.root.visible = false;
  }

  afterMirror() {
    const view = this.mirrorSelfView;
    this.mirrorSelfView = null;
    this.setSelfView(!!view?.body, !!view?.arms);
    if (this.myGhost) {
      this.myGhost.root.visible = view?.visible ?? false;
      if (this.myGhost.typingSprite) this.myGhost.typingSprite.visible = view?.typing ?? false;
    }
  }

  /** First-person body only: the camera already owns held objects, hands and their accessories. */
  setSelfView(body = false, arms = false, near = 0) {
    for (const [object, visible] of this.selfHidden ?? []) object.visible = visible;
    this.selfHidden = [];
    this.selfBody = body; this.selfArms = arms;
    const g = this.myGhost;
    if (!g) return;
    g.avatar.material.userData.u.uSelfView.value.set(body ? (near > 0 ? 2 + near : 1) : 0, body && arms ? 1 : 0);
    if (body) g.root.traverse(object => {
      if ((object.isMesh || object.isSprite || object.isPoints) && object !== g.mesh) {
        this.selfHidden.push([object, object.visible]); object.visible = false;
      }
    });
  }

  /** Pose even with no nearby mirror. Root/heading come from restState, never camera yaw. */
  showRestBody(rest, stand = null) {
    if (!restBodyReady(rest, this.active()) && stand && standBodyReady(this.mine, { ...stand, playing: this.active(), rest: rest.active })) return this.showStandBody();
    if (!restBodyReady(rest, this.active()) || !this.mine || this.mine.gx || ![1, 2, 3].includes(this.mine.pose)) {
      if (this.myGhost) this.myGhost.firstRestSpot = null;
      this.showSelf(false); return;
    }
    const g = this.selfGhost();
    // Entry has already eased the eye. Do not retain a previous standing/mirror pose at dt=0.
    if (g.firstRestSpot !== rest.spot || g.pose !== this.mine.pose) g.avatar.poseMotion = null;
    g.firstRestSpot = rest.spot;
    g.body = this.mine.r;
    this.showSelf(true);
    this.setSelfView(true, true); // the existing first-person Hand owns arms; no open shoulder sections at the eye
  }

  /** #2145: standing, walking or crouching: the ordinary animated self (gait, steps, crouch) with head and arms clipped (setSelfView). */
  showStandBody() {
    const g = this.selfGhost();
    g.firstRestSpot = null;
    this.showSelf(true);
    standRoot(this.mine.p, this.mine.r, g.crouch ?? 0, this.standAt ??= { x: 0, z: 0 });
    g.root.position.x = this.standAt.x; g.root.position.z = this.standAt.z;
    this.setSelfView(true, true, SELF_STAND.near);
  }

  /** Show our solid avatar directly (third-person view during BIO reactions, #1869). */
  showSelf(show = true) {
    this.setSelfView(false);
    if (!show) { if (this.myGhost) this.myGhost.root.visible = false; return; }
    const m = this.mine;
    if (!m) return;
    const g = this.selfGhost();
    g.setHeld(m.h);
    g.setItem(m.hi);
    g.heldCat.set(m.cat, g.root);
    g.pose = m.pose; g.gx = m.gx;
    g.look = m.look;
    g.avatar.setSuit(m.sp);
    g.setJetpack(m.jp);
    g.dance = m.dn === 1 || m.dn === 2 ? m.dn : 0;
    g.air = m.am; g.vy = m.vy;
    g.react = this.myReact ?? null;
    g.root.position.copy(m.p);
    if (m.sc != null) g.root.position.y += SCOOTER.deck; // #2229: standing on an e-scooter's deck (`sc`: the scooter's heading, which the peers get as the prop; the own scooter stands in the world, so the mirror draws no second one)
    this.light.apply(g.avatar, g.lightSt ??= {}, m.p.x, m.p.y, m.p.z, performance.now()); // #2017
    g.root.rotation.y = m.r;
    g.bikeAt({ bk: m.bk }, { bk: m.bk }, 1);
    const now = performance.now(), goal = m.c ? 1 : 0, last = g.mirrorAt ?? -Infinity;
    g.mirrorAt = now;
    g.crouch = now - last < 250 ? THREE.MathUtils.clamp(goal, (g.crouch ?? goal) - (now - last) / 1000 / AVATAR_CROUCH.time, (g.crouch ?? goal) + (now - last) / 1000 / AVATAR_CROUCH.time) : goal;
    g.root.visible = true;
    g.mirrorTyping(!!this.mirrorTyping?.(now), now);
    g.animate(now, 0, m.sc != null ? 0 : m.vx, m.sc != null ? 0 : m.vz); // (#2229: on a scooter the legs stand still)
  }

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
    const rows = playerChoices(this.name(), g.name).map(id => {
      const ok = id === 'greet' || (id === 'hug' ? this.canHug(g) : this.canKiss(g));
      return { id, label: `${labels[id]} ${g.name}`, ...(ok ? {} : { reason: 'gå närmare' }), ...(id === 'greet' ? {} : { noReach: true }), run: () => this.onChoose?.(g, id) };
    });
    return this.conversation?.rows(g, rows) ?? rows;
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
    this.trimOutbox();
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
    this.trimOutbox();
    this.sendShot();
    return true;
  }

  /** A shot (#667): { w, o: [x, y, z], d: [dx, dy, dz] unit, s?: speed, to?: the id it hit }, every one, misses too, so
   * the others can draw it. Shots share the GHOSTS.hz budget with the states and go first; at most GHOSTS.outbox wait
   * (when full: a waiting snapshot first, then the oldest miss, never a hit before a miss; src/outbox.js #1777). */
  fire(shot) {
    if (!this.connected) return false;
    const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
    this.outbox.push({ t: 'a', w: shot.w, o: shot.o.map(r2), d: shot.d.map(r3), ...(shot.s ? { s: r2(shot.s) } : {}), ...(shot.to ? { to: shot.to } : {}), ...(shot.hc ? { hc: [shot.hc[0], ...shot.hc.slice(1).map(r3)] } : {}) });
    this.trimOutbox();
    this.sendShot();
    return true;
  }

  /** #1763: a changed state has waited G.stateEvery ms since the last one: it takes the next slot of the GHOSTS.hz budget, before
   * the chat and the outbox (the squirrel / paddock leader's snapshots otherwise took nearly every slot and the others saw us lag).
   * Shots ('a', a rifle hit every 0.25 s) and the fall / consume claims keep going first: they are the game's own outcome. */
  stateDue(t) { return (!this.sent || this.sent !== this.prev || this.sentAv !== this.avatarCode) && t - this.stateAt >= G.stateEvery; }

  /** #1777: keep the outbox within GHOSTS.outbox (src/outbox.js: snapshots go first, the player's own actions wait up to GHOSTS.outboxHard). */
  trimOutbox() { this.dropped += trimOutbox(this.outbox, G.outbox, G.outboxHard).length; }

  sendShot() {
    const t = performance.now();
    if (!this.outbox.length || !this.connected || t - this.lastSent < 1000 / G.hz) return false;
    const at = this.stateDue(t) ? this.outbox.findIndex((m) => URGENT.has(m.t)) : 0; // #1777: an urgent one behind a snapshot goes too
    if (at < 0) return false;
    const message = this.outbox.splice(at, 1)[0];
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
    if (!this.talkbox?.length || !this.connected || t - this.lastSent < 1000 / G.hz || this.stateDue(t)) return false;
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
    return [...this.others.values()].map((g) => ({ id: g.id, name: g.name, away: !!g.away, score: g.score, lives: g.lives, lifeShown: g.badge.lives !== null, visible: g.root.visible, tag: g.tag.visible,
      pos: g.root.position.toArray().map((v) => Math.round(v * 100) / 100), opacity: COMBAT.solid, outline: false, speed: Math.round(g.speed * 100) / 100, h: g.h, solid: g.solid }));
  }
}
