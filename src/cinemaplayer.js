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
export function youtubeAPI() {
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
    this.offButton=el.querySelector('[data-cinema="off"]');
    this.watch=document.createElement('aside');this.watch.id=options.id?`watch-${options.id}`:'cinema-watch';this.watch.className='cinema-watch';this.watch.hidden=true;
    this.watchText=document.createElement('span');
    this.watch.append(this.watchText);document.body.append(this.watch);
    el.querySelector('form').addEventListener('submit',e=>{e.preventDefault();this.search(this.input.value);});
    for(const button of el.querySelectorAll('[data-query]'))button.addEventListener('click',()=>{this.input.value=button.dataset.query;this.search(button.dataset.query);});
    this.playButton.addEventListener('click',()=>this.command('play'));
    this.pauseButton.addEventListener('click',()=>this.command('pause',{p:this.ready?this.player.getCurrentTime():this.position()}));
    this.offButton.addEventListener('click',()=>this.command('stop'));
    for(const button of el.querySelectorAll('[data-cinema-seek]'))button.addEventListener('click',()=>this.seek(Number(button.dataset.cinemaSeek)*PLAYROOM.cinemaSync.seekSeconds));
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
    if(k==='release'&&this.releasePending)return true;
    const sent=this.net.send({t:'cinema',k,q:this.state?.q??0,...extra});
    if(sent&&k==='release')this.releasePending=true;
    return sent;
  }
  show() {
    if(this.activate()||this.open)return;
    this.wantsControl=true;this.el.showModal();this.input.focus();
    this.awaitingPresence=!this.state;this.status.textContent=`Begär kontroll över ${this.label}…`;this.command('claim');this.controls();
  }
  close(reason='button') {
    this.wantsControl=false;this.pendingSeek=undefined;this.searchGeneration++;
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
    for(const b of this.el.querySelectorAll('[data-cinema-seek]'))b.disabled=!owns||!this.state?.video;
  }
  position() {
    if(!this.state)return 0;
    return Math.min(PLAYROOM.cinemaSync.maxPosition,this.state.position+(this.state.playing?
      Math.max(0,(this.receivedServerNow-this.state.at)/1000)+(performance.now()-this.receivedAt)/1000:0));
  }
  receive(m) {
    if(!this.inside)return;
    if(m.k==='no') {
      this.pendingSeek=undefined;this.pendingVideo=null;this.surface?.loading(false);if(!this.open)this.wantsControl=false;
      if(m.why==='away'&&this.wantsControl)this.awaitingPresence=true;
      this.status.textContent=({off:'Starta datorn först.',owned:'Någon annan styr skärmen just nu.',owner:'Bara den som styr får ändra filmen.',stale:'Filmen har ändrats. Försök igen.',away:`Gå fram till ${this.place} för att välja film.`})[m.why]??'Bion kunde inte ändras.';
      return;
    }
    const s=m.s;
    if(m.k!=='state'||!s||!Number.isSafeInteger(s.q)||typeof s.video!=='string'||(s.video&&!/^[A-Za-z0-9_-]{11}$/.test(s.video))||
       !Number.isFinite(s.position)||!Number.isFinite(s.at)||!Number.isFinite(m.now)||typeof s.playing!=='boolean')return;
    if(this.state&&s.q<this.state.q)return;
    const hadControl=this.owns;
    if(this.ended&&s.position!==this.state?.position)this.ended=false;
    this.state=s;if(!this.owns)this.releasePending=false;
    if(this.pendingVideo===s.video)this.pendingVideo=null;
    if(this.awaitingPresence&&this.wantsControl&&!s.owner){this.awaitingPresence=false;this.command('claim');}
    this.receivedServerNow=m.now;this.receivedAt=performance.now();this.controls();
    if(this.owns&&this.pendingSeek!==undefined){const delta=this.pendingSeek;this.pendingSeek=undefined;this.seek(delta);if(!this.open)this.wantsControl=false;}
    if(this.owns&&!this.wantsControl)this.command('release');
    this.status.textContent=this.owns?`Du styr ${this.label}. Filmen visas på ${this.place}.`:s.owner?`${s.name} styr ${this.label}. Du tittar på samma film.`:`Ingen styr ${this.label} just nu.`;
    if(this.owns&&!hadControl&&this.open){this.input.focus();if(!this.results.childElementCount&&this.searchEndpoint)this.search('animerad kortfilm',true);}
    if(!s.video){this.destroyMedia();this.watch.hidden=true;return;}
    if(this.video!==s.video)this.load(s.video);
    else this.synchronize();
    this.updateWatch();this.watchText.textContent=`${this.label} · ${s.playing?'Spelar':'Pausad'}${s.owner?` · ${s.name} styr`:''}`;
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
    if(this.owns&&this.command('select',{v:id})){
      this.soundEnabled=true;this.pendingVideo=id;this.surface?.show(true);this.surface?.loading(true);this.watch.hidden=true;
      this.close('selected');
    }
  }
  seek(delta) {
    if(!this.owns||!this.state?.video||!Number.isFinite(delta))return false;
    const duration=this.ready?this.player.getDuration():0,max=duration>0?Math.min(duration,PLAYROOM.cinemaSync.maxPosition):PLAYROOM.cinemaSync.maxPosition;
    this.ended=false;
    return this.command('seek',{p:Math.max(0,Math.min(max,this.position()+delta))});
  }
  remoteSeek(delta) {
    if(!this.connected||!this.state?.video||this.state.owner&&!this.owns)return false;
    if(this.owns)return this.seek(delta);
    if(this.pendingSeek!==undefined)return false;
    this.pendingSeek=delta;this.wantsControl=true;
    return this.command('claim');
  }
  updateWatch(){this.watch.hidden=true;}
  activate(){
    if(!this.ready||this.failed||!this.state?.video||(this.soundEnabled&&!this.autoplayBlocked))return false;
    this.localStart();return true;
  }
  mediaError(text){clearTimeout(this.timer);this.failed=true;this.status.textContent=text;this.watchText.textContent=text;this.surface?.loading(true,text,true);this.updateWatch();}
  async load(id) {
    this.destroyMedia();this.video=id;this.failed=false;this.ended=false;this.autoplayBlocked=false;
    this.surface?.show(true);this.surface?.loading(true);
    const generation=this.generation,current=()=>this.inside&&this.video===id&&generation===this.generation;
    this.timer=setTimeout(()=>{if(current())this.mediaError('YouTube svarar inte. Välj film igen eller kontrollera anslutningen.');},PLAYROOM.devices.videoTimeoutMs);
    try{
      const YT=await youtubeAPI();if(!current())return;
      const frame=document.createElement('iframe');
      frame.title=`Gemensam film på ${this.place}`;frame.width=this.surface.pixelWidth;frame.height=this.surface.pixelHeight;
      frame.allow='autoplay; encrypted-media';frame.referrerPolicy='strict-origin-when-cross-origin';frame.style.cssText='display:block;width:100%;height:100%;border:0;pointer-events:none';
      const url=new URL(`https://www.youtube-nocookie.com/embed/${id}`);
      url.search=new URLSearchParams({enablejsapi:'1',origin:location.origin,playsinline:'1',autoplay:'1',mute:'1',controls:'0',disablekb:'1'});
      frame.src=url.href;this.surface.mount.append(frame);this.surface.show(true);

      this.player=new YT.Player(frame,{events:{
        onReady:()=>{if(!current())return;this.ready=true;if(this.soundEnabled)this.player.unMute();else this.player.mute();this.synchronize();this.controls();this.updateWatch();},
        onStateChange:e=>{if(!current()||this.failed)return;
          if(e.data===1||e.data===2||e.data===0){clearTimeout(this.timer);this.surface?.loading(false);}
          if(e.data===1){this.autoplayBlocked=false;this.updateWatch();}
          if(e.data===3){this.surface?.loading(true);clearTimeout(this.timer);this.timer=setTimeout(()=>{if(current())this.mediaError('Filmen kunde inte laddas. Välj film igen.');},PLAYROOM.devices.videoTimeoutMs);}
          if(e.data===0){this.ended=true;this.watchText.textContent=`${this.label} · Filmen är slut.`;}
        },
        onAutoplayBlocked:()=>{if(current()){clearTimeout(this.timer);this.autoplayBlocked=true;this.surface?.loading(true,'Tryck på skärmen eller använd E för att starta.',true);this.updateWatch();}},
        onError:e=>{if(current())this.mediaError(youtubeError(e.data));},
      }});
    }catch{if(current())this.mediaError('YouTube kunde inte nås. Försök igen.');}
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
    this.autoplayBlocked=false;const state=this.player.getPlayerState();this.surface?.loading(state!==1&&state!==2);this.updateWatch();
  }
  update(inside,camera,renderer) {
    if(!inside){if(this.inside)this.leave();return;}
    if(!this.inside){this.inside=true;this.command('get');}
    const connected=this.connected;
    if(this.wasConnected!==connected){
      this.wasConnected=connected;
      if(connected)this.command('get');
      else{this.wantsControl=false;this.pendingSeek=undefined;this.releasePending=false;this.awaitingPresence=false;this.destroyMedia();this.state=null;this.watch.hidden=true;this.status.textContent=`${this.label} väntar på anslutning till de andra spelarna.`;}
      this.controls();
    }
    this.surface?.update(camera,renderer);
    if(performance.now()-(this.lastSync??0)>PLAYROOM.cinemaSync.syncEveryMs){this.lastSync=performance.now();this.synchronize();}
  }
}
