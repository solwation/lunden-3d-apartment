import * as THREE from 'three';
import { CAT_BOARD as B } from './config.js';

// Cork board in the kitchen with a Polaroid of every cat you pet (newest 10), each captioned
// by hand with the cat's name and the date and time. Photos live in IndexedDB.

const DB = 'lunden', STORE = 'catPhotos', MAX = 10;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const out = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(out?.result ?? out);
    tx.onerror = () => reject(tx.error);
  });
}

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

const hand = "'Segoe Print', 'Comic Sans MS', 'Comic Neue', cursive";
const fmt = (t) => new Date(t).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export class CatBoard {
  constructor() {
    Object.assign(this, { name: 'anslagstavlan', kind: 'board', verb: 'titta på', photos: [], images: new Map() });
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1100; this.canvas.height = 760;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(B.w + 0.04, B.h + 0.04, 0.02), new THREE.MeshStandardMaterial({ color: 0xb98d5c, roughness: 0.7 }));
    frame.position.z = 0.01;
    const cork = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.9 }));
    cork.position.z = 0.0205;
    g.add(frame, cork);
    g.position.set(B.x, B.y, B.z);
    g.rotation.y = B.rotY;
    g.traverse((m) => { m.userData.door = this; });
    this.object = g;
    this.pickable = g;
    this.draw();
  }

  async load() {
    try {
      this.photos = (await withStore('readonly', (s) => s.getAll())) ?? [];
    } catch { this.photos = []; }
    this.photos = this.photos.sort((a, b) => a.time - b.time).slice(-MAX);
    await this.loadImages();
    this.draw();
  }

  async loadImages() {
    for (const p of this.photos) if (!this.images.has(p.id ?? p.time)) this.images.set(p.id ?? p.time, await loadImage(p.data));
  }

  /** Pin a new photo (JPEG data URL) of `name`; drops the oldest beyond 10. */
  async add(name, data) {
    const photo = { time: Date.now(), name, data };
    try {
      photo.id = await withStore('readwrite', (s) => s.add(photo));
      const old = this.photos.length + 1 - MAX;
      if (old > 0) await withStore('readwrite', (s) => { for (const p of this.photos.slice(0, old)) s.delete(p.id); });
    } catch { photo.id = photo.time; } // no IndexedDB (private mode): keep it for this visit
    this.photos = [...this.photos, photo].slice(-MAX);
    await this.loadImages();
    this.draw();
  }

  draw() {
    const g = this.canvas.getContext('2d'), W = this.canvas.width, H = this.canvas.height;
    // cork
    g.fillStyle = '#c49a6c';
    g.fillRect(0, 0, W, H);
    let seed = 5;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(120,80,40,0.25)' : 'rgba(240,210,170,0.25)';
      g.fillRect(rand() * W, rand() * H, 2, 2);
    }
    if (!this.photos.length) {
      g.fillStyle = '#4a3220';
      g.font = `bold 46px ${hand}`;
      g.textAlign = 'center';
      g.fillText('Klappa en katt så hamnar den här!', W / 2, H / 2);
      this.tex.needsUpdate = true;
      return;
    }
    // newest first, 5 per row
    [...this.photos].reverse().forEach((p, i) => {
      const col = i % 5, row = Math.floor(i / 5);
      const cx = 115 + col * 217, cy = 190 + row * 370;
      const r = rng(p.time)() * 0.16 - 0.08;
      g.save();
      g.translate(cx, cy);
      g.rotate(r);
      g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
      g.fillStyle = '#fbfaf6';
      g.fillRect(-95, -150, 190, 290);
      g.shadowColor = 'transparent';
      const img = this.images.get(p.id ?? p.time);
      if (img) g.drawImage(img, -85, -140, 170, 170 * (img.height / img.width));
      g.fillStyle = '#23324a';
      g.textAlign = 'center';
      g.font = `bold 30px ${hand}`;
      g.fillText(p.name, 0, 85);
      g.font = `21px ${hand}`;
      g.fillText(fmt(p.time), 0, 118);
      g.restore();
      // pin
      g.fillStyle = ['#d23a2a', '#2a7ad2', '#2aa25a', '#e0b020'][i % 4];
      g.beginPath(); g.arc(cx, cy - 140, 9, 0, Math.PI * 2); g.fill();
    });
    this.tex.needsUpdate = true;
  }
}

function rng(seed) {
  let s = (seed % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/**
 * Photograph `target` (world position) from the visitor's eye: a 4:3 render to an offscreen
 * target, returned as a JPEG data URL.
 */
export function snapshot(renderer, scene, camera, target, w = 320, h = 240) {
  // frame about 0.6 m around the cat, whatever the distance
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(0.3 / camera.position.distanceTo(target)));
  const cam = new THREE.PerspectiveCamera(THREE.MathUtils.clamp(fov, 12, 60), w / h, 0.05, 100);
  cam.position.copy(camera.position);
  cam.lookAt(target);
  const rt = new THREE.WebGLRenderTarget(w, h);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  const buf = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  rt.dispose();
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // flip
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/jpeg', 0.85);
}
