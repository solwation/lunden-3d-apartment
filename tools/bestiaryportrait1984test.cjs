// #1984 binder portraits must not depend on the world's pixel ratio: cats and a fish are rendered at ratios 0.6/1/2, must be
// non-blank, roughly centred and fill the frame; then the real binder index with discovered cats is captured.
const fs=require('node:fs'),kit=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8198',out=process.argv[3]||'docs/verification/1984';
(async()=>{fs.mkdirSync(out,{recursive:true});const b=await kit.launch();let bad=0;
try{const {page}=await kit.open(b,base+'/?cloud=&mp=0&time=12&freeze',{lazy:true,viewport:{width:1280,height:800}});await kit.skipNameDialog(page);
 const rows=await page.evaluate(async()=>{const a=window.__app,{BestiaryImages}=await import('/src/bestiaryimages.js'),res=[],ids=['cat:huskatt:svartvit:adult','cat:siames:siames:kitten','cat:perser:vit:adult','cat:Miele:Miele:adult','fish:abborre'];
  const stats=async(url,size)=>{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');x.drawImage(img,0,0);const p=x.getImageData(0,0,size,size).data;let n=0,x0=size,x1=-1,y0=size,y1=-1;for(let i=0;i<size*size;i++)if(p[i*4+3]>16){n++;const px=i%size,py=(i/size)|0;x0=Math.min(x0,px);x1=Math.max(x1,px);y0=Math.min(y0,py);y1=Math.max(y1,py);}return{opaque:n/(size*size),cx:(x0+x1)/2/size,cy:(y0+y1)/2/size,w:(x1-x0+1)/size,h:(y1-y0+1)/size};};
  const keep=a.renderer.getPixelRatio();try{for(const pr of[.6,1,2]){a.renderer.setPixelRatio(pr);const images=new BestiaryImages({registry:a.bestiaryRegistry,renderer:a.renderer,store:null});for(const id of ids)res.push({pr,id,...await stats(await images.get(id,96),96)});}}finally{a.renderer.setPixelRatio(keep);}
  return res;});
 for(const r of rows){const ok=r.opaque>.04&&Math.max(r.w,r.h)>.55&&Math.abs(r.cx-.5)<.15&&Math.abs(r.cy-.5)<.15;if(!ok)bad++;console.log(ok?'PASS':'FAIL',JSON.stringify(r));}
 await page.evaluate(async()=>{const a=window.__app;for(const e of a.bestiaryRegistry.list())if(/^(cat|fish)/.test(e.id))a.bestiary.record(e.id,'seen','');await new Promise(r=>setTimeout(r,300));a.binderPanel.show(true);});
 await page.waitForFunction(()=>document.querySelectorAll('.dex-grid .dex-art.loaded').length>=16,null,{timeout:120000});
 await kit.shot(page,out+'/index-cats.png',{frames:1,viewport:{width:1280,height:800}});
}finally{await b.close();}
if(bad){console.error(bad+' portrait checks failed');process.exitCode=1;}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
