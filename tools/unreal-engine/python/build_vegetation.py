"""#2281: the site's trees, shrubs and hedges as Unreal foliage, built from the #2245 import of the zone `vegetation`.

    run-python.ps1 tools/unreal-engine/python/build_vegetation.py [<export dir>] [--force | --check]

The exporter puts the vegetation that #2280's ground zones leave out (SITE_SKIP) into its own zone, `vegetation`: the
site's trees as one node per trunk and per crown lobe (the web's `tree-trunks|birches|crowns <cell>` InstancedMeshes),
the river park's understory, the pavement shrubs, the courtyard plantings and pergola vines, the river bank's growth and
the entrance boxwood. import_world.py imports it like any zone (Generated/vegetation/, one actor per node, a handful of
shared meshes); that level belongs to the importer and is never edited here. This builder turns it into foliage:

1. Materials (versioned, /Game/Lunden/Vegetation/): `M_LundenFoliage`, a two-sided masked leaf master whose per-instance
   colours and leaf cover follow BPC_LundenSeasons' month and the export's web palette (times vertex AO), whose opacity mask draws the leaf atlas's cut-out in the cards' UVs (the canvas
   atlas does not travel), and whose world position offset sways it in the wind (a Custom HLSL node after
   src/sitewind.js: sway in the wind's direction with a gust envelope, a small flutter, clamped to the web's maximum
   displacement); the weather's WindX/Y drive the wind with the web's speed-to-power curve. MI_LundenLeaf serves trees
   and vines. MI_LundenPerennial stays green year-round. Both use measurements.json `vegetation.look`. Built only
   when its spec hash changes (metadata Lunden.SpecHash, as build_materials.py).
2. Derived assets (not versioned, /Game/Lunden/Generated/VegetationWorld/): a copy of every imported vegetation mesh
   with Nanite off (the full mesh, not the fallback, #2298), no collision, and MI_LundenLeaf on the leaf-card slots
   (`look.leafKeys`); one FoliageType_InstancedStaticMesh per copy; and the sub-level `Level_vegetation_foliage`: an
   InstancedFoliageActor with one instance per imported actor on that actor's transform. Hedges the export lists in a zone
   that world-levels.json does not stream (L1007's own patio hedge in `l1007-uteplats`) are copied in as a plain
   StaticMeshActor tagged with the hedge's id; hedges of streamed zones (Hus L's patio hedges in `hus-l`) stay there.
   #2308: every trunk the web stops the walker at (measurements.json `vegetation.trees[].blocks`, src/farwalk.js:
   outside the home block, a diamond of half-width WALK.trunk[kind] round the foot) gets a hidden BlockAll engine cube
   in the same level, turned 45 degrees so its corners lie on the diamond's, from the foot up to the tree's height.
   Trunks inside the home block do not block, as on the web.
3. `vegetation-index.json` next to the level: each mesh copy's role (trunk, crown, hedge, other) and instance count, read
   by tests/test_vegetation.py.

Build the season and lighting collections with build_seasons.py and build_lighting.py before rebuilding the leaf master.
The build is skipped when the imports, the export's vegetation data, this script and every output package are
unchanged (build-stamp.json). --check verifies the materials' spec hashes and the level without writing.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys

import unreal as u

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_nanite_materials import static_mesh_editor  # noqa: E402  set_editor_property leaves the fallback (#2297)

MATERIALS = "/Game/Lunden/Vegetation"
MASTER = MATERIALS + "/M_LundenFoliage"
LEAF = MATERIALS + "/MI_LundenLeaf"
PERENNIAL = MATERIALS + "/MI_LundenPerennial"
CALENDAR = "/Game/Lunden/Seasons/MPC_LundenVegetation"
FOLDER = "/Game/Lunden/Generated/VegetationWorld"
TARGET = FOLDER + "/Level_vegetation_foliage"
ZONE = "vegetation"
BUILDER = "tools/unreal-engine/python/build_vegetation.py (#2281)"
WEATHER = "/Game/Lunden/Lighting/MPC_LundenWeather"
# src/config.js WIND.power for #2281 measurements exported before the curve was included.
LEGACY_WIND_CURVE = {"full": 13, "gamma": 0.9, "knee": 0.6, "top": 0.8}

content = Path(u.Paths.project_content_dir())
out_dir = content / "Lunden/Generated/VegetationWorld"
stamp_path = out_dir / "build-stamp.json"
index_path = out_dir / "vegetation-index.json"
eal = u.EditorAssetLibrary
mel = u.MaterialEditingLibrary

WIND_HLSL = r"""
// #2281 after src/sitewind.js: a lobe sways in the wind's direction (its own phase), under a slow gust envelope, and its
// cards flutter a little; the offset never exceeds the web's SITE_WIND.maxDisplacement. Units: metres in, centimetres out.
// WindX/Y in MPC_LundenWeather are downwind on the Unreal ground plane in m/s (build_lighting.py).
float speed = length(Wind);
if (speed <= 0.0) return float3(0, 0, 0);
float p = saturate(pow(speed / FullSpeed, Gamma));
float range = Top - Knee;
float power = p <= Knee ? p : Knee + range * (1.0 - exp(-(p - Knee) / range)); // src/windsim.js windPower
float2 d = Wind / speed;
float ph = Rand * 6.2831853;
float gust = 1.0 - GustDepth + GustDepth * sin(Time * GustFreq + ph * 0.5);
float sway = sin(Time * Freq + ph) * Amp * power * gust;
float flut = sin(Time * FlutterFreq + dot(WP, float3(0.05, 0.07, 0.03))) * Flutter * min(power, FlutterCap);
float3 o = float3(d * (sway + flut), 0.0) * 100.0;
float len = length(o), cap = MaxDisp * 100.0;
if (len > cap) o *= cap / len;
return o;
"""


MASK_HLSL = r"""
// #2281 after src/foliage.js leafAtlas(): the atlas does not travel (a canvas texture), so its cut-out is drawn here in the
// cards' own UVs. 2 x 2 cells: cell (1, 0) is the opaque core; the others are round leaf clusters (radius 0.46 of the
// cell, 0.92 as high as wide) of small pointed leaves on a transparent ground, thinning towards the edge.
if (Cover <= 0.0) return 0.0;
float2 cell = floor(UV * 2.0);
if (cell.x >= 1.0 && cell.y < 1.0) return 1.0;
float2 p = frac(UV * 2.0) - 0.5;
float r = length(float2(p.x, p.y / 0.92)) / 0.46;
if (r >= 1.0) return 0.0;
float2 g = UV * 2.0 * Leaves;
float2 id = floor(g);
float best = 0.0;
for (int i = -1; i <= 1; i++) {
  for (int j = -1; j <= 1; j++) {
    float2 c = id + float2(i, j);
    float h1 = frac(sin(dot(c, float2(127.1, 311.7))) * 43758.5453);
    float h2 = frac(sin(dot(c, float2(269.5, 183.3))) * 43758.5453);
    float h3 = frac(sin(dot(c, float2(419.2, 371.9))) * 43758.5453);
    if (h3 > (1.25 - r * r) * Cover) continue;  // fewer leaves towards the cluster's edge
    float a = h1 * 6.2831853;
    float2 d = g - (c + float2(h1, h2));
    float2 q = float2(cos(a) * d.x + sin(a) * d.y, -sin(a) * d.x + cos(a) * d.y);
    best = max(best, 1.0 - length(q / float2(0.8, 0.34)));
  }
}
return best > 0.0 ? 1.0 : 0.0;
"""


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def text_sha(path):
    # line endings normalised, so a CRLF (autocrlf) checkout hashes the script like LF (#2309)
    return hashlib.sha256(Path(path).read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def linear(hex_text):
    v = hex_text.lstrip("#")

    def lin(c):
        c = int(c, 16) / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return u.LinearColor(lin(v[0:2]), lin(v[2:4]), lin(v[4:6]), 1.0)


def read_vegetation(export_dir):
    m = json.loads((Path(export_dir) / "measurements.json").read_text(encoding="utf-8"))
    veg = m.get("vegetation")
    if not veg:
        raise RuntimeError("measurements.json has no `vegetation`: export with the zone vegetation (#2281)")
    return veg


def world_packages():
    root = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())).parents[1]
    world = json.loads((root / "tools/unreal-engine/world-levels.json").read_text(encoding="utf-8"))
    return {e["package"].lower() for e in world["levels"]}


def level(zone):
    return f"/Game/Lunden/Generated/{zone}/Level_{zone}"


# ---------------------------------------------------------------- materials (versioned)
def crown_shader(look):
    if "months" not in look:
        return "return float4(Evergreen.rgb, 1.0);"  # #2281 export with a single palette
    # rgba = this month's HSL in three.js's linear working space, plus its share of leaves.
    rows = ["float4(" + ", ".join(map(str, look["months"][str(m)])) + ")" for m in range(1, 13)]
    blossom = " || ".join("m == " + str(m) for m in look["blossomMonths"]) or "false"
    return """
if (Seasonal < 0.5) return float4(Evergreen.rgb, 1.0);
const float4 months[12] = { ROWS };
int m = clamp((int)round(Month), 1, 12);
float4 row = months[m - 1];
float3 seed = frac(Rand * float3(37.17, 23.43, 71.31));
float hue = frac(row.x + (Rand - 0.5) * (m >= 9 && m <= 11 ? 0.12 : 0.04));
float sat = saturate(row.y + (seed.x - 0.5) * 0.15), light = saturate(row.z + (seed.y - 0.5) * 0.10);
if ((BLOSSOM) && seed.z < 0.18) { hue = Rand < 0.5 ? 0.95 : 0; sat = Rand < 0.5 ? 0.5 : 0; light = 0.88; }
float3 rgb = saturate(abs(frac(hue + float3(0, 2.0/3.0, 1.0/3.0)) * 6 - 3) - 1);
return float4(light + (rgb - 0.5) * (1 - abs(2 * light - 1)) * sat, saturate(row.w * (0.85 + seed.x * 0.3)));
""".replace("ROWS", ", ".join(rows)).replace("BLOSSOM", blossom)


def material_specs(look):
    w = look["wind"]
    master = {"what": "two-sided leaf master with monthly colour and cover per vertex, leaf cut-out and weather-driven sway", "hlsl": WIND_HLSL,
              "mask": MASK_HLSL, "weather": WEATHER, "calendar": CALENDAR, "crown": crown_shader(look)}
    curve = w.get("power", LEGACY_WIND_CURVE)
    leaf = {"parent": MASTER, "vectors": {"LeafDark": look["leafDark"], "LeafLight": look["leafLight"]},
            "scalars": {"Roughness": 0.92, "Amp": w["amp"], "Freq": w["freq"], "Flutter": w["flutter"],
                        "FlutterFreq": w["flutterFreq"], "GustFreq": w["gustFreq"], "GustDepth": w["gustDepth"],
                        "MaxDisp": w["maxDisplacement"], "FlutterCap": w.get("flutterCap", 0.6),
                        "FullSpeed": curve["full"], "Gamma": curve["gamma"], "Knee": curve["knee"], "Top": curve["top"]},
            "source": look["source"] + f" (month {look['month']})",
            "assumption": "Leaf-card density, per-instance colour variation and sway amplitude are visual calibration (guess)."}
    perennial = {**leaf, "scalars": {**leaf["scalars"], "Seasonal": 0.0}}
    return {MASTER: master, LEAF: leaf, PERENNIAL: perennial}


def spec_hash(path, spec):
    return hashlib.sha256(json.dumps([path, spec], sort_keys=True).encode("utf-8")).hexdigest()[:16]


def stamp(asset, path, spec):
    eal.set_metadata_tag(asset, "Lunden.Source", spec.get("source") or "src/foliage.js, src/sitewind.js")
    eal.set_metadata_tag(asset, "Lunden.Assumption", spec.get("assumption") or "none")
    eal.set_metadata_tag(asset, "Lunden.SpecHash", spec_hash(path, spec))
    eal.set_metadata_tag(asset, "Lunden.Builder", BUILDER)


def expr(m, cls, x, y):
    return mel.create_material_expression(m, cls, x, y)


def param(m, cls, name, value, x, y):
    e = expr(m, cls, x, y)
    e.set_editor_property("parameter_name", name)
    e.set_editor_property("default_value", value)
    return e


def custom_inputs(node, names):
    inputs = []
    for name in names:
        slot = u.CustomInput()
        slot.set_editor_property("input_name", name)
        inputs.append(slot)
    node.set_editor_property("inputs", inputs)


def build_master(spec, existing):
    weather = eal.load_asset(spec["weather"])
    if not weather:
        raise RuntimeError("Build the lighting weather collection before the vegetation: " + spec["weather"])
    calendar = eal.load_asset(spec["calendar"])
    if not calendar:
        raise RuntimeError("Run build_seasons.py before the vegetation: " + spec["calendar"])
    folder, name = MASTER.rsplit("/", 1)
    m = existing or u.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, u.Material, u.MaterialFactoryNew())
    if existing:
        mel.delete_all_material_expressions(m)
    m.set_editor_property("blend_mode", u.BlendMode.BLEND_MASKED)
    m.set_editor_property("two_sided", True)
    m.set_editor_property("opacity_mask_clip_value", 0.5)
    mask = expr(m, u.MaterialExpressionCustom, -350, 250)
    custom_inputs(mask, ("UV", "Leaves", "Cover"))
    mask.set_editor_property("output_type", u.CustomMaterialOutputType.CMOT_FLOAT1)
    mask.set_editor_property("description", "LundenLeafMask")
    mask.set_editor_property("code", MASK_HLSL.strip())
    mel.connect_material_expressions(expr(m, u.MaterialExpressionTextureCoordinate, -600, 250), "", mask, "UV")
    mel.connect_material_expressions(param(m, u.MaterialExpressionScalarParameter, "Leaves", 14.0, -600, 320), "", mask, "Leaves")
    mel.connect_material_property(mask, "", u.MaterialProperty.MP_OPACITY_MASK)
    # colour: dark → light per instance, times the export's vertex AO
    dark = param(m, u.MaterialExpressionVectorParameter, "LeafDark", linear("#3b5a3a"), -900, -200)
    light = param(m, u.MaterialExpressionVectorParameter, "LeafLight", linear("#5a8a5a"), -900, -50)
    rand = expr(m, u.MaterialExpressionPerInstanceRandom, -900, 100)
    lerp = expr(m, u.MaterialExpressionLinearInterpolate, -600, -100)
    mel.connect_material_expressions(dark, "", lerp, "A")
    mel.connect_material_expressions(light, "", lerp, "B")
    mel.connect_material_expressions(rand, "", lerp, "Alpha")
    month = expr(m, u.MaterialExpressionCollectionParameter, -900, -500)
    month.set_editor_property("collection", calendar)
    month.set_editor_property("parameter_name", "Month")
    seasonal = param(m, u.MaterialExpressionScalarParameter, "Seasonal", 1.0, -900, -430)
    crown = expr(m, u.MaterialExpressionCustom, -350, -350)
    crown_inputs = {"Month": month, "Seasonal": seasonal, "Evergreen": lerp, "Rand": rand}
    custom_inputs(crown, crown_inputs)
    crown.set_editor_property("output_type", u.CustomMaterialOutputType.CMOT_FLOAT4)
    crown.set_editor_property("description", "LundenMonthlyCrown")
    crown.set_editor_property("code", spec["crown"])
    for key, node in crown_inputs.items():
        if not mel.connect_material_expressions(node, "", crown, key):
            raise RuntimeError("Could not connect crown input " + key)
    # Month and the instance seed are constant across the leaf cards. Calculate this once per vertex in the masked material.
    vertex = expr(m, u.MaterialExpressionVertexInterpolator, -160, -350)
    if not mel.connect_material_expressions(crown, "", vertex, ""):
        raise RuntimeError("Could not connect seasonal colour and coverage to the vertex interpolator")
    outputs = []
    for channels in ("rgb", "a"):
        selector = expr(m, u.MaterialExpressionComponentMask, -100, -350 if channels == "rgb" else -200)
        for channel in "rgba":
            selector.set_editor_property(channel, channel in channels)
        mel.connect_material_expressions(vertex, "", selector, "")
        outputs.append(selector)
    color, cover = outputs
    if not mel.connect_material_expressions(cover, "", mask, "Cover"):
        raise RuntimeError("Could not connect monthly leaf cover to the mask")
    vc = expr(m, u.MaterialExpressionVertexColor, -600, 50)
    mul = expr(m, u.MaterialExpressionMultiply, -350, -50)
    mel.connect_material_expressions(color, "", mul, "A")
    mel.connect_material_expressions(vc, "", mul, "B")
    mel.connect_material_property(mul, "", u.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(param(m, u.MaterialExpressionScalarParameter, "Roughness", 0.92, -600, 200), "",
                                  u.MaterialProperty.MP_ROUGHNESS)
    # wind
    custom = expr(m, u.MaterialExpressionCustom, -350, 400)
    names = ["Time", "WP", "Rand", "Wind", "Amp", "Freq", "Flutter", "FlutterFreq", "FlutterCap", "GustFreq", "GustDepth",
             "FullSpeed", "Gamma", "Knee", "Top", "MaxDisp"]
    custom_inputs(custom, names)
    custom.set_editor_property("output_type", u.CustomMaterialOutputType.CMOT_FLOAT3)
    custom.set_editor_property("description", "LundenWind")
    custom.set_editor_property("code", WIND_HLSL.strip())
    wind = expr(m, u.MaterialExpressionAppendVector, -1100, 420)
    for name, pin in (("WindX", "A"), ("WindY", "B")):
        scalar = expr(m, u.MaterialExpressionCollectionParameter, -1350, 420 if pin == "A" else 500)
        scalar.set_editor_property("collection", weather)
        scalar.set_editor_property("parameter_name", name)
        if not mel.connect_material_expressions(scalar, "", wind, pin):
            raise RuntimeError("Could not connect " + name + " to the vegetation wind")
    sources = {"Time": expr(m, u.MaterialExpressionTime, -900, 300), "WP": expr(m, u.MaterialExpressionWorldPosition, -900, 360),
               "Rand": rand, "Wind": wind}
    y = 480
    for n, v in (("Amp", 0.06), ("Freq", 0.9), ("Flutter", 0.03), ("FlutterFreq", 5.3), ("GustFreq", 0.31),
                 ("GustDepth", 0.45), ("FlutterCap", 0.6), ("FullSpeed", 13.0), ("Gamma", 0.9),
                 ("Knee", 0.6), ("Top", 0.8), ("MaxDisp", 0.35)):
        sources[n] = param(m, u.MaterialExpressionScalarParameter, n, v, -900, y)
        y += 60
    for n in names:
        if not mel.connect_material_expressions(sources[n], "", custom, n):
            raise RuntimeError("could not connect " + n)
    if not mel.connect_material_property(custom, "", u.MaterialProperty.MP_WORLD_POSITION_OFFSET):
        raise RuntimeError("Could not connect the weather-driven foliage displacement")
    mel.set_base_material_usage(m, u.MaterialUsage.MATUSAGE_INSTANCED_STATIC_MESHES, True)
    mel.recompile_material(m)
    return m


def build_leaf(path, spec, existing):
    folder, name = path.rsplit("/", 1)
    mi = existing or u.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, u.MaterialInstanceConstant,
                                                                         u.MaterialInstanceConstantFactoryNew())
    if existing:
        mel.clear_all_material_instance_parameters(mi)
    mel.set_material_instance_parent(mi, eal.load_asset(MASTER))
    scalars, vectors = [], []
    for key, value in spec["vectors"].items():
        info = u.MaterialParameterInfo()
        info.set_editor_property("name", key)
        v = u.VectorParameterValue()
        v.set_editor_property("parameter_info", info)
        v.set_editor_property("parameter_value", linear(value) if isinstance(value, str) else u.LinearColor(*value, 0.0))
        vectors.append(v)
    for key, value in spec["scalars"].items():
        info = u.MaterialParameterInfo()
        info.set_editor_property("name", key)
        v = u.ScalarParameterValue()
        v.set_editor_property("parameter_info", info)
        v.set_editor_property("parameter_value", float(value))
        scalars.append(v)
    mi.set_editor_property("scalar_parameter_values", scalars)
    mi.set_editor_property("vector_parameter_values", vectors)
    mel.update_material_instance(mi)
    return mi


def materials(look, check=False):
    """Builds (or with check only verifies) the versioned vegetation materials; returns the paths it wrote."""
    wrote, problems = [], []
    for path, spec in material_specs(look).items():
        existing = eal.load_asset(path) if eal.does_asset_exist(path) else None
        want = spec_hash(path, spec)
        if existing is not None and eal.get_metadata_tag(existing, "Lunden.SpecHash") == want:
            u.log(f"LUNDEN_VEGETATION_MATERIAL {path}: unchanged")
            continue
        if check:
            problems.append(f"{path}: {'missing' if existing is None else 'stale spec hash'}")
            continue
        asset = build_master(spec, existing) if path == MASTER else build_leaf(path, spec, existing)
        stamp(asset, path, spec)
        if not eal.save_loaded_asset(asset, only_if_is_dirty=False):
            raise RuntimeError("Cannot save " + path)
        wrote.append(path)
        u.log(f"LUNDEN_VEGETATION_MATERIAL {path}: built (spec {want})")
    if problems:
        raise RuntimeError("LUNDEN_VEGETATION_CHECK failed: " + "; ".join(problems))
    return wrote


# ---------------------------------------------------------------- derived level (not versioned)
def package_files():
    return sorted(p for p in out_dir.rglob("*") if p.suffix in (".umap", ".uasset"))


def role_of(node_id):
    if node_id.startswith(("mesh_tree-trunks", "mesh_tree-birches")):
        return "trunk"
    if node_id.startswith("mesh_tree-crowns"):
        return "crown"
    return "other"


def inputs(veg, copies):
    stamps = {}
    for zone in [ZONE] + sorted({h["zone"] for h in copies}):
        path = content / f"Lunden/Generated/{zone}/import-stamp.json"
        if not path.exists():
            raise RuntimeError(f"Zone {zone} is not imported: run import_world.py --zones {zone}")
        s = json.loads(path.read_text(encoding="utf-8"))
        stamps[zone] = {"fingerprint": s["contentFingerprint"], "glb": s["export"]["sha256"]}
    data = hashlib.sha256(json.dumps(veg, sort_keys=True).encode()).hexdigest()
    return {"zones": stamps, "vegetation": data, "builder": text_sha(__file__), "engine": u.SystemLibrary.get_engine_version()}


def unchanged(wanted):
    if not stamp_path.exists():
        return False
    old = json.loads(stamp_path.read_text(encoding="utf-8"))
    files = {p.relative_to(out_dir).as_posix(): sha(p) for p in package_files()}
    return old.get("inputs") == wanted and old.get("files") == files and files


def collect(veg, copies):
    """Every imported vegetation mesh actor as plain values: (root node id, transform, mesh path), and the hedges to copy."""
    hedge_ids = {h["id"] for h in veg["hedges"] if h["zone"] == ZONE}
    if not u.EditorLoadingAndSavingUtils.load_map(level(ZONE)):
        raise RuntimeError(f"Missing {level(ZONE)}: run import_world.py --zones {ZONE} first")
    found = []
    for a in u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors():
        if not isinstance(a, u.StaticMeshActor) or not a.static_mesh_component.static_mesh:
            continue
        tags = {str(t) for t in a.tags}
        parent = next((t[7:] for t in tags if t.startswith("parent:")), None)
        node = parent or a.get_name()
        role = "hedge" if node in hedge_ids else role_of(node)
        found.append((node, role, a.get_actor_transform(), a.static_mesh_component.static_mesh.get_path_name()))
    found.sort(key=lambda f: f[0])
    copied = []
    for zone in sorted({h["zone"] for h in copies}):
        if not u.EditorLoadingAndSavingUtils.load_map(level(zone)):
            raise RuntimeError(f"Missing {level(zone)}: run import_world.py --zones {zone} first")
        actors = {a.get_name(): a for a in u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()}
        for h in (h for h in copies if h["zone"] == zone):
            a = actors.get(h["id"])
            if not a or not isinstance(a, u.StaticMeshActor):
                raise RuntimeError(f"Missing imported hedge {h['id']} in {level(zone)}")
            copied.append((h, a.get_actor_transform(), a.static_mesh_component.static_mesh.get_path_name()))
    return found, copied


def build(veg, found, copied):
    tools = u.AssetToolsHelpers.get_asset_tools()
    leaf_keys = set(veg["look"]["leafKeys"])
    still_keys = set(veg["look"].get("stillLeafKeys", []))
    leaf = eal.load_asset(LEAF)
    perennial = eal.load_asset(PERENNIAL)
    roles = {}
    for node, role, _, mesh_path in found:
        roles.setdefault(mesh_path, {}).setdefault(role, 0)
        roles[mesh_path][role] += 1
    types, index = {}, {"meshes": {}, "builder": BUILDER}
    for mesh_path, count in sorted(roles.items()):
        role = max(count, key=count.get)
        src = eal.load_asset(mesh_path)
        name = f"SM_Veg_{role}_{src.get_name()}"
        mesh = tools.duplicate_asset(name, FOLDER + "/Meshes", src)
        if not mesh:
            raise RuntimeError(f"Cannot copy {mesh_path}")
        nanite = mesh.get_editor_property("nanite_settings")
        if nanite.get_editor_property("enabled"):  # the full mesh in game and in captures (#2298)
            nanite.set_editor_property("enabled", False)
            static_mesh_editor().set_nanite_settings(mesh, nanite, True)  # rebuilds the render data now
        body = mesh.get_editor_property("body_setup")
        if body:
            body.set_editor_property("collision_trace_flag", u.CollisionTraceFlag.CTF_USE_SIMPLE_AS_COMPLEX)
        leafed = 0
        wind = False
        for k, slot in enumerate(mesh.get_editor_property("static_materials")):
            mat = slot.get_editor_property("material_interface")
            if mat and mat.get_name() in leaf_keys:
                wind = wind or mat.get_name() not in still_keys
                mesh.set_material(k, perennial if mat.get_name().endswith("_perennial") else leaf)
                leafed += 1
        if not eal.save_loaded_asset(mesh, only_if_is_dirty=False):
            raise RuntimeError("Cannot save " + mesh.get_path_name())
        ft = tools.create_asset("FT_" + name[3:], FOLDER + "/FoliageTypes", u.FoliageType_InstancedStaticMesh,
                                u.FoliageType_InstancedStaticMeshFactory())
        ft.set_editor_property("mesh", mesh)
        ft.set_editor_property("cast_shadow", True)
        if leafed:
            ft.set_editor_property("evaluate_world_position_offset", wind)
        if not eal.save_loaded_asset(ft, only_if_is_dirty=False):
            raise RuntimeError("Cannot save " + ft.get_path_name())
        types[mesh_path] = ft
        index["meshes"][name] = {"role": role, "source": mesh_path, "instances": sum(count.values()), "leafSlots": leafed,
                                 "roles": count}
    world = u.EditorLoadingAndSavingUtils.new_blank_map(False)
    if not world:
        raise RuntimeError("Cannot create a blank map")
    for mesh_path, ft in types.items():
        transforms = [t for _, _, t, p in found if p == mesh_path]
        u.InstancedFoliageActor.add_instances(world, ft, transforms)
    spawner = u.get_editor_subsystem(u.EditorActorSubsystem)
    for h, transform, mesh_path in copied:
        actor = spawner.spawn_actor_from_class(u.StaticMeshActor, u.Vector(0, 0, 0))
        actor.set_actor_label(h["id"])
        actor.static_mesh_component.set_static_mesh(eal.load_asset(mesh_path))
        actor.static_mesh_component.set_collision_profile_name("NoCollision")
        actor.tags = [u.Name(t) for t in (h["id"], "kind:structure", "zone:" + h["zone"], "derived:vegetation-copy")]
        actor.set_actor_transform(transform, False, False)
    index["copies"] = [{"id": h["id"], "zone": h["zone"]} for h, _, _ in copied]
    index["trunkCollision"] = trunk_collision(veg, spawner)
    if not u.EditorLoadingAndSavingUtils.save_map(world, TARGET):
        raise RuntimeError("Cannot save " + TARGET)
    u.EditorLoadingAndSavingUtils.new_blank_map(False)
    return index


def trunk_collision(veg, spawner):
    """#2308: the web's trunk diamonds (src/farwalk.js) as hidden BlockAll cubes: a square of half-diagonal `blocks` m,
    corners on the axes (yaw 45 degrees), from the foot to the tree's height. Returns the count per kind."""
    if "trunkCollision" not in veg:
        u.log_warning("LUNDEN_VEGETATION measurements.json has no vegetation.trunkCollision (export before #2308): no trunk collision")
        return {}
    cube = eal.load_asset("/Engine/BasicShapes/Cube.Cube")  # 100 cm, simple box collision
    counts = {}
    for t in veg["trees"]:
        r = t.get("blocks")
        if r is None:
            continue
        x, y, z = t["foot"]["unreal"]
        side, height = r * 100 * 2 ** 0.5, max(t["height"], 0.01) * 100
        actor = spawner.spawn_actor_from_class(u.StaticMeshActor, u.Vector(x, y, z + height / 2), u.Rotator(roll=0, pitch=0, yaw=45))
        actor.set_actor_label("Trunk collision " + t["id"])
        comp = actor.static_mesh_component
        comp.set_static_mesh(cube)
        comp.set_collision_profile_name("BlockAll")
        actor.set_actor_scale3d(u.Vector(side / 100, side / 100, height / 100))
        actor.set_actor_hidden_in_game(True)
        actor.tags = [u.Name(n) for n in ("kind:collision", "derived:trunk-collision", "tree:" + t["id"], "trunkKind:" + t["kind"])]
        counts[t["kind"]] = counts.get(t["kind"], 0) + 1
    return counts


def main(argv):
    flags = {a for a in argv if a.startswith("--")}
    args = [a for a in argv if a and not a.startswith("--")]
    export_dir = args[0] if args else os.path.join(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()), "Import")
    veg = read_vegetation(export_dir)
    if "--check" in flags:
        materials(veg["look"], check=True)
        if not eal.does_asset_exist(TARGET):
            raise RuntimeError(f"LUNDEN_VEGETATION_CHECK failed: {TARGET} missing")
        u.log("LUNDEN_VEGETATION_CHECK_OK")
        return
    wrote = materials(veg["look"])
    streamed = world_packages()
    copies = [h for h in veg["hedges"] if h["zone"] != ZONE and level(h["zone"]).lower() not in streamed]
    wanted = inputs(veg, copies)
    wanted["materials"] = {p: spec_hash(p, s) for p, s in material_specs(veg["look"]).items()}
    if "--force" not in flags and not wrote and unchanged(wanted):
        u.log(f"LUNDEN_VEGETATION_BUILD skipped, unchanged since the import of {ZONE}")
    else:
        # Generated/VegetationWorld/ is this builder's alone: clear it on disk before any of its packages is loaded (the
        # editor's asset deletion leaves referenced foliage types behind), then let the registry forget them
        if out_dir.exists():
            shutil.rmtree(out_dir)
        u.AssetRegistryHelpers.get_asset_registry().scan_paths_synchronous([FOLDER], True)
        found, copied = collect(veg, copies)
        index = build(veg, found, copied)
        index_path.write_text(json.dumps(index, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        files = {p.relative_to(out_dir).as_posix(): sha(p) for p in package_files()}
        stamp_path.write_text(json.dumps({"inputs": wanted, "files": files}, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        counts = {k: v["instances"] for k, v in index["meshes"].items()}
        u.log(f"LUNDEN_VEGETATION_BUILD {TARGET}: {len(found)} instances in {len(index['meshes'])} foliage types {counts}; "
              f"{len(copied)} hedge copies {[h['id'] for h, _, _ in copied]}; trunk collision {index.get('trunkCollision')}; "
              f"{len(files)} packages")
    u.log("LUNDEN_VEGETATION_BUILD_OK")


main([a for a in sys.argv[1:] if a])
