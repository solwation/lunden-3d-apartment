import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYROOM as R } from './config.js';

// #1575: the BIO's framed film posters. The day's list comes from the Worker's GET /cinema/posters (popular, embeddable children's films on
// YouTube, cachad per day there); each poster shows the video's own thumbnail (i.ytimg.com answers with CORS `*`, so it can be drawn into a
// WebGL texture) and its title on one shared canvas atlas: one extra draw inside, none outside. E / click / touch on a poster starts that film
// on the screen through the ordinary cinema player (main.js → CinemaPlayer.playPoster). Fallbacks: the last good list kept in localStorage,
// else generic posters that are not clickable. Titles and channels are untrusted text: drawn on the canvas or shown as textContent only.
const P = R.cinemaPosters, VIDEO = /^[A-Za-z0-9_-]{11}$/, STORE = 'lunden.cinemaPosters';
const COLS = 3, ROWS = Math.ceil(P.spots.length / COLS);
const day = (time = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
// emoji are dropped: a poster's title reads like print, and devices without an emoji font would show empty boxes
const clean = (text, max) => (typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f]|\p{Extended_Pictographic}|[\u200d\ufe0f]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Valid poster items only (id pattern, non-empty plain title), at most one per spot, no repeats. */
export function posterItems(list) {
  if (!Array.isArray(list)) return [];
  const out = [], seen = new Set();
  for (const item of list) {
    const id = item?.id, title = clean(item?.title, 120);
    if (typeof id !== 'string' || !VIDEO.test(id) || seen.has(id) || !title) continue;
    seen.add(id); out.push({ id, title, channel: clean(item.channel, 80) });
    if (out.length === P.spots.length) break;
  }
  return out;
}

/** Each spot's centre (world), the direction its face points into the BIO and the in-plane x axis. */
function placement(spot) {
  const C = R.clubhouse, north = -R.d / 2, south = C.front - C.wall / 2, east = -C.side - C.wall / 2;
  if (spot.wall === 'north') return { x: spot.at, z: north, n: [0, 1], yaw: 0 };
  if (spot.wall === 'south') return { x: spot.at, z: south, n: [0, -1], yaw: Math.PI };
  return { x: east, z: spot.at, n: [-1, 0], yaw: -Math.PI / 2 };
}

export class CinemaPosters {
  constructor() {
    this.object = new THREE.Group(); this.object.name = 'bio-posters';
    this.endpoint = ''; this.items = []; this.source = 'generic'; this.shownDay = null; this.loading = null; this.nextTry = 0;
    this.canvas = document.createElement('canvas'); this.canvas.width = P.cell[0] * COLS; this.canvas.height = P.cell[1] * ROWS;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas); this.texture.colorSpace = THREE.SRGBColorSpace; this.texture.anisotropy = 2;
    const faces = [], dx = P.depth + .003;
    this.targets = []; this.pickables = [];
    P.spots.forEach((spot, i) => {
      const p = placement(spot), g = new THREE.PlaneGeometry(P.w, P.h), uv = g.attributes.uv, col = i % COLS, row = Math.floor(i / COLS);
      for (let j = 0; j < uv.count; j++) uv.setXY(j, (col + uv.getX(j)) / COLS, 1 - (row + 1 - uv.getY(j)) / ROWS);
      g.rotateY(p.yaw).translate(R.x + p.x + p.n[0] * dx, P.y, R.z + p.z + p.n[1] * dx); faces.push(g);
      // the pick box sits in its own group, hidden for a generic (non-clickable) poster: main.js's `shown` skips it
      const holder = new THREE.Group(), pick = new THREE.Mesh(new THREE.BoxGeometry(P.w + 2 * P.frame, P.h + 2 * P.frame, .08), new THREE.MeshBasicMaterial({ visible: false }));
      pick.rotation.y = p.yaw; pick.position.set(R.x + p.x + p.n[0] * .04, P.y, R.z + p.z + p.n[1] * .04);
      const target = { kind: 'playroomPoster', name: 'affischen', verb: 'visa', video: null, title: '', pickable: pick, holder, index: i };
      pick.userData.door = target; holder.add(pick); holder.visible = false; this.object.add(holder);
      this.targets.push(target); this.pickables.push(pick);
    });
    this.material = new THREE.MeshBasicMaterial({ map: this.texture });
    this.mesh = new THREE.Mesh(mergeGeometries(faces), this.material); faces.forEach((g) => g.dispose());
    this.mesh.name = 'bio-poster-faces'; this.mesh.matrixAutoUpdate = false; this.object.add(this.mesh);
    this.images = new Map(); // id → loaded Image (or null when it failed)
  }

  /** The dark frames for the room's static furniture batch (`cbox` / colours are playroom.js's). */
  frames(cbox, frame, back) {
    return P.spots.flatMap((spot) => {
      const p = placement(spot), hw = P.w / 2 + P.frame, hh = P.h / 2 + P.frame, d = P.depth, y0 = P.y - hh, y1 = P.y + hh;
      const along = (a0, a1, n0, n1, colour, ya = y0, yb = y1) => (p.n[0] === 0
        ? cbox(colour, p.x + a0, p.x + a1, ya, yb, Math.min(p.z + p.n[1] * n0, p.z + p.n[1] * n1), Math.max(p.z + p.n[1] * n0, p.z + p.n[1] * n1))
        : cbox(colour, Math.min(p.x + p.n[0] * n0, p.x + p.n[0] * n1), Math.max(p.x + p.n[0] * n0, p.x + p.n[0] * n1), ya, yb, p.z + a0, p.z + a1));
      return [along(-hw, hw, 0, d, back), // backing board
        along(-hw, -hw + P.frame, d - .002, d + .012, frame), along(hw - P.frame, hw, d - .002, d + .012, frame),
        along(-hw, hw, d - .002, d + .012, frame, y0, y0 + P.frame), along(-hw, hw, d - .002, d + .012, frame, y1 - P.frame, y1)];
    });
  }

  /** 0 = lit, 1 = the film's dimming (like the sconces, the faces are unlit). */
  setDim(level) { this.material.color.setScalar(1 - .55 * level); }

  setInside(on) { if (on) this.refresh(); }

  /** Start (at most) one background fetch: on entering, never at start-up; a failure waits a few minutes. */
  refresh(now = Date.now()) {
    if (!this.drawn) this.draw([]); // the first paint waits for the first visit, not for start-up
    if (!this.items.length && !this.triedSaved) { this.triedSaved = true; const saved = this.saved(); if (saved.length) this.show(saved, 'saved'); }
    if (this.loading || this.shownDay === day(now) && this.source === 'live' || now < this.nextTry) return this.loading;
    if (!this.endpoint) return null;
    this.loading = (async () => {
      try {
        const response = await fetch(this.endpoint, { signal: AbortSignal.timeout(P.timeoutMs) });
        if (!response.ok) throw Error('posters');
        const data = await response.json(), items = posterItems(data?.items);
        if (!items.length) throw Error('posters');
        this.store(items);
        await this.show(items, 'live');
        this.shownDay = day(now);
      } catch { this.nextTry = Date.now() + 5 * 60e3; }
      finally { this.loading = null; }
    })();
    return this.loading;
  }

  saved() { try { const v = JSON.parse(localStorage.getItem(STORE) ?? 'null'); return v?.v === 3 ? posterItems(v.items) : []; } catch { return []; } }
  store(items) { try { localStorage.setItem(STORE, JSON.stringify({ v: 3, day: day(), items })); } catch { /* a full/blocked store only loses the fallback */ } }

  /** Load the thumbnails (bounded), then redraw the atlas once; the same list is not redrawn. */
  async show(items, source) {
    const key = items.map((i) => i.id).join();
    if (key === this.items.map((i) => i.id).join()) { this.source = source; return; }
    this.items = items; this.source = source; const want = key;
    await Promise.all(items.map((item) => this.thumbnail(item.id)));
    if (want !== this.items.map((i) => i.id).join()) return; // a newer list arrived meanwhile
    this.draw(items);
  }
  thumbnail(id) {
    if (this.images.has(id)) return Promise.resolve(this.images.get(id));
    return new Promise((resolve) => {
      const img = new Image(), done = (ok) => { clearTimeout(timer); this.images.set(id, ok ? img : null); resolve(); };
      const timer = setTimeout(() => done(false), P.timeoutMs);
      img.crossOrigin = 'anonymous'; img.referrerPolicy = 'no-referrer'; img.decoding = 'async';
      img.onload = () => done(true); img.onerror = () => done(false);
      img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`; // fixed host; `id` is pattern-checked
    });
  }

  /** Paint every cell: a film poster per item, the generic "snart på bion" poster for the rest. */
  draw(items) {
    const c = this.ctx, [w, h] = P.cell;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    P.spots.forEach((_, i) => {
      const item = items[i], x = (i % COLS) * w, y = Math.floor(i / COLS) * h;
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.translate(x, y);
      if (item) this.film(c, item, w, h, i); else this.generic(c, w, h, i);
      c.restore();
      const t = this.targets[i];
      t.video = item?.id ?? null; t.title = item?.title ?? '';
      t.name = item ? 'trailer' : 'affischen'; // #1591: the prompt/button reads "visa trailer" (the poster itself shows the title)
      t.holder.visible = !!item;
    });
    this.texture.needsUpdate = true;
    this.drawn = (this.drawn ?? 0) + 1;
  }
  film(c, item, w, h, i) {
    const hue = [350, 210, 40, 160, 280, 15][i % 6], bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, `hsl(${hue} 45% 18%)`); bg.addColorStop(1, `hsl(${hue} 50% 8%)`); c.fillStyle = bg; c.fillRect(0, 0, w, h);
    const ih = Math.round(h * .62), img = this.images.get(item.id);
    if (img) { // hqdefault is 480 × 360 with the 16:9 picture in its middle band: crop a portrait-ish slice of that band
      const band = img.height * .75, sw = Math.min(img.width, band * w / ih);
      c.drawImage(img, (img.width - sw) / 2, (img.height - band) / 2, sw, band, 0, 0, w, ih);
    } else { c.fillStyle = `hsl(${hue} 40% 28%)`; c.fillRect(0, 0, w, ih); c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.moveTo(w * .42, ih * .38); c.lineTo(w * .62, ih * .5); c.lineTo(w * .42, ih * .62); c.fill(); }
    const fade = c.createLinearGradient(0, ih * .7, 0, ih); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, `hsl(${hue} 50% 12%)`); c.fillStyle = fade; c.fillRect(0, ih * .7, w, ih * .3);
    c.fillStyle = '#ffe094'; c.font = `bold ${Math.round(h * .036)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillText('NU PÅ BION', w / 2, h * .025);
    c.fillStyle = '#fff'; c.textBaseline = 'alphabetic';
    const lines = this.wrap(c, item.title, w * .88, Math.round(h * .062), 3);
    lines.forEach((line, k) => c.fillText(line, w / 2, ih + h * .085 + k * h * .072));
    if (item.channel) { c.fillStyle = 'rgba(255,255,255,.62)'; c.font = `${Math.round(h * .034)}px sans-serif`; c.fillText(this.wrap(c, item.channel, w * .85, Math.round(h * .034), 1)[0] ?? '', w / 2, h * .955); }
    c.strokeStyle = '#c9a24a'; c.lineWidth = 3; c.strokeRect(4, 4, w - 8, h - 8);
  }
  generic(c, w, h, i) {
    const bg = c.createRadialGradient(w / 2, h * .4, 0, w / 2, h * .4, h * .7);
    bg.addColorStop(0, ['#5a1020', '#14305a', '#3c2a08'][i % 3]); bg.addColorStop(1, '#0a0b10'); c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#d9c8a0'; c.lineWidth = 6; c.beginPath(); c.arc(w / 2, h * .38, w * .24, 0, Math.PI * 2); c.stroke(); // a film reel
    c.fillStyle = '#d9c8a0';
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.beginPath(); c.arc(w / 2 + Math.cos(a) * w * .13, h * .38 + Math.sin(a) * w * .13, w * .045, 0, Math.PI * 2); c.fill(); }
    c.textAlign = 'center'; c.fillStyle = '#ffe094'; c.font = `bold ${Math.round(h * .085)}px serif`; c.fillText('BION', w / 2, h * .72);
    c.fillStyle = '#fff'; c.font = `${Math.round(h * .045)}px sans-serif`; c.fillText('Snart på bion', w / 2, h * .82);
    c.strokeStyle = '#c9a24a'; c.lineWidth = 3; c.strokeRect(4, 4, w - 8, h - 8);
  }
  /** Word-wrap untrusted plain text into at most `max` lines (the last one ellipsed). */
  wrap(c, text, width, size, max) {
    c.font = `bold ${size}px sans-serif`;
    const words = text.split(' '), lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (c.measureText(next).width <= width || !line) line = next; else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    const out = lines.slice(0, max);
    if (lines.length > max || out.length && c.measureText(out[out.length - 1]).width > width) {
      let last = out[out.length - 1];
      while (last.length > 1 && c.measureText(`${last}…`).width > width) last = last.slice(0, -1);
      out[out.length - 1] = `${last.trimEnd()}…`;
    }
    return out;
  }
}
