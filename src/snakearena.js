import { SNAKE as C, COMPUTER_MEDIA } from './config.js';
const dist2=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const round=n=>Math.round(n*100)/100;
/** Server-owned arena. Clients supply heading only, never food, position, length or damage. */
export class SnakeArena {
  constructor(now=0,random=Math.random) {this.random=random;this.at=now;this.remainder=0;this.q=0;this.snakes=new Map();this.food=[];this.serial=0;this.fill();}
  pellet(x,y,value=1){return [x??C.foodMargin+this.random()*(C.width-2*C.foodMargin),y??C.foodMargin+this.random()*(C.height-2*C.foodMargin),value];}
  fill(){while(this.food.length<C.foodCount)this.food.push(this.pellet());}
  radius(s){return C.radius+Math.max(0,s.length-C.initialSegments)*C.radiusGrowth;}
  join(id,name,screen,now) {
    const old=this.snakes.get(id);if(old?.alive)return old;
    if(old&&now-old.deadAt<C.respawnMs)return null;
    const index=COMPUTER_MEDIA.stations.findIndex(s=>s.id===screen);if(index<0)return null;
    let x,y,angle;
    for(let attempt=0;attempt<COMPUTER_MEDIA.stations.length*2;attempt++) {
      const slot=(index+this.serial+attempt)%COMPUTER_MEDIA.stations.length;
      const [sx,sy]=C.spawn[slot%C.spawn.length]; // more stations than slots share them; clearance picks a free one (#1566)
      x=C.width*sx;y=C.height*sy;angle=sy<.5?Math.PI/2:-Math.PI/2;
      if(![...this.snakes.values()].some(s=>s.alive&&s.points.some(p=>dist2(p,[x,y])<C.spawnClearance**2)))break;
      if(attempt===COMPUTER_MEDIA.stations.length*2-1)return null;
    }
    this.serial++;const spacing=C.speed*C.step;
    const s={id,name,screen,color:COMPUTER_MEDIA.stations[index].color,angle,target:angle,length:C.initialSegments,score:0,kills:0,alive:true,points:Array.from({length:C.initialSegments},(_,i)=>[x-Math.cos(angle)*i*spacing,y-Math.sin(angle)*i*spacing])};
    this.snakes.set(id,s);this.q++;return s;
  }
  kill(s,why,killer=null,now=this.at) {
    if(!s.alive)return;
    s.alive=false;s.why=why;s.killer=killer?.name??'';s.deadAt=now;
    for(let i=0;i<s.points.length&&this.food.length<C.foodMax;i+=C.dropStride)this.food.push(this.pellet(...s.points[i],C.foodGrowth));
    s.points=[];if(killer){killer.kills++;killer.score+=s.length;}this.q++;
    this.onEnd?.(s); // #1577: the round's server-computed result for the Ormstriden top list
  }
  remove(id){const s=this.snakes.get(id);if(s?.alive)this.onEnd?.(s);if(this.snakes.delete(id))this.q++;}
  advance(now) {
    const elapsed=Math.max(0,Math.min(C.catchUp,(now-this.at)/1000));this.at=now;this.remainder+=elapsed;
    while(this.remainder>=C.step){this.remainder-=C.step;this.tick(C.step,now);}
  }
  tick(dt,now) {
    const alive=[...this.snakes.values()].filter(s=>s.alive),deaths=new Map();
    for(const s of alive){const delta=wrap(s.target-s.angle);s.angle=wrap(s.angle+Math.sign(delta)*Math.min(Math.abs(delta),C.turnRate*dt));const h=s.points[0];s.points.unshift([h[0]+Math.cos(s.angle)*C.speed*dt,h[1]+Math.sin(s.angle)*C.speed*dt]);s.points.length=Math.min(s.points.length,s.length);const p=s.points[0],r=this.radius(s);if(p[0]<r||p[0]>C.width-r||p[1]<r||p[1]>C.height-r)deaths.set(s,{why:'väggen'});}
    // Test all new heads against the same frame; head-on ties cannot favour message order.
    for(let i=0;i<alive.length;i++)for(let j=i+1;j<alive.length;j++){
      const a=alive[i],b=alive[j],r=(this.radius(a)+this.radius(b))*C.collisionScale;
      if(dist2(a.points[0],b.points[0])<=r*r){
        if(a.length>=b.length*C.headAdvantage)deaths.set(b,{why:'uppäten',killer:a});
        else if(b.length>=a.length*C.headAdvantage)deaths.set(a,{why:'uppäten',killer:b});
        else{deaths.set(a,{why:'huvudkrock'});deaths.set(b,{why:'huvudkrock'});}
      }else{
        if(b.points.slice(1).some(p=>dist2(a.points[0],p)<=r*r))deaths.set(a,{why:'krock',killer:b});
        if(a.points.slice(1).some(p=>dist2(b.points[0],p)<=r*r))deaths.set(b,{why:'krock',killer:a});
      }
    }
    for(const[s,d]of deaths)this.kill(s,d.why,d.killer?.alive&&!deaths.has(d.killer)?d.killer:null,now);
    for(const s of alive){if(!s.alive)continue;const h=s.points[0],r=this.radius(s)+C.foodRadius;for(let i=this.food.length-1;i>=0;i--)if(dist2(h,this.food[i])<r*r){const food=this.food.splice(i,1)[0];s.length=Math.min(C.maxSegments,s.length+C.foodGrowth*food[2]);s.score+=food[2];}}
    this.fill();if(alive.length)this.q++;
  }
  snapshot(){return{q:this.q,at:this.at,width:C.width,height:C.height,food:this.food.map(p=>p.map(round)),snakes:[...this.snakes.values()].map(s=>({...s,target:undefined,points:s.points.map(p=>p.map(round))}))};}
}
