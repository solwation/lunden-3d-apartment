const assert = require('node:assert/strict'), fs = require('node:fs');
const kit = require('./testkit.cjs');
const base=process.argv[2]||'http://127.0.0.1:8137',out=process.argv[3]||'/tmp/menu-settings';
(async()=>{
  fs.mkdirSync(out,{recursive:true});const browser=await kit.launch(),checks=[],errors=[];
  const check=(v,n)=>{assert.ok(v,n);checks.push(n);console.log('PASS',n)};
  try{
    const {page}=await kit.open(browser,`${base}/?cloud=&mp=0`,{lazy:true,viewport:{width:1100,height:850},contextOptions:{hasTouch:true},init:()=>{localStorage.setItem('lunden.name','Olof');localStorage.setItem('lunden.avatar','240302101h8q3')}});
    page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>__app.loadingEl.hidden,null,{timeout:180000});
    check(await page.evaluate(()=>['menu-chat-setting','reset-home','stats-reset','menu-privacy','toggle-instructions','menu-touch-layout'].every(id=>document.getElementById(id).closest('#settings-dialog')) && !document.querySelector('#overlay #instructions')),'all requested sections live only in settings modal');
    await page.screenshot({path:`${out}/start-menu.png`});
    await page.locator('#menu-settings').click();
    check(await page.evaluate(()=>!document.getElementById('settings-dialog').hidden&&document.getElementById('overlay').inert&&document.activeElement.id==='settings-close'),'open button shows modal and makes start menu inert');
    await page.keyboard.press('Shift+Tab');check(await page.evaluate(()=>document.activeElement.id==='menu-privacy'),'reverse Tab wraps inside modal');
    await page.keyboard.press('Tab');check(await page.evaluate(()=>document.activeElement.id==='settings-close'),'Tab wraps back to close');
    const was=await page.locator('#menu-chat-setting').getAttribute('aria-pressed');await page.locator('#menu-chat-setting').click();
    check(await page.locator('#menu-chat-setting').getAttribute('aria-pressed')!==was && await page.evaluate(()=>localStorage.getItem('lunden.chat.hidden')==='1'),'moved chat setting still persists');
    await page.locator('#toggle-instructions').click();check(await page.locator('#instructions').isVisible(),'keyboard mouse and touch instructions open inside modal');
    await page.locator('#toggle-instructions').click();await page.screenshot({path:`${out}/settings.png`});
    await page.locator('#reset-home').click();check(await page.locator('#reset-confirm').isVisible(),'existing home reset confirmation opens above settings');
    await page.keyboard.press('Escape');check(await page.evaluate(()=>document.getElementById('reset-confirm').hidden&&!document.getElementById('settings-dialog').hidden&&document.activeElement.id==='reset-home'),'Escape cancels child confirmation and returns to settings action');
    await page.locator('#menu-privacy').click();await page.keyboard.press('Escape');
    check(await page.evaluate(()=>document.getElementById('privacy-dialog').hidden&&!document.getElementById('settings-dialog').hidden&&document.activeElement.id==='menu-privacy'),'privacy child closes back to settings');
    await page.keyboard.press('Escape');check(await page.evaluate(()=>document.getElementById('settings-dialog').hidden&&!document.getElementById('overlay').hidden&&!document.getElementById('overlay').inert&&document.activeElement.id==='menu-settings'),'Escape closes settings without starting game and restores focus');
    await page.evaluate(()=>{__app.activeMode='touch';__app.showOverlay(true)});await page.locator('#menu-settings').click();await page.locator('#menu-touch-layout').click();
    check(await page.evaluate(()=>document.body.classList.contains('touch-editing')&&document.getElementById('settings-dialog').hidden),'touch editor opens over paused game');
    await page.locator('#touch-edit .te-cancel').click();check(await page.evaluate(()=>!document.getElementById('settings-dialog').hidden&&document.activeElement.id==='menu-touch-layout'),'touch editor returns to settings');
    await page.locator('#settings-close').click();await page.setViewportSize({width:844,height:390});await page.locator('#menu-settings').tap();
    check(await page.locator('#settings-dialog .card').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}),'narrow landscape modal fits viewport');
    await page.locator('#menu-privacy').scrollIntoViewIfNeeded();check(await page.locator('#menu-privacy').isVisible(),'last settings action remains reachable by scrolling');
    check(await page.locator('#settings-close').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}),'close button stays visible after scrolling settings');
    await page.screenshot({path:`${out}/landscape-settings.png`});await page.locator('#settings-close').tap();
    check(await page.locator('#settings-dialog').isHidden(),'touch close button returns to start menu');check(errors.length===0,'zero browser errors');
    fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,errors},null,2));
  }catch(e){console.error(e);throw e}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
