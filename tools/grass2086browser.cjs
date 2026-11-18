// #2086: actual grass consumers before/after (before = BEFORE_GRASS file served as /src/grass.js), walk view summer/winter + far view.
// tools/browsertest.sh node tools/grass2086browser.cjs http://localhost:8286 OUTDIR before|after   (THREE_DIR = local three@0.170.0 package if the CDN is unreachable)
const fs=require('node:fs'),path=require('node:path'),kit=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8286',out=process.argv[3]||'/tmp/grass2086',phase=process.argv[4]||'after';
const ONLY=process.env.VIEWS?.split(','),VIEWS=[
 {name:'walk-summer',at:'-4,22.6,95,-18',month:6},
 {name:'walk-winter',at:'-4,22.6,95,-18',month:1},
 {name:'park-summer',at:'-8,52,200,-12',month:6},
 {name:'walk-houseC',at:'-55,45.3,60,-20',month:6},
 {name:'far-summer',at:'-8,52,200,-16,22',month:6},
].filter(v=>!ONLY||ONLY.includes(v.name));
(async()=>{const browser=await kit.launch();const result={phase,views:[],errors:[]};try{
 for(const v of VIEWS){
  const ctx=await browser.newContext({viewport:kit.SMALL,deviceScaleFactor:1});
  if(process.env.THREE_DIR)await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>r.fulfill({path:path.join(process.env.THREE_DIR,new URL(r.request().url()).pathname.split('three@0.170.0/')[1]),contentType:'text/javascript'}));
  if(phase==='before')await ctx.route(/\/src\/grass\.js(\?.*)?$/,r=>r.fulfill({path:process.env.BEFORE_GRASS,contentType:'text/javascript'}));
  const page=await ctx.newPage();page.on('pageerror',e=>result.errors.push(e.message));
  await page.goto(`${base}/?shot&cloud=&at=${v.at}&month=${v.month}&day=2&time=13&freeze&weather=clear&test=lazy`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:600000,polling:200});await kit.skipNameDialog(page);
  await page.evaluate(async m=>{const A=__app;A.day.month=m;A.day.paused=true;(await import('/src/seasons.js')).applySeason(m);A.step(0);},v.month);
  const file=path.join(out,`${phase}-${v.name}.png`);fs.mkdirSync(out,{recursive:true});await kit.shot(page,file);
  const info=await page.evaluate(async()=>{const r=__app.renderer.info;return{calls:r.render.calls,triangles:r.render.triangles,textures:r.memory.textures,geometries:r.memory.geometries};});
  if(v.name==='walk-summer')result.texture=await page.evaluate(async()=>{
   const G=await import('/src/grass.js'),C=await import('/src/config.js'),n=C.GRASS.textureSize,img=G.grassTexture().image,px=img.getContext('2d').getImageData(0,0,n,n).data;
   const lum=(x,y)=>{x=(x+n)%n;y=(y+n)%n;const i=(y*n+x)*4;return px[i]+px[i+1]+px[i+2];};
   let seamX=0,seamY=0,inX=0,inY=0;for(let i=0;i<n;i++){seamX+=Math.abs(lum(n-1,i)-lum(0,i));seamY+=Math.abs(lum(i,n-1)-lum(i,0));for(const c of[63,127,191]){inX+=Math.abs(lum(c,i)-lum(c+1,i))/3;inY+=Math.abs(lum(i,c)-lum(i,c+1))/3;}}
   const hash=async d=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',d))).map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,16);
   const gens=[];for(const k of[1,2,3]){const t=performance.now(),M=await import('/src/grass.js?gen'+k),t0=performance.now(),tex=M.grassTexture(),ms=performance.now()-t0;gens.push({ms:+ms.toFixed(1),hash:await hash(tex.image.getContext('2d').getImageData(0,0,n,n).data),import:+(t0-t).toFixed(1)});}
   const mc=G.grassMeanColor();
   // coarse 8x8 block luminance spread: how patchy the tile reads once blades are averaged out
   const blocks=[];for(let by=0;by<8;by++)for(let bx=0;bx<8;bx++){let s=0;for(let y=0;y<n/8;y++)for(let x=0;x<n/8;x++)s+=lum(bx*n/8+x,by*n/8+y);blocks.push(s/(n*n/64)/3);}
   const bm=blocks.reduce((a,b)=>a+b)/64,bsd=Math.sqrt(blocks.reduce((a,b)=>a+(b-bm)**2,0)/64);
   return{size:[img.width,img.height],seam:{x:+(seamX/n).toFixed(2),y:+(seamY/n).toFixed(2),interiorX:+(inX/n).toFixed(2),interiorY:+(inY/n).toFixed(2)},hash:await hash(px),gens,
    mean:[mc.r,mc.g,mc.b].map(x=>+x.toFixed(5)),blockLumSD:+bsd.toFixed(2),wrap:G.grassTexture().wrapS,repeat:G.grassTexture().repeat.x};
  });
  result.views.push({...v,file,...info});await ctx.close();
 }
}finally{await browser.close();}fs.writeFileSync(path.join(out,phase+'.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result,null,1));if(result.errors.length)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1});
