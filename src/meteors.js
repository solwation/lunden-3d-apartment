import { METEORS as C } from './config.js';

// #1577 Meteoriter: a turning, thrusting, shooting ship with inertia and wrap-around; meteors split when hit.
// Pure rules, no DOM; src/arcadeview.js draws it. Sizes 0 (large) → 2 (small); a small one just disappears.
const wrap=(v,max)=>(v%max+max)%max;
const near=(a,b,r)=>{const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y),wx=Math.min(dx,C.width-dx),wy=Math.min(dy,C.height-dy);return wx*wx+wy*wy<r*r;};

export class MeteorsGame {
  constructor(random=Math.random) { this.random=random;this.input={left:false,right:false,thrust:false,fire:false};this.reset(); }
  reset() {
    this.ship=this.newShip(0);this.rocks=[];this.bullets=[];this.score=0;this.lives=C.lives;this.wave=0;
    this.ms=0;this.acc=0;this.cooldown=0;this.running=false;this.over=false;this.hits=0;
  }
  newShip(ms) { return {x:C.width/2,y:C.height/2,vx:0,vy:0,a:-Math.PI/2,alive:true,safeUntil:ms+C.invulnMs,deadAt:0}; }
  start() { this.reset();this.running=true;this.nextWave(); }
  rock(size,x,y,angle,speed) { return {size,x,y,r:C.sizes[size],vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,spin:this.random()*6}; }
  nextWave() {
    this.wave++;const n=C.waveStart+this.wave-1,speed=C.speeds[0]*(1+C.waveSpeedUp*(this.wave-1));
    for(let i=0;i<n;i++){
      let x,y,tries=0;
      do{x=this.random()*C.width;y=this.random()*C.height;}while(near({x,y},this.ship,C.spawnClearance)&&++tries<20);
      this.rocks.push(this.rock(0,x,y,this.random()*Math.PI*2,speed));
    }
  }
  /** Splits a hit meteor in two smaller, faster pieces (none for the smallest) and scores its size. */
  split(rock) {
    this.rocks.splice(this.rocks.indexOf(rock),1);this.score+=C.points[rock.size];this.hits++;
    if(rock.size+1<C.sizes.length){
      const heading=Math.atan2(rock.vy,rock.vx),speed=C.speeds[rock.size+1]*(1+C.waveSpeedUp*(this.wave-1));
      for(const side of [-1,1])this.rocks.push(this.rock(rock.size+1,rock.x,rock.y,heading+side*C.splitSpread,speed));
    }
  }
  fire() {
    const s=this.ship;if(!s.alive||this.bullets.length>=C.maxBullets||this.cooldown>0)return false;
    this.cooldown=C.fireMs/1000;
    this.bullets.push({x:s.x+Math.cos(s.a)*C.shipRadius,y:s.y+Math.sin(s.a)*C.shipRadius,vx:s.vx+Math.cos(s.a)*C.bulletSpeed,vy:s.vy+Math.sin(s.a)*C.bulletSpeed,life:C.bulletLife});
    return true;
  }
  step(ms) {
    if(!this.running)return;
    this.acc+=Math.min(ms/1000,C.catchUp);
    while(this.running&&this.acc>=C.step){this.acc-=C.step;this.tick(C.step);}
  }
  tick(dt) {
    this.ms+=dt*1000;this.cooldown=Math.max(0,this.cooldown-dt);
    const s=this.ship,i=this.input;
    if(s.alive){
      s.a+=((i.right?1:0)-(i.left?1:0))*C.turn*dt;
      if(i.thrust){s.vx+=Math.cos(s.a)*C.thrust*dt;s.vy+=Math.sin(s.a)*C.thrust*dt;}
      const drag=Math.max(0,1-C.drag*dt);s.vx*=drag;s.vy*=drag;
      const v=Math.hypot(s.vx,s.vy);if(v>C.maxSpeed){s.vx*=C.maxSpeed/v;s.vy*=C.maxSpeed/v;}
      s.x=wrap(s.x+s.vx*dt,C.width);s.y=wrap(s.y+s.vy*dt,C.height);
      if(i.fire)this.fire();
    }else if(this.ms-s.deadAt>=C.respawnMs){
      // Respawn in the middle once it is clear; invulnerable for a moment either way.
      const fresh=this.newShip(this.ms);if(!this.rocks.some(r=>near(r,fresh,r.r+C.spawnClearance/3)))this.ship=fresh;
    }
    for(const b of this.bullets){b.x=wrap(b.x+b.vx*dt,C.width);b.y=wrap(b.y+b.vy*dt,C.height);b.life-=dt;}
    for(const r of this.rocks){r.x=wrap(r.x+r.vx*dt,C.width);r.y=wrap(r.y+r.vy*dt,C.height);}
    for(const b of this.bullets){if(b.life<=0)continue;const hit=this.rocks.find(r=>near(b,r,r.r));if(hit){b.life=0;this.split(hit);}}
    this.bullets=this.bullets.filter(b=>b.life>0);
    const ship=this.ship;
    if(ship.alive&&this.ms>=ship.safeUntil){
      const hit=this.rocks.find(r=>near(ship,r,r.r+C.shipRadius*.8));
      if(hit){this.split(hit);ship.alive=false;ship.deadAt=this.ms;this.lives--;if(this.lives<=0){this.running=false;this.over=true;}}
    }
    if(this.running&&!this.rocks.length)this.nextWave();
  }
  result() { return {score:this.score,wave:this.wave,ms:Math.round(this.ms)}; }
}
