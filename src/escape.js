import * as THREE from 'three';

// The basement's ways out (#452, GARAGE.escape in config): a distance field to the nearest exit over the garage's
// rectangles, the green "Nödutgång" sign pictograms (our own drawing of a running figure, a door and an arrow) and the
// utrymningsplaner drawn from the same rectangles. garage.js builds the meshes.

const STEP = 0.25; // m per cell

/**
 * Distance (m) to the nearest exit over the walkable rectangles. `walkable(x, z)`, `exit(x, z)` per cell centre.
 * Returns `at(x, z)` and `path(x, z, len)`: the way down the field from (x, z), up to `len` m (points [x, z]).
 */
export function escapeField(rects, walkable, exit) {
  const x0 = Math.min(...rects.map((r) => r.x0)) - 0.5, z0 = Math.min(...rects.map((r) => r.z0)) - 0.5;
  const nx = Math.ceil((Math.max(...rects.map((r) => r.x1)) + 0.5 - x0) / STEP), nz = Math.ceil((Math.max(...rects.map((r) => r.z1)) + 0.5 - z0) / STEP);
  const d = new Float64Array(nx * nz).fill(Infinity), ok = new Uint8Array(nx * nz);
  const cx = (i) => x0 + (i + 0.5) * STEP, cz = (j) => z0 + (j + 0.5) * STEP;
  // Dijkstra (a binary heap of [dist, cell]), 8 neighbours
  const heap = [];
  const push = (v, c) => { heap.push([v, c]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } }
    return top;
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const c = j * nx + i, x = cx(i), z = cz(j);
    if (!walkable(x, z)) continue;
    ok[c] = 1;
    if (exit(x, z)) { d[c] = 0; push(0, c); }
  }
  const N = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.length) {
    const [v, c] = pop();
    if (v > d[c]) continue;
    const i = c % nx, j = (c - i) / nx;
    for (const [di, dj, w] of N) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const q = b * nx + a;
      if (!ok[q] || (di && dj && (!ok[j * nx + a] || !ok[b * nx + i]))) continue; // (no cutting a corner)
      const nv = v + w * STEP;
      if (nv < d[q]) { d[q] = nv; push(nv, q); }
    }
  }
  const cell = (x, z) => {
    const i = Math.floor((x - x0) / STEP), j = Math.floor((z - z0) / STEP);
    return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i;
  };
  /** The nearest walkable cell to (x, z) (a sign over a rack or a wall face). */
  const near = (x, z) => {
    let best = -1, bd = Infinity;
    for (let r = 0; r < 8 && best < 0; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const c = cell(x + di * STEP, z + dj * STEP);
      if (c >= 0 && ok[c] && d[c] < Infinity) { const e = Math.hypot(di, dj); if (e < bd) { bd = e; best = c; } }
    }
    return best;
  };
  return {
    at: (x, z) => { const c = near(x, z); return c < 0 ? Infinity : d[c]; },
    path(x, z, len = Infinity) {
      let c = near(x, z);
      if (c < 0) return [[x, z]];
      const out = [[x, z]];
      let run = 0;
      while (d[c] > 0 && run < len) {
        const i = c % nx, j = (c - i) / nx;
        let best = c;
        for (const [di, dj] of N) {
          const a = i + di, b = j + dj, q = b * nx + a;
          if (a >= 0 && b >= 0 && a < nx && b < nz && ok[q] && d[q] < d[best]) best = q;
        }
        if (best === c) break;
        const bi = best % nx, bj = (best - bi) / nx, p = [cx(bi), cz(bj)], l = out[out.length - 1];
        run += Math.hypot(p[0] - l[0], p[1] - l[1]);
        out.push(p);
        c = best;
      }
      return out;
    },
  };
}

/** The sign pictogram in a `w` × `h` box at (x, y): a white running figure and door on green, an arrow
 * ('left' | 'right' | 'ahead' | null), "NÖDUTGÅNG" under it (`text`). Drawn in a 512 × 256 frame and scaled. */
export function drawExit(g, x, y, w, h, arrow, text = true) {
  g.save();
  g.translate(x, y); g.scale(w / 512, h / 256);
  g.fillStyle = '#108a3e'; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#f6f6f2'; g.lineWidth = 6; g.strokeRect(8, 8, 496, 240);
  if (arrow === 'right') { g.translate(512, 0); g.scale(-1, 1); } // (mirrored: the figure runs right)
  g.strokeStyle = g.fillStyle = '#f6f6f2'; g.lineCap = g.lineJoin = 'round';
  const top = text ? 0 : 20;
  g.translate(18, top);
  // the arrow
  if (arrow === 'left' || arrow === 'right') {
    g.lineWidth = 22; g.beginPath(); g.moveTo(170, 112); g.lineTo(80, 112); g.stroke();
    g.beginPath(); g.moveTo(40, 112); g.lineTo(100, 62); g.lineTo(100, 162); g.closePath(); g.fill();
  } else if (arrow === 'back') { // turn round: a U-turn arrow
    g.lineWidth = 20; g.beginPath(); g.moveTo(150, 190); g.lineTo(150, 100); g.arc(105, 100, 45, 0, Math.PI, true); g.lineTo(60, 130); g.stroke();
    g.beginPath(); g.moveTo(60, 185); g.lineTo(22, 128); g.lineTo(98, 128); g.closePath(); g.fill();
  } else if (arrow === 'ahead') {
    g.lineWidth = 22; g.beginPath(); g.moveTo(105, 190); g.lineTo(105, 85); g.stroke();
    g.beginPath(); g.moveTo(105, 38); g.lineTo(55, 98); g.lineTo(155, 98); g.closePath(); g.fill();
  }
  // the door: a frame, the figure running into it
  g.lineWidth = 12; g.strokeRect(196, 34, 92, 156);
  g.fillStyle = '#108a3e'; g.fillRect(270, 60, 30, 120);
  g.fillStyle = '#f6f6f2';
  g.beginPath(); g.arc(318, 56, 17, 0, Math.PI * 2); g.fill(); // the head
  g.lineWidth = 19;
  const line = (...p) => { g.beginPath(); g.moveTo(p[0], p[1]); for (let k = 2; k < p.length; k += 2) g.lineTo(p[k], p[k + 1]); g.stroke(); };
  line(322, 84, 348, 134);                 // the body, leaning into the run
  line(326, 92, 298, 104, 282, 128);       // the front arm
  line(330, 96, 360, 104, 384, 86);        // the back arm
  line(348, 134, 318, 150, 300, 184);      // the front leg
  line(348, 134, 380, 160, 412, 150);      // the back leg
  g.restore();
  if (text) {
    g.save(); g.translate(x, y); g.scale(w / 512, h / 256);
    g.fillStyle = '#f6f6f2'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('NÖDUTGÅNG', 256, 222);
    g.restore();
  }
}

export const EXIT_CELLS = ['left', 'right', 'ahead', 'back'];
/** The signs' atlas: one 512 × 256 row per EXIT_CELLS entry. */
export function exitTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256 * EXIT_CELLS.length;
  const g = c.getContext('2d');
  EXIT_CELLS.forEach((a, i) => drawExit(g, 0, i * 256, 512, 256, a));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** A red extinguisher symbol centred at (x, y), `s` px. */
function drawExtinguisher(g, x, y, s) {
  g.save(); g.translate(x - s / 2, y - s / 2); g.scale(s / 100, s / 100);
  g.fillStyle = '#c8261e'; g.fillRect(0, 0, 100, 100);
  g.fillStyle = '#fff';
  g.beginPath(); g.roundRect?.(36, 34, 28, 56, 8); if (!g.roundRect) g.rect(36, 34, 28, 56); g.fill();
  g.fillRect(44, 22, 12, 12); g.fillRect(50, 16, 26, 7);
  g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.moveTo(44, 28); g.quadraticCurveTo(22, 34, 26, 66); g.stroke();
  g.restore();
}

/** An arrow from (ax, ay) to (bx, by) (canvas px), head `hs` px. */
function arrowLine(g, pts, width, hs) {
  if (pts.length < 2) return;
  g.lineWidth = width; g.lineCap = g.lineJoin = 'round';
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.stroke();
  const [bx, by] = pts[pts.length - 1];
  let k = pts.length - 2; while (k > 0 && Math.hypot(pts[k][0] - bx, pts[k][1] - by) < hs) k--;
  const [ax, ay] = pts[k], a = Math.atan2(by - ay, bx - ax);
  g.beginPath(); g.moveTo(bx + Math.cos(a) * hs * 0.4, by + Math.sin(a) * hs * 0.4);
  g.lineTo(bx + Math.cos(a + 2.5) * hs, by + Math.sin(a + 2.5) * hs); g.lineTo(bx + Math.cos(a - 2.5) * hs, by + Math.sin(a - 2.5) * hs); g.closePath(); g.fill();
}

/**
 * The utrymningsplaner, one cell each side by side in one atlas: `plans` = [{ x, z, n: [nx, nz] (the wall's facing),
 * here: [x, z] (the reader's spot), ext: [[x, z], …] (extinguishers) }]. `geo` = { rects, walls ([ax, az, bx, bz]),
 * blocks ([x0, x1, z0, z1]: partials, columns), cages, core, lift, exits ([{ x, z, label }]), field, rooms }.
 * Each plan is turned the way its reader faces (up = into the wall). Returns { tex, cells: [{ u0, u1, v0, v1, w, h }] }.
 */
export function planTexture(plans, geo) {
  const cells = plans.map((p) => {
    const f = [-p.n[0], -p.n[1]], r = [-f[1], f[0]];
    const U = (x, z) => x * r[0] + z * r[1], V = (x, z) => x * f[0] + z * f[1];
    const pts = geo.rects.flatMap((q) => [[q.x0, q.z0], [q.x1, q.z0], [q.x0, q.z1], [q.x1, q.z1]]);
    const us = pts.map(([x, z]) => U(x, z)), vs = pts.map(([x, z]) => V(x, z));
    const ur = [Math.min(...us), Math.max(...us)], vr = [Math.min(...vs), Math.max(...vs)];
    const land = ur[1] - ur[0] > vr[1] - vr[0];
    return { p, U, V, ur, vr, w: land ? 1414 : 1000, h: land ? 1000 : 1414, land };
  });
  const W = cells.reduce((s, c) => s + c.w, 0), H = Math.max(...cells.map((c) => c.h));
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  let ox = 0;
  for (const c of cells) {
    const { w, h } = c;
    g.save(); g.translate(ox, 0);
    g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, h);
    // the header
    const hh = Math.round(h * 0.085);
    g.fillStyle = '#108a3e'; g.fillRect(0, 0, w, hh);
    g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.font = `bold ${Math.round(hh * 0.5)}px sans-serif`; g.fillText('UTRYMNINGSPLAN', 30, hh / 2);
    g.textAlign = 'right'; g.font = `${Math.round(hh * 0.24)}px sans-serif`;
    g.fillText('Kv. Lunden · Hus L', w - 30, hh * 0.36); g.fillText('Källarplan (våning −1): garage, förråd', w - 30, hh * 0.68);
    // the map
    const legH = Math.round(h * (c.land ? 0.15 : 0.12)), m = 34;
    const aw = w - 2 * m, ah = h - hh - legH - 2 * m;
    const sc = Math.min(aw / (c.ur[1] - c.ur[0]), ah / (c.vr[1] - c.vr[0]));
    const mx = m + (aw - (c.ur[1] - c.ur[0]) * sc) / 2, my = hh + m + (ah - (c.vr[1] - c.vr[0]) * sc) / 2;
    const P = (x, z) => [mx + (c.U(x, z) - c.ur[0]) * sc, my + (c.vr[1] - c.V(x, z)) * sc];
    const quad = (x0, x1, z0, z1) => { const a = P(x0, z0), b = P(x1, z1); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])]; };
    for (const q of geo.rects) { g.fillStyle = q.id === 'core' ? '#d9d9d3' : '#ecebe4'; g.fillRect(...quad(q.x0, q.x1, q.z0, q.z1)); }
    // the stair (treads across the band north of the landing) and the lift (a box with a cross)
    g.strokeStyle = '#8a8a86'; g.lineWidth = 1;
    for (let z = geo.core.z0 + 0.28; z < geo.core.landing; z += 0.28) { const a = P(geo.core.x0, z), b = P(geo.core.x1, z); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
    { const L = geo.lift, [qx, qy, qw, qh] = quad(L.x0, L.x1, L.z0, L.z1); g.fillStyle = '#c9c9c3'; g.fillRect(qx, qy, qw, qh); g.strokeStyle = '#222'; g.lineWidth = 1.5; g.strokeRect(qx, qy, qw, qh); g.beginPath(); g.moveTo(qx, qy); g.lineTo(qx + qw, qy + qh); g.moveTo(qx + qw, qy); g.lineTo(qx, qy + qh); g.stroke(); }
    g.strokeStyle = '#a5a5a0'; g.lineWidth = 1;
    for (const q of geo.cages) g.strokeRect(...quad(q.x0, q.x1, q.z0, q.z1));
    g.fillStyle = '#1b1b1b';
    for (const [x0, x1, z0, z1] of geo.blocks) g.fillRect(...quad(x0, x1, z0, z1));
    g.strokeStyle = '#1b1b1b'; g.lineWidth = Math.max(3, 0.25 * sc); g.lineCap = 'square';
    for (const [ax, az, bx, bz] of geo.walls) { g.beginPath(); g.moveTo(...P(ax, az)); g.lineTo(...P(bx, bz)); g.stroke(); }
    // room names
    g.fillStyle = '#55554f'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [name, x, z] of geo.rooms) { g.font = `bold ${Math.round(Math.max(13, Math.min(22, sc * 1.2)))}px sans-serif`; g.fillText(name, ...P(x, z)); }
    // the ways out: small arrows over the rooms, the route from "Du är här" in bold
    g.strokeStyle = g.fillStyle = '#119a45';
    for (const q of geo.rects) {
      if ((q.x1 - q.x0) * (q.z1 - q.z0) < 6 || q.id === 'core') continue;
      const nxs = Math.max(1, Math.round((q.x1 - q.x0) / 7)), nzs = Math.max(1, Math.round((q.z1 - q.z0) / 7));
      for (let i = 0; i < nxs; i++) for (let j = 0; j < nzs; j++) {
        const x = q.x0 + (i + 0.5) * (q.x1 - q.x0) / nxs, z = q.z0 + (j + 0.5) * (q.z1 - q.z0) / nzs;
        const path = geo.field.path(x, z, 2.6);
        if (path.length > 3) arrowLine(g, path.map(([a, b]) => P(a, b)), Math.max(3, sc * 0.22), Math.max(10, sc * 0.8));
      }
    }
    const route = geo.field.path(c.p.here[0], c.p.here[1]);
    if (route.length > 2) arrowLine(g, route.map(([a, b]) => P(a, b)), Math.max(6, sc * 0.45), Math.max(18, sc * 1.4));
    // the exits, the extinguishers, "Du är här"
    const es = Math.max(30, sc * 2.2);
    for (const e of geo.exits) {
      const [px, py] = P(e.x, e.z);
      drawExit(g, px - es, py - es / 2, es * 2, es, null, false);
      g.font = `bold ${Math.round(Math.max(13, es * 0.38))}px sans-serif`; g.fillStyle = '#0d6e31'; g.textAlign = 'center';
      g.fillText(e.label, px, py + es * 0.9);
    }
    for (const [x, z] of c.p.ext) drawExtinguisher(g, ...P(x, z), Math.max(18, sc * 1.1));
    {
      const [px, py] = P(c.p.here[0], c.p.here[1]), rr = Math.max(15, sc * 1.1);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(px, py, rr + 4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#d62020'; g.beginPath(); g.arc(px, py, rr, 0, Math.PI * 2); g.fill();
      g.font = `bold ${Math.round(rr * 1.6)}px sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.lineWidth = 5; g.strokeStyle = '#fff'; g.strokeText('Du är här', px + rr + 8, py); g.fillText('Du är här', px + rr + 8, py);
    }
    // the legend and the fire rules
    const ly = h - legH, fs = Math.round(legH * (c.land ? 0.15 : 0.17));
    g.fillStyle = '#e9eee9'; g.fillRect(0, ly, w, legH);
    g.fillStyle = '#108a3e'; g.fillRect(0, ly, w, 4);
    const items = [['exit', 'Nödutgång'], ['route', 'Utrymningsväg'], ['here', 'Du är här'], ['ext', 'Brandsläckare']];
    const cw = (w - 40) / items.length, iy = ly + legH * 0.32;
    g.font = `${fs}px sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
    items.forEach(([k, label], i) => {
      const x = 20 + i * cw + 10, s = fs * 1.6;
      if (k === 'exit') drawExit(g, x, iy - s / 2, s * 2, s, null, false);
      else if (k === 'route') { g.strokeStyle = g.fillStyle = '#119a45'; arrowLine(g, [[x, iy], [x + s * 2, iy]], 7, 20); }
      else if (k === 'here') { g.fillStyle = '#d62020'; g.beginPath(); g.arc(x + s, iy, s * 0.35, 0, Math.PI * 2); g.fill(); }
      else drawExtinguisher(g, x + s, iy, s);
      g.fillStyle = '#222'; g.fillText(label, x + s * 2 + 10, iy);
    });
    g.fillStyle = '#222'; g.font = `bold ${fs}px sans-serif`; g.textAlign = 'center';
    g.fillText('Vid brand: RÄDDA – VARNA – LARMA 112 – SLÄCK', w / 2, ly + legH * 0.64);
    g.font = `${Math.round(fs * 0.85)}px sans-serif`;
    g.fillText('Använd inte hissen. Gå till närmaste nödutgång: garageporten eller trapphuset upp till portiken.', w / 2, ly + legH * 0.85);
    g.restore();
    c.u0 = ox / W; c.u1 = (ox + w) / W; c.v0 = 1 - h / H; c.v1 = 1;
    ox += w;
  }
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { tex, cells, canvas };
}
