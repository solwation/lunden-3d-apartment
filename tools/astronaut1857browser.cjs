// One held real app: native touch jetpack input, controlled physics frames, ordinary medal/stat UI.
const fs=require('node:fs'),kit=require('./testkit.cjs');
const [base='http://localhost:8929',out='docs/verification/1857/app',control='/tmp/1857']=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await kit.launch();try{
 const ctx=await browser.newContext({viewport:{width:1100,height:760},hasTouch:true,deviceScaleFactor:1});
 await ctx.addInitScript(()=>{localStorage.setItem('lunden.name','Astronaut lokalt');sessionStorage.setItem('lunden.nameSkipped','1');});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/?test=lazy&cloud=&mp=0&jetpack&time=12&month=7&freeze&weather=clear',{waitUntil:'commit'});
 await page.waitForFunction(()=>window.__app?.medals?.ready,null,{timeout:180000});await kit.skipNameDialog(page);
 await page.evaluate(()=>{const a=__app;a.renderer.setAnimationLoop(null);a.showOverlay(false);a.touch.enabled=true;document.body.classList.add('touch');a.player.spawn(-120,0,Math.PI/2);a.jetpack.putOn();a.stats.jetpackMetres=98;a.stats.medalsSeeded=true;a.stats.medals={};a.medals.check();a.medals.queue.length=0;a.medals.pop.hidden=true;a.testMode.setFull(true);a.step(0);a.renderer.render(a.scene,a.camera);});
 await page.evaluate(()=>{window.__jetInputs=[];for(const type of ['pointerdown','pointerup'])document.getElementById('jet-up').addEventListener(type,e=>__jetInputs.push({type,trusted:e.isTrusted,pointer:e.pointerType}));});
 const pad=await page.locator('#jet-up').boundingBox();if(!pad)throw Error('jet-up not visible');const cdp=await ctx.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pad.x+pad.width/2,y:pad.y+pad.height/2}]});
 const ascent=await page.evaluate(()=>{const a=__app,p=a.player,start={p:p.pos.toArray(),m:a.stats.jetpackMetres,flights:a.stats.flights??0,pts:a.stats.medalPoints??0},trace=[];for(let i=0;i<30;i++){p.update(.05);a.jetpack.update(.05);trace.push({y:p.pos.y,m:a.stats.jetpackMetres,vy:p.vy,touchUp:a.jetpack.touchUp});}a.medals.check();a.renderer.render(a.scene,a.camera);return{start,trace,end:{p:p.pos.toArray(),m:a.stats.jetpackMetres,flights:a.stats.flights,pts:a.stats.medalPoints,level:a.stats.medals.astronaut?.l}};});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 if(!ascent.trace.every(q=>q.touchUp)||ascent.end.level!==1||Math.abs((ascent.end.m-98)-(ascent.end.p[1]-ascent.start.p[1]))>1e-8)throw Error('native ascent/medal mismatch '+JSON.stringify(ascent));
 ascent.inputs=await page.evaluate(()=>__jetInputs);
 fs.writeFileSync(out+'/ascent.json',JSON.stringify(ascent,null,2));
 await page.evaluate(()=>{document.getElementById('menu-medals').click();});
 const item=page.locator('#medal-grid li').filter({hasText:'Astronaut'});await item.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/astronaut-medal.png',timeout:120000});
 fs.writeFileSync(control+'.ready','ready');console.log('READY',JSON.stringify(ascent.end));
 let previous='';while(!fs.existsSync(control+'.release')){if(fs.existsSync(control+'.node')){const code=fs.readFileSync(control+'.node','utf8');if(code!==previous){previous=code;try{const result=await eval('(async()=>{'+code+'})()');fs.writeFileSync(out+'/command-result.json',JSON.stringify(result??null,null,2));console.log('COMMAND OK');}catch(e){console.error(e.stack);}}}await new Promise(r=>setTimeout(r,250));}
 fs.writeFileSync(out+'/page-errors.json',JSON.stringify(errors));
 }finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
