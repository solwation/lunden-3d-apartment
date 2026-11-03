import {FOOTBALL as C,HOLD} from './config.js';
import {sfx} from './audio.js';
/** Direct fountain drinking is an ordinary timed Life action; no new needs/health or score rule. */
export function footballDrinking(life,site,release=()=>{},now=()=>Date.now()){
 let last=-Infinity;const target=site.fountain;
 life.actions.define({id:'footballDrink',order:0,duration:C.fountain.drinkSeconds,label:'Drick direkt ur fontänen',
  applies:c=>c.raw===target,
  check:c=>c.heldView?'Lägg ifrån dig det du håller först':c.life.camera.position.distanceTo(target.position)>HOLD.reach?'För långt bort':now()-last<C.fountain.everyMs?'Vänta lite mellan klunkarna':null,
  animate:()=>{release();target.stream.visible=true;},
  commit:()=>{last=now();life.bump('water',1);life.emit('drank',{drink:'water',ml:C.fountain.ml,source:'football-fountain'});sfx.gulp(target.position);return C.fountain.ml;},
  done:()=>{target.stream.visible=false;},cancel:()=>{target.stream.visible=false;},
  consumes:'one direct sip of ordinary tap water',result:'the existing water statistic and drank event',
 });
 target.options=()=>life.options(target);Object.defineProperties(target,{blocked:{get:()=>!target.options().some(a=>!a.reason)},blockedText:{get:()=>target.options().find(a=>a.reason)?.reason??''}});
 return target;
}
