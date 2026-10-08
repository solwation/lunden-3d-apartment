// Own 24 px outline drawings: one stroke, no emoji/font dependency or icon library (#525).
const paths={
 sofa:'<path d="M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M5 17v2m14-2v2M5 12h14M4 10a2 2 0 0 0-2 2v5h20v-5a2 2 0 0 0-4 0v3H6v-3a2 2 0 0 0-2-2Z"/>',
 ruler:'<path d="m4 16 12-12 4 4L8 20Zm3-3 2 2m1-5 2 2m1-5 2 2"/>',
 crouch:'<circle cx="13" cy="4" r="2"/><path d="m11 8-3 4 6 3-5 6m2-13 4 3 4 1m-5 3 4 4h4"/>',
 stats:'<path d="M3 3v18h18M7 17v-5m5 5V6m5 11v-8"/>',
 power:'<path d="M12 2v9m-5-7a9 9 0 1 0 10 0"/>',
 rotate:'<path d="M20 8a8 8 0 1 0 0 8m0-13v5h-5"/>',
 up:'<path d="m5 10 7-7 7 7M12 3v18"/>',down:'<path d="m5 14 7 7 7-7M12 3v18"/>',
 left:'<path d="m15 5-7 7 7 7"/>',right:'<path d="m9 5 7 7-7 7"/>',
 pause:'<path d="M8 5v14m8-14v14"/>',play:'<path d="m8 4 12 8-12 8Z"/>',
 volume:'<path d="M11 4 5 9H2v6h3l6 5Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
 'volume-off':'<path d="M11 4 5 9H2v6h3l6 5Zm5 5 6 6m0-6-6 6"/>',
 'volume-down':'<path d="M11 4 5 9H2v6h3l6 5Zm5 8h6"/>',
 'volume-up':'<path d="M11 4 5 9H2v6h3l6 5Zm5 8h6m-3-3v6"/>',
 terminal:'<path d="m4 5 7 7-7 7m9 0h7"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',
 previous:'<path d="M4 5v14m15-14-11 7 11 7Z"/>',next:'<path d="M20 5v14M5 5l11 7-11 7Z"/>',
 rewind:'<path d="m11 5-8 7 8 7Zm10 0-8 7 8 7Z"/>',forward:'<path d="m3 5 8 7-8 7Zm10 0 8 7-8 7Z"/>',
 pin:'<path d="m9 3 10 3-4 5v5l-8-3 3-4Zm2 12-5 7"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
 basketball:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6c6 1 6 11.8 0 12.8m12.8-12.8c-6 1-6 11.8 0 12.8"/>',
 rocket:'<path d="M8 16c0-8 4-12 8-13 1 4 0 10-5 14Zm0-7-4 2-1 6 5-2m7-1 1 4-5 3-1-4m-4 2-3 3"/><circle cx="12" cy="8" r="1.5"/>',
 vacuum:'<path d="M5 20h10v-5H5Zm5-5V7a4 4 0 0 1 8 0v7m0-4h3v10m-2 0h4"/>',
};
export function setIcon(button,name,label) {
 if(!button)return;
 if(button.dataset.hudIcon!==name||!button.querySelector('.hud-icon')){
   button.innerHTML=`<svg class="hud-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
   button.dataset.hudIcon=name;
 }
 button.classList.add('hud-button','hud-icon-button');
 if(label&&button.getAttribute('aria-label')!==label)button.setAttribute('aria-label',label);
 const title=label??button.getAttribute('aria-label');if(title&&button.title!==title)button.title=title;
}
export function setTextIcon(button,name,text) {
 setIcon(button,name,text);button.classList.remove('hud-icon-button');button.replaceChildren(button.querySelector('.hud-icon'),document.createTextNode(' '+text));
}
export function setPressed(button,on) {
 if(!button)return;
 if(button?.getAttribute('aria-pressed')!==String(!!on)){button.setAttribute('aria-pressed',!!on);button.classList.toggle('on',!!on)}
}
export function initHudIcons() {
 const ids={'furniture-btn':'sofa','measure-btn':'ruler','crouch-btn':'crouch','stats-btn':'stats','power-btn':'power','turn-btn':'rotate','jet-up':'up','jet-down':'down',pause:'pause',mute:'volume','terminal-btn':'terminal'};
 for(const [id,icon] of Object.entries(ids))setIcon(document.getElementById(id),icon);
 const panels='#book-panel, #poster-panel, #cal-panel, #clock-panel, #blind-panel, #sonos-panel, #draw-panel, #terminal, #rearrange-help, #update, #board-view, #task-note';
 document.querySelectorAll(panels).forEach(el=>el.classList.add('hud-controls'));
 document.querySelectorAll('#hud button, '+panels.split(', ').map(p=>p+' button').join(', ')).forEach(b=>b.classList.add('hud-button'));
 document.querySelectorAll('button[aria-label="Stäng"]').forEach(b=>setIcon(b,'close'));
 for(const p of ['book','cal'])for(const [act,icon] of [['prev','left'],['next','right']])setIcon(document.querySelector('#'+p+'-panel [data-act='+act+']'),icon);
 for(const [act,icon] of [['prev','previous'],['next','next'],['down','volume-down'],['up','volume-up']])setIcon(document.querySelector('#sonos-panel [data-act='+act+']'),icon);
 for(const [act,icon] of [['back','rewind'],['fwd','forward']])setIcon(document.querySelector('#clock-panel [data-act='+act+']'),icon);
 const trash=document.querySelector('#poster-panel [data-act=throw]');setTextIcon(trash,'trash','Släng');
 for(const [id,icon] of [['jetpack','rocket'],['vacuum-hud','vacuum']]){const el=document.getElementById(id),holder=document.createElement('span');setIcon(holder,icon);holder.className='hud-indicator-icon';el.firstChild.replaceWith(holder)}
}
