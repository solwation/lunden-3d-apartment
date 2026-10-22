// #1493: actual production AdminReports binding/dialog with local Worker and lost-write recovery.
const fs=require('node:fs'),assert=require('node:assert/strict'),kit=require('./testkit.cjs');
const {codes}=require('./secret-test-inputs.cjs').loadSecretTestInputs();
const [game='http://localhost:8191',worker='http://localhost:8195',out='/tmp/rapporter1493-browser']=process.argv.slice(2);
if(![game,worker].every(u=>['localhost','127.0.0.1'].includes(new URL(u).hostname)))throw Error('Local fixtures only');
(async()=>{fs.mkdirSync(out,{recursive:true,mode:0o700});const browser=await kit.launch();try{
 const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:''}));await page.goto(game+'/?cloud='+encodeURIComponent(worker));
 const session=await fetch(worker+'/report-session',{method:'POST',headers:{Origin:game,'Content-Type':'application/json'},body:JSON.stringify({code:codes[0]})}).then(r=>r.json());assert(session.token);
 const main=fs.readFileSync(require('node:path').join(__dirname,'../src/main.js'),'utf8'),binding=main.slice(main.indexOf('const adminReports = new AdminReports('),main.indexOf("const editHelp = document.getElementById('rearrange-help')"));
 await page.evaluate(async({binding,session})=>{const {AdminReports}=await import('/src/adminreports.js');document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;
 const c=document.createElement('canvas');c.width=320;c.height=200;c.getContext('2d').fillRect(0,0,320,200);
 const body=`const terminalInput=document.getElementById('terminal-code'),leaderboard={name:'Lin'},reportCapture={capture:async()=>image},chat=null,rearrange={unlocked:false,enable(){}},editUI=()=>{};${binding}return {reports:adminReports,leaderboard};`;
 window.fixture=new Function('AdminReports','image',body)(AdminReports,c.toDataURL('image/jpeg'));fixture.reports.token=session.token;fixture.reports.expires=session.expires;fixture.reports.menuState();fixture.reports.openReport();
 },{binding,session});
 let lose=true;const sent=[];await page.route(worker+'/reports/*',async route=>{const body=route.request().postDataJSON();sent.push({id:route.request().url().split('/').pop(),playerName:body.playerName});const response=await route.fetch();if(lose){lose=false;await route.abort('failed');}else await route.fulfill({response});});
 await page.locator('#admin-report-text').fill('Första lokala rapporten');await page.locator('#admin-report-send').tap();await page.waitForFunction(()=>!fixture.reports.busy);assert(await page.locator('#admin-report-text').inputValue());
 await page.evaluate(()=>fixture.leaderboard.name='Moa');await page.locator('#admin-report-send').tap();await page.waitForFunction(()=>!fixture.reports.busy);assert.equal(sent[0].id,sent[1].id);assert.equal(sent[0].playerName,'Lin');assert.equal(sent[1].playerName,'Lin');
 await page.evaluate(()=>fixture.leaderboard.name='Lin');await page.locator('#admin-report-text').fill('Andra lokala rapporten');await page.locator('#admin-report-send').tap();await page.waitForFunction(()=>!fixture.reports.busy);assert.equal(sent[2].playerName,'Lin');assert.notEqual(sent[2].id,sent[0].id);
 const reports=(await fetch(worker+'/reports',{headers:{Authorization:'Bearer testtoken'}}).then(r=>r.json())).reports.filter(r=>[sent[0].id,sent[2].id].includes(r.id));assert.equal(reports.length,2);assert(reports.every(r=>r.playerName==='Lin'));assert.deepEqual(errors,[]);
 fs.writeFileSync(`${out}/reports.json`,JSON.stringify(reports),{mode:0o600});await page.screenshot({path:`${out}/saved.png`});fs.writeFileSync(`${out}/result.json`,JSON.stringify({sent,stored:reports.map(r=>({id:r.id,playerName:r.playerName})),errors},null,2),{mode:0o600});console.log('PASS production report dialog, two named reports, stable name/UUID after lost reply, real local storage and no page errors');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
