import test from'node:test';import assert from'node:assert/strict';import{BouleClient}from'../src/bouleclient.js';import{freshBoule,playBoule,circle}from'../src/boulesync.js';
function make(){const sent=[],b={rules:{},physics:{objects:[]},near:()=>true,inCircle:()=>true,onEvent:()=>{}},g={connected:true,camera:{position:{}},boule:m=>{sent.push(m);return true;}},c=new BouleClient(b,g);return{b,g,c,sent};}
test('old Worker is explicitly refused, offline has local mode, no optimistic shared mutation',()=>{const{c,g,b,sent}=make();g.onWelcome({});assert.match(c.command('r'),/ladda om spelet/);assert.equal(sent.length,0);g.connected=false;c.update();assert.equal(c.managed,false);g.on=true;assert(c.managed);assert.match(c.command('r'),/anslutning/);g.on=false;g.connected=true;g.onWelcome({boule:{v:1,e:freshBoule()}});const before=structuredClone(b.physics.objects);assert.match(c.command('r'),/Väntar/);assert.deepEqual(b.physics.objects,before);assert.equal(sent.length,1);assert.match(c.command('r'),/Vänta/);});
test('authoritative replay, duplicate ACK, disconnect freeze, late welcome and reject resync',()=>{const{c,g,b}=make();const start=freshBoule(),cmd={k:'t',q:0,aim:[circle.x,26.4]},r=playBoule(start,cmd,123);g.onWelcome({boule:{v:1,e:start}});g.onBoule({v:1,e:r.end,action:{start,cmd,seed:123,from:[circle.x,1.2,circle.z],elapsed:10,ms:r.ms}});assert(c.trace);assert.equal(b.sharedFrame[0].active,true);const old=c.trace;g.onBoule({v:1,e:r.end});assert.equal(c.trace,old);g.connected=false;c.update();assert(c.managed);assert.match(c.command('r'),/återanslutning/);assert.equal(c.trace,null);g.connected=true;g.onWelcome({boule:{v:1,e:r.end}});assert.equal(c.q,1);assert.equal(b.physics.objects[0].active,true);g.onBoule({v:1,e:start,why:'stale'});assert.equal(c.q,1);b.rules.next=null;assert.match(c.command('t'),/Partiet är slut/);});

test('background welcome/revisions stay silent while state updates; only a nearby participant gets notices',()=>{
 const{c,g,b}=make(),events=[];b.onEvent=text=>events.push(text);let near=false;b.near=()=>near;
 g.onWelcome({boule:{v:1,e:freshBoule()}});assert.deepEqual(events,[],'ordinary connection is not joining boule');
 const next=q=>({...freshBoule(q),rules:{...freshBoule(q).rules,message:`Boule ${q}`,scores:[q,0]}});
 g.onBoule({v:1,e:next(1)});assert.equal(c.q,1);assert.deepEqual(b.rules.scores,[1,0]);assert.deepEqual(events,[]);
 near=true;g.onBoule({v:1,e:next(2)});assert.deepEqual(events,[],'proximity alone is not participation');
 c.command('r');g.onBoule({v:1,e:next(3)});assert.deepEqual(events,['Boule 3']);
 g.onBoule({v:1,e:next(3)});assert.equal(events.length,1,'duplicate ACK silent');
 near=false;g.onBoule({v:1,e:next(4)});assert.equal(c.q,4);assert.equal(events.length,1,'participant walking away stays synchronized silently');
 near=true;g.onBoule({v:1,e:next(5)});assert.deepEqual(events,['Boule 3','Boule 5']);
 g.connected=false;c.update();g.connected=true;g.onWelcome({boule:{v:1,e:next(5)}});assert.equal(events.length,2,'same reconnect snapshot does not repeat notice');
 g.onBoule({v:1,e:next(6)});assert.equal(events.at(-1),'Boule 6');
});
test('an explicit pending request retains its rejection after leaving; unsolicited rejections stay silent',()=>{
 const{c,g,b}=make(),events=[];b.onEvent=text=>events.push(text);b.near=()=>false;
 g.onWelcome({boule:{v:1,e:freshBoule()}});g.onBoule({v:1,e:freshBoule(),why:'away'});assert.deepEqual(events,[]);
 c.command('r');g.onBoule({v:1,e:freshBoule(),why:'away'});assert.deepEqual(events,['Ställ dig vid banan eller i kastringen']);
});
test('an own pending timeout still reports resync after walking away',()=>{
 const{c,g,b,sent}=make(),events=[];b.onEvent=text=>events.push(text);b.near=()=>false;
 g.onWelcome({boule:{v:1,e:freshBoule()}});c.command('r');c.pending=performance.now()-6000;c.update();
 assert.match(events.at(-1),/hämtar banan igen/);assert.equal(sent.at(-1).k,'g');
});
