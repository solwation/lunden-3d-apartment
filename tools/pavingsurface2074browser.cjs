// #2074: one matched actual World material/plate and buildExterior consumer run; no full game startup.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const [base='http://localhost:8192',out='docs/verification/2074']=process.argv.slice(2),baseline='6e1576aa078b70730e73bb4ffb805dc32e1b3959';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const views=['patio-near','patio-normal','terrace','portik','snow-patio','snow-portik','restored-patio'];
const cleanMap=t=>t&&Object.fromEntries(Object.entries(t).filter(([k])=>k!=='id'));
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const proof={baseline,renderer:'Chromium/SwiftShader',viewport:[1100,720],fixture:'Actual World.M.patio + World.plate and buildExterior own/neighbour/roof-terrace/portik consumers; decor hidden equally, no full World/game',errors:[],external:[],phases:{},source:{}},pictures={};
try{
 for(const phase of ['before','after']){
  const p=await browser.newPage({viewport:{width:1100,height:720},deviceScaleFactor:1});p.on('pageerror',e=>proof.errors.push(phase+': '+e.message));p.on('console',m=>{if(m.type()==='error'||/THREE.WebGLProgram/.test(m.text()))proof.errors.push(phase+': '+m.text())});p.on('request',r=>{if(new URL(r.url()).origin!==new URL(base).origin)proof.external.push(r.url())});
  await p.route('**/src/world.js',r=>{const source=phase==='before'?execFileSync('git',['show',baseline+':src/world.js'],{maxBuffer:32e6}):fs.readFileSync('src/world.js');return r.fulfill({contentType:'text/javascript',body:source+'\nexport { M, plate };\n'})});
  if(phase==='before')await p.route('**/src/exterior.js',r=>r.fulfill({contentType:'text/javascript',body:execFileSync('git',['show',baseline+':src/exterior.js'],{maxBuffer:32e6})}));
  await p.goto(base+'/tools/pavingsurface2074.html');await p.waitForFunction(()=>window.__ready,null,{timeout:180000});
  const inv=await p.evaluate(()=>window.__proof());assert(inv.finite,'finite emitted geometry');
  proof.phases[phase]={invariants:inv,views:{}};pictures[phase]={};
  for(const view of views){const f=await p.evaluate(v=>window.__frame(v),view);pictures[phase][view]=f.image;delete f.image;proof.phases[phase].views[view]=f;}
  await p.close();
 }
 const a=proof.phases.before,b=proof.phases.after;
 for(const k of ['geometrySHA256','geometryBytes','bounds','terrace','portikCentre'])assert.deepEqual(a.invariants[k],b.invariants[k],k+' unchanged');
 for(const kind of ['own','portik'])assert.deepEqual(cleanMap(a.invariants[kind].map),cleanMap(b.invariants[kind].map),'original colour pixels/dimensions/repeat exact');
 assert(b.invariants.own.samePacked&&b.invariants.portik.samePacked);assert.equal(b.invariants.own.bump.id,b.invariants.portik.bump.id,'one shared scalar texture');
 for(const view of views){const x=a.views[view],y=b.views[view];for(const k of ['camera','target','calls','triangles','geometries'])assert.deepEqual(x[k],y[k],view+' '+k);assert.equal(y.textures,x.textures+1,'one additional uploaded texture');}
 for(const view of ['snow-patio','snow-portik']){const f=b.views[view];assert.equal(f.own.map,null);assert.equal(f.own.bump,null);assert.equal(f.own.roughnessMap,null);assert.equal(f.own.roughness,.95);assert.equal(f.own.color,a.views[view].own.color);assert.deepEqual(f.portik,b.invariants.portik,'sheltered portik unchanged in winter');}
 assert.deepEqual(b.views['restored-patio'].own,b.invariants.own,'same summer map objects restored');
 const surface=b.invariants.own.bump;let[w,h]=surface.size,mipBytes=0;for(;;){mipBytes+=w*h*4;if(w===1&&h===1)break;w=Math.max(1,w>>1);h=Math.max(1,h>>1)}proof.extraTexture={unique:1,size:surface.size,baseBytes:surface.bytes,mipBytes};
 assert.deepEqual(proof.errors,[]);assert.deepEqual(proof.external,[]);
 const sheet=await browser.newPage();for(const [name,names]of [['patio',['patio-near','patio-normal']],['terrace-portik',['terrace','portik']],['snow',['snow-patio','snow-portik']]]){
  const uri=await sheet.evaluate(async({pictures,names})=>{const c=document.createElement('canvas');c.width=2200;c.height=1476;const g=c.getContext('2d');g.fillStyle='#f8f8f4';g.fillRect(0,0,c.width,c.height);g.fillStyle='#222';g.font='24px sans-serif';g.fillText('Före',16,27);g.fillText('Efter',1116,27);for(const [col,phase]of ['before','after'].entries())for(const [row,view]of names.entries()){const im=new Image();im.src=pictures[phase][view];await im.decode();if(im.naturalWidth!==1100||im.naturalHeight!==720)throw Error('Unexpected capture size');g.drawImage(im,col*1100,36+row*720)}return c.toDataURL('image/jpeg',.94)},{pictures,names});fs.writeFileSync(path.join(out,name+'-paired.jpg'),Buffer.from(uri.split(',')[1],'base64'));
 }
 await sheet.close();proof.composition={source:[1100,720],sheet:[2200,1476],scale:[1,1],labels:36};
 for(const f of ['src/pavingsurface.js','src/patio.js','src/config.js','src/world.js','src/exterior.js','src/seasons.js','data/plan.json','tools/pavingsurfacetest.mjs','tools/pavingsurface2074.html','tools/pavingsurface2074browser.cjs'])proof.source[f]=sha(fs.readFileSync(f));
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({pass:true,extraTexture:proof.extraTexture,geometryBytes:b.invariants.geometryBytes,views:Object.fromEntries(views.map(v=>[v,{calls:b.views[v].calls,triangles:b.views[v].triangles,textures:b.views[v].textures}]))}));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
