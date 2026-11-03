import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FOOTBALL as C,REST} from '../src/config.js';
import {buildFootballSite,footballGeometry} from '../src/footballmodel.js';
import {footballSegments,footballFootprints} from '../src/footballgeo.js';
import {footballWorld} from '../src/footballphysics.js';
import {footballDrinking} from '../src/footballlife.js';
import {ActionSet,Runner} from '../src/actions.js';
const ground=(x,z)=>2.7+(x-C.at[0])*.012+(z-C.at[1])*.018;
ground.grid=()=>({X:[-300,-280,-260,-240],Z:[-50,-30,-10,10,30]});
test('static fittings, terrain-cut paint, seat poses and local walking support share the real sampler contract',()=>{
 const site=buildFootballSite(ground);assert.deepEqual(site.segments,footballSegments());
 assert.deepEqual(site.footprints.map(p=>Array.from(p)),footballFootprints().map(p=>Array.from(p)));
 assert.equal(site.targets.length,3);assert.equal(site.supports.length,2);
 for(const {point:[x,y,z]} of site.contacts)assert.ok(Math.abs(y-ground(x,z))<1e-9);
 for(const bench of site.targets.filter(t=>t.kind==='rest'))for(const s of bench.spots){assert.ok(s.pos.y>ground(s.pos.x,s.pos.z)+REST.sitEye);assert.ok(s.lookPos.distanceTo(new THREE.Vector3(...[C.at[0],s.lookPos.y,C.at[1]]))<1e-8);}
 const mesh=site.object.getObjectByName('football-static'),g=mesh.geometry;assert.ok(g.attributes.position.array.every(Number.isFinite));assert.ok(g.attributes.normal.array.every(Number.isFinite));
 const p=g.attributes.position,c=g.attributes.color,white=new THREE.Color(C.colors.line);let paint=0;
 for(let i=0;i<p.count;i++)if(Math.abs(c.getX(i)-white.r)<1e-5&&Math.abs(c.getY(i)-white.g)<1e-5&&Math.abs(c.getZ(i)-white.b)<1e-5){assert.ok(Math.abs(p.getY(i)-ground(p.getX(i),p.getZ(i))-C.lineLift)<2e-6);paint++;}
 assert.ok(paint>100);for(const u of[-C.width/2-C.runoff,C.width/2+C.apron])for(const d of[-.01,.01]){const [x,z]=footballWorld(C,u+d,0),inside=u<0?d>0:d<0;assert.equal(site.groundAt(x,z)!==null,inside);}
 const ball=footballGeometry();assert.equal(ball.attributes.position.count/3,180);assert.ok(ball.attributes.position.array.every(Number.isFinite));
 console.log(JSON.stringify({staticTriangles:p.count/3,ballTriangles:180,netsSegments:site.object.getObjectByName('football-nets').geometry.attributes.position.count/2,footContacts:site.contacts.length,paintVertices:paint}));
});
test('direct drinking uses the timed Life runner: cancel/reach/hands/cooldown give no water, completed sip gives one existing event',()=>{
 const site=buildFootballSite(ground),target=site.fountain,counts=[],events=[];let now=0,releases=0;
 const life={camera:{position:target.position.clone()},actions:new ActionSet(),runner:new Runner({}),bump:(...a)=>counts.push(a),emit:(...a)=>events.push(a)};
 let ctx={raw:target,life,heldView:null};life.options=()=>life.actions.list(ctx);
 footballDrinking(life,site,()=>releases++,()=>now);const def=life.options()[0].def;
 assert.equal(life.runner.start(def,ctx).def,def);life.runner.update(.4);assert.equal(target.stream.visible,true);life.runner.interrupt();assert.equal(target.stream.visible,false);assert.equal(counts.length,0);
 life.runner.start(def,ctx);life.runner.update(C.fountain.drinkSeconds);assert.deepEqual(counts,[['water',1]]);assert.equal(events[0][1].ml,C.fountain.ml);assert.equal(target.stream.visible,false);assert.ok(releases>=2);assert.equal(typeof life.runner.start(def,ctx),'string');
 now+=C.fountain.everyMs;ctx.heldView={};assert.equal(typeof life.runner.start(def,ctx),'string');ctx.heldView=null;life.camera.position.x+=20;assert.equal(typeof life.runner.start(def,ctx),'string');assert.equal(counts.length,1);
});
