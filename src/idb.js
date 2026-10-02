// The one IndexedDB database 'lunden' (shared, so every module opens it at the same version): the cat photos
// on the kitchen board (catboard.js, 'catPhotos', since version 1) and the drawings taped up on walls and the
// fridge (posters.js, 'drawings', #176, version 2). A new store = a new version here, created in onupgradeneeded.

const DB = 'lunden', VERSION = 2;
const STORES = { catPhotos: { keyPath: 'id', autoIncrement: true }, drawings: { keyPath: 'id' } };

let opening = null;
export function openDB() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      for (const [name, opts] of Object.entries(STORES)) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, opts);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { opening = null; reject(req.error); };
  });
  return opening;
}

/** Run fn(objectStore) in a transaction on `store`; resolves with the request's result (or fn's return). */
export async function withStore(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const out = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(out?.result ?? out);
    tx.onerror = () => reject(tx.error);
  });
}
