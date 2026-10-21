import { CinemaPlayer } from './cinemaplayer.js';
import { CinemaSurface } from './cinemasurface.js';
import { TV_MEDIA, tvViewer } from './config.js';

/** Independent shared films on every registered home TV; one chooser per screen. */
export class TVMedia {
  constructor({canvas,targets,template,onClose,onOpen,endpoint}) {
    this.onOpen=onOpen;
    this.sessions=new Map();
    for(const target of targets.filter(t=>t.kind==='tv'&&t.mediaId)) {
      const info=TV_MEDIA.screens.find(s=>s.id===target.mediaId);
      if(!info)continue;
      const el=template.cloneNode(true);el.id=`tv-player-${info.id}`;el.removeAttribute('open');
      const title=el.querySelector('h2');title.id=`tv-title-${info.id}`;title.textContent=info.name;el.setAttribute('aria-labelledby',title.id);
      el.querySelector('input').id=`tv-url-${info.id}`;el.querySelector('label').htmlFor=`tv-url-${info.id}`;
      const channels=document.createElement('button');channels.type='button';channels.textContent='Vanliga TV-kanaler';channels.dataset.tvChannels='';
      el.querySelector('[data-cinema=off]').after(channels);document.body.append(el);
      const player=new CinemaPlayer(el,onClose,endpoint,{id:info.id,label:info.name,place:'TV-skärmen'});
      player.surface=new CinemaSurface(canvas,target.mesh,`tv-world-${info.id}`);
      target.videoMaterial=player.surface.aperture;
      const show=player.surface.show.bind(player.surface);
      player.surface.show=on=>{show(on);target.video(on);};
      const controls=player.controls.bind(player);
      player.controls=()=>{controls();channels.disabled=!player.owns;};player.controls();
      channels.addEventListener('click',()=>{if(!player.owns)return;player.command('stop');if(!target.isOpen)target.toggle();else target.channel();player.close();});
      this.sessions.set(info.id,{target,player});
    }
  }
  get open(){return [...this.sessions.values()].some(s=>s.player.open);}
  get watching(){return [...this.sessions.values()].some(s=>s.player.inside&&!!s.player.state?.video);}
  connect(net) {for(const [id,{player}] of this.sessions)player.net={ready:net.ready,id:net.id,send:m=>net.send({...m,screen:id})};}
  receive(m){this.sessions.get(m.screen)?.player.receive(m);}
  show(target) {
    const session=this.sessions.get(target.mediaId);if(!session)return false;
    if(!session.player.inside)return false;
    if(session.player.activate())return true;
    this.close();this.onOpen();session.player.show();return true;
  }
  close(reason='button'){for(const {player} of this.sessions.values())if(player.open)player.close(reason);}
  seekable(target){const p=this.sessions.get(target?.mediaId)?.player;return !!p?.inside&&!!p.state?.video;}
  seek(target,delta){return this.sessions.get(target?.mediaId)?.player.remoteSeek(delta)??false;}
  power(target){const player=this.sessions.get(target.mediaId)?.player;if(!player?.state?.video)return false;return this.show(target);}
  update(player,camera,renderer,available) {
    const p=[player.pos.x,player.pos.y,player.pos.z];
    for(const [id,session] of this.sessions)session.player.update(available&&tvViewer(id,p),camera,renderer);
  }
}
