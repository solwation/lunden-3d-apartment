// #1328: a small local equal-mass billiard simulation. Metres/seconds, no rendering or network.
export class BilliardPhysics {
  constructor(config) { this.c = config; this.onPocket = null; this.firstHit = null; this.reset(); }
  reset() {
    const c=this.c,r=c.ballR;this.firstHit=null;this.balls=[{id:0,x:-c.length*.28,z:0,vx:0,vz:0,active:true}];
    let id=1;for(let row=0;row<5;row++)for(let j=0;j<=row;j++)this.balls.push({id:id++,x:c.length*.14+row*r*Math.sqrt(3)*1.03,z:(j-row/2)*r*2.06,vx:0,vz:0,active:true});
    this.pockets=[[-c.length/2,-c.width/2],[0,-c.width/2],[c.length/2,-c.width/2],[-c.length/2,c.width/2],[0,c.width/2],[c.length/2,c.width/2]];
  }
  get moving() { const s=this.c.stopSpeed**2;return this.balls.some(b=>b.active&&b.vx*b.vx+b.vz*b.vz>s); }
  respotCue() {
    const c=this.c,b=this.balls[0],r=c.ballR,free=(x,z)=>this.balls.every(q=>!q.active||q.id===0||Math.hypot(q.x-x,q.z-z)>r*2.1);
    const place=(x,z)=>{Object.assign(b,{x,z,vx:0,vz:0,active:true});return true;};
    if(free(-c.length*.28,0))return place(-c.length*.28,0);
    for(let x=-c.length/2+r*3;x<c.length/2-r*2;x+=r*3)for(let z=-c.width/2+r*3;z<c.width/2-r*2;z+=r*3)if(free(x,z))return place(x,z);
    return false;
  }
  shoot(dx,dz) {
    if(this.moving||!Number.isFinite(dx)||!Number.isFinite(dz))return false;
    const len=Math.hypot(dx,dz);if(len<1e-6)return false;
    if(this.balls.slice(1).every(b=>!b.active))this.reset();
    const b=this.balls[0];if(!b.active&&!this.respotCue())return false;
    this.firstHit=null; // #1354: the first object ball the cue ball touches in this stroke (rules)
    b.vx=dx/len*this.c.strokeSpeed;b.vz=dz/len*this.c.strokeSpeed;return true;
  }
  boundary(b) {
    const c=this.c,r=c.ballR;
    if(this.pockets.some(([x,z])=>Math.hypot(b.x-x,b.z-z)<c.pocketR)) { b.active=false;b.vx=b.vz=0;this.onPocket?.(b.id);return; }
    const hx=c.length/2-r,hz=c.width/2-r;
    if(b.x < -hx){b.x=-hx;if(b.vx<0)b.vx=-b.vx*c.cushionBounce;}
    if(b.x > hx){b.x=hx;if(b.vx>0)b.vx=-b.vx*c.cushionBounce;}
    if(b.z < -hz){b.z=-hz;if(b.vz<0)b.vz=-b.vz*c.cushionBounce;}
    if(b.z > hz){b.z=hz;if(b.vz>0)b.vz=-b.vz*c.cushionBounce;}
  }
  step(dt) {
    if(!Number.isFinite(dt)||dt<=0)return;
    const c=this.c,t=Math.min(dt,.1),n=Math.ceil(t/c.maxStep),h=t/n,r=c.ballR;
    for(let k=0;k<n;k++) {
      for(const b of this.balls)if(b.active){const speed=Math.hypot(b.vx,b.vz),next=Math.max(0,speed-c.friction*h),f=speed?next/speed:0;b.vx*=f;b.vz*=f;b.x+=b.vx*h;b.z+=b.vz*h;this.boundary(b);}
      for(let pass=0;pass<2;pass++)for(let i=0;i<this.balls.length;i++)for(let j=i+1;j<this.balls.length;j++) {
        const a=this.balls[i],b=this.balls[j];if(!a.active||!b.active)continue;
        const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d>=r*2)continue;
        if(this.firstHit===null&&(a.id===0||b.id===0))this.firstHit=a.id===0?b.id:a.id;
        const nx=d>1e-9?dx/d:1,nz=d>1e-9?dz/d:0,move=(r*2-d)/2;
        a.x-=nx*move;a.z-=nz*move;b.x+=nx*move;b.z+=nz*move;
        const closing=(b.vx-a.vx)*nx+(b.vz-a.vz)*nz;
        if(closing<0){const impulse=-(1+c.bounce)*closing/2;a.vx-=impulse*nx;a.vz-=impulse*nz;b.vx+=impulse*nx;b.vz+=impulse*nz;}
      }
      for(const b of this.balls)if(b.active){this.boundary(b);if(Math.hypot(b.vx,b.vz)<c.stopSpeed)b.vx=b.vz=0;}
    }
    if(!this.moving&&!this.balls[0].active)this.respotCue();
  }
}
