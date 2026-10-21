import * as THREE from 'three';
import { PLAYROOM as R } from './config.js';

// Local clubhouse entertainment (#1365). Two small canvases, no media requests,
// audio, additional lights or keyboard capture. E/touch uses the ordinary focus.
export class PlayroomDevices {
  constructor(onSwitch) {
    this.object = new THREE.Group();
    this.pickables = [];
    this.onSwitch = onSwitch;
    this.active = false;
    this.time = 0;
    this.redraw = 0;
    this.tvOn = this.pcOn = false;
    this.playing = false;
    this.round = this.hits = 0;
    this.cursor = 0;
    this.result = '';
    const F = R.furniture, tv = F.tv;
    const screen = (name, w, h, x, y, z, facing, use, verb) => {
      const canvas = document.createElement('canvas');
      [canvas.width, canvas.height] = R.devices.canvas;
      if(name==='bioduken')canvas.height=Math.round(canvas.width*h/w); // Match the wide physical screen without stretching its poster.
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
      mesh.position.set(R.x + x, y, R.z + z); mesh.rotation.y = facing;
      this.object.add(mesh);
      const target = { kind: 'playroomDevice', name, get verb() { return verb(); }, use };
      this.pick(target, x, y, z, R.devices.pickDepth, h, w);
      return { canvas, ctx: canvas.getContext('2d'), texture, mesh, target };
    };
    this.tv = screen('bioduken', tv.w, tv.h, tv.x + 0.08, tv.y + tv.h / 2, F.cinema.screen.z, Math.PI / 2,
      () => { this.onVideoRequest?.(); return 'Välj film i bion'; }, () => 'välja film på');
    this.cinemaTarget = this.tv.target;
    this.pc = screen('datorn', 0.56, 0.34, F.desk.x + 2.939, 0.89, F.desk.z + 1, -Math.PI / 2,
      () => this.play(), () => !this.pcOn ? 'starta' : this.playing ? 'stoppa markören på' : 'spela på');
    this.powerTarget = { kind: 'playroomDevice', name: 'datorns spelbox', get verb() { return self.pcOn ? 'stänga av' : 'starta'; }, use: () => this.power('pc', !this.pcOn) };
    const self = this;
    // The white/blue box beside the monitor is the separate power control.
    this.pick(this.powerTarget, F.desk.x + 2.985, 0.62, F.desk.z + 1.5, 0.3, 0.12, 0.26);
    this.draw();
  }

  pick(target, x, y, z, w, h, d) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    mesh.position.set(R.x + x, y, R.z + z); mesh.userData.door = target;
    target.pickable = mesh; this.pickables.push(mesh); this.object.add(mesh);
  }

  power(device, on) {
    this[`${device}On`] = !!on;
    if (device === 'pc') { this.playing = false; this.result = ''; }
    this.draw(); this.onSwitch?.(device, !!on);
    return `${device === 'tv' ? 'TV:n' : 'Datorn'} är ${on ? 'på' : 'av'}`;
  }

  play() {
    if (!this.pcOn) return this.power('pc', true);
    if (!this.playing) {
      this.playing = true; this.cursor = 0; this.elapsed = 0; this.result = '';
      this.draw(); return 'Stoppa markören i det gröna fältet med E eller tryck';
    }
    this.playing = false; this.round++;
    const hit = Math.abs(this.cursor - 0.5) <= R.devices.targetHalf;
    if (hit) this.hits++;
    this.result = hit ? 'TRÄFF!' : 'Försök igen!';
    this.draw(); return `${this.result} ${this.hits} träffar på ${this.round} försök`;
  }

  setInside(on) {
    this.active = on;
    if (!on) {
      this.onLeave?.();
      if (this.tvOn) this.power('tv', false);
      if (this.pcOn) this.power('pc', false);
    }
  }

  update(dt) {
    if (!this.active || (!this.tvOn && !this.pcOn)) return;
    this.time += dt;
    if (this.playing) {
      this.elapsed += dt;
      const phase = (this.elapsed / R.devices.sweepSeconds) % 2;
      this.cursor = phase <= 1 ? phase : 2 - phase;
    }
    this.redraw += dt;
    if (this.redraw >= 1 / R.devices.fps) { this.redraw = 0; this.draw(); }
  }

  draw() {
    for (const [key, s] of [['tv', this.tv], ['pc', this.pc]]) {
      const c = s.ctx, w = s.canvas.width, h = s.canvas.height;
      c.fillStyle = '#080e18'; c.fillRect(0, 0, w, h);
      c.textAlign = 'center';
      const text = (str, y, size = 24, color = '#f6f1dc') => { c.fillStyle = color; c.font = `bold ${size}px sans-serif`; c.fillText(str, w / 2, y); };
      if (key === 'tv') {
        text('BION', h * 0.35, 48, '#ffe094');
        text('Vad vill du se?', h * 0.56, 28);
        text('E / tryck på duken för filmförslag', h * 0.78, 22, '#a5bdd4');
      } else if (!this.pcOn) {
        text('DATOR · AV', h * 0.42, 30, '#7890a8');
        text('E / tryck för att starta', h * 0.65, 22);
      } else {
        text('PRICKA GRÖNT', 43, 32, '#8df1d2');
        text(`${this.hits} träffar / ${this.round} försök`, 79, 23);
        const left = w * 0.1, bar = w * 0.8, y = h * 0.45;
        c.fillStyle = '#34455c'; c.fillRect(left, y, bar, 40);
        c.fillStyle = '#48c584'; c.fillRect(left + bar * (0.5 - R.devices.targetHalf), y, bar * R.devices.targetHalf * 2, 40);
        c.fillStyle = '#fff0a8'; c.fillRect(left + bar * this.cursor - 4, y - 10, 8, 60);
        text(this.result || (this.playing ? 'Stoppa i det gröna fältet!' : 'Redo att spela?'), h * 0.75, 25);
        text(this.playing ? 'E / tryck på skärmen: stoppa' : 'E / tryck på skärmen: spela', h - 39, 22);
        text('Stäng av med den vita spelboxen', h - 12, 18, '#a5bdd4');
      }
      s.texture.needsUpdate = true;
    }
  }
}
