// Compare the two exported river slots against the web builders. --vectors supplies inputs/expectations to river-shaders.py.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { COLORS, EDGE_BACKDROP, RAIN_RIPPLES, RIVER_SURFACE } from '../../../src/config.js';
import { buildRiverBridges, waterYAt } from '../../../src/riverbridge.js';
import { riverRippleSlope, riverFlowSlope, riverBankMix, riverSkyWeight } from '../../../src/riversurface.js';
import { duskSkyState, skyGradientPalette } from '../../../src/daycycle.js';
import { riverMaterialData } from '../export-river.js';

function vectors(flowing) {
  const palette = skyGradientPalette(), samples = [];
  const smooth = (a, b, x) => T.MathUtils.smoothstep(x, a, b);
  for (const distance of [1, 24, 48]) for (const footprint of [0.012, 0.076, 0.18]) {
    for (const [sun, rain, snow, eyeZ] of [[0.8,0,0,1], [0.8,0,0,0.07], [0.005,0,0,0.2], [-0.4,0,0,0.07], [0.02,0.8,0,0.25], [0.12,0,0.7,0.7]]) {
      for (const [time, shore, mask, lies, face] of [[0,0,1,0,1], [6.3,0.87,1,0,1], [RAIN_RIPPLES.wrap,1,1,0,1],
        [6.3,1,1,0,-1], ...(flowing ? [] : [[0,0,0.501,0,1], [0,0,0.499,0,1], [0,0,1,1,1]])]) {
        const x = 12.75, z = -20.125, along = 221.875, across = -2.375, dir = new T.Vector2(-0.82, 0.55).normalize();
        const view = new T.Vector3(Math.sqrt(1-eyeZ**2), 0, eyeZ), active = flowing || (!lies && mask > 0.5);
        const slope = flowing ? riverFlowSlope(along, across, time, distance, footprint) : riverRippleSlope(x,z,distance,footprint);
        const d = dir.clone().addScalar(1e-5).normalize();
        const [sx,sy] = flowing ? [d.x*slope[0]-d.y*slope[1], d.y*slope[0]+d.x*slope[1]] : slope;
        const normal = new T.Vector3(active ? -sx : 0, active ? -sy : 0, 1).normalize().multiplyScalar(face);
        const day = smooth(-0.08,0.18,sun), oc = Math.max(rain,0.7*snow), dusk = duskSkyState(sun,oc);
        const glow = (1-smooth(0,0.35,Math.abs(sun)))*smooth(-0.15,0.05,sun);
        const col = k => new T.Color().fromArray(palette[k]);
        const horizon = col('nightHorizon').lerp(col('dayHorizon'),day).lerp(col('duskHorizon'),glow*0.6)
          .lerp(col('overcast').multiplyScalar(0.2+0.8*day),oc*0.7);
        const zenith = col('nightZenith').lerp(col('dayZenith'), day).lerp(dusk.zenith, dusk.zenithAmt)
          .lerp(col('overcast').multiplyScalar(0.15+0.85*day),oc*0.85);
        const reflected = view.clone().negate().reflect(normal);
        const sky = horizon.lerp(zenith,Math.sqrt(T.MathUtils.clamp(reflected.z,0,1)));
        if (flowing) sky.lerp(new T.Color().fromArray(RIVER_SURFACE.bank.tint),riverBankMix(shore));
        sky.multiplyScalar(active && face > 0 ? riverSkyWeight(view.dot(normal)) : 0);
        samples.push({ input: [x,z,distance,footprint,along,across,...dir.toArray(),time,shore,mask,lies,sun,rain,snow,face,...view.toArray(),0],
          normal: normal.toArray(), sky: sky.toArray() });
      }
    }
  }
  return samples;
}

async function geometry(dir) {
  const spec = JSON.parse(fs.readFileSync(path.join(dir,'measurements.json'))).site.riverSurface;
  assert.deepEqual(spec, riverMaterialData(), 'material inputs must follow the web configuration');
  const table = JSON.parse(fs.readFileSync(new URL('../material-map.json', import.meta.url)));
  const web = buildRiverBridges().getObjectByName('bridges-water');
  const pos = web.geometry.attributes.position, flow = web.geometry.attributes.riverFlow, banks = web.geometry.attributes.riverShore;
  const triangles = [];
  for (let i=0; i<pos.count; i+=3) {
    const tri = new T.Triangle(...[i,i+1,i+2].map(j => new T.Vector3().fromBufferAttribute(pos,j)));
    triangles.push({ i, tri, box: new T.Box3().setFromPoints([tri.a,tri.b,tri.c]).expandByScalar(0.0001) });
  }
  const water = new T.Color(COLORS.water), levels = EDGE_BACKDROP.rivers.map(r => waterYAt(...r.path[0]));
  for (const [zone, name, mode] of [['omgivning','bridges-water','flow'], ['fond','edge-land','edge']]) {
    const loader = new GLTFLoader();
    loader.register(parser => ({ name:'RiverMeshes', beforeRoot() {
      function keep(i) {
        const node = parser.json.nodes[i];
        if (node.extras?.name === name) return true;
        if (node.children) node.children = node.children.filter(keep);
        return !!node.children?.length;
      }
      for (const scene of parser.json.scenes) scene.nodes=scene.nodes.filter(keep);
    } }));
    const bytes=fs.readFileSync(path.join(dir,zone+'.glb'));
    const {scene}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    scene.updateMatrixWorld(true);
    let count = 0, selected = 0, maxChainageError = 0;
    const half = x => T.DataUtils.fromHalfFloat(T.DataUtils.toHalfFloat(x));
    scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      const key = mesh.material.name;
      assert.ok(key.endsWith('_river_'+mode), key);
      const rule = table.rules.find(row => new RegExp(row.match).test(key) && (!row.mesh || new RegExp(row.mesh).test(mesh.name)));
      const master = table.materials[rule.material.split('.')[0]];
      assert.equal(master.mode,mode); assert.equal(master.graph,'river');
      assert.equal(mesh.material.roughness,master.roughness); assert.equal(mesh.material.metalness,master.metallic);
      const a=mesh.geometry.attributes;
      if (mode === 'flow') assert.equal(mesh.material.color.getHexString(),water.getHexString());
      for (let i=0; i<a.position.count; i++) {
        const p=new T.Vector3().fromBufferAttribute(a.position,i).applyMatrix4(mesh.matrixWorld);
        count++;
        if (mode==='edge') {
          const c=new T.Color().fromBufferAttribute(a.color,i);
          const on=Math.hypot(c.r-water.r,c.g-water.g,c.b-water.b)<1e-5 && levels.some(y=>Math.abs(y-p.y)<RIVER_SURFACE.levelTolerance);
          assert.equal(a.uv.getX(i),Number(on),'far-water mask at '+p.toArray());
          selected+=Number(on);
        } else {
          const actual=[a.uv1.getX(i),a.uv1.getY(i),8*(a.uv.getX(i)+a.uv.getY(i)),a.uv2.getX(i),a.uv2.getY(i)];
          const halfChainage = 8 * (half(a.uv.getX(i)) + half(a.uv.getY(i)));
          maxChainageError = Math.max(maxChainageError, Math.abs(halfChainage - actual[2]));
          const weight=new T.Vector3(), closest=new T.Vector3();
          const matches=triangles.some(({i:j,tri,box})=>{
            if(!box.containsPoint(p)||tri.closestPointToPoint(p,closest).distanceTo(p)>0.0001) return false;
            if(!tri.getBarycoord(closest,weight)) return false;
            return actual.every((value,k)=>{
              const get=v=>k===4?banks.getX(v):flow.getComponent(v,k);
              return Math.abs(value-(weight.x*get(j)+weight.y*get(j+1)+weight.z*get(j+2)))<0.0004;
            });
          });
          assert.ok(matches,'source flow frame at '+p.toArray()+' -> '+actual);
        }
      }
    });
    assert.ok(count>0);
    if (mode==='edge') assert.ok(selected>0 && selected<count);
    if (mode === 'flow') assert.ok(maxChainageError < 0.004, 'half-precision chainage exceeds 4 mm');
    console.log(zone + '/' + name + ' ' + count + ' vertices' + (mode === 'edge'
      ? ' (' + selected + ' water, ' + (count-selected) + ' land)'
      : ' match web flow triangles, maximum half-UV chainage error ' + (maxChainageError * 1000).toFixed(2) + ' mm'));
  }
}
if (process.argv[2]==='--vectors') process.stdout.write(JSON.stringify({flow:vectors(true),edge:vectors(false)}));
else await geometry(process.argv[2] ?? 'unreal/Lunden/Import');
