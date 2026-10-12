// Focused combat-test lifecycle helpers (#721/#768); no game/protocol changes.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function requireFoes(peers, nudge, { timeout = 600000, poll = 300 } = {}) {
  const started = Date.now();
  for (;;) {
    await nudge();
    const states = await Promise.all(peers.map(({ page, name, weapon, ownWeapon }) => page.evaluate(({ name, weapon, ownWeapon }) => {
      const g = window.__ghosts, c = window.__combat;
      return { connected: g.connected, ready: g.connected && (!ownWeapon || c.weapon() === ownWeapon) && c.foes().some(foe => foe.name === name && (!weapon || foe.h === weapon)),
        connects: g.connects, weapon: c.weapon(), foes: c.foes().map(foe => ({ name: foe.name, weapon: foe.h })) };
    }, { name, weapon, ownWeapon })));
    if (states.every(state => state.ready)) return states;
    if (Date.now() - started >= timeout) throw new Error(`Combat peers not ready: ${JSON.stringify(states)}`);
    await sleep(poll);
  }
}
async function withActivePeers(pages, action, { interval = 5000, restore = async () => {}, onError = console.error } = {}) {
  const bases = await Promise.all(pages.map(page => page.evaluate(() => window.__app.camera.rotation.y)));
  let active = true;
  // Each peer has its own loop: a native frame on one page must not starve the others.
  const runs = pages.map((page, i) => (async () => {
    let offset = .05;
    while (active) {
      await sleep(interval);
      if (!active) break;
      offset = -offset;
      await page.evaluate(({ base, offset }) => {
        window.__app.camera.rotation.y = base + offset; window.__ghosts.update();
      }, { base: bases[i], offset }).catch(onError);
    }
  })());
  try { return await action(); }
  finally {
    active = false;
    try {
      await Promise.all(runs);
      for (const [i, page] of pages.entries()) await page.evaluate(base => {
        window.__app.camera.rotation.y = base; window.__ghosts.update();
      }, bases[i]).catch(onError);
    } finally { await restore(); }
  }
}
module.exports = { requireFoes, withActivePeers };
