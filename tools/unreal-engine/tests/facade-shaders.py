"""Run the generated UE material functions on Vulkan against the actual web GLSL and window routines.

Usage: python3 facade-shaders.py measurements.json [--compiler glslangValidator] [--runner vkrunner]
A software Vulkan device (Mesa lavapipe) works. All compiler/runner intermediates stay in a temporary directory.
"""
import argparse
import json
import math
from pathlib import Path
import struct
import subprocess
import sys
import tempfile

TESTS = Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS.parent / "python"))
import facade_scene as scene

args = argparse.ArgumentParser(description=__doc__)
args.add_argument("measurements", type=Path)
args.add_argument("--compiler", default="glslangValidator")
args.add_argument("--runner", default="vkrunner")
args.add_argument("--dxc", help="also compile each native material body as a Direct3D SM6 pixel shader")
opt = args.parse_args()
spec = json.loads(opt.measurements.read_text())["site"]["facadeLighting"]
rows = scene.validate(spec)
types = {"PositionWS":3, "ViewDir":3, "UV":2}


def generate(kind, pixel=False):
    names = scene.FIELDS[kind] + scene.INPUTS[kind]
    params, values, offset = [], [], 0
    for n in names:
        size = types.get(n,1)
        typ = "float"+(str(size) if size>1 else "")
        params.append(typ+" "+n)
        parts = [f"data[b+{off}]" for off in range(offset,offset+size)]
        values.append(typ+"("+",".join(parts)+")" if size>1 else parts[0])
        offset += size
    body = f"float4 shade({','.join(params)}) {{\n{scene.shader(kind,spec)}\n}}\n"
    if pixel:
        return (body + "StructuredBuffer<float> data : register(t0);\n"
                f"float4 main(float4 pos : SV_Position) : SV_Target {{uint b=uint(pos.x)*{offset};"
                f"return shade({','.join(values)});}}")
    return (body +
            "[[vk::binding(0)]] StructuredBuffer<float> data;\n"
            "[[vk::binding(1)]] RWStructuredBuffer<float4> result;\n"
            f"[numthreads(1,1,1)] void main(uint3 id : SV_DispatchThreadID) {{uint b=id.x*{offset};"
            f"result[id.x]=shade({','.join(values)});}}")


def run(folder, name, code, samples, hlsl=True):
    src, spv, test, buf = (folder / (name+s) for s in (".comp",".spv",".shader_test",".bin"))
    src.write_text(code)
    subprocess.run([opt.compiler,"-V","-S","comp","-e","main",*(["-D"] if hlsl else []),"-o",str(spv),str(src)],check=True)
    words = [f"{i:x}" for i, in struct.iter_unpack("<I",spv.read_bytes())]
    lines = ["[compute shader binary]", *(" ".join(words[i:i+16]) for i in range(0,len(words),16)), "[test]"]
    for i,sample in enumerate(samples):
        lines.append(f"ssbo 0 subdata float {i*len(sample)*4} "+" ".join(str(float(v)) for v in sample))
    lines += [f"ssbo 1 {len(samples)*16}", f"compute {len(samples)} 1 1"]
    test.write_text("\n".join(lines)+"\n")
    subprocess.run([opt.runner,"-q","-B","1","-b",str(buf),str(test)],check=True)
    result = list(struct.iter_unpack("<4f",buf.read_bytes()))
    assert len(result) == len(samples)
    return result


def compare(kind, actual, expected, tolerance):
    for i,(a,e) in enumerate(zip(actual,expected,strict=True)):
        if not all(math.isclose(x,y,abs_tol=tolerance) for x,y in zip(a,e,strict=True)):
            raise ValueError(f"{kind} sample {i}: GPU {a} expected {e}")
    print(f"{kind}: {len(actual)} native shader samples passed")


with tempfile.TemporaryDirectory(prefix="facade-shader-") as tmp:
    folder = Path(tmp)
    if opt.dxc:
        for kind in scene.FIELDS:
            src = folder / (kind + ".hlsl")
            src.write_text(generate(kind,pixel=True))
            subprocess.run([opt.dxc,"-T","ps_6_6","-E","main","-Ges","-WX","-Fo",str(folder / (kind+".dxil")),str(src)],check=True)
        print("Direct3D SM6: four pixel shader bodies passed")
    rooms = []
    for r in (r for r in rows if r["kind"]=="room"):
        nx,ny = r["normal"]
        x,y,z = r["xyz"]
        for side,up,incidence,night,power in [(0,0,1,0,1),(.28,.39,.8,1,1),(-.43,-.17,.61,.91,0),(.1,.17,.02,.7,1)]:
            w,h = r["size"]
            lateral = math.sqrt(1-incidence**2)*.8
            vertical = math.sqrt(1-incidence**2)*.6
            eye = [nx*incidence+ny*lateral, ny*incidence-nx*lateral, vertical]
            world = [x+w*side*ny,y-w*side*nx,z+up*h]
            rooms.append(r["values"]+world+eye+[night,power])
    native = run(folder,"room",generate("room"),rooms)
    reference = subprocess.check_output(["node",str(TESTS/"facade-room-reference.mjs")],text=True)
    def vector(values):
        return "vec"+str(len(values))+"("+",".join(str(float(x)) for x in values)+")"
    dusk = spec["facadeGlow"]
    for token,value in {"INPUT_COUNT":len(rooms[0]), "DAY_LEVEL":vector(spec["roomLevels"]["day"]),
                        "NIGHT_LEVEL":vector(spec["roomLevels"]["night"]), "DUSK_ON":dusk["on"],
                        "WINDOW_EMISSIVE":vector([x*dusk["intensity"] for x in scene.linear_colour(dusk["window"])])}.items():
        reference = reference.replace(token,str(value))
    web = run(folder,"room-web",reference,rooms,hlsl=False)
    compare("room", [(*[v*a for v in (r,g,b)],a) for r,g,b,a in native], web, .001)
    windows = [r for r in rows if r["kind"]=="window"]
    samples, expected = [], []
    ref = subprocess.check_output(["node",str(TESTS/"facade-window-reference.mjs"),str(opt.measurements)],text=True)
    for i,hour,night,power,sec,u,v,rgb in json.loads(ref):
        r = windows[i]
        x,y,z = r["xyz"]
        nx,ny = r["normal"]
        w,h = r["size"]
        samples.append(r["values"]+[x+(u-.5)*w*ny,y-(u-.5)*w*nx,z+(v-.5)*h,hour,night,power,sec])
        expected.append(rgb)
    compare("window", [v[:3] for v in run(folder,"window",generate("window"),samples)], expected, .0005)
    samples = [[direct,n,p,latch] for direct in [0,1] for n in [0,.32,.36,1] for p in [0,1] for latch in [0,1]]
    compare("lens",run(folder,"lens",generate("lens"),samples),
            [scene.linear_colour(dusk["lampOn" if (n>dusk["on"] and p if d else latch) else "lampOff"])+[1] for d,n,p,latch in samples],1e-6)
    surfaces = spec["surfaces"]
    samples = [scene.wash_values(s)+[uv,.5,k] for s in surfaces for uv in [.5,.65,1] for k in [0,.3,1]]
    expected = [[c*s["peak"]*k*round(255*(1-abs(uv*2-1))**1.5)/255 for c in scene.linear_colour(s["colour"])]+[1]
                for s in surfaces for uv in [.5,.65,1] for k in [0,.3,1]]
    compare("wash",run(folder,"wash",generate("wash"),samples),expected,1e-6)
