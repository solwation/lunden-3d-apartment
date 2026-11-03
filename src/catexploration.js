// #1844: bounded, deterministic goal choice on source-checked affordances, no scene or service dependencies.
import { hash01 } from './outdoorcatroute.js';
const dist=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
export class CatExploration {
  constructor(graph, settings) {
    this.graph=graph; this.settings=settings; this.cache=new Map();
    const n=graph.nodes.length;
    this.paths=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?{length:0,points:[]}:null));
    for(const edge of graph.edges){const [a,b,points]=edge;let length=0;for(let i=1;i<points.length;i++)length+=dist(points[i-1],points[i]);this.paths[a][b]={length,points:points.slice(1)};this.paths[b][a]={length,points:points.slice(0,-1).reverse()};}
    // Small fixed graph; this runs once, never per frame or per cat/day.
    for(let k=0;k<n;k++)for(let i=0;i<n;i++)for(let j=0;j<n;j++){const a=this.paths[i][k],b=this.paths[k][j];if(a&&b&&(!this.paths[i][j]||a.length+b.length<this.paths[i][j].length))this.paths[i][j]={length:a.length+b.length,points:a.points.concat(b.points)};}
  }
  day(id,day,traits) {
    const key=id+':'+day;if(this.cache.has(key))return this.cache.get(key);
    const C=this.settings,G=this.graph,home=G.homes[id],visited=new Set([home]),segs=[];let at=home,t=0,walked=0,decisions=0,evaluations=0;
    const add=(a,b,duration,activity,goal)=>{segs.push({a,b,t0:t,t1:t+duration,activity,goal,discovered:visited.size});t+=duration;};
    const travel=(goal,settle=true)=>{
      let a=segs.at(-1)?.b??G.nodes[at].at;
      const points=[];
      if(dist(a,G.nodes[at].at)>.001)points.push(G.nodes[at].at);
      points.push(...this.paths[at][goal].points);
      if(settle&&G.nodes[goal].seats?.[id])points.push(G.nodes[goal].seats[id]);
      for(const b of points){const length=dist(a,b);if(length>.001){add(a,b,length/C.speed,Math.abs(b[1]-a[1])>Math.hypot(b[0]-a[0],b[2]-a[2])?'climb':'walk',goal);walked+=length;}a=b;}
      at=goal;visited.add(goal);
    };
    // Discovery radius grows with visits; lazy cats rest longer and initially stay closer to home.
    const limit=Math.max(C.minGoals,Math.round(C.maxGoals*(1-C.lazyGoalReduction*traits.lazy)));
    for(let k=0;k<limit;k++){
      const radius=C.initialRadius+C.growth*visited.size*(C.curiosityBase+traits.curious),last=at;
      let goal=home,best=-Infinity;
      for(let j=0;j<G.nodes.length;j++){
        evaluations++;
        const route=this.paths[at][j],back=this.paths[j][home];if(j===at||!route||!back)continue;
        if(dist(G.nodes[home].at,G.nodes[j].at)>radius)continue;
        if(t+(route.length+back.length+C.seatReserve)/C.speed+C.minRest>C.daySeconds)continue;
        const novelty=visited.has(j)?C.repeatNovelty:1,noise=hash01(id*131+j,day,k+1844);
        const special=G.nodes[j].kind==='height'?traits.play:G.nodes[j].kind==='quiet'?traits.shy:traits.social;
        const score=novelty*(C.curiosityBase+traits.curious)+noise*C.noise+special*C.specialWeight-route.length*(1+traits.lazy)/(C.distanceCost*(C.curiosityBase+traits.curious))+(j===home?traits.lazy*C.homeLazyWeight:0);
        if(score>best){best=score;goal=j;}
      }
      decisions++;if(best===-Infinity)break;travel(goal);
      const remaining=C.daySeconds-t-(this.paths[at][home].length+C.seatReserve)/C.speed;
      const rest=Math.max(C.minRest+C.rest*traits.lazy+C.rest*hash01(id,day,k+91),remaining/(limit-k)),p=segs.at(-1)?.b??G.nodes[at].at;
      add(p,p,Math.min(rest,remaining),hash01(id,day,k)> .55?'sleep':'look',at);
      if(at===last)break;
    }
    travel(home,false);const p=G.nodes[home].at;add(p,p,Math.max(0,C.daySeconds-t),'sleep',home);
    const plan={segs,visited:[...visited],walked,decisions,evaluations,day};this.cache.set(key,plan);
    // At most current/adjacent days per four identities, including debugging across years.
    if(this.cache.size>C.cachePlans)this.cache.delete(this.cache.keys().next().value);
    return plan;
  }
  at(id,time,traits) {
    const day=Math.floor(time/this.settings.daySeconds),u=time-day*this.settings.daySeconds,plan=this.day(id,day,traits);
    let lo=0,hi=plan.segs.length-1;while(lo<hi){const m=(lo+hi)>>1;if(u>=plan.segs[m].t1)lo=m+1;else hi=m;}
    const s=plan.segs[lo],k=Math.max(0,Math.min(1,(u-s.t0)/(s.t1-s.t0||1))),p=s.a.map((v,i)=>v+(s.b[i]-v)*k),walking=s.activity==='walk'||s.activity==='climb';
    return{x:p[0],y:p[1],z:p[2],yaw:Math.hypot(s.b[0]-s.a[0],s.b[2]-s.a[2])<.001?((s.b[3]??0)+(s.activity==='climb'&&s.b[1]<s.a[1]?Math.PI:0)):Math.atan2(s.b[0]-s.a[0],s.b[2]-s.a[2]),walking,activity:s.activity,goal:s.goal,day,segment:lo,elapsed:u-s.t0,discovered:s.discovered,restLeft:walking?0:s.t1-u,elevated:!!(s.a[4]||s.b[4]||(!walking&&this.graph.nodes[s.goal].surface)),climbing:s.activity==='climb',wallZ:s.a[5]??s.b[5],contactBlend:Math.max(0,Math.min(1,(u-s.t0)/this.settings.climbContactBlend,(s.t1-u)/this.settings.climbContactBlend)),pitch:(s.b[1]>s.a[1]?-1:1)*this.settings.climbPitch,surface:walking?null:this.graph.nodes[s.goal].surface,plan};
  }
}
