// #2293 add-on to the existing local three-client test. All names and messages are test fixtures.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function install(page, name) {
  await page.evaluate(async name => {
    const T = await import('three');
    const { Chat } = await import('/src/chat.js');
    const { SwingDoor } = await import('/src/doors.js');
    const { DoorSync } = await import('/src/doorsync.js');
    const { ghosts } = window.peer;
    const log = document.body.appendChild(document.createElement('section')).appendChild(document.createElement('div'));
    const chat = new Chat({ ghosts, log, name: () => name });
    const door = new SwingDoor({ hinge: [0, 0], tip: [.9, 0], wall: [0, .9] }, 0, new T.MeshStandardMaterial(), false);
    const sync = new DoorSync({ ready: () => ghosts.connected, send: m => ghosts.doors(m) });
    sync.register('w1', door);
    const welcomes = [];
    ghosts.onDoors = m => {
      if (Array.isArray(m.list)) welcomes.push(m.list);
      sync.receive(m);
    };
    Object.assign(window.peer, { chat, door, welcomes });
  }, name);
}

async function run({ desktop, mobile, lateMobile, folder, live, nextFile, signal, step }) {
  async function until(check, what) {
    const end = Date.now() + (live ? 45000 : 16000);
    while (Date.now() < end) {
      if (await check()) return;
      await sleep(80);
    }
    throw new Error('Shared room did not confirm ' + what);
  }
  async function offer(fields) {
    const file = nextFile(), tmp = file + '.test';
    await fs.writeFile(tmp, 'Key,SourceString\n"Packet","' + fields.join('\\t') + '"\n');
    await fs.rename(tmp, file);
  }
  async function snapshot() {
    try {
      const file = await fs.readFile(path.join(folder, 'peers.csv'), 'utf8');
      return (file.match(/"Shared","([^"]*)"/)?.[1] || '').replaceAll('\\n', '\n').replaceAll('\\t', '\t');
    } catch (e) { if (e.code !== 'ENOENT') throw e; return ''; }
  }
  async function acknowledged(stage) {
    if (live) {
      await signal(stage);
      await until(async () => {
        try { await fs.access(path.join(folder, stage + '.ok')); return true; }
        catch (e) { if (e.code !== 'ENOENT') throw e; return false; }
      }, stage);
    }
  }

  let running = true;
  const heartbeat = async () => { while (running && !live) { await step(); await sleep(160); } };
  const active = heartbeat();
  try {
    await desktop.evaluate(() => { const { chat } = window.peer; chat.opened(true); chat.keyed(); });
    await until(async () => (await snapshot()).includes('\ntyping\tDator'), 'desktop typing on the launcher');
    await acknowledged('shared-typing');
    assert.equal(await desktop.evaluate(() => {
      const { chat, door } = window.peer;
      const result = chat.send('Hej från datorn');
      door.toggle();
      return result;
    }), '');
    await until(async () => {
      const data = await snapshot();
      return data.split('\n')[0].split('\t')[5].split(',').includes('w1') && data.includes('\tDator\tHej från datorn');
    }, 'desktop chat and open door in Unreal snapshot');
    await mobile.waitForFunction(() => window.peer.door.isOpen && window.peer.chat.log.textContent.includes('Dator Hej från datorn'));
    await mobile.context().close();
    const late = await lateMobile();
    await late.waitForFunction(() => window.peer.welcomes.some(rows => rows.some(([k, open]) => k === 'w1' && open === 1))
      && window.peer.door.isOpen);
    assert.equal(await late.evaluate(() => navigator.maxTouchPoints > 0), true);
    if (live) await acknowledged('shared-reply');
    else {
      await offer(['shared', 'm', 'Hej från Windows']);
      await offer(['shared', 'dr', 'w1', '0']);
    }
    for (const page of [desktop, late]) {
      await page.waitForFunction(() => !window.peer.door.isOpen && window.peer.chat.log.textContent.includes('Klara Hej från Windows'));
    }
    const result = await late.evaluate(async () => {
      const out = [];
      for (const height of [4, 7]) {
        const r = await window.peer.ghosts.fall(height, height);
        out.push(r && [r.l, r.dead]);
      }
      return out;
    });
    assert.deepEqual(result, [[5, false], [0, true]]);
    if (live) await acknowledged('shared-falls');
    else {
      for (const [nr, height, life] of [[1, 4, 5], [2, 7, 10]]) {
        await offer(['shared', 'fall', String(nr), String(height), String(height)]);
        await until(async () => {
          const packet = await snapshot();
          return Number(packet.split('\n')[0].split('\t')[2]) === life && packet.includes('\tfall\t' + nr + '\t');
        }, 'native bridge fall ' + nr);
      }
    }
    console.log('Shared room passed: desktop typing and chat, bidirectional swing door, touch welcome, both clients’ confirmed falls and recovery.');
  } finally { running = false; await active; }
}
module.exports = { install, run };
