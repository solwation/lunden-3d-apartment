import { CinemaSurface } from './cinemasurface.js';
import { youtubeAPI, youtubeError } from './cinemaplayer.js';
import { santaState } from './santaconfig.js';
import { SANTA_TV } from './santatvconfig.js';

/** A local Christmas broadcast; ordinary controls and a chosen shared film always win. */
export class SantaTV {
  constructor({canvas,tv,tvMedia,day,available=()=>true,muted=()=>true}) {
    Object.assign(this,{canvas,tv,tvMedia,day,available,muted});
    this.active=false;this.suppressed=false;
    if(!tv)return;
    this.toggle=tv.toggle.bind(tv);this.channel=tv.channel.bind(tv);
    tv.toggle=(...args)=>{if(this.active)this.stop(true,false);return this.toggle(...args);};
    tv.channel=(...args)=>{if(this.active)this.stop(true,false);return this.channel(...args);};
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.stop();});
    window.addEventListener('pagehide',()=>this.stop());
  }
  get shared(){return !!this.tvMedia?.sessions.get(this.tv?.mediaId)?.player.state?.video;}
  start() {
    const tv=this.tv;
    this.wasOn=tv.isOpen;
    if(!tv.isOpen)this.toggle();
    this.previousMaterial=tv.videoMaterial;
    this.surface??=new CinemaSurface(this.canvas,tv.mesh,'santa-christmas-tv');
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
            if(e.data===1)this.blocked=false;
            this.surface.loading(e.data!==1,e.data===3?'Laddar Kalle Anka…':'Tryck på TV:n för att starta Kalle Anka.');},
          onAutoplayBlocked:()=>{if(this.generation===generation){this.blocked=true;this.surface.loading(true,'Tryck på TV:n för att starta Kalle Anka.');}},
          onError:e=>{if(this.generation===generation){this.failed=true;this.surface.loading(true,youtubeError(e.data),true);}},
        }});
      const frame=this.video.getIframe();frame.style.pointerEvents='none';frame.title='Kalle Anka – Toy Tinkers';
    }).catch(()=>{if(this.active&&this.generation===generation){this.failed=true;
      this.surface.loading(true,'Kalle Anka kunde inte laddas. Välj en annan film på TV:n.',true);}});
  }

  stop(suppress=false,restorePower=true) {
    if(suppress)this.suppressed=true;
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
    if(!this.active||this.failed||!this.video?.playVideo||this.soundActivated&&!this.blocked)return false;
    this.soundActivated=true;this.blocked=false;
    this.muted()?this.video.mute():this.video.unMute();this.video.playVideo();
    return true;
  }
  update(dt,camera,renderer) {
    const scheduled=santaState(this.day)==='sitting';
    if(!scheduled)this.suppressed=false;
    if(!this.tv||!scheduled||!this.available()||this.shared){
      if(this.shared&&scheduled)this.suppressed=true;
      this.stop(false,!this.shared);return;
    }
    if(this.suppressed)return;
    if(!this.active)this.start();
    // Shared-player presence changes may restore its ordinary screen between frames.
    this.tv.videoMaterial=this.surface.aperture;this.tv.video(true);
    if(this.video?.mute){(!this.soundActivated||this.muted())?this.video.mute():this.video.unMute();}
    this.surface.update(camera,renderer);
  }
}
