// Native Three phase profile: production furniture component + controlled sphere; no renderer/full app.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… SHOTS=/tmp/profile node tools/trigridprofile.cjs http://localhost:8873
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {execFileSync}=require('node:child_process');const fs=require('node:fs'),path=require('node:path');
const source=execFileSync('git',['show','a336e30:src/trigrid.js'],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
const profile=source.replace('constructor(mesh) {','constructor(mesh) { const phaseStart=performance.now();').replace('this.cells = new Map();','const copiedAt=performance.now(); this.cells = new Map();').replace('this.q = 0;','this.q = 0; this.__phases={copyMs:copiedAt-phaseStart,binMs:performance.now()-copiedAt,totalMs:performance.now()-phaseStart};');
const output=process.env.SHOTS||'/tmp/lunden-trigrid-profile';fs.mkdirSync(output,{recursive:true});
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});try{
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/src/trigrid.js?profile=a336e30',route=>route.fulfill({contentType:'application/javascript',body:profile}));
await page.goto((process.argv[2]||'http://localhost:8873')+'/tools/trigridprofile.html');await page.waitForFunction(()=>window.result,null,{timeout:90000});
const result=await page.evaluate(()=>window.result);result.errors=errors;fs.writeFileSync(path.join(output,'profile.json'),JSON.stringify(result,null,2));await page.screenshot({path:path.join(output,'profile.png'),fullPage:true});console.log(result.checks.join('\n'));console.log(JSON.stringify(result.samples));process.exitCode=result.pass&&!errors.length?0:1;
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
