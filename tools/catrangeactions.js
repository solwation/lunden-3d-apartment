(async()=>{
 const R=catRange,{A,O,T,cfg}=R,checks=[];const check=(ok,label,data)=>{checks.push({ok:!!ok,label,data});if(!ok)throw Error(label+': '+JSON.stringify(data));};
 R.camera(2,R.times[1]);const c=O.cats[2],eye=A.camera.position.clone();
 const draw=()=>{A.renderer.info.reset();A.renderer.render(A.scene,A.camera);return{...A.renderer.info.render};};
 const delta=()=>{O.cats.forEach(q=>{if(q!==c)q.group.visible=false;});const shown=draw(),vis=c.group.visible;c.group.visible=false;const hidden=draw();c.group.visible=vis;return{calls:shown.calls-hidden.calls,triangles:shown.triangles-hidden.triangles};};
 A.testMode.setFull(true);const near=delta();A.camera.position.set(c.x+8,O.ground(c.x+8,c.z)+1.2,c.z);A.camera.lookAt(c.x,O.ground(c.x,c.z)+.25,c.z);O.update(0,false);const far=delta();A.camera.position.set(c.x+33,O.ground(c.x,c.z)+1.2,c.z);O.update(0,false);const none=delta();A.testMode.setFull(false);check(near.calls>0&&near.calls<=30&&far.calls===1&&none.calls===0,'unchanged full puppet / single merged mesh / no body beyond drawDist',{near,far,none});
 R.camera(2,R.times[1]);const location={x:c.x,z:c.z},oldBounds={x0:-85,x1:-52,z0:92,z1:115};check(c.x>oldBounds.x1+10,'interaction is at a genuinely expanded base position',{location,oldBounds});
 const foodSpot=(()=>{for(let i=0;i<16;i++){const a=i*Math.PI/8,q={x:c.x+Math.sin(a)*1.5,z:c.z+Math.cos(a)*1.5};if(c.clearOut(c.x,c.z,q.x,q.z))return q;}throw Error('no clear local fish spot');})();
 const before=A.stats.catFishFeeds??0,fish=A.fishing.addFish({species:'abborre',cm:24,raw:true},new T.Vector3(foodSpot.x,O.ground(foodSpot.x,foodSpot.z),foodSpot.z));fish.take();fish.placeAt(new T.Vector3(foodSpot.x,O.ground(foodSpot.x,foodSpot.z),foodSpot.z),.3);
 R.run(45,.05);const fed={before,after:A.stats.catFishFeeds??0,fishPresent:A.fishing.fish.includes(fish),owner:fish.outdoorCat,st:c.st,location};check(fed.after===before+1&&!fed.fishPresent,'real raw caught-fish instance is eaten and counted once from new base',fed);
 // Same promotion/interaction path as the existing outdoor-cat browser contract, at Sotis's enlarged western stop.
 A.cat.hide();A.cat.awayFor=0;A.cat.ignored=-1e9;A.cat.outdoorCat=null;O.bound=null;
 const s=O.cats[0];let when=cfg.OUTDOOR_CATS.epoch+3*86400;for(let dt=0;dt<s.plan.period;dt+=1){const q=s.scheduled(when+dt);if(!q.walking&&q.x<-40){when+=dt;break;}}
 R.setClock(when);const p={x:s.x+2.2,z:s.z+.6};A.player.spawn(p.x,p.z,0);A.step(0);R.look(s.x,O.ground(s.x,s.z)+.25,s.z);for(let i=0;i<200&&s.st!=='bound';i++)R.run(.05,.05);
 const k=A.cat,options=k.interact.options(),pet=options.find(o=>o.id==='pet'),beforePet=A.stats.petted??0;if(pet)pet.run();R.run(.3,.05);const met={st:s.st,name:k.catName,outdoorCat:k.outdoorCat,visible:k.visible,petting:k.petting,options:options.map(o=>o.id),counterBefore:beforePet,counterAfter:A.stats.petted??0,position:k.object.position.toArray(),dy:k.object.position.y-O.ground(k.object.position.x,k.object.position.z)};
 check(met.st==='bound'&&met.outdoorCat==='Sotis'&&met.petting&&!!pet&&Math.abs(met.dy)<.05,'approach at enlarged route promotes ordinary cat and real pet action still purrs',met);
 // Capture final callback heights for source-bound Node walkability checks; no additional profile or image.
 const site={...R.site,heights:[]};for(let z=16;z<=166;z++)for(let x=-145;x<=18;x++)site.heights.push(+O.ground(x,z).toFixed(6));
 return{checks,site,composition:'Exact new route/rest/vary JSON and final main park-ground callback composed onto the already-built same-base app; route/brain modules loaded from final source before bootstrap.',limits:'Real production modules and fish/pet lifecycle with controlled wall clock/spawn and one fixture-created raw caught fish. No native fishing achievement, continuous walking route or physical-device performance claim.'};
})()
