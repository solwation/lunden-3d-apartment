import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayroomMusic } from '../src/playroommusic.js';
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
 const m=new PlayroomMusic();m.setInside(true);m.play();m.pause();let reject;m.file.el.play=()=>new Promise((_,r)=>reject=r);m.play();m.stop();m.play();const next=m.file;reject(Error('old refusal'));await Promise.resolve();assert.equal(m.file,next);
 m.file.failed();await Promise.resolve();assert.equal(m.file,null);assert.equal(m.state,'off');m.dispose();
});

test('pause during pending initial play never retries/poisons files, even when resume precedes AbortError', async()=>{
 const { MusicFile, failedFiles }=await import('../src/music.js');const Original=globalThis.Audio;let pending=[], plays=0;
 globalThis.Audio=class extends Original {play(){plays++;this.paused=false;return new Promise((resolve,reject)=>pending.push({resolve,reject}))}};
 try { const file=new MusicFile(audioParts(),new Node(),{files:['test-delayed.ogg','test-delayed.mp3']});const el=file.el;file.pause();file.resume();pending[0].reject(Object.assign(Error('interrupted'),{name:'AbortError'}));await Promise.resolve();assert.equal(file.el,el);assert.equal(file.src,'test-delayed.ogg');assert.equal(failedFiles.has('test-delayed.ogg'),false);assert.equal(plays,2);
 file.pause();pending[1].reject(Object.assign(Error('interrupted'),{name:'AbortError'}));await Promise.resolve();assert.equal(file.el,el);assert.equal(file.paused,true);assert.equal(plays,2);file.resume();file.stop();pending[2].reject(Object.assign(Error('removed'),{name:'AbortError'}));await Promise.resolve();assert.equal(file.el,null);assert.equal(plays,3);assert.equal(failedFiles.has('test-delayed.ogg'),false);
 }finally{globalThis.Audio=Original}
});
test('genuine decode fallback stays paused; ordinary appliance transport still starts and releases',async()=>{
 const { MusicFile, failedFiles }=await import('../src/music.js');
 const f=new MusicFile(audioParts(),new Node(),{files:['test-failed.ogg','test-good.mp3']});f.pause();f.el.dispatchEvent(new Event('error'));assert.equal(f.src,'test-good.mp3');assert.equal(f.el.paused,true);assert.equal(f.paused,true);assert.equal(failedFiles.has('test-failed.ogg'),true);f.resume();assert.equal(f.el.paused,false);f.stop();
 const appliance=new MusicFile(audioParts(),new Node(),{files:['test-appliance.ogg']});assert.equal(appliance.el.paused,false);assert.equal(appliance.paused,false);appliance.stop();assert.equal(appliance.el,null);
});
