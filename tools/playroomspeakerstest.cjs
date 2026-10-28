// Real production speaker bounds/source alignment, plus normal-light north/south views.
const {launch}=require('./testkit.cjs'),fs=require('node:fs'),assert=require('node:assert/strict');
const base=process.argv[2]||'http://localhost:8772',out=process.argv[3]||'/tmp/playroom-speakers';
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await launch();try{
 const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL/.test(m.text()))errors.push(m.text());});
 await page.goto(base+'/tools/playroomspeakerstest.html');await page.waitForFunction(()=>window.ready,null,{timeout:90000});
 const speakers=await page.evaluate(()=>window.speakers);assert.equal(speakers.length,4);
 for(const s of speakers){assert(s.clearance>=.079,`speaker breaches ceiling: ${s.clearance}`);assert(s.sourceError<.0002,`sound source misaligned: ${s.sourceError}`);assert(s.front[1]<0&&s.toward>.9,'speaker still faces down toward room centre');assert(s.min[0]>-1502.94&&s.max[0]<-1497.06&&s.min[2]>-1505.2&&s.max[2]<-1498.46,'speaker stays within billiard room');}
 console.log('PASS four transformed boxes below ceiling, sound aligned, four corners/orientation retained',JSON.stringify(speakers));
 for(const [name,south] of [['north',false],['south',true]]){console.log(name,await page.evaluate(south=>window.view(south),south));await page.screenshot({path:out+'/'+name+'.png'});}
 assert.deepEqual(errors,[]);console.log('PASS no page/shader errors');fs.writeFileSync(out+'/result.json',JSON.stringify({speakers,errors},null,2)+'\n');
}finally{await browser.close();}})();
