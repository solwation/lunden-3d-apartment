// Real start/menu route and production profile, avatar, world, stats and IndexedDB code.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:8137', out = process.argv[3] || '/tmp/playerprofiles';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 820 } });
  const page = await ctx.newPage(), errors = [], checks = [];
  page.on('pageerror', e => errors.push(e.message));
  const check = (value, name) => { assert.ok(value, name); checks.push(name); console.log('PASS', name); };
  const ready = async name => {
    await page.waitForFunction(n => window.__app?.leaderboard?.name === n && window.__app.renderer && document.getElementById('loading').hidden, name, { timeout: 300000 });
  };
  try {
    await page.goto(`${base}/?test=lazy&cloud=&mp=0`);
    await ready('');
    await page.locator('#player-name').fill('Olof'); await page.locator('#player-ok').click();
    const initial = await page.evaluate(async () => {
      const a = __app, { profiles, playerLocalStorage: s } = await import('/src/playerprofiles.js');
      const { decodeAvatarLook, encodeAvatarLook } = await import('/src/config.js');
      a.avatarCustomizer.setLook(decodeAvatarLook('240302101h8q3'));
      s.setItem('lunden.avatar', encodeAvatarLook(a.avatarCustomizer.getLook()));
      a.bump('petted');
      a.life.extras.get('mess').load({v:1,s:[['dust',0,2,0.01,3,'floor','hall',0.731,0]]});
      a.life.flush();
      const doorBefore = a.world.doors[0].isOpen;
      a.world.doors[0].toggle();
      await a.catCardsLoaded;
      const { withStore } = await import('/src/idb.js');
      await withStore('catPhotos', 'readwrite', st => st.put({id:123, data:'olof-photo'}));
      return { id: profiles.id, avatar: s.getItem('lunden.avatar'), score: a.totalScore(), door: a.world.doors[0].isOpen, doorBefore, dust: a.life.serialize().x.mess };
    });
    await page.locator('#player-new').click();
    await page.locator('#player-name').fill('Sarah'); await page.locator('#player-ok').click(); await ready('Sarah');
    const fresh = await page.evaluate(async () => {
      const { profiles, playerLocalStorage: s } = await import('/src/playerprofiles.js');
      const { withStore } = await import('/src/idb.js');
      return { id: profiles.id, score: __app.totalScore(), petted: __app.stats.petted, door: __app.world.doors[0].isOpen, dust: __app.life.serialize().x?.mess, photos: (await withStore('catPhotos','readonly',st => st.getAll())).find(p => p.id === 123) };
    });
    console.log('FRESH',JSON.stringify({fresh,initial}));
    check(fresh.id !== initial.id && fresh.petted === 0 && fresh.score < initial.score && fresh.door === initial.doorBefore && !fresh.photos && !fresh.dust?.s?.some(s=>s[7]===0.731), 'new UUID starts with own score, home and photos');
    await page.evaluate(async () => {
      const { playerLocalStorage:s } = await import('/src/playerprofiles.js');
      const { decodeAvatarLook, encodeAvatarLook } = await import('/src/config.js');
      __app.avatarCustomizer.setLook(decodeAvatarLook('053124101h2q1'));
      s.setItem('lunden.avatar', encodeAvatarLook(__app.avatarCustomizer.getLook()));
    });
    await page.locator('#player-new').click();
    check(await page.locator('#saved-players canvas').count() === 2, 'one avatar miniature per saved player');
    await page.screenshot({path:`${out}/players.png`});
    await page.getByRole('button', {name:'Olof', exact:true}).click(); await ready('Olof');
    check(await page.evaluate(async expected => {
      const {profiles,playerLocalStorage:s}=await import('/src/playerprofiles.js');
      const {encodeAvatarLook}=await import('/src/config.js');
      const {withStore}=await import('/src/idb.js');
      return profiles.id===expected.id && s.getItem('lunden.avatar')===expected.avatar && encodeAvatarLook(__app.avatarCustomizer.getLook())===expected.avatar && __app.totalScore()===expected.score && __app.world.doors[0].isOpen===expected.door && JSON.stringify(__app.life.serialize().x?.mess)===JSON.stringify(expected.dust) && ((await withStore('catPhotos','readonly',st=>st.getAll())).find(p => p.id === 123)).data==='olof-photo';
    }, initial), 'returning player restores UUID, exact avatar, score, dust, door and personal photo');
    await page.reload(); await ready('Olof');
    check(await page.evaluate(async expected=>{
      const {playerLocalStorage:s}=await import('/src/playerprofiles.js');
      return s.getItem('lunden.avatar')===expected.avatar && __app.totalScore()===expected.score && __app.world.doors[0].isOpen===expected.door && JSON.stringify(__app.life.serialize().x?.mess)===JSON.stringify(expected.dust);
    },initial), 'reload retains avatar, score, dust and home');
    await page.locator('#player-new').click();
    page.once('dialog', async d=>{check(d.message().includes('Sarah')&&d.message().includes('all dess lokala speldata'),'deletion explicitly confirms player and all local data');await d.dismiss()});
    await page.getByRole('button',{name:'Ta bort Sarah',exact:true}).click();
    check(await page.locator('#saved-players li').count()===2,'cancel preserves both accounts');
    page.once('dialog', d=>d.accept()); await page.getByRole('button',{name:'Ta bort Sarah',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('#saved-players li').length===1);
    await page.screenshot({path:`${out}/after-delete.png`});
    check(await page.evaluate(async()=> (await import('/src/playerprofiles.js')).profiles.list().length===1),'confirmed deletion removes only selected account');
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Ta bort Olof',exact:true}).click(); await ready('');
    check(await page.evaluate(async()=>{
      const {profiles,playerLocalStorage:s}=await import('/src/playerprofiles.js');
      const {withStore}=await import('/src/idb.js');
      return profiles.list().length===1 && __app.stats.petted===0 && __app.totalScore()===0 && !((await withStore('catPhotos','readonly',st=>st.getAll())).find(p => p.id === 123));
    }),'deleting active last player creates clean anonymous profile');
    check(errors.length===0,`zero browser errors: ${errors.join('; ')}`);
    fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,errors,initial},null,2));
  } catch (error) { fs.writeFileSync(`${out}/failure.json`, JSON.stringify({checks,errors,error:String(error)},null,2)); await page.screenshot({path:`${out}/failure.png`}).catch(()=>{}); throw error; } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
