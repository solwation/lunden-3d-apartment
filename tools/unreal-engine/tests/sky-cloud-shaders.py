"""Compare the production web cloud field and colour to the native Custom node on one Vulkan device.
python3 tools/unreal-engine/tests/sky-cloud-shaders.py measurements.json [--dxc dxc --glslang glslang --runner vkrunner]
"""
import argparse
import ast
import json
import math
from pathlib import Path
import struct
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / "python"))
import sky_clouds

args = argparse.ArgumentParser()
args.add_argument("measurements", type=Path)
args.add_argument("--dxc", default="dxc")
args.add_argument("--glslang", default="glslangValidator")
args.add_argument("--runner", default="vkrunner")
opt = args.parse_args()
spec = json.loads(opt.measurements.read_text())["site"]["sky"]["clouds"]
web = json.loads(subprocess.check_output(["node","--input-type=module","-e","""
import {skyFragmentShader,sunDirection,dayOfYear} from './src/daycycle.js';
import * as THREE from 'three';
import fs from 'node:fs';
import {skyCloudState} from './src/cloudshadow.js';
const cameras=JSON.parse(fs.readFileSync('unreal/Lunden/Tests/views.json'));
const shots=JSON.parse(fs.readFileSync('tools/unreal-engine/tests/lighting-shots.json')).shots;
const shot=shots.find(s=>s.name==='start-day'), view=cameras.views.find(v=>v.id===shot.camera);
const crop=JSON.parse(fs.readFileSync('docs/verification/2313/crops.json'))[shot.name].sky;
const {width,height}=cameras.viewport, camera=new THREE.PerspectiveCamera(cameras.verticalFovDeg,width/height,.1,2000);
camera.rotation.order='YXZ';
camera.rotation.set(THREE.MathUtils.degToRad(view.pitchDeg),THREE.MathUtils.degToRad(view.yawDeg),0);
camera.updateMatrixWorld();
function raysFor(rect,w,h) {
  const rays=[];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const u=rect[0]+(x+.5)/w*(rect[2]-rect[0]), v=rect[1]+(y+.5)/h*(rect[3]-rect[1]);
    rays.push(new THREE.Vector3(2*u-1,1-2*v,.5).unproject(camera).normalize().toArray());
  }
  return rays;
}
const rays=raysFor(crop,32,24), frame=raysFor([0,0,1,1],96,54);
console.log(JSON.stringify({rays,frame,eye:[view.x,view.z,view.feetY+cameras.standingEyeHeightM],
  sun:sunDirection(shot.hour,dayOfYear(...shot.date)).toArray(),shader:skyFragmentShader, threshold:[0,.125,.4,.7,1].map(v=>skyCloudState(v).thr)}));
"""], cwd=ROOT))
source = web["shader"]
web_noise = source[source.index("float csHash"):source.index("  void main()")]
web_blend = source[source.index("    float c, thick"):source.index("    col += vec3(0.75")]
# Both compilers receive identical input float32s (including the view rays) from the SSBO.
samples = []
for oc, threshold in zip((0,.125,.4,.7,1), web["threshold"]):
    for j in range(16):
        y = (j+.1)/16
        for i in range(48):
            a = (i+.3)*2*math.pi/48
            r = math.sqrt(1-y*y)
            samples.append((r*math.cos(a), y, r*math.sin(a), oc, threshold,
                            -53.5 + i*2, 9.25-j, i%2*5100-81, j%3*199-700))
sun = "0.36, 0.8, -0.48"
base = "0.29, 0.45, 0.61"
glsl = """#version 450
layout(local_size_x=1) in;
layout(set=0,binding=0,std430) readonly buffer Inputs { float a[]; };
layout(set=0,binding=1,std430) writeonly buffer Outputs { vec4 o[]; };
vec3 uSun, cameraPosition, uSkyCl;
vec4 cloudShadowA;
float uOvercast;
const vec3 uGlow=vec3(0),uBody=vec3(0),uRim=vec3(0);
const float uNight=0,uGlowAmt=0,uBodyAmt=0,uAbove=0;
""" + web_noise + """
void main() {
    uint i=gl_GlobalInvocationID.x,b=i*9;
    vec3 d=vec3(a[b],a[b+1],a[b+2]); uOvercast=a[b+3];
    uSkyCl=vec3(1,a[b+4],SOFT); uSun=vec3(SUN);
    cameraPosition=vec3(a[b+5],0,a[b+6]); cloudShadowA=vec4(a[b+7],a[b+8],HEIGHT,0);
    vec3 col=vec3(BASE); float s=max(dot(d,uSun),0);
""" + web_blend + """
    o[i*2]=vec4(c,thick,shade,0); o[i*2+1]=vec4(col,0);
}"""
# Only the legacy phone texture sampler is unreachable in this desktop test. Remove its texture read.
glsl = "\n".join(line for line in glsl.splitlines() if "else c = max(texture2D" not in line)
glsl = glsl.replace("SOFT",str(spec["sky"]["soft"])).replace("SUN",sun).replace("BASE",base).replace("HEIGHT",str(spec["height"]))
hlsl_header = """
[[vk::binding(0)]] StructuredBuffer<float> a;
[[vk::binding(1)]] RWStructuredBuffer<float4> o;
[numthreads(1,1,1)] void main(uint3 id:SV_DispatchThreadID) {
""" + sky_clouds.shader(spec)
hlsl = hlsl_header + """
    uint i=id.x,b=i*9;
    WebClouds cloud;
    float3 d=float3(a[b],a[b+1],a[b+2]), sun=float3(SUN);
    float3 shape=cloud.shape(d,sun,float2(a[b+5],a[b+6]),float2(a[b+7],a[b+8]),a[b+4],a[b+3]);
    o[i*2]=float4(shape,0); o[i*2+1]=float4(cloud.sky(float3(BASE),shape,a[b+3]),0);
}""".replace("SUN",sun).replace("BASE",base)


def run(folder, name, data, compiler, rows):
    file = folder / (name + ".comp")
    spv, script, out = (folder / (name+ext) for ext in (".spv", ".shader_test", ".bin"))
    file.write_text(data)
    subprocess.run([*compiler, str(spv), str(file)],check=True)
    words = [f"{v:x}" for v, in struct.iter_unpack("<I",spv.read_bytes())]
    commands = ["[compute shader binary]", *(" ".join(words[i:i+16]) for i in range(0,len(words),16)), "[test]"]
    for i,row in enumerate(rows):
        commands.append(f"ssbo 0 subdata float {i*len(row)*4} " + " ".join(map(str,row)))
    commands.extend((f"ssbo 1 {len(rows)*32}", f"compute {len(rows)} 1 1"))
    script.write_text("\n".join(commands)+"\n")
    subprocess.run([opt.runner,"-q","-B","1","-b",str(out),str(script)],check=True)
    return list(struct.iter_unpack("<8f",out.read_bytes()))


with tempfile.TemporaryDirectory() as temp:
    folder = Path(temp)
    dxc_compute = [opt.dxc, "-spirv", "-T", "cs_6_0", "-E", "main", "-Fo"]
    native = run(folder, "native", hlsl, dxc_compute, samples)
    reference = run(folder,"web",glsl,[opt.glslang,"-V","-S","comp","-o"],samples)
    xyz = lambda vals: "float3(" + ",".join(map(str, vals)) + ")"
    camera = hlsl_header + """
    uint i=id.x,b=i*5;
    WebClouds clouds;
    float3 d=float3(a[b],a[b+1],a[b+2]), sun=SUN, eye=EYE, nativeSky=float3(.2,.4,.7);
    float3 colour=clouds.daylight(nativeSky,d,sun,eye,0,a[b+4],a[b+3]);
    float3 luma=float3(.2126,.7152,.0722);
    o[i*2]=float4(colour,dot(colour,luma)/dot(nativeSky,luma));
    float3 night=clouds.daylight(nativeSky,d,-sun,eye,0,a[b+4],a[b+3]);
    float3 high=clouds.daylight(nativeSky,d,sun,eye+float3(0,0,10000),0,a[b+4],a[b+3]);
    o[i*2+1]=float4(abs(night-nativeSky),length(high-nativeSky));
}""".replace("SUN",xyz(web["sun"])).replace("EYE",xyz(web["eye"]))
    for oc,thr in ((0,web["threshold"][0]),(1,web["threshold"][-1])):
        rows = [(*ray,oc,thr) for ray in web["rays"]]
        colours = run(folder,"camera",camera, dxc_compute, rows)
        gains = sorted(row[3] for row in colours)
        avg = sum(gains)/len(gains)
        print(f"START crop overcast={oc} gain mean={avg:.6f}, range={min(gains):.6f}..{max(gains):.6f}")
        assert 0.8 <= avg <= 1.25 and all(max(row[4:]) < 1e-6 for row in colours)

    # Count real sparse clear-sky coverage in the full view as well as in #2313's fixed luminance crop.
    rows = [(*ray,0,web["threshold"][0],*web["eye"][:2],0,0) for ray in web["frame"]]
    full = run(folder,"full-start",hlsl, dxc_compute, rows)
    open_strip = [row[0] for i,row in enumerate(full) if (i//96+.5)/54 < .05]
    assert max(open_strip) > .01, "the clear sky must show a wisp above the START roofline"
    peak = max(range(len(full)), key=lambda i: full[i][0])
    print(f"START full-frame clear sky before geometry: {sum(v[0] > .01 for v in full)}/{len(full)}"
          f" rays have >1% cover, max={full[peak][0]:.6f} and above-roof max={max(open_strip):.6f}")
    pixel = folder / "precip.hlsl"
    # Catch type/scope and call-site regressions in the entire actual precipitation material.
    ast_module = ast.parse((HERE.parent / "python/build_lighting.py").read_text())
    body = next(a.value.value for a in ast_module.body if isinstance(a, ast.Assign)
                and isinstance(a.targets[0], ast.Name) and a.targets[0].id == "PRECIP_HLSL")
    tag = {"float4":"Scene N B0n B0x B1n B1x B2n B2x B3n B3x SunDir MoonDir MoonPh",
           "float3":"WPos Cam", "float2":"Wind",
           "float":"Time Light Rain Snow Wet Soffit Radius Height Speed Length SlantPerMs SlantMax SnowSpeed Sway Size DriftPerMs DriftMax EAI Night CloudCover MoonRadius Earthshine SkyThreshold Overcast CloudOffsetX CloudOffsetY"}
    params = ",".join(f"{t} {n}" for t,names in tag.items() for n in names.split())
    pixel.write_text(f"float4 precip({params}) {{\n"+sky_clouds.shader(spec)+body+"}\n"+
                     "float4 main(float4 p:SV_Position):SV_Target {return precip("+
                     ",".join({"float4":"p","float3":"p.xyz","float2":"p.xy","float":"p.x"}[t]
                              for t,names in tag.items() for _ in names.split())+");}")
    subprocess.run([opt.dxc,"-T","ps_6_0","-E","main","-Fo",str(folder/"precip.dxil"),str(pixel)],check=True)
assert len(native) == len(reference) == len(samples)
for oc in (0,.125,.4,.7,1):
    pairs = [(n,r) for s,n,r in zip(samples,native,reference) if s[3] == oc]
    worst_shape = max(abs(n[i]-r[i]) for n,r in pairs for i in range(3))
    worst_colour = max(abs(n[i]-r[i]) for n,r in pairs for i in range(4,7))
    cover = [r[0] for _,r in pairs]
    print(f"overcast={oc:.3f} rays={len(pairs)} cover={min(cover):.5f}..{max(cover):.5f} "
          f"max field delta={worst_shape:.7f}, max RGB delta={worst_colour:.7f}")
    assert max(cover) > min(cover) and worst_shape < 0.001 and worst_colour < 0.001
