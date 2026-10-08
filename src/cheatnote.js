import * as THREE from 'three';
import { CHEAT_NOTE as P, GARAGE } from './config.js';
import { publicCheats } from './cheats.js';

/** Marker writing directly on a back wall, one transparent draw and no collision footprint. */
export async function buildCheatNote(garage, read) {
  const font = new FontFace('LundenMarker', 'url("./data/fonts/Kalam-Bold.woff2")', {weight:'700'});
  let timer;
  try { const loaded = await Promise.race([font.load(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('marker font timeout')),P.fontTimeout);})]);document.fonts.add(loaded); }
  catch { /* the readable local cursive fallback must not prevent the home loading */ }
  finally {clearTimeout(timer);}
  const canvas = document.createElement('canvas'); canvas.width = 1536; canvas.height = 1024;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#202938'; ctx.textBaseline = 'middle';
  const write = (text, y, i, size) => {
    ctx.save();ctx.translate(55 + Math.sin(i * 3) * 8, y);ctx.rotate(Math.sin(i * 7) * .008);
    ctx.font = `700 ${size}px "LundenMarker", "Comic Sans MS", cursive`; ctx.fillText(text, 0, 0, 1420);ctx.restore();
  };
  write('FUSK (psst...)', 80, 0, 80);
  ctx.strokeStyle = '#202938';ctx.lineWidth = 5;ctx.lineCap = 'round';ctx.beginPath();ctx.moveTo(53, 130);ctx.lineTo(570, 143);ctx.lineTo(790, 136);ctx.stroke();
  const commands = publicCheats(); commands.forEach((c,i) => write(`${c.code}  →  ${c.text}`, 205+i*77, i+1, 43));
  write('§ eller >_  →  skriv koden i konsolen', 950, 11, 43);
  const texture = new THREE.CanvasTexture(canvas);texture.colorSpace = THREE.SRGBColorSpace;texture.anisotropy = 4;
  const object = new THREE.Mesh(new THREE.PlaneGeometry(P.width,P.height),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
  object.position.set(P.x,GARAGE.floor+P.heightAt,P.z);object.rotation.y=Math.PI/2;object.name='fusklapp';
  const target={kind:'cheat-note',name:'fusklappen',verb:'läsa',pickable:object,toggle:read};object.userData.door=target;
  garage.areas.basementE.group.add(object);garage.targets.push(target);
  return {object,target,commands};
}
