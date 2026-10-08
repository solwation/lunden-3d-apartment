import * as THREE from 'three';

// Shared turned, brushed copper planter (#491, #495). Dimensions and profile are visual assumptions.
let copper, soil;
function materials() {
  if (!copper) {
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 256;
    const ctx = canvas.getContext('2d'); let seed = 491;
    for (let y = 0; y < canvas.height; y++) {
      seed = seed * 16807 % 2147483647;
      const v = 195 + Math.floor(seed / 2147483647 * 55);
      ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; ctx.fillRect(0, y, canvas.width, 1);
    }
    const brush = new THREE.CanvasTexture(canvas);
    brush.wrapS = brush.wrapT = THREE.RepeatWrapping;
    brush.repeat.set(1, 3);
    copper = new THREE.MeshStandardMaterial({ color: 0xb77954, metalness: 0.78, roughness: 0.64, roughnessMap: brush });
    soil = new THREE.MeshStandardMaterial({ color: 0x35281f, roughness: 1 });
  }
  return { copper, soil };
}

export function copperPot({ r, h }) {
  const mat = materials(), g = new THREE.Group();
  // Rounded belly, small foot and gently flared neck; an open lip with a short inside wall.
  const profile = [[0,0],[.59,0],[.64,.025],[.67,.08],[.79,.18],[.94,.37],[1,.53],
    [.97,.68],[.86,.81],[.79,.9],[.8,.96],[.86,.99],[.86,1],[.81,1],[.75,.96],[.74,.89]];
  const pot = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([x,y])=>new THREE.Vector2(x*r,y*h)),32),mat.copper);
  pot.name = 'brushed-copper-pot'; g.add(pot);
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(r*.74,24).rotateX(-Math.PI/2),mat.soil);
  dirt.position.y=h*.89; g.add(dirt);
  for (const y of [.08,.94]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r*(y===.08?.67:.79),r*.014,6,32).rotateX(Math.PI/2),mat.copper);
    band.position.y=h*y; g.add(band);
  }
  g.traverse(m=>{if(m.isMesh)m.castShadow=m.receiveShadow=true});
  return g;
}
