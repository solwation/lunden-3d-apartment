// #2241: the pure side of a computer game's picture for onlookers (src/screenshare.js): the Klossar and Meteoriter codecs, the wire checks, the
// onlooker's feed (order, owner, staleness) and the controller's pacing. node --test src/screenshare.test.mjs
import test from 'node:test';import assert from 'node:assert/strict';
import { encodeMeteors, decodeMeteors, encodeBlocks, decodeBlocks, blocksView, SCREEN_CODECS, cleanScreenFrame, cleanScreenRelay, ScreenFeed, frameDue } from './screenshare.js';
import { BlocksGame, SHAPES } from './blocks.js';import { outboxTier } from './outbox.js';
import { MeteorsGame } from './meteors.js';
import { BLOCKS as B, METEORS as M, SCREEN_SHARE as S } from './config.js';

const seeded=seed=>()=>((seed=(seed*16807)%2147483647)/2147483647);
const same=(view,g)=>{
 assert.deepEqual(view.board,g.board);assert.deepEqual(view.piece,g.piece?{type:g.piece.type,cells:g.piece.cells,x:g.piece.x,y:g.piece.y}:null);
 for(const k of ['next','score','lines','level','running','over'])assert.equal(view[k],g[k],k);
 if(g.piece)assert.equal(view.ghost(),g.ghost(),'the ghost piece lands at the same row');
};

test('Klossar codec: every step of 300 seeded rounds decodes to the same picture (board, piece, ghost, next, score, flags)',()=>{
 const random=seeded(2241);let frames=0,longest=0;
 for(let round=0;round<300;round++){
  const g=new BlocksGame(random);same(blocksView(decodeBlocks(encodeBlocks(g))),g);g.start();
  for(let i=0;i<400&&g.running;i++){
   const r=random();if(r<.25)g.move(-1);else if(r<.5)g.move(1);else if(r<.65)g.rotate(1);else if(r<.7)g.hard();else g.step(250);
   const f=encodeBlocks(g);longest=Math.max(longest,f.length);same(blocksView(decodeBlocks(f)),g);frames++;
  }
  same(blocksView(decodeBlocks(encodeBlocks(g))),g);
 }
 assert(frames>20000,`${frames} frames`);assert(longest<=S.maxFrame,`longest ${longest}`);
});

test('Klossar codec: the worst board (every other cell), negative piece positions and the idle / over flags stay within the limits',()=>{
 const g=new BlocksGame(()=>.1);g.start();
 g.board=g.board.map((row,y)=>row.map((_,x)=>(x+y)%2?'L':''));g.piece={type:'I',cells:[[1,0],[1,1],[1,2],[1,3]],x:-1,y:-2};
 g.score=999999999;g.lines=9999999;g.level=999;
 const f=encodeBlocks(g);assert(f.length<=S.maxFrame,`${f.length}`);same(blocksView(decodeBlocks(f)),g);
 const idle=new BlocksGame(()=>.1),d=decodeBlocks(encodeBlocks(idle));assert.equal(d.running,false);assert.equal(d.over,false);assert.equal(d.piece,null);
 g.end();assert.equal(decodeBlocks(encodeBlocks(g)).over,true);
 const msg=JSON.stringify({t:'scr',screen:'laptop-home',app:'blocks',n:Number.MAX_SAFE_INTEGER,f});assert(msg.length<=S.maxBytes,`${msg.length}`);
 assert.equal(encodeBlocks(new BlocksGame(()=>.1)).split('|')[0],String(B.cols*B.rows),'an empty board is one number');
});

test('Klossar decoder refuses anything that is not exactly a picture',()=>{
 const ok=encodeBlocks(new BlocksGame(()=>.3)),[,piece,next,nums,flag]=ok.split('|');
 const bad=[`199|${piece}|${next}|${nums}|${flag}`,`201|${piece}|${next}|${nums}|${flag}`,`0200|${piece}|${next}|${nums}|${flag}`,`199X|||0,0,1|i`,`200|T00112234,0,0|${next}|${nums}|${flag}`,
  `200|T0011212,0,0||0,0,1|i`,`200|T00112131,99,0||0,0,1|i`,`200|T00112131,0,-9||0,0,1|i`,`200|||0,0,1|x`,`200||Q|0,0,1|i`,`200|||-1,0,1|i`,`200|||1e3,0,1|i`,`200|||0,0,1`,
  `200|||0,0,1|i|`,'1'.repeat(S.maxFrame+1),'',null,42];
 for(const f of bad)assert.equal(decodeBlocks(f),null,String(f).slice(0,40));
 const t=performance.now();assert.equal(decodeBlocks('1'.repeat(S.maxFrame-8)+'|||0,0,1|i'),null);assert(performance.now()-t<50,'a long digit run is refused at once');
 assert.equal(Object.keys(SHAPES).every(k=>/^[IOTSZJL]$/.test(k)),true);
});

test('wire: the sent frame and the relayed one are checked alike; the relay needs the sender id',()=>{
 const f=encodeBlocks(new BlocksGame(()=>.3)),m={t:'scr',screen:'pc-olof',app:'blocks',n:5,f};
 assert.deepEqual(cleanScreenFrame(JSON.stringify(m)),{screen:'pc-olof',app:'blocks',n:5,f});
 assert.equal(cleanScreenRelay(m),null);assert.deepEqual(cleanScreenRelay({...m,i:'ab12cd34'}),{screen:'pc-olof',app:'blocks',n:5,f,i:'ab12cd34'});
 for(const x of [{...m,i:'<b>'},{...m,i:'ab',app:'snake'},{...m,i:'ab',screen:'bedroom1'}])assert.equal(cleanScreenRelay(x),null);
 assert.equal(outboxTier(m),0,'a picture is a replaceable snapshot in the outbox');
 assert.deepEqual(Object.keys(SCREEN_CODECS),S.apps,'every relayed app has a codec');
});

test('onlooker feed: newest from the current owner and app only; a short gap freezes, staleMs ends the picture',()=>{
 const feed=new ScreenFeed(),g=new BlocksGame(()=>.2),f=encodeBlocks(g),m=(n,i='a1',app='blocks',ff=f)=>({screen:'pc-home',app,n,f:ff,i});
 assert.equal(feed.accept(m(10),0),true);assert.equal(feed.version,1);
 assert.equal(feed.accept(m(10),10),false,'repeat');assert.equal(feed.accept(m(9),20),false,'older');
 assert.equal(feed.accept(m(11,'a1','blocks','bad'),30),false,'undecodable');assert.equal(feed.accept(m(12,'a1','snake'),30),false,'no codec');
 assert.ok(feed.current(S.staleMs,'a1','blocks'),'frozen until staleMs');
 assert.equal(feed.current(S.staleMs+1,'a1','blocks'),null,'stale');
 assert.equal(feed.current(100,'b2','blocks'),null,'another owner now');assert.equal(feed.current(100,'a1','snake'),null,'another app now');
 assert.equal(feed.accept(m(3,'b2'),200),true,'a new sender starts its own numbering');assert.ok(feed.current(300,'b2','blocks'));
 feed.clear();assert.equal(feed.current(300,'b2','blocks'),null);assert.equal(feed.accept(m(4,'b2'),400),true);assert.equal(feed.version,3,'the version keeps rising over a clear');
});

test('pacing: a changing picture goes out at no more than hz (60 fps frame loop), an unchanged one every keyMs, the first at once',()=>{
 const run=(hz,ms,changes)=>{let last=null,sent=0;for(let t=0;t<ms;t+=1000/60){const f=changes?`f${Math.floor(t/50)}`:'same';if(frameDue(last,f,t,hz)){last={f,at:t};sent++;}}return sent;};
 for(const hz of [S.hz,S.lowMemoryHz]){const n=run(hz,10_000,true);assert(n<=hz*10&&n>=hz*10*.9,`${hz} Hz at 60 fps: ${n} in 10 s`);} // (never above hz: the Worker allows 1000/hz × 0.8 between two)
 assert.equal(run(S.hz,10_000,false),Math.ceil(10_000/S.keyMs));
 assert.equal(frameDue(null,'x',0,S.hz),true);assert.equal(frameDue({f:'x',at:0},'y',1000/S.hz-1,S.hz),false);
});

test('Meteoriter snapshots preserve the HUD, ship and flame visibility, shots and individual rock outlines',()=>{
 const g=new MeteorsGame(seeded(2267)); const codec=SCREEN_CODECS.meteors;
 const visible=o=>o.ship.alive&&!(o.ms<o.ship.safeUntil&&Math.floor(o.ms/120)%2);
 const flame=o=>!!(visible(o)&&o.running&&o.input.thrust&&Math.floor(o.ms/60)%2);
 function samePoint(a,b){
   assert(Math.abs(a.x-b.x)<=M.width/510+1e-10);
   assert(Math.abs(a.y-b.y)<=M.height/510+1e-10);
 }
 for(let i=0;i<650;i++){
   if(i===1)g.start();
   if(i===649){g.running=false;g.over=true;}
   const f=codec.encode(g),d=codec.view(codec.decode(f));assert(f.length<=S.maxFrame);
   assert.equal(visible(d),visible(g));assert.equal(flame(d),flame(g));
   for(const k of ['score','wave','lives','over','running'])assert.equal(d[k],g[k],k);
   assert.equal(d.rocks.length,g.rocks.length);assert.equal(d.bullets.length,g.bullets.length);
   samePoint(d.ship,g.ship);
   assert(Math.abs(Math.atan2(Math.sin(d.ship.a-g.ship.a),Math.cos(d.ship.a-g.ship.a)))<=Math.PI/64+1e-10);
   g.bullets.forEach((b,j)=>samePoint(d.bullets[j],b));
   g.rocks.forEach((r,j)=>{samePoint(d.rocks[j],r);assert.equal(d.rocks[j].r,r.r);assert.equal(d.rocks[j].size,r.size);});
   assert.equal(encodeMeteors(d),f);
   g.input={thrust:i%7!==0,right:i%3===0,fire:true};g.step(50);
 }
});

test('dense Meteoriter waves cover the entire playfield within the original wire budget',()=>{
 const g=new MeteorsGame(seeded(2267));g.start();g.rocks=[];
 for(let row=0;row<18;row++)for(let col=0;col<30;col++){
   g.rocks.push(g.rock((row+col)%3,(col+.3)*M.width/30,(row+.7)*M.height/18,0,1));
 }
 g.rocks.push(g.rock(0,g.rocks[1].x,g.rocks[1].y,0,1));
 const f=encodeMeteors(g),d=decodeMeteors(f);
 assert(f.includes('|g'));assert(f.length<=S.maxFrame);assert.equal(d.rocks.length,540);
 d.rocks.forEach((rock,i)=>{assert.equal(rock.size,i===1?0:g.rocks[i].size);});
 assert.notEqual(cleanScreenFrame(JSON.stringify({t:'scr',screen:'laptop-home',app:'meteors',n:Number.MAX_SAFE_INTEGER,f})),null);
});

test('invalid Meteoriter bodies, sizes, flags, counts and dense grids are rejected before drawing',()=>{
 const g=new MeteorsGame(seeded(2267)),f=encodeMeteors(g);
 const [hud,ship]=f.split('|');
 for(const bad of [null,1,f+'\n',f+'?',f+'AAA',f+'AAAD',f.replace('|v','|gA'),f.replace(hud,'0,0,9,i'),
  f.replace(hud,'9999999999999999,0,3,i'),f.replace(ship,'_____'),f.replace('||','|'+ 'AAAA'.repeat(M.maxBullets+1)+'|'),
  f.replace('||','|AAAD|'),f.replace('||','|A|'),'x'.repeat(S.maxFrame+1)])assert.equal(decodeMeteors(bad),null);
});
