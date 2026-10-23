// Production painters, with test-only exports appended by the HTTP interceptor.
// BASE OUT BASELINE_DIR (git-show copies of the pre-change modules).
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const [base='http://localhost:8249',out='/tmp/canvasprofile',baseline]=process.argv.slice(2);
(async()=>{
 assert(baseline, 'Usage: canvasprofiletest.cjs BASE OUT BASELINE_DIR (saved pre-change modules)');
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// component'}));
 await page.route(/\/src\/(ao|furniture|frozenmealmodels)\.js(?:\?before)?$/,async r=>{
  const u=new URL(r.request().url()),name=path.basename(u.pathname);
  const text=u.search&&baseline?fs.readFileSync(path.join(baseline,name),'utf8'):await(await r.fetch()).text();
  const exp={'ao.js':'aoTexture','furniture.js':'paintedPicture','frozenmealmodels.js':'canvasMat, PRINT'}[name];
  await r.fulfill({contentType:'text/javascript',body:text+`\nexport { ${exp} };`});
 });
 await page.goto(base+'/');
 const result=await page.evaluate(async()=>{
  const R=await import('/src/resourceprofile.js'),{FURNITURE,SNAKE}=await import('/src/config.js');
  const A=await import('/src/ao.js'),F=await import('/src/furniture.js'),M=await import('/src/frozenmealmodels.js');
  const B=await import('/src/ao.js?before'),BF=await import('/src/furniture.js?before'),BM=await import('/src/frozenmealmodels.js?before');
  const {drawComputerMenu,drawSnake}=await import('/src/snakeview.js');
  document.head.querySelectorAll('style,link[rel=stylesheet]').forEach(e=>e.remove());
  document.body.replaceChildren();document.body.style.cssText='margin:16px;background:#eee;color:#111;font:18px sans-serif';
  const THREE=await import('three'),fingerprints=[];
  const fingerprint=root=>{root.updateMatrixWorld(true);const meshes=[];root.traverse(m=>{if(m.isMesh)meshes.push({position:Array.from(m.geometry.attributes.position.array),index:m.geometry.index?Array.from(m.geometry.index.array):null,matrix:m.matrixWorld.toArray(),visible:m.visible,material:(Array.isArray(m.material)?m.material:[m.material]).map(x=>({type:x.type,side:x.side,transparent:x.transparent,depthWrite:x.depthWrite}))});});const ray=new THREE.Raycaster(new THREE.Vector3(0,1,0),new THREE.Vector3(0,-1,0));return {meshes,hits:ray.intersectObject(root,true).map(h=>h.distance)};};
  const sameGeometry=(name,a,b)=>fingerprints.push({name,equal:JSON.stringify(fingerprint(a))===JSON.stringify(fingerprint(b))});
  const rows=[]; const seed=()=>{let s=123;Math.random=()=>((s=s*16807%2147483647)/2147483647);};
  const ao=fn=>fn({x:9,z:20},[{x0:0,x1:.2,z0:0,z1:20},{x0:4,x1:5,z0:3,z1:4}],.4,.2,{x0:3,x1:4,z0:5,z1:7}).image;
  const paint=fn=>{seed();return fn(FURNITURE.find(p=>p.paint==='dancing').print).image;};
  const meal=mod=>mod.canvasMat(512,563,mod.PRINT.billys).map.image;
  const compare=(name,a,b,exact=false)=>{const c=document.createElement('canvas');c.width=b.width;c.height=b.height;c.getContext('2d').drawImage(a,0,0,c.width,c.height);const x=c.getContext('2d').getImageData(0,0,c.width,c.height).data,y=b.getContext('2d').getImageData(0,0,b.width,b.height).data;let sum=0,max=0,changed=0;for(let i=0;i<x.length;i++){const d=Math.abs(x[i]-y[i]);sum+=d;max=Math.max(max,d);changed+=d>0;}if(!exact){const title=document.createElement('p');title.textContent=name+' — before / light';document.body.append(title,c,b);c.style.maxWidth=b.style.maxWidth='40vw';c.style.height=b.style.height='220px';c.style.objectFit=b.style.objectFit='contain';}
rows.push({name,before:[a.width,a.height],after:[b.width,b.height],mae:sum/x.length,max,changed,exact});};
  history.replaceState(null,'','?lowmem&res=full');R.decideResourceProfile(512);
  // Desktop/full must preserve the original backing sizes and every pixel.
  compare('full AO',ao(B.aoTexture),ao(A.aoTexture),true);
  compare('full painted',paint(BF.paintedPicture),paint(F.paintedPicture),true);
  compare('full meal',meal(BM),meal(M),true);
  const fullSizes=[[720,920],[512,563],[512,192],[256,320],[1024,600]].map(([w,h])=>R.profileCanvasSize(w,h));
  history.replaceState(null,'','?lowmem&res=light');R.decideResourceProfile(512);
  compare('light AO',ao(B.aoTexture),ao(A.aoTexture));compare('light painted',paint(BF.paintedPicture),paint(F.paintedPicture));compare('light meal',meal(BM),meal(M));
  for(const draw of [drawComputerMenu,drawSnake]){const c=document.createElement('canvas');c.width=SNAKE.screenWidth;c.height=288;draw(c,draw===drawComputerMenu?{color:'#def',name:'Dator'}:null);const d=R.profileCanvasSize(c.width,c.height),n=document.createElement('canvas');n.width=d.width;n.height=d.height;draw(n,draw===drawComputerMenu?{color:'#def',name:'Dator'}:null);compare(draw.name,c,n,true);}
  for(const key of ['billysBox','gorbysBox']){const before=BM.FROZEN_MEAL_BUILDERS[key]({}),after=M.FROZEN_MEAL_BUILDERS[key]({});for(const pkg of ['closed','open']){before.show({pkg,amount:2});after.show({pkg,amount:2});sameGeometry(key+' '+pkg,before.object,after.object);}}
  sameGeometry('AO',B.buildAO({x:9,z:20},0,3,[],[]),A.buildAO({x:9,z:20},0,3,[],[]));
  return {rows,fullSizes,fingerprints,lightSizes:[[720,920],[512,563],[512,192],[256,320],[1024,600]].map(([w,h])=>R.profileCanvasSize(w,h))};
 });
 await page.screenshot({path:path.join(out,'canvas-families.png'),fullPage:true});
 fs.writeFileSync(path.join(out,'component.json'),JSON.stringify({result,errors},null,2));
 for(const row of result.rows){assert(row.exact?row.changed===0:row.mae<2,JSON.stringify(row));assert(row.exact||Math.max(...row.after)<=512);console.log('PASS',JSON.stringify(row));}
 assert.deepEqual(result.fullSizes.map(x=>[x.width,x.height]),[[720,920],[512,563],[512,192],[256,320],[1024,600]]);assert.deepEqual(result.lightSizes.map(x=>[x.width,x.height]),[[400,512],[465,512],[512,192],[256,320],[512,300]]);assert.equal(errors.length,0,errors.join('\n'));
 assert(result.fingerprints.every(x=>x.equal),JSON.stringify(result.fingerprints));
 console.log('PASS dimensions, full unchanged, dynamic menu and snake repaint');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
