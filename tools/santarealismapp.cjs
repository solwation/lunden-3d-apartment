// #1923: a matched normal apartment view, using the actual Santa consumer and sofa.
// Run via browsertest.sh; BASE OUT [baseline revision]. No full-world timing claim.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),kit=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8202',out=process.argv[3]||'docs/verification/1923',revision=process.argv[4]||'c1aa5154',afterOnly=process.argv.includes('--after-only');
const files=['src/santa.js','src/santaconfig.js','models/santa.glb'],old=Object.fromEntries(files.map(f=>[f,execFileSync('git',['show',`${revision}:${f}`],{maxBuffer:4e6})]));
const hash=v=>crypto.createHash('sha256').update(v).digest('hex'),result={revision,environment:'Chromium / SwiftShader; actual main/World, quality1, light resources, 1100x700 CSS, device DPR1 / renderer ratio0.75; fixed calendar and camera; no world/device timing claim',errors:[]};
if(afterOnly)result.before=JSON.parse(fs.readFileSync(path.join(out,'apartment.json'))).before;
fs.mkdirSync(out,{recursive:true});
(async()=>{const b=await kit.launch();try{for(const phase of afterOnly?['after']:['before','after']){const ctx=await b.newContext({viewport:{width:1100,height:700},deviceScaleFactor:1});
await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join('node_modules/three',r.request().url().split('three@0.170.0/')[1]))}));
const served=[];if(phase==='before')for(const f of files)await ctx.route(`**/${f}*`,r=>{served.push(f);return r.fulfill({contentType:f.endsWith('.glb')?'model/gltf-binary':'text/javascript',body:old[f]})});
const p=await ctx.newPage();p.on('pageerror',e=>result.errors.push({phase,error:e.message}));
await p.goto(`${base}/?shot&cloud=&month=12&day=24&time=15&freeze&quality=1&res=light&test=lazy&at=2.5,10,180,0`,{waitUntil:'commit'});await p.waitForFunction(()=>window.__app?.santa,null,{timeout:100000});console.log('READY',phase);
result[phase]=await p.evaluate(async()=>{const a=__app,T=await import('three'),s=a.santa;a.renderer.setAnimationLoop(null);a.hideLoading();a.showOverlay(false);document.getElementById('arm').hidden=true;for(const id of ['player-dialog','install']){const e=document.getElementById(id);if(e)e.hidden=true}a.step(0);s.greeting=0;s.t=5;s.update(0);a.scene.updateMatrixWorld(true);
const target=new T.Vector3(0,.63,.08).applyMatrix4(s.object.matrixWorld),from=new T.Vector3(.85,1.15,2.2).applyMatrix4(s.object.matrixWorld);a.camera.position.copy(from);a.camera.lookAt(target);a.camera.updateMatrixWorld(true);a.renderer.render(a.scene,a.camera);
const finite=[];s.object.traverse(o=>{if(!o.matrixWorld.elements.every(Number.isFinite))finite.push(o.name||o.type)});if(!a.camera.matrixWorld.elements.every(Number.isFinite)||!a.camera.projectionMatrix.elements.every(Number.isFinite))finite.push('camera');
return{visible:s.visible,state:s.state,quality:a.quality.level,pixelRatio:a.renderer.getPixelRatio(),camera:from.toArray(),target:target.toArray(),finite,meshTriangles:s.fig.body.geometry.attributes.position.count/3}});
assert(result[phase].visible&&result[phase].state==='sitting');assert.deepEqual(result[phase].finite,[]);assert.equal(result[phase].quality,1);
result[phase].hashes=Object.fromEntries(files.map(f=>[f,hash(phase==='before'?old[f]:fs.readFileSync(f))]));result[phase].served=served;
if(phase==='before')assert.equal(new Set(served).size,files.length,'all baseline inputs routed');await p.screenshot({path:path.join(out,phase==='before'?'before/apartment.png':'apartment.png')});await ctx.close();}
assert.deepEqual(result.before.camera,result.after.camera);assert.deepEqual(result.before.target,result.after.target);assert.equal(result.before.pixelRatio,result.after.pixelRatio);assert.deepEqual(result.errors,[]);result.pass=true;
}finally{await b.close();fs.writeFileSync(path.join(out,'apartment.json'),JSON.stringify(result,null,2)+'\n')}console.log('PASS actual apartment, matched inputs/camera, finite Santa and camera transforms')})().catch(e=>{console.error(e);process.exit(1)});
