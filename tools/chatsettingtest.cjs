#!/usr/bin/env node
// Actual Chat module and index DOM/CSS; bootstrap suppressed, no apartment renderer or WebGL.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const base = process.argv[2] || 'http://localhost:8765';
const out = process.argv[3] || '/tmp/lunden-chat765';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  let failed = 0;
  const check = (ok, name, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' '+JSON.stringify(detail) : ''}`); if (!ok) failed++; };
  const setup = async (clear = false) => {
    await page.goto(`${base}/index.html`);
    await page.evaluate(async clear => {
      if (clear) localStorage.removeItem('lunden.chat.hidden');
      const { Chat } = await import('/src/chat.js');
      const THREE = await import('three');
      const { gameView } = await import('/src/viewport.js');
      const { initHudIcons } = await import('/src/hudicons.js');
      initHudIcons();
      document.getElementById('score').append(document.getElementById('terminal-btn'));
      gameView.w = innerWidth; gameView.h = innerHeight;
      for (const id of ['overlay','loading','rotate']) document.getElementById(id).hidden = true;
      document.getElementById('hud').hidden = false;
      const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 100);
      const root = new THREE.Group(); root.position.set(0, -1.5, -4);
      const ghost = { id: 'peer', name: 'Olof', root };
      const packets = [];
      const ghosts = { on: true, capped: false, connected: true, others: new Map([['peer',ghost]]), talk: m => { packets.push(m); return true; } };
      window.fixture = { ghost, ghosts, packets, camera, gameView };
      window.chat = new Chat({ ghosts, log: document.getElementById('chat-log'), setting: document.getElementById('menu-chat-setting'), layer: document.getElementById('speech'), camera });
    }, clear);
  };
  try {
    await page.route('**/src/bootstrap.js', r => r.fulfill({contentType:'text/javascript', body:'// Chat DOM-only fixture.'}));
    await setup(true);
    check(await page.evaluate(() => !chat.hidden && document.getElementById('menu-chat-setting').textContent.includes('PÅ') && !document.getElementById('chat-toggle')), 'default PÅ in menu and old toggle removed');
    await page.evaluate(() => { chat.heard({t:'m',n:'Olof',m:'Hej på dig!'},fixture.ghost); chat.update(0); chat.opened(true); chat.keyed(); document.getElementById('menu-chat-setting').click(); });
    check(await page.evaluate(() => chat.hidden && chat.log.hidden && !chat.bubbleList()[0].shown && chat.typing && fixture.packets.length === 1 && localStorage.getItem('lunden.chat.hidden') === '1'), 'AV immediately hides existing bubble and log, preserves outgoing typing');
    await page.evaluate(() => chat.heard({t:'k',on:true},fixture.ghost));
    const chatHidden = await page.evaluate(() => { chat.update(0); return !chat.bubbleList()[0].shown && chat.bubbleList()[0].typing && chat.list().every(l => !/Skriver|Du skriver/.test(l.text)); });
    check(chatHidden, 'AV hides incoming typing bubble with no typing row (#735)');
    await page.evaluate(() => document.getElementById('menu-chat-setting').click());
    check(await page.evaluate(() => !chat.hidden && chat.bubbleList()[0].shown && chat.bubbleList()[0].typing && fixture.packets.length === 1), 'PÅ restores valid bubble without network flag changes');
    await page.evaluate(() => { document.getElementById('menu-chat-setting').click(); chat.heard({t:'m',n:'Olof',m:'Meddelande medan chatten är av'},fixture.ghost); chat.update(0); });
    check(await page.evaluate(() => !chat.bubbleList()[0].shown), 'new message bubble remains hidden while AV');
    await page.evaluate(() => document.getElementById('menu-chat-setting').click());
    check(await page.evaluate(() => chat.bubbleList()[0].shown && chat.bubbleList()[0].text === 'Meddelande medan chatten är av'), 'PÅ shows valid message received while AV');
    await page.evaluate(() => document.getElementById('menu-chat-setting').click());
    await setup();
    check(await page.evaluate(() => chat.hidden && chat.log.hidden && document.getElementById('menu-chat-setting').textContent.includes('AV')), 'AV survives real page reload');
    await page.evaluate(() => document.getElementById('menu-chat-setting').click());
    await setup();
    check(await page.evaluate(() => !chat.hidden && !chat.log.hidden), 'PÅ survives real page reload');
    const feed = () => page.evaluate(() => { for(let i=0;i<100;i++) chat.heard({t:'m',n:'LångtspelarNamn1234567',m:`rad ${i} ${'text med radbrytningar '.repeat(i%5)}`}); });
    await feed();
    const tall = await page.evaluate(() => chat.lines.length);
    check(tall > 6, 'tall viewport fits more than former six-message cap', tall);
    await page.setViewportSize({width:844,height:390});
    await page.waitForTimeout(200);
    const short = await page.evaluate(() => chat.lines.length);
    check(short < tall, 'resize and rotation trim oldest complete messages', {tall,short});
    for (const [width,height,touch,safe] of [[390,844,true,0],[844,390,true,44],[568,320,true,44],[1280,720,false,0]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(({touch,safe}) => { document.body.classList.toggle('touch',touch); document.documentElement.style.setProperty('--sl',`${safe}px`); document.documentElement.style.setProperty('--sr',`${safe}px`); fixture.gameView.w=innerWidth; fixture.gameView.h=innerHeight; fixture.camera.aspect=innerWidth/innerHeight; fixture.camera.updateProjectionMatrix(); },{touch,safe});
      await feed();
      await page.waitForTimeout(100);
      const bounds = await page.evaluate(() => { const r=chat.log.getBoundingClientRect(); const h=parseFloat(getComputedStyle(chat.log).maxHeight); const rows=chat.lines.map(l=>l.el.getBoundingClientRect()); return {count:rows.length,left:r.left,right:r.right,bottom:r.bottom,height:r.height,max:h,fit:rows.every(x=>x.top>=r.top-.1 && x.bottom<=r.bottom+.1),last:chat.list().at(-1)?.text}; });
      check(bounds.count > 0 && bounds.fit && bounds.height <= bounds.max + .1 && bounds.bottom <= height && bounds.left >= safe && bounds.left <= safe+4.1 && bounds.right<=width-safe && bounds.last.includes('rad 99'), `complete newest messages fit ${width}x${height} touch=${touch}`,bounds);
      await page.screenshot({path:`${out}/chat-${width}x${height}.png`});
    }
    await page.evaluate(() => { chat.heard({t:'m',n:'Olof',m:'kvar efter gamla tiden'},fixture.ghost); chat.update(31); });
    check(await page.evaluate(() => chat.list().some(l=>l.text.includes('kvar efter gamla tiden')) && chat.bubbleList()[0].t===29), 'messages and bubbles remain after old 30-second TTL');
    await page.evaluate(() => chat.update(27.5));
    check(await page.evaluate(() => Number(chat.list().at(-1).opacity) > 0 && Number(chat.list().at(-1).opacity) < 1), 'last three seconds fade');
    await page.evaluate(() => chat.update(2));
    check(await page.evaluate(() => !chat.lines.length && !chat.bubbleList().length), '60-second TTL expires both messages and bubbles');
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(() => document.getElementById('menu-chat-setting').click());
    await feed();
    const hiddenTall = await page.evaluate(() => chat.lines.length);
    await page.setViewportSize({width:568,height:320});
    await page.waitForTimeout(200);
    check(await page.evaluate(n => chat.hidden && chat.log.hidden && chat.lines.length>0 && chat.lines.length<n, hiddenTall), 'AV still trims retained messages after viewport resize');
    await page.evaluate(() => { chat.heard({t:'k',on:true},fixture.ghost); });
    check(await page.evaluate(() => !chat.bubbleList()[0].shown), 'new typing element starts hidden immediately while AV');
    await page.evaluate(() => document.getElementById('menu-chat-setting').click());
    await page.setViewportSize({width:1280,height:720});
    await page.evaluate(() => { document.getElementById('overlay').hidden=false; document.getElementById('hud').hidden=true; });
    await page.click('#menu-chat-setting');
    check(await page.evaluate(() => chat.hidden), 'actual visible menu button toggles AV while HUD is hidden');
    await page.click('#menu-chat-setting');
    await page.screenshot({path:`${out}/menu-settings.png`});
    check(!errors.length,'no browser page errors',errors);
    console.log(failed ? 'SOME FAILED' : 'ALL PASS'); process.exitCode=failed ? 1 : 0;
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
