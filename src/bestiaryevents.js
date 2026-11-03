// Interaction adapters can report before/without UI. No scores, network traffic or world state are changed here.
let collection = null;
export function connectBestiary(value) { collection = value; }
export function discoverCreature(id, action, meta) { return collection?.record(id, action, meta) ?? false; }
