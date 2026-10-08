import * as THREE from 'three';
import { BEER_SHELF as P } from './config.js';

// Four recognisable, correctly typed packages on a real shelf (#511). Room-visible only with the fridge open.
const metal = new THREE.MeshStandardMaterial({ color: 0xcbd0d3, metalness: .65, roughness: .3 });
const brown = new THREE.MeshStandardMaterial({ color: 0x493121, metalness: .1, roughness: .3 });
function labelTexture(beer, image) {
  const canvas = document.createElement('canvas');canvas.width = 512;canvas.height = 256;
  const ctx = canvas.getContext('2d');ctx.fillStyle = '#eeeeea';ctx.fillRect(0, 0, 512, 256);
  // A product photo is cropped to the printed body; a supplied Untappd label is already the identity artwork.
  const product = beer.labelKind === 'product', x = product ? image.width * P.productCrop[0] : 0, y = product ? image.height * P.productCrop[1] : 0;
  ctx.drawImage(image, x, y, product ? image.width * P.productCrop[2] : image.width, product ? image.height * P.productCrop[3] : image.height, 112, 0, 288, 204);
  ctx.fillStyle = '#fbfbf8';ctx.fillRect(0, 204, 512, 52);ctx.fillStyle = '#171d20';ctx.textAlign = 'center';
  ctx.font = 'bold 16px sans-serif';ctx.fillText(beer.name, 256, 225, 496);
  ctx.font = '13px sans-serif';ctx.fillText(`${beer.brewery} · ${beer.group}`, 256, 247, 496);
  const texture = new THREE.CanvasTexture(canvas);texture.colorSpace = THREE.SRGBColorSpace;return texture;
}
export class BeerShelf {
  constructor(fridge, data) {
    this.fridge = fridge;this.record = data.record;this.group = new THREE.Group();this.group.name = 'beer-shelf';
    this.packages = [];const { cx, iw, y0 } = fridge.inside;
    const front = fridge.door.position.z + P.frontDepth;
    data.record.beers.forEach((beer, i) => {
      const g = new THREE.Group(), texture = labelTexture(beer, data.images[i]);g.name = beer.name;
      const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .45 });
      let height, diameter;
      if (beer.type === 'can') {
        const c = P.can;diameter = c.diameter;height = beer.ml <= 330 ? c.height330 : beer.ml <= 440 ? c.height440 : beer.ml <= 473 ? c.height473 : c.height500;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(diameter / 2, diameter / 2, height, 24, 1, false), [material, metal, metal]);
        body.position.y = height / 2;g.add(body);
        const tab = new THREE.Mesh(new THREE.TorusGeometry(c.tabRadius, c.tabWire, 4, 12), metal);tab.rotation.x = -Math.PI / 2;tab.scale.set(.6, 1, 1);tab.position.set(0, height + c.tabWire, c.tabDepth);g.add(tab);
      } else {
        const b = P.bottle;diameter = b.diameter;height = beer.ml <= 330 ? b.height330 : b.height500;
        const bodyHeight = height * b.bodyFraction, shoulderHeight = height * b.shoulderFraction, neckHeight = height * b.neckFraction;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(diameter / 2, diameter / 2, bodyHeight, 24), [material, brown, brown]);body.position.y = bodyHeight / 2;g.add(body);
        const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(b.neck / 2, diameter / 2, shoulderHeight, 16), brown);shoulder.position.y = bodyHeight + shoulderHeight / 2;g.add(shoulder);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(b.neck / 2, b.neck / 2, neckHeight, 16), brown);neck.position.y = height - neckHeight / 2;g.add(neck);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(b.neck * .57, b.neck * .57, b.capHeight, 16), metal);cap.position.y = height + b.capHeight / 2;g.add(cap);
      }
      g.position.set(cx + P.across[i] * iw, y0 + P.y, front);
      g.traverse(mesh => {if(mesh.isMesh){mesh.castShadow = mesh.receiveShadow = true;mesh.raycast = () => {};}});
      this.group.add(g);this.packages.push({ beer, object: g, height, diameter });
    });
    fridge.object.add(this.group);this.update();
  }
  update() { this.group.visible = this.fridge.t > 0; }
}
