"""Run both actual river material bodies as SM6 pixel shaders on Vulkan. CPU Vulkan (Mesa lavapipe) works.

python3 tools/unreal-engine/tests/river-shaders.py unreal/Lunden/Import/measurements.json --dxc dxc --runner vkrunner
Expected pixels come from the web helpers in river-water.test.mjs. Each sample spans two 2×2 derivative quads.
"""
import argparse
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "python"))
from river_material import shaders


def fragment(spec, flowing):
    normal, sky = shaders(spec, flowing)
    return """
StructuredBuffer<float4> samples : register(t0);
float3 normalAt(float3 WorldCm, float3 EyeCm, float3 BaseNormal, float2 Frame, float2 FlowDir,
                float2 CrossShore, float RiverTime, float Face, float SnowLies) {
""" + normal + """
}
float3 skyAt(float3 SurfaceNormal, float3 EyeVector, float Face, float3 SunDir, float Rain, float Snow,
             float2 Frame, float2 CrossShore, float SnowLies) {
""" + sky + """
}
float4 main(float4 pos : SV_Position) : SV_Target {
    uint slot = (uint(pos.y) / 2) * 5;
    float4 location = samples[slot], flow = samples[slot+1], bank = samples[slot+2], light = samples[slot+3];
    float3 view = samples[slot+4].xyz;
    float2 xy = location.xy + (frac(pos.xy * 0.5) * 2.0 - 0.5) * location.w;
    float3 world = float3(xy, -7.0) * 100.0;
    float2 frame = """ + ("float2(floor(flow.x/8.0), frac(flow.x/8.0))" if flowing else "float2(bank.z,0.0)") + """;
    float2 crossShore = float2(flow.y,bank.y);
    float3 N = normalAt(world, world+view*location.z*100.0, float3(0,0,1), frame, flow.zw,
                        crossShore, bank.x, light.w, bank.w);
    float3 colour = skyAt(N, view, light.w, float3(0,0,light.x), light.y, light.z, frame, crossShore, bank.w);
    return float4(pos.x < 2.0 ? N : colour, 1.0);
}
"""


def execute(folder, mode, spec, cases, dxc, runner):
    src, spv, dxil, script = (folder / (mode + suffix) for suffix in (".hlsl", ".spv", ".dxil", ".shader_test"))
    src.write_text(fragment(spec, mode == "flow"))
    base = [dxc, "-T", "ps_6_0", "-E", "main", str(src), "-WX"]
    subprocess.run(base + ["-Fo", str(dxil)], check=True)
    subprocess.run(base + ["-spirv", "-Fo", str(spv)], check=True)
    words = [f"{word:x}" for word, in struct.iter_unpack("<I", spv.read_bytes())]
    lines = ["[require]", "framebuffer R32G32B32A32_SFLOAT", f"fbsize 4 {len(cases) * 2}", "[vertex shader passthrough]",
             "[fragment shader binary]", *(" ".join(words[i:i+16]) for i in range(0, len(words), 16)), "[test]"]
    for i, case in enumerate(cases):
        lines.append(f"ssbo 0 subdata float {i * 80} " + " ".join(str(float(v)) for v in case["input"]))
    lines += ["draw rect -1 -1 2 2", "tolerance 0.00005"]
    for i, case in enumerate(cases):
        for x, channel in ((0, "normal"), (2, "sky")):
            rgba = ", ".join(str(float(v)) for v in [*case[channel], 1])
            lines.append(f"probe rect rgba ({x}, {2*i}, 1, 1) ({rgba})")
    script.write_text("\n".join(lines) + "\n")
    subprocess.run([runner, str(script)], check=True)
    print(f"{mode}: {len(cases)} normals and {len(cases)} reflections match the web", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("measurements", type=Path)
    parser.add_argument("--dxc", default="dxc")
    parser.add_argument("--runner", default="vkrunner")
    args = parser.parse_args()
    spec = json.loads(args.measurements.read_text())["site"]["riverSurface"]
    vectors = json.loads(subprocess.check_output(["node", str(HERE / "river-water.test.mjs"), "--vectors"]))
    with tempfile.TemporaryDirectory() as folder:
        for mode, cases in vectors.items():
            execute(Path(folder), mode, spec, cases, args.dxc, args.runner)


if __name__ == "__main__":
    main()
