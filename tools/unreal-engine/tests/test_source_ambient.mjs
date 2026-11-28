// #2424: source parity without a browser/editor. Executes the real DayCycle light
// update block and WebGLLights packing, then compares the pure/native contract.
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
const dir = process.env.THREE_DIR;
assert(dir, 'THREE_DIR must bind the actual pinned three package');
const url = pathToFileURL(dir + '/').href;
register('data:text/javascript,' + encodeURIComponent(`
 const root=${JSON.stringify(url)};
 export async function resolve(s,c,next) {
 if(s==='three') return {url:root+'build/three.module.js',shortCircuit:true};
 if(s.startsWith('three/addons/')) return {url:root+'examples/jsm/'+s.slice(13),shortCircuit:true};
 return next(s,c); }`));
const THREE = await import('three');
const { WebGLLights } = await import(url+'src/renderers/webgl/WebGLLights.js');
const { sourceAmbientContract, dayCycleLightColors } = await import('../../../src/daycycle.js');
const C = await import('../../../src/config.js');
const contract = sourceAmbientContract(), colors = dayCycleLightColors();
const source = readFileSync(new URL('../../../src/daycycle.js', import.meta.url), 'utf8');
const start = source.indexOf('    // a clear sky by day:');
const endLine = '    fill.intensity = this.base.fill * inDay;';
assert(start > 0 && source.indexOf(endLine,start)>start);
const body = source.slice(start, source.indexOf(endLine,start)+endLine.length);
const actualUpdate = new Function('LIGHTING','DAY','WEATHER','GARAGE','THREE','SUN_LOW','SUN_HIGH','MOON','HEMI_DAY','HEMI_NIGHT','day','oc','flash','night',
 'const smooth=(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b); const {sun,hemi,ambient,fill}=this.lights;\n'+body);
function python(code, input) {
 const moduleDir = fileURLToPath(new URL('../python/',import.meta.url));
 const result=spawnSync('python3',['-c',`import sys,json;sys.path.insert(0,${JSON.stringify(moduleDir)});import source_ambient as s\n${code}`],
 {input:JSON.stringify(input),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr); return JSON.parse(result.stdout);
}
function close(actual,expected) {
 if(Array.isArray(expected)) { assert.equal(actual.length,expected.length); expected.forEach((x,i)=>close(actual[i],x)); }
 else assert(Math.abs(actual-expected)<1e-11,`${actual} != ${expected}`);
}

test('raw source MPC contract matches real DayCycle update and WebGLLights uniforms',()=>{
 const cases=[
 {day:1,overcast:0,dim:0,under:0,flash:0,garage_lit:0},
 {day:0,overcast:0,dim:0,under:0,flash:0,garage_lit:0},
 {day:.35,overcast:.7,dim:.4,under:0,flash:0,garage_lit:0},
 {day:1,overcast:1,dim:0,under:0,flash:1.2,garage_lit:0},
 {day:1,overcast:.5,dim:0,under:1,flash:0,garage_lit:1},
 ];
 const expected=[];
 for(const state of cases) {
  const sky=C.LIGHTING.sky;
  const lights={sun:new THREE.DirectionalLight(),hemi:new THREE.HemisphereLight(sky.hemi.sky,sky.hemi.ground),ambient:new THREE.AmbientLight(0xffffff),fill:new THREE.DirectionalLight(sky.fill.color)};
  const instance={lights,base:{sun:0,hemi:0,ambient:0,fill:0,exposure:0},renderer:null,under:state.under,dim:state.dim,lit:state.garage_lit,sunDir:new THREE.Vector3(0,1,0),moonDir:new THREE.Vector3(0,1,0)};
  // dayCycle's moon variable is read only on the night branch; this positive sun
  // direction isolates the ambient block while day is independently exercised.
  actualUpdate.call(instance,C.LIGHTING,C.DAY,C.WEATHER,C.GARAGE,THREE,new THREE.Color().fromArray(colors.sunLow),new THREE.Color().fromArray(colors.sunHigh),new THREE.Color().fromArray(colors.moon),0xeaf3ff,0x6b7da8,state.day,state.overcast,state.flash,1-state.day);
  const web=WebGLLights(); web.setup([lights.hemi,lights.ambient]);
  expected.push({ambient:web.state.ambient,sky:web.state.hemi[0].skyColor.toArray(),ground:web.state.hemi[0].groundColor.toArray(),fillIntensity:lights.fill.intensity});
 }
 const actual=python("d=json.load(sys.stdin);print(json.dumps([s.uniforms(d['contract'],**x) for x in d['cases']]))",{contract,cases});
 expected.forEach((x,i)=>{close(actual[i].ambient,x.ambient);close(actual[i].sky,x.sky);close(actual[i].ground,x.ground);close(actual[i].fillIntensity,x.fillIntensity);});
 // The getter is detached, and the source field really points towards the fill.
 const copy=sourceAmbientContract();copy.colors.ground[0]=999;assert.notEqual(sourceAmbientContract().colors.ground[0],999);
 close(contract.fillDirection,new THREE.Vector3(...C.LIGHTING.sky.fill.pos).normalize().toArray());
});

test('source Lambert/pi, post-window AO, facing normals and Physical layer attenuation',()=>{
 const common=THREE.ShaderChunk.common, physical=THREE.ShaderChunk.lights_physical_pars_fragment;
 assert(common.includes('return RECIPROCAL_PI * diffuseColor;'));
 assert(physical.includes('irradiance * BRDF_Lambert( material.diffuseColor )'));
 assert(THREE.ShaderChunk.aomap_fragment.includes('reflectedLight.indirectDiffuse *= ambientOcclusion;'));
 assert(THREE.ShaderChunk.normal_fragment_begin.includes('normal *= faceDirection;'));
 const expected=[];
 for(const n of [[0,1,0],[0,-1,0],[1,0,0]]) {
  const k=.5+.5*n[1], e=contract.colors.ambient.map((x,i)=>x*.275+(contract.colors.ground[i]+(contract.colors.skyDay[i]-contract.colors.ground[i])*k)*1.55);
  const f=2**((-5.55473*.4-6.98316)*.4), attenuation=(1-.2)*(1-.157*.3)*(1-.7*(.04*(1-f)+f));
  expected.push(e.map(x=>x*.6*(1-.25)*.8/Math.PI*attenuation));
 }
 const actual=python("d=json.load(sys.stdin);st=s.uniforms(d,day=1,overcast=0);print(json.dumps([s.indirect_diffuse(s.irradiance(st,n),[.6]*3,.25,.8,clearcoat=.7,clearcoat_dot_nv=.4,sheen_color=[.1,.3,.2],transmission=.2) for n in ([0,1,0],[0,-1,0],[1,0,0])]))",contract);
 close(actual,expected);
 const guard=python("out=[]\nfor cov in ({},{'masterInventoryComplete':True}):\n try:s.require_activation({'enabled':True},cov);out.append(False)\n except RuntimeError:out.append(True)\nprint(json.dumps(out+[s.require_activation(s.policy(),{}) is False]))",{});
 assert.deepEqual(guard,[true,true,true]);
});


test('actual Physical source layers survive the Standard-flattened export as detached metadata',async()=>{
 const {sourceAmbientMaterial,recordSourceAmbientVariant}=await import('../export-source-ambient.js');
 const mat=new THREE.MeshPhysicalMaterial({clearcoat:1,sheen:.7,sheenColor:0xaabbcc,transmission:0,transparent:true,opacity:.24,side:THREE.DoubleSide});
 const before=mat.toJSON(),descriptor=sourceAmbientMaterial(mat);
 assert.deepEqual(mat.toJSON(),before);
 assert.equal(descriptor.physical,true);assert.equal(descriptor.clearcoat,1);
 close(descriptor.sheenColor,mat.sheenColor.toArray().map(v=>v*.7));
 assert.equal(descriptor.normalFacing,'double-sided');
 const bound=python("d=json.load(sys.stdin);print(json.dumps(s.layer_bindings(d)))",descriptor);
 assert.equal(bound.Clearcoat,1);assert.equal(bound.Transmission,0);
 descriptor.sheenColor[0]=999;assert.notEqual(sourceAmbientMaterial(mat).sheenColor[0],999);
 const row={sourceAmbient:sourceAmbientMaterial(mat)};
 const collision=mat.clone();collision.clearcoat=.2;
 recordSourceAmbientVariant(row,collision);recordSourceAmbientVariant(row,collision);
 assert.equal(row.sourceAmbientVariants.length,2);
 const rejected=python("d=json.load(sys.stdin)\ntry:s.layer_for_key({'same_phys_key':d},'same_phys_key');print('false')\nexcept ValueError:print('true')",row);
 assert.equal(rejected,true);
 mat.clearcoatMap=new THREE.Texture();assert.equal(sourceAmbientMaterial(mat).textures.clearcoatMap.present,true);
});
