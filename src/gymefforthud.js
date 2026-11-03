// #1836: an exercise-only touch surface; ordinary look/stick controls are suppressed by main's Touch gate.
import { GymStroke } from './gymeffort.js';
export class GymEffortHUD {
  constructor({gym,rest,allowed,touch}){
    Object.assign(this,{gym,rest,allowed,touch,pointer:null,stroke:new GymStroke()});
    this.root=document.getElementById('gym-effort');this.title=this.root.querySelector('[data-gym-title]');
    this.meter=this.root.querySelector('[role=progressbar]');this.fill=this.meter.firstElementChild;
    this.hint=this.root.querySelector('[data-gym-hint]');this.pad=this.root.querySelector('[data-gym-pad]');
    this.pad.addEventListener('pointerdown',e=>{
      if(!this.touch()||!this.allowed()||this.pointer!==null||!['touch','pen'].includes(e.pointerType))return;
      e.preventDefault();e.stopPropagation();this.pointer=e.pointerId;this.stroke.begin(e.clientY);this.pad.setPointerCapture(e.pointerId);
    });
    this.pad.addEventListener('pointermove',e=>{
      if(e.pointerId!==this.pointer)return;e.preventDefault();e.stopPropagation();
      if(this.allowed()&&this.stroke.move(e.clientY))this.gym.exert(this.rest);
    });
    const end=e=>{if(e.pointerId!==this.pointer)return;e.preventDefault();e.stopPropagation();this.pointer=null;this.stroke.reset();};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])this.pad.addEventListener(event,end);
  }
  update(show){
    this.root.hidden=!show;
    if(!show){this.pointer=null;this.stroke.reset();return;}
    const percent=Math.round((this.gym.effort?.level??0)*100),ready=this.rest.t>=1,top=this.gym.effort?.peaked;
    if(this.title.textContent!==this.gym.status)this.title.textContent=this.gym.status;this.meter.setAttribute('aria-valuenow',percent);this.fill.style.transform=`scaleX(${percent/100})`;
    this.root.dataset.top=top?'true':'false';this.pad.hidden=!this.touch();
    const course=this.gym.active?.route;
    const hint=course?(course.distance>=course.length*2-1e-8?'Rundan klar! Fyll kraften och släpp helt för en repetition.':this.touch()?'Dra upp och ner för aktiva steg ut och tillbaka.':'Tryck F för aktiva steg ut och tillbaka; E avslutar.') : !ready?'Gör dig redo…':top?'Toppen nådd! Släpp ner helt för en repetition.':this.touch()?'Dra upp och ner i rutan. Varje vändning ger kraft.':'Tryck F snabbt flera gånger för att ta i. Släpp för att sänka.';
    if(this.hint.textContent!==hint)this.hint.textContent=hint;
    this.root.querySelector('[data-gym-exit]').textContent=this.touch()?'Avsluta med knappen till höger.':'E / mellanslag / C: avsluta träningen';
  }
}
