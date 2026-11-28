// #2442: actual standard tile source options match their native instances; no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {STANDARD, TILE_SURFACE} from '../../../src/config.js';
const table=JSON.parse(fs.readFileSync(new URL('../material-map.json',import.meta.url)));
const source=fs.readFileSync(new URL('../../../src/standardinterior.js',import.meta.url),'utf8');
for(const [sourceName,native]of [['splash','Splash'],['wet','WetFloor'],['wetWall','Wall']]){
 const match=source.match(new RegExp(`${sourceName}: tileMaterial\\((\\{[^\\n]+\\}), ([0-9.]+)\\),`));assert.ok(match,sourceName);
 const options=Function('S','return '+match[1])(STANDARD), params=table.materials['/Game/Lunden/Materials/MI_LundenStandardTile'+native].params;
 const hex=n=>'#'+n.toString(16).padStart(6,'0');
 assert.deepEqual(params.Size,[options.tw,options.th]);assert.equal(params.Bond,options.bond?.5:0);
 assert.equal(params.Color,hex(options.color));assert.equal(params.JointColor,hex(options.grout));assert.equal(params.Joint,options.joint??.003);
 assert.equal(params.Variation,options.vary/2);assert.equal(params.Roughness,Number(match[2]));assert.equal(params.JointRoughness,TILE_SURFACE.groutRoughness);
}
const exporter=fs.readFileSync(new URL('../export-scene.js',import.meta.url),'utf8');
const start=exporter.indexOf('function materialInfo(m) {'),end=exporter.indexOf('\n}\n',start)+2;
const materialInfo=Function('THREE','r4','hex',exporter.slice(start,end)+';return materialInfo')({DoubleSide:2},x=>Math.round(x*1e4)/1e4,()=>null);
const material={isMeshStandardMaterial:true,map:{},roughness:1,userData:{},roughnessMap:{name:'paving-height-roughness'}};
assert.equal(materialInfo(material).key,'std_ffffff_r100_m0_tex');assert.equal(materialInfo(material).info.surface,'paving');
material.roughnessMap.name='tile-height-roughness';assert.equal(materialInfo(material).info.surface,null);
material.userData.wetGround='asphalt';assert.equal(materialInfo(material).info.surface,'asphalt');
console.log('STANDARD_TILES_OK source dimensions/colours/grout/roughness and sheltered paving classification');
