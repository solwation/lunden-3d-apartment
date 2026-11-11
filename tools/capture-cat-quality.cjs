const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');
const url=process.argv[2]||'http://127.0.0.1:8191/tools/riggedcatproduction.html';
const out=process.argv[3]||'docs/verification/1910';
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const errors=[];
try{const page=await browser.newPage({viewport:{width:1800,height:1020}});page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});await page.goto(url,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__ready,null,{timeout:30000});
const result={environment:'actual CatSpawner/createCatPuppet, OutdoorCats and BestiaryImages with controlled terrain; no full World',views:[],errors};
for(const view of ['front','side','quarter']){await page.evaluate(v=>catView(v),view);await page.screenshot({path:`${out}/cats-${view}.png`,fullPage:true});result.views.push({view,models:await page.evaluate(()=>catMetrics)});}
await page.evaluate(()=>catConsumers());await page.screenshot({path:`${out}/cat-spawner.png`,fullPage:true});result.consumers=await page.evaluate(()=>({poses:catConsumerMetrics,outdoor:catOutdoor}));
if(!result.consumers.outdoor.all)throw Error('actual OutdoorCats LOD/paw setup failed');
await page.evaluate(()=>catBinder());await page.screenshot({path:`${out}/cat-binder.png`,fullPage:true});result.binder={renders:await page.evaluate(()=>catBinderRenders)};
const fallback=await browser.newPage();await fallback.route('**/models/cat-rigged.glb',r=>r.fulfill({status:404,body:'missing model fixture'}));
await fallback.route('**/tools/__cat-fallback',r=>r.fulfill({contentType:'text/html',body:'<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>'}));
await fallback.goto(new URL('/tools/__cat-fallback',url).href);
result.fallback=await fallback.evaluate(async()=>{const C=await import('/src/cat.js'),model=await C.loadRiggedCatModel(),cat=C.createCatPuppet(C.BREEDS[0],C.VARIANTS[0]);return{missingReturnsNull:model===null,headRetained:cat.head.parent===cat.object,originalBodyVisible:cat.parts.torso.visible,loaded:!!cat.modelLoaded};});
if(!result.fallback.missingReturnsNull||!result.fallback.headRetained||!result.fallback.originalBodyVisible||result.fallback.loaded)throw Error('missing GLB did not preserve original cat');
if(result.binder.renders!==10||errors.length)throw Error(JSON.stringify(result));fs.writeFileSync(`${out}/browser.json`,JSON.stringify(result,null,2)+'\n');console.log('PASS whole5breeds×2poses×3views,10actualCatSpawner poses,actualOutdoorCats paw/LODsetup,10actualBestiaryImages96/320; zero pageerrors. Visual review required.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
