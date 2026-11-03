import { CAT_CARD } from './config.js';
// #1848: model-driven collection UI. Discovery/storage/model rendering belong to their providers, never to this panel.
const text=(tag,cls='',value='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=String(value??'');return n;};
const button=(label,act,id)=>{const n=text('button','',label);n.type='button';n.dataset.act=act;if(id)n.dataset.id=id;return n;};
const number=n=>Number(n||0).toLocaleString('sv-SE');
const date=n=>Number.isFinite(n)&&n>0?new Date(n).toLocaleDateString('sv-SE',{year:'numeric',month:'short',day:'numeric'}):'Inte ännu';
const code=n=>`#${String(n).padStart(3,'0')}`;
const actionNames={pet:'Klappningar',hug:'Kramar',feed:'Matningar',catch:'Fångster',scare:'Skrämningar',greet:'Hälsningar'};
export class BinderPanel {
  constructor({registry,collection,images},el){
    Object.assign(this,{registry,collection,images,el,open:false,selected:null,mode:'grid',photo:null,generation:0,queue:[],busy:false});
    this.body=el.querySelector('.dex-body');this.counts=el.querySelector('.dex-counts');this.status=el.querySelector('.dex-status');this.nav=el.querySelector('.dex-nav');this.photoBox=el.querySelector('.dex-photo');
    this.tab=e=>{if(!this.open||e.key!=='Tab')return;const root=this.photo?this.photoBox:el,all=[...root.querySelectorAll('button:not([disabled]),[tabindex="0"]')].filter(n=>n.getClientRects().length);if(!all.length)return;const i=all.indexOf(document.activeElement);if(e.shiftKey&&i<=0||!e.shiftKey&&(i<0||i===all.length-1)){e.preventDefault();e.stopPropagation();all[e.shiftKey?all.length-1:0].focus();}};
    el.addEventListener('click',e=>{const b=e.target.closest('button[data-act]');if(!b)return;const a=b.dataset.act,id=b.dataset.id;if(a==='entry')this.detail(id);else if(a==='grid')this.grid();else if(a==='prev')this.step(-1);else if(a==='next')this.step(1);else if(a==='photo')this.showPhoto(id);else if(a==='photo-back')this.closePhoto();});
  }
  list(){return this.registry.list();}
  record(id){return this.collection.get(id)||{};}
  show(show){
    if(this.open===show)return;this.open=show;this.el.hidden=!show;this.photo=null;this.photoBox.hidden=true;
    if(show){this.mode='grid';this.body.scrollTop=0;this.offRegistry=this.registry.subscribe(()=>{if(this.open)this.render();});this.offCollection=this.collection.subscribe(()=>{if(this.open)this.render();});window.addEventListener('keydown',this.tab,true);this.render();this.focus(`[data-act=entry]`);}
    else{this.clearImages();this.offRegistry?.();this.offCollection?.();window.removeEventListener('keydown',this.tab,true);}
  }
  dispose(){this.show(false);this.clearImages();}
  back(){if(this.photo){this.closePhoto();return true;}if(this.mode==='detail'){this.grid();return true;}return false;}
  focus(selector){this.el.querySelector(selector)?.focus({preventScroll:true});}
  detail(id){if(!this.list().some(e=>e.id===id))return;this.selected=id;this.mode='detail';this.photo=null;this.photoBox.hidden=true;this.body.scrollTop=0;this.render();this.focus('[data-act=grid]');}
  grid(){this.mode='grid';this.photo=null;this.photoBox.hidden=true;this.render();const tile=[...this.body.querySelectorAll('[data-act=entry]')].find(n=>n.dataset.id===this.selected);tile?.focus({preventScroll:true});tile?.scrollIntoView({block:'nearest'});}
  step(d){const entries=this.list(),i=entries.findIndex(e=>e.id===this.selected);this.detail(entries[Math.max(0,Math.min(entries.length-1,i+d))]?.id);}
  key(key){
    if(this.photo)return false;
    if(this.mode==='detail'){if(['ArrowRight','KeyD','PageDown'].includes(key))this.step(1);else if(['ArrowLeft','KeyA','PageUp'].includes(key))this.step(-1);else if(key==='Home')this.detail(this.list()[0]?.id);else if(key==='End')this.detail(this.list().at(-1)?.id);else return false;return true;}
    const keys=['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End'];if(!keys.includes(key))return false;
    const tiles=[...this.body.querySelectorAll('[data-act=entry]')],at=Math.max(0,tiles.indexOf(document.activeElement));let next=at;
    if(key==='Home')next=0;else if(key==='End')next=tiles.length-1;else if(key==='ArrowRight')next++;else if(key==='ArrowLeft')next--;else{const current=tiles[at],group=current?.parentElement,cols=group?getComputedStyle(group).gridTemplateColumns.split(' ').length:1;next+=key==='ArrowDown'?cols:-cols;}
    tiles[Math.max(0,Math.min(tiles.length-1,next))]?.focus();return true;
  }
  clearImages(){this.generation++;this.observer?.disconnect();this.queue=[];this.visible=new Set();}
  image(id,size,unknown=false){
    const box=text('div',`dex-art${unknown?' silhouette':''}`),img=document.createElement('img'),waiting=text('span','dex-image-wait','…');img.width=size;img.height=size;img.alt='';img.decoding='async';img.hidden=true;box.append(img,waiting);
    const job={id,size,img,box,generation:this.generation};this.jobs.set(box,job);this.observer?this.observer.observe(box):this.enqueue(job);return box;
  }
  enqueue(job){if(this.visible.has(job.img))return;this.visible.add(job.img);this.queue.push(job);queueMicrotask(()=>this.pump());}
  pump(){
    if(this.busy||!this.open)return;let job;
    while(this.queue.length){const next=this.queue.shift();if(next.generation===this.generation&&next.img.isConnected&&this.visible.has(next.img)){job=next;break;}}
    if(!job)return;this.busy=true;
    const run=async()=>{try{if(!this.open||job.generation!==this.generation||!this.visible.has(job.img))return;const data=await this.images.get(job.id,job.size);if(this.open&&job.generation===this.generation&&job.img.isConnected){job.img.src=data;job.img.hidden=false;job.box.classList.add('loaded');}}catch{if(job.generation===this.generation)job.box.querySelector('.dex-image-wait').textContent='?';}finally{this.busy=false;if(this.open)requestAnimationFrame(()=>this.pump());}};
    if(globalThis.requestIdleCallback)requestIdleCallback(run,{timeout:250});else setTimeout(run,0);
  }
  rarity(entry){const r=entry.rarity||{},badge=text('span','dex-rarity',`${r.level?'★'.repeat(r.level)+' ':''}${r.label||'Vanlig'}`);badge.style.setProperty('--rarity',r.color||'#8a93a6');return badge;}
  render(){
    if(!this.open)return;const focused=document.activeElement?.dataset,focusId=focused?.id,focusAct=focused?.act,scroll=this.body.scrollTop;this.clearImages();this.jobs=new WeakMap();
    if(globalThis.IntersectionObserver)this.observer=new IntersectionObserver(entries=>{for(const e of entries){const job=this.jobs.get(e.target);if(!job)continue;if(e.isIntersecting)this.enqueue(job);else this.visible.delete(job.img);}},{root:this.body,rootMargin:'96px'});
    const summary=this.collection.summary();this.counts.replaceChildren();
    for(const[k,label]of[['found','Hittade'],['seen','Sedda']]){const n=Number(summary[k]||0),total=Number(summary.total||0),item=text('div','dex-count');item.append(text('span','',label),text('strong','',`${number(n)} / ${number(total)}`),text('small','',`${total?Math.floor(n/total*100):0} %`));this.counts.append(item);}
    this.status.textContent=this.collection.error||'';this.status.hidden=!this.collection.error;this.body.replaceChildren();this.nav.replaceChildren();
    if(this.mode==='grid')this.renderGrid(summary);else this.renderDetail();this.body.scrollTop=scroll;
    if(focusAct){const found=[...this.el.querySelectorAll('button[data-act]')].find(n=>n.dataset.act===focusAct&&n.dataset.id===focusId);found?.focus({preventScroll:true});}
    if(this.photo)this.renderPhoto();
  }
  renderGrid(summary){
    const groups=new Map();for(const entry of this.list()){const id=entry.family.id;if(!groups.has(id))groups.set(id,{family:entry.family,entries:[]});groups.get(id).entries.push(entry);}
    for(const{id,label,order}of[...groups.values()].map(g=>g.family).sort((a,b)=>a.order-b.order)){
      const group=groups.get(id),section=text('section','dex-family'),head=text('div','dex-family-head'),progress=summary.families?.find(f=>f.id===id)||{},complete=progress.seen===progress.total&&progress.total>0;head.append(text('h3','',label),text('span',complete?'dex-complete':'',`${number(progress.seen)} / ${number(progress.total||group.entries.length)} sedda · ${number(progress.found)} hittade${complete?' · Alla sedda, komplett ✓':''}`));section.append(head);const grid=text('div','dex-grid');
      for(const entry of group.entries){const r=this.record(entry.id),b=button('', 'entry',entry.id);b.className=`dex-tile${r.found?' found':r.seen?' seen':' unknown'}`;b.style.setProperty('--rarity',entry.rarity?.color||'#8a93a6');b.setAttribute('aria-label',`${code(entry.no)} ${r.seen?entry.name:'Oupptäckt'} · ${r.found?'Hittad':r.seen?'Sedd':'Okänd'}`);b.append(this.image(entry.id,96,!r.seen),text('span','dex-number',code(entry.no)),text('strong','dex-name',r.seen?entry.name:'???'),this.rarity(entry),text('small','dex-state',r.found?'✓ Hittad':r.seen?entry.interactive===false?'◉ Sedd · sedd-post':'◉ Sedd':'? Oupptäckt'));grid.append(b);}section.append(grid);this.body.append(section);
    }
  }
  renderDetail(){
    const entries=this.list(),index=entries.findIndex(e=>e.id===this.selected);if(index<0){this.mode='grid';this.renderGrid(this.collection.summary());return;}
    const back=button('← Alla djur','grid'),prev=button('← Förra','prev'),next=button('Nästa →','next');prev.disabled=index===0;next.disabled=index===entries.length-1;this.nav.append(back,prev,text('span','dex-position',`${index+1} / ${entries.length}`),next);
    const spread=text('div','dex-spread');spread.append(this.card(entries[index]));if(entries[index+1]){const adjacent=this.card(entries[index+1]);adjacent.classList.add('dex-next-card');spread.append(adjacent);}this.body.append(spread);
  }
  card(entry){
    const r=this.record(entry.id),card=text('article','card dex-card'),head=text('header','dex-card-head');card.style.setProperty('--rarity',entry.rarity?.color||'#8a93a6');head.append(text('span','dex-number',code(entry.no)),text('h3','',r.seen?entry.name:'Oupptäckt'),this.rarity(entry));card.append(head,this.image(entry.id,320,!r.seen),text('p','dex-family-name',`${entry.family.label}${r.seen&&entry.variant?' · '+entry.variant:''}`));
    if(r.seen){if(entry.interactive===false)card.append(text('p','dex-observe-only','Sedd-post: den här varelsen upptäcks genom att synas. Den har inget eget fyndmoment.'));const info=text('section','dex-info');info.append(text('h4','','Information'));const dl=text('dl');for(const[k,label]of[['size','Storlek'],['weight','Vikt'],['where','Plats'],['when','När'],['likes','Tycker om']])if(entry.info?.[k])dl.append(text('dt','',label),text('dd','',Array.isArray(entry.info[k])?entry.info[k].join(' – '):entry.info[k]));info.append(dl);card.append(info);for(const fact of(entry.facts||[]).slice(0,2))card.append(text('p','dex-fact',fact));
      const stats=text('section','dex-stats');stats.append(text('h4','','Dina möten'));const list=text('dl');for(const[k,v]of[['Första mötet',date(r.firstSeen)],['Sedd',number(r.seenCount)],['Hittad',number(r.foundCount)]])list.append(text('dt','',k),text('dd','',v));for(const[k,label]of Object.entries(actionNames))if(r.actions?.[k])list.append(text('dt','',label),text('dd','',number(r.actions[k])));if(r.best?.cm)list.append(text('dt','','Längsta fångst'),text('dd','',`${number(r.best.cm)} cm`));if(r.best?.kg)list.append(text('dt','','Tyngsta fångst'),text('dd','',`${number(r.best.kg)} kg`));stats.append(list);card.append(stats);
      const photos=text('section','dex-photos');photos.append(text('h4','','Mötesfoton'));if(r.photos?.length){const strip=text('div','dex-photo-strip');for(const photo of r.photos){const b=button('','photo',`${entry.id}|${photo.id}`),img=document.createElement('img');img.src=photo.data;img.alt=`Mötesfoto, ${date(photo.time)}`;img.loading='lazy';b.append(img);strip.append(b);}photos.append(strip);}else photos.append(text('p','','Inga mötesfoton ännu.'));card.append(photos);
    }else card.append(text('p','dex-unknown-note','Du har inte sett den här varelsen ännu. Silhuetten visar vad som återstår att upptäcka.'));
    if(entry.chain?.length){const chain=text('section','dex-chain');chain.append(text('h4','','Former och utveckling'));const row=text('div','dex-chain-row');entry.chain.forEach((id,i)=>{const e=this.list().find(e=>e.id===id);if(!e)return;const b=button('','entry',id),known=!!this.record(id).seen;b.className='dex-chain-link';if(id===entry.id)b.setAttribute('aria-current','true');b.append(this.image(id,96,!known),text('span','',`${code(e.no)} ${known?e.name:'???'}`));if(i)row.append(text('span','dex-chain-arrow','→'));row.append(b);});chain.append(row);card.append(chain);}
    decorate(card,entry.rarity?.level||0);return card;
  }
  showPhoto(key){const split=key.indexOf('|'),entryId=key.slice(0,split),photoId=key.slice(split+1),photo=this.record(entryId).photos?.find(p=>String(p.id)===photoId);if(!photo)return;this.photo={entryId,photoId};this.renderPhoto();this.focus('[data-act=photo-back]');}
  renderPhoto(){const p=this.record(this.photo.entryId).photos?.find(p=>String(p.id)===this.photo.photoId);if(!p){this.closePhoto();return;}const img=this.photoBox.querySelector('img');img.src=p.data;img.alt=`Mötesfoto, ${date(p.time)}`;this.photoBox.querySelector('.dex-photo-caption').textContent=date(p.time);this.photoBox.hidden=false;}
  closePhoto(){const key=this.photo?`${this.photo.entryId}|${this.photo.photoId}`:null;this.photo=null;this.photoBox.hidden=true;const b=[...this.el.querySelectorAll('[data-act=photo]')].find(b=>b.dataset.id===key);b?.focus({preventScroll:true});}
}
function decorate(card,level){
  const fx=CAT_CARD.fx,kind=fx.level[level]||0;card.classList.add(`fx-${kind}`);if(kind<2)return;
  for(const name of['foil','shine',...(kind>=3?['glitter','holo']:[])]){const layer=text('span',`fx ${name}`);layer.setAttribute('aria-hidden','true');card.append(layer);}
  const stars=fx.stars[level]||0;for(let i=0;i<stars;i++){const star=text('span','fx star-fx','★');star.setAttribute('aria-hidden','true');const angle=i*2.39996;star.style.cssText=`left:${50+46*Math.cos(angle)}%;top:${50+46*Math.sin(angle)}%;animation-delay:${-i*.3}s`;card.append(star);}
}
