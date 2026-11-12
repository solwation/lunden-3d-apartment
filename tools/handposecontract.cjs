// Compare actual Hand provider states against the source baseline, independently of changed vertices.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [base='http://localhost:8200',out='docs/verification/1917/pose-contract']=process.argv.slice(2);
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const result={scope:'Actual Hand, controlled provider inputs. No Player collision/world stub or physics claim.',before:[],after:[],errors:[]};
 try{
  for(const phase of ['before','after']){
   const page=await browser.newPage();page.on('pageerror',e=>result.errors.push(e.message));
   await page.goto(base+'/tools/hand-realism.html'+(phase==='before'?'?before':''),{waitUntil:'networkidle'});
   if(result.errors.length)throw Error(result.errors.join('\n'));
   await page.waitForFunction(()=>window.__ready,null,{timeout:10000});
   for(const mode of ['wall','swing','held-priority']){
    const record=await page.evaluate(async mode=>{
     const T=await import('three'),a=handAudit,h=a.hand;a.pose('web');h.webT=0;
     h.suit.on=true;h.suit.climb=mode==='wall';h.suit.up=.7;h.suit.side=.2;h.suit.swing=mode==='wall'?null:new T.Vector3(.5,3,-4);
     let item=null;
     if(mode==='held-priority'){const model=new T.Object3D();h.camera.add(model);model.position.set(.1,-.15,-.4);item={held:true,model,grip:[0,0,0]};}
     for(let i=0;i<40;i++)h.update(.016,item);
     a.scene.updateMatrixWorld(true);
     const side=s=>({position:s.hand.position.toArray(),rotation:s.hand.quaternion.toArray(),morphs:s.hand.morphTargetInfluences.slice(),visible:s.hand.visible,cuff:s.cuff.visible,armLength:s.arm.scale.z});
     return{mode,right:side(h.right),left:side(h.left),heldParentPreserved:!item||item.model.parent===h.camera};
    },mode);
    if(!record.right.visible||!record.heldParentPreserved||((mode==='wall'||mode==='swing')&&!record.left.visible)||((mode==='held-priority')&&record.left.visible))throw Error('Provider visibility/held priority failed: '+mode);
    result[phase].push(record);
   }
   await page.close();
  }
  if(JSON.stringify(result.before)!==JSON.stringify(result.after))throw Error('Actual pose/provider state changed relative to baseline');
  if(result.errors.length)throw Error(result.errors.join('\n'));
  result.status='passed';console.log('PASS: actual wall/swing/both hands/held priority and complete transforms/morph channels match baseline.');
 }catch(e){result.status='failed';result.error=e.message;throw e;}
 finally{fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
