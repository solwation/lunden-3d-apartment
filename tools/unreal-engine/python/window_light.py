"""#2394: web window/sun-bounce irradiance from the explicit L1007 export snapshot.

No Unreal import or native lighting/exposure conversion. Sources are src/windowlight.js
and src/sunbounce.js; config, geometry, transmission and ray reach come from the export.
"""
import math


def validate(data):
    """Validate measurements.site.windowDaylight; return it without mutation."""
    def number(value, name, low=None, high=None):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError("windowDaylight: finite number required: " + name)
        if (low is not None and value < low) or (high is not None and value > high):
            raise ValueError("windowDaylight: out of range: " + name)
        return value

    def vector(value, name, size, low=None, high=None):
        if not isinstance(value, (list, tuple)) or len(value) != size:
            raise ValueError("windowDaylight: wrong vector size: " + name)
        for i, value_i in enumerate(value):
            number(value_i, name + "." + str(i), low, high)

    try:
        if data["version"] != 1 or data["region"] != "L1007" or data["runtimeCoverage"] != "export-snapshot":
            raise ValueError("windowDaylight: expected L1007 export-snapshot version 1")
        if data["coordinates"] != {"units": "metres", "axes": "x east, y up, z south"}:
            raise ValueError("windowDaylight: expected web metres and axes")
        cfg, box, sources = data["config"], data["box"], data["sources"]
        if cfg["rays"] != 32:
            raise ValueError("windowDaylight: expected the web's 32 visibility rays")
        if isinstance(cfg["max"], bool) or not isinstance(cfg["max"], int) or cfg["max"] < 1:
            raise ValueError("windowDaylight: positive integer max required")
        for name in ("base", "skyWarm", "well", "sunClip", "sunBeyond"):
            number(cfg[name], name, 0, 1)
        for name in ("gain", "wrap", "glassWrap", "bounceWrap", "sunGain", "sunWrap", "near", "sunMinHeight"):
            number(cfg[name], name, 0)
        for name in ("spread", "sunMaxArea"):
            number(cfg[name], name, 1e-12)
        number(cfg["warm"], "warm", 0, 0xFFFFFF)
        if int(cfg["warm"]) != cfg["warm"]:
            raise ValueError("windowDaylight: packed sRGB warm colour must be an integer")
        vector(cfg["tint"], "tint", 3, 0)
        vector(cfg["floor"], "floor", 3, 0, 255)
        for axis in ("x", "y", "z"):
            lo, hi = number(box[axis + "0"], axis + "0"), number(box[axis + "1"], axis + "1")
            if hi <= lo:
                raise ValueError("windowDaylight: empty region box")
        if not isinstance(sources, list) or not sources:
            raise ValueError("windowDaylight: nonempty sources required")
        ids = set()
        for s in sources:
            if not isinstance(s["id"], str) or not s["id"] or s["id"] in ids:
                raise ValueError("windowDaylight: missing/duplicate source id")
            ids.add(s["id"])
            if s["kind"] not in ("window", "well") or s["facade"] not in ("north", "south", "well"):
                raise ValueError("windowDaylight: unsupported source kind/facade")
            if (s["kind"] == "well") != (s["facade"] == "well"):
                raise ValueError("windowDaylight: inconsistent well source")
            if isinstance(s["level"], bool) or s["level"] not in (0, 1):
                raise ValueError("windowDaylight: unsupported L1007 level")
            for key in ("x", "y", "z", "nx", "nz", "ox", "oz", "y0", "y1"):
                number(s[key], key)
            if abs(s["nx"] ** 2 + s["nz"] ** 2 - 1) > 1e-6:
                raise ValueError("windowDaylight: source normal must be unit length")
            for key in ("hw", "hh"):
                number(s[key], key, 1e-12)
            number(s["pass"], "pass", 0, 1)
            number(s["share"], "share", 0, 1)
            if s["y1"] <= s["y0"]:
                raise ValueError("windowDaylight: empty source band")
            vector(s["reach"], "reach", 32, 0)
    except (KeyError, TypeError) as exc:
        raise ValueError("windowDaylight: missing or invalid contract field: " + str(exc)) from exc
    return data


def hlsl(data):
    """Return a WebWindowDaylight struct definition, with no globals or instance.

    irradiance returns only ADDED linear web sky/warm/sun irradiance. Call active()
    before applying base_factor()/tint() to an existing ambient contribution.
    Static reach/pass are export-snapshot inputs; live changes are not represented.
    Runtime skyRgb/sunRgb must be linear; sunDirWeb and nWeb must be unit vectors.
    """
    validate(data)
    cfg, sources, box = data["config"], data["sources"], data["box"]

    def f(value):
        result = format(float(value), ".17g")
        return result if any(c in result for c in ".eE") else result + ".0"

    def v(values):
        return "float" + str(len(values)) + "(" + ", ".join(f(x) for x in values) + ")"

    def array(rows):
        return ",\n            ".join(v(row) for row in rows)

    def linear(value):
        value /= 255
        return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4

    warm = [linear((int(cfg["warm"]) >> shift) & 255) for shift in (16, 8, 0)]
    floor = [(component / 255) ** 2.2 * cfg["sunGain"] for component in cfg["floor"]]
    replacements = {
        "COUNT": str(len(sources)), "MAX": str(min(cfg["max"], len(sources))),
        "BOXMIN": v([box["x0"], box["y0"], box["z0"]]),
        "BOXMAX": v([box["x1"], box["y1"], box["z1"]]),
        "CENTRES": array([[s["x"], s["y"], s["z"], s["pass"]] for s in sources]),
        "GLASS": array([[s["nx"], s["nz"], s["hw"], s["hh"]] for s in sources]),
        "BANDS": array([[s["ox"], s["oz"], s["y0"], s["y1"]] for s in sources]),
        "SHARES": array([[s["share"], int(s["kind"] == "well")] for s in sources]),
        "REACH": ", ".join(f(r) for s in sources for r in s["reach"]),
        "WARM": v(warm), "FLOOR": v(floor), "TINT": v(cfg["tint"]),
    }
    for name in ("base", "near", "gain", "skyWarm", "wrap", "glassWrap", "bounceWrap", "sunWrap",
                 "sunMinHeight", "sunClip", "sunMaxArea", "sunBeyond"):
        replacements[name] = f(cfg[name])
    replacements["SPREAD_PI"] = f(math.pi / cfg["spread"] ** 2)
    replacements["PRESERVE_ORDER"] = "true" if len(sources) <= cfg["max"] else "false"
    template = r"""// Generated from the real L1007 export-snapshot; web metres/axes, linear irradiance.
// src/windowlight.js WindowLight.update/windowLight and src/sunbounce.js.
struct WebWindowDaylight
{
    float base_factor(float dayShare)
    {
        return 1.0 - (1.0 - @@base@@) * saturate(dayShare);
    }
    float3 tint(float dayShare)
    {
        // (1-base_factor)/(1-config.base) simplifies to dayShare, including base=1.
        return lerp(float3(1,1,1), @@TINT@@, saturate(dayShare));
    }
    bool active(float3 pWeb, float3 cameraWeb, float dayShare)
    {
        float3 lo = @@BOXMIN@@, hi = @@BOXMAX@@;
        float3 outside = max(max(lo - cameraWeb, cameraWeb - hi), 0.0);
        return dayShare > 0.001 && length(outside) <= @@near@@
            && all(pWeb >= lo) && all(pWeb <= hi);
    }
    float ray_reach(int i, float angle, float reaches[@@COUNT@@ * 32])
    {
        float t = clamp((angle / 3.14159265358979323846 + 0.5) * 31.0, 0.0, 31.0);
        int k = (int)min(floor(t), 30.0);
        return lerp(reaches[i * 32 + k], reaches[i * 32 + k + 1], t - (float)k);
    }
    float3 irradiance(float3 pWeb, float3 nWeb, float3 cameraWeb, float dayShare,
                      float skyStrength, float3 skyRgb, float3 sunDirWeb,
                      float sunIntensity, float3 sunRgb)
    {
        if (!active(pWeb, cameraWeb, dayShare)) return float3(0,0,0);
        const float4 centres[@@COUNT@@] = { @@CENTRES@@ };
        const float4 glass[@@COUNT@@] = { @@GLASS@@ };
        const float4 bands[@@COUNT@@] = { @@BANDS@@ };
        const float2 shares[@@COUNT@@] = { @@SHARES@@ };
        const float reaches[@@COUNT@@ * 32] = { @@REACH@@ };
        // Stable nearest-source selection (ties retain original export order).
        int selected[@@MAX@@];
        float distances[@@MAX@@];
        for (int j = 0; j < @@MAX@@; ++j) { selected[j] = -1; distances[j] = 3.402823466e+38; }
        for (int i = 0; i < @@COUNT@@; ++i)
        {
            if (@@PRESERVE_ORDER@@) { selected[i] = i; continue; }
            float dist = dot(centres[i].xyz-cameraWeb, centres[i].xyz-cameraWeb);
            for (int j = 0; j < @@MAX@@; ++j)
            {
                if (dist < distances[j])
                {
                    for (int k = @@MAX@@ - 1; k > j; --k)
                    { distances[k] = distances[k-1]; selected[k] = selected[k-1]; }
                    distances[j] = dist; selected[j] = i; break;
                }
            }
        }
        float sky = 0, bounce = 0, sunB = 0;
        for (int slot = 0; slot < @@MAX@@; ++slot)
        {
            int i = selected[slot];
            if (i < 0) continue;
            float4 a = centres[i], b = glass[i], c = bands[i];
            float share = shares[i].x;
            if (a.w <= 0 || pWeb.y < c.z || pWeb.y > c.w) continue;
            float2 N = b.xy, T = float2(-N.y, N.x);
            float3 rel = pWeb - a.xyz;
            if (dot(rel.xz,N) < -0.01) continue;
            float2 s = clamp(float2(dot(rel.xz,T),rel.y), -b.zw, b.zw);
            float3 d = float3(T.x*s.x,s.y,T.y*s.x) - rel;
            float r2 = max(dot(d,d),1e-4);
            float3 l = d * rsqrt(r2);
            float cosW = (max(-dot(l.xz,N),0.0)+@@glassWrap@@)/(1.0+@@glassWrap@@);
            float nl = dot(nWeb,l);
            float cosR = max(nl+@@wrap@@,0.0)/(1.0+@@wrap@@);
            float area = 4.0*b.z*b.w;
            float e = a.w*area/(@@SPREAD_PI@@*r2+area);
            if (e < 1e-4) continue;
            float eb = e*share*(nl+@@bounceWrap@@)/(1.0+@@bounceWrap@@);
            e *= (1.0-share)*cosW*cosR;
            float2 o = pWeb.xz-c.xy;
            float fo = dot(o,N);
            if (fo > 0)
            {
                float reach = ray_reach(i,atan2(dot(o,T),fo),reaches);
                float visibility = 1.0-smoothstep(reach+0.02,reach+0.2,length(o));
                e *= visibility; eb *= visibility;
                // The sun patch is computed at the same floorY=y0+.1 as the web.
                float cosine = -dot(sunDirWeb.xz,N);
                if (shares[i].y < 0.5 && sunDirWeb.y >= @@sunMinHeight@@
                    && cosine > 1e-3 && sunIntensity > 0 && a.w > 0)
                {
                    float travel = (a.y-(c.z+0.1))/sunDirWeb.y;
                    if (travel > 0)
                    {
                        float3 patch = a.xyz-sunDirWeb*travel;
                        patch.y = c.z+0.1;
                        float flux = sunIntensity*area*cosine*@@sunClip@@*a.w;
                        float patchArea = min(@@sunMaxArea@@,area*cosine*@@sunClip@@/sunDirWeb.y);
                        float2 po = patch.xz-c.xy;
                        float patchReach = ray_reach(i,atan2(dot(po,T),dot(po,N)),reaches);
                        float pd = length(po);
                        if (patchReach > 0 && pd > patchReach)
                        { patch.xz = c.xy+po*(patchReach/pd); flux *= @@sunBeyond@@; }
                        float3 dp = patch-pWeb;
                        float rp = max(dot(dp,dp),1e-3);
                        float3 lp = dp*rsqrt(rp);
                        sunB += flux*max(-lp.y,0.0)*max(dot(nWeb,lp)+@@sunWrap@@,0.0)
                            /(1.0+@@sunWrap@@)/(3.14159265358979323846*rp+patchArea)*visibility;
                    }
                }
            }
            sky += e; bounce += eb;
        }
        float3 warm = @@WARM@@;
        float strength = @@gain@@*skyStrength;
        return lerp(skyRgb,warm,@@skyWarm@@)*strength*sky
             + warm*strength*bounce + sunRgb*@@FLOOR@@*sunB;
    }
};
"""
    for key, value in replacements.items():
        template = template.replace("@@" + key + "@@", value)
    if "@@" in template:
        raise RuntimeError("Unexpanded window daylight HLSL token")
    return template
