// Bounded proof for configuration-only centralization; compare actual geometry bytes in all eight poses.
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [base='http://localhost:8200',out='docs/verification/1917/geometry-equivalence.json',revision='fef5ad5377b2aac68605607d71abeef2bb8ee55b']=process.argv.slice(2);
const files=['src/hand.js','src/config.js'],hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const candidate=Object.fromEntries(files.map(f=>[f,fs.readFileSync(f)]));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const result={status:'running',reference:revision,before:[],after:[],errors:[]};
 try{
  for(const phase of ['before','after']){
   const page=await browser.newPage();page.on('pageerror',e=>result.errors.push(e.message));
   if(phase==='before')for(const f of files)await page.route('**/'+f,r=>r.fulfill({contentType:'text/javascript',body:cp.execFileSync('git',['show',revision+':'+f])}));
   await page.goto(base+'/tools/hand-realism.html');await page.waitForFunction(()=>window.__ready);
   for(const mode of ['reach','grip','palm','hug','web','wet','bare','accessories']){
    result[phase].push(await page.evaluate(async mode=>{
     const a=handAudit,record=a.pose(mode),geos=new Set(Object.values(a.hand.armGeometries));a.camera.traverse(o=>{if(o.geometry)geos.add(o.geometry)});
     const fingerprint=async array=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(array.buffer,array.byteOffset,array.byteLength)))].map(x=>x.toString(16).padStart(2,'0')).join('');
     const geometry=[];
     for(const g of geos){const row={index:g.index?await fingerprint(g.index.array):null,attributes:{},morphs:{}};
      for(const [k,v]of Object.entries(g.attributes))row.attributes[k]={count:v.count,itemSize:v.itemSize,hash:await fingerprint(v.array)};
      for(const [k,vs]of Object.entries(g.morphAttributes)){row.morphs[k]=[];for(const v of vs)row.morphs[k].push({count:v.count,hash:await fingerprint(v.array)})}
      geometry.push(row);
     }
     return{mode,record,geometry};
    },mode));
   }
   await page.close();
  }
  if(JSON.stringify(result.before)!==JSON.stringify(result.after))throw Error('Geometry, pose or budget changed during constant centralization');
  if(result.errors.length)throw Error(result.errors.join('\n'));
  result.referenceHashes=Object.fromEntries(files.map(f=>[f,hash(cp.execFileSync('git',['show',revision+':'+f]))]));
  result.candidateHashes=Object.fromEntries(files.map(f=>[f,hash(candidate[f])]));
  for(const f of files)if(hash(fs.readFileSync(f))!==hash(candidate[f]))throw Error('Source changed during proof: '+f);
  result.cases=result.after.map(v=>({mode:v.mode,calls:v.record.calls,triangles:v.record.triangles,geometries:v.geometry.length,geometrySHA256:hash(JSON.stringify(v.geometry)),poseSHA256:hash(JSON.stringify(v.record)),byteIdentical:true}));
  delete result.before;delete result.after;
  result.status='passed';console.log('PASS byte-identical hand/morph/arm/cuff/accessory geometry and pose/budget across eight actual states.');
 }catch(e){result.status='failed';result.error=e.message;throw e}
 finally{fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
