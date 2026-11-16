// One held browser: exact frozen before modules, actual Ghost consumers, recorded time sequence and interaction probes.
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [base='http://localhost:8804',out='docs/verification/2004']=process.argv.slice(2);
const files=['src/avatar.js','src/olof.js','src/ghosts.js','src/avatarmotion.js','src/config.js','src/remote-pose.js','src/gymbodypose.js','tools/avatarmotion.html','tools/avatarmotionbrowser.cjs'];
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});let errors=[];
 try{const page=await browser.newPage({viewport:{width:1440,height:790}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/before/**',route=>{const rel=new URL(route.request().url()).pathname.slice('/before/'.length);let body;try{body=cp.execFileSync('git',['show','a05683d4:'+rel]);}catch{return route.abort();}return route.fulfill({contentType:rel.endsWith('.js')?'text/javascript':rel.endsWith('.glb')?'model/gltf-binary':'application/octet-stream',body});});
 await page.goto(base+'/tools/avatarmotion.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>motionReady,null,{timeout:90000});
 const result=await page.evaluate(()=>runMotion());fs.writeFileSync(path.join(out,'sequence.webm'),Buffer.from(result.video,'base64'));fs.writeFileSync(path.join(out,'sequence.json'),JSON.stringify(result.data));
 await page.screenshot({path:path.join(out,'motion-end.png')});
 const checks=await page.evaluate(()=>probeInteractions());
 const hashes=()=>Object.fromEntries(files.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
 fs.writeFileSync(path.join(out,'browser-initial.json'),JSON.stringify({checks,errors,source:hashes(),browser:browser.version(),baseline:'a05683d4'},null,2));
 console.log('SEQUENCE_READY',checks,errors);fs.writeFileSync('/tmp/2004-browser-ready','ready');
 // Keep one owned browser available for visual review and scoped corrections.
 for(let n=0;n<900&&!fs.existsSync('/tmp/2004-browser-finish');n++){if(fs.existsSync('/tmp/2004-browser-action.cjs')){const f='/tmp/2004-browser-action.cjs';delete require.cache[require.resolve(f)];try{await require(f)(page,out,browser);}catch(e){console.error('ACTION_FAILED',e);}fs.renameSync(f,f+'.done');}await new Promise(r=>setTimeout(r,1000));}
 if(fs.existsSync('/tmp/2004-browser-rerun')){await page.reload();await page.waitForFunction(()=>motionReady);const r=await page.evaluate(()=>runMotion());fs.writeFileSync(path.join(out,'sequence.webm'),Buffer.from(r.video,'base64'));fs.writeFileSync(path.join(out,'sequence.json'),JSON.stringify(r.data));await page.screenshot({path:path.join(out,'motion-end.png')});}
 const finalChecks=await page.evaluate(()=>probeInteractions());fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks:finalChecks,errors,source:hashes(),browser:browser.version(),baseline:'a05683d4'},null,2));await page.evaluate(()=>disposeMotion());if(errors.length)throw Error(errors.join('\n'));
 }finally{await browser.close();}
})();
