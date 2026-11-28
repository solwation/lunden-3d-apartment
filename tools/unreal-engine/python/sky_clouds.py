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
    float3 night(float3 color, float3 view, float3 sun, float3 eye, float2 offset, float threshold, float overcast, float inverseExposure, float3 moon, float3 moonPhase, float moonRadius, float earthshine) {
        return color;
    }
    float3 daylight(float3 color, float3 view, float3 sun, float3 eye, float2 offset, float threshold, float overcast, float inverseExposure) {
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
    float3 daylight(float3 nativeSky, float3 d, float3 sun, float3 eye, float2 offset, float threshold, float oc, float inverseExposure) {{
        // #2434: SKY_DUSK.sun ends at 0.16 and its last halo at 0.17. Keep the
        // existing twilight/night, high-flight and atmospheric sun-disc paths.
        // November16 14:00 has sun.y=0.177840..., so the source gradient applies
        // fully, including its horizon. These are source transition boundaries,
        // not new colour/exposure fitting controls.
        float weight = smoothstep(0.16,0.17,sun.y) * (1-smoothstep({num(c['top'])},{num(c['top']+c['fade'])},eye.z))
                     * (1-smoothstep(0.99,0.9993,dot(d,sun)));
        if (weight <= 0) return nativeSky;
        float day = smoothstep(-0.08,0.18,sun.y), night = 1-day;
        float glowAmt = (1-smoothstep(0,0.35,abs(sun.y)))*smoothstep(-0.15,0.05,sun.y);
        // Actual THREE.Color(0xff8a3c), checked against DayCycle.uGlow.
        float3 glow = float3(1,0.2541520943200296,0.04518620437910499);
        float3 zenith = lerp({vec(palette['nightZenith'])},{vec(palette['dayZenith'])},day);
        float3 horizon = lerp({vec(palette['nightHorizon'])},{vec(palette['dayHorizon'])},day);
        horizon = lerp(horizon,{vec(palette['duskHorizon'])},glowAmt*0.6);
        zenith = lerp(zenith,{vec(palette['overcast'])}*(0.15+0.85*day),oc*0.85);
        horizon = lerp(horizon,{vec(palette['overcast'])}*(0.2+0.8*day),oc*0.7);
        float3 base = lerp(horizon,zenith,pow(max(0,d.y),0.55));
        float s = max(dot(d,sun),0);
        // HAZE.scatter: the same linear low-sun halo that skyFragmentShader adds.
        float3 scatter = float3(1,0.86,0.66)*(0.12*day*(1-oc)*smoothstep(-0.05,0.1,sun.y));
        base += (glow*glowAmt+scatter)*pow(s,6)*(1-max(d.y,0));
        float3 sampleCloud = shape(d,sun,eye.xy,offset,threshold,oc);
        float thick = sampleCloud.y, shade = sampleCloud.z;
        float3 cloud = lerp(float3(0.95,0.95,0.95),float3(0.16,0.18,0.24),night)+glow*glowAmt*0.35;
        cloud = lerp(cloud,lerp(float3(0.5,0.53,0.57),float3(0.08,0.09,0.11),night),oc*0.8);
        cloud *= 1-{num(sk['shade'])}*thick*(0.6+0.4*oc)-{num(sk['selfShade'])}*shade*(1-0.75*oc);
        cloud = lerp(cloud*float3(0.9,0.95,1.04),cloud,thick)*(1+0.1*(1-thick)*(1-shade));
        float3 target = lerp(base,cloud,sampleCloud.x*0.85);
        target = lerp(horizon,target,smoothstep(-0.02,0.02,d.y));
        // Source sky has colorspace_fragment but NO tonemapping_fragment. Invert
        // the COMPLETE installed Neutral curve, including compression/desaturation,
        // then cancel exposure exactly as the existing night branch does. Inverse
        // domain failures preserve the old sky; no clipped/fitted approximation.
        float peak = max(target.r,max(target.g,target.b));
        if (any(target < 0) || peak >= 1) return nativeSky;
        float3 preBlack = target;
        if (peak >= 0.76) {{
            float inputPeak = 0.0576/(1-peak)+0.52;
            float g = 1-1/(0.15*(inputPeak-peak)+1);
            preBlack = (target-peak*g)/(1-g)*(inputPeak/peak);
        }}
        if (any(preBlack < 0) || any(!isfinite(preBlack))) return nativeSky;
        float x = min(preBlack.r,min(preBlack.g,preBlack.b));
        float blackOffset = x < 0.04 ? sqrt(x/6.25)-x : 0.04;
        return lerp(nativeSky,(preBlack+blackOffset)*inverseExposure,weight);
    }}
    float3 night(float3 nativeSky, float3 d, float3 sun, float3 eye, float2 offset, float threshold, float oc, float inverseExposure, float3 moon, float3 moonPhase, float moonRadius, float earthshine) {{
        // SKY_DUSK.sun's rising envelope: full source night below -0.17, native twilight
        // retained from -0.04 upwards. This does not port the source twilight colours.
        float weight = (1-smoothstep(-0.17,-0.04,sun.y))
                     * (1-smoothstep({num(c['top'])},{num(c['top']+c['fade'])},eye.z));
        if (weight <= 0) return nativeSky;
        // DayCycle.update with day=0, glow=0 and dusk=0; linear THREE.Color endpoints.
        float3 zenith = lerp({vec(palette['nightZenith'])}, {vec(palette['overcast'])}*0.15, oc*0.85);
        float3 horizon = lerp({vec(palette['nightHorizon'])}, {vec(palette['overcast'])}*0.2, oc*0.7);
        float3 base = lerp(horizon,zenith,pow(max(0,d.y),0.55));
        // Source skyFragmentShader: moon and stars are part of the RAW sky,
        // before cloud occlusion and the final Neutral inverse. No exposure here.
        float m = max(dot(d,moon),0.0);
        if (m > cos(moonRadius*1.6)) {{
            float3 pd = d-moon*m, su = sun-moon*dot(sun,moon);
            float3 uu = su/max(length(su),1e-4), vv = cross(moon,uu);
            float2 xy = float2(dot(pd,uu),dot(pd,vv))/sin(moonRadius);
            float rr = length(xy), z = sqrt(max(1-rr*rr,0.0));
            float lit = smoothstep(-0.04,0.08,xy.x*moonPhase.x+z*moonPhase.y);
            float3 e1 = normalize(cross(float3(0,1,0),moon));
            float2 mp = float2(dot(pd,e1),dot(pd,cross(moon,e1)))/sin(moonRadius);
            float mare = 0.80+0.20*smoothstep(-0.5,0.6,sin(mp.x*2.6+1.1)*sin(mp.y*2.1-0.4)+0.5*sin(mp.x*5.0-mp.y*3.5));
            float disc = (1-smoothstep(0.9,1.0,rr))*step(-0.05,moon.y);
            base = lerp(base,float3(0.92,0.94,1.0)*mare*(0.85+0.15*z),disc*lit);
            base = lerp(base,float3(0.92,0.94,1.0)*earthshine,disc*(1-lit)*0.9);
        }}
        base += float3(0.25,0.28,0.35)*pow(m,400.0)*moonPhase.z*moonPhase.z;
        float3 q = floor(d*260.0);
        float star = step(0.9975,frac(sin(dot(q,float3(12.9898,78.233,37.719)))*43758.5453))*smoothstep(0.02,0.2,d.y);
        base += star*(0.6+0.4*frac(sin(dot(q+1,float3(12.9898,78.233,37.719)))*43758.5453));
        float3 shapeNight = shape(d,sun,eye.xy,offset,threshold,oc);
        float thick = shapeNight.y, shade = shapeNight.z;
        float3 cloud = lerp(float3(0.16,0.18,0.24),float3(0.08,0.09,0.11),oc*0.8);
        cloud *= 1 - {num(sk['shade'])}*thick*(0.6+0.4*oc) - {num(sk['selfShade'])}*shade*(1-0.75*oc);
        cloud = lerp(cloud*float3(0.9,0.95,1.04),cloud,thick)*(1+0.1*(1-thick)*(1-shade));
        float3 target = lerp(base,cloud,shapeNight.x*0.85);
        target = lerp(horizon,target,smoothstep(-0.02,0.02,d.y));
        // Invert the COMPLETE composed sky, including the bright moon. Targets
        // outside Neutral's nonnegative finite inverse domain retain the native
        // path; they are not clipped or assigned a fitted brightness.
        float peak = max(target.r,max(target.g,target.b));
        if (any(target < 0) || peak >= 1) return nativeSky;
        float3 preBlack = target;
        if (peak >= 0.76) {{
            float inputPeak = 0.0576/(1-peak)+0.52;
            float g = 1-1/(0.15*(inputPeak-peak)+1);
            preBlack = (target-peak*g)/(1-g)*(inputPeak/peak);
        }}
        if (any(preBlack < 0) || any(!isfinite(preBlack))) return nativeSky;
        float x = min(preBlack.r,min(preBlack.g,preBlack.b));
        float blackOffset = x < 0.04 ? sqrt(max(x,0)/6.25)-x : 0.04;
        return lerp(nativeSky,(preBlack+blackOffset)*inverseExposure,weight);
    }}
}};
"""
