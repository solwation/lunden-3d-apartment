// #2252: shared fixture initialization/override contracts, no browser or substitute input implementation.
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const { DEFAULTS, ELEMENTS, IMPORTS, initScript, installMainGlobals, installMainImports } = require('./mainfixture.cjs');
function context(overrides = {}) {
  const elements = {};
  const ctx = vm.createContext({ ...overrides, document: { getElementById: id => elements[id] ?? null } });
  vm.runInContext('globalThis.window=globalThis', ctx);
  return { ctx, elements, init: () => vm.runInContext(initScript, ctx) };
}

test('all defaults initialize; native excerpt collaborators are inactive and callable where needed', () => {
  const { ctx, init } = context(); init();
  for (const key of Object.keys(DEFAULTS)) assert.ok(key in ctx, key);
  assert.equal(ctx.updateAppMenu(), undefined);
  assert.equal(ctx.roofPicnic.targets().length, 0); assert.ok(ctx.roofPicnic.seat);
  assert.equal(ctx.mussels.targets().length, 0); assert.equal(ctx.measure.active, false);
  assert.equal(ctx.reactionCam.active, false);
  assert.doesNotThrow(() => ctx.scooters.tuner.release()); assert.equal(ctx.screwdriver, null);
});

test('richer collaborators supplied before or after init retain their identity across repeated initialization', () => {
  const overrides = { updateAppMenu: () => 42, roofPicnic: { targets: () => ['picnic'] }, mussels: { targets: () => ['mussel'] }, measure: { active: true } };
  const { ctx, init } = context(overrides); init();
  for (const key of Object.keys(overrides)) assert.equal(ctx[key], overrides[key], key);
  const later = { targets: () => ['later'] }; ctx.roofPicnic = later; init();
  assert.equal(ctx.roofPicnic, later); assert.equal(ctx.updateAppMenu(), 42); assert.equal(ctx.measure.active, true);
});

test('existing lazy DOM element getters remain live and allow an explicit fixture override', () => {
  const { ctx, elements, init } = context(); init();
  for (const [key, id] of Object.entries(ELEMENTS)) {
    assert.equal(ctx[key], null); elements[id] = { id }; assert.equal(ctx[key], elements[id]);
    const richer = {}; ctx[key] = richer; init(); assert.equal(ctx[key], richer);
  }
});

test('global installer passes the shared script before navigation', async () => {
  let supplied;
  await installMainGlobals({ async addInitScript(script) { supplied = script; } });
  assert.equal(supplied, initScript); assert.doesNotThrow(() => new vm.Script(supplied));
});

test('real module import map is preserved and import installer respects already supplied functions', async () => {
  assert.deepEqual(IMPORTS, { fitChoiceLabels: '/src/hudicons.js', REACT: '/src/config.js', INVENTORY_KEYS: '/src/inventoryhud.js' });
  const was = global.window, overrides = Object.fromEntries(Object.keys(IMPORTS).map(key => [key, {}]));
  global.window = overrides;
  try {
    await installMainImports({ async evaluate(fn, imports) { assert.equal(imports, IMPORTS); await fn(imports); } });
    for (const key of Object.keys(overrides)) assert.equal(global.window[key], overrides[key]);
  } finally { if (was === undefined) delete global.window; else global.window = was; }
});
