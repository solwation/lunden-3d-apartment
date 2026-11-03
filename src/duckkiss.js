// #1846: a small local override for existing mates. Ordinary flock goals/identity/food/rewards remain untouched.
export function duckBill(position){
 let z=-Infinity;for(let i=0;i<position.count;i++)z=Math.max(z,position.getZ(i));let lo=Infinity,hi=-Infinity;
 for(let i=0;i<position.count;i++)if(Math.abs(position.getZ(i)-z)<1e-6){lo=Math.min(lo,position.getY(i));hi=Math.max(hi,position.getY(i));}
 return{z,y:(lo+hi)/2,halfY:(hi-lo)/2};
}
export class DuckKiss {
 constructor({config,bill,habitat,seen,random=Math.random,burst=()=>{}}){Object.assign(this,{config,bill,habitat,seen,random,burst});this.time=0;this.next=config.first;this.cool=new Map();this.pair=null;}
 owns(b){return !!this.pair?.birds.includes(b);}
 stop(){if(!this.pair)return;for(const b of this.pair.birds){b.kissing=false;b.moving=false;this.cool.set(b,this.time+this.config.cooldown);}this.pair=null;}
 interrupt(b){if(this.owns(b))this.stop();}
 foodNear(b,food){return !!food&&this.habitat.contains(food.x,food.z)&&Math.hypot(food.x-b.x,food.z-b.z)<this.config.foodReach&&Math.abs((food.y??b.y)-b.y)<this.config.foodHeight;}
 clear(a,b,water){const C=this.config,n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/C.sample)),ys=[];for(let i=0;i<=n;i++){const x=a.x+(b.x-a.x)*i/n,z=a.z+(b.z-a.z)*i/n;if(!this.habitat.contains(x,z))return false;const s=this.habitat.surface(x,z);if(s.water!==water||!Number.isFinite(s.y))return false;ys.push(s.y);}return Math.max(...ys)-Math.min(...ys)<=C.rise;}
 update(dt,flock,food=null,hidden=false){
  const C=this.config;dt=Math.min(Math.max(dt,0),C.maxStep);this.time+=dt;
  const idle=b=>!hidden&&!b.eating&&!b.cooldown&&this.seen(b)&&!this.foodNear(b,food);
  if(this.pair){const p=this.pair;if(!p.birds.every(idle)||p.age>C.timeout){this.stop();return;}p.age+=dt;
   let ready=true;p.birds.forEach((b,i)=>{const q=['space','turn','withdraw','resume'].includes(p.stage)?p.space[i]:p.goals[i],yaw=['space','resume'].includes(p.stage)?p.yaws[i]:p.yaws[2+i],delta=Math.atan2(Math.sin(yaw-b.yaw),Math.cos(yaw-b.yaw)),d=Math.hypot(q.x-b.x,q.z-b.z);b.yaw+=Math.max(-C.turn*dt,Math.min(C.turn*dt,delta));
    if(!this.clear(b,q,p.water)){this.stop();return;}
    const moving=!['turn','resume'].includes(p.stage)&&d>C.arrive,step=moving?Math.min(d,C.speed*dt):0;if(moving){b.x+=(q.x-b.x)/d*step;b.z+=(q.z-b.z)/d*step;b.phase+=step*(p.water?C.phaseSwim:C.phaseWalk);}b.y=this.habitat.surface(b.x,b.z).y;b.swimming=p.water;b.moving=moving;
    if(d>C.arrive||Math.abs(delta)>C.face)ready=false;
   });if(!this.pair)return;
   if(ready){if(p.stage==='space')p.stage='turn';else if(p.stage==='turn')p.stage='approach';else if(p.stage==='withdraw')p.stage='resume';else if(p.stage==='resume')this.stop();else{p.contact+=dt;if(!p.burst&&p.contact>C.settle){p.burst=true;this.burst(p);}if(p.contact>C.settle+C.duration)p.stage='withdraw';}}return;
  }
  if(hidden||this.time<this.next)return;this.next=this.time+C.scan;if(flock.grouping)return;
  for(let i=0;i<flock.brains.length;i+=2){const a=flock.brains[i],b=flock.brains[i+1];if(!a.female||b.female||a.mate!==b.id||b.mate!==a.id||![a,b].every(q=>idle(q)&&(this.cool.get(q)??0)<=this.time))continue;
   const dx=a.x-b.x,dz=a.z-b.z,d=Math.hypot(dx,dz);if(d<C.minDistance||d>C.reach)continue;const ux=dx/d,uz=dz/d;if(ux*Math.sin(a.yaw)+uz*Math.cos(a.yaw)<C.aligned||ux*Math.sin(b.yaw)+uz*Math.cos(b.yaw)<C.aligned)continue;
   const water=this.habitat.surface(a.x,a.z).water;if(water!==this.habitat.surface(b.x,b.z).water)continue;
   const extra=Math.max(0,2*this.bill.z+C.turnGap-d),space=[{x:a.x+ux*extra,z:a.z+uz*extra},{x:b.x,z:b.z}],mx=(space[0].x+space[1].x)/2,mz=(space[0].z+space[1].z)/2,goals=[{x:mx+ux*this.bill.z,z:mz+uz*this.bill.z},{x:mx-ux*this.bill.z,z:mz-uz*this.bill.z}];
   if(![a,b].every((q,k)=>this.clear(q,space[k],water)&&this.clear(space[k],goals[k],water)))continue;
   const y=goals.map(q=>this.habitat.surface(q.x,q.z).y);if(Math.abs(y[0]-y[1])>Math.min(C.rise,this.bill.halfY))continue;if(this.random()>=C.chance)continue;
   this.pair={birds:[a,b],stage:'space',space,goals,water,yaws:[a.yaw,b.yaw,Math.atan2(-ux,-uz),Math.atan2(ux,uz)],age:0,contact:0,burst:false,point:{x:mx,y:(y[0]+y[1])/2+this.bill.y,z:mz}};a.kissing=b.kissing=true;return;
  }
 }
}
