// Actual production loader exports, served from the stamped package. No full World.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.argv[2]);
const output = process.argv[3];
const three = process.env.THREE_MODULE_ROOT || path.resolve('node_modules/three');
const build = JSON.parse(fs.readFileSync(path.join(root, 'version.json'))).version;
const loaders = [
  ['cat', 'loadRiggedCatModel', 'cat-rigged.glb'], ['ducks', 'loadRiggedDuckModel', 'duck-rigged.glb'],
  ['squirrels', 'loadRiggedSquirrelModel', 'squirrel-rigged.glb'], ['paddock', 'loadRiggedPonyModel', 'pony-rigged.glb'],
  ['avatar', 'loadRiggedAvatarModel', 'avatar-rigged.glb'], ['carmodel', 'loadMeganeModel', 'car-megane.glb'],
  ['carmodel', 'loadParkedCarModel', 'car-parked.glb'], ['streetlife', 'loadBicycleModel', 'bicycle.glb'],
  ['riverfish', 'loadFishModel', 'fish-generic.glb'], ['shark', 'loadSharkModel', 'shark.glb'],
  ['santa', 'loadSantaModel', 'santa.glb'], ['pingping', 'loadPingpingModel', 'pingping.glb'],
];
const server = http.createServer((req,res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if(pathname === '/__model-package-probe') {
    res.setHeader('content-type','text/html');
    return res.end('<script type="importmap">{"imports":{"three":"/__three/build/three.module.js","three/addons/":"/__three/examples/jsm/"}}</script>');
  }
  const file = pathname.startsWith('/__three/') ? path.join(three,pathname.slice(9)) : path.join(root, pathname);
  fs.readFile(file,(err,data) => {
    if(err) {res.writeHead(404);return res.end('missing');}
    res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.glb')?'model/gltf-binary':'application/json');
    res.end(data);
  });
});
(async()=>{
  await new Promise(r=>server.listen(8191,'127.0.0.1',r));
  let browser;
  try {
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
    const page=await browser.newPage(); const errors=[], requests=[];
    page.on('pageerror',e=>errors.push(e.stack));
    page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('.glb'))requests.push(r.url());});
    await page.goto('http://127.0.0.1:8191/__model-package-probe');
    const results=await page.evaluate(async({loaders,build})=>{
      const results=[];
      for(const [module,name,file] of loaders){
        const api=await import(`/src/${module}.js?v=${build}`), gltf=await api[name]();
        if(!gltf?.scene)throw Error(`${name} did not load a GLTF scene`);
        let meshes=0;gltf.scene.traverse(o=>{if(o.isMesh)meshes++;});
        if(!meshes)throw Error(`${file} has no mesh`);
        results.push({file,loader:name,meshes});
      }
      return results;
    },{loaders,build});
    for(const result of results){
      const url=requests.find(u=>new URL(u).pathname===`/models/${result.file}`);
      assert.ok(url,`no actual model request ${result.file}`);
      assert.equal(new URL(url).searchParams.get('v'),build,url);
      const response=await page.request.get(url);
      assert.equal(response.status(),200,url);
      const body=await response.body(), expected=fs.readFileSync(path.join(root,'models',result.file));
      assert.deepEqual(body,expected,result.file);
      result.url=url;result.bytes=body.length;result.sha256=crypto.createHash('sha256').update(body).digest('hex');
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(output,JSON.stringify({build,scope:'Actual stamped loader exports and exact HTTP bytes; no full World, no form re-review',results,errors},null,2)+'\n');
    console.log(`PASS: ${results.length}/12 actual production loaders parsed scenes; versioned HTTP200 resources match all packaged SHA-256 bytes; zero page errors.`);
  } finally {if(browser)await browser.close(); await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
