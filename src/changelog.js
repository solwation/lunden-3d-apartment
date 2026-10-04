import * as THREE from 'three';
import { CHANGELOG_NOTE } from './config.js';

// What has changed (data/changelog.json, newest first). Entries newer than the last visit are marked "Nytt".
// On the published site (#341) every entry has `t` = when it reached main (tools/changelog_stamp.py): the list
// is ordered by it and the highest `t` seen is kept (KEY_T), since a hand-picked id can be too low when agents
// push in parallel. Without `t` (locally, BUILD 'dev') the file order and the highest id seen (KEY) as before.
const KEY = 'lunden.changelogSeen';
const KEY_T = 'lunden.changelogSeenT';

/** Mark the new entries and remember what was seen in `store` (localStorage-like). Returns the entries in
 *  display order with `isNew`. */
export function markNew(entries, store) {
  const get = (k) => { try { return Number(store.getItem(k)) || 0; } catch { return 0; } };
  const set = (k, v) => { try { store.setItem(k, String(v)); } catch { /* private mode etc. */ } };
  const seen = get(KEY);
  set(KEY, Math.max(0, ...entries.map((e) => e.id)));
  if (!entries.length || !entries.every((e) => Number.isFinite(e.t))) {
    // first visit: everything is new, so nothing gets the badge
    return entries.map((e) => ({ ...e, isNew: seen > 0 && e.id > seen }));
  }
  const sorted = [...entries].sort((a, b) => b.t - a.t || b.id - a.id);
  let seenT = get(KEY_T);
  // an old id-only visitor: from the t of the entry with that id (else the newest up to it), so not everything turns
  // new — while an entry that got a lower id but was published after it still does
  if (!seenT && seen > 0) {
    seenT = entries.find((e) => e.id === seen)?.t || Math.max(0, ...entries.filter((e) => e.id <= seen).map((e) => e.t));
  }
  set(KEY_T, Math.max(seenT, ...entries.map((e) => e.t)));
  return sorted.map((e) => ({ ...e, isNew: seenT > 0 && e.t > seenT }));
}

export async function loadChangelog() {
  let entries = [];
  try {
    entries = await fetch('data/changelog.json').then((r) => r.json());
  } catch { /* page still works without it */ }
  let store = null;
  try { store = localStorage; } catch { /* private mode etc. */ }
  return markNew(entries, store || { getItem: () => null, setItem: () => {} });
}

const fmtDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });

/** Fill a <ul> with the entries (all, or the first `limit`): a small date line, then the text. */
export function renderChangelog(ul, entries, limit = Infinity) {
  ul.replaceChildren(...entries.slice(0, limit).map((e) => {
    const li = document.createElement('li');
    if (e.isNew) li.className = 'is-new';
    const meta = document.createElement('span');
    meta.className = 'meta';
    const date = document.createElement('time');
    date.dateTime = e.date;
    date.textContent = fmtDate(e.date);
    meta.append(date);
    if (e.isNew) {
      const b = document.createElement('span');
      b.className = 'new';
      b.textContent = 'Nytt';
      meta.append(' ', b);
    }
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = e.text;
    li.append(meta, text);
    return li;
  }));
}

function wrap(g, text, maxW) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > maxW && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Hand-written-looking note texture: title, the latest entries, a red "NYTT!" if any are new. */
function noteTexture(entries) {
  const c = document.createElement('canvas');
  c.width = 300; c.height = 420;
  const g = c.getContext('2d');
  g.fillStyle = '#fffbe9';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(80,120,190,0.25)';
  for (let y = 92; y < c.height; y += 26) { g.beginPath(); g.moveTo(14, y); g.lineTo(c.width - 14, y); g.stroke(); }
  const hand = "'Segoe Print', 'Comic Sans MS', 'Comic Neue', cursive";
  g.fillStyle = '#23324a';
  g.font = `bold 34px ${hand}`;
  g.fillText('Ändringar', 22, 70);
  g.font = `17px ${hand}`;
  let y = 114;
  for (const e of entries) {
    for (const [i, l] of wrap(g, e.text, c.width - 56).entries()) {
      if (y > c.height - 20) break;
      if (i === 0) g.fillText('•', 18, y);
      g.fillText(l, 34, y);
      y += 26;
    }
    if (y > c.height - 20) break;
  }
  if (entries.some((e) => e.isNew)) {
    g.save();
    g.translate(232, 58);
    g.rotate(0.25);
    g.strokeStyle = g.fillStyle = '#d23a2a';
    g.lineWidth = 3;
    g.strokeRect(-46, -22, 92, 40);
    g.font = `bold 24px ${hand}`;
    g.fillText('NYTT!', -38, 7);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The note on the freezer door, with a magnet. Interactable like a door (E / action button). */
export function buildNote(entries) {
  const N = CHANGELOG_NOTE;
  const object = new THREE.Group();
  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(N.w, N.w * 1.4),
    new THREE.MeshStandardMaterial({ map: noteTexture(entries), roughness: 0.9 }),
  );
  paper.rotation.z = N.tilt;
  const magnet = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 16),
    new THREE.MeshStandardMaterial({ color: 0xd23a2a, roughness: 0.4 }));
  magnet.rotation.x = Math.PI / 2;
  magnet.position.set(0, N.w * 0.62, 0.006);
  object.add(paper, magnet);
  object.position.set(N.x, N.y, N.z);
  object.rotation.y = N.rotY;
  const note = { name: 'lappen', kind: 'note', verb: 'läsa', object, pickable: object, isOpen: false };
  paper.userData.door = magnet.userData.door = note;
  return note;
}

/** Keyboard scrolling of the open note's list (#275): ↑ ↓ / W S a line, PageUp / PageDown / (Shift+)Space a page,
 *  Home / End the ends. Returns true when the key was used. Held keys repeat via the keyboard's own auto-repeat;
 *  main.js already ignores the repeat of a key that was held before the note opened. */
export function scrollNote(paper, code, shift = false) {
  const line = CHANGELOG_NOTE.scrollLine, page = Math.max(line, paper.clientHeight - 2 * line);
  const by = { ArrowDown: line, KeyS: line, ArrowUp: -line, KeyW: -line, PageDown: page, PageUp: -page,
    Space: shift ? -page : page, Home: -paper.scrollHeight, End: paper.scrollHeight }[code];
  if (by === undefined) return false;
  paper.scrollTop += by;
  return true;
}
