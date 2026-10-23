import { profiles } from './playerprofiles.js';
// Shared drawings stay in 'lunden'; personal photo stores use each profile's database (legacy: 'lunden').
// Every database opens at the same version. The stores contain the cat photos
// on the old kitchen board ('catPhotos', since version 1, no longer written since #1255; read once by catcards.js) and the drawings taped up on walls and the
// fridge (posters.js, 'drawings', #176, version 2) and the cat binder's cards (catcards.js, 'catCards', #1249, version 3). A new store = a new version here, created in onupgradeneeded.

const DB = 'lunden', VERSION = 3;
const STORES = { catPhotos: { keyPath: 'id', autoIncrement: true }, drawings: { keyPath: 'id' }, catCards: { keyPath: 'id' } };

const openings = new Map();
export function openDB(name = DB) {
  if (openings.has(name)) return openings.get(name);
  const opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(name, VERSION);
    req.onupgradeneeded = () => {
      for (const [name, opts] of Object.entries(STORES)) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, opts);
    };
    req.onsuccess = () => { req.result.onversionchange = () => { req.result.close(); openings.delete(name); }; resolve(req.result); };
    req.onerror = () => { openings.delete(name); reject(req.error); };
  });
  openings.set(name, opening);
  return opening;
}

/** Run fn(objectStore) in a transaction on `store`; resolves with the request's result (or fn's return). */
export async function withStore(store, mode, fn) {
  const db = await openDB(profiles?.database(store) ?? DB);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const out = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out); // (#1516: a request's undefined result stays undefined)
    tx.onerror = () => reject(tx.error);
  });
}

/** Drawings belong to the shared home; only personal photo stores are removed. */
export async function deletePlayerPhotos(player) {
  const name = player.legacy ? DB : `lunden-player-${player.id}`;
  if (player.legacy) {
    const db = await openDB(DB);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['catPhotos', 'catCards'], 'readwrite');
      tx.objectStore('catPhotos').clear(); tx.objectStore('catCards').clear();
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    return;
  }
  if (openings.has(name)) (await openings.get(name)).close();
  openings.delete(name);
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = resolve; req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Stäng spelarens andra flikar och försök igen.'));
  });
}
