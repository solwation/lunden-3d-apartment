#!/usr/bin/env node
// #863: actual Player/shared spawn helpers on a controlled native Three scene; no apartment bootstrap/WebGL.
const fs=require('node:fs');
const kit=require('./testkit.cjs');
const game=process.argv[2]||'http://localhost:8841',out=process.env.RESPAWN_OUTPUT||'/tmp/lunden-respawn';
(async()=>{
 const browser=await kit.launch();
 try {
  const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(game+'/docs/development/interactions.md');
  await page.setContent('<!doctype html><pre id="out"></pre><div id="fall"><p>Du slog dig</p></div><script type="importmap">{"imports":{"three":"/__three/build/three.module.js","three/addons/":"/__three/examples/jsm/"}}</script>');
  const result=await page.evaluate(async()=>{
   const T=await import('three'),{Player}=await import('/src/player.js');
   const {RESPAWN,PLAYER,OUTDOOR,SITE}=await import('/src/config.js');
   const {chooseRespawn,safeRespawnPoint,respawnOutdoors}=await import('/src/respawn.js'),{groundY}=await import('/src/surroundings.js');
   const lines=[],check=(ok,label)=>lines.push(`${ok?'PASS':'FAIL'} ${label}`);
   const scene=new T.Scene(),camera=new T.PerspectiveCamera(),world={object:scene,size:{x:5.75,z:12.1},levels:[{segments:[],footprints:[]},{segments:[],footprints:[]}],doors:[]};
   const player=new Player(world,camera);player.spawn(2,-10,0);
   let seed=123;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
   const regions=new Set(),positions=new Set();let safe=true;
   for(let i=0;i<120;i++){const point=chooseRespawn(player,random);if(!point){safe=false;break;}regions.add(point.region);positions.add(`${point.x},${point.z}`);safe&&=!!safeRespawnPoint(player,point.x,point.z)&&point.y===groundY(point.x,point.z);}
   check(safe&&regions.size===3&&positions.size>100,'all three configured regions provide multiple checked terrain positions');
   check(RESPAWN.regions.every(region=>region.x0>=OUTDOOR.x0&&region.x1<=OUTDOOR.x1&&region.z0>=OUTDOOR.z0&&region.z1<=OUTDOOR.z1),'sampling regions remain within existing walkable extent');
   const old=player.pos.clone();player.pos.set(2,60,5);
   const outdoor=chooseRespawn(player,random);check(!!outdoor&&player.pos.equals(new T.Vector3(2,60,5)),'candidate context ignores prior high indoor/roof pose and does not mutate it');player.pos.copy(old);
   check(safeRespawnPoint(player,2,5)===null&&SITE.blocks.every(block=>safeRespawnPoint(player,(block.x0+block.x1)/2,(block.z0+block.z1)/2)===null),'the actual configured house footprints are excluded');
   const [waterX,waterZ]=SITE.river.path[9];check(safeRespawnPoint(player,waterX,waterZ)===null,'configured river water is never a spawn');
   check(safeRespawnPoint(player,OUTDOOR.x0,30)===null&&safeRespawnPoint(player,NaN,0)===null,'body radius boundary and nonfinite positions are refused');
   const green=RESPAWN.regions.find(region=>region.id==='green'),x=(green.x0+green.x1)/2,z=(green.z0+green.z1)/2;
   const square=[[x-1,z-1],[x+1,z-1],[x+1,z+1],[x-1,z+1]],ring=square.map((p,i)=>[...p,...square[(i+1)%4]]);
   world.levels[0].segments=ring;player.pos.set(x,groundY(x,z),z);
   check(player.isFree(x,z,0)===true&&safeRespawnPoint(player,x,z)===null,'closed solid outline centre is refused even when native edge distance alone is clear');
   world.levels[0].segments=[[OUTDOOR.x0,OUTDOOR.z0,OUTDOOR.x1,OUTDOOR.z0],[OUTDOOR.x1,OUTDOOR.z0,OUTDOOR.x1,OUTDOOR.z1],[OUTDOOR.x1,OUTDOOR.z1,OUTDOOR.x0,OUTDOOR.z1],[OUTDOOR.x0,OUTDOOR.z1,OUTDOOR.x0,OUTDOOR.z0]];
   check(!!safeRespawnPoint(player,x,z),'walkable outer collision perimeter is not mistaken for a solid object');
   world.movingPolys=()=>[square];check(safeRespawnPoint(player,x,z)===null,'live moving-car polygon is respected');world.movingPolys=()=>[];
   const geometry=new T.BoxGeometry(4.4,1.6,1.8),car=new T.InstancedMesh(geometry,new T.MeshBasicMaterial(),1);
   car.setMatrixAt(0,new T.Matrix4().makeTranslation(x,groundY(x,z)+.8,z));scene.add(car);
   check(safeRespawnPoint(player,x,z)===null,'actual live instance geometry bounds exclude a car body');
   car.setMatrixAt(0,new T.Matrix4().makeTranslation(x+7,groundY(x,z)+.8,z));
   check(!!safeRespawnPoint(player,x,z),'moving instance transform is reread rather than cached');
   car.setMatrixAt(0,new T.Matrix4().makeTranslation(x,groundY(x,z)+.8,z));geometry.translate(7,0,0);geometry.attributes.position.needsUpdate=true;
   const box=geometry.boundingBox;check(!!safeRespawnPoint(player,x,z),'changed vertex buffer version refreshes private instance bounds');check(geometry.boundingBox===box,'private bounds do not mutate authored geometry boxes');
   scene.remove(car);geometry.dispose();
   const block=new T.BoxGeometry(2,1,2),roof=new T.Mesh(block,new T.MeshBasicMaterial());scene.add(roof);
   world.roofs={above:()=>groundY(x,z)+1,under:()=>null,walls:()=>[]};check(safeRespawnPoint(player,x,z)===null,'insufficient actual player ceiling headroom is refused');world.roofs=null;
   world.movingPolys=()=>[[[OUTDOOR.x0,OUTDOOR.z0],[OUTDOOR.x1,OUTDOOR.z0],[OUTDOOR.x1,OUTDOOR.z1],[OUTDOOR.x0,OUTDOOR.z1]]];
   const before=player.pos.clone();check(respawnOutdoors(player,random)===null&&player.pos.equals(before),'all blocked candidates preserve pose; no unchecked fixed fallback');world.movingPolys=()=>[];
   const gear={worn:true};player.jet=gear;player.flying=true;player.fall={top:9,gap:9};player.vy=-4;player.swing={};
   const point=respawnOutdoors(player,random);check(!!point&&player.pos.y===point.y&&player.eyeY===point.y+PLAYER.eye&&camera.position.y===player.eyeY,'real spawn sets standing terrain, feet and camera consistently');
   check(player.jet===gear&&gear.worn&&!player.flying&&player.fall===null&&player.swing===null&&player.vy===0,'existing spawn resets movement but retains worn equipment');
   const pass=lines.every(line=>line.startsWith('PASS'));document.getElementById('out').textContent=lines.join('\n')+'\n'+(pass?'ALL PASS':'SOME FAILED');return {pass,lines,regions:[...regions],uniquePositions:positions.size};
  });
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/native.json',JSON.stringify({...result,errors},null,2));
  await page.screenshot({path:out+'/native.png',fullPage:true});console.log(result.lines.join('\n'));console.log(result.pass&&!errors.length?'ALL PASS':'SOME FAILED');if(!result.pass||errors.length)process.exitCode=1;
 }finally{await browser.close();}
})().catch(error=>{console.error('FAIL '+error.stack);process.exitCode=1;});
