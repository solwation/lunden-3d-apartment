(async()=>{
 // Compose the exact final main callback into this already-built app; no model or terrain edits.
 const ground=(x,z)=>z>catRange.cfg.OUTDOOR.z1?catRange.S.renderedTerrainY(x,z):Math.max(catRange.S.groundY(x,z),catRange.S.renderedTerrainY(x,z));
 catRange.O.ground=catRange.O.env.ground=ground;
 catRange.O.walkable=(x,z)=>ground(x,z)>catRange.river.waterYAt(x,z)+.3&&!catRange.roads.onRoad(x,z,.8);
 const R=catRange,{A,O,T,cfg,routes,S}=R,checks=[];const check=(ok,label,data)=>{checks.push({ok:!!ok,label,data});if(!ok)throw Error(label+': '+JSON.stringify(data));};
 const samples=[];let bad=[],maxContact=0;
 for(const c of O.cats){const pts=routes.routeSamples(c.spec.route,.25);for(const[x,z]of pts){const y=O.ground(x,z),contact=z>64?Math.abs(y-S.renderedTerrainY(x,z)):0;maxContact=Math.max(maxContact,contact);if(!R.walk(x,z))bad.push([c.name,x,z,'blocked']);samples.push({id:c.id,x,z,y,contact});}for(let i=0;i<c.spec.route.length;i++)if(!R.clear(c.spec.route[i],c.spec.route[(i+1)%c.spec.route.length]))bad.push([c.name,i,'segment']);}
 check(bad.length===0,'every actual route segment is clear of sampled walls/solid buildings/roads/water and drops',{samples:samples.length,bad});
 check(maxContact<.15,'park route positions match actual rendered terrain within15cm',{maxContact});
 check(O.drawDist===32&&cfg.OUTDOOR_CATS.drawDistPhone===18&&cfg.OUTDOOR_CATS.near===7,'unchanged desktop/phone/puppet distance gates');
 R.run=(secs,dt=.05)=>{for(let i=0;i<Math.ceil(secs/dt);i++){R.clock+=dt;A.step(dt);}};
 R.busy=()=>{const k=A.cat,b=A.BREEDS[0];k.hide();k.setCat(b,b.coats[0],false);k.object.visible=true;k.leaving=null;k.fish=null;k.ignored=-1e9;k.awayFor=0;k.object.position.set(2,11.8,-40);k.photoDone=true;};R.busy();
 const c=O.cats[2],base=3*86400;let t1=base,t2=base,dist=0;
 for(let t=base;t<base+c.plan.period;t+=2){const s=routes.catAt(c.plan,t,c.id);if(!s.walking){t1=t;break;}}
 const s1=routes.catAt(c.plan,t1,c.id);for(let t=base;t<base+c.plan.period;t+=2){const s=routes.catAt(c.plan,t,c.id),d=Math.hypot(s.x-s1.x,s.z-s1.z);if(!s.walking&&d>dist){t2=t;dist=d;}}
 R.times=[cfg.OUTDOOR_CATS.epoch-c.spec.phase+t1,cfg.OUTDOOR_CATS.epoch-c.spec.phase+t2];check(dist>60,'two wall-clock rest positions exceed60m separation',{times:R.times,dist,positions:[s1,routes.catAt(c.plan,t2,c.id)]});
 R.camera=(cat,time)=>{
  R.setClock(time);R.busy();const c=O.cats[cat],ground=O.ground(c.x,c.z),meshes=[];A.scene.updateMatrixWorld(true);
  A.scene.traverse(m=>{if(!m.isMesh)return;for(let a=m;a;a=a.parent)if(!a.visible||a===c.group||a===A.camera)return;meshes.push(m);});
  const ray=new T.Raycaster(),dir=new T.Vector3(),feet=S.treeFeet.concat(S.southTreeFeet??[]);let camera=null;
  for(const r of[2.6,3.2,4])for(const off of[.65,-.65,1.1,-1.1,1.6,-1.6,2.2,-2.2]){
   const a=c.yaw+off,x=c.x+Math.sin(a)*r,z=c.z+Math.cos(a)*r;if(!R.walk(x,z)||feet.some(t=>Math.hypot(t.x-x,t.z-z)<.9))continue;
   const q=new T.Vector3(x,O.ground(x,z)+.9,z),target=new T.Vector3(c.x,ground+.28,c.z),distance=q.distanceTo(target);dir.copy(target).sub(q).normalize();ray.set(q,dir);ray.near=.02;ray.far=distance-.12;if(ray.intersectObjects(meshes,false).length)continue;camera=q;break;
  }
  if(!camera)throw Error('no clear cat camera');A.player.spawn(camera.x,camera.z,0);A.step(0);c.st='route';O.place(c,c.scheduled(time));c.alpha=1;O.update(.05,false);A.camera.position.copy(camera);A.camera.fov=52;A.camera.up.set(0,1,0);A.camera.updateProjectionMatrix();A.camera.lookAt(c.x,ground+.28,c.z);A.camera.updateMatrixWorld();
  document.getElementById('route-illustration')?.remove();let label=document.getElementById('route-fixture');if(!label){label=document.createElement('div');label.id='route-fixture';label.style.cssText='position:fixed;bottom:8px;left:50%;transform:translateX(-50%);z-index:9999;padding:7px 12px;background:#102430df;color:white;font:16px system-ui';document.body.append(label);}label.textContent='Findus · kattens väggklocka '+new Date(time*1000).toISOString().replace('T',' ').slice(0,19)+' UTC · dagsljus hålls fast';
  return{clock:time,scheduled:c.scheduled(time),actual:[c.x,c.z],camera:camera.toArray(),st:c.st};
 };
 R.overview=()=>{
  document.getElementById('route-fixture')?.remove();A.player.spawn(-15,22,0);A.step(0);A.camera.position.set(-58,215,90);A.camera.up.set(0,0,-1);A.camera.fov=52;A.camera.updateProjectionMatrix();A.camera.lookAt(-58,0,90);A.camera.updateMatrixWorld(true);
  const colors=['#ffda3b','#ff7e3b','#35d9ff','#ff65d1'],paths=O.cats.map((c,i)=>{const d=c.spec.route.concat([c.spec.route[0]]).map(([x,z],j)=>{const p=new T.Vector3(x,O.ground(x,z)+.1,z).project(A.camera);return(j?'L':'M')+((p.x+1)*640).toFixed(1)+','+((1-p.y)*400).toFixed(1);}).join(' ');return`<path d="${d}" fill="none" stroke="#101820" stroke-width="6"/><path d="${d}" fill="none" stroke="${colors[i]}" stroke-width="3"/>`;}).join('');
  const overlay=document.createElement('div');overlay.id='route-illustration';overlay.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:9990';overlay.innerHTML=`<svg width="100%" height="100%" viewBox="0 0 1280 800">${paths}</svg><div style="position:absolute;bottom:8px;left:20px;background:#102430ee;color:white;padding:10px;font:16px system-ui">Testillustration: verkliga ruttpunkter projicerade över scenen · ${O.cats.map((c,i)=>`<span style="color:${colors[i]}">${c.name}</span>`).join(' / ')}<br>Looparna går på gångbar mark; linjerna visas även framför träd för läsbarhet.</div>`;document.body.append(overlay);return{camera:A.camera.position.toArray(),routes:O.cats.map(c=>({name:c.name,route:c.spec.route,minutes:c.plan.period/60}))};
 };
 R.checks=checks;R.samples=samples;return{checks,samples,times:R.times};
})()
