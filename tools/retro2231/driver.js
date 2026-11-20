// Original #2231 standalone proof; MIT, see LICENSE. No production imports.
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),image=ctx.createImageData(256,240),pixels=new Uint32Array(image.data.buffer);
const status=document.querySelector('#status'),start=document.querySelector('#start'),pause=document.querySelector('#pause'),leave=document.querySelector('#leave');
let nes=null,running=false,loading=false,raf=0,last=0,accumulated=0,frames=0,times=[],loadPromise;
const release=()=>{if(nes)for(let i=0;i<8;i++)nes.buttonUp(1,i);};
function stop(){running=false;cancelAnimationFrame(raf);raf=0;last=0;accumulated=0;release();pause.textContent='Fortsätt';}
function tick(now){
 if(!running)return;raf=requestAnimationFrame(tick);if(!last){last=now;return;}
 const step=1000/60;
 // Carry fractional time across rAF jitter; discard long stalls, at most 3 steps.
 accumulated=Math.min(accumulated+Math.max(0,now-last),3*step);last=now;
 while(accumulated>=step){
  accumulated-=step;const t=performance.now();nes.frame();ctx.putImageData(image,0,0);
  times.push(performance.now()-t);if(times.length>600)times.shift();frames++;
  if(frames%15===0)status.textContent=`Poäng ${nes.cpu.mem[2]} · ${frames} NES-bilder · P pausa, Esc / E lämna`;
 }
}
function resume(){if(!nes||document.hidden)return;running=true;pause.textContent='Pausa';last=0;raf=requestAnimationFrame(tick);}
start.onclick=async()=>{if(loading)return;stop();loading=true;start.disabled=true;try{
 loadPromise??=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./vendor/jsnes.js';s.onload=resolve;s.onerror=()=>reject(Error('Emulatorn kunde inte laddas'));document.head.append(s);});await loadPromise;
 const data=new Uint8Array(await(await fetch('./lightcatch.nes')).arrayBuffer());
 nes=new window.jsnes.NES({emulateSound:false,onFrame:buffer=>{for(let i=0;i<buffer.length;i++)pixels[i]=0xff000000|buffer[i];}});
 nes.loadROM(Array.from(data,b=>String.fromCharCode(b)).join(''));frames=0;times=[];pause.disabled=leave.disabled=false;resume();
}catch(e){loadPromise=undefined;status.textContent=e.message;}finally{loading=false;start.disabled=false;}};
pause.onclick=()=>{if(running){stop();status.textContent='Pausad · välj Fortsätt';}else resume();};
leave.onclick=()=>{stop();nes=null;pause.disabled=leave.disabled=true;status.textContent='Lämnad · emulatorn kör inte';};
const keys={ArrowUp:4,ArrowDown:5,ArrowLeft:6,ArrowRight:7,KeyZ:0,KeyX:1,ShiftRight:2,Enter:3};
for(const type of ['keydown','keyup'])addEventListener(type,e=>{if(e.code==='Escape'||e.code==='KeyE'){if(type==='keydown')leave.click();return;}if(e.code==='KeyP'&&type==='keydown'&&!e.repeat){pause.click();return;}if(e.code in keys&&running){e.preventDefault();nes[type==='keydown'?'buttonDown':'buttonUp'](1,keys[e.code]);}});
for(const b of document.querySelectorAll('[data-key]')){b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);if(running)nes.buttonDown(1,+b.dataset.key);};for(const t of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(t,()=>nes?.buttonUp(1,+b.dataset.key));}
for(const t of ['blur','pagehide'])addEventListener(t,()=>{stop();if(nes)status.textContent='Pausad · välj Fortsätt';});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();if(nes)status.textContent='Pausad · välj Fortsätt';}});
window.retroProbe={snapshot:()=>({running,frames,ram:nes?Array.from(nes.cpu.mem.slice(0,4)):null,times:[...times]}),benchmark:(n=180)=>{if(!nes)throw Error('Start first');stop();const values=[];for(let i=0;i<n;i++){const t=performance.now();nes.frame();ctx.putImageData(image,0,0);values.push(performance.now()-t);}return values;}};
