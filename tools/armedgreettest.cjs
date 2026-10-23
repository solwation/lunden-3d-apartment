// #872: complete unchanged main functions/listener bodies in real index DOM, without bootstrap/WebGL.
// World collaborators and weapon effects are controlled stand-ins; Ghosts/THREE and the action dispatch are real.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { installMainGlobals, installMainImports } = require('./mainfixture.cjs');
const game = process.argv[2] || 'http://localhost:8867', out = process.argv[3] || '/tmp/lunden-priority-872';
fs.mkdirSync(out, {recursive:true});
const source = fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
function section(start,end) {
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  if(a<0)throw Error('missing start anchor in src/main.js (renamed or moved?): '+start);
  if(b<0)throw Error('missing end anchor in src/main.js after the start anchor (renamed or moved?): '+end+' (start: '+start+')');
  if(source.indexOf(start,a+1)>=0)throw Error('ambiguous production source anchor: '+start);
  return source.slice(a,b).trim();
}
const parts = {
  use: section('function use(thing) {', "actionBtn.addEventListener('click'"),
  click: section('function click(button) {', "document.addEventListener('mousedown'"),
  bicycle: section('const bicyclePickables =', 'function updateFocus() {'),
  focus: section('function updateFocus() {','// --- furniture on/off'),
  greet: section('function greetPlayer(g, kind = \'greet\') {','ghosts.onChoose ='), // (#1405: the chosen kind)
  weapon: section('const weaponIs =','const ghosts = new Ghosts'),
  action: section("actionBtn.addEventListener('click'",'const standBtn ='),
  pointer: section("actionBtn.addEventListener('pointerdown'",'// touch: the remote'),
  release: section("document.addEventListener('mouseup', (e) => { if (e.button === 0)", '// touch: holding'),
  keyRelease: section("document.addEventListener('keyup', (e) => {\n  player.keys.delete", "window.addEventListener('blur'"),
  mouse: section("document.addEventListener('mousedown', (e) => { if (locked", "document.addEventListener('contextmenu'"),
  keyboard: section("document.addEventListener('keydown', (e) => {\n  if (!locked", "document.addEventListener('keyup', (e) => {\n  player.keys.delete")
};
fs.writeFileSync(path.join(out,'source-proof.json'),JSON.stringify({mainSha256:crypto.createHash('sha256').update(source).digest('hex'),sourceHashes:Object.fromEntries(['index.html','src/hudicons.css','src/dialogclose.css','src/main.js','src/ghosts.js','src/customizer.js','src/config.js','tools/armedgreettest.cjs'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('hex')])),parts:Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,crypto.createHash('sha256').update(v).digest('hex')])),note:'Complete source spans injected verbatim; no branch rewrites. Native DOM only, no apartment or actual projectile/hit acceptance.'},null,2));
let failures=0;
const check=(ok,text)=>{console.log(`${ok?'PASS':'FAIL'} ${text}`);if(!ok)failures++;};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--disable-gpu']});
 const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true});await installMainGlobals(page);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// intentionally no apartment bootstrap'}));
  await page.goto(game);await installMainImports(page);
  await page.evaluate(async(parts)=>{
   const original=HTMLCanvasElement.prototype.getContext;window.webglCalls=0;
   HTMLCanvasElement.prototype.getContext=function(kind,...args){if(/webgl/i.test(kind)){window.webglCalls++;throw Error('no WebGL in native action fixture');}return original.call(this,kind,...args);};
   window.THREE=await import('three');const {Ghosts}=await import('/src/ghosts.js');
   const {isAvatarCustomizerOpen}=await import('/src/customizer.js');window.isAvatarCustomizerOpen=isAvatarCustomizerOpen;
   const {COMBAT,HOLD,REST,LIFE,LEVELS,GHOSTS}=await import('/src/config.js');
   Object.assign(window,{COMBAT,HOLD,REST,LIFE,LEVELS,GHOSTS});
   window.scene=new THREE.Scene();window.camera=new THREE.PerspectiveCamera(60,844/390,.1,100);camera.position.set(0,1,0);
   window.effects={weapon:0,trigger:[],lines:[],points:0,door:0,wire:[]};
   window.ghosts=new Ghosts({scene,camera,url:'',state:()=>({p:[0,0,0],r:0}),mirrored:()=>false});
   ghosts.me='local';ghosts.ws={readyState:1,send:data=>effects.wire.push(JSON.parse(data))};ghosts.lastSent=-Infinity;
   const g=ghosts.add('near','Nära');g.snaps.push({});g.root.visible=true;g.root.position.set(0,0,-1.2);g.root.updateMatrixWorld(true);window.near=g;
   window.fixtureHeld=null;
   const weapon=label=>({useLabel:label,clickIsUse:true,use(){effects.weapon++;}});
   window.saber=weapon('Svinga');window.nerf=weapon('Skjut');window.wand=weapon('Trolla');window.ball=weapon('Skjut');window.bow=weapon('Skjut');
   window.rifle={...weapon('Skjut'),isRifle:true,trigger(on){effects.trigger.push(on);this.firing=on;if(on)effects.weapon++;}};
   window.heldItem=()=>fixtureHeld;
   window.suit={worn:false,canTakeOff:false,dropTarget:{},targets:()=>[],shoot:()=>effects.weapon++};
   window.jetpack={worn:false,canTakeOff:false,dropTarget:{},targets:()=>[]};
   window.toys={blasters:[nerf],wands:[wand]};
   window.focused=null;window.focusPoint=null;window.reading=false;window.locked=false;window.statsOpen=false;window.viewing=null;
   window.book={reading:false};window.rest={active:false};window.touch={enabled:true};
   window.player={pos:new THREE.Vector3(),level:0,keys:new Set(),crouch:false};
   window.shadowState={};window.hand={reach:()=>{}};window.greetedPlayers=new Set();window.greet={sayMine:line=>effects.lines.push(line)};window.bump=()=>effects.points++;
   window.rearrange={enabled:false};window.measure={active:false};window.setPressed=()=>{};window.setIcon=()=>{};
   window.cat={visible:false};window.olof={waveable:false};window.olofDriver={greetable:()=>false};window.keyCabinet=null;
   window.car={targets:()=>[]};window.world={furnitureOn:false,courtyardTargets:[],cupSurfaces:[],bicycles:[],boule:{active:false,controlPickables:[],near:()=>false}};window.cups={cups:[]};
   window.power={reachable:false,on:true,state:'on',release:()=>{}};window.target={object:{visible:false}};
   window.fish=null;window.fries=null;window.airFryer={open:false};window.fruit={targets:()=>[]};
   window.life={targets:()=>[],runner:{job:null}};window.toiletPaper={targets:()=>[],aim:()=>null};
   window.posters={showGhost:()=>{}};window.heldDrawing={};window.chicken={};window.pan={};window.remote={};window.coffeeJar=null;
   window.bedCare={aim:()=>null};window.tableSetting={aim:()=>null};window.watering={aim:()=>null};
   window.placeGhost={visible:false};window.itemGhost={visible:false};window.choices={rows:null};
   window.showChoices=()=>{};window.showItemGhost=()=>{};window.shownRows=x=>x;window.interactionOutline={update:()=>{}};
   window.shortButtonLabel=(t,label)=>label;window.chooseSpot=()=>null;window.shown=()=>true;window.behindWall=()=>false;
   window.clockPanel={open:false};window.calPanel={open:false};window.blindPanel={open:false};window.sonos={open:false};
   window.stripKeys=new Set();window.isCtrl=code=>code==='ControlLeft'||code==='ControlRight';window.POWERED=new Set();
   window.raycaster=new THREE.Raycaster();window.center=new THREE.Vector2();window.pickables=[];
   for(const [global,id] of [['actionBtn','action'],['promptEl','prompt'],['powerBtn','power-btn'],['turnBtn','turn-btn'],['standBtn','stand-btn']])window[global]=document.getElementById(id);
   document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;document.getElementById('hud').hidden=false;document.body.classList.add('touch');
   const code=Object.values(parts).join('\n');(0,eval)(code+'\nwindow.fns={use,click,updateFocus,greetPlayer,clickTarget,clickIsE,weaponKey,bicyclePickables,updateBicycleControls};');
   window.sourceIdentity={use:fns.use.toString()===parts.use,focus:fns.updateFocus.toString()===parts.focus,greet:fns.greetPlayer.toString()===parts.greet,
    click:parts.click.startsWith(fns.click.toString()),weapon:parts.weapon.includes('const weaponKey = '+fns.weaponKey.toString()+';'),
    bicycle:parts.bicycle.includes('const bicyclePickables = '+fns.bicyclePickables.toString()+';')&&parts.bicycle.includes(fns.updateBicycleControls.toString())};
  },parts);
  check(await page.evaluate(()=>Object.values(sourceIdentity).every(Boolean)),'complete use/focus/greet/click/current-weapon production functions match verbatim source');
  const focus=()=>page.evaluate(()=>{scene.updateMatrixWorld(true);fns.updateFocus();return {kind:focused?.kind,label:actionBtn.textContent,hidden:actionBtn.hidden,clickIsE:fns.clickIsE()};});
  const bare=await focus();check(bare.kind==='ghost'&&/hälsa på/i.test(bare.label)&&bare.clickIsE,'unarmed close player is still a greeting target');
  await page.locator('#action').click();check(await page.evaluate(()=>effects.lines.length===1&&effects.wire.some(m=>m.t==='g')),'real touch action invokes unarmed Ghosts greeting and emits greet');
  await page.evaluate(()=>fixtureHeld=nerf);const armed=await focus();
  check(!armed.kind&&armed.label==='Skjut'&&!armed.hidden&&!armed.clickIsE,'armed close player has shoot touch action and no greet focus');
  const shots=await page.evaluate(()=>effects.weapon);await page.locator('#action').click();check(await page.evaluate(n=>effects.weapon===n+1&&effects.lines.length===1,shots),'touch close-range action dispatches weapon use without greeting');
  for(const [key,item] of [['saber','saber'],['nerf','nerf'],['wand','wand'],['rifle','rifle'],['ball','ball'],['bow','bow']]){
   check(await page.evaluate(({key,item})=>{fixtureHeld=window[item];focused=near.door;ghosts.greetAt=-Infinity;ghosts.lastSent=-Infinity;/*#1544: no greet cooldown, so only the armed guard can stop the call*/const before=effects.weapon,lines=effects.lines.length;fns.use(focused);fns.greetPlayer(near);return fns.weaponKey()===key&&effects.weapon===before+1&&effects.lines.length===lines&&!fns.clickIsE()&&!rifle.firing;},{key,item}),key+': old ghost action checks current weapon, fires and cannot greet');
  }
  await page.evaluate(()=>{fixtureHeld=rifle;focused=near.door;});
  const beforePointer=await page.evaluate(()=>effects.weapon);await page.locator('#action').dispatchEvent('pointerdown');await page.locator('#action').dispatchEvent('pointerup');await page.locator('#action').dispatchEvent('click');
  check(await page.evaluate(n=>effects.weapon===n+2&&effects.trigger.at(-1)===false&&!rifle.firing,beforePointer),'stale ghost touch down/up/click uses weapon and leaves automatic trigger released');
  await page.evaluate(()=>{locked=true;touch.enabled=false;});
  const beforeMouse=await page.evaluate(()=>effects.weapon);await page.mouse.click(400,250);
  check(await page.evaluate(n=>effects.weapon===n+1&&!rifle.firing,beforeMouse),'primary mouse listener still fires against stale nearby ghost focus');
  const beforeKey=await page.evaluate(()=>effects.weapon);await page.keyboard.press('e');
  check(await page.evaluate(n=>effects.weapon===n+1&&!rifle.firing,beforeKey),'actual keyboard E/keyup uses stale ghost weapon once without latching trigger');
  await page.evaluate(()=>{fixtureHeld=null;suit.worn=true;focused=near.door;ghosts.greetAt=-Infinity;ghosts.lastSent=-Infinity;});
  check(await page.evaluate(()=>{const n=effects.weapon,l=effects.lines.length;const result=fns.click(0);fns.use(near.door);fns.greetPlayer(near);return fns.weaponKey()==='web'&&result==='web'&&effects.weapon===n+2&&effects.lines.length===l;}),'empty suit hands keep web action and block stale greeting');
  await page.evaluate(()=>{suit.worn=false;jetpack.worn=true;focused=near.door;ghosts.greetAt=-Infinity;ghosts.lastSent=-Infinity;});const jet=await focus();
  check(!jet.kind&&await page.evaluate(()=>{const n=effects.lines.length;fns.greetPlayer(near);return fns.weaponKey()==='jetpack'&&effects.lines.length===n;}),'worn jetpack is armed for greeting eligibility even with empty hands');
  await page.evaluate(()=>{jetpack.worn=false;fixtureHeld=null;touch.enabled=true;locked=false;ghosts.greetAt=-Infinity;ghosts.lastSent=-Infinity;});
  const back=await focus();check(back.kind==='ghost'&&/hälsa på/i.test(back.label),'putting weapon away restores unarmed greeting focus');
  await page.evaluate(()=>{touch.enabled=false;locked=true;});
  await page.keyboard.press('e');check(await page.evaluate(()=>effects.lines.length===2&&effects.wire.filter(m=>m.t==='g').length===2),'keyboard greeting still emits only when unarmed');
  await page.evaluate(()=>{fixtureHeld=nerf;const mesh=new THREE.Mesh(new THREE.BoxGeometry(.3,.3,.3),new THREE.MeshBasicMaterial());mesh.position.set(0,1,-.5);mesh.userData.door={name:'dörren',kind:'door',toggle(){effects.door++;}};scene.add(mesh);pickables.push(mesh);window.useDoor=d=>d.toggle();scene.updateMatrixWorld(true);});
  const ordinary=await focus();check(ordinary.kind==='door','armed ordinary close object still receives its existing focus');
  await page.keyboard.press('e');check(await page.evaluate(()=>effects.door===1),'ordinary E object interaction remains intact while armed');
  await page.evaluate(()=>{pickables.length=0;touch.enabled=true;locked=false;fixtureHeld=nerf;scene.updateMatrixWorld(true);fns.updateFocus();});
  await page.screenshot({path:path.join(out,'armed-touch.png')});
  check(await page.evaluate(()=>effects.lines.length===2&&effects.wire.filter(m=>m.t==='g').length===2),'armed attempts emitted no extra greeting message or line');
  check(await page.evaluate(()=>webglCalls===0)&&errors.length===0,'no WebGL calls or page errors: '+JSON.stringify(errors));
 }catch(error){check(false,error.stack);}finally{await browser.close();}
 console.log(failures?'SOME FAILED':'ALL PASS');process.exitCode=failures?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
