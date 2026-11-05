// #1873: actual menu across desktop/PWA/mobile/hybrid and native mode choices.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://127.0.0.1:8173', out = process.argv[3] || '/tmp/quit-menu';
(async () => {
  fs.mkdirSync(out, {recursive:true});
  const browser = await kit.launch(), checks = [], errors = [];
  const check = (ok, name) => { assert.ok(ok, name); checks.push(name); console.log('PASS', name); };
  try {
    for (const scenario of [
      {name:'desktop', installed:false}, {name:'desktop-pwa', installed:true},
      {name:'hybrid-pwa', installed:true, hybrid:true}, {name:'phone-pwa', installed:true, phone:true},
    ]) {
      const ctx = await browser.newContext({viewport:{width:1000,height:800}, deviceScaleFactor:1, hasTouch:!!(scenario.hybrid || scenario.phone)});
      await ctx.addInitScript(s => {
        Object.defineProperty(navigator, 'standalone', {get:()=>s.installed});
        // A Surface has touch points and a fine primary mouse, unlike a phone.
        if (s.hybrid) { const native = matchMedia.bind(window); window.matchMedia = q => q === '(pointer: coarse) and (hover: none)' ? {matches:false} : native(q); }
        window.close = () => { window.__closeCalled = true; };
      }, scenario);
      if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', r => r.fulfill({path:path.join(process.env.THREE_DIR,new URL(r.request().url()).pathname.split('/three@0.170.0/')[1]),contentType:'text/javascript'}));
      const page = await ctx.newPage();page.on('pageerror',e=>errors.push(scenario.name+': '+e.message));
      await page.goto(`${base}/?test=lazy&cloud=&mp=0${scenario.phone?'&phone':''}`,{waitUntil:'commit'});
      await page.waitForFunction(()=>window.__app?.renderer && __app.loadingEl.hidden,null,{timeout:180000});
      await kit.skipNameDialog(page);
      const hidden = () => page.locator('#quit').evaluate(e=>e.hidden);
      check(await hidden() === !!scenario.phone, `${scenario.name}: initial Quit follows device, including installed desktop`);
      check(await page.locator('#app-section-title').evaluate(e=>e.hidden) === !!scenario.phone, `${scenario.name}: no empty app heading`);
      if (!scenario.phone) {
        if (scenario.name === 'desktop-pwa') {
          await page.locator('#start-mouse').click();
          await page.waitForFunction(()=>document.pointerLockElement);
          await page.evaluate(()=>document.exitPointerLock());
          await page.waitForFunction(()=>!document.getElementById('overlay').hidden);
          await page.locator('#quit').click();
          await page.locator('#quit-help').waitFor({state:'visible'});
          check(await page.evaluate(()=>__closeCalled && !!sessionStorage.getItem('lunden.session')), 'desktop PWA: direct close attempted and session saved, refusal explained');
          await kit.shot(page, path.join(out,'desktop-pwa.png'));
        }
        await page.locator('#start-touch').click();
        await page.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();__app.showOverlay(true)});
        check(await hidden(), `${scenario.name}: native Touch choice hides Quit`);
        check(await page.locator('#app-section-title').evaluate(e=>e.hidden), `${scenario.name}: touch hides empty heading`);
        await page.evaluate(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=()=>{};e.userChoice=Promise.resolve({outcome:'dismissed'});dispatchEvent(e)});
        await page.waitForFunction(()=>!document.getElementById('app-section-title').hidden);
        check(await page.locator('#install-btn').isVisible(), `${scenario.name}: install offer keeps app heading in touch mode`);
        await page.evaluate(()=>dispatchEvent(new Event('appinstalled')));
        await page.waitForFunction(()=>document.getElementById('app-section-title').hidden);
        await page.locator('#start-mouse').click();
        await page.evaluate(()=>{if(document.pointerLockElement)document.exitPointerLock();__app.showOverlay(true)});
        check(!await hidden(), `${scenario.name}: native mouse choice restores Quit after touch`);
      } else {
        await kit.shot(page,path.join(out,'phone-pwa.png'));
      }
      await ctx.close();
    }
    check(errors.length === 0, 'zero page errors');
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,errors},null,2));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
