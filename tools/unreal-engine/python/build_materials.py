"""Lunden (#2282): build the hand-made surface materials that tools/unreal-engine/material-map.json lists.

Every entry under `materials` becomes one asset in /Game/Lunden/Materials/:
  - "graph": "constant"  a material with constant base colour, roughness and metallic (M_LundenWallPaint, M_LundenCollision);
  - "graph": "surface"   the plain opaque master M_LundenSurface (vector BaseColor, scalars Roughness and Metallic);
  - "graph": "tiled"     the procedural master M_LundenTiled: tiles, slabs, planks, boards, bricks and fine aggregate
                         drawn in UV metres by one Custom HLSL node (the export keeps the web's metre UVs, but its
                         canvas textures do not travel, so the pattern is rebuilt here from the web's sizes and colours);
  - "graph": "glass"     the translucent glazing master M_LundenGlass;
  - "graph": "grass"     the lawn master M_LundenGrass (#2308): src/grass.js's detail map rebuilt procedurally in UV
                         metres (a grey ground with short random blade strokes, tinted by the lawn's colour);
  - "graph": "gltf-vertex-color"  (#2321) a copy of Interchange's glTF master `from` (M_Default, M_Unlit) whose `output`
                         (BaseColor, or EmissiveColor for the unlit master) is multiplied by the vertex colour: the
                         importer re-parents every vertex-coloured key's instance onto it (material-map.json `vertexColor`);
  - "graph": "baked-light"  (#2431) an unlit master for the stairwells' MeshBasicMaterial walls (src/core.js,
                         src/corehouse.js): the web bakes its hall lamps into the vertex colours and draws them unlit, so
                         the glazed entrances glow at night. Emissive = vertex colour x the display gain (river_material
                         .display_gain, 2^-EXPOSURE_BIAS) x `color` x (emergency + (1 - emergency) x PowerAvailable);
                         with `opacity` it is translucent (a transparent pane: colour x opacity over the scene).
                         Built under /Game/Lunden/Generated/ by import_world.py itself (no versioned asset, no LFS lock);
  - "parent": <master>   a MaterialInstanceConstant with the entry's `params`; `"twoSided": true` overrides the master's
                         face setting (an open wire or strip seen from inside, #2395), and `"raster": "<reason>"` is
                         stamped as Lunden.Raster, which sends every imported mesh wearing it to the raster path
                         (prepare_nanite_materials.py: Nanite simplifies millimetre wires away, #2395).
Colours are sRGB hex as the web writes them (converted to linear). Opaque materials get the Nanite usage flag and
instances a persisted Nanite usage override, so prepare_nanite_materials.py finds nothing to change (#2276). Each asset
carries the entry's `source` and `assumption` as metadata tags Lunden.Source / Lunden.Assumption (plan-material's
*guess* markers stay attached to the material) and Lunden.SpecHash: an asset whose spec hash is unchanged is skipped,
so a second run writes nothing. --force rebuilds every asset in place (paths and references stay valid).

Build the season collection with build_seasons.py before rebuilding the lawn master.
Run headless (Windows checkout; take `git lfs lock` on each Materials/*.uasset it will write first):
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/run-python.ps1 tools/unreal-engine/python/build_materials.py [--force | --check]
Logs LUNDEN_MATERIAL <path>: created|updated|kept and finally LUNDEN_MATERIALS_OK.
"""
import hashlib
import json
import os
from pathlib import Path
import sys

import unreal

sys.path.insert(0, str(Path(__file__).parent))
import backdrop_material  # noqa: E402
import river_material  # noqa: E402
import collection_ids  # noqa: E402

eal = unreal.EditorAssetLibrary
mel = unreal.MaterialEditingLibrary
NANITE = unreal.MaterialUsage.MATUSAGE_NANITE
CALENDAR = "/Game/Lunden/Seasons/MPC_LundenVegetation"

# One cell of a pattern in UV metres: Size = (w along U, h along V). Stagger shifts each column along V by a random
# share of a cell (parquet), Bond shifts each row along U (half bond), Joint is the joint width in metres. Returns
# linear colour (rgb) and roughness (a).
TILED_GRID = r"""
float2 S = max(Size.xy, float2(0.001, 0.001));
float2 p = UV / S;
float col = floor(p.x);
p.y += Stagger * frac(sin(col * 12.9898 + 1.7) * 43758.5453);
float row = floor(p.y);
p.x += Bond * row;
float2 cell = floor(p);
float2 f = frac(p);
float2 d = min(f, 1.0 - f) * S;
float edge = min(d.x, d.y);
float hj = Joint * 0.5;
float joint = Joint > 0.0 ? 1.0 - smoothstep(hj, hj + max(hj, 0.0006), edge) : 0.0;
"""
# A screen pixel covers an area of the web's running-bond texture. Integrate the periodic face width
# over that footprint for each of the two alternating rows. The complement is the mortar coverage.
# #2393: the web draws this brick from a canvas of a few hundred px per UV unit, whose 1.5-2 px joints the canvas
# box-filters and the GPU then magnifies bilinearly. Close up that blur (TexelBlur, in UV units) shows as soft joints
# that never reach the full mortar colour; it replaces the pixel footprint while it is the wider of the two, so distant
# walls keep the plain pixel integration (a narrower footprint brings #2318's moiré back on Hus L's courtyard façade).
# BedJoint, when > 0, is the bed joint along V (the web's canvases draw 1.5 px bed and 2 px head joints).
BRICK_FILTER = r"""
if (FilterBrick > 0.5) {
    float2 footprint = max(fwidth(UV), TexelBlur) / S;
    float2 gap = saturate(float2(Joint, BedJoint > 0.0 ? BedJoint : Joint) / S);
    float4 span = max(float4(footprint.xx, 0.5 * footprint.yy), 0.0001);
    float4 faceWidth = float4(1.0 - gap.xx, 0.5 * (1.0 - gap.yy));
    float x = frac(UV.x / S.x);
    float y = frac(0.5 * UV.y / S.y);
    float4 center = float4(x, frac(x + Bond), y, frac(y + 0.5))
                  - float4(0.5 * gap.xx, 0.25 * gap.yy);
    float4 lo = center - 0.5 * span;
    float4 hi = center + 0.5 * span;
    float4 area = (floor(hi) - floor(lo)) * faceWidth
                + min(frac(hi), faceWidth) - min(frac(lo), faceWidth);
    float4 coverage = saturate(area / span);
    joint = saturate(1.0 - dot(coverage.xy, coverage.zw));
    float2 cells = fwidth(UV) / S;
    float detail = 1.0 - smoothstep(0.5, 2.0, max(cells.x, cells.y));
    Variation *= detail;
    Grain *= detail;
    HueJitter *= detail;
    SaturationJitter *= detail;
    LightnessJitter *= detail;
}
"""
# #2427: HueJitter, SaturationJitter and LightnessJitter are the full ranges of the web canvases' per-brick
# THREE.Color.offsetHSL((rand - 0.5) * range, ...) (src/exterior.js brickTexture, src/surroundings.js facadeTexture and
# brickCourses). three.js offsets the HSL of the linear (working-space) colour, and the face colour is linear here too,
# so each cell draws from the same distribution as the canvas's bricks (its linear mean stays the face colour). The
# block runs after the face line of TILED_FINISH (tiled_code), so the other materials' spec hashes stay unchanged.
TILED_FACE = "float3 face = Color.rgb * saturate(1.0 + Variation * (h * 2.0 - 1.0));\n"
TILED_HSL = r"""if (HueJitter + SaturationJitter + LightnessJitter > 0.0) {
    float mx = max(face.r, max(face.g, face.b));
    float mn = min(face.r, min(face.g, face.b));
    float dc = mx - mn;
    float hl = 0.5 * (mx + mn);
    float hs = dc > 0.0 ? (hl <= 0.5 ? dc / (mx + mn) : dc / (2.0 - mx - mn)) : 0.0;
    float hh = 0.0;
    if (dc > 0.0) {
        if (mx == face.r) hh = (face.g - face.b) / dc + (face.g < face.b ? 6.0 : 0.0);
        else if (mx == face.g) hh = (face.b - face.r) / dc + 2.0;
        else hh = (face.r - face.g) / dc + 4.0;
        hh /= 6.0;
    }
    float3 jit = frac(sin(float3(dot(cell, float2(269.5, 183.3)), dot(cell, float2(419.2, 371.9)), dot(cell, float2(61.7, 97.3)))) * 43758.5453) - 0.5;
    hh = frac(hh + HueJitter * jit.x);
    hs = saturate(hs + SaturationJitter * jit.y);
    hl = saturate(hl + LightnessJitter * jit.z);
    float hi = hl <= 0.5 ? hl * (1.0 + hs) : hl + hs - hl * hs;
    float lo = 2.0 * hl - hi;
    float3 t = frac(hh + float3(1.0 / 3.0, 0.0, -1.0 / 3.0));
    float3 rise = lo + (hi - lo) * 6.0 * t;
    float3 fall = lo + (hi - lo) * 6.0 * (2.0 / 3.0 - t);
    face = lerp(lerp(lerp(rise, hi, step(1.0 / 6.0, t)), fall, step(0.5, t)), lo, step(2.0 / 3.0, t));
}
"""
TILED_FINISH = r"""float h = frac(sin(dot(cell, float2(127.1, 311.7))) * 43758.5453);
float3 face = Color.rgb * saturate(1.0 + Variation * (h * 2.0 - 1.0));
float g = sin(UV.x * 210.0 + sin(UV.y * 6.0 + h * 40.0) * 2.0 + h * 17.0);
face *= 1.0 + Grain * g;
return float4(lerp(face, JointColor.rgb, joint), lerp(Roughness, JointRoughness, joint));
"""
# #2308: src/grass.js grassTexture in UV metres (the lawns keep the web's metre UVs, grassUV). The ground is grey
# Ground.x - noise * Ground.y (sRGB levels); blade strokes, one per Cell (m) with a random angle, length within
# BladeLength (m) and grey within BladeRange, StrokeWidth (m) wide; blue is tinted by StrawTint / BladeTint as on the
# canvas. The map multiplies the lawn's Color (and the vertex colour by VertexColorWeight), as three.js multiplies
# map and colour. Strokes fade into their mean where a cell spans less than about two pixels (no shimmer far away).
# Soft drier / lusher patches as src/grassdetail.js applyGrassPatches: a value-noise field (PatchCells lattices per Tile
# m, equal weights) times PatchContrast, shaped s * |s|^0.3, multiplies the linear colour by 1 + dry * Dry - lush * Lush.
# Tussocks as GRASS.tufts: TuftCount per Tile, one per cell at a random place with a radius within TuftRadius (m), each a
# soft dark base (TuftShade) as the canvas's radial gradient (its blades are left to the stroke layer).
GRASS_HLSL = r"""
float2 cellSize = float2(Cell, Cell);
float2 base = floor(UV / cellSize);
float fw = max(length(ddx(UV)), length(ddy(UV)));
float blade = 0.0, bladeV = 0.0;
for (int i = -1; i <= 1; i++) {
  for (int j = -1; j <= 1; j++) {
    float2 c = base + float2(i, j);
    float3 h = frac(sin(float3(dot(c, float2(127.1, 311.7)), dot(c, float2(269.5, 183.3)), dot(c, float2(419.2, 371.9)))) * 43758.5453);
    float2 a = (c + h.xy) * cellSize;
    float ang = h.z * 6.2831853;
    float len = lerp(BladeLength.x, BladeLength.y, frac(h.x * 7.13 + h.y * 3.17));
    float2 b = a + float2(cos(ang), sin(ang)) * len;
    float2 pa = UV - a, ba = b - a;
    float t = saturate(dot(pa, ba) / max(dot(ba, ba), 1e-8));
    float d = length(pa - ba * t);
    float w = 1.0 - smoothstep(StrokeWidth * 0.5, StrokeWidth * 0.5 + fw, d);
    if (w > blade) { blade = w; bladeV = lerp(BladeRange.x, BladeRange.y, frac(h.y * 13.7 + h.z * 5.3)); }
  }
}
float n = frac(sin(dot(floor(UV / (StrokeWidth * 1.4)), float2(12.9898, 78.233))) * 43758.5453);
float groundV = Ground.x - n * Ground.y;
float meanGround = Ground.x - 0.5 * Ground.y;
float nearW = saturate(1.0 - fw / (Cell * 0.5));
float3 groundRGB = lerp(meanGround, groundV, nearW) * float3(1.0, 1.0, StrawTint);
float3 bladeRGB = bladeV * float3(1.0, 1.0, BladeTint);
float3 srgb = lerp(groundRGB, bladeRGB, blade * nearW);
float3 lin = pow(saturate(srgb), 2.2);
float field = 0.0;
for (int k = 0; k < 2; k++) {
  float cells = k == 0 ? PatchCells.x : PatchCells.y;
  float2 q = UV / Tile * cells;
  float2 q0 = floor(q), qf = frac(q);
  float2 e = qf * qf * (3.0 - 2.0 * qf);
  float o = k * 17.0;
  float v00 = frac(sin(dot(q0 + o, float2(127.1, 311.7))) * 43758.5453) * 2.0 - 1.0;
  float v10 = frac(sin(dot(q0 + float2(1, 0) + o, float2(127.1, 311.7))) * 43758.5453) * 2.0 - 1.0;
  float v01 = frac(sin(dot(q0 + float2(0, 1) + o, float2(127.1, 311.7))) * 43758.5453) * 2.0 - 1.0;
  float v11 = frac(sin(dot(q0 + float2(1, 1) + o, float2(127.1, 311.7))) * 43758.5453) * 2.0 - 1.0;
  field += 0.5 * lerp(lerp(v00, v10, e.x), lerp(v01, v11, e.x), e.y);
}
float tc = Tile / sqrt(max(TuftCount, 1.0));
float2 tb = floor(UV / tc);
float shade = 0.0;
for (int ti = -1; ti <= 1; ti++) {
  for (int tj = -1; tj <= 1; tj++) {
    float2 c = tb + float2(ti, tj);
    float3 h = frac(sin(float3(dot(c, float2(41.3, 289.1)), dot(c, float2(173.9, 61.7)), dot(c, float2(97.4, 223.3)))) * 43758.5453);
    float r = lerp(TuftRadius.x, TuftRadius.y, h.z) * 0.8;
    float d = length(UV - (c + h.xy) * tc);
    shade = max(shade, TuftShade * (1.0 - smoothstep(0.0, r, d)));
  }
}
lin *= pow(1.0 - shade, 2.2);
float sp = clamp(field * PatchContrast, -1.0, 1.0);
sp = sp * pow(abs(sp), 0.3);
lin *= 1.0 + max(0.0, -sp) * Dry.rgb - max(0.0, sp) * Lush.rgb;
float3 vc = lerp(float3(1.0, 1.0, 1.0), VertexColor.rgb, VertexColorWeight);
// src/grass.js grassMaterial: the summer lawn/roadside tint grades towards GRASS.autumn in linear space.
const float autumnMix[12] = { AUTUMN_MIX };
float3 lawn = lerp(Color.rgb, Autumn.rgb, autumnMix[clamp((int)round(Month), 1, 12) - 1]);
return float4(lin * lawn * vc, Roughness);
"""
GRASS_SCALARS = {"Cell": 0.0334, "StrokeWidth": 0.0044, "StrawTint": 0.94, "BladeTint": 0.91, "VertexColorWeight": 0.0,
                 "Roughness": 1.0, "Tile": 1.6, "PatchContrast": 1.5, "TuftCount": 22.0, "TuftShade": 0.14}
GRASS_VECTORS = {"Color": "#609548", "Ground": (0.957, 0.094, 0.0), "BladeRange": (0.745, 0.957, 0.0),
                 "BladeLength": (0.0125, 0.0438, 0.0), "PatchCells": (8.0, 17.0, 0.0), "Dry": (0.26, 0.17, 0.02),
                 "Lush": (0.19, 0.09, 0.22), "TuftRadius": (0.044, 0.0875, 0.0)}
TILED_SCALARS = {"Joint": 0.003, "Bond": 0.0, "Stagger": 0.0, "Variation": 0.0, "Grain": 0.0, "Roughness": 0.8,
                 "JointRoughness": 0.95, "FilterBrick": 0.0, "BedJoint": 0.0, "TexelBlur": 0.0, "HueJitter": 0.0,
                 "SaturationJitter": 0.0, "LightnessJitter": 0.0}
TILED_VECTORS = {"Size": (0.2, 0.2, 0.0), "Color": "#ffffff", "JointColor": "#b9bbbb"}


def repo_root():
    return os.path.normpath(os.path.join(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()), "..", ".."))


def linear(hex_text):
    """An sRGB hex colour (as the web writes it) as a linear colour."""
    v = hex_text.lstrip("#")

    def lin(c):
        c = int(c, 16) / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return unreal.LinearColor(lin(v[0:2]), lin(v[2:4]), lin(v[4:6]), 1.0)


def vector(value):
    if isinstance(value, str):
        return linear(value)
    x, y, z = (list(value) + [0.0, 0.0, 0.0])[:3]
    return unreal.LinearColor(float(x), float(y), float(z), 0.0)


def collection_reads(spec):
    """#2408: {collection: parameter names} the entry's graph reads through CollectionParameter expressions."""
    if spec.get("graph") == "grass":
        return {CALENDAR: ("Month",)}
    if spec.get("graph") == "river":
        return river_material.reads(spec)
    if spec.get("graph") == BAKED:
        return {river_material.WEATHER: ("PowerAvailable",)}
    return {}


def spec_hash(path, spec):
    parts = [path, spec, TILED_GRID + TILED_FINISH] + ([GRASS_HLSL] if spec.get("graph") == "grass" else [])  # other hashes unchanged
    if spec.get("graph") == "river":
        parts.append(Path(river_material.__file__).read_text(encoding="utf-8"))
        parts.append(river_material.display_gain())  # #2410: follows build_lighting.EXPOSURE_BIAS
    if spec.get("graph") == "tiled":
        parts.append(BRICK_FILTER)
        parts.append(TILED_HSL)  # #2427
    if spec.get("graph") == backdrop_material.GRAPH:
        parts.extend([backdrop_material.canvas_hash(spec), Path(backdrop_material.__file__).read_text(encoding="utf-8")])
    if spec.get("graph") == BAKED:
        parts.append(river_material.display_gain())  # follows build_lighting.EXPOSURE_BIAS, as the river (#2410)
    if spec.get("graph") == GLTF_VC:  # a copy of an engine material: a new engine version rebuilds it
        parts.append(unreal.SystemLibrary.get_engine_version())
    reads = collection_reads(spec)
    if reads:  # #2408: a collection rebuilt with new parameter GUIDs rebuilds its readers, and --check fails until then
        parts.append({"collectionIds": collection_ids.ids(reads)})
    return hashlib.sha256(json.dumps(parts, sort_keys=True).encode("utf-8")).hexdigest()[:16]


# ---------------------------------------------------------------- graphs
def scalar_param(m, name, value, x, y):
    e = mel.create_material_expression(m, unreal.MaterialExpressionScalarParameter, x, y)
    e.set_editor_property("parameter_name", name)
    e.set_editor_property("default_value", float(value))
    return e


def vector_param(m, name, value, x, y):
    e = mel.create_material_expression(m, unreal.MaterialExpressionVectorParameter, x, y)
    e.set_editor_property("parameter_name", name)
    e.set_editor_property("default_value", vector(value))
    return e


def constant_graph(m, spec):
    base = mel.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -400, 0)
    base.set_editor_property("constant", linear(spec["baseColor"]))
    mel.connect_material_property(base, "", unreal.MaterialProperty.MP_BASE_COLOR)
    for prop, key, y in ((unreal.MaterialProperty.MP_ROUGHNESS, "roughness", 200), (unreal.MaterialProperty.MP_METALLIC, "metallic", 300)):
        c = mel.create_material_expression(m, unreal.MaterialExpressionConstant, -400, y)
        c.set_editor_property("r", float(spec[key]))
        mel.connect_material_property(c, "", prop)


def surface_graph(m, spec):
    mel.connect_material_property(vector_param(m, "BaseColor", "#ffffff", -400, 0), "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(scalar_param(m, "Roughness", 0.8, -400, 200), "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(scalar_param(m, "Metallic", 0.0, -400, 300), "", unreal.MaterialProperty.MP_METALLIC)


def tiled_code():
    if TILED_FACE not in TILED_FINISH:
        raise RuntimeError("TILED_FINISH lost its face line")
    return (TILED_GRID + BRICK_FILTER + TILED_FINISH.replace(TILED_FACE, TILED_FACE + TILED_HSL)).strip()


def tiled_graph(m, spec):
    custom = mel.create_material_expression(m, unreal.MaterialExpressionCustom, -500, 0)
    names = ["UV"] + list(TILED_VECTORS) + list(TILED_SCALARS)
    inputs = []
    for name in names:
        ci = unreal.CustomInput()
        ci.set_editor_property("input_name", name)
        inputs.append(ci)
    custom.set_editor_property("inputs", inputs)
    custom.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT4)
    custom.set_editor_property("description", "LundenTiled")
    custom.set_editor_property("code", tiled_code())
    uv = mel.create_material_expression(m, unreal.MaterialExpressionTextureCoordinate, -900, -200)
    if not mel.connect_material_expressions(uv, "", custom, "UV"):
        raise RuntimeError("could not connect UV")
    y = 0
    for name, value in TILED_VECTORS.items():
        if not mel.connect_material_expressions(vector_param(m, name, value, -900, y), "", custom, name):
            raise RuntimeError("could not connect " + name)
        y += 150
    for name, value in TILED_SCALARS.items():
        if not mel.connect_material_expressions(scalar_param(m, name, value, -900, y), "", custom, name):
            raise RuntimeError("could not connect " + name)
        y += 100
    rgb = mel.create_material_expression(m, unreal.MaterialExpressionComponentMask, -250, 0)
    for c, on in (("r", True), ("g", True), ("b", True), ("a", False)):
        rgb.set_editor_property(c, on)
    rough = mel.create_material_expression(m, unreal.MaterialExpressionComponentMask, -250, 200)
    for c, on in (("r", False), ("g", False), ("b", False), ("a", True)):
        rough.set_editor_property(c, on)
    mel.connect_material_expressions(custom, "", rgb, "")
    mel.connect_material_expressions(custom, "", rough, "")
    mel.connect_material_property(rgb, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
    metal = mel.create_material_expression(m, unreal.MaterialExpressionConstant, -250, 350)
    metal.set_editor_property("r", 0.0)
    mel.connect_material_property(metal, "", unreal.MaterialProperty.MP_METALLIC)


def grass_code(spec):
    return GRASS_HLSL.strip().replace("AUTUMN_MIX", ", ".join(map(str, spec["autumnMix"])))


def seasonal_grass(material, spec):
    """Check the saved base-colour path. UE resolves the collection parameter's GUID to its name on load."""
    rgb = mel.get_material_property_input_node(material, unreal.MaterialProperty.MP_BASE_COLOR)
    if not isinstance(rgb, unreal.MaterialExpressionComponentMask):
        return False
    sources = mel.get_inputs_for_material_expression(material, rgb)
    if len(sources) != 1 or not isinstance(sources[0], unreal.MaterialExpressionCustom):
        return False
    shader = sources[0]
    if shader.get_editor_property("code").splitlines() != grass_code(spec).splitlines():
        return False
    pins = dict(zip(mel.get_material_expression_input_names(shader), mel.get_inputs_for_material_expression(material, shader)))
    month, autumn = pins.get("Month"), pins.get("Autumn")
    calendar = eal.load_asset(CALENDAR)
    return (calendar is not None and isinstance(month, unreal.MaterialExpressionCollectionParameter)
            and month.get_editor_property("collection") == calendar
            and str(month.get_editor_property("parameter_name")) == "Month"
            and isinstance(autumn, unreal.MaterialExpressionVectorParameter)
            and str(autumn.get_editor_property("parameter_name")) == "Autumn")


def grass_graph(m, spec):
    custom = mel.create_material_expression(m, unreal.MaterialExpressionCustom, -500, 0)
    names = ["UV", "VertexColor", "Month", "Autumn"] + list(GRASS_VECTORS) + list(GRASS_SCALARS)
    inputs = []
    for name in names:
        ci = unreal.CustomInput()
        ci.set_editor_property("input_name", name)
        inputs.append(ci)
    custom.set_editor_property("inputs", inputs)
    custom.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT4)
    custom.set_editor_property("description", "LundenGrass")
    custom.set_editor_property("code", grass_code(spec))
    calendar = eal.load_asset(CALENDAR)
    if not calendar:
        raise RuntimeError("Run build_seasons.py before building the seasonal grass master")
    month = mel.create_material_expression(m, unreal.MaterialExpressionCollectionParameter, -900, -500)
    month.set_editor_property("collection", calendar)
    month.set_editor_property("parameter_name", "Month")
    autumn = vector_param(m, "Autumn", spec["autumn"], -900, -430)
    if not mel.connect_material_expressions(month, "", custom, "Month") or not mel.connect_material_expressions(autumn, "", custom, "Autumn"):
        raise RuntimeError("Could not connect the grass month and autumn tint")
    uv = mel.create_material_expression(m, unreal.MaterialExpressionTextureCoordinate, -900, -300)
    vc = mel.create_material_expression(m, unreal.MaterialExpressionVertexColor, -900, -200)
    if not mel.connect_material_expressions(uv, "", custom, "UV") or not mel.connect_material_expressions(vc, "", custom, "VertexColor"):
        raise RuntimeError("could not connect UV / VertexColor")
    y = 0
    for name, value in GRASS_VECTORS.items():
        if not mel.connect_material_expressions(vector_param(m, name, value, -900, y), "", custom, name):
            raise RuntimeError("could not connect " + name)
        y += 150
    for name, value in GRASS_SCALARS.items():
        if not mel.connect_material_expressions(scalar_param(m, name, value, -900, y), "", custom, name):
            raise RuntimeError("could not connect " + name)
        y += 100
    rgb = mel.create_material_expression(m, unreal.MaterialExpressionComponentMask, -250, 0)
    for c, on in (("r", True), ("g", True), ("b", True), ("a", False)):
        rgb.set_editor_property(c, on)
    rough = mel.create_material_expression(m, unreal.MaterialExpressionComponentMask, -250, 200)
    for c, on in (("r", False), ("g", False), ("b", False), ("a", True)):
        rough.set_editor_property(c, on)
    mel.connect_material_expressions(custom, "", rgb, "")
    mel.connect_material_expressions(custom, "", rough, "")
    mel.connect_material_property(rgb, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
    metal = mel.create_material_expression(m, unreal.MaterialExpressionConstant, -250, 350)
    metal.set_editor_property("r", 0.0)
    mel.connect_material_property(metal, "", unreal.MaterialProperty.MP_METALLIC)


def glass_graph(m, spec):
    m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    m.set_editor_property("translucency_lighting_mode", unreal.TranslucencyLightingMode.TLM_SURFACE)
    mel.connect_material_property(vector_param(m, "BaseColor", "#a9cce3", -400, 0), "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(scalar_param(m, "Opacity", 0.1, -400, 150), "", unreal.MaterialProperty.MP_OPACITY)
    mel.connect_material_property(scalar_param(m, "Roughness", 0.02, -400, 250), "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(scalar_param(m, "Specular", 0.5, -400, 350), "", unreal.MaterialProperty.MP_SPECULAR)


GLTF_VC = "gltf-vertex-color"
BAKED = "baked-light"  # #2431: generated at import time (prepare_generated_materials), so it lives under Generated/
VC_OUTPUTS = {"BaseColor": unreal.MaterialProperty.MP_BASE_COLOR, "EmissiveColor": unreal.MaterialProperty.MP_EMISSIVE_COLOR}


def build_gltf_vertex_color(path, spec, existing):
    """#2321: duplicate Interchange's glTF master and multiply its colour output by the vertex colour. A copy keeps every
    parameter name, so an imported instance keeps its values when the importer re-parents it here. An existing asset
    is deleted first (only the importer's generated instances reference it; a changed spec changes the map hash, which
    re-imports them)."""
    folder, name = path.rsplit("/", 1)
    unreal.AssetRegistryHelpers.get_asset_registry().scan_paths_synchronous([spec["from"].rsplit("/", 1)[0]], True)
    source = eal.load_asset(spec["from"])
    if not isinstance(source, unreal.Material):
        raise RuntimeError(f"{path}: source master {spec['from']} does not exist")
    if existing is not None and not eal.delete_asset(path):
        raise RuntimeError(f"could not delete {path} to rebuild it (is it locked with git lfs lock and writable?)")
    m = unreal.AssetToolsHelpers.get_asset_tools().duplicate_asset(name, folder, source)
    if m is None:
        raise RuntimeError(f"could not duplicate {spec['from']} to {path}")
    prop = VC_OUTPUTS[spec["output"]]
    node = mel.get_material_property_input_node(m, prop)
    out = mel.get_material_property_input_node_output_name(m, prop)
    if node is None:
        raise RuntimeError(f"{path}: {spec['from']} has nothing on {spec['output']}")
    vc = mel.create_material_expression(m, unreal.MaterialExpressionVertexColor, node.get_editor_property("material_expression_editor_x") - 250,
                                        node.get_editor_property("material_expression_editor_y") + 250)
    mul = mel.create_material_expression(m, unreal.MaterialExpressionMultiply, node.get_editor_property("material_expression_editor_x") + 300,
                                         node.get_editor_property("material_expression_editor_y"))
    if not (mel.connect_material_expressions(node, out, mul, "A") and mel.connect_material_expressions(vc, "", mul, "B")
            and mel.connect_material_property(mul, "", prop)):
        raise RuntimeError(f"{path}: could not multiply {spec['output']} by the vertex colour")
    mel.set_base_material_usage(m, NANITE, True)
    mel.recompile_material(m)
    return m


def baked_light_graph(m, spec):
    """#2431: the web's unlit, lamp-baked stairwell surfaces. three.js shows a MeshBasicMaterial colour C at its exposure
    and the game's locked exposure is that exposure x 2^EXPOSURE_BIAS, so C x 2^-EXPOSURE_BIAS renders the web's picture
    at any hour (#2396's probe, #2410's river). The web dims the bake to POWER.emergency in a power cut (setPower)."""
    m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    m.set_editor_property("two_sided", bool(spec.get("twoSided")))
    if spec.get("opacity") is not None:  # a transparent MeshBasicMaterial pane: colour x opacity over the scene, as three blends it
        m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
        alpha = mel.create_material_expression(m, unreal.MaterialExpressionConstant, -400, 350)
        alpha.set_editor_property("r", float(spec["opacity"]))
        if not mel.connect_material_property(alpha, "", unreal.MaterialProperty.MP_OPACITY):
            raise RuntimeError("could not connect the baked-light opacity")
    weather = eal.load_asset(river_material.WEATHER)
    if weather is None:
        raise RuntimeError("Run build_lighting.py before building the baked-light master (it reads MPC_LundenWeather)")
    vc = mel.create_material_expression(m, unreal.MaterialExpressionVertexColor, -700, -100)
    power = mel.create_material_expression(m, unreal.MaterialExpressionCollectionParameter, -900, 150)
    power.set_editor_property("collection", weather)
    power.set_editor_property("parameter_name", "PowerAvailable")
    supply = mel.create_material_expression(m, unreal.MaterialExpressionLinearInterpolate, -650, 150)
    supply.set_editor_property("const_a", float(spec["emergency"]))
    supply.set_editor_property("const_b", 1.0)
    tint = mel.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -650, 300)
    tint.set_editor_property("constant", linear(spec.get("color", "#ffffff")))
    gain = mel.create_material_expression(m, unreal.MaterialExpressionMultiply, -500, 300)
    gain.set_editor_property("const_b", river_material.display_gain())
    level = mel.create_material_expression(m, unreal.MaterialExpressionMultiply, -400, 150)
    out = mel.create_material_expression(m, unreal.MaterialExpressionMultiply, -200, 0)
    if not (mel.connect_material_expressions(power, "", supply, "Alpha") and mel.connect_material_expressions(supply, "", level, "A")
            and mel.connect_material_expressions(tint, "", gain, "A") and mel.connect_material_expressions(gain, "", level, "B")
            and mel.connect_material_expressions(vc, "", out, "A") and mel.connect_material_expressions(level, "", out, "B")
            and mel.connect_material_property(out, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)):
        raise RuntimeError("could not wire the baked-light master")


def baked_light_ok(m, spec):
    """--check: unlit, the face and blend settings of the spec, and the emissive output multiplied by the vertex colour."""
    blend = unreal.BlendMode.BLEND_TRANSLUCENT if spec.get("opacity") is not None else unreal.BlendMode.BLEND_OPAQUE
    return (m.get_editor_property("shading_model") == unreal.MaterialShadingModel.MSM_UNLIT
            and m.get_editor_property("blend_mode") == blend
            and bool(m.get_editor_property("two_sided")) == bool(spec.get("twoSided"))
            and uses_vertex_color(m, unreal.MaterialProperty.MP_EMISSIVE_COLOR))


def uses_vertex_color(m, prop):
    """True when the expression on `prop` is a Multiply with a VertexColor input (what build_gltf_vertex_color makes)."""
    node = mel.get_material_property_input_node(m, prop)
    return isinstance(node, unreal.MaterialExpressionMultiply) and any(
        isinstance(i, unreal.MaterialExpressionVertexColor) for i in mel.get_inputs_for_material_expression(m, node))


GRAPHS = {"river": river_material.build, "constant": constant_graph, "surface": surface_graph, "tiled": tiled_graph, "glass": glass_graph,
          "grass": grass_graph, BAKED: baked_light_graph}


# ---------------------------------------------------------------- assets
def stamp(asset, path, spec):
    eal.set_metadata_tag(asset, "Lunden.Source", spec.get("source") or "")
    eal.set_metadata_tag(asset, "Lunden.Assumption", spec.get("assumption") or "none")
    eal.set_metadata_tag(asset, "Lunden.SpecHash", spec_hash(path, spec))
    eal.set_metadata_tag(asset, "Lunden.Builder", "tools/unreal-engine/python/build_materials.py (#2282)")
    if spec.get("raster"):
        eal.set_metadata_tag(asset, "Lunden.Raster", spec["raster"])
    elif eal.get_metadata_tag(asset, "Lunden.Raster"):
        eal.remove_metadata_tag(asset, "Lunden.Raster")


def build_master(path, spec, existing):
    if spec["graph"] == "grass" and not eal.load_asset(CALENDAR):
        raise RuntimeError("Run build_seasons.py before rebuilding the grass material")
    folder, name = path.rsplit("/", 1)
    if existing is None:
        m = unreal.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, unreal.Material, unreal.MaterialFactoryNew())
    else:
        m = existing
        collection_ids.clear_graph(m)  # #2408: no orphaned collection expression survives a rebuild
        m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_OPAQUE)
    if spec.get("graph") == backdrop_material.GRAPH:
        backdrop_material.build(m, spec, vector_param, scalar_param)
    else:
        GRAPHS[spec.get("graph", "constant")](m, spec)
    if spec.get("graph") != "glass" and spec.get("opacity") is None:  # translucent: the raster path (#2276)
        mel.set_base_material_usage(m, NANITE, True)
    mel.recompile_material(m)
    return m


def build_instance(path, spec, existing):
    folder, name = path.rsplit("/", 1)
    if existing is None:
        mi = unreal.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, unreal.MaterialInstanceConstant,
                                                                      unreal.MaterialInstanceConstantFactoryNew())
    else:
        mi = existing
        mel.clear_all_material_instance_parameters(mi)
    parent = eal.load_asset(spec["parent"])
    if parent is None:
        raise RuntimeError(f"{path}: parent {spec['parent']} does not exist")
    mel.set_material_instance_parent(mi, parent)
    # The parameter structs are written directly: in a commandlet a master built in the same run does not yet expose
    # its parameter names to MaterialEditingLibrary's setters (they returned False until the next editor start).
    # tests/test_materials.py checks the names against each master statically, --check against the saved assets.
    scalars, vectors = [], []
    for key, value in spec.get("params", {}).items():
        info = unreal.MaterialParameterInfo()
        info.set_editor_property("name", key)
        if isinstance(value, (str, list)):
            v = unreal.VectorParameterValue()
            v.set_editor_property("parameter_info", info)
            v.set_editor_property("parameter_value", vector(value))
            vectors.append(v)
        else:
            v = unreal.ScalarParameterValue()
            v.set_editor_property("parameter_info", info)
            v.set_editor_property("parameter_value", float(value))
            scalars.append(v)
    mi.set_editor_property("scalar_parameter_values", scalars)
    mi.set_editor_property("vector_parameter_values", vectors)
    overrides = mi.get_editor_property("base_property_overrides")
    overrides.set_editor_property("override_two_sided", bool(spec.get("twoSided")))
    overrides.set_editor_property("two_sided", bool(spec.get("twoSided")))
    mi.set_editor_property("base_property_overrides", overrides)
    if parent.get_blend_mode() in (unreal.BlendMode.BLEND_OPAQUE, unreal.BlendMode.BLEND_MASKED):
        mel.set_material_usage_override(mi, NANITE, True, True)
    mel.update_material_instance(mi)
    return mi


def check(table):
    """--check: every listed asset exists with its current spec hash, source/assumption metadata and the Nanite usage
    the cooked game needs; writes nothing."""
    problems = []
    for path, spec in sorted(table["materials"].items()):
        asset = eal.load_asset(path) if eal.does_asset_exist(path) else None
        if asset is None:
            problems.append(f"{path}: missing")
            continue
        if eal.get_metadata_tag(asset, "Lunden.SpecHash") != spec_hash(path, spec):
            problems.append(f"{path}: stale (spec hash {eal.get_metadata_tag(asset, 'Lunden.SpecHash')} != {spec_hash(path, spec)})")
        if not eal.get_metadata_tag(asset, "Lunden.Assumption") or not eal.get_metadata_tag(asset, "Lunden.Source"):
            problems.append(f"{path}: no Lunden.Source/Lunden.Assumption metadata")
        if asset.get_blend_mode() in (unreal.BlendMode.BLEND_OPAQUE, unreal.BlendMode.BLEND_MASKED):
            usage = mel.has_material_usage(asset, NANITE)
            if isinstance(asset, unreal.MaterialInstanceConstant):
                usage = usage and mel.has_material_usage_override(asset, NANITE)
            if not usage:
                problems.append(f"{path}: no persisted Nanite usage")
        if spec.get("graph") == "grass" and not seasonal_grass(asset, spec):
            problems.append(f"{path}: incorrect seasonal grass code or disconnected Month/Autumn input")
        if spec.get("graph") == backdrop_material.GRAPH and not backdrop_material.check(asset, spec, uses_vertex_color):
            problems.append(f"{path}: incorrect backdrop texture, vertex-colour wiring, or face settings")
        if spec.get("graph") == "river":
            problems.extend(f"{path}: {error}" for error in river_material.check(asset, spec))
        if isinstance(asset, unreal.Material):
            problems.extend(f"{path}: {error} (its collection was rebuilt; run build_materials.py)"
                            for error in collection_ids.unresolved(asset))
        if spec.get("graph") == BAKED and not baked_light_ok(asset, spec):
            problems.append(f"{path}: not unlit, wrong face setting, or emissive not multiplied by the vertex colour")
        if spec.get("graph") == GLTF_VC and not uses_vertex_color(asset, VC_OUTPUTS[spec["output"]]):
            problems.append(f"{path}: {spec['output']} is not multiplied by the vertex colour")
        if "parent" in spec:
            parent = eal.load_asset(spec["parent"])
            names = {str(n) for n in mel.get_vector_parameter_names(parent)} | {str(n) for n in mel.get_scalar_parameter_names(parent)}
            missing = sorted(set(spec.get("params", {})) - names)
            if missing:
                problems.append(f"{path}: parent has no parameter(s) {missing}")
            for key, value in spec.get("params", {}).items():
                got = (mel.get_material_instance_vector_parameter_value(asset, key) if isinstance(value, (str, list))
                       else mel.get_material_instance_scalar_parameter_value(asset, key))
                want = vector(value) if isinstance(value, (str, list)) else float(value)
                if isinstance(value, (str, list)):
                    off = max(abs(got.r - want.r), abs(got.g - want.g), abs(got.b - want.b))
                else:
                    off = abs(got - want)
                if off > 1e-4:
                    problems.append(f"{path}: {key} is {got}, spec {want}")
            faces = asset.get_editor_property("base_property_overrides")
            two_sided = faces.get_editor_property("override_two_sided") and faces.get_editor_property("two_sided")
            if bool(spec.get("twoSided")) != two_sided:
                problems.append(f"{path}: two-sided override is {two_sided}, spec {bool(spec.get('twoSided'))}")
        if eal.get_metadata_tag(asset, "Lunden.Raster") != (spec.get("raster") or ""):
            problems.append(f"{path}: Lunden.Raster is {eal.get_metadata_tag(asset, 'Lunden.Raster')!r}, spec {spec.get('raster')!r}")
        unreal.log(f"LUNDEN_MATERIAL_CHECK {path}: assumption = {eal.get_metadata_tag(asset, 'Lunden.Assumption')}")
    for p in problems:
        unreal.log_error("LUNDEN_MATERIAL_CHECK " + p)
    if problems:
        raise RuntimeError(f"{len(problems)} material problems")
    unreal.log(f"LUNDEN_MATERIALS_CHECK_OK {len(table['materials'])} materials")


def build_entries(materials, force=False):
    entries = sorted(materials.items(), key=lambda kv: ("parent" in kv[1], kv[0]))  # masters first
    made = kept = 0
    for path, spec in entries:
        existing = eal.load_asset(path) if eal.does_asset_exist(path) else None
        want = spec_hash(path, spec)
        if (existing is not None and not force and eal.get_metadata_tag(existing, "Lunden.SpecHash") == want
                and (spec.get("graph") != "grass" or seasonal_grass(existing, spec))
                and (spec.get("graph") != backdrop_material.GRAPH or backdrop_material.check(existing, spec, uses_vertex_color))
                and (spec.get("graph") != BAKED or baked_light_ok(existing, spec))
                and not (isinstance(existing, unreal.Material) and collection_ids.unresolved(existing))):
            unreal.log(f"LUNDEN_MATERIAL {path}: kept (spec {want})")
            kept += 1
            continue
        build = build_instance if "parent" in spec else build_gltf_vertex_color if spec.get("graph") == GLTF_VC else build_master
        asset = build(path, spec, existing)
        stamp(asset, path, spec)
        if not eal.save_loaded_asset(asset, only_if_is_dirty=False):
            raise RuntimeError(f"could not save {path} (is it locked with git lfs lock and writable?)")
        made += 1
        unreal.log(f"LUNDEN_MATERIAL {path}: {'updated' if existing else 'created'} (spec {want})")
    unreal.log(f"LUNDEN_MATERIALS_OK {made} written, {kept} kept")


def set_river_data(materials, surface):
    for spec in materials.values():
        if spec.get("graph") == "river":
            spec["river"] = surface


def prepare_landscape_materials(table, check_only, river_surface):
    """Build or check the generated backdrop and water masters shared by fond and omgivning."""
    materials = table["materials"]
    masters = {path for path, spec in materials.items() if spec.get("graph") == backdrop_material.GRAPH}
    subset = {path: spec for path, spec in materials.items() if path in masters or spec.get("parent") in masters}
    if river_surface:  # Older zone GLBs use plain glTF water and have no river frame.
        subset.update((path, spec) for path, spec in materials.items() if spec.get("graph") == "river")
        set_river_data(subset, river_surface)
    if check_only:
        check({"materials": subset})
    else:
        build_entries(subset)


def prepare_generated_materials(table, check_only):
    """#2431: build or check the generated masters every zone import may need before its rules run (the baked-light
    stairwells of hus-l and kvarteret). They live under /Game/Lunden/Generated/ (Git-ignored), so the importer makes
    them on each machine; an unchanged spec hash keeps the asset."""
    subset = {path: spec for path, spec in table["materials"].items() if spec.get("graph") == BAKED}
    if not subset:
        return
    if check_only:
        check({"materials": subset})
    else:
        build_entries(subset)


def main(argv):
    with open(os.path.join(repo_root(), "tools", "unreal-engine", "material-map.json"), encoding="utf-8") as f:
        table = json.load(f)
    with open(os.path.join(repo_root(), "unreal", "Lunden", "Import", "measurements.json"), encoding="utf-8") as f:
        surface = json.load(f)["site"].get("riverSurface")
    if not surface:
        raise RuntimeError("Re-export the world to include the river surface measurements")
    set_river_data(table["materials"], surface)
    if "--check" in argv:
        return check(table)
    build_entries(table["materials"], "--force" in argv)


if __name__ == "__main__":
    main(sys.argv[1:])
