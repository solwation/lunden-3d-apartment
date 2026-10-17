import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SAUSAGE as S } from './config.js';

// #1124: grill sausages and hot-dog buns for the life simulator (lifemodels.js builders): plain shapes of our own, no brands.
// Origins at the bottom centre, long side along x (the lifemodels.js convention).

const std = (color, roughness = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const M = {
  tray: std(0xf1f1ee, 0.5), film: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, transparent: true, opacity: 0.35, depthWrite: false }),
  bun: std(0xd9a05b, 0.75), bunTop: std(0xb9783a, 0.7), bunIn: std(0xf2dfb8, 0.85),
  bag: new THREE.MeshStandardMaterial({ color: 0xf6f1e4, roughness: 0.25, transparent: true, opacity: 0.5, depthWrite: false }),
};
const RAW = new THREE.Color(S.colors.raw), GRILLED = new THREE.Color(S.colors.grilled), BURNT = new THREE.Color(S.colors.burnt);
const sausageGeo = () => new THREE.CapsuleGeometry(S.r, S.len - 2 * S.r, 4, 10).rotateZ(Math.PI / 2);
function mesh(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }
/** The sausage's colour after `cook` s on a lit grill: pale pink → browned → charred. */
export function sausageColor(cook, out = new THREE.Color()) {
  const k = Math.min(1, cook / S.seconds), b = Math.max(0, Math.min(1, (cook - S.burnAt) / S.seconds));
  return out.copy(RAW).lerp(GRILLED, k).lerp(BURNT, b);
}

/** A tray of grill sausages under film (our own plain pack); fewer visible as they are taken. */
function sausagePack(def) {
  const g = new THREE.Group(), n = def.amount ?? S.pack;
  const tray = mesh(new THREE.BoxGeometry(S.len + 0.02, 0.016, n * S.r * 2 + 0.02), M.tray);
  tray.position.y = 0.008;
  const film = mesh(new THREE.BoxGeometry(S.len + 0.022, 0.035, n * S.r * 2 + 0.022), M.film);
  film.position.y = 0.018; film.castShadow = false;
  const mat = std(S.colors.raw, 0.45), geo = sausageGeo();
  const links = [...Array(n)].map((_, i) => { const s = mesh(geo, mat); s.position.set(0, 0.012 + S.r, (i - (n - 1) / 2) * S.r * 2); g.add(s); return s; });
  g.add(tray, film);
  return { object: g, grip: [0, 0.02, 0], show(item) { links.forEach((s, i) => { s.visible = i < item.amount; }); } };
}

/** One sausage: browns as it grills (`machine.cook`), shorter as it is bitten from the +x end. */
function sausage(def) {
  const g = new THREE.Group(), mat = std(S.colors.raw, 0.4), m = mesh(sausageGeo(), mat);
  m.position.y = S.r; g.add(m);
  return { object: g, grip: [-S.len * 0.3, S.r, 0], show(item) {
    sausageColor(item.machine?.cook ?? 0, mat.color);
    mat.roughness = (item.machine?.cook ?? 0) >= S.seconds ? 0.3 : 0.45; // grilled: a little glossy
    const k = Math.max(0.15, item.amount / (def.amount ?? 1));
    m.scale.x = k; m.position.x = -(1 - k) * S.len / 2;
  } };
}

/** A bag of hot-dog buns (our own plain bag); fewer buns as they are taken. */
function bunBag(def) {
  const g = new THREE.Group(), n = def.amount ?? S.buns, geo = new RoundedBoxGeometry(S.bun.len, S.bun.h, S.bun.w, 2, 0.018);
  const buns = [...Array(n)].map((_, i) => { const b = mesh(geo, M.bun); b.position.set(0, S.bun.h / 2 + 0.002, (i - (n - 1) / 2) * (S.bun.w + 0.003)); g.add(b); return b; });
  const bag = mesh(new THREE.BoxGeometry(S.bun.len + 0.03, S.bun.h + 0.01, n * (S.bun.w + 0.003) + 0.01), M.bag);
  bag.position.y = (S.bun.h + 0.01) / 2; bag.castShadow = false;
  g.add(bag);
  return { object: g, grip: [0, S.bun.h, 0], show(item) { buns.forEach((b, i) => { b.visible = i < item.amount; }); } };
}

/** A hot-dog bun, split along the top; with a sausage part (`parts`) it lies in the split. Bitten from the +x end. */
function hotdogBun(def) {
  const g = new THREE.Group(), B = S.bun, body = new THREE.Group();
  const half = (s) => { const m = mesh(new RoundedBoxGeometry(B.len, B.h, B.w / 2, 2, 0.016), M.bun); m.position.set(0, B.h / 2, s * B.w / 4); return m; };
  const slit = mesh(new THREE.BoxGeometry(B.len - 0.02, 0.004, B.w * 0.18), M.bunIn); slit.position.y = B.h - 0.006;
  const mat = std(S.colors.grilled, 0.3), link = mesh(sausageGeo(), mat);
  link.position.y = B.h; link.visible = false;
  body.add(half(-1), half(1), slit, link);
  g.add(body);
  return { object: g, grip: [-B.len * 0.3, B.h / 2, 0], show(item) {
    const p = item.parts?.find((x) => x.type === 'sausage');
    link.visible = !!p;
    if (p) sausageColor(p.machine?.cook ?? S.seconds, mat.color);
    const k = Math.max(0.15, item.amount / (def.amount ?? 1));
    body.scale.x = k; body.position.x = -(1 - k) * B.len / 2;
  } };
}

export const SAUSAGE_BUILDERS = { sausagePack, sausage, bunBag, hotdogBun };
