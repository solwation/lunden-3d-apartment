// #1577: rules for the computer games Klossar (line clears, levels, rotation, game over) and Meteoriter (inertia,
// wrap-around, splitting, lives, waves). node --test tools/arcadegamestest.mjs
import test from 'node:test';import assert from 'node:assert/strict';
import { BlocksGame, SHAPES } from '../src/blocks.js';import { MeteorsGame } from '../src/meteors.js';
import { BLOCKS as B, METEORS as M } from '../src/config.js';

test('Klossar: a seven-piece bag, then one full row clears for 100 × level',()=>{
 const g=new BlocksGame(()=>0);g.start();const seen=new Set([g.piece.type]);for(let i=0;i<6;i++){seen.add(g.next);g.next=g.draw();}
 assert.equal(seen.size,Object.keys(SHAPES).length);
 g.board[B.rows-1]=Array(B.cols).fill('Z');g.board[B.rows-1][0]='';g.board[B.rows-1][1]='';
 g.piece={type:'O',cells:SHAPES.O.map(c=>c.slice()),x:-1,y:0};const before=g.score,rows=g.hard();
 assert.equal(g.lines,1);assert.equal(g.score-before,rows*B.hardDrop+B.lineScores[1]);
 assert(g.board[B.rows-1].filter(Boolean).length===2,'the O piece top half remains on the floor row');
});
test('Klossar: four lines at once score the tetris value; levels rise every ten lines and speed up gravity',()=>{
 const g=new BlocksGame(()=>.5);g.start();g.lines=8;g.level=1;const slow=g.interval;
 for(let y=B.rows-4;y<B.rows;y++){g.board[y]=Array(B.cols).fill('T');g.board[y][9]='';}
 g.piece={type:'I',cells:[[0,0],[0,1],[0,2],[0,3]],x:9,y:0};g.hard();
 assert.equal(g.lines,12);assert.equal(g.level,2);assert(g.interval<slow);assert(g.score>=B.lineScores[4]);
 assert(g.board.every(r=>!r.every(Boolean)));
});
test('Klossar: walls block moves, rotation kicks off the wall, gravity locks, a blocked spawn ends the game',()=>{
 const g=new BlocksGame(()=>.3);g.start();while(g.move(-1));assert.equal(Math.min(...g.piece.cells.map(c=>c[0]))+g.piece.x,0);
 g.piece={type:'I',cells:[[1,0],[1,1],[1,2],[1,3]],x:-1,y:2};assert(g.rotate(1));assert(g.piece.cells.every(([x])=>g.piece.x+x>=0));
 const pieces=g.pieces;g.step(250);for(let i=0;i<200&&g.pieces===pieces;i++)g.step(250);assert.equal(g.pieces,pieces+1);
 for(let y=0;y<B.rows;y++)g.board[y]=Array(B.cols).fill('').map((_,x)=>x%2?'S':'');g.piece=null;
 g.next='O';g.spawn();assert.equal(g.over,true);assert.equal(g.running,false);
 const r=g.result();assert(Number.isInteger(r.score)&&Number.isInteger(r.ms));
});
test('Meteoriter: thrust keeps inertia, drag slows, the ship wraps around the edges',()=>{
 const g=new MeteorsGame(()=>.1);g.start();g.rocks=[];g.nextWave=()=>{};const s=g.ship;s.a=0;g.input.thrust=true;g.step(500);
 const v=s.vx;assert(v>0);g.input.thrust=false;g.step(200);assert(s.vx>0&&s.vx<v);
 s.x=M.width-.01;s.vx=5;g.tick(M.step);assert(s.x<1);s.y=.01;s.vy=-5;g.tick(M.step);assert(s.y>M.height-1);
});
test('Meteoriter: a hit splits a large meteor into two smaller ones; the smallest disappears; scores per size',()=>{
 const g=new MeteorsGame(()=>.4);g.start();g.rocks=[g.rock(0,10,10,0,0)];g.split(g.rocks[0]);
 assert.equal(g.rocks.length,2);assert(g.rocks.every(r=>r.size===1&&Math.hypot(r.vx,r.vy)>0));assert.equal(g.score,M.points[0]);
 g.rocks=[g.rock(2,10,10,0,0)];g.split(g.rocks[0]);assert.equal(g.rocks.length,0);assert.equal(g.score,M.points[0]+M.points[2]);
 // a real bullet flight: aim at a rock ahead
 const h=new MeteorsGame(()=>.4);h.start();h.nextWave=()=>{};const s=h.ship;s.a=0;h.rocks=[h.rock(0,s.x+4,s.y,0,0)];h.input.fire=true;for(let i=0;i<60&&h.rocks.length===1;i++)h.tick(M.step);
 assert.equal(h.rocks.length,2);assert(h.bullets.length<=M.maxBullets);
});
test('Meteoriter: collisions cost lives after the safe time, the last life ends the game, a cleared wave brings a harder one',()=>{
 const g=new MeteorsGame(()=>.7);g.start();const first=g.rocks.length;assert.equal(first,M.waveStart);
 g.rocks=[];g.tick(M.step);assert.equal(g.wave,2);assert.equal(g.rocks.length,M.waveStart+1);
 const speed=r=>Math.hypot(r.vx,r.vy);assert(speed(g.rocks[0])>M.speeds[0]);
 for(let life=M.lives;life>0;life--){
  g.ms+=M.invulnMs+M.respawnMs;g.ship={...g.newShip(0),safeUntil:0};g.rocks.push(g.rock(2,g.ship.x,g.ship.y,0,0));g.tick(M.step);
  assert.equal(g.lives,life-1);
 }
 assert.equal(g.over,true);assert.equal(g.running,false);
});
