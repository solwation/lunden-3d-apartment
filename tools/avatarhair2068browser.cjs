// #2068 matched hair-colour acceptance and relative timing; production Avatar, existing hair-gloss fixture.
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [site = 'http://localhost:8175', out = 'docs/verification/2068'] = process.argv.slice(2);
const baseline = process.env.BASELINE || '24957657';
const old = Object.fromEntries(['src/avatar.js', 'src/config.js', 'src/avatarhairgloss.js'].map(f => [f, execFileSync('git', ['show', `${baseline}:${f}`], {maxBuffer:32e6})]));
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:400,height:400}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/THREE\.WebGLProgram/.test(m.text()))errors.push(m.text());});
 await page.route('**/base/**',async r=>{
  const u=new URL(r.request().url()),rel=u.pathname.replace(/^\/base\//,'');
  if(old[rel])return r.fulfill({contentType:'text/javascript',body:old[rel]});
  const response=await r.fetch({url:`${u.origin}/${rel}${u.search}`});return r.fulfill({response});
 });
 try{
  await page.goto(site+'/tools/avatarhairgloss.html');await page.waitForFunction(()=>window.__ready,null,{timeout:180000});
  const rows=['kort svart','kort brunt','långt svart','lockigt svart','knut brun','långt blont','skägg grått'];
  for(const [file,kind]of[['dagsljus.jpg','day'],['motljus.jpg','back']]){
   const cols=['near','side','back'].flatMap(v=>[['before',v,kind],['after',v,kind]]);
   const data=await page.evaluate(([r,c])=>window.__sheet(r,c),[rows,cols]);
   fs.writeFileSync(path.join(out,file),Buffer.from(data.split(',')[1],'base64'));
  }
  const info=await page.evaluate(()=>window.__info());
  if(Object.values(info).some(x=>x&&x.calls!==undefined&&x.calls!==1)) errors.push('draw calls changed');
  const orbit=await page.evaluate(()=>window.__orbit('kort svart','near','day',6,0.05));
  fs.writeFileSync(path.join(out,'rorelse.jpg'),Buffer.from(orbit.image.split(',')[1],'base64'));delete orbit.image;
  const cost={close:await page.evaluate(()=>window.__cost(8,'close')),crowd:await page.evaluate(()=>window.__cost(8,'crowd'))};
  const result={baseline,source:execFileSync('git',['rev-parse','HEAD']).toString().trim(),info,orbit,cost,errors};
  fs.writeFileSync(path.join(out,'hair.json'),JSON.stringify(result,null,2)+'\n');
  console.log(errors.length?'FAIL':'PASS',JSON.stringify(result));if(errors.length)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
