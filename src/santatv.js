import { CinemaSurface } from './cinemasurface.js';
import { youtubeAPI } from './cinemaplayer.js';
import { santaState } from './santaconfig.js';
import { SANTA_TV } from './santatvconfig.js';
import { TVVolume } from './tvsound.js';

/** Santa owns the living-room programme throughout his visit; global sound/power still apply. */
export class SantaTV {
  constructor({canvas,tv,tvMedia,day,available=()=>true,watching=()=>true,muted=()=>true}) {
    Object.assign(this,{canvas,tv,tvMedia,day,available,watching,muted});
    this.active=false;this.soundVolume=new TVVolume();
    if(!tv)return;
    this.toggle=tv.toggle.bind(tv);this.channel=tv.channel.bind(tv);
    tv.mediaLocked=()=>this.locked;
    const verb=Object.getOwnPropertyDescriptor(tv,'verb');
    Object.defineProperty(tv,'verb',{configurable:true,get:()=>this.locked?'titta på':verb?.get?.call(tv)??'välja film på'});
    tv.toggle=(...args)=>this.locked?tv.isOpen:this.toggle(...args);
    tv.channel=(...args)=>this.locked?false:this.channel(...args);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.stop();});
    window.addEventListener('pagehide',()=>this.stop());
  }
  get locked(){return !!this.tv && santaState(this.day)!=='away' && this.watching();}
  get shared(){return !!this.tvMedia?.sessions.get(this.tv?.mediaId)?.player.state?.video;}
  start() {
    const tv=this.tv;
    this.wasOn=tv.isOpen;
    if(!tv.isOpen)this.toggle();
    this.previousMaterial=tv.videoMaterial;
    this.surface??=new CinemaSurface(this.canvas,tv.mesh,'santa-christmas-tv');
    this.soundVolume.volume=undefined;this.soundVolume.at=-Infinity;
    this.active=true;this.failed=false;this.blocked=false;this.soundActivated=false;const generation=this.generation=(this.generation??0)+1;
    this.surface.mount.replaceChildren();
    tv.videoMaterial=this.surface.aperture;
    this.surface.show(true);tv.video(true);
    this.surface.loading(true,'Laddar Kalle Anka…');
    youtubeAPI().then(YT=>{
      if(!this.active||this.generation!==generation)return;
      const mount=document.createElement('div');this.surface.mount.prepend(mount);
      this.video=new YT.Player(mount,{width:'100%',height:'100%',videoId:SANTA_TV.video,
        playerVars:{autoplay:1,controls:0,playsinline:1,loop:1,playlist:SANTA_TV.video,origin:location.origin},
        events:{
          onReady:()=>{if(this.generation!==generation)return;this.video.mute();this.video.playVideo();},
          onStateChange:e=>{if(this.generation!==generation)return;
            if(e.data===0){this.video.seekTo(0,true);this.video.playVideo();return;}
            if(e.data===1)this.blocked=false;
            this.surface.loading(e.data!==1,e.data===3?'Laddar Kalle Anka…':'Tryck på TV:n för att starta Kalle Anka.');},
          onAutoplayBlocked:()=>{if(this.generation===generation){this.blocked=true;this.surface.loading(true,'Tryck på TV:n för att starta Kalle Anka.');}},
          onError:e=>{if(this.generation===generation){this.failed=true;this.surface.loading(true,'Kalle Anka kunde inte spelas. Försök starta TV:n igen.',true);}},
        }});
      const frame=this.video.getIframe();frame.style.pointerEvents='none';frame.title='Kalle Anka – Toy Tinkers';
    }).catch(()=>{if(this.active&&this.generation===generation){this.failed=true;
      this.surface.loading(true,'Kalle Anka kunde inte laddas. Kontrollera anslutningen.',true);}});
  }

  stop(suppress=false,restorePower=true) {
    if(!this.active)return;
    this.active=false;
    this.generation++;
    try{this.video?.destroy();}catch{/* Vendor cleanup must not retain the screen. */}
    this.video=null;
    this.surface.show(false);this.surface.mount.replaceChildren();
    this.tv.videoMaterial=this.previousMaterial;
    this.tv.video(this.shared);
    if(restorePower&&!this.wasOn&&this.tv.isOpen)this.toggle();
  }
  activate() {
    if(this.active&&this.failed&&this.locked&&this.available()) { this.stop();this.start();return true; }
    if(!this.active||this.failed||!this.video?.playVideo||this.soundActivated&&!this.blocked)return false;
    this.soundActivated=true;this.blocked=false;
    this.muted()?this.video.mute():this.video.unMute();this.video.playVideo();
    return true;
  }
  update(dt,camera,renderer) {
    if(!this.locked||!this.available()){this.stop();return;}
    if(!this.active)this.start();
    // Shared-player presence changes may restore its ordinary screen between frames.
    this.tv.videoMaterial=this.surface.aperture;this.tv.video(true);
    if(this.video?.mute){(!this.soundActivated||this.muted())?this.video.mute():this.video.unMute();}
    this.soundVolume.update(this.video,camera,this.tv.mesh,this.soundActivated&&!this.muted());
    this.surface.update(camera,renderer);
  }
}
