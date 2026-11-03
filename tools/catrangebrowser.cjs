// #1840 bounded actual-world planning/verification fixture. Planning is development-only; emitted routes go in config.
// GAME OUT CONTROL. Waits for CONTROL.accept after proposed.json is reviewed/copied to config; CONTROL.release ends image inspection.
const fs=require('node:fs'),kit=require('./testkit.cjs');
const [base='http://localhost:8910',out='docs/verification/1840',control='/tmp/catrange1840']=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
const savedBaseline=fs.existsSync(out+'/baseline.json')?JSON.parse(fs.readFileSync(out+'/baseline.json','utf8')):null;
const result={checks:[],errors:[]};const save=()=>fs.writeFileSync(out+'/browser.json',JSON.stringify(result,null,2));const check=(ok,label,data)=>{result.checks.push({ok:!!ok,label,data});save();console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)throw Error(label)};
(async()=>{const browser=await kit.launch();try{
 const p=await browser.newPage({viewport:kit.SMALL});p.on('pageerror',e=>{result.errors.push(e.message);save()});await p.goto(base+'/?test=lazy&shot&cloud=&time=12&month=7&weather=clear&freeze',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.__app?.outdoorCats,null,{timeout:180000});await kit.skipNameDialog(p);await p.evaluate(()=>__app.showOverlay(true));if(await p.locator('#start-go').isVisible())await p.locator('#start-go').click();else await p.locator('#start-touch').click();
 const proposed=await p.evaluate(async(savedBaseline)=>{
  const A=__app,O=A.outdoorCats,T=await import('three'),cfg=await import('/src/config.js'),routes=await import('/src/outdoorcatroute.js'),{OutdoorCatBrain}=await import('/src/outdoorcatbrain.js'),roads=await import('/src/roads.js'),river=await import('/src/riverbridge.js'),far=await import('/src/farwalk.js'),S=await import('/src/surroundings.js');A.renderer.setAnimationLoop(null);A.player.spawn(-10,22,0);A.step(0);
  const poly=(q,x,z)=>{let yes=false;for(let i=0,j=q.length-1;i<q.length;j=i++)if((q[i][1]>z)!==(q[j][1]>z)&&x<(q[j][0]-q[i][0])*(z-q[i][1])/(q[j][1]-q[i][1])+q[i][0])yes=!yes;return yes;};
  const buildings=[...cfg.SITE.blocks.map(b=>[[b.x0,b.z0],[b.x1,b.z0],[b.x1,b.z1],[b.x0,b.z1]]),...[cfg.SITE.west,cfg.SITE.east,cfg.SITE.north,cfg.SITE.south].flatMap(g=>g.buildings.map(b=>b.polygon))];
  const walls=[...A.world.levels[0].segments,...A.world.doors.filter(d=>d.object.position.y<1.6).map(d=>d.segment()),...(A.world.movingSegments?.(0)??[]),...far.farSegments()];
  const solids=[...A.player.obstacles(0),...buildings];
  const distance=(x,z,s)=>{const dx=s[2]-s[0],dz=s[3]-s[1],t=Math.max(0,Math.min(1,((x-s[0])*dx+(z-s[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-s[0]-t*dx,z-s[1]-t*dz);};
  const walk=(x,z)=>Number.isFinite(O.ground(x,z))&&O.ground(x,z)>river.waterYAt(x,z)+.3&&!roads.onRoad(x,z,.8)&&!solids.some(q=>poly(q,x,z))&&!walls.some(s=>distance(x,z,s)<.2)&&A.player.isFree(x,z,0,.12-cfg.PLAYER.radius);
  const clear=(a,b)=>{const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.25));let prev=O.ground(...a);for(let i=0;i<=n;i++){const x=a[0]+(b[0]-a[0])*i/n,z=a[1]+(b[1]-a[1])*i/n,y=O.ground(x,z);if(!walk(x,z)||Math.abs(y-prev)>.31)return false;prev=y;}return true;};
  const cache=new Map(),valid=(x,z)=>{const k=x+','+z;if(!cache.has(k))cache.set(k,walk(x,z));return cache.get(k);};
  const nearest=p=>{for(let d=0;d<=5;d++)for(let x=Math.round(p[0])-d;x<=Math.round(p[0])+d;x++)for(let z=Math.round(p[1])-d;z<=Math.round(p[1])+d;z++)if(valid(x,z))return[x,z];throw Error('no walkable anchor '+p);};
  // A* belongs only to this development harness; the app ships explicit points and a time lookup.
  const path=(start,end)=>{
   if(clear(start,end))return[start,end];
   const key=p=>p.join(','),goal=key(end),open=[{p:start,f:0}],cost=new Map([[key(start),0]]),back=new Map();
   const push=v=>{let i=open.length;open.push(v);while(i>0){const j=(i-1)>>1;if(open[j].f<=v.f)break;open[i]=open[j];i=j;}open[i]=v;};
   const pop=()=>{const top=open[0],v=open.pop();if(open.length){let i=0;while(i*2+1<open.length){let j=i*2+1;if(j+1<open.length&&open[j+1].f<open[j].f)j++;if(open[j].f>=v.f)break;open[i]=open[j];i=j;}open[i]=v;}return top;};
   let visited=0;while(open.length&&visited++<40000){const q=pop().p,k=key(q);if(k===goal){const out=[q];let at=k;while(back.has(at)){const prev=back.get(at);out.push(prev);at=key(prev);}return out.reverse();}
    for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const n=[q[0]+dx,q[1]+dz];if(n[0]<-145||n[0]>18||n[1]<16||n[1]>166||!valid(...n)||!clear(q,n))continue;const nk=key(n),g=cost.get(k)+Math.hypot(dx,dz);if(g<(cost.get(nk)??Infinity)){cost.set(nk,g);back.set(nk,q);push({p:n,f:g+Math.hypot(n[0]-end[0],n[1]-end[1])});}}
   }throw Error('no safe development route '+start+' to '+end);
  };
  const simplify=points=>{const out=[points[0]];let i=0;while(i<points.length-1){let j=points.length-1;while(j>i+1&&!clear(points[i],points[j]))j--;out.push(points[j]);i=j;}return out;};
  const anchors=[
   [[-16,18],[5,18],[14,22],[5,27],[-16,27],[-36,27],[-46,23],[-36,18]],
   [[-40,21],[-28,20],[-17,23],[-19,30],[-34,31],[-48,28],[-48,24]],
   [[-80,95],[-45,95],[-28,110],[-39,143],[-75,163],[-115,151],[-138,125],[-124,99]],
   [[-70,96],[-49,96],[-38,110],[-53,133],[-82,136],[-101,121],[-98,104],[-87,96]]];
  const data=O.cats.map((c,index)=>{const stops=anchors[index].map(nearest),route=[stops[0]],rest=[];for(let i=0;i<stops.length;i++){const leg=simplify(path(stops[i],stops[(i+1)%stops.length]));for(let j=1;j<leg.length;j++){rest.push(j===leg.length-1?(savedBaseline?.[index].rest??c.spec.rest)[i%(savedBaseline?.[index].rest??c.spec.rest).length]:0);if(i<stops.length-1||j<leg.length-1)route.push(leg[j]);}}return{name:c.name,route,rest,vary:true};});
  const site={bounds:[-145,18,16,166],step:1,walls:walls.filter(s=>Math.max(s[0],s[2])>=-146&&Math.min(s[0],s[2])<=19&&Math.max(s[1],s[3])>=15&&Math.min(s[1],s[3])<=167),solids:solids.filter(q=>q.some(([x,z])=>x>=-146&&x<=19&&z>=15&&z<=167)),heights:[]};for(let z=16;z<=166;z++)for(let x=-145;x<=18;x++)site.heights.push(+O.ground(x,z).toFixed(6));
  window.catRange={A,O,T,cfg,routes,OutdoorCatBrain,S,roads,river,walk,clear,site,data,clock:cfg.OUTDOOR_CATS.epoch+3*86400,
   setClock(t){this.clock=t;O.now=()=>this.clock;O.cats.forEach(c=>{c.resume();c.alpha=1;});},
   apply(data){data.forEach((d,i)=>Object.assign(cfg.OUTDOOR_CATS.cats[i],d));O.env.trees=O.climbable(S.treeFeet,S.aoTrees);O.cats.forEach((c,i)=>{Object.assign(c,new OutdoorCatBrain(cfg.OUTDOOR_CATS.cats[i],i,O.env));});O.now=()=>this.clock;this.data=data;},
   frame(dt=.05){A.step(dt);},
   look(x,y,z){A.camera.lookAt(x,y,z);A.camera.updateMatrixWorld();}};
  return{data,site,baseline:savedBaseline??O.cats.map(c=>({name:c.name,route:c.spec.route,rest:c.spec.rest}))};
 },savedBaseline);fs.writeFileSync(out+'/proposed.json',JSON.stringify(proposed.data,null,2));fs.writeFileSync(out+'/site.json',JSON.stringify(proposed.site));fs.writeFileSync(out+'/baseline.json',JSON.stringify(proposed.baseline,null,2));console.log('PLANNED',proposed.data.map(d=>[d.name,d.route.length]));fs.writeFileSync(control+'.planned','ready');
 // Control requests are local test expressions only, never shipped to the application.
 let previous='',accepted=false;const started=Date.now();while(!fs.existsSync(control+'.release')&&Date.now()-started<600000){
  if(fs.existsSync(control+'.accept')&&!accepted){accepted=true;await p.evaluate(data=>catRange.apply(data),JSON.parse(fs.readFileSync(out+'/proposed.json','utf8')));console.log('APPLIED exact proposed routes');}
  if(fs.existsSync(control+'.command')){const code=fs.readFileSync(control+'.command','utf8');if(code!==previous){previous=code;try{const r=await p.evaluate(code);fs.writeFileSync(out+'/command-result.json',JSON.stringify(r,null,2));console.log('COMMAND COMPLETE');}catch(e){fs.writeFileSync(out+'/command-error.txt',e.stack);console.error(e.message);}}}
  if(fs.existsSync(control+'.shot')){const name=fs.readFileSync(control+'.shot','utf8').trim();fs.unlinkSync(control+'.shot');await kit.shot(p,out+'/'+name+'.png',{frames:1});console.log('SHOT',name);}
  await new Promise(r=>setTimeout(r,200));
 }
 result.ok=result.errors.length===0;save();
}finally{await browser.close();}})().catch(e=>{result.error=e.stack;save();console.error(e);process.exitCode=1;});
