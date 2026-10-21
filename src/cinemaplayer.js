import { PLAYROOM } from './config.js';

// The official iframe is a separate viewing surface, never a WebGL texture.
// Discovery starts when the visitor opens the cinema; the player loads after film selection.
export function youtubeId(value) {
  const text = value.trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  let url;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  let id;
  if (host === 'youtu.be') id = url.pathname.slice(1);
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:embed|shorts|live)\/([^/]+)$/.exec(url.pathname)?.[1];
  }
  return /^[\w-]{11}$/.test(id ?? '') ? id : null;
}

export function youtubeError(code) {
  if (code === 101 || code === 150) return 'Ägaren tillåter inte att filmen visas här. Välj en annan film.';
  if (code === 100) return 'Filmen saknas eller är privat. Välj en annan film.';
  if (code === 153) return 'YouTube kunde inte godkänna visningsplatsen. Prova en annan film eller webbläsare.';
  if (code === 151) return 'YouTube begränsar den här filmen för ditt konto eller nätverk. Välj en annan film.';
  return `Filmen kunde inte spelas (YouTube-fel ${code}). Välj en annan film.`;
}

let apiPromise;
function youtubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const previous = window.onYouTubeIframeAPIReady;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.onYouTubeIframeAPIReady = previous;
      if (error) { script.remove(); apiPromise = null; reject(error); }
      else resolve(window.YT);
    };
    const timer = setTimeout(() => finish(new Error('timeout')), PLAYROOM.devices.videoTimeoutMs);
    window.onYouTubeIframeAPIReady = () => { try { previous?.(); } finally { finish(); } };
    script.onerror = () => finish(new Error('network'));
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.append(script);
  });
  return apiPromise;
}

export class CinemaPlayer {
  constructor(el, onClose, searchEndpoint = '', options = {}) {
    this.label=options.label??'Bion';this.place=options.place??'bioduken';
    this.el=el;this.onClose=onClose;this.searchEndpoint=searchEndpoint;
    this.generation=0;this.searchGeneration=0;this.inside=false;this.ready=false;
    this.status=el.querySelector('[role="status"]');this.input=el.querySelector('input');
    this.results=el.querySelector('[data-cinema="results"]');this.resultsTitle=el.querySelector('[data-cinema="results-title"]');
    this.playButton=el.querySelector('[data-cinema="play"]');this.pauseButton=el.querySelector('[data-cinema="pause"]');
    this.offButton=el.querySelector('[data-cinema="off"]');this.joinButton=el.querySelector('[data-cinema="join"]');
    this.watch=document.createElement('aside');this.watch.id=options.id?`watch-${options.id}`:'cinema-watch';this.watch.className='cinema-watch';this.watch.hidden=true;
    this.watchText=document.createElement('span');
    this.soundButton=document.createElement('button');this.soundButton.type='button';this.soundButton.textContent='Aktivera bild och ljud';
    this.watch.append(this.watchText,this.soundButton);document.body.append(this.watch);
    this.soundButton.addEventListener('click',e=>{e.stopPropagation();this.localStart();});
    this.joinButton.addEventListener('click',()=>this.localStart());
    el.querySelector('form').addEventListener('submit',e=>{e.preventDefault();this.search(this.input.value);});
    for(const button of el.querySelectorAll('[data-query]'))button.addEventListener('click',()=>{this.input.value=button.dataset.query;this.search(button.dataset.query);});
    this.playButton.addEventListener('click',()=>this.command('play'));
    this.pauseButton.addEventListener('click',()=>this.command('pause',{p:this.ready?this.player.getCurrentTime():this.position()}));
    this.offButton.addEventListener('click',()=>this.command('stop'));
    el.querySelector('[data-cinema="close"]').addEventListener('click',()=>this.close());
    for(const type of ['keydown','keyup'])el.addEventListener(type,e=>e.stopPropagation());
    el.addEventListener('cancel',e=>{e.preventDefault();this.close('Escape');});
    window.addEventListener('pagehide',()=>this.leave('pagehide'));
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.leave('hidden');});
    this.controls();
  }
  get open(){return this.el.open;}
  get connected(){return !!this.net?.ready();}
  get owns(){return this.connected&&this.state?.owner===this.net.id();}
  command(k,extra={}) {
    if(!this.connected){this.status.textContent=`${this.label} saknar anslutning. Försök igen när ni är anslutna.`;return false;}
    return this.net.send({t:'cinema',k,q:this.state?.q??0,...extra});
  }
  show() {
    if(this.open)return;
    this.wantsControl=true;this.el.showModal();this.input.focus();
    this.awaitingPresence=!this.state;this.status.textContent=`Begär kontroll över ${this.label}…`;this.command('claim');this.controls();
  }
  close(reason='button') {
    this.wantsControl=false;this.searchGeneration++;
    if(this.owns)this.command('release');
    if(this.open){this.el.close();this.onClose(reason);}
  }
  leave(reason='exit') {
    this.close(reason);this.inside=false;this.state=null;this.destroyMedia();this.watch.hidden=true;
  }
  stop(){this.command('stop');}
  destroyMedia() {
    this.generation++;clearTimeout(this.timer);this.ready=false;this.video=null;
    const player=this.player;this.player=null;
    try{player?.destroy();}catch{/* A vendor failure must not retain a viewing surface. */}
    this.surface?.mount.replaceChildren();this.surface?.show(false);
    this.controls();
  }
  controls() {
    const owns=this.owns;
    for(const field of this.el.querySelectorAll('form input,form button'))field.disabled=!owns;
    this.playButton.disabled=this.pauseButton.disabled=this.offButton.disabled=!owns||!this.state?.video;
    this.joinButton.disabled=!this.ready||!this.state?.video;this.soundButton.disabled=!this.ready;
  }
  position() {
    if(!this.state)return 0;
    return Math.min(PLAYROOM.cinemaSync.maxPosition,this.state.position+(this.state.playing?
      Math.max(0,(this.receivedServerNow-this.state.at)/1000)+(performance.now()-this.receivedAt)/1000:0));
  }
  receive(m) {
    if(!this.inside)return;
    if(m.k==='no') {
      if(m.why==='away'&&this.wantsControl)this.awaitingPresence=true;
      this.status.textContent=({owned:'Någon annan styr skärmen just nu.',owner:'Bara den som styr får ändra filmen.',stale:'Filmen har ändrats. Försök igen.',away:`Gå fram till ${this.place} för att välja film.`})[m.why]??'Bion kunde inte ändras.';
      return;
    }
    const s=m.s;
    if(m.k!=='state'||!s||!Number.isSafeInteger(s.q)||typeof s.video!=='string'||(s.video&&!/^[A-Za-z0-9_-]{11}$/.test(s.video))||
       !Number.isFinite(s.position)||!Number.isFinite(s.at)||!Number.isFinite(m.now)||typeof s.playing!=='boolean')return;
    if(this.state&&s.q<this.state.q)return;
    const hadControl=this.owns;
    this.state=s;
    if(this.awaitingPresence&&this.wantsControl&&!s.owner){this.awaitingPresence=false;this.command('claim');}
    this.receivedServerNow=m.now;this.receivedAt=performance.now();this.controls();
    if(this.owns&&!this.wantsControl)this.command('release');
    this.status.textContent=this.owns?`Du styr ${this.label}. Filmen visas på ${this.place}.`:s.owner?`${s.name} styr ${this.label}. Du tittar på samma film.`:`Ingen styr ${this.label} just nu.`;
    if(this.owns&&!hadControl&&this.open){this.input.focus();if(!this.results.childElementCount&&this.searchEndpoint)this.search('animerad kortfilm',true);}
    if(!s.video){this.destroyMedia();this.watch.hidden=true;return;}
    if(this.video!==s.video)this.load(s.video);
    else this.synchronize();
    this.watch.hidden=false;this.watchText.textContent=`${this.label} · ${s.playing?'Spelar':'Pausad'}${s.owner?` · ${s.name} styr`:''}`;
  }
  async search(query,suggestions=false) {
    if(!this.owns)return;
    const request=++this.searchGeneration;this.results.replaceChildren();
    const q=query.trim();
    this.resultsTitle.textContent=suggestions?'Förslag för filmkvällen':'Sökresultat';
    if(youtubeId(q)){this.choose(q);return;}
    if(q.length<2||q.length>80){this.status.textContent='Skriv minst två och högst 80 tecken.';return;}
    if(/youtube|youtu\.be/i.test(q)){this.status.textContent='Det där är ingen giltig YouTube-film.';return;}
    if(!this.searchEndpoint){this.status.textContent='Filmsökningen är inte tillgänglig just nu.';return;}
    this.status.textContent='Söker på YouTube…';
    try{
      const url=new URL(this.searchEndpoint,location.href);url.searchParams.set('q',q);
      const response=await fetch(url,{signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error('search');
      const data=await response.json();
      if(!this.open||!this.owns||request!==this.searchGeneration)return;
      if(!Array.isArray(data.items))throw Error('search');
      for(const item of data.items){
        if(!/^[A-Za-z0-9_-]{11}$/.test(item.id)||typeof item.title!=='string'||typeof item.channel!=='string')continue;
        const button=document.createElement('button');button.type='button';button.className='cinema-result';
        const img=document.createElement('img');img.src=`https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';
        const caption=document.createElement('span');caption.textContent=`${item.title} · ${item.channel}`;button.append(img,caption);
        button.addEventListener('click',()=>{if(this.owns){this.input.value=item.id;this.choose(item.id);}});this.results.append(button);
      }
      this.status.textContent=this.results.childElementCount?`Välj vad alla ska se på ${this.place}.`:'Inga filmer hittades.';
    }catch{if(this.open&&this.owns&&request===this.searchGeneration)this.status.textContent='Filmsökningen kunde inte nås. Försök igen.';}
  }
  choose(value) {
    const id=youtubeId(value);
    if(!id){this.status.textContent='Klistra in en giltig YouTube-länk eller ett video-id.';return;}
    if(this.owns)this.command('select',{v:id});
  }
  async load(id) {
    this.destroyMedia();this.video=id;this.failed=false;this.ended=false;this.soundButton.hidden=!!this.soundEnabled;
    const generation=this.generation,current=()=>this.inside&&this.video===id&&generation===this.generation;
    try{
      const YT=await youtubeAPI();if(!current())return;
      const frame=document.createElement('iframe');
      frame.title=`Gemensam film på ${this.place}`;frame.width=this.surface.pixelWidth;frame.height=this.surface.pixelHeight;
      frame.allow='autoplay; encrypted-media';frame.referrerPolicy='strict-origin-when-cross-origin';frame.style.cssText='display:block;width:100%;height:100%;border:0;pointer-events:none';
      const url=new URL(`https://www.youtube-nocookie.com/embed/${id}`);
      url.search=new URLSearchParams({enablejsapi:'1',origin:location.origin,playsinline:'1',autoplay:'1',mute:'1',controls:'0',disablekb:'1'});
      frame.src=url.href;this.surface.mount.append(frame);this.surface.show(true);
      this.timer=setTimeout(()=>{if(current()&&!this.ready){this.status.textContent='YouTube svarar inte. Välj film igen eller kontrollera anslutningen.';this.watchText.textContent=this.status.textContent;}},PLAYROOM.devices.videoTimeoutMs);
      this.player=new YT.Player(frame,{events:{
        onReady:()=>{if(!current())return;clearTimeout(this.timer);this.ready=true;if(this.soundEnabled)this.player.unMute();else this.player.mute();this.synchronize();this.controls();},
        onStateChange:e=>{if(!current())return;if(e.data===0){this.ended=true;this.watchText.textContent=`${this.label} · Filmen är slut.`;}},
        onAutoplayBlocked:()=>{if(current()){this.soundButton.hidden=false;this.watchText.textContent=`${this.label} · Aktivera bild och ljud för att följa filmen.`;}},
        onError:e=>{if(current()){clearTimeout(this.timer);this.failed=true;this.status.textContent=youtubeError(e.data);this.watchText.textContent=this.status.textContent;}},
      }});
    }catch{if(current()){this.failed=true;this.status.textContent='YouTube kunde inte nås. Försök igen.';this.watchText.textContent=this.status.textContent;}}
  }
  synchronize() {
    if(!this.ready||!this.player||!this.state?.video||this.failed||this.ended)return;
    const target=this.position();
    if(Math.abs(this.player.getCurrentTime()-target)>PLAYROOM.cinemaSync.driftSeconds)this.player.seekTo(target,true);
    const state=this.player.getPlayerState();
    if(this.state.playing&&state!==1&&state!==3)this.player.playVideo();
    else if(!this.state.playing&&state!==2)this.player.pauseVideo();
  }
  localStart() {
    if(!this.ready)return;
    this.soundEnabled=true;this.player.seekTo(this.position(),true);this.player.unMute();
    if(this.state?.playing)this.player.playVideo();else this.player.pauseVideo();
    this.soundButton.hidden=true;
  }
  update(inside,camera,renderer) {
    if(!inside){if(this.inside)this.leave();return;}
    if(!this.inside){this.inside=true;this.command('get');}
    const connected=this.connected;
    if(this.wasConnected!==connected){
      this.wasConnected=connected;
      if(connected)this.command('get');
      else{this.wantsControl=false;this.awaitingPresence=false;this.destroyMedia();this.state=null;this.watch.hidden=true;this.status.textContent=`${this.label} väntar på anslutning till de andra spelarna.`;}
      this.controls();
    }
    this.surface?.update(camera,renderer);
    if(performance.now()-(this.lastSync??0)>PLAYROOM.cinemaSync.syncEveryMs){this.lastSync=performance.now();this.synchronize();}
  }
}
