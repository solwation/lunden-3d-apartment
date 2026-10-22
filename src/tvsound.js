import { TV_MEDIA } from './config.js';
import { isMuted } from './audio.js';

/** YouTube offers scalar volume only: distance and head direction, not stereo panning. */
export function tvVolume(source, listener, forward, sound = TV_MEDIA.sound) {
  const dx=source.x-listener.x,dy=source.y-listener.y,dz=source.z-listener.z;
  const distance=Math.hypot(dx,dy,dz);
  if(!Number.isFinite(distance)||distance>=sound.range)return 0;
  const facing=distance>0?Math.max(-1,Math.min(1,(dx*forward.x+dy*forward.y+dz*forward.z)/distance)):1;
  const direction=sound.behind+(1-sound.behind)*(facing+1)/2;
  const attenuation=sound.ref/(sound.ref+sound.rolloff*(Math.max(sound.ref,distance)-sound.ref));
  return Math.round(100*direction*attenuation);
}

export class TVVolume {
  update(player,camera,mesh,enabled=true) {
    if(!player?.setVolume||!mesh)return;
    this.position??=camera.position.clone();this.forward??=camera.position.clone();
    mesh.getWorldPosition(this.position);camera.getWorldDirection(this.forward);
    const volume=enabled&&!isMuted()?tvVolume(this.position,camera.position,this.forward):0;
    const now=performance.now();
    // Mute immediately; coalesce ordinary iframe messages to ten per second.
    if(volume!==this.volume&&(volume===0||now-(this.at??-Infinity)>=TV_MEDIA.sound.intervalMs)) {
      player.setVolume(volume);this.volume=volume;this.at=now;
    }
    return volume;
  }
}
