// Production DOM/CSS and setupTouch, no World/WebGL. Native touch events use CDP.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path');
const base=process.argv[2]||'http://localhost:8961', out=process.argv[3]||'/tmp/lunden-touch-layout';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
 const results=[], errors=[];
 try {
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// native touch layout fixture, no World'}));
 for(const [width,height] of [[568,320],[667,375],[844,390],[932,430],[1024,768]]) for(const safe of [[0,0,0,0],[44,44,20,20],[44,0,18,0]]) {
 await page.setViewportSize({width,height});await page.goto(base);
 await page.evaluate(async safe=>{
  const {initHudIcons}=await import('/src/hudicons.js');initHudIcons();
  document.body.classList.add('touch');
  for(const [i,k] of ['sl','sr','st','sb'].entries())document.documentElement.style.setProperty('--'+k,safe[i]+'px');
  for(const id of ['overlay','loading','rotate'])document.getElementById(id).hidden=true;
  document.getElementById('hud').hidden=false;
  const THREE=await import('three'),{Compass}=await import('/src/compass.js'),{Combat}=await import('/src/combat.js');
  const camera=new THREE.PerspectiveCamera();new Compass(camera,document.getElementById('compass'));
  const combat=new Combat({ghosts:{connected:false,others:new Map()},camera,scene:new THREE.Scene(),weapon:()=>null,feet:()=>new THREE.Vector3()});
  combat.lives=7;combat.update(0);
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  window.looks=[];const {setupTouch}=await import('/src/touch.js');window.input=setupTouch({onLook:(x,y)=>looks.push([x,y])});input.enabled=true;
  let t0=performance.now();const tick=t=>{input.update((t-t0)/1000);t0=t;requestAnimationFrame(tick);};requestAnimationFrame(tick); // the eased look (#1088): main.js steps it per frame
  window.lookSum=()=>Math.round(looks.reduce((sum,p)=>sum+p[0],0)*1e6)/1e6; // eased over frames, never lost
 },safe);
 const cases=await page.evaluate(({width,height,safe})=>{
  const results=[],$=id=>document.getElementById(id);
  const icons=['jet-up','jet-down','web-btn','measure-btn','turn-btn','power-btn','jump-btn','crouch-btn','stand-btn'];
  const overlaps=(a,b)=>Math.min(a.right,b.right)>Math.max(a.left,b.left)+.5&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+.5;
  // All 32 conditional equipment masks, both primary modes, seated/standing.
  for(let mask=0;mask<32;mask++)for(const choices of [false,true])for(const seated of [false,true]){
   ['jet-up','jet-down','web-btn','turn-btn','power-btn'].forEach((id,i)=>$(id).hidden=!(mask&(1<<i)));
   $('stand-btn').hidden=!seated;$('action').hidden=choices;$('action').textContent='Öppna köksluckan';
   $('choices').hidden=!choices;
   $('choices').replaceChildren(...['Ta smörkniven','Öppna förpackningen','Lägg i diskmaskinen','Lämna tillbaka'].map(text=>{const b=document.createElement('button');b.textContent=text;return b;}));
   const nodes=[...icons.map($),choices?$('choices'):$('action')].filter(n=>!n.hidden);
   const rects=nodes.map(n=>[n.id,n.getBoundingClientRect()]);const failures=[];
   for(const [id,r]of rects){
    if(r.width<48||r.height<48)failures.push('small '+id);
    if(r.left<Math.max(safe[0],width*.45)-.1||r.right>width-safe[1]+.1||r.top<safe[2]||r.bottom>height-safe[3]+.1)failures.push('outside thumb/safe region '+id);
    for(const header of ['score','hud-top','compass','lives'])if(overlaps(r,$(header).getBoundingClientRect()))failures.push('header overlap '+id+'/'+header);
   }
   for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++)if(overlaps(rects[i][1],rects[j][1]))failures.push('overlap '+rects[i][0]+'/'+rects[j][0]);
   if(choices){
    for(const b of $('choices').children){const r=b.getBoundingClientRect();if(r.width<48||r.height<48)failures.push('small choice');if(r.height>$('choices').clientHeight+.1)failures.push('choice cannot fit scroll window');}
    $('choices').scrollTop=$('choices').scrollHeight;
    const last=$('choices').lastElementChild.getBoundingClientRect(),box=$('choices').getBoundingClientRect();
    if(last.bottom>box.bottom+.1||last.top<box.top-.1)failures.push('last choice unreachable');
    $('choices').scrollTop=0;
   }
   if(failures.length)results.push({mask,choices,seated,failures});
  }
  return results;
 },{width,height,safe});
 results.push({width,height,safe,checked:128,failures:cases});
 if(width===568||width===844){
  await page.screenshot({path:path.join(out,`choices-${width}-${safe.join('-')}.png`)});
  await page.evaluate(()=>{document.getElementById('stand-btn').hidden=true;document.getElementById('choices').hidden=true;document.getElementById('action').hidden=false;});
  await page.screenshot({path:path.join(out,`touch-${width}-${safe.join('-')}.png`)});
 }
 }
 // Native two-finger movement/look, plus a third touch on a HUD button.
 await page.setViewportSize({width:844,height:390});
 await page.evaluate(()=>{document.getElementById('rotate').hidden=true;});
 const cdp=await context.newCDPSession(page);
 const send=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y}))});
 await send('touchStart',[[1,100,260]]);await send('touchMove',[[1,100,210]]);
 await send('touchStart',[[1,100,210],[2,450,160]]);await send('touchMove',[[1,100,210],[2,480,160]]);
 await page.waitForFunction(()=>Math.abs(looks.reduce((sum,p)=>sum+p[0],0)-30)<1e-9,null,{polling:100,timeout:3000});
 const before=await page.evaluate(()=>({analog:input.analog.y,look:lookSum()}));
 const jump=await page.locator('#jump-btn').boundingBox();
 await send('touchStart',[[1,100,210],[2,480,160],[3,jump.x+jump.width/2,jump.y+jump.height/2]]);
 await send('touchMove',[[1,100,210],[2,480,160],[3,jump.x+10,jump.y+10]]);
 const after=await page.evaluate(()=>({analog:input.analog.y,look:lookSum()}));
 await send('touchCancel',[]);
 const reset=await page.evaluate(()=>input.analog.x===0&&input.analog.y===0&&document.getElementById('stick').hidden);
 // Stick feel (#1088): a resting thumb's few px are the dead zone; past the rim the base follows, so pulling back slows at once.
 const travel=await page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stick-travel')));
 const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))); // moves arrive frame-aligned
 const move=async(x,y)=>{await send('touchMove',[[4,x,y]]);await frame();};
 await send('touchStart',[[4,120,250]]);await move(123,248);
 const drift=await page.evaluate(()=>Math.hypot(input.analog.x,input.analog.y));
 await move(120,250-travel*.5);const half=await page.evaluate(()=>input.analog.y);
 await move(120,250-travel-40);
 const follow=await page.evaluate(()=>({y:input.analog.y,top:parseFloat(document.getElementById('stick').style.top)}));
 await move(120,250-travel-40+travel*.5);const back=await page.evaluate(()=>input.analog.y);
 await send('touchEnd',[]);
 const feel={travel,drift,half,follow,back};
 const feelPass=drift===0&&half>0.2&&half<0.45&&follow.y>.999&&Math.abs(follow.top-(250-40))<1&&back>0&&back<0.5;
 const touchPass=before.analog>.8&&before.look===30&&JSON.stringify(before)===JSON.stringify(after)&&reset&&feelPass;
 // Complete original production listeners; collaborators record calls without firing weapons.
 const actions=await page.evaluate(async()=>{
  const source=await(await fetch('/src/main.js')).text();
  const start=source.indexOf("actionBtn.addEventListener('pointerdown'"),end=source.indexOf('// touch: the remote',start);
  const fragment=source.slice(start,end);if(start<0||end<0)throw Error('production action anchors changed');
  const calls=[],power={on:false,use:()=>calls.push('use'),release:()=>calls.push('release')};
  const actionBtn=document.getElementById('action'),held={trigger:on=>calls.push(on)};
  new Function('actionBtn','focused','heldItem','weaponKey','power',fragment)(actionBtn,null,()=>held,()=>null,power);
  const ev=type=>actionBtn.dispatchEvent(new PointerEvent(type,{pointerId:10,pointerType:'touch',bubbles:true}));
  for(const end of ['pointerup','pointercancel','pointerleave']){ev('pointerdown');ev(end);}
  const jumpStart=source.indexOf("document.getElementById('jump-btn').addEventListener('pointerdown'");
  const jumpEnd=source.indexOf('const stripKeys',jumpStart);const player={jumpPress:false};
  new Function('active','player',source.slice(jumpStart,jumpEnd))(()=>true,player);
  document.getElementById('jump-btn').dispatchEvent(new PointerEvent('pointerdown',{pointerId:11,pointerType:'touch',bubbles:true,cancelable:true}));
  return {calls,jumpPress:player.jumpPress,pass:player.jumpPress&&JSON.stringify(calls)===JSON.stringify([true,false,'release',true,false,'release',true,false,'release'])};
 });
 const failures=results.filter(r=>r.failures.length).length;
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({results,errors,before,after,reset,feel,touchPass,actions},null,2));
 console.log(`${failures||errors.length||!touchPass||!actions.pass?'FAIL':'PASS'} ${results.length*128} layout states; native simultaneous joystick/look/button and cancel=${touchPass}; production hold/release/jump=${actions.pass}; page errors=${errors.length}`);
 if(failures||errors.length||!touchPass||!actions.pass)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
