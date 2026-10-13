// #715 diagnostics only: instrumented stage accounting is separate from uninstrumented cold/warm timings.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),output=process.env.SHOTS||'/tmp/lunden-marks-cold';fs.mkdirSync(output,{recursive:true});
const rawMarks=fs.readFileSync(path.join(root,'src/marks.js'),'utf8'),rawGrid=fs.readFileSync(path.join(root,'src/trigrid.js'),'utf8');
function replaceOnce(s,anchor,change){if(s.split(anchor).length!==2)throw Error('ambiguous diagnostic anchor: '+anchor);return s.replace(anchor,change);}
let grid=replaceOnce(rawGrid,'constructor(mesh) {','constructor(mesh) { const phaseStart=performance.now();');
grid=replaceOnce(grid,'this.cells = new Map();','const copiedAt=performance.now(); this.cells = new Map();');
grid=replaceOnce(grid,'this.q = 0;','this.q = 0; this.__phases={copyMs:copiedAt-phaseStart,binMs:performance.now()-copiedAt};');
let marks=replaceOnce(rawMarks,"from './trigrid.js'","from './trigrid.js?markscoldprofile'");
marks=replaceOnce(marks,'segment(from, to, meshes) {',`segment(from, to, meshes) {
 const diagStart=performance.now(), diag={boundsMs:0,gridMs:0,copyMs:0,binMs:0,hitsMs:0,nativeMs:0,smallBoxMs:0,sortMs:0,bounds:0,grids:0,gridTriangles:0,meshes:meshes.length,rejected:0};globalThis.__marksPhases=diag;`);
marks=replaceOnce(marks,'if (!bounds) {','if (!bounds) { const boundsStart=performance.now();');
marks=replaceOnce(marks,'gridBoxes.set(o, bounds);','gridBoxes.set(o, bounds);diag.boundsMs+=performance.now()-boundsStart;diag.bounds++;');
marks=replaceOnce(marks,'if (!bounds.intersectsBox(segBox)) continue;','if (!bounds.intersectsBox(segBox)) {diag.rejected++;continue;}');
marks=replaceOnce(marks,'if (!g) grids.set(o, (g = new TriGrid(o)));',`if (!g) {const gridStart=performance.now();grids.set(o, (g = new TriGrid(o)));diag.gridMs+=performance.now()-gridStart;diag.copyMs+=g.__phases.copyMs;diag.binMs+=g.__phases.binMs;diag.grids++;diag.gridTriangles+=g.tri.length/9;}`);
marks=replaceOnce(marks,'g.hits(this.ray.ray, far, segBox, o.material.side, out);','const hitsStart=performance.now();g.hits(this.ray.ray, far, segBox, o.material.side, out);diag.hitsMs+=performance.now()-hitsStart;');
marks=replaceOnce(marks,'if (!b) boxes.set(o, (b = new THREE.Box3().setFromObject(o)));','if (!b) {const smallStart=performance.now();boxes.set(o, (b = new THREE.Box3().setFromObject(o)));diag.smallBoxMs+=performance.now()-smallStart;}');
marks=replaceOnce(marks,'for (const h of this.ray.intersectObject(o, false)) {','const nativeStart=performance.now();for (const h of this.ray.intersectObject(o, false)) {');
marks=replaceOnce(marks,'materialIndex: h.face.materialIndex });\n      }','materialIndex: h.face.materialIndex });\n      }diag.nativeMs+=performance.now()-nativeStart;');
marks=replaceOnce(marks,'return out.sort((x, y) => x.distance - y.distance);',`const sortStart=performance.now();const sorted=out.sort((x, y) => x.distance - y.distance);diag.sortMs=performance.now()-sortStart;diag.totalMs=performance.now()-diagStart;
 diag.residualMs=diag.totalMs-diag.boundsMs-diag.gridMs-diag.hitsMs-diag.nativeMs-diag.smallBoxMs-diag.sortMs;return sorted;`);
const compareRef=process.env.COMPARE_REF||null;
const reference=compareRef?execFileSync('git',['show',`${compareRef}:src/marks.js`],{cwd:root,encoding:'utf8'}):null;
const hasBoundsHelper=rawMarks.includes('function positionBounds(attribute) {');
const hashes=Object.fromEntries(['src/marks.js','src/trigrid.js','src/furniture.js','src/config.js','src/toys.js','tools/markscoldprofile.html','tools/markscoldprofile.cjs'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]));
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--disable-gpu']});try{
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(opts=>window.profileOptions=opts,{compareRef,hasBoundsHelper});
 if(compareRef)await page.route('**/src/marks.js?boundsreference='+compareRef,r=>r.fulfill({contentType:'text/javascript',body:reference}));
 if(hasBoundsHelper)await page.route('**/src/marks.js?boundstest',r=>r.fulfill({contentType:'text/javascript',body:rawMarks+'\nexport {positionBounds};'}));
 await page.route('**/src/marks.js?markscoldprofile',r=>r.fulfill({contentType:'text/javascript',body:marks}));
 await page.route('**/src/trigrid.js?markscoldprofile',r=>r.fulfill({contentType:'text/javascript',body:grid}));
 await page.goto((process.argv[2]||'http://localhost:8874')+'/tools/markscoldprofile.html');
 await page.waitForFunction(()=>window.result,null,{timeout:90000});const result=await page.evaluate(()=>window.result);
 result.errors=errors;result.sourceBase=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();result.sourceHashes=hashes;result.compareRef=compareRef;result.referenceSha256=reference?crypto.createHash('sha256').update(reference).digest('hex'):null;result.actualVerdict=result.pass&&!errors.length?'PASS':'FAIL';
 fs.writeFileSync(path.join(output,'cold.json'),JSON.stringify(result,null,2));console.log(result.checks.join('\n'));console.log(result.pass?'ALL PASS':'SOME FAILED');
 process.exitCode=result.pass&&!errors.length?0:1;
 await page.screenshot({path:path.join(output,'cold.png'),fullPage:true});
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
