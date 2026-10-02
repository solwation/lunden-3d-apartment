import * as THREE from 'three';
import { DRAWING as D, LEVELS } from './config.js';
import { sfx } from './audio.js';

// Drawing with crayons on a sheet of paper on the desk in Sovrum 3 (#93). The sheet is a canvas texture;
// strokes are many small, slightly scattered semi-transparent dabs (a crayon on paper), drawn only while
// you draw. In drawing mode the camera hangs over the sheet looking straight down; the pointer is free
// and maps onto the sheet through a raycast. The drawing is saved in localStorage.

const KEY = 'lunden.drawing';

export class Drawing {
  constructor(scene, camera) {
    Object.assign(this, { scene, camera, active: false, t: 0, color: D.colors[4], last: null, down: false, strokes: 0, sound: 0 });
    const c = document.createElement('canvas');
    c.width = D.px; c.height = Math.round(D.px * D.h / D.w);
    this.canvas = c;
    this.ctx = c.getContext('2d');
    this.clear(false);
    try { const saved = localStorage.getItem(KEY); if (saved) { const img = new Image(); img.onload = () => { this.ctx.drawImage(img, 0, 0); this.tex.needsUpdate = true; }; img.src = saved; } } catch { /* blocked */ }
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    const y = LEVELS[D.level].floor + 0.76 + 0.002;
    this.paper = new THREE.Mesh(new THREE.PlaneGeometry(D.w, D.h).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.95 }));
    this.paper.position.set(D.x, y, D.z);
    this.paper.receiveShadow = true;
    scene.add(this.paper);
    this.target = { name: 'pappret', kind: 'paper', verb: 'rita på', pickable: this.paper };
    this.paper.userData.door = this.target;
    this.ray = new THREE.Raycaster();
    this.view = { pos: new THREE.Vector3(D.x, y + D.eye, D.z), yaw: 0, pitch: -Math.PI / 2 };
  }

  clear(save = true) {
    const g = this.ctx;
    g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.strokeStyle = 'rgba(0,0,0,0.05)'; g.lineWidth = 2; g.strokeRect(1, 1, this.canvas.width - 2, this.canvas.height - 2);
    if (this.tex) this.tex.needsUpdate = true;
    if (save) this.save();
  }

  save() { try { localStorage.setItem(KEY, this.canvas.toDataURL('image/png')); } catch { /* full or blocked */ } }

  begin() {
    const cam = this.camera;
    this.from = { pos: cam.position.clone(), yaw: cam.rotation.y, pitch: cam.rotation.x };
    this.active = true;
    this.t = 0;
  }

  end() {
    this.active = false;
    this.down = false;
    this.last = null;
    const cam = this.camera;
    cam.position.copy(this.from.pos);
    cam.rotation.set(this.from.pitch, this.from.yaw, 0, 'YXZ');
    this.save();
  }

  update(dt) {
    if (!this.active) return;
    this.t = Math.min(1, this.t + dt / 0.5);
    const e = this.t * this.t * (3 - 2 * this.t), cam = this.camera;
    cam.position.lerpVectors(this.from.pos, this.view.pos, e);
    let dy = this.view.yaw - this.from.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    cam.rotation.set(this.from.pitch + (this.view.pitch - this.from.pitch) * e, this.from.yaw + dy * e, 0, 'YXZ');
    this.sound = Math.max(0, this.sound - dt);
  }

  /** Canvas pixel under a screen point (client coords in `el`), or null off the sheet. */
  pixelAt(clientX, clientY, el) {
    const r = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.camera.updateMatrixWorld();
    this.ray.setFromCamera(ndc, this.camera);
    const hit = this.ray.intersectObject(this.paper, false)[0];
    if (!hit) return null;
    return { x: hit.uv.x * this.canvas.width, y: (1 - hit.uv.y) * this.canvas.height };
  }

  /** A crayon dab line from a to b (canvas pixels). */
  stroke(a, b) {
    const g = this.ctx, len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(len / 1.5));
    g.fillStyle = this.color;
    for (let i = 0; i <= n; i++) {
      const x = a.x + ((b.x - a.x) * i) / n, y = a.y + ((b.y - a.y) * i) / n;
      for (let k = 0; k < 4; k++) {
        g.globalAlpha = 0.18 + Math.random() * 0.22;
        const rr = D.width * (0.25 + Math.random() * 0.5);
        g.beginPath();
        g.arc(x + (Math.random() - 0.5) * D.width, y + (Math.random() - 0.5) * D.width, rr * 0.5, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    this.tex.needsUpdate = true;
    if (this.sound <= 0 && len > 1) { sfx.crayon(this.paper.position, Math.min(1, len / 30)); this.sound = 0.12; }
  }

  pointerDown(x, y, el) { this.down = true; this.last = this.pixelAt(x, y, el); if (this.last) { this.stroke(this.last, this.last); this.strokes++; } }
  pointerMove(x, y, el) {
    if (!this.down) return;
    const p = this.pixelAt(x, y, el);
    if (p && this.last) this.stroke(this.last, p);
    this.last = p;
  }
  pointerUp() { this.down = false; this.last = null; }
}
