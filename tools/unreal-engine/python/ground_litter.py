"""Lunden (#2433): fallen autumn leaves and the gravel map for the ground masters of build_materials.py.

The web draws its autumn leaves (src/leaflitter.js, LEAF_LITTER) as a fragment step on the lit ground materials: two
jittered world-space grids of small pinched ellipses, as dense as a baked density map over WALK says (sparse everywhere,
dense under the crowns and along the kerbs) times the month's share and the surface's own share, fading to their mean
tone plus a broken mulch where they get smaller than a pixel. The export carries the density map and the numbers
(measurements.json site.leafLitter); this module turns the map into T_LundenLeafLitter and returns the HLSL that the
grass and gravel Custom nodes run after their own colour: `litter_code(data, kind)` expects float3 `litRGB` and float
`litRough` and inputs WorldCm (absolute world position, cm), Normal (VertexNormalWS), Month (MPC_LundenVegetation) and
LitterMap (the texture object). Unreal X = web x, Unreal Y = web z (tools/unreal-engine/coordinates.mjs).

The gravel map (src/gravelsurface.js gravelData, measurements.json site.gravelSurface) becomes T_LundenGravelColour
(sRGB) and T_LundenGravelSurface (linear: R relief, G roughness), sampled in world-metre UVs by M_LundenGravel.

The textures live in /Game/Lunden/Materials/Textures/ (versioned, LFS) and carry the export's texel hash as
Lunden.TexelHash (not the PNG's bytes, which depend on the browser's encoder): unchanged texels keep the asset,
`check_textures` reports a missing or stale one.
"""
import base64
import os

import unreal

eal = unreal.EditorAssetLibrary
FOLDER = "/Game/Lunden/Materials/Textures"
LITTER = FOLDER + "/T_LundenLeafLitter"
GRAVEL_COLOUR = FOLDER + "/T_LundenGravelColour"
GRAVEL_SURFACE = FOLDER + "/T_LundenGravelSurface"
TAG = "Lunden.TexelHash"


def number(v):
    return f"{float(v):.6f}"


def vec3(c):
    return "float3(" + ", ".join(number(x) for x in c) + ")"


def texture_specs(measurements):
    """{asset path: (png bytes, texel hash, sRGB, clamp, mips, compression)} from measurements.json."""
    site = measurements.get("site", {})
    litter, gravel = site.get("leafLitter"), site.get("gravelSurface")
    if not litter or not gravel:
        raise RuntimeError("Re-export the world: measurements.json has no site.leafLitter / site.gravelSurface (#2433)")
    TC = unreal.TextureCompressionSettings
    return {
        LITTER: (base64.b64decode(litter["density"]["png"]), litter["density"]["hash"], False, True, False, TC.TC_GRAYSCALE),
        GRAVEL_COLOUR: (base64.b64decode(gravel["colorPng"]), gravel["colorHash"], True, False, True, TC.TC_DEFAULT),
        GRAVEL_SURFACE: (base64.b64decode(gravel["surfacePng"]), gravel["surfaceHash"], False, False, True, TC.TC_MASKS),
    }


def _settings_ok(asset, srgb, clamp, mips, compression):
    wrap = unreal.TextureAddress.TA_CLAMP if clamp else unreal.TextureAddress.TA_WRAP
    mip = unreal.TextureMipGenSettings.TMGS_FROM_TEXTURE_GROUP if mips else unreal.TextureMipGenSettings.TMGS_NO_MIPMAPS
    return (isinstance(asset, unreal.Texture2D) and asset.get_editor_property("srgb") == srgb
            and asset.get_editor_property("compression_settings") == compression
            and asset.get_editor_property("mip_gen_settings") == mip
            and all(asset.get_editor_property(a) == wrap for a in ("address_x", "address_y")))


def build_textures(measurements, scratch):
    """Import or keep the three textures; returns {path: 'kept' | 'imported'}."""
    os.makedirs(scratch, exist_ok=True)
    out = {}
    for path, (data, digest, srgb, clamp, mips, compression) in texture_specs(measurements).items():
        asset = eal.load_asset(path) if eal.does_asset_exist(path) else None
        if asset is not None and eal.get_metadata_tag(asset, TAG) == digest and _settings_ok(asset, srgb, clamp, mips, compression):
            out[path] = "kept"
            continue
        name = path.rsplit("/", 1)[1]
        file = os.path.join(scratch, name + ".png")
        with open(file, "wb") as f:
            f.write(data)
        task = unreal.AssetImportTask()
        task.filename = file
        task.destination_path = FOLDER
        task.destination_name = name
        task.automated = True
        task.replace_existing = True
        task.save = False
        unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
        asset = eal.load_asset(path)
        if not isinstance(asset, unreal.Texture2D):
            raise RuntimeError(f"Expected an imported Texture2D at {path}")
        wrap = unreal.TextureAddress.TA_CLAMP if clamp else unreal.TextureAddress.TA_WRAP
        asset.set_editor_property("srgb", srgb)
        asset.set_editor_property("compression_settings", compression)
        asset.set_editor_property("mip_gen_settings", unreal.TextureMipGenSettings.TMGS_FROM_TEXTURE_GROUP if mips
                                  else unreal.TextureMipGenSettings.TMGS_NO_MIPMAPS)
        asset.set_editor_property("address_x", wrap)
        asset.set_editor_property("address_y", wrap)
        if not mips:
            asset.set_editor_property("filter", unreal.TextureFilter.TF_BILINEAR)
        eal.set_metadata_tag(asset, TAG, digest)
        eal.set_metadata_tag(asset, "Lunden.Builder", "tools/unreal-engine/python/ground_litter.py (#2433)")
        if not eal.save_loaded_asset(asset, only_if_is_dirty=False):
            raise RuntimeError(f"could not save {path} (is it locked with git lfs lock and writable?)")
        out[path] = "imported"
    return out


def check_textures(measurements):
    problems = []
    for path, (data, digest, srgb, clamp, mips, compression) in texture_specs(measurements).items():
        asset = eal.load_asset(path) if eal.does_asset_exist(path) else None
        if asset is None:
            problems.append(f"{path}: missing")
        elif eal.get_metadata_tag(asset, TAG) != digest:
            problems.append(f"{path}: stale (the export's PNG changed; run build_materials.py)")
        elif not _settings_ok(asset, srgb, clamp, mips, compression):
            problems.append(f"{path}: wrong sRGB, compression, mip or address settings")
    return problems


def spec_data(measurements):
    """The litter and gravel numbers a material's spec hash and code depend on (the maps by their texel hash only)."""
    site = measurements["site"]
    litter = {k: v for k, v in site["leafLitter"].items() if k not in ("density", "source")}
    litter["density"] = {k: v for k, v in site["leafLitter"]["density"].items() if k != "png"}
    gravel = {k: v for k, v in site["gravelSurface"].items() if k not in ("colorPng", "surfacePng", "source")}
    return {"leafLitter": litter, "gravelSurface": gravel}


def litter_code(data, kind):
    """The HLSL step (src/leaflitter.js litterGLSL, full detail) on litRGB / litRough for surface `kind`."""
    L = data["leafLitter"]
    if kind not in L["kinds"]:
        raise RuntimeError(f"unknown leaf-litter kind {kind}")
    box = L["density"]["box"]
    sx, sz = 1.0 / (box["x1"] - box["x0"]), 1.0 / (box["z1"] - box["z0"])
    months = ", ".join(number(v) for v in L["months"])
    fresh = ", ".join(vec3(c) for c in L["fresh"])
    old = ", ".join(vec3(c) for c in L["old"])
    return f"""
// #2433: src/leaflitter.js litterGLSL (fallen autumn leaves; surface share {L['kinds'][kind]} for '{kind}')
const float litMonths[12] = {{ {months} }};
const float3 litFresh[12] = {{ {fresh} }};
const float3 litOld[12] = {{ {old} }};
int litM = clamp((int)round(Month), 1, 12) - 1;
float2 litW = WorldCm.xy * 0.01;
float litAA = max(length(fwidth(litW)), 1e-4);
if (litMonths[litM] > 0.0) {{
  float litFlat = smoothstep(0.7, 0.9, abs(normalize(Normal).z));
  float2 litUV = (litW - float2({number(box['x0'])}, {number(box['z0'])})) * float2({number(sx)}, {number(sz)});
  float litC = 0.0;
  if (litFlat > 0.0 && litUV.x > 0.0 && litUV.y > 0.0 && litUV.x < 1.0 && litUV.y < 1.0)
    litC = Texture2DSampleLevel(LitterMap, LitterMapSampler, litUV, 0.0).r * litMonths[litM] * {number(L['kinds'][kind])};
  if (litC > 0.004) {{
    float3 litFreshC = litFresh[litM], litOldC = litOld[litM];
    float3 litMean = lerp(litFreshC, litOldC, 0.5) * 0.92;
    float litFar = saturate(litC * {number(L['share'])} * (2.0 - litC * {number(L['share'])}));
    float litMulch = smoothstep({number(L['mulch'][0])}, 1.0, litC) * {number(L['mulch'][1])};
    litRGB = lerp(litRGB, litMean * 0.8, litMulch * litFlat);
    float litDetail = 1.0 - smoothstep({number(L['aa'][0])}, {number(L['aa'][1])}, litAA);
    float3 litLeaf = litMean;
    float litNear = 0.0;
    if (litDetail > 0.0) {{
      float3 litCol[2] = {{ litMean, litMean }};
      float litM2[2] = {{ 0.0, 0.0 }};
      for (int g = 0; g < 2; g++) {{
        // grid 0 = the web's second (coarser) grid at +0.37 m, grid 1 = its finer grid on top
        float cell = g == 0 ? {number(L['cells'][1])} : {number(L['cells'][0])};
        float2 p = g == 0 ? litW + 0.37 : litW;
        float2 id = floor(p / cell) + (g == 0 ? 41.0 : 17.0), q = frac(p / cell) - 0.5;
        float4 hq = frac(float4(id.xyx, id.y) * float4(0.1031, 0.1030, 0.0973, 0.1099));
        hq += dot(hq, hq.wzxy + 33.33);
        float4 h = frac((hq.xxyz + hq.yzzw) * hq.zywx);
        if (h.x < litC) {{
          q -= (h.yz - 0.5) * 0.2;
          float a = h.w * 6.2832, cs = cos(a), sn = sin(a);
          q = float2(cs * q.x + sn * q.y, cs * q.y - sn * q.x);
          float len = lerp({number(L['len'][0])}, {number(L['len'][1])}, frac(h.y * 7.13 + h.z * 3.1)), wid = len * {number(L['wide'])};
          float2 e = q / float2(len, wid);
          float r = length(float2(e.x, e.y / max(1.0 - 0.4 * e.x * e.x, 0.3)));
          float edge = litAA / (cell * wid);
          litM2[g] = 1.0 - smoothstep(1.0 - edge, 1.0 + edge, r);
          float vein = 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.1 + edge, abs(e.y))) * step(abs(e.x), 0.85);
          litCol[g] = lerp(litFreshC, litOldC, frac(h.y * 13.7 + h.z * 5.3)) * (0.78 + 0.22 * (1.0 - min(r * r, 1.0)) + 0.25 * frac(h.w * 31.1)) * vein;
        }}
      }}
      litLeaf = lerp(litCol[0], litCol[1], litM2[1]);
      litNear = max(litM2[0], litM2[1]);
    }}
    float litAlpha = lerp(litFar, litNear, litDetail) * litFlat;
    litRGB = lerp(litRGB, lerp(litMean, litLeaf, litDetail), litAlpha);
    litRough = lerp(litRough, {number(L['rough'])}, max(litAlpha, litMulch * litFlat));
  }}
}}
return float4(litRGB, litRough);
""".strip()


def gravel_code(data):
    """src/gravelsurface.js gravelMaterial in world-metre UVs: the colour (hex / the map's linear mean) times the vertex
    colour (VertexColorWeight) times the stone map times the broad tone; roughness from the surface map's G."""
    G = data["gravelSurface"]
    b = G["broadScale"]
    return f"""
float2 gt = UV / {number(G['tile'])};
float3 stones = Texture2DSample(GravelColour, GravelColourSampler, gt).rgb;
float4 relief = Texture2DSample(GravelSurface, GravelSurfaceSampler, gt);
float tone = sin(dot(UV, float2({number(b[0])}, {number(b[1])}))) * sin(dot(UV, float2({number(b[2])}, {number(b[3])})) + 1.3);
float3 vc = lerp(float3(1.0, 1.0, 1.0), VertexColor.rgb, VertexColorWeight);
float3 litRGB = Color.rgb / {number(G['mean'])} * vc * stones * (1.0 + {number(G['broadStrength'])} * tone);
float litRough = relief.g;
""".strip()
