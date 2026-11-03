// #1830: real-scene raw-fish and outdoor pet accounting. Caught-fish fixtures, not the fishing minigame.
const kit=require('./testkit.cjs'),fs=require('node:fs');
const [base='http://localhost:8911',out='/tmp/catmedal']=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
const checks=[];const check=(ok,name,data)=>{checks.push({ok:!!ok,name,data});console.log(`${ok?'PASS':'FAIL'} ${name} ${JSON.stringify(data)}`);};
(async()=>{const browser=await kit.launch(),errors=[];try{
 const {page}=await kit.open(browser,`${base}/?life&time=12&month=7&day=15&weather=clear&freeze&cloud=`,{timeout:900000,init:()=>{localStorage.setItem('lunden.name','Fia');sessionStorage.setItem('lunden.nameSkipped','1');}});
 page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.__app?.outdoorCats&&__app.fishing,null,{timeout:900000});await kit.skipNameDialog(page);
    await page.evaluate(async () => {
      const a = __app, O = a.outdoorCats; a.renderer.setAnimationLoop(null); a.showOverlay(false);
      const [THREE, cfg] = await Promise.all([import('three'), import('/src/config.js')]);
      window.T = { a, O, THREE, cfg, Fi: a.fishing, clock: 1793491200 + 5000,
        run(n, dt = 0.1) { for (let i = 0; i < n; i++) { T.clock += dt; a.step(dt); } },
        stand(x, z, yaw = 0) { a.player.spawn(x, z, yaw); a.step(0.05); },
        look(x, y, z) { const c = a.camera.position, dx = x - c.x, dz = z - c.z; a.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); a.camera.updateMatrixWorld(true); },
        cat(name) { return O.cats.find((c) => c.name === name); },
        /** the ordinary cat busy: shown sitting indoors in the flat, far from the lawns */
        busy() { const k = a.cat, b = a.BREEDS[0]; k.hide(); k.setCat(b, b.coats[0], false); k.object.visible = true; k.leaving = null; k.fish = null; k.ignored = -1e9; k.awayFor = 0; k.object.position.set(2, 11.8, -40); k.photoDone = true; },
        /** a spot `r` m from cat `c` the cat can walk to (no road, water, drop or wall) */
        spot(c, r) { for (let k = 0; k < 24; k++) { const an = k * 0.2618, x = c.x + Math.cos(an) * r, z = c.z + Math.sin(an) * r; if (c.clearOut(c.x, c.z, x, z)) return { x, z }; } return null; },
        lay(raw, at) { const y = O.ground(at.x, at.z), f = T.Fi.addFish({ species: 'abborre', cm: 24, raw }, new THREE.Vector3(at.x, y, at.z)); f.take(); f.placeAt(new THREE.Vector3(at.x, y, at.z), 0.3); return f; },
        clear() { for (const f of T.Fi.fish) f.remove(); T.Fi.fish = []; },
        /** stop the cats' loops while a check runs (a resting cat; the clock stays still) */
        still(c) { for (let i = 0; i < 400 && O.scheduled(c).walking; i++) T.clock += 2; O.cats.forEach((q) => { q.st = 'route'; q.alpha = 1; O.place(q, O.scheduled(q)); }); },
      };
      O.now = () => T.clock;
    });

 // Optional capture-only refresh: same real promoted/held-fish flow, a lower camera after eating starts.
 if(process.argv.includes('--capture-only')){
 const capture=await page.evaluate(()=>{const {a,O}=T,c=T.cat('Sotis');a.cat.hide();a.cat.awayFor=0;T.still(c);O.promote(c);const k=a.cat,p=k.object.position;
 T.stand(p.x+1.8,p.z);T.look(p.x,p.y+.15,p.z);const f=T.Fi.addFish({species:'abborre',cm:24,raw:true},a.player.pos.clone());f.take();
 for(let i=0;i<1000&&!f.broken;i++){T.run(1,.05);if(k.fish?.phase==='eat'&&k.fish.t>1)break;}
 const at=k.object.position.clone();a.camera.position.set(at.x+1.3,at.y+.8,at.z+1.4);T.look(at.x,at.y+.22,at.z);a.camera.updateMatrixWorld(true);a.renderer.render(a.scene,a.camera);
 return {name:k.outdoorCat,phase:k.fish?.phase,held:a.heldItem()===f,scale:f.model.scale.x,camera:a.camera.position.toArray()};});
 check(capture.phase==='eat'&&capture.held,'capture-only promoted cat eating held raw fish',capture);
 await kit.shot(page,`${out}/outdoor-held-fish.png`,{frames:1});return;
 }
 // The roaming cat eats an actually held raw caught-fish object through main's onFed callback.
 const roam=await page.evaluate(()=>{
 const {O,a,THREE}=T,c=T.cat('Smulan');T.still(c);T.busy();const s=T.spot(c,4);T.stand(s.x,s.z);T.look(c.x,O.ground(c.x,c.z)+.2,c.z);
 const f=T.Fi.addFish({species:'mört',cm:18,raw:true},a.player.pos.clone());f.take();
 const n=a.stats.catFishFeeds??0,score=a.totalScore(),e=a.stats.fishEaten??0,q=JSON.stringify(a.stats.fishQuestSteps??null),held=a.heldItem()===f;
 for(let i=0;i<1200&&!f.broken;i++)T.run(1,.05);T.run(30,.05);
 return {held,gone:f.broken,handEmpty:!a.heldItem(),feeds:(a.stats.catFishFeeds??0)-n,points:a.totalScore()-score,fishEaten:(a.stats.fishEaten??0)-e,questSame:JSON.stringify(a.stats.fishQuestSteps??null)===q};});
 check(roam.held&&roam.gone&&roam.handEmpty&&roam.feeds===1&&roam.points===5&&roam.fishEaten===0&&roam.questSame,'roaming cat: held raw fish once, five existing points',roam);
 // A nearby outdoor cat is promoted by production update, preserving the original onPet callback.
 const pet=await page.evaluate(()=>{
 const {a,O}=T,c=T.cat('Sotis'),k=a.cat;T.clear();k.hide();k.awayFor=0;T.still(c);T.stand(c.x+6,c.z);T.run(2,.05);T.stand(c.x+2.2,c.z+.6);
 for(let i=0;i<60&&c.st!=='bound';i++)T.run(1,.05);
 const n=a.stats.petted??0,score=a.totalScore(),empty=!a.heldItem();k.interact.options().find(o=>o.id==='pet').run();T.run(10,.05);
 const first=(a.stats.petted??0)-n;k.interact.options().find(o=>o.id==='pet').run();
 const p=k.object.position;a.camera.position.set(p.x+1.1,p.y+.8,p.z+1.5);T.look(p.x,p.y+.3,p.z);
 return {name:k.outdoorCat,bound:c.st,empty,petting:k.petting,first,afterRepeated:(a.stats.petted??0)-n,points:a.totalScore()-score};});
 check(pet.bound==='bound'&&pet.name==='Sotis'&&pet.empty&&pet.petting&&pet.first===1&&pet.afterRepeated===1,'promoted outdoor cat: barehand pet uses petted once per ongoing pat',pet);
 await kit.shot(page,`${out}/outdoor-pet.png`,{frames:1});
 // The promoted cat now uses CatSpawner's same raw-fish logic as the indoor cat.
 const feed=await page.evaluate(()=>{
 const {a,O}=T,k=a.cat;k.stopPetting();const p=k.object.position;T.stand(p.x+1.8,p.z);T.look(p.x,p.y+.15,p.z);k.ignored=0;k.nextTail=1e9;
 const f=T.Fi.addFish({species:'abborre',cm:24,raw:true},a.player.pos.clone());f.take();T.feedBefore={n:a.stats.catFishFeeds??0,score:a.totalScore(),f};
 let eating=false;for(let i=0;i<1000&&!f.broken;i++){T.run(1,.05);if(k.fish?.phase==='eat'&&k.fish.t>1){eating=true;break;}}
 return {held:!f.broken&&a.heldItem()===f,eating,phase:k.fish?.phase,outdoorCat:k.outdoorCat};});
 check(feed.held&&feed.eating&&feed.outdoorCat==='Sotis','promoted cat eats raw caught fish out of hand',feed);
 await kit.shot(page,`${out}/outdoor-held-fish.png`,{frames:1});
 const done=await page.evaluate(()=>{const {a}=T,{n,score,f}=T.feedBefore;for(let i=0;i<600&&!f.broken;i++)T.run(1,.05);T.run(30,.05);const result={gone:f.broken,handEmpty:!a.heldItem(),feeds:(a.stats.catFishFeeds??0)-n,points:a.totalScore()-score};const p=a.cat.object.position.clone();a.cat.leave();result.fadeInPlace=a.cat.leaving.d===0;T.run(2,.05);result.fadeMoved=a.cat.object.position.distanceTo(p);return result;});
 check(done.gone&&done.handEmpty&&done.feeds===1&&done.points===5&&done.fadeInPlace&&done.fadeMoved<.001,'promoted cat completes meal: counter once and five existing points',done);
 // Indoor fixture uses the exact same CatSpawner instance/callback at the actual apartment floor.
 const inside=await page.evaluate(()=>{const {a}=T,k=a.cat;T.O.bound=null;k.hide();T.O.cats.forEach(c=>{if(c.st==='bound')c.st='route';});a.player.spawn(2,-4,0);a.step(.05);
 const b=a.BREEDS[0];k.setCat(b,b.coats[0],false);Object.assign(k,{outdoor:false,rugY:null,door:null,leaving:null,fish:null,ignored:0,awayFor:0,on:null,photoDone:true});
 k.object.visible=true;k.object.position.set(3.5,a.player.pos.y,-4);const f=T.Fi.addFish({species:'mört',cm:18,raw:true},k.object.position.clone());f.take();f.placeAt(k.object.position.clone().add(new T.THREE.Vector3(-.5,0,0)),0);
 const n=a.stats.catFishFeeds??0,score=a.totalScore();for(let i=0;i<1200&&!f.broken;i++)T.run(1,.05);T.run(20,.05);return {gone:f.broken,feeds:(a.stats.catFishFeeds??0)-n,points:a.totalScore()-score,y:k.object.position.y,outdoor:k.outdoor};});
 check(inside.gone&&inside.feeds===1&&inside.points===5&&!inside.outdoor,'indoor CatSpawner callback advances same medal counter once',inside);
 const progress=await page.evaluate(()=>{const a=__app;a.medals.open();const c=[...document.querySelectorAll('.medal-card')].find(c=>c.textContent.includes('Kattmatare'));c.scrollIntoView({block:'center'});return {count:a.stats.catFishFeeds,text:c.textContent};});
 check(progress.count===3&&progress.text.includes('3 / 25'),'visible Kattmatare progress from three real meals',progress);
 await kit.shot(page,`${out}/medal-progress.png`,{frames:1});check(errors.length===0,'no page errors',errors);
 }finally{fs.writeFileSync(`${out}/${process.argv.includes("--capture-only")?"capture-result":"result"}.json`,JSON.stringify(checks,null,2));await browser.close();}process.exitCode=checks.some(c=>!c.ok)?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
