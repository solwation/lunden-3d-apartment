// PLAYWRIGHT_MODULE=… node docs/verification/2410/masked-crop-stats.cjs crops.json webDir unrealDir [unrealDir2 ...]
// crops: {view: {name: [x0,y0,x1,y1, mask?]}}; mask "water" keeps pixels with B > G and B > R, "grass" keeps G > R and G > B.
// Per crop: mean sRGB of kept pixels, mean relative luminance of their linear colour, kept share. Ratios Unreal/web as #2390 score.py.
const fs=require('fs'),path=require('path');const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{const [cf,webDir,...uDirs]=process.argv.slice(2);const crops=JSON.parse(fs.readFileSync(cf));const b=await chromium.launch();const p=await b.newPage();
const stat=async(file,rects)=>p.evaluate(async({url,rects})=>{const img=new Image();img.src=url;await img.decode();const c=new OffscreenCanvas(img.width,img.height),g=c.getContext('2d');g.drawImage(img,0,0);
const lin=v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4};const res={};
for(const[n,[x0,y0,x1,y1,mask]]of Object.entries(rects)){const X=Math.round(x0*img.width),Y=Math.round(y0*img.height),W=Math.round((x1-x0)*img.width),H=Math.round((y1-y0)*img.height);
const d=g.getImageData(X,Y,W,H).data;let r=0,gg=0,bb=0,l=0,k=0;for(let i=0;i<d.length;i+=4){const R=d[i],G=d[i+1],B=d[i+2];
if(mask==='water'&&!(B>G&&B>R))continue;if(mask==='grass'&&!(G>R&&G>B))continue;r+=R;gg+=G;bb+=B;l+=0.2126*lin(R)+0.7152*lin(G)+0.0722*lin(B);k++;}
res[n]={srgb:[r/k,gg/k,bb/k],lum:l/k,share:k/(d.length/4)};}return res;},{url:'data:image/'+(file.endsWith('png')?'png':'jpeg')+';base64,'+fs.readFileSync(file).toString('base64'),rects});
const sat=c=>(Math.max(...c)-Math.min(...c))/Math.max(Math.max(...c),1e-6);const out={};
for(const[view,rects]of Object.entries(crops)){const wf=['jpg','png'].map(e=>path.join(webDir,`web-${view}.${e}`)).find(f=>fs.existsSync(f));const w=await stat(wf,rects);out[view]={web:w};
for(const ud of uDirs){const u=await stat(path.join(ud,`${view}.png`),rects);out[view][ud]=u;
for(const n of Object.keys(rects)){const a=w[n],z=u[n];const L=z.lum/a.lum,Sr=sat(a.srgb)>=0.1?sat(z.srgb)/sat(a.srgb):NaN;
const ch=z.srgb.map((v,i)=>((v/a.srgb[i]-1)*100).toFixed(0)).join('/');
console.log(`${path.basename(ud).padEnd(8)} ${view.padEnd(13)} ${n.padEnd(11)} web ${a.srgb.map(v=>v.toFixed(0)).join(',').padEnd(12)} ue ${z.srgb.map(v=>v.toFixed(0)).join(',').padEnd(12)} lum ${L.toFixed(2)} sat ${isNaN(Sr)?'  - ':Sr.toFixed(2)} ch% ${ch.padEnd(12)} share ${a.share.toFixed(2)}/${z.share.toFixed(2)}`);}}}
await b.close();})();
