const assert = require('node:assert/strict'), fs = require('node:fs');
const kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://127.0.0.1:8137', worker = process.argv[3] || 'http://127.0.0.1:8145', out = process.argv[4] || '/tmp/menu-portraits';
(async()=>{
  fs.mkdirSync(out,{recursive:true}); const browser = await kit.launch(), checks = [], errors = [];
  const check = (v,n)=>{assert.ok(v,n);checks.push(n);console.log('PASS',n)};
  try {
    const {page}=await kit.open(browser,`${base}/?cloud=${worker}&mp=0`,{lazy:true,viewport:{width:1000,height:1000},init:()=>{
      localStorage.setItem('lunden.name','Olof'); localStorage.setItem('lunden.avatar','240302101h8q3');
    }});
    page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>__app.loadingEl.hidden,null,{timeout:180000});
    const post=(id,data)=>fetch(`${worker}/presence/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    await post('portrait-sarah',{name:'Sarah',score:77,avatar:'053124101h2q1d2s1'});
    await post('portrait-anon',{name:'',score:12,avatar:'240304100h8q2'});
    await post('portrait-legacy',{name:'Äldre spelare',score:4});
    await page.evaluate(()=>__presence.beat());
    await page.waitForFunction(()=>document.querySelectorAll('#menu-presence-list canvas').length===4);
    check(await page.evaluate(()=>{
      const a=document.querySelector('#player-avatar'),t=document.querySelector('#player-display');
      return a.width>0 && a.getBoundingClientRect().right<=t.getBoundingClientRect().left && JSON.parse(a.dataset.avatar)[0]===__presence.getAvatar();
    }),'own actual avatar sits left of player name');
    check(await page.evaluate(()=>{
      const rows=[...document.querySelectorAll('#menu-presence-list .online-player')];
      return rows.some(r=>r.textContent==='Sarah (77p)' && JSON.parse(r.querySelector('canvas').dataset.avatar)[0]==='053124101h2q1d2s1') && rows.some(r=>r.textContent==='Anonym (12p)' && JSON.parse(r.querySelector('canvas').dataset.avatar)[0]==='240304100h8q2') && rows.some(r=>r.textContent==='Äldre spelare (4p)');
    }),'online named, anonymous and legacy visitors get portraits with score');
    const before=await page.locator('#player-avatar').evaluate(c=>c.toDataURL());
    await page.evaluate(async()=>{const {decodeAvatarLook}=await import('/src/config.js');__app.avatarCustomizer.setLook(decodeAvatarLook('053124101h2q1'));await __presence.beat()});
    const after=await page.locator('#player-avatar').evaluate(c=>c.toDataURL());
    check(before!==after,'editing appearance repaints own thumbnail');
    check(await page.evaluate(()=>{
      const row=[...document.querySelectorAll('#menu-presence-list .online-player')].find(r=>r.textContent.startsWith('Olof '));
      return JSON.parse(row.querySelector('canvas').dataset.avatar)[0]===__presence.getAvatar();
    }),'next existing heartbeat updates own online portrait');
    await page.locator('#menu-presence').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/start-avatars.png`});
    await page.setViewportSize({width:844,height:390});await page.locator('#menu-presence').scrollIntoViewIfNeeded();
    check(await page.locator('#menu-presence').evaluate(el=>el.getBoundingClientRect().right<=innerWidth),'narrow landscape list fits viewport');
    await page.screenshot({path:`${out}/landscape-avatars.png`});
    check(errors.length===0,'zero browser errors');
    fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,errors},null,2));
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
