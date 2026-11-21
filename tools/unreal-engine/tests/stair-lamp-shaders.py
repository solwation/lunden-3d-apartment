"""Render the generated stair light functions against the exported web lamp-wash polygons. Requires DXC and VkRunner.

    python3 tools/unreal-engine/tests/stair-lamp-shaders.py unreal/Lunden/Import/measurements.json
"""
import argparse
import json
import math
from pathlib import Path
import struct
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "python"))
import stair_lamp

# Points of intersection with the exported L1007 mesh under corresponding #2321 camera crops (Unreal axes, metres).
PROBES = {"shaft-wall": [3.815, 6.704, 2.289], "tread": [4.510, 7.090, 0.812],
          "riser": [4.359, 7.109, 0.713], "inner-wall": [5.551, 6.962, 2.358],
          "landing": [5.551, 6.962, 3.724], "hall-door": [3.352, 6.173, 2.534],
          "living-room": [5.542, 12.234, 2.304], "upper-bedroom": [2.63, 9.25, 5.1]}


def expected(boxes, row, point, eye):
    distance = max(0, min(max(max(box[i]-point[i], point[i]-box[i+3]) for i in range(3)) for box in boxes))
    t = min(1, distance / 0.05)
    outside = t*t*(3-2*t)
    weights = 0
    total = 0
    for profile in row["stairVisibility"]:
        w = profile["weight"]
        total += w
        if "rays" not in profile:
            weights += w
            continue
        def seen(p):
            x, z = p[0]-profile["origin"][0], p[1]-profile["origin"][1]
            rays = profile["rays"]
            u = (math.atan2(z,x)/math.tau % 1)*len(rays)
            i, f = math.floor(u), u % 1
            reach = rays[i % len(rays)]*(1-f) + rays[(i+1) % len(rays)]*f
            return math.hypot(x,z) <= reach + 0.05
        def floor(p):
            return (p[2] > profile["split"]) == bool(profile["level"])
        if (profile["canPool"] and (eye[2] > profile["viewerSplit"]) == bool(profile["level"]) and seen(eye)) or (floor(point) and seen(point)):
            weights += w
    return outside + (1-outside)*weights/total


def run(folder, row, bounds, cases, dxc, runner):
    src, spv, dxil, test = (folder / ("lamp" + ext) for ext in (".hlsl",".spv",".dxil",".shader_test"))
    function = "float fn(float3 WorldCm, float3 EyeCm) {\n" + stair_lamp.shader(bounds, row["stairVisibility"]) + "\n}\n"
    src.write_text(function+"StructuredBuffer<float4> points : register(t0);\nfloat4 main(float4 p:SV_Position) : SV_Target {"
                   "uint i=2*(uint)p.x;return fn(points[i].xyz*100.0,points[i+1].xyz*100.0).xxxx;}")
    base = [dxc, "-T", "ps_6_0", "-E", "main", "-WX", str(src)]
    subprocess.run(base + ["-Fo",str(dxil)],check=True)
    subprocess.run(base + ["-spirv","-Fo",str(spv)],check=True)
    words = [f"{word:x}" for word, in struct.iter_unpack("<I", spv.read_bytes())]
    lines=["[require]", "framebuffer R32G32B32A32_SFLOAT",f"fbsize {len(cases)} 2", "[vertex shader passthrough]",
           "[fragment shader binary]", *(" ".join(words[i:i+16]) for i in range(0,len(words),16)), "[test]"]
    for i, (point, eye, _) in enumerate(cases):
        lines.append(f"ssbo 0 subdata float {32*i} " + " ".join(map(str,[*point,0,*eye,0])))
    lines+=["draw rect -1 -1 2 2","tolerance 0.00005"]
    for i, (_, _, value) in enumerate(cases):
        lines.append(f"probe rect rgba ({i}, 0, 1, 1) ({value}, {value}, {value}, {value})")
    test.write_text("\n".join(lines)+"\n")
    subprocess.run([runner,"-q",str(test)],check=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("measurements",type=Path)
    parser.add_argument("--dxc",default="dxc")
    parser.add_argument("--runner",default="vkrunner")
    args=parser.parse_args()
    data=json.loads(args.measurements.read_text())
    bounds=data["stair"]["lightBounds"]
    masks=[row for row in data["lights"] if row.get("stairVisibility")]
    views=json.loads((HERE.parents[2] / "unreal/Lunden/Tests/views.json").read_text())
    cameras={v["id"]:[v["x"],v["z"],v["feetY"]+views["standingEyeHeightM"]] for v in views["views"]}
    # Actual source/geometry regression. These cases have opposite outcomes on adjacent stair surfaces.
    def transfer(room,level,point,*,name=None,near=None):
        matches=[r for r in masks if r["level"]==level and (r.get("name")==name if name else r.get("room")==room)]
        if near is not None:
            matches.sort(key=lambda r: math.dist(near,r["position"]["web"]))
        return expected(bounds,matches[0],PROBES[point],cameras["stairs"])
    assert transfer("Klk",0,"tread")==0 and transfer("Klk",0,"inner-wall")==1
    assert transfer("Vardagsrum",0,"shaft-wall")==0
    assert transfer(None,1,"shaft-wall",name="rottinglampan")==0
    assert transfer(None,0,"shaft-wall",name="långlampan")==0
    assert transfer("Hall",0,"hall-door",near=[2.88,2.75,6.34])==1
    assert transfer("Badrum",0,"hall-door")==0
    with tempfile.TemporaryDirectory() as directory:
        count=0
        for row in masks:
            cases=[]
            for camera in ("stairs","living-room","upper-floor"):
                eye=cameras[camera]
                for tag, point in PROBES.items():
                    value=expected(bounds,row,point,eye)
                    if tag in ("living-room","upper-bedroom"):
                        assert value==1, "The controls are outside the affected stair and passage surfaces"
                    cases.append((point,eye,value))
            run(Path(directory),row,bounds,cases,args.dxc,args.runner)
            count+=len(cases)
    print(f"STAIR_LIGHT_FUNCTIONS_OK {len(masks)} source lights, {count} Vulkan pixel checks")


if __name__=="__main__":
    main()
