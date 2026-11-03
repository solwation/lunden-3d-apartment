// #1845: bounded local social override. The brain owns home/route resumption; no score or network state.
export class CatNuzzle {
  constructor({config,now,ground,clear,available,seen,shape,random=Math.random,burst=()=>{}}){Object.assign(this,{config,now,ground,clear,available,seen,shape,random,burst});this.next=0;this.cool=new Map();this.pair=null;this.poses=new Map();}
  stop(){const p=this.pair;if(!p)return;for(const c of p.cats){this.cool.set(c,this.now()+this.config.cooldown);if(c.st==='social')c.set('home');}this.pair=null;this.poses.clear();}
  update(dt,cats){
    const C=this.config;this.poses.clear();
    if(this.pair){
      const p=this.pair;
      if(!p.cats.every(c=>c.st==='social'&&this.available(c,true)&&this.seen(c))){this.stop();return;}
      p.age+=dt;if(p.age>C.timeout){this.stop();return;}
      let arrived=true;
      p.cats.forEach((c,i)=>{const q=p.goals[i],d=Math.hypot(q.x-c.x,q.z-c.z),delta=Math.atan2(Math.sin(q.yaw-c.yaw),Math.cos(q.yaw-c.yaw)),yaw=c.yaw+Math.max(-C.turn*dt,Math.min(C.turn*dt,delta)),step=Math.min(d,C.speed*dt),ready=Math.abs(delta)<C.face;
        if(d>C.arrive||!ready)arrived=false;
        if(!this.clear(c,c.x,c.z,q.x,q.z)){this.stop();return;}
        this.poses.set(c,{x:c.x+(ready&&d?step*(q.x-c.x)/d:0),z:c.z+(ready&&d?step*(q.z-c.z)/d:0),yaw,walking:ready&&d>C.arrive,moved:ready?step:0,activity:'nuzzle'});
      });
      if(!this.pair)return;
      if(arrived){p.contact+=dt;if(!p.burst&&p.contact>=C.settle){p.burst=true;this.burst(p);}}
      if(p.contact>C.settle+C.duration)this.stop();return;
    }
    if(this.now()<this.next)return;this.next=this.now()+C.scan;
    const idle=cats.filter(c=>this.available(c,false)&&this.seen(c)&&(this.cool.get(c)??0)<=this.now());
    for(let i=0;i<idle.length;i++)for(let j=i+1;j<idle.length;j++){
      const a=idle[i],b=idle[j],dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);
      if(a.spec.zone!==b.spec.zone||d<C.minDistance||d>C.reach)continue;
      const A=this.shape(a),B=this.shape(b),mx=(a.x+b.x)/2,mz=(a.z+b.z)/2,ux=dx/d,uz=dz/d,ra=A.z+A.radius,rb=B.z+B.radius;
      const goals=[{x:mx-ux*ra,z:mz-uz*ra,yaw:Math.atan2(ux,uz)},{x:mx+ux*rb,z:mz+uz*rb,yaw:Math.atan2(-ux,-uz)}];
      if(!goals.every((q,k)=>this.clear(k?b:a,k?b.x:a.x,k?b.z:a.z,q.x,q.z)))continue;
      const ys=goals.map((q,k)=>this.ground(q.x,q.z)+(k?B.y:A.y));if(Math.abs(ys[0]-ys[1])>C.maxHeadShift)continue;
      const chance=C.chance*(.6+.4*((a.traits.social+b.traits.social)/2));if(this.random()>=chance)continue;
      this.pair={cats:[a,b],goals,age:0,contact:0,burst:false,point:{x:mx,y:(ys[0]+ys[1])/2,z:mz},unit:{x:ux,z:uz}};a.set('social');b.set('social');return;
    }
  }
  apply(c){if(!this.pair)return;if(c.st!=='social'){if(this.pair.cats.includes(c))this.stop();return;}const p=this.poses.get(c);if(p)Object.assign(c,p,{h:0,pitch:0,hop:0,faceEye:false,bf:null});}
}
