// Serve the repository root. Prefer CDP on a hardware browser; software results are functionality only.
// PLAYWRIGHT_MODULE=... THREE_187_DIR=... CDP_URL=http://127.0.0.1:9227 node tools/meshlet1872/verify.cjs BASE OUT
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const [base='http://127.0.0.1:8171',out='docs/verification/1872']=process.argv.slice(2);
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=process.env.CDP_URL?await chromium.connectOverCDP(process.env.CDP_URL):await chromium.launch({
    executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--enable-unsafe-webgpu']});
  const context=await browser.newContext({viewport:{width:820,height:760}});
  const report={browser:browser.version(),errors:[],samples:[]};
  try {
    const p=await context.newPage();
    p.on('pageerror',e=>report.errors.push(e.stack));
    p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
    if(process.env.THREE_187_DIR)await context.route('https://cdn.jsdelivr.net/npm/three@0.187.0/**',r=>r.fulfill({
      path:path.join(process.env.THREE_187_DIR,r.request().url().split('three@0.187.0/')[1]),contentType:'text/javascript'}));
    const open=async suffix=>{
      await p.goto(base+'/tools/meshlet1872/'+suffix,{waitUntil:'domcontentloaded'});
      await p.waitForFunction(()=>window.__meshletReady||window.__meshletReport?.failure,null,{timeout:180000});
      const init=await p.evaluate(()=>window.__meshletReport);assert.ok(!init.failure,init.failure);return init;
    };
    report.initial=await open('');assert.equal(report.initial.backend,'webgpu','A WebGPU adapter is required for the comparison');
    assert.ok(report.initial.timestampQueries,'GPU timestamp queries are required');
    report.component=await p.evaluate(async()=>{const m=await import('./checks.js');return m.checkAdaptation(__meshletPreview.renderer);});
    report.compiles=[];
    for(const view of ['campus','gym','far']) {
      await p.evaluate(v=>__meshletPreview.view(v),view);
      // Reverse the second round to expose ordering/warm-up bias.
      for(let round=0;round<2;round++)for(const mode of round?['meshlet','adapted','original']:['original','adapted','meshlet']) {
        report.compiles.push({view,mode,...await p.evaluate(m=>__meshletPreview.select(m),mode)});
        await p.evaluate(()=>__meshletPreview.frame(35));
        const sample=await p.evaluate(()=>__meshletPreview.sample(30));
        report.samples.push({round,...sample});
        console.log(view,round,mode,'GPU',sample.gpuTotalMs.median,'CPU',sample.cpuMs.median,'tris',sample.render.triangles,sample.counters?.triangles);
        if(round===0)await p.locator('canvas').screenshot({path:path.join(out,`${view}-${mode}.png`)});
      }
      await p.evaluate(async()=>{__meshletPreview.meshlet.lodThreshold=0;await __meshletPreview.select('meshlet');await __meshletPreview.frame(35);});
      report.samples.push({round:'no-lod',...await p.evaluate(()=>__meshletPreview.sample(30))});
      await p.locator('canvas').screenshot({path:path.join(out,`${view}-meshlet-no-lod.png`)});
      await p.evaluate(()=>{__meshletPreview.meshlet.lodThreshold=1;});
    }
    report.final=await p.evaluate(()=>window.__meshletReport);
    // Pixel comparison uses browser PNG decoding, without an extra test dependency.
    report.pixels=[];
    for(const view of ['campus','gym','far'])for(const mode of ['adapted','meshlet','meshlet-no-lod']) {
      const data=['original',mode].map(m=>'data:image/png;base64,'+fs.readFileSync(path.join(out,`${view}-${m}.png`)).toString('base64'));
      const diff=await p.evaluate(async urls=>{
        const images=await Promise.all(urls.map(async src=>{const i=new Image();i.src=src;await i.decode();return i;}));
        const arrays=images.map(i=>{const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,c.width,c.height).data;});
        let sum=0,changed=0,max=0;for(let i=0;i<arrays[0].length;i+=4){let pixel=0;for(let k=0;k<3;k++){
          const d=Math.abs(arrays[0][i+k]-arrays[1][i+k]);sum+=d;pixel=Math.max(pixel,d);max=Math.max(max,d);}
          if(pixel)changed++;}
        return{meanChannelDelta:sum/(arrays[0].length/4*3),changedPixels:changed,maxChannelDelta:max};
      },data);
      report.pixels.push({view,mode,...diff});
      if(mode==='adapted')assert.ok(diff.meanChannelDelta<.05,'Side/colour bridge changed the image');
    }
    // Separate fresh renderer for the meshlet buffer allocation, avoiding the three-mode cumulative cache.
    report.freshMeshlet=await open('?mode=meshlet');
    await p.evaluate(()=>__meshletPreview.frame(35));
    report.freshMeshlet.sample=await p.evaluate(()=>__meshletPreview.sample(3));
    report.fallback=await open('?webgl');assert.equal(report.fallback.backend,'webgl');
    await p.evaluate(async()=>{await __meshletPreview.select('meshlet');await __meshletPreview.frame(2);});
    report.fallback.sample=await p.evaluate(()=>__meshletPreview.sample(3));
    await p.locator('canvas').screenshot({path:path.join(out,'webgl-fallback.png')});
    assert.ok(report.fallback.sample.render.triangles>0);
    assert.deepEqual(report.final.errors,[]);assert.deepEqual(report.errors,[]);
  }catch(e){report.failure=e.stack;console.error(e);process.exitCode=1;}
  finally{fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n');await context.close();await browser.close();}
})();
