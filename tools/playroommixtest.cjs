// #1621: real World, the speaker/DJ-bench choice menu, a touch tap on "Nästa låt" and "Mixa till nästa låt";
// measures the two decks' fader gains and media elements over time and takes menu pictures.
const fs=require('node:fs'),assert=require('node:assert/strict'),kit=require('./testkit.cjs');
const [game='http://localhost:8621',out='/tmp/lekstuga1621']=process.argv.slice(2);
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await kit.launch(['--autoplay-policy=no-user-gesture-required']);try{
 const {page}=await kit.open(browser,`${game}/?shot&cloud=&mp=0&freeze&time=12&weather=clear`,{lazy:true,timeout:180000,viewport:{width:844,height:390},contextOptions:{hasTouch:true,isMobile:true}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(async()=>{const a=__app,C=await import('/src/config.js');a.showOverlay(false);document.getElementById('player-dialog')?.remove();a.touch.enabled=true;document.body.classList.add('touch');a.use({kind:'playhouse'});});
 await page.waitForFunction(()=>__app.player.inPlayroom);
 await page.evaluate(async()=>{const a=__app,C=await import('/src/config.js'),R=C.PLAYROOM,s=R.speakers;window.C=C;a.player.spawn(R.x+s.x[0]+.2,R.z+s.z+2,0);for(let i=0;i<10;i++)a.player.update(1/60);const cam=a.camera;cam.updateMatrixWorld(true);const d=new cam.position.constructor(R.x+s.x[0],s.y,R.z+s.z).sub(cam.position);cam.rotation.set(Math.atan2(d.y,Math.hypot(d.x,d.z)),Math.atan2(-d.x,-d.z),0,'YXZ');});
 const rows=()=>page.evaluate(()=>[...document.querySelectorAll('#choices button')].map(b=>b.textContent));
 const aim=()=>page.evaluate(()=>{__app.step(0);});
 await aim();let r=await rows();console.log('rows (off)',r);assert(r.some(t=>/Spela musik/.test(t)));assert(!r.some(t=>/låt/.test(t)));
 await page.locator('#choices button',{hasText:'Spela musik'}).tap();await aim();await page.waitForTimeout(800);
 r=await rows();console.log('rows (playing)',r);assert(r.some(t=>/Nästa låt/.test(t))&&r.some(t=>/Mixa till nästa/.test(t)));
 await page.evaluate(()=>{__app.step(0);__app.renderer.render(__app.scene,__app.camera);});await page.screenshot({path:`${out}/1621-meny-spelar.png`});
 const m=()=>page.evaluate(()=>{const p=__app.world.playroom.music;return{idx:p.index,state:p.state,mixing:!!p.mixing,decks:[p.mixing?.outgoing??p.deck,p.mixing?.incoming].filter(Boolean).map(d=>({src:d.file.el?.src.split('/').pop()??null,paused:d.file.el?.paused,t:+(d.file.el?.currentTime??0).toFixed(2),g:+d.fade.gain.value.toFixed(3)}))};});
 const s0=await m();console.log('start',JSON.stringify(s0));
 await page.locator('#choices button',{hasText:/^Nästa låt/}).tap();await aim();await page.waitForTimeout(500);const s1=await m();console.log('after cut',JSON.stringify(s1));assert.equal(s1.idx,1);assert.equal(s1.decks.length,1);assert.notEqual(s1.decks[0].src,s0.decks[0].src);
 await aim();await page.locator('#choices button',{hasText:/^Mixa till nästa/}).tap();await page.waitForTimeout(200);await aim();
 const seq=[];for(let i=0;i<10;i++){seq.push(await m());await page.waitForTimeout(900);}
 await page.evaluate(()=>{});console.log(seq.map(x=>JSON.stringify(x)).join('\n'));
 const mid=seq.find(x=>x.mixing&&x.decks.length===2&&x.decks.every(d=>d.g>.1&&d.g<.99&&!d.paused));assert(mid,'two decks overlapping, both audible');
 const first=seq.find(x=>x.mixing);assert(first.decks[0].g>mid.decks[0].g||first===mid);
 const last=seq[seq.length-1];assert(!last.mixing&&last.decks.length===1&&last.decks[0].g===1&&last.idx===2,'mix finished, old track dropped');
 await aim();await page.evaluate(()=>{__app.step(0);__app.renderer.render(__app.scene,__app.camera);});await page.screenshot({path:`${out}/1621-meny-efter-mix.png`});
 // mix picture: start another and capture mid-fade menu
 await page.locator('#choices button',{hasText:/^Mixa till nästa/}).tap();await page.waitForTimeout(2500);await aim();console.log('rows (mixing)',await rows());await page.evaluate(()=>{__app.step(0);__app.renderer.render(__app.scene,__app.camera);});await page.screenshot({path:`${out}/1621-menyn-mixar.png`});
 assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/result.json`,JSON.stringify({s0,s1,seq,errors},null,2));console.log('PASS touch menu: cut, crossfade overlap, old deck dropped');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
