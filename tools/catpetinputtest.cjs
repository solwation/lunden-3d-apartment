// #1066: complete production focus/choice/input routing with real cats, without apartment bootstrap.
// World collaborators and weapon effects are controlled stand-ins; Ghosts/THREE and the action dispatch are real.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { installMainGlobals, installMainImports } = require('./mainfixture.cjs');
const game = process.argv[2] || 'http://localhost:8946', out = process.argv[3] || '/tmp/lunden-cats1066-input';
fs.mkdirSync(out, {recursive:true});
const source = fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
function section(start,end) {
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  if(a<0||b<0||source.indexOf(start,a+1)>=0)throw Error('ambiguous production source anchor: '+start);
  return source.slice(a,b).trim();
}
const parts = {
  choices: section("const choicesEl =", "/** E / the action button"),
  catOptions: section('cat.interact.options =', 'cat.watchPoint ??='),
  use: section('function use(thing) {', "actionBtn.addEventListener('click'"),
  click: section('function click(button) {', "document.addEventListener('mousedown'"),
  bicycle: section('const bicyclePickables =', 'function updateFocus() {'),
  focus: section('function updateFocus() {','// --- furniture on/off'),
  greet: section('function greetPlayer(g) {','ghosts.onGreet ='),
  weapon: section('const weaponIs =','const ghosts = new Ghosts'),
  action: section("actionBtn.addEventListener('click'",'const standBtn ='),
  pointer: section("actionBtn.addEventListener('pointerdown'",'// touch: the remote'),
  release: section("document.addEventListener('mouseup', (e) => { if (e.button === 0)", '// touch: holding'),
  keyRelease: section("document.addEventListener('keyup', (e) => {\n  player.keys.delete", "window.addEventListener('blur'"),
  mouse: section("document.addEventListener('mousedown', (e) => { if (locked", "document.addEventListener('contextmenu'"),
  keyboard: section("document.addEventListener('keydown', (e) => {\n  if (!locked", "document.addEventListener('keyup', (e) => {\n  player.keys.delete")
};
fs.writeFileSync(path.join(out,'source-proof.json'),JSON.stringify({mainSha256:crypto.createHash('sha256').update(source).digest('hex'),sourceHashes:Object.fromEntries(['index.html','src/hudicons.css','src/dialogclose.css','src/main.js','src/ghosts.js','src/cat.js','src/miele.js','src/hand.js','src/holdable.js','src/actions.js','src/customizer.js','src/config.js','tools/catpetinputtest.cjs'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('hex')])),parts:Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,crypto.createHash('sha256').update(v).digest('hex')])),note:'Complete source spans injected verbatim; no branch rewrites. Native DOM/Three raycasts and real Cat/Miele/Hand, no apartment or WebGL.'},null,2));
let failures=0;const checks=[];
const check=(ok,text)=>{checks.push({ok:!!ok,label:text});console.log(`${ok?'PASS':'FAIL'} ${text}`);if(!ok)failures++;};
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
   const g=ghosts.add('near','Nära');g.snaps.push({});g.root.visible=true;g.root.position.set(0,0,-1.2);g.root.updateMatrixWorld(true);window.near=g;g.root.position.x=10;g.root.updateMatrixWorld(true);
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
   const {CatSpawner,BREEDS}=await import('/src/cat.js'),{MieleHeld}=await import('/src/miele.js'),H=await import('/src/holdable.js');
   const {Hand}=await import('/src/hand.js');window.H=H;window.BREEDS=BREEDS;
   window.cat=new CatSpawner({levels:[{segments:[]},{segments:[]}],doors:[]},()=>.5);scene.add(cat.object);
   window.miele=new MieleHeld(scene,camera,cat);window.hand=new Hand(camera,scene);window.heldItem=H.heldItem;
   cat.canHold=()=>!H.handBusy(miele);cat.watchPoint=()=>camera.position;miele.dropSpot=()=>new THREE.Vector3(0,0,-1);
   window.petCounts={pets:0,photos:0};cat.onPet=()=>petCounts.pets++;cat.onPhoto=()=>petCounts.photos++;
   window.spawnCat=(kind)=>{cat.hide();window.countsBefore={...petCounts};cat.setCat(BREEDS.find(b=>kind==='Miele'?b.superRare:b.name==='huskatt'),BREEDS.find(b=>kind==='Miele'?b.superRare:b.name==='huskatt').coats[0],kind==='kitten');cat.object.visible=true;cat.object.position.set(0,0,-1);cat.object.rotation.set(0,0,0);cat.update(0);scene.updateMatrixWorld(true);camera.lookAt(cat.head.getWorldPosition(new THREE.Vector3()));camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);};
   window.olof={waveable:false};window.olofDriver={greetable:()=>false};window.keyCabinet=null;
   window.car={targets:()=>[]};window.world={furnitureOn:false,courtyardTargets:[],cupSurfaces:[],bicycles:[]};window.cups={cups:[]};
   window.power={reachable:false,on:true,state:'on',release:()=>{}};window.target={object:{visible:false}};
   window.fish=null;window.fries=null;window.airFryer={open:false};window.fruit={targets:()=>[]};
   window.life={targets:()=>[],runner:{job:null}};window.toiletPaper={targets:()=>[],aim:()=>null};
   window.posters={showGhost:()=>{}};window.heldDrawing={};window.chicken={};window.pan={};window.remote={};window.coffeeJar=null;
   window.bedCare={aim:()=>null};window.tableSetting={aim:()=>null};window.watering={aim:()=>null};
   window.placeGhost={visible:false};window.itemGhost={visible:false};
   window.showItemGhost=()=>{};window.shownRows=x=>x;window.interactionOutline={update:()=>{}};
   window.chooseSpot=()=>null;window.shown=()=>true;window.behindWall=()=>false;
   window.clockPanel={open:false};window.calPanel={open:false};window.blindPanel={open:false};window.sonos={open:false};
   window.stripKeys=new Set();window.isCtrl=code=>code==='ControlLeft'||code==='ControlRight';window.POWERED=new Set();
   window.raycaster=new THREE.Raycaster();window.center=new THREE.Vector2();window.pickables=[];
   for(const [global,id] of [['actionBtn','action'],['promptEl','prompt'],['powerBtn','power-btn'],['turnBtn','turn-btn'],['standBtn','stand-btn']])window[global]=document.getElementById(id);
   document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;document.getElementById('hud').hidden=false;document.body.classList.add('touch');
   const code=Object.values(parts).join('\n');(0,eval)(code+'\nwindow.fns={use,click,updateFocus,greetPlayer,clickTarget,clickIsE,weaponKey,bicyclePickables,updateBicycleControls,showChoices,runChoice,choices};');
   window.sourceIdentity={use:fns.use.toString()===parts.use,focus:fns.updateFocus.toString()===parts.focus,greet:fns.greetPlayer.toString()===parts.greet,
    click:parts.click.startsWith(fns.click.toString()),weapon:parts.weapon.includes('const weaponKey = '+fns.weaponKey.toString()+';'),
    bicycle:parts.bicycle.includes('const bicyclePickables = '+fns.bicyclePickables.toString()+';')&&parts.bicycle.includes(fns.updateBicycleControls.toString()),choices:parts.choices.includes(fns.showChoices.toString())&&parts.choices.includes(fns.runChoice.toString())};
  },parts);
  check(await page.evaluate(()=>Object.values(sourceIdentity).every(Boolean)),'complete production focus/use/Choices/click functions match verbatim source');
  const focus=()=>page.evaluate(()=>{scene.updateMatrixWorld(true);fns.updateFocus();return {kind:focused?.kind,rows:fns.choices.rows?.map(r=>r.id),label:actionBtn.textContent,visible:cat.visible,held:cat.held,parent:cat.object.parent?.type,pos:cat.object.position.toArray(),scale:cat.object.scale.toArray(),rotation:cat.object.rotation.toArray(),ray:raycaster.ray.direction.toArray()};});
  for(const kind of ['adult','kitten']){
   await page.evaluate(kind=>{spawnCat(kind);touch.enabled=false;locked=true;document.body.classList.remove('touch');},kind);
   const f=await focus();console.log(JSON.stringify(f));check(f.kind==='cat'&&f.rows.join(',')==='pet,take',kind+' actual raycast offers pet first and pickup second');
   await page.keyboard.press('e');check(await page.evaluate(()=>cat.petting&&!cat.held&&!H.heldItem()),kind+' real E pets with empty hands');
   await page.evaluate(()=>{cat.ownHand=false;cat.update(.8);hand.update(.02,null,cat.petHand(new THREE.Vector3()));scene.updateMatrixWorld(true);});
   check(await page.evaluate(()=>cat.eyes.every(e=>e.shut.visible&&!e.eye.visible)&&hand.visible&&petCounts.photos===countsBefore.photos+1&&petCounts.pets===countsBefore.pets+1),kind+' pet eyes, own hand and photo callback');
   await page.screenshot({path:path.join(out,kind+'-desktop-actions.png')});
   await page.keyboard.press('2');check(await page.evaluate(()=>cat.held&&H.heldItem()===miele),kind+' real digit 2 picks up same cat');
   await page.evaluate(kind=>spawnCat(kind),kind);await focus();await page.mouse.click(420,240);
   check(await page.evaluate(()=>cat.petting&&!cat.held),kind+' real primary mouse pets');
   await page.evaluate(kind=>{spawnCat(kind);touch.enabled=true;locked=false;document.body.classList.add('touch');},kind);await focus();
   await page.locator('#choices button').first().click();check(await page.evaluate(()=>cat.petting&&!cat.held),kind+' actual touch choice pets');
   await page.screenshot({path:path.join(out,kind+'-touch-actions.png')});
   await page.locator('#choices button').nth(1).click();check(await page.evaluate(()=>cat.held&&H.heldItem()===miele),kind+' actual touch pickup choice carries');
   await page.evaluate(kind=>{spawnCat(kind);H.setHeld({putBack(){}});},kind);const busy=await focus();
   await page.locator('#action').click();check(await page.evaluate(()=>cat.petting&&!cat.held&&!!H.heldItem())&&!busy.rows,kind+' occupied hand action still pets');
   await page.evaluate(()=>H.setHeld(null));
  }
  await page.evaluate(()=>spawnCat('Miele'));const m=await focus();
  check(m.rows.join(',')==='take,pet','Miele retains default pickup and also offers pet');
  await page.locator('#choices button').first().click();check(await page.evaluate(()=>cat.held&&H.heldItem()===miele),'Miele default touch choice still picks up');
  await page.evaluate(()=>spawnCat('Miele'));await focus();await page.locator('#choices button').nth(1).click();
  check(await page.evaluate(()=>cat.petting&&!cat.held),'Miele explicit pet works');
  await page.evaluate(()=>{spawnCat('adult');player.riding={};});await focus();
  await page.locator('#choices button').first().click();check(await page.evaluate(()=>!cat.petting&&!cat.held),'riding guard rejects stale choice');
  check(await page.evaluate(()=>webglCalls===0)&&errors.length===0,'no WebGL or page errors: '+JSON.stringify(errors));
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,failures,errors,browser:browser.version(),limits:'Complete production focus, choices, keyboard/mouse/touch listeners and real Cat/Miele/Hand; controlled empty obstacle map, photo callback only, no WebGL/full World/persistence/physical phone.'},null,2));
 }catch(error){check(false,error.stack);}finally{await browser.close();}
 console.log(failures?'SOME FAILED':'ALL PASS');process.exitCode=failures?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
