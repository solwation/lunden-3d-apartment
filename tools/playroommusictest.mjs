import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayroomMusic } from '../src/playroommusic.js';
import { MusicFile } from '../src/music.js';
import { audioParts, toggleMuted } from '../src/audio.js';
const doc = new EventTarget(), win = new EventTarget(); doc.hidden=false;
globalThis.document=doc; globalThis.window=win;
class Node { gain={value:1,setTargetAtTime(v){this.value=v}}; connect(dest){this.dest=dest;return dest} disconnect(){this.dest=null} }
win.AudioContext=class {sampleRate=4;destination={};currentTime=0;createGain(){return new Node()}createBuffer(){return{getChannelData:()=>new Float32Array(8)}}createMediaElementSource(el){const n=new Node();n.el=el;return n}resume(){}};
let created=0;
globalThis.Audio=class extends EventTarget {constructor(){super();created++;this.currentTime=0;this.paused=true}canPlayType(){return'probably'}load(){}play(){this.paused=false;this.dispatchEvent(new Event('playing'));return Promise.resolve()}pause(){this.paused=true}removeAttribute(k){delete this[k]}};
test('lazy start, same real MusicFile transport pauses/resumes, volume and master mute, OFF releases',()=>{
 const m=new PlayroomMusic();m.play();assert.equal(created,0);m.setInside(true);assert.equal(created,0);m.options()[0].run();
 const file=m.file,el=file.el,node=file.node,mix=m.mix;assert.equal(m.state,'playing');assert.match(el.src,/morning-blue/);assert.equal(el.loop,true);assert.equal(mix.dest,audioParts().master);
 el.currentTime=12.5;m.options()[0].run();assert.equal(el.paused,true);assert.equal(m.state,'paused');assert.equal(file.paused,true);
 m.options()[0].run();assert.equal(m.file,file);assert.equal(m.file.el,el);assert.equal(el.currentTime,12.5);assert.equal(el.paused,false);
 m.setVolume(-1);assert.equal(mix.gain.value,0);m.setVolume(99);assert.equal(m.volume,10);assert.equal(mix.gain.value,.5);
 toggleMuted();assert.equal(audioParts().master.gain.value,0);toggleMuted();assert.equal(audioParts().master.gain.value,.8);
 m.options()[1].run();assert.equal(m.state,'off');assert.equal(el.paused,true);assert.equal(el.src,undefined);assert.equal(node.dest,null);assert.equal(mix.dest,null);assert.equal(m.file,null);m.dispose();
});
test('exit/background/pagehide release media and never restart on return',()=>{
 const m=new PlayroomMusic();m.setInside(true);m.play();m.setInside(false);assert.equal(m.file,null);m.setInside(true);assert.equal(m.state,'off');
 m.play();doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(m.file,null);doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(m.state,'off');
 m.play();win.dispatchEvent(new Event('pagehide'));assert.equal(m.file,null);assert.equal(m.state,'off');m.dispose();
});
test('late rejected resume cannot stop a newer session; current failure releases mix',async()=>{
 const m=new PlayroomMusic();m.setInside(true);m.play();m.pause();let reject;const patched=m.file.el;patched.play=()=>new Promise((_,r)=>reject=r);m.play();m.stop();m.play();const next=m.file;reject(Error('old refusal'));await Promise.resolve();assert.equal(m.file,next);
 m.file.failed();await Promise.resolve();assert.equal(m.file,null);assert.equal(m.state,'off');m.dispose();delete patched.play; // the element is pooled (#1629): drop the per-instance override
});

test('pause during pending initial play never retries/poisons files, even when resume precedes AbortError', async()=>{
 const { MusicFile, failedFiles }=await import('../src/music.js');const Original=globalThis.Audio;let pending=[], plays=0;
 globalThis.Audio=class extends Original {play(){plays++;this.paused=false;return new Promise((resolve,reject)=>pending.push({resolve,reject}))}};
 try { const file=new MusicFile({...audioParts(),ctx:new win.AudioContext()},new Node(),{files:['test-delayed.ogg','test-delayed.mp3']});const el=file.el;file.pause();file.resume();pending[0].reject(Object.assign(Error('interrupted'),{name:'AbortError'}));await Promise.resolve();assert.equal(file.el,el);assert.equal(file.src,'test-delayed.ogg');assert.equal(failedFiles.has('test-delayed.ogg'),false);assert.equal(plays,2);
 file.pause();pending[1].reject(Object.assign(Error('interrupted'),{name:'AbortError'}));await Promise.resolve();assert.equal(file.el,el);assert.equal(file.paused,true);assert.equal(plays,2);file.resume();file.stop();pending[2].reject(Object.assign(Error('removed'),{name:'AbortError'}));await Promise.resolve();assert.equal(file.el,null);assert.equal(plays,3);assert.equal(failedFiles.has('test-delayed.ogg'),false);
 }finally{globalThis.Audio=Original}
});
test('genuine decode fallback stays paused; ordinary appliance transport still starts and releases',async()=>{
 const { MusicFile, failedFiles }=await import('../src/music.js');
 const f=new MusicFile(audioParts(),new Node(),{files:['test-failed.ogg','test-good.mp3']});f.pause();f.el.dispatchEvent(new Event('error'));assert.equal(f.src,'test-good.mp3');assert.equal(f.el.paused,true);assert.equal(f.paused,true);assert.equal(failedFiles.has('test-failed.ogg'),true);f.resume();assert.equal(f.el.paused,false);f.stop();
 const appliance=new MusicFile(audioParts(),new Node(),{files:['test-appliance.ogg']});assert.equal(appliance.el.paused,false);assert.equal(appliance.paused,false);appliance.stop();assert.equal(appliance.el,null);
});

test('#1621: next track cuts; mix crossfades two overlapping decks, equal power, then drops the old one',async()=>{
 const { MUSIC }=await import('../src/config.js');const { PLAYROOM_TRACKS }=await import('../src/playroommusic.js');
 const m=new PlayroomMusic();m.setInside(true);assert.equal(m.options().some((o)=>/låt/.test(o.label)),false);m.play();
 const labels=m.options().map((o)=>o.label);assert.match(labels[2],/^Nästa låt$/);assert.match(labels[3],/^Mixa till nästa låt$/);
 const a=m.file;m.options()[2].run();assert.notEqual(m.file,a);assert.equal(a.el,null);assert.match(m.file.el.src,new RegExp(PLAYROOM_TRACKS[1].files[0]));
 const old=MUSIC.crossfade;MUSIC.crossfade=.2;
 try{
  const first=m.deck;m.options()[3].run();assert.ok(m.mixing);assert.equal(m.options()[3].reason,'Mixar redan');
  const mid=m.mixing;assert.equal(mid.outgoing,first);assert.equal(first.file.el.paused,false);assert.equal(mid.incoming.file.el.paused,false);
  await new Promise((r)=>setTimeout(r,100));assert.ok(m.mixing);const o=mid.outgoing.fade.gain.value,i=mid.incoming.fade.gain.value;assert.ok(o>0&&o<1&&i>0&&i<1);assert.ok(Math.abs(o*o+i*i-1)<1e-6);
  await new Promise((r)=>setTimeout(r,250));assert.equal(m.mixing,null);assert.equal(first.file.el,null);assert.equal(m.file,mid.incoming.file);assert.equal(mid.incoming.fade.gain.value,1);
  m.next(true);const inc=m.mixing.incoming;m.stop();assert.equal(m.mixing,null);assert.equal(inc.file.el,null);assert.equal(m.file,null);
 }finally{MUSIC.crossfade=old}
 m.dispose();
});

test('#1622: the floss is offered only while the music plays and ends with pause, off, leaving or walking away',()=>{
 const m=new PlayroomMusic();m.setInside(true);const row=()=>m.options().find((o)=>/floss|Sluta dansa/.test(o.label));
 assert.equal(row(),undefined);m.play();assert.equal(row().label,'Dansa floss');row().run();assert.equal(m.dancing,true);assert.equal(row().label,'Sluta dansa');
 m.tick({x:1,z:1});m.tick({x:1.2,z:1});assert.equal(m.dancing,true);m.tick({x:1.6,z:1});assert.equal(m.dancing,false);
 row().run();m.tick({x:0,z:0});m.pause();m.tick({x:0,z:0});assert.equal(m.dancing,false);assert.equal(row(),undefined);
 m.play();row().run();m.stop();assert.equal(m.dancing,false);
 m.play();row().run();m.setInside(false);assert.equal(m.dancing,false);m.dispose();
});

test('#1636: the dance button is offered to everybody inside while the music plays, wherever they aim',()=>{
 const m=new PlayroomMusic();assert.equal(m.canDance,false);m.setInside(true);assert.equal(m.canDance,false,'no music');assert.equal(m.toggleDance(),false);
 m.play();assert.equal(m.canDance,true);assert.equal(m.toggleDance(),true);assert.equal(m.dancing,true);assert.equal(m.canDance,true,'still offered to stop');
 assert.equal(m.toggleDance(),true);assert.equal(m.dancing,false);m.toggleDance();m.pause();m.tick({x:0,z:0});assert.equal(m.dancing,false);assert.equal(m.canDance,false);
 m.play();m.setInside(false);assert.equal(m.canDance,false);m.dispose();
});

test('#1624 room state: commands go to the room when connected, sync applies idempotently, early state waits for entry, bad state ignored',()=>{
 const m=new PlayroomMusic(),sent=[];m.net={ready:()=>true,send:x=>{sent.push(x);return true}};
 m.setInside(true);m.play();assert.deepEqual(sent.pop(),{t:'mus',k:'p'});assert.equal(m.state,'off','the room answers, nothing local yet');
 m.stop();assert.deepEqual(sent.pop(),{t:'mus',k:'o'});
 m.sync({st:'playing',ix:2,pos:5000});assert.equal(m.state,'playing');assert.equal(m.index,2);const file=m.file;
 m.sync({st:'playing',ix:2,pos:5100});assert.equal(m.file,file,'same track and state: nothing is rebuilt');
 m.next(false);assert.deepEqual(sent.pop(),{t:'mus',k:'n',ix:2});m.next(true);assert.deepEqual(sent.pop(),{t:'mus',k:'m',ix:2});assert.equal(m.index,2);
 m.sync({st:'playing',ix:2,pos:7000,mx:{to:3,el:2000}});assert.ok(m.mixing);assert.equal(m.index,3);assert.equal(m.mixing.outgoing.fade.gain.value<1&&m.mixing.incoming.fade.gain.value>0,true);
 m.sync({st:'paused',ix:3,pos:9000});assert.equal(m.state,'paused');
 m.sync({st:'playing',ix:'x',pos:0});m.sync({st:'playing',ix:99,pos:0});m.sync({st:'playing',ix:1,pos:-1});m.sync(null);assert.equal(m.index,3);
 m.sync({st:'off',ix:3,pos:0});assert.equal(m.state,'off');assert.equal(m.file,null);
 m.setInside(false);m.sync({st:'playing',ix:1,pos:0});assert.equal(m.state,'off','not inside: stored, not played');m.setInside(true);assert.equal(m.state,'playing');assert.equal(m.index,1);
 m.setInside(false);m.setInside(true);assert.equal(m.state,'off','a stored state is not replayed after leaving');m.dispose();
});
test('#1629: released media elements and source nodes are reused, old listeners and seeks do not follow them', () => {
 const ctx = new win.AudioContext(), sources = [], make = ctx.createMediaElementSource.bind(ctx); ctx.createMediaElementSource = (el) => { sources.push(el); return make(el); };
 const A = { ...audioParts(), ctx }, before = created;
 const a = new MusicFile(A, new Node(), { files: ['one.ogg'] }), el = a.el;
 let ended = 0; a.ended = () => ended++; a.stop();
 const b = new MusicFile(A, new Node(), { files: ['two.ogg'] });
 assert.equal(b.el, el, 'the next track gets the released element'); assert.equal(sources.length, 1, 'one source node per element');
 b.el.dispatchEvent(new Event('ended')); assert.equal(ended, 0, 'the first file no longer hears the element');
 const c = new MusicFile(A, new Node(), { files: ['three.ogg'] }); assert.notEqual(c.el, b.el, 'a busy element is never shared'); assert.equal(sources.length, 2);
 for (let i = 0; i < 20; i++) { const x = new MusicFile(A, new Node(), { files: ['x.ogg'] }); x.stop(); }
 assert.equal(sources.length, 3, 'twenty more starts add one slot at most, not twenty'); b.stop(); c.stop();
});
