"""Sky fields from daycycle.js and cloudshadow.js. Unreal positions are centimetres, east/south/up."""
import math


def shader(c):
    def num(x):
        x = float(x)
        if not math.isfinite(x):
            raise ValueError("Invalid sky parameter")
        return repr(x)

    def vec(values):
        return f"float{len(values)}(" + ", ".join(map(num, values)) + ")"

    # Pre-#2371 exports contain only volumetric cloud thresholds. Preserve their sky colour in
    # the precipitation pass so existing ExportFrom artifacts can still be imported and played.
    if "palette" not in c and set(c) == {"clearThr", "thr", "ramp"}:
        return """
struct WebClouds {
    float3 night(float3 color, float3 view, float3 sun, float3 eye, float2 offset, float threshold, float overcast, float inverseExposure) {
        return color;
    }
    float3 daylight(float3 color, float3 view, float3 sun, float3 eye, float2 offset, float threshold, float overcast) {
        return color;
    }
};
"""
    sk, palette = c["sky"], c["palette"]
    # In an Unreal Custom node, local functions are methods on a local struct (no global include dependency).
    return f"""
struct WebClouds {{
    float hash(float2 i, float n) {{
        i -= floor(i / n) * n;
        return frac(sin(dot(i, float2(127.1, 311.7))) * 43758.5453);
    }}
    float noise(float2 p, float n) {{
        float2 i = floor(p), t = frac(p);
        t = t * t * (3.0 - 2.0 * t);
        return lerp(lerp(hash(i,n), hash(i+float2(1,0),n), t.x),
                    lerp(hash(i+float2(0,1),n), hash(i+float2(1,1),n), t.x), t.y);
    }}
    float field(float2 p) {{
        return 0.26 * noise(p*0.5+float2(7,23), {num(c["cells"]/2)})
             + 0.44 * noise(p, {num(c["cells"])}) + 0.30 * noise(p*2+float2(17,5), {num(2*c["cells"])});
    }}
    float3 shape(float3 d, float3 sun, float2 eye, float2 offset, float threshold, float oc) {{
        float2 p = (eye + d.xz / max(d.y, 0.04) * {num(c["height"])} + offset) * {num(1/c["cell"])};
        float base = field(p);
        float n = base + smoothstep({num(sk["fineY"][0])}, {num(sk["fineY"][1])}, d.y) * (
            {num(sk["detail"][0])} * (noise(p*4+float2(3,11), {num(4*c["cells"])})-0.5)
          + {num(sk["detail"][1])} * (noise(p*8+float2(29,7), {num(8*c["cells"])})-0.5));
        n = lerp(0.5, n, smoothstep({num(sk["lowY"][0])}, {num(sk["lowY"][1])}, d.y));
        float thick = smoothstep(threshold-{num(sk["soft"])}, threshold+0.3, n);
        float2 stepSun = normalize(sun.xz + 0.0001) * {num(sk["sunStep"])};
        float shade = saturate((field(p + stepSun) - base) * 3) * smoothstep(0,0.3,sun.y) * thick;
        return float3(cover(n, thick, d.y, threshold, oc), thick, shade);
    }}
    float cover(float n, float thick, float y, float threshold, float oc) {{
        return max(smoothstep(threshold-{num(sk["soft"])}, threshold+{num(sk["soft"]*0.6)}, n),
                   oc * (0.8 + 0.2*thick)) * smoothstep({num(sk["horizon"][0])}, {num(sk["horizon"][1])}, y);
    }}
    float3 sky(float3 base, float3 sampleCloud, float oc) {{
        float thick = sampleCloud.y, shade = sampleCloud.z;
        float3 cloud = lerp(float3(0.95,0.95,0.95), float3(0.5,0.53,0.57), oc*0.8);
        cloud *= 1 - {num(sk["shade"])} * thick * (0.6 + 0.4*oc) - {num(sk["selfShade"])} * shade * (1 - 0.75*oc);
        cloud = lerp(cloud*float3(0.9,0.95,1.04),cloud,thick)*(1+0.1*(1-thick)*(1-shade));
        return lerp(base, cloud, 0.85*sampleCloud.x);
    }}
    float3 daylight(float3 nativeSky, float3 d, float3 sun, float3 eye, float2 offset, float threshold, float oc) {{
        // Retain the atmospheric sun disc/halo, twilight, high-altitude sky and #2366's entire night branch.
        float weight = smoothstep(0,0.35,sun.y) * (1-smoothstep({num(c['top'])},{num(c['top']+c['fade'])},eye.z))
                     * (1-smoothstep(0.99,0.9993,dot(d,sun))) * smoothstep(0,{num(sk['horizon'][1])},d.y);
        if (weight <= 0) return nativeSky;
        float3 zenith = lerp({vec(palette['dayZenith'])}, {vec(palette['overcast'])}, oc*0.85);
        float3 horizon = lerp({vec(palette['dayHorizon'])}, {vec(palette['overcast'])}, oc*0.7);
        float3 base = lerp(horizon,zenith,pow(max(0,d.y),0.55));
        float3 target = sky(base,shape(d,sun,eye.xy,offset,threshold,oc),oc);
        // #2313's actual sky luminance (scene-linear) sets the scale. Use a neutral 0.5 noise sample for
        // the expected sky in this direction/weather, then apply the web's spatial luminance and chroma.
        float thick = smoothstep(threshold-{num(sk["soft"])},threshold+0.3,0.5);
        float3 neutral = sky(base,float3(cover(0.5,thick,d.y,threshold,oc),thick,0),oc);
        float3 luma = float3(0.2126,0.7152,0.0722);
        return lerp(nativeSky,target * dot(nativeSky,luma)/max(0.0001,dot(neutral,luma)),weight);
    }}
    float3 night(float3 nativeSky, float3 d, float3 sun, float3 eye, float2 offset, float threshold, float oc, float inverseExposure) {{
        // SKY_DUSK.sun's rising envelope: full source night below -0.17, native twilight
        // retained from -0.04 upwards. This does not port the source twilight colours.
        float weight = (1-smoothstep(-0.17,-0.04,sun.y))
                     * (1-smoothstep({num(c['top'])},{num(c['top']+c['fade'])},eye.z));
        if (weight <= 0) return nativeSky;
        // DayCycle.update with day=0, glow=0 and dusk=0; linear THREE.Color endpoints.
        float3 zenith = lerp({vec(palette['nightZenith'])}, {vec(palette['overcast'])}*0.15, oc*0.85);
        float3 horizon = lerp({vec(palette['nightHorizon'])}, {vec(palette['overcast'])}*0.2, oc*0.7);
        float3 base = lerp(horizon,zenith,pow(max(0,d.y),0.55));
        float3 shapeNight = shape(d,sun,eye.xy,offset,threshold,oc);
        float thick = shapeNight.y, shade = shapeNight.z;
        float3 cloud = lerp(float3(0.16,0.18,0.24),float3(0.08,0.09,0.11),oc*0.8);
        cloud *= 1 - {num(sk['shade'])}*thick*(0.6+0.4*oc) - {num(sk['selfShade'])}*shade*(1-0.75*oc);
        cloud = lerp(cloud*float3(0.9,0.95,1.04),cloud,thick)*(1+0.1*(1-thick)*(1-shade));
        float3 target = lerp(base,cloud,shapeNight.x*0.85);
        target = lerp(horizon,target,smoothstep(-0.02,0.02,d.y));
        // skyFrag has colorspace_fragment but NO tonemapping_fragment. Invert the
        // existing Neutral black offset, then EAI cancels exposure. Night RGB stays
        // below Neutral's 0.76 compression knee, so this inverse is exact there.
        float x = min(target.r,min(target.g,target.b));
        float offset = x < 0.04 ? sqrt(max(x,0)/6.25)-x : 0.04;
        return lerp(nativeSky,(target+offset)*inverseExposure,weight);
    }}
}};
"""
