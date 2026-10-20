// #1379: real app's fixed collection, per-variant albums and preserved #1257 photo actions.
// Actual app/IndexedDB, seeded portraits from the real cat model; no production services.
const kit = require('./testkit.cjs');
const fs = require('node:fs');
const game=process.argv[2]||'http://localhost:8771', out=process.argv[3]||'/tmp/catbinder1379';
fs.mkdirSync(out,{recursive:true});
let failed=0;
const check=(ok,label,data)=>{console.log(`${ok?'PASS':'FAIL'} ${label}${data===undefined?'':' '+JSON.stringify(data)}`);if(!ok)failed++;};
const state=page=>page.evaluate(()=>{const p=__app.binderPanel;return {page:p.index,album:p.albumKey,view:!!p.view,asking:!!p.asking,open:p.open};});
const shot=async(page,name)=>{await page.screenshot({path:`${out}/${name}.png`});};
const click=async(page,sel,mobile)=>mobile?page.locator(sel).first().tap():page.locator(sel).first().click();
(async()=>{
 const browser=await kit.launch();
 try{
  for(const mobile of [false,true]){
   const tag=mobile?'mobile':'desktop';
   const {page,ctx}=await kit.open(browser,`${game}/?shot&freeze&time=12`,{lazy:true,viewport:mobile?{width:390,height:844}:{width:1280,height:800},contextOptions:mobile?{hasTouch:true,isMobile:true}:{},init:()=>{localStorage.setItem('lunden.name','Pärmtest');sessionStorage.setItem('lunden.nameSkipped','1');}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.evaluate(async()=>{
    const a=__app;await a.catCardsLoaded;a.renderer.setAnimationLoop(null);a.showOverlay(false);
    a.catCards.stats.byBreed={};a.catCards.stats.petsByBreed={};a.catCards.stats.hugsByBreed={};a.catCards.stats.miele=0;
    a.showBinder(true);
   });
   const empty=await page.evaluate(()=>({slots:[...document.querySelectorAll('.page [data-slot]')].map(e=>e.dataset.slot),unknown:document.querySelectorAll('.page .unknown').length,pages:__app.binderPanel.pages.length}));
   check(empty.unknown===4&&empty.pages===2&&empty.slots[0]==='huskatt'&&empty.slots[3]==='maine coon',`${tag}: empty first page has four fixed silhouette pockets`,empty);
   await shot(page,`${tag}-empty`);
   await click(page,'[data-nav=next]',mobile);
   check(await page.evaluate(()=>[...document.querySelectorAll('.page [data-slot]')].map(e=>e.dataset.slot).join('|')==='norsk skogkatt|perser|sphynx|Miele'),`${tag}: second page has the remaining four fixed variants`);
   await click(page,'[data-nav=prev]',mobile);
   await page.evaluate(async()=>{
    const a=__app,T=await import('three'),{CatSpawner}=await import('/src/cat.js'),{snapshot}=await import('/src/catphoto.js'),{CAT_CARD:C}=await import('/src/config.js');
    const scene=new T.Scene();scene.background=new T.Color('#c3d9db');scene.add(new T.HemisphereLight(0xffffff,0x536050,3));
    const cam=new T.PerspectiveCamera(45,4/3,.01,100);cam.position.set(.42,.7,1.25);cam.lookAt(0,.35,0);
    const photos={};
    const preview=new CatSpawner(a.world,()=>.5);scene.add(preview.object);preview.object.visible=true;
    for(const b of C.breeds){const breed=a.BREEDS.find(x=>x.name===b.key),coat=(breed?.coats??a.VARIANTS)[0];preview.setCat(breed,coat);scene.updateMatrixWorld(true);const target=preview.head.getWorldPosition(new T.Vector3());cam.position.copy(target).add(new T.Vector3(.42,.25,1.25));photos[b.key]=snapshot(a.renderer,scene,cam,target,320,240);}
    window.binderPortraits=photos;
    for(const key of ['huskatt','perser','siames','sphynx'])await a.catCards.add(key,{name:key==='huskatt'?'Maja':key,data:photos[key],coat:key==='huskatt'?'svartvit':null});
    a.catCards.stats.byBreed.huskatt=3;a.catCards.recordPet('huskatt');a.catCards.recordHug('huskatt');a.binderPanel.render();
   });
   const half=await page.evaluate(()=>({slots:[...document.querySelectorAll('.page [data-slot]')].map(e=>e.dataset.slot),found:document.querySelectorAll('.page button.collection-card').length,count:document.querySelector('#binder-view .count').textContent}));
   check(half.found===2&&half.count.startsWith('4 av 8')&&half.slots.join('|')===empty.slots.join('|'),`${tag}: partial collection fills original pockets without reordering`,half);
   check(await page.locator('.collection-card[data-slot=huskatt] img').count()===1,`${tag}: collected card shows the existing encounter portrait`);
   check(await page.evaluate(()=>[...document.querySelectorAll('.collection-card .portrait img')].every(img=>img.getBoundingClientRect().height<=img.parentElement.getBoundingClientRect().height+.5&&getComputedStyle(img).objectFit==='contain')),`${tag}: existing portraits fit completely inside their card frames`);
   await shot(page,`${tag}-partial`);
   await click(page,'.collection-card[data-slot=huskatt]',mobile);
   check((await state(page)).album==='huskatt'&&!((await state(page)).view),`${tag}: card opens its variant album`);
   check(await page.evaluate(()=>{const t=document.querySelector('.album').textContent;return /Vikt/.test(t)&&/Klappad1 gång/.test(t)&&/Kramad1 gång/.test(t)&&/3 gånger/.test(t)&&document.querySelectorAll('.album .photo').length===8;}),`${tag}: album keeps breed facts/counters and prepares eight photo spaces`);
   await click(page,'.album .photo:not(.empty) [data-act=look]',mobile);
   check((await state(page)).view,`${tag}: encounter photograph opens enlarged`);
   await click(page,'.viewer [data-act=save]',mobile);
   check(await page.evaluate(()=>__app.catCards.of('huskatt')[0].saved&&document.querySelector('.viewer [data-act=save]').getAttribute('aria-pressed')==='true'),`${tag}: save flag and accessible button still work`);
   check(await page.evaluate(()=>document.activeElement?.closest('.viewer')&&document.activeElement.dataset.act==='save'),`${tag}: save keeps focus inside the enlarged viewer`);
   await click(page,'.viewer [data-act=save]',mobile);
   check(await page.evaluate(()=>!__app.catCards.of('huskatt')[0].saved&&document.querySelector('.viewer [data-act=save]').getAttribute('aria-pressed')==='false'),`${tag}: the enlarged view also unmarks a saved photo`);
   await click(page,'.viewer [data-act=save]',mobile);
   await click(page,'.viewer [data-act=throw]',mobile);
   check((await state(page)).asking,`${tag}: discard asks before deleting`);
   check(await page.evaluate(()=>document.activeElement?.dataset.act==='no'),`${tag}: safe keep answer has initial focus`);
   await page.keyboard.press('Escape');check(!(await state(page)).asking&&(await state(page)).view,`${tag}: Escape cancels discard and keeps the enlarged photo`);
   await page.keyboard.press('Escape');check(!(await state(page)).view&&(await state(page)).album==='huskatt',`${tag}: Escape from photo returns to its album`);
   await page.keyboard.press('Escape');check(!(await state(page)).album&&(await state(page)).open,`${tag}: Escape from album returns to the collection`);
   check(await page.evaluate(()=>document.activeElement?.dataset.id==='huskatt'),`${tag}: keyboard focus returns to the selected card`);
   await page.evaluate(async()=>{
    const a=__app,C=(await import('/src/config.js')).CAT_CARD;
    for(const b of C.breeds)if(!a.catCards.slot(b.key).has)await a.catCards.add(b.key,{name:b.label,data:binderPortraits[b.key]});
    for(let i=1;i<5;i++)await a.catCards.add('huskatt',{name:'Maja '+i,data:binderPortraits.huskatt,kitten:i===4});
    const old={id:'binder-legacy',breed:C.legacy,name:'Äldre vän',data:binderPortraits.huskatt,time:1,saved:true,legacy:true};await a.catCards.store.put(old);a.catCards.cards.push(old);
    a.binderPanel.render();
   });
   check(await page.evaluate(()=>__app.catCards.collected()===8&&__app.catCards.of('huskatt').length===5&&__app.binderPanel.pages.length===3),`${tag}: complete collection and five-photo data coexist with the legacy page`);
   await shot(page,`${tag}-full-first`);
   for(const [width,height] of mobile?[[844,390],[390,844]]:[[1280,800]]){
    await page.setViewportSize({width,height});
    const fit=await page.evaluate(()=>{const p=document.querySelector('.binder').getBoundingClientRect();return [...document.querySelectorAll('.binder .pager button,.binder .dialog-close')].every(e=>{const r=e.getBoundingClientRect();return r.width>=43.5&&r.height>=43.5&&r.left>=0&&r.right<=innerWidth&&r.top>=p.top&&r.bottom<=Math.min(p.bottom,innerHeight);});});
    check(fit,`${tag} ${width}×${height}: full collection keeps pager and close fully accessible`);
    await shot(page,`${tag}-full-${width}x${height}`);
   }
   await click(page,'[data-nav=next]',mobile);await shot(page,`${tag}-full-second`);
   check(await page.evaluate(()=>{const c=document.querySelector('[data-slot=Miele]');return !!c&&c.classList.contains('fx-4')&&c.classList.contains('miele')&&c.querySelectorAll('.star-fx').length===13;}),`${tag}: Miele keeps the final fixed slot and legendary appearance`);
   if(!mobile){await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');check((await state(page)).page===1,'desktop: native paging keys move between collection pages');}
   await click(page,'[data-nav=next]',mobile);
   check(await page.locator('.page .photo.saved').count()===1,`${tag}: legacy photographs remain accessible on their own page`);
   await page.keyboard.press('Home');
   await click(page,'.collection-card[data-slot=huskatt]',mobile);
   check(await page.locator('.album .photo:not(.empty)').count()===5,`${tag}: album displays all five existing encounter photographs`);
   await shot(page,`${tag}-album-five`);
   await click(page,'.album .photo:not(.empty) [data-act=look]',mobile);await shot(page,`${tag}-photo`);
   await page.keyboard.press('ArrowRight');check(await page.locator('.viewer .cap').textContent().then(t=>/foto 2 av 5/.test(t)),`${tag}: native arrows browse photographs rather than collection pages`);
   await page.keyboard.press('Escape');
   await click(page,'.album .photo:not(.empty) [data-act=throw]',mobile);await click(page,'.confirm [data-act=no]',mobile);
   check(await page.locator('.album .photo:not(.empty)').count()===5,`${tag}: keep answer preserves all photographs`);
   const before=await page.evaluate(()=>__app.catCards.cards.map(({id,data,saved})=>({id,data,saved})).sort((a,b)=>a.id.localeCompare(b.id)));
   await page.reload({waitUntil:'commit'});await page.waitForFunction(()=>window.__app?.catCardsLoaded,null,{timeout:600000});
   await page.evaluate(async()=>{await __app.catCardsLoaded;__app.renderer.setAnimationLoop(null);__app.showOverlay(false);__app.showBinder(true);});
   const after=await page.evaluate(()=>__app.catCards.cards.map(({id,data,saved})=>({id,data,saved})).sort((a,b)=>a.id.localeCompare(b.id)));
   check(JSON.stringify(before)===JSON.stringify(after),`${tag}: actual reload preserves every photo byte, id and save flag`);
   await click(page,'.collection-card[data-slot=huskatt]',mobile);
   check(await page.evaluate(()=>__app.catCards.of('huskatt').length===5&&__app.catCards.of('huskatt').filter(c=>c.saved).length===1),`${tag}: old five-image save data survives the UI change`);
   // Simulate the next task's eight stored images without changing collection/add/migration rules.
   await page.evaluate(()=>{const a=__app,base=a.catCards.of('huskatt')[0];for(let i=0;i<3;i++)a.catCards.cards.push({...base,id:'future-'+i,time:Date.now()+i});a.binderPanel.render();});
   check(await page.locator('.album .photo:not(.empty)').count()===8,`${tag}: presentation already supports eight incoming photos`);
   await click(page,'.album .photo:not(.empty) [data-act=look]',mobile);await page.keyboard.press('ArrowLeft');
   check(await page.locator('.viewer .cap').textContent().then(t=>/foto 8 av 8/.test(t)),`${tag}: enlarged viewer can browse all eight future images`);
   await page.keyboard.press('Escape');await click(page,'.album [data-act=aclose]',mobile);
   // Preserve the actual confirmed-delete path, including a still-open remaining photo.
   await page.evaluate(async()=>{const a=__app,c=a.catCards.of('perser')[0];await a.catCards.add('perser',{name:'Perser igen',data:c.data});a.binderPanel.go(1);a.binderPanel.openAlbum('perser');});
   await click(page,'.album .photo:not(.empty) [data-act=look]',mobile);
   if(mobile){
    for(const [width,height] of [[844,390],[390,844]]){
     await page.setViewportSize({width,height});
     const fit=await page.evaluate(()=>{const r=document.querySelector('.vbox').getBoundingClientRect(),bs=[...document.querySelectorAll('.viewer button')].map(e=>e.getBoundingClientRect());return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&bs.every(b=>b.width>=43.5&&b.height>=43.5&&b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight);});
     check(fit,`mobile ${width}×${height}: enlarged photo and all touch buttons fit`);
     await shot(page,`mobile-viewer-${width}x${height}`);
    }
    await page.setViewportSize({width:844,height:390});
   }
   await click(page,'.viewer [data-act=throw]',mobile);
   check(await page.evaluate(()=>{const r=document.querySelector('.confirm .cbox').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),`${tag}: discard question fits the viewport`);
   await click(page,'.confirm [data-act=yes]',mobile);
   await page.waitForFunction(()=>__app.catCards.of('perser').length===1&&!document.querySelector('.viewer').hidden&&/foto 1 av 1/.test(document.querySelector('.viewer .cap').textContent));
   check(await page.evaluate(()=>!document.querySelector('.viewer').hidden&&/foto 1 av 1/.test(document.querySelector('.viewer .cap').textContent)&&__app.catCards.of('perser')[0].name==='perser'),`${tag}: confirmed deletion keeps the remaining photo in the viewer`);
   await click(page,'.viewer [data-act=vclose]',mobile);await click(page,'.album [data-act=aclose]',mobile);
   // Existing five-photo rotation/refusal remains visible in the new per-variant album.
   const rot=await page.evaluate(async()=>{
    const a=__app,C=a.catCards,data=C.of('huskatt')[0].data;
    for(const c of [...C.of('huskatt')])await C.discard(c.id);
    for(let i=0;i<5;i++)await C.add('huskatt',{name:'H'+i,data});
    await C.toggleSave(C.of('huskatt')[0].id);a.binderPanel.go(0);a.binderPanel.openAlbum('huskatt');
    const line=document.querySelector('.album .slotline').textContent,out=document.querySelector('.album .photo.next-out figcaption b')?.textContent;
    await C.add('huskatt',{name:'H5',data});
    return{line,out,names:C.of('huskatt').map(c=>c.name).join(),notice:document.getElementById('cat-notice').textContent};
   });
   check(rot.out==='H1'&&/äldsta osparade fotot \(H1\)/.test(rot.line),`${tag}: album identifies the oldest unsaved photograph`);
   check(rot.names==='H0,H2,H3,H4,H5'&&/äldsta osparade fotot \(H1\) byttes ut/.test(rot.notice),`${tag}: rotation keeps saved H0 and shows its actual toast`,rot);
   const full=await page.evaluate(async()=>{
    const C=__app.catCards;for(const c of C.of('huskatt'))if(!c.saved)await C.toggleSave(c.id);
    document.getElementById('cat-notice').hidden=true;const r=await C.add('huskatt',{name:'Ny',data:C.of('huskatt')[0].data});
    const notice=document.getElementById('cat-notice');return {refused:r===null,n:C.of('huskatt').length,notice:notice.textContent,visible:!notice.hidden,line:document.querySelector('.album .slotline').textContent,full:document.querySelector('.album .slotline').classList.contains('full')};
   });
   check(full.refused&&full.n===5&&full.visible&&/alla fem kort för Huskatt är sparade/.test(full.notice),`${tag}: all-saved refusal still shows the actual game toast`,full);
   check(full.full&&/Alla platser är sparade/.test(full.line),`${tag}: album visibly explains the full saved-photo capacity`);
   await click(page,'.album .photo:not(.empty) [data-act=save]',mobile);
   check(await page.evaluate(async()=>!!(await __app.catCards.add('huskatt',{name:'Ny2',data:__app.catCards.of('huskatt')[0].data}))),`${tag}: unmarking one saved photo permits a new find`);
   await click(page,'.album [data-act=aclose]',mobile);
   if(mobile){
    await page.setViewportSize({width:390,height:844});
    const fit=await page.evaluate(()=>[...document.querySelectorAll('#binder-view .collection-card,#binder-view .pager button')].filter(e=>e.getBoundingClientRect().width).every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth;}));
    check(fit,'mobile: collection and navigation touch targets fit the narrow viewport');
   }
   await page.emulateMedia({reducedMotion:'reduce'});await click(page,'[data-nav=next]',mobile);
   check(await page.evaluate(()=>[...document.querySelectorAll('.page .fx')].every(e=>getComputedStyle(e).animationName==='none')) ,`${tag}: reduced motion keeps still rarity decoration`);
   await page.keyboard.press('Escape');check(!(await state(page)).open,`${tag}: final Escape closes the binder`);
   check(errors.length===0,`${tag}: no page errors`,errors);
   await ctx.close();
  }
 }finally{await browser.close();}
 console.log(failed?`${failed} FAILED`:'ALL PASSED');process.exitCode=failed?1:0;
})();
