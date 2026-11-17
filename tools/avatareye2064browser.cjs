// #2064: one scoped run, fixed-input before/after eye views, all palette colours and pupils; GPU-synchronised software render timings.
const fs=require('fs'),os=require('os'),path=require('path'), assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [base='http://localhost:8172',out='docs/verification/2064',before='http://localhost:8182']=process.argv.slice(2);
(async()=>{
 fs.mkdirSync(out,{recursive:true});const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'eye2064-'));
 const browser=await chromium.launchPersistentContext(tmp,{headless:true,executablePath:process.env.CHROME_PATH,viewport:{width:640,height:400},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errors=[], data={};
 try{
  const sheets=[];
  for(const [tag,url] of [['before',before],['after',base]]){
   const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.goto(url+'/tools/avatareyes.html');await page.waitForFunction(()=>window.__ready);
   const palette=await page.evaluate(async()=>{const c=await import('../src/config.js');return c.EYES;});
   const skins=[0xf1c9a8,0xb88159,0x6b4430], close={aim:1,dist:0.5,fov:4.2,follow:true,seconds:0.05};
   const frames=skins.flatMap((skin,i)=>[['dag '+i,{...close,look:{skin,eyes:palette[6]}}],['motljus '+i,{...close,look:{skin,eyes:palette[0]},sun:[-1,1.5,-4]}]]);
   frames.push(['snett 45°',{...close,yaw:Math.PI/4,look:{skin:skins[1],eyes:palette[6]}}],['profil',{...close,yaw:1.4,look:{skin:skins[1],eyes:palette[0]}}],['blink stängd',{...close,blink:1}],['blick åt sidan',{...close,gaze:[0.003,0.001]}]);
   const tiles=[];data[tag]={frames:{}};
   for(const [name,opts] of frames){const d=await page.evaluate(o=>window.__frame(o),opts);assert.equal(d.calls,1,name+' draw calls');data[tag].frames[name]=d;tiles.push([name,await page.locator('canvas').screenshot().then(b=>b.toString('base64'))]);}
   data[tag].palette=[];
   for(const eyes of palette){const d=await page.evaluate(o=>window.__frame(o),{...close,look:{skin:skins[1],eyes}});assert.equal(d.calls,1);data[tag].palette.push({eyes,...d});}
   const bright=await page.evaluate(o=>window.__frame(o),{...close,preset:'sun',seconds:8}),dark=await page.evaluate(o=>window.__frame(o),{...close,preset:'dark',seconds:8});assert.ok(dark.pupil>bright.pupil*1.5);data[tag].pupils={bright:bright.pupil,dark:dark.pupil};
   data[tag].geometry=await page.evaluate(async()=>{const {avatarModelGeometry,Avatar}=await import('../src/avatar.js'),{avatarLook}=await import('../src/config.js'),lk={...avatarLook('2064'),style:0,facial:0};const g=avatarModelGeometry(lk),a=g.attributes;let head=0;for(let i=0;i<a.position.count;i+=3)if(a.facePart.getX(i)>0&&a.facePart.getX(i)<100)head++;return{triangles:a.position.count/3,head,bones:new Avatar(lk).mesh.skeleton.bones.length};});
   await page.evaluate(o=>window.__frame(o),close);
   data[tag].ms=await page.evaluate(o=>{const gl=document.querySelector('canvas').getContext('webgl2'),m=[];for(let i=0;i<40;i++){const t=performance.now();window.__frame(o);gl.finish();if(i>=10)m.push(performance.now()-t);}m.sort((a,b)=>a-b);return{median:m[m.length>>1],p90:m[Math.floor(m.length*.9)],n:m.length};},close);
   sheets.push([tag,tiles]);await page.close();
  }
  assert.deepEqual(data.after.geometry,data.before.geometry,'no triangle or bone budget increase');
  const sheet=await browser.newPage();await sheet.setContent('<canvas></canvas>');await sheet.evaluate(async rows=>{const c=document.querySelector('canvas'),w=320,h=220,cols=5;c.width=cols*w;c.height=rows.length*2*h;const ctx=c.getContext('2d');ctx.fillStyle='#eee';ctx.fillRect(0,0,c.width,c.height);ctx.font='14px sans-serif';for(let row=0;row<rows.length;row++)for(let i=0;i<rows[row][1].length;i++){const [label,b64]=rows[row][1][i],img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();const x=i%cols*w,y=(row*2+Math.floor(i/cols))*h;ctx.drawImage(img,0,0,640,400,x,y+20,w,200);ctx.fillStyle='#111';ctx.fillText(rows[row][0]+': '+label,x+4,y+15);}},sheets);await sheet.locator('canvas').screenshot({path:path.join(out,'ogon-fore-efter.png')});await sheet.close();
  data.errors=errors;fs.writeFileSync(path.join(out,'eyes.json'),JSON.stringify(data,null,2));assert.equal(errors.length,0,errors.join('\n'));console.log('PASS',JSON.stringify(data));
 }finally{await browser.close();fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
