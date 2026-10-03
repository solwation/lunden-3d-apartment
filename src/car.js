import * as THREE from 'three';
import { CAR as C, REST } from './config.js';
import { buildCar, MEGANE, drawScreen, SCREEN_BUTTONS } from './carmodel.js';
import { sfx } from './audio.js';
import { CarRadio } from './sonos.js';

// Our car (#173): a white Renault Megane E-Tech, called by the key in the hall. State 'gone' → press → 'arriving'
// (east along our lane, in through the gap in the shrubs, slowing to a stop right outside our door, #208) →
// 'parked' (a collision box) → press → 'leaving' (round in the yard, out the same gap, west out of sight) → 'gone'. A press while it drives is
// ignored. It waits rather than drive into the visitor. Built facing local +x; y = 0 is the road.

/** Waypoints → a polyline with the corners rounded off (Chaikin, the ends kept) + cumulative lengths. */
function smooth(wp) {
  let pts = wp.map((p) => [...p]);
  for (let it = 0; it < 4; it++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      if (i > 0) out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25]);
      if (i < pts.length - 2) out.push([ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    out.push(pts.at(-1));
    pts = out;
  }
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, len };
}

function plateTexture(text) {
  const c = document.createElement('canvas'); c.width = 520; c.height = 110;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, 520, 110);
  g.fillStyle = '#1f3f9a'; g.fillRect(0, 0, 62, 110);       // the EU strip
  g.fillStyle = '#f2d21b'; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.arc(31 + Math.cos(a) * 17, 36 + Math.sin(a) * 17, 3, 0, 7); g.fill(); }
  g.fillStyle = '#fff'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillText('S', 31, 96);
  g.fillStyle = '#111'; g.font = 'bold 82px "DejaVu Sans", Arial, sans-serif'; g.fillText(text, 290, 85);
  g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(3, 3, 514, 104);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const DOOR_NAMES = { '1,-1': 'förardörren', '1,1': 'passagerardörren', '0,-1': 'bakdörren', '0,1': 'bakdörren' };

export class Car {
  constructor() {
    // the body, doors, cabin and wheels (#250, carmodel.js); built facing +x, y = 0 the road
    const m = buildCar(MEGANE, { doors: true, paint: C.color }), g = m.group, L = C.l;
    this.lightMat = m.materials.led;
    this.tailMat = m.materials.tail;
    this.blinkMat = m.materials.blink;
    this.screenMat = m.materials.screen;
    const plate = new THREE.MeshStandardMaterial({ map: plateTexture(C.plate), roughness: 0.5 });
    this.plates = [];
    for (const [x, y, ry] of [[L / 2 + 0.065, 0.46, Math.PI / 2], [-L / 2 - 0.065, 0.6, -Math.PI / 2]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), plate); p.position.set(x, y, 0); p.rotation.y = ry; g.add(p); this.plates.push(p);
    }
    this.wheels = m.wheels;
    // the doors: E on one opens / closes it while the car is parked
    this.doors = m.doors.map((d) => {
      const name = DOOR_NAMES[`${d.front ? 1 : 0},${d.side}`];
      const door = { ...d, name, kind: 'cardoor', pickable: d.pivot, car: this,
        get isOpen() { return this.target > 0; },
        toggle: () => this.toggleDoor(door) };
      d.pivot.traverse((o) => { o.userData.door = door; });
      return door;
    });
    // the front seats: E sits you down (rest.js) while that side's front door is open — or you are already in it
    this.seats = m.seats.map((s) => {
      const pick = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.5), new THREE.MeshBasicMaterial());
      pick.position.set(s.x - 0.1, s.y + 0.15, s.z); pick.visible = false; g.add(pick);
      const car = this, side = Math.sign(s.z);
      const target = { kind: 'rest', rest: 'sit', name: s.name, verbText: 'sätta dig i', pickable: pick, level: 0, seat: s, car: this,
        get verb() { return this.verbText; },
        get door() { return car.doors.find((d) => d.front && d.side === side); },
        get spots() { return [car.spot(s)]; } };
      pick.userData.door = target;
      return target;
    });
    // music (#268): the centre screen is a target while you sit in a front seat; its own canvas shows "now playing"
    this.radio = new CarRadio();
    this.screenCanvas = document.createElement('canvas'); this.screenCanvas.width = 512; this.screenCanvas.height = 160;
    drawScreen(this.screenCanvas.getContext('2d'));
    const tex = new THREE.CanvasTexture(this.screenCanvas); tex.colorSpace = THREE.SRGBColorSpace;
    this.screenMat.emissiveMap = tex; this.screenTex = tex;
    const half = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.19), new THREE.MeshBasicMaterial()); // the centre half of the sheet
    half.position.set(0.155, 0, 0.004); half.visible = false; m.screen.add(half);
    const radio = this.radio, car = this;
    this.musicTarget = { kind: 'carmusic', name: '', pickable: half, car: this, button: null,
      get verb() {
        if (this.button === 'next') return radio.playing ? 'byta till nästa låt' : 'spela nästa låt';
        if (this.button === 'prev') return radio.playing ? 'byta till förra låten' : 'spela förra låten';
        return radio.playing ? 'stänga av musiken' : 'sätta på musik';
      },
      /** Where on the screen the look ray is (main.js, each frame): the button row's ⏮ ⏯ ⏭, or anywhere else = on/off. */
      aimAt(p) {
        const q = half.worldToLocal(p.clone()), x = 256 + (q.x / 0.31 + 0.5) * 256, y = (0.5 - q.y / 0.19) * 160;
        this.button = y < SCREEN_BUTTONS ? null : x < 262 + 244 / 3 ? 'prev' : x > 262 + 488 / 3 ? 'next' : null;
      },
      toggle() { if (this.button) radio.next(this.button === 'next' ? 1 : -1); else radio.toggle(); car.drawScreen(); } };
    half.userData.door = this.musicTarget;
    this.screenT = 0; this.shown = null;
    g.visible = false;
    g.userData.moving = true; // it drives while the visitor stands still: the detail culler judges it every update (#267)
    this.object = g;
    Object.assign(this, { state: 'gone', d: 0, speed: 0, blinkT: 0, hum: null, path: null, plateText: C.plate, leaveWhenShut: false, awake: 0 });
  }

  /** The rest spot of seat `s` (world): eye over the cushion, looking forward along the car. */
  spot(s) {
    this.object.updateMatrixWorld();
    const pos = new THREE.Vector3(s.x, s.y + REST.sitEye, s.z).applyMatrix4(this.object.matrixWorld);
    const yaw = this.object.rotation.y - Math.PI / 2; // the camera's yaw looking along local +x
    return { kind: 'sit', pos, yaw, aimPos: null, car: true };
  }

  /** E targets while parked: the doors, and the front seats whose door is open (`seated`: the target sat in now);
   * sitting in a front seat, the centre screen (music, #268). */
  targets(seated = null) {
    if (this.state !== 'parked') return [];
    return [...this.doors, ...this.seats.filter((t) => t.door.isOpen || t === seated), ...(seated?.car === this ? [this.musicTarget] : [])];
  }

  /** The centre screen: "now playing" while the music is on, else the map (only redrawn when something changed). */
  drawScreen() {
    const np = this.radio.playing ? this.radio.nowPlaying : null, key = np ? `${np.name}|${np.time}` : 'map';
    if (key === this.shown) return;
    this.shown = key;
    drawScreen(this.screenCanvas.getContext('2d'), np);
    this.screenTex.needsUpdate = true;
  }

  toggleDoor(door) {
    if (this.state !== 'parked') return;
    const open = door.target === 0;
    door.target = open ? C.doorOpen : 0;
    sfx.carDoor(door.pivot.getWorldPosition(new THREE.Vector3()), open);
  }

  get doorsShut() { return this.doors.every((d) => d.target === 0 && d.angle < 0.01); }

  /** The key was pressed. */
  call() {
    if (this.state === 'gone') { this.path = this.arrival(); this.d = 0; this.state = 'arriving'; this.speed = C.speed; this.object.visible = true; this.hum = sfx.evHum(this.object.position); }
    else if (this.state === 'parked') {
      if (!this.doorsShut) { for (const d of this.doors) if (d.target > 0) this.toggleDoor(d); this.leaveWhenShut = true; return; } // shut the doors first
      this.leave();
    }
    this.place();
  }

  leave() { this.radio.stop(); this.path = this.departure(); this.d = 0; this.state = 'leaving'; this.speed = 0; this.blinkT = 1.2; this.hum = sfx.evHum(this.object.position); this.place(); }

  /** Parked in front of the house at once (&car, screenshots). */
  park() { this.path = this.arrival(); this.d = this.total(); this.state = 'parked'; this.object.visible = true; this.place(); }

  arrival() { return smooth(C.arrive); }
  departure() { return smooth(C.leave); }

  total() { return this.path.len.at(-1); }

  /** Position + heading at distance d along the path. */
  at(d) {
    const { pts, len } = this.path;
    let k = 1;
    while (k < pts.length - 1 && len[k] < d) k++;
    const [ax, az] = pts[k - 1], [bx, bz] = pts[k], u = Math.min(1, Math.max(0, (d - len[k - 1]) / (len[k] - len[k - 1] || 1)));
    return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, yaw: Math.atan2(-(bz - az), bx - ax) }; // local +x along the way
  }

  place() {
    const p = this.at(this.d);
    this.object.position.set(p.x, 0, p.z);
    this.object.rotation.y = p.yaw;
  }

  /** Is the visitor standing in the way just ahead? */
  blocked(player) {
    if (!player) return false;
    const yaw = this.object.rotation.y, fx = Math.cos(yaw), fz = -Math.sin(yaw);
    const dx = player.pos.x - this.object.position.x, dz = player.pos.z - this.object.position.z;
    const ahead = dx * fx + dz * fz, side = Math.abs(-dx * fz + dz * fx);
    return ahead > 0 && ahead < C.l / 2 + 3 && side < C.w / 2 + 0.6;
  }

  update(dt, night, player) {
    this.blinkT = Math.max(0, this.blinkT - dt);
    this.blinkMat.emissiveIntensity = this.blinkT > 0 && Math.floor(this.blinkT * 3) % 2 === 0 ? 2.5 : 0;
    this.lightMat.emissiveIntensity = night ? 2.2 : 0.3;
    this.tailMat.emissiveIntensity = night ? 1.2 : 0.2;
    // the doors swing (eased), the screens wake while a door is open or someone sits inside
    for (const d of this.doors) {
      d.angle += (d.target - d.angle) * Math.min(1, dt * 7);
      d.pivot.rotation.y = d.side * d.angle;
    }
    this.awake = Math.max(0, this.awake - dt);
    if (this.doors.some((d) => d.target > 0) || this.occupied || this.radio.playing) this.awake = 20;
    // the music (#268): from the dashboard, clear inside, muffled through the doors; the screen follows it
    this.screenT -= dt;
    if (this.screenT <= 0 || (this.shown === 'map') === this.radio.playing) { this.screenT = C.music.redraw; this.drawScreen(); }
    if (this.radio.playing) {
      const [dx, dy, dz] = C.music.dash;
      this.object.updateMatrixWorld();
      this.radio.update(new THREE.Vector3(dx, dy, dz).applyMatrix4(this.object.matrixWorld), !!this.occupied, this.doors.some((d) => d.angle > 0.15));
    }
    this.screenMat.emissiveIntensity += ((this.awake > 0 ? 0.9 : 0) - this.screenMat.emissiveIntensity) * Math.min(1, dt * 3);
    if (this.leaveWhenShut && this.doorsShut) { this.leaveWhenShut = false; this.leave(); }
    if (this.state !== 'arriving' && this.state !== 'leaving') return;
    const left = this.total() - this.d;
    let want = C.speed;
    if (this.state === 'arriving') want = Math.min(C.speed, Math.max(0.4, Math.sqrt(2 * C.brake * left)));
    if (this.blocked(player)) want = 0; // never into the visitor
    this.speed += Math.sign(want - this.speed) * Math.min(Math.abs(want - this.speed), C.brake * 1.5 * dt);
    this.d = Math.min(this.total(), this.d + this.speed * dt);
    for (const w of this.wheels) w.rotation.z -= (this.speed * dt) / MEGANE.wheelR;
    this.place();
    this.hum?.move(this.object.position, this.speed);
    if (this.d >= this.total() - 1e-6) {
      this.hum?.stop(); this.hum = null; this.speed = 0;
      if (this.state === 'arriving') { this.state = 'parked'; this.blinkT = 1.2; } // blinks twice as it stops
      else { this.state = 'gone'; this.object.visible = false; }
    }
  }

  /** Its box while parked (plan x/z, roof height y1) — weather.js keeps the rain out of it. */
  box() {
    if (this.state !== 'parked') return [];
    const { x, z } = this.object.position;
    return [{ x0: x - C.l / 2, x1: x + C.l / 2, z0: z - C.w / 2, z1: z + C.w / 2, y1: C.h }];
  }

  /** Collision while parked (world segments, plan x/z). */
  segments() {
    if (this.state !== 'parked') return [];
    const { x, z } = this.object.position, hx = C.l / 2, hz = C.w / 2;
    const c = [[x - hx, z - hz], [x + hx, z - hz], [x + hx, z + hz], [x - hx, z + hz]];
    return c.map((p, i) => [...p, ...c[(i + 1) % 4]]);
  }
}
