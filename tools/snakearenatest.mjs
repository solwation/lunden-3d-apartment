import test from 'node:test';import assert from 'node:assert/strict';
import { SnakeArena } from '../src/snakearena.js';import { SNAKE as C } from '../src/config.js';
const arena=()=>new SnakeArena(0,()=>.5);
test('food grows length and score; turn and speed are bounded',()=>{
 const g=arena(),s=g.join('a','Anna','pc-home',0),h=s.points[0].slice();g.food=[[h[0],h[1]+C.speed*C.step,1]];s.target=0;g.tick(C.step,30);
 assert.equal(s.length,C.initialSegments+C.foodGrowth);assert.equal(s.score,1);assert(Math.abs(s.angle-Math.PI/2)<=C.turnRate*C.step+1e-9);assert(Math.abs(Math.hypot(s.points[0][0]-h[0],s.points[0][1]-h[1])-C.speed*C.step)<1e-9);
});
test('head-to-body collision drops edible food and credits the survivor',()=>{
 const g=arena(),a=g.join('a','Anna','pc-home',0),b=g.join('b','Bo','laptop-home',0);g.food=[];a.angle=a.target=0;a.points=[[8,10],[7.9,10]];b.angle=b.target=0;b.points=[[12,10],[8.15,10],[8.2,10]];g.tick(C.step,100);
 assert.equal(a.alive,false);assert.equal(a.killer,'Bo');assert.equal(b.alive,true);assert.equal(b.kills,1);assert(g.food.some(p=>p[2]>1));
});
test('larger head eats a smaller opponent; equal head-on collision kills both',()=>{
 for(const larger of [true,false]){const g=arena(),a=g.join('a','A','pc-home',0),b=g.join('b','B','laptop-home',0);a.angle=a.target=0;b.angle=b.target=Math.PI;a.points=[[10,10],[9.8,10]];b.points=[[10.25,10],[10.45,10]];if(larger)a.length=40;g.tick(C.step,100);assert.equal(a.alive,larger);assert.equal(b.alive,false);}
});
test('walls, respawn delay, capped catch-up and bounded snapshots',()=>{
 const g=arena(),s=g.join('a','A','pc-home',0);s.angle=s.target=0;s.points=[[C.width-.1,10]];g.tick(C.step,100);assert.equal(s.alive,false);assert.equal(g.join('a','A','pc-home',200),null);assert(g.join('a','A','pc-home',100+C.respawnMs));const p=g.snakes.get('a').points[0].slice();g.advance(1000000);assert(Math.hypot(g.snakes.get('a').points[0][0]-p[0],g.snakes.get('a').points[0][1]-p[1])<=C.speed*C.catchUp+.001);assert(g.food.length<=C.foodMax);assert.equal(g.snapshot().snakes.length,1);
});
