"""#2283: sun, moon, sky, fog, weather and the lamps of the world map (G05), built from the #2245 export.

    run-python.ps1 tools/unreal-engine/python/build_lighting.py [<measurements.json>] [--force | --check]

Versioned assets (one owner, #2283; take `git lfs lock` on each before a run that may save them):
  Lighting/BP_LundenSky            the day/time driver: sun and moon after src/daycycle.js and src/moon.js, sky
                                   atmosphere, real-time sky light, height fog, volumetric clouds, post process
                                   (exposure range and the precipitation blendable), rain/snow/wet/wind state
  Lighting/BP_LundenLamp           one lamp: a point light with TurnOn / TurnOff / Toggle events (#2285 calls them);
                                   a small lamp with Auto on follows the dusk like src/lights.js updateAuto (#2307)
  Lighting/MPC_LundenWeather       what the materials and lamps read: Rain, Snow, Wet, wind, light level, the indoor
                                   boxes and the web's drop/flake numbers; DuskLight, Night, CloudCover(age) and the sun and
                                   moon directions and the moon's phase (#2307)
  Lighting/M_LundenPrecipitation   post-process material: rain streaks and snowflakes on cylinders round the eye,
                                   hidden inside the buildings' boxes and behind opaque geometry (so they show outside
                                   and through windows), and wet outdoor surfaces (darker, with a sky sheen); on the sky
                                   itself the web's stars and the moon disc with its phase (#2307)
Generated level (rebuilt, not versioned, like build_l1007.py's): /Game/Lunden/Generated/Lighting/Level_lighting with one
BP_LundenSky and one BP_LundenLamp per measurements.json `lights` entry, tagged
[lamp:<id>, kind:<lamp|room>, level:<n>, room:<room>] and named `Lamp_<id>`.

Date and time: BP_LundenSky reads the PC's local clock at BeginPlay (UseClock, default on) and then runs at TimeScale
(1 = real time, as the web's DAY.minutes = 24 h). A test or capture switches UseClock off and sets Year, Month, Day,
Hour, then calls UpdateSky. #2287 reads WindSpeed (m/s) and WindFromDeg (the direction the wind comes FROM).

The sun formula is the web's (src/daycycle.js sunDirection: Cooper's declination, Spencer's equation of time, the doy
87-300 summer-time rule, DAY.lat/lon/planNorth from measurements.json site.sky) and the moon is src/moon.js moonState
turned into a direction the way DayCycle.update does it. They are written here as text and compiled into Blueprint
math nodes (Expr), so the graph is a literal transcription; tools/unreal-engine/check-sun.mjs compares the result with
the web's own functions.

A run whose inputs (export values, this script) match the hash stored on BP_LundenSky saves no asset; the level is
rebuilt when its stamp differs. --force rebuilds; --check verifies without saving. Ends with LUNDEN_LIGHTING_OK.
"""
import ast
import hashlib
import json
import math
from pathlib import Path
import sys

import unreal as u

sys.path.insert(0, str(Path(__file__).resolve().parent))
from season_tags import season_tags
import player_parts as pp
import stair_lamp
import sky_clouds

DIR = "/Game/Lunden/Lighting"
SKY = DIR + "/BP_LundenSky"
LAMP = DIR + "/BP_LundenLamp"
MPC = DIR + "/MPC_LundenWeather"
PRECIP = DIR + "/M_LundenPrecipitation"
LEVEL_FOLDER = "/Game/Lunden/Generated/Lighting"
LEVEL = LEVEL_FOLDER + "/Level_lighting"
CLOUD_SOURCE = "/Engine/EngineSky/VolumetricClouds/m_SimpleVolumetricCloud"  # Epic's simple volumetric cloud material
CLOUDS = DIR + "/M_LundenClouds"  # its copy with Cloud_GlobalCoverage read from MPC_LundenWeather CloudCoverage (#2307)
SPEC_TAG = "Lunden.SpecHash"

TOOLS = u.AssetToolsHelpers.get_asset_tools()
ASSETS = u.EditorAssetLibrary
BP = u.BlueprintEditorLibrary
GRAPH = u.BlueprintGraphEditor
MEL = u.MaterialEditingLibrary

CONTENT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_content_dir()))
PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
LEVEL_DIR = CONTENT / "Lunden/Generated/Lighting"
STAMP = LEVEL_DIR / "build-stamp.json"

# Unreal calibration of the web's relative light units (assumptions, by eye against the web's reference pictures): the
# web's clear-day sun (LIGHTING.sky.clear.sun) is SUN_LUX in Unreal, every other web intensity scales with it. Lamps
# (#2307): candela = CANDELA_PER_WEB x the web intensity the export gives every light (the rooms' ceiling and pendant
# points from src/lights.js, the small lamps' pool lights from LIGHTING.floorLamp and their specs), attenuation radius =
# the web's range. CANDELA_PER_WEB is set by mean luminance and colour of matching wall/ceiling crops of the 22:00 pairs
# (docs/verification/2307/), *guess* (the web's lamps are four pool lights plus a shader wash, not 36 point lights).
# #2313 locked the exposure about 1.8 EV darker (EXPOSURE_BIAS) and took the web's night level out of the fill, so the lamps
# carry the evening rooms again: 2.8, the middle of the 2.66 ... 2.98 that keeps the 22:00 living room and upper floor
# within 0.8 ... 1.25 x the web's mean luminance (two-exposure trial, docs/verification/2313/), *guess*.
# SKY_SCALE: the real-time sky light's intensity on a clear
# day, x (1 - 0.3 overcast) as the web's hemisphere light (daycycle.js; #2283 also divided it by the sun's weather cut,
# #2313 does not). FOG_GREY: the height fog's own inscattering under overcast, x overcast x (0.15 + 0.85 daylight): it is
# what makes the rain sky the web's light grey (OVERCAST, which does not dim with the sun), *guess* 10 set by START's sky
# crop under rain at 14:00 against the web (#2313; #2283's 0.6 was for its brighter exposure).
SKY_SCALE = 2.0
FOG_GREY = 10.0
# The web's flat fill (LIGHTING.sky ambient, DAY.nightAmbient) becomes an ambient cubemap on a second post-process
# component whose blend weight UpdateSky sets to the web's ambient / AMBIENT_REF and whose intensity is AMBIENT_REF, so
# the cubemap's intensity follows the web's ambient value (the pilot lit its clear day with 0.25 =
# LIGHTING.sky.clear.ambient). The cubemap, T_LundenHemisphere, is the web's hemisphere light: LIGHTING.sky.hemi sky
# colour above, ground colour below (the pilot's blue T_PilotClearSky tinted floors blue).
AMBIENT_REF = 0.6
AMBIENT_CUBE = DIR + "/T_LundenHemisphere"
SUN_LUX = 8.0
CANDELA_PER_WEB = 2.8
LAMP_COLOUR = "#ffd59a"  # LIGHTING.floorLamp colour, where the export has none
LAMP_RANGE = 5.0         # m, LIGHTING.floorLamp range, where the export has none
# weather.js: `day.overcast = overcast x (kind === 'snow' ? 0.7 : 1)`, snow clouds are lighter
SNOW_OVERCAST = 0.7
# The sky's stars and moon disc (#2307, daycycle.js skyFrag, transcribed in PRECIP_HLSL) are drawn in display units: their
# web value x EyeAdaptationInverse, so they read as on the web at any exposure. Hidden by (1 - 0.85 x CloudCover): the
# web mixes its clouds over them by 0.85 x the cloud's density, and Unreal's volumetric clouds cover the sky in
# proportion to CloudCover. Engine cloud material: its coverage parameter goes from CLOUD_RANGE[0] (the web's clear
# threshold) to CLOUD_RANGE[1] (overcast), *guess* by eye.
CLOUD_RANGE = (-1.0, 1.0)
# Exposure (#2313): locked, not eye adaptation. The web has no auto exposure: its tone-mapping exposure follows the sky
# (DayCycle: LIGHTING.sky overcast.exposure 1.0 -> clear.exposure 1.5 by daylight x (1 - overcast)). The world's post
# process is manual at EXPOSURE_BIAS (the web's overcast/night exposure 1.0) and a second component, Exposure, adds
# log2(clear / overcast) with the blend weight log(web exposure / overcast) / log(clear / overcast), so the game's
# exposure is the web's. Histogram auto exposure (EV100 -4 ... 3, #2283) was compared and rejected: metered on each view it
# made the 22:00 living room with only the dusk lamps 2.2 x and the night street 30 x the web's mean luminance
# (docs/verification/2313/). EXPOSURE_BIAS is a *guess* set by the 14:00 START and living-room pairs.
EXPOSURE_BIAS = -2.55
# The web's hemisphere light (LIGHTING.sky overcast.hemi 2.0 -> clear.hemi 1.5, x daylight, + DAY.nightAmbient, x (1 - 0.3
# overcast)) reaches every surface, also deep in the rooms, unshadowed; Unreal's captured sky light reaches the rooms
# only through the windows. HEMI_SHARE of it is added to the unshadowed ambient cubemap (with the web's ambient), *guess*
# set by the living room at 14:00 (#2313). SKY_LUMINANCE scales the atmosphere's own sky luminance (the web paints a
# brighter sky, DAY_ZENITH/HORIZON, than a physical atmosphere next to an 8 lux sun), blended to SKY_OVERCAST at full
# overcast: a bright atmosphere behind the rain deck showed through it blue (trial with the factor divided by the sun's
# cut), so under rain the grey comes from the fog (FOG_GREY). Both *guess*, set by START's sky crop at 14:00, clear and
# under rain (#2313). The ambient cubemap is not scaled by the exposure (UE adds it outside the pre-exposure; trials at -1 EV
# left the night street, lit only by it, unchanged), so the fill reads in display terms like the web's flat hemisphere
# light, and EXPOSURE_BIAS only moves the sun, sky, sky light and lamps.
HEMI_SHARE = 0.72
# The fill is in display terms, so it carries the web's own exposure (expo = web exposure / clear.exposure: 1 by a clear
# day, 1/1.5 under rain and at night) and the hemisphere's night colour: daycycle.js blends the hemisphere's sky colour
# 0xeaf3ff to HEMI_NIGHT_SKY by night (1 - daylight) while its ground colour stays. The cubemap keeps the day colours and
# its weight takes the luminance ratio, averaged over the sky and ground halves (a wall sees both). Without the two terms
# the 22:00 rooms were lit mostly by a neutral fill and came out grey-white (R/B 1.11 against the web's 1.50).
HEMI_NIGHT_SKY = "6b7da8"
SKY_LUMINANCE = 9.0
SKY_OVERCAST = 1.0
# Wet surfaces soak in about 10 minutes of rain and dry in about 30 (web: src/wetground.js integrates a film; *guess*).
WET_RATE = {"soak": 1 / 600, "dry": 1 / 1800}
FOG = {"clear": 0.004, "overcast": 0.03}  # ExponentialHeightFog density (web: fog far 80 m under rain, WEATHER.fogFar)


# ------------------------------------------------------------------------------------------------------- data ----

def load_measurements(path):
    m = json.loads(Path(path).read_text(encoding="utf-8"))
    if m.get("formatVersion") != 1:
        raise RuntimeError(f"{path}: formatVersion {m.get('formatVersion')} is not 1")
    sky = (m.get("site") or {}).get("sky")
    if not sky or "hemiGround" not in sky.get("light", {}) or "rain" not in sky:
        raise RuntimeError("measurements.json site.sky is missing: re-export with this commit (export-scene.js #2283)")
    if "hemiOvercast" not in sky["light"]:
        raise RuntimeError("measurements.json lacks the hemisphere light: re-export with this commit (export-scene.js #2313)")
    if "duskOn" not in sky["light"] or "clouds" not in sky or any("auto" not in l for l in m["lights"] if l["kind"] == "lamp"):
        raise RuntimeError("measurements.json lacks the dusk, cloud and lamp numbers: re-export with this commit (export-scene.js #2307)")
    ids = [l.get("id") for l in m["lights"]]
    if not all(ids) or len(set(ids)) != len(ids):
        raise RuntimeError("measurements.json lights need unique ids: re-export with this commit")
    return m


def indoor_boxes(m):
    """Boxes (cm, Unreal axes) round the buildings, from the exporter's measurement rays (measurements.json
    `buildings`): x between the gables/side façades, y between north and south façades, z from the garage deck's
    soffit to the roof. Rain and snow are hidden inside them; Hus L's box holds L1007."""
    hits = {r["id"]: r["hit"]["unreal"] for r in m.get("buildings", []) if r.get("hit")}
    soffit = hits["garage_soffit"][2]
    spec = {"L": ("husl_west_gable", "husl_east_gable", "husl_street_facade", "husl_court_facade", "husl_roof")}
    for h in "abc":
        spec[h.upper()] = tuple(f"hus{h}_{k}" for k in ("west_facade", "east_facade", "north_facade", "south_facade", "roof"))
    boxes = []
    for house, (west, east, north, south, roof) in spec.items():
        boxes.append({"house": house, "min": [hits[west][0], hits[north][1], soffit], "max": [hits[east][0], hits[south][1], hits[roof][2]]})
    return boxes, soffit


def lamp_rows(m):
    rows = []
    for l in m["lights"]:
        rows.append({"id": l["id"], "kind": l["kind"], "level": l["level"], "room": l.get("room"), "name": l.get("name"),
                     "stairVisibility": l.get("stairVisibility"), "seasonTags": season_tags({}, l), "patioBulbs": l.get("patioBulbs"), "patioDusk": l.get("patioDusk"),
                     "xyz": l["position"]["unreal"], "candela": CANDELA_PER_WEB * (l.get("intensity") or 0.0),
                     "radius": 100.0 * (l.get("distance") or LAMP_RANGE), "colour": l.get("color") or LAMP_COLOUR,
                     # the ceiling lamps (the room switches) are by hand only; a small lamp follows the dusk unless `auto: false`
                     "auto": l["kind"] == "lamp" and l.get("auto", True)})
    return rows


def spec_of(m):
    sky = m["site"]["sky"]
    boxes, soffit = indoor_boxes(m)
    return {"sky": sky, "boxes": boxes, "soffit": soffit, "lamps": lamp_rows(m), "sunLux": SUN_LUX,
            "exposureBias": EXPOSURE_BIAS, "hemiShare": HEMI_SHARE, "hemiNightSky": HEMI_NIGHT_SKY, "skyLuminance": SKY_LUMINANCE, "skyOvercast": SKY_OVERCAST, "wet": WET_RATE, "skyScale": SKY_SCALE, "fogGrey": FOG_GREY, "ambientRef": AMBIENT_REF, "fog": FOG,
            "snowOvercast": SNOW_OVERCAST, "cloudRange": CLOUD_RANGE,
            "stairBounds": m["stair"].get("lightBounds"),
            "skyShader": hashlib.sha256(Path(sky_clouds.__file__).read_bytes()).hexdigest(),
            "stairShader": hashlib.sha256(Path(stair_lamp.__file__).read_bytes()).hexdigest(),
            "script": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}


def spec_hash(spec):
    return hashlib.sha256(json.dumps(spec, sort_keys=True).encode()).hexdigest()


# ------------------------------------------------------------------------------------------------- helpers -----

def save(asset):
    if not ASSETS.save_loaded_asset(asset, only_if_is_dirty=False):
        raise RuntimeError(f"Could not save {asset.get_path_name()} (is its .uasset locked with git lfs lock?)")


def create(path, kind, factory):
    folder, name = path.rsplit("/", 1)
    asset = TOOLS.create_asset(name, folder, kind, factory)
    if not asset:
        raise RuntimeError(f"Could not create {path}")
    return asset


def load_or_create_blueprint(path, parent):
    if ASSETS.does_asset_exist(path):
        return ASSETS.load_asset(path)
    factory = u.BlueprintFactory()
    factory.set_editor_property("parent_class", parent)
    return create(path, u.Blueprint, factory)


def pin_out(node, name):
    p = BP.find_output_pin(node, name)
    if not p.is_valid():
        raise RuntimeError(f"{node.get_name()} has no output {name}: {[str(x.get_pin_name()) for x in BP.list_output_pins(node)]}")
    return p


def connect(src, output, dst, input_name):
    out = pin_out(src, output)
    inp = BP.find_input_pin(dst, input_name)
    if not inp.is_valid() or not out.try_create_connection(inp):
        raise RuntimeError(f"Could not connect {src.get_name()}.{output} to {dst.get_name()}.{input_name} "
                           f"{[str(p.get_pin_name()) for p in BP.list_input_pins(dst)]}")


def constant(node, pin, value):
    p = BP.find_input_pin(node, pin)
    if not p.is_valid() or not p.set_pin_value(str(value)):
        raise RuntimeError(f"Could not set {node.get_name()}.{pin} to {value}")


def components(bp, wanted):
    """Add the SCS components `wanted` ({name: class}) under the root; return their templates by name."""
    subsystem = u.get_engine_subsystem(u.SubobjectDataSubsystem)
    lib = u.SubobjectDataBlueprintFunctionLibrary
    handles = subsystem.k2_gather_subobject_data_for_blueprint(bp)
    by_name = {}
    for handle in handles:
        data = subsystem.k2_find_subobject_data_from_handle(handle)
        if data is not None:
            by_name[str(lib.get_variable_name(data))] = handle
    templates = {}
    for name, cls in wanted.items():
        handle = by_name.get(name)
        if handle is None:
            params = u.AddNewSubobjectParams(parent_handle=handles[0], new_class=cls, blueprint_context=bp)
            handle, reason = subsystem.add_new_subobject(params)
            if not lib.is_handle_valid(handle):
                raise RuntimeError(f"Could not add {name} to {bp.get_name()}: {reason}")
            if not subsystem.rename_subobject(handle, u.Text(name)):
                raise RuntimeError(f"Could not name the component {name}")
        templates[name] = lib.get_object(subsystem.k2_find_subobject_data_from_handle(handle))
    return templates


def variables(bp, wanted):
    """Member variables {name: (type, default)}; types: real, int, bool, vector."""
    have = {str(n) for n in BP.list_member_variable_names(bp)}
    for name, (kind, _) in wanted.items():
        if name in have:
            continue
        typ = BP.get_struct_type(u.Vector.static_struct()) if kind == "vector" else BP.get_basic_type_by_name(kind)
        if not BP.add_member_variable(bp, name, typ):
            raise RuntimeError("Could not add the variable " + name)
        BP.set_blueprint_variable_instance_editable(bp, name, True)
    BP.compile_blueprint(bp)
    default = u.get_default_object(bp.generated_class())
    for name, (kind, value) in wanted.items():
        if value is not None:
            default.set_editor_property(name, value)


class Graph:
    """A thin layer over the event graph: placed nodes, function calls, getters, setters and an exec chain."""

    def __init__(self, bp):
        self.bp = bp
        self.g = GRAPH.get_graph_editor_by_name(bp, "EventGraph")
        self.g.remove_nodes(list(self.g.list_all_nodes()))
        self.y = 0
        self.x = 0

    def place(self, node, x=None, y=None):
        if not node:
            raise RuntimeError("node creation failed")
        if x is None:
            self.x += 260
            x, y = self.x, self.y
        BP.set_node_pos(node, u.IntPoint(int(x), int(y)))
        return node

    def call(self, path, **consts):
        full = path if path.startswith("/") else "/Script/Engine." + path
        node = self.g.add_call_function_node(full)
        if not node:
            raise RuntimeError("Could not create a call to " + full)
        self.place(node)
        for pin, value in consts.items():
            constant(node, pin, value)
        return node

    def get(self, name):
        return self.place(self.g.add_get_member_variable_node(name))

    def event(self, name, override=None):
        self.x, self.y = 0, self.y + 900
        node = self.g.create_node_from_name("AddEvent|Event" + name, u.Vector2D(0, self.y), [])
        if not node and override:
            node = BP.add_event_override(self.bp, override, u.IntPoint(0, self.y))
        if not node:
            raise RuntimeError("Could not create the event " + name)
        return self.place(node, 0, self.y)

    def custom(self, name):
        self.x, self.y = 0, self.y + 900
        return self.place(self.g.add_custom_event_node(name), 0, self.y)


class Chain:
    """Exec wiring: each step's `execute` follows the previous step's `then` (or a named exec output)."""

    def __init__(self, node, pin="then"):
        self.node, self.pin = node, pin

    def then(self, node, pin="then", into="execute"):
        connect(self.node, self.pin, node, into)
        self.node, self.pin = node, pin
        return node


class Expr:
    """Compile `name = expression` lines into pure KismetMathLibrary nodes (degrees, doubles).

    Values are Python floats (folded) or (node, pin). Functions: sind cosd tand asind acosd atan2d sqrt min max clamp
    wrap(x, lo, hi) pow select(cond, a, b) smooth(a, b, x); comparisons and `and` give booleans."""

    BIN = {ast.Add: "Add_DoubleDouble", ast.Sub: "Subtract_DoubleDouble", ast.Mult: "Multiply_DoubleDouble",
           ast.Div: "Divide_DoubleDouble"}
    CMP = {ast.Gt: "Greater_DoubleDouble", ast.GtE: "GreaterEqual_DoubleDouble", ast.Lt: "Less_DoubleDouble",
           ast.LtE: "LessEqual_DoubleDouble"}
    FN1 = {"sind": "DegSin", "cosd": "DegCos", "tand": "DegTan", "asind": "DegAsin", "acosd": "DegAcos", "sqrt": "Sqrt", "loge": "Loge"}
    PY = {ast.Add: float.__add__, ast.Sub: float.__sub__, ast.Mult: float.__mul__, ast.Div: float.__truediv__}

    def __init__(self, graph, env):
        self.G, self.env = graph, dict(env)

    def k(self, name, **pins):
        node = self.G.call("KismetMathLibrary:" + name)
        # Connections first: the arithmetic and comparison operators are promotable (wildcard pins until something
        # typed is connected), so a literal can only be set once a connected pin has fixed the type.
        for pin, value in sorted(pins.items(), key=lambda kv: not isinstance(kv[1], tuple)):
            self.feed(node, pin, value)
        return node

    def feed(self, node, pin, value):
        if isinstance(value, tuple):
            connect(value[0], value[1], node, pin)
        elif isinstance(value, bool):
            constant(node, pin, "true" if value else "false")
        else:
            constant(node, pin, repr(float(value)))

    def run(self, text):
        for line in [l.split("#", 1)[0].strip() for l in text.strip().splitlines()]:
            if not line:
                continue
            name, expr = (s.strip() for s in line.split("=", 1))
            self.env[name] = self.ev(ast.parse(expr, mode="eval").body)
        return self.env

    def ev(self, n):
        if isinstance(n, ast.Constant):
            return float(n.value)
        if isinstance(n, ast.Name):
            if n.id not in self.env:
                raise RuntimeError("Expr: unknown name " + n.id)
            return self.env[n.id]
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.USub):
            v = self.ev(n.operand)
            return -v if isinstance(v, float) else (self.k("Multiply_DoubleDouble", A=v, B=-1.0), "ReturnValue")
        if isinstance(n, ast.BinOp):
            a, b = self.ev(n.left), self.ev(n.right)
            if isinstance(a, float) and isinstance(b, float):
                return self.PY[type(n.op)](a, b)
            return self.k(self.BIN[type(n.op)], A=a, B=b), "ReturnValue"
        if isinstance(n, ast.Compare):
            a, b = self.ev(n.left), self.ev(n.comparators[0])
            return self.k(self.CMP[type(n.ops[0])], A=a, B=b), "ReturnValue"
        if isinstance(n, ast.BoolOp) and isinstance(n.op, ast.And):
            vals = [self.ev(v) for v in n.values]
            out = vals[0]
            for v in vals[1:]:
                out = (self.k("BooleanAND", A=out, B=v), "ReturnValue")
            return out
        if isinstance(n, ast.Call):
            f, args = n.func.id, [self.ev(a) for a in n.args]
            if f in self.FN1:
                if isinstance(args[0], float):
                    return {"sind": lambda x: math.sin(math.radians(x)), "cosd": lambda x: math.cos(math.radians(x)),
                            "tand": lambda x: math.tan(math.radians(x)), "asind": lambda x: math.degrees(math.asin(x)),
                            "acosd": lambda x: math.degrees(math.acos(x)), "sqrt": math.sqrt, "loge": math.log}[f](args[0])
                return self.k(self.FN1[f], A=args[0]), "ReturnValue"
            if f == "atan2d":
                return self.k("DegAtan2", Y=args[0], X=args[1]), "ReturnValue"
            if f in ("min", "max"):
                return self.k("FMin" if f == "min" else "FMax", A=args[0], B=args[1]), "ReturnValue"
            if f == "clamp":
                return self.k("FClamp", Value=args[0], Min=args[1], Max=args[2]), "ReturnValue"
            if f == "wrap":
                return self.k("FWrap", Value=args[0], Min=args[1], Max=args[2]), "ReturnValue"
            if f == "pow":
                return self.k("MultiplyMultiply_FloatFloat", Base=args[0], Exp=args[1]), "ReturnValue"
            if f == "select":
                return self.k("SelectFloat", A=args[1], B=args[2], bPickA=args[0]), "ReturnValue"
            if f == "smooth":  # three.js MathUtils.smoothstep(x, a, b) as daycycle.js `smooth(a, b, x)`
                a, b, x = args
                t = self.k("FClamp", Value=(self.k("Divide_DoubleDouble", A=(self.k("Subtract_DoubleDouble", A=x, B=a), "ReturnValue"),
                                                    B=float(b) - float(a)), "ReturnValue"), Min=0.0, Max=1.0)
                tt = self.k("Multiply_DoubleDouble", A=(t, "ReturnValue"), B=(t, "ReturnValue"))
                three = self.k("Subtract_DoubleDouble", A=3.0, B=(self.k("Multiply_DoubleDouble", A=(t, "ReturnValue"), B=2.0), "ReturnValue"))
                return self.k("Multiply_DoubleDouble", A=(tt, "ReturnValue"), B=(three, "ReturnValue")), "ReturnValue"
            raise RuntimeError("Expr: unknown function " + f)
        raise RuntimeError("Expr: unsupported syntax " + ast.dump(n))


# The web's formulas, transcribed. Inputs: Year Month Day (int → real), Hour, Latitude Longitude PlanNorth, doy, days
# (days from 2000-01-01 12:00 to local midnight of the date), Rain Snow and the light numbers.
SUN = """
dec = 23.44 * sind(360 * (284 + doy) / 365)            # daycycle.js declination (Cooper)
summer = select(doy >= 87 and doy < 300, 2, 1)          # daycycle.js summerTime: CEST by day of year
eb = 360 * (doy - 81) / 364
eot = 9.87 * sind(2 * eb) - 7.53 * cosd(eb) - 1.5 * sind(eb)   # equationOfTime (Spencer's short form), minutes
ha = (Hour - summer + Longitude / 15 + eot / 60 - 12) * 15     # solarHour → hour angle, degrees
"""
SKYDIR = """
{p}sinEl = sind(Latitude) * sind({dec}) + cosd(Latitude) * cosd({dec}) * cosd({ha})
{p}cosEl = sqrt(max(0, 1 - {p}sinEl * {p}sinEl))
{p}az = atan2d(sind({ha}), cosd({ha}) * sind(Latitude) - tand({dec}) * cosd(Latitude))
{p}e = 0 - {p}cosEl * sind({p}az)
{p}s = {p}cosEl * cosd({p}az)
{p}X = {p}e * cosd(PlanNorth) + {p}s * sind(PlanNorth)
{p}Y = {p}s * cosd(PlanNorth) - {p}e * sind(PlanNorth)
"""
MOON = """
md = days + (Hour - summer) / 24
T = md / 36525
lm = 218.32 + 481267.881 * T + 6.29 * sind(135.0 + 477198.87 * T) - 1.27 * sind(259.3 - 413335.36 * T) + 0.66 * sind(235.7 + 890534.22 * T) + 0.21 * sind(269.9 + 954397.74 * T) - 0.19 * sind(357.5 + 35999.05 * T) - 0.11 * sind(186.5 + 966404.03 * T)
bm = 5.13 * sind(93.3 + 483202.02 * T) + 0.28 * sind(228.2 + 960400.89 * T) - 0.28 * sind(318.3 + 6003.15 * T) - 0.17 * sind(217.6 - 407332.21 * T)
g = 357.528 + 35999.05 * T
ls = 280.46 + 36000.771 * T + 1.915 * sind(g) + 0.02 * sind(2 * g)
eps = 23.439 - 0.013 * T
mx = cosd(bm) * cosd(lm)
my = cosd(eps) * cosd(bm) * sind(lm) - sind(eps) * sind(bm)
mz = sind(eps) * cosd(bm) * sind(lm) + cosd(eps) * sind(bm)
ra = wrap(atan2d(my, mx), 0, 360)
mdec = asind(clamp(mz, -1, 1))
gmst = 280.46061837 + 360.98564736629 * md
mha = wrap(gmst + Longitude - ra + 180, 0, 360) - 180
dl = wrap(lm - ls, 0, 360)
illum = (1 - cosd(bm) * cosd(dl)) / 2
"""
LIGHT = """
day = smooth(-0.08, 0.18, sunsinEl)
oc = max(Rain, Snow * SnowOvercast)                      # weather.js: day.overcast, snow clouds are lighter
clear = day * (1 - oc)
ambient = ((AmbientOvercast + (AmbientClear - AmbientOvercast) * clear) * day + NightAmbient * 0.5) * (1 - 0.25 * oc)
sunRel = SunOvercast + (SunClear - SunOvercast) * clear
cut = 1 - SunCut * oc
useMoon = sunsinEl < -0.02
sunLux = SunLux / SunClear * sunRel * smooth(-0.02, 0.12, sunsinEl) * cut
moonLux = SunLux / SunClear * Moonlight * (MoonFloor + (1 - MoonFloor) * pow(illum, MoonExp)) * smooth(0.0, 0.2, moonsinEl) * cut
sunOut = select(useMoon, 0, sunLux)
moonOut = select(useMoon, moonLux, 0)
fog = FogClear + (FogOvercast - FogClear) * oc
skyI = SkyScale * (1 - 0.3 * oc)
skyLum = SkyLuminance + (SkyOvercast - SkyLuminance) * oc
hemi = ((HemiOvercast + (HemiClear - HemiOvercast) * clear) * day + NightAmbient) * (1 - 0.3 * oc)
expo = (1 + (ExpRatio - 1) * clear) / ExpRatio
fill = (ambient + HemiShare * hemi * (1 + (HemiNight - 1) * (1 - day))) * expo
expoW = loge(expo * ExpRatio) / loge(ExpRatio)
grey = FogGrey * oc * (0.15 + 0.85 * day)
streak = 0.06 + 0.54 * day
windX = 0 - WindSpeed * sind(WindFromDeg - PlanNorth)
windY = WindSpeed * cosd(WindFromDeg - PlanNorth)
"""
# #2307: what the small lamps follow (main.js: lights.updateAuto(day.daylight x (1 - 0.6 x weather.overcast)), the weather's
# own overcast, before the snow's 0.7), the night (daycycle.js uNight), the moon's phase vector for the disc (uMoonPh: sin e,
# -cos e, lit fraction; e = elongation, moon.js) and the sky's cloud threshold (cloudshadow.js skyCloudState) as a cover
# 0 (clear) ... 1 (overcast) and the engine cloud material's coverage for it.
EXTRA = """
duskLight = day * (1 - 0.6 * max(Rain, Snow))
night = 1 - day
ce = cosd(bm) * cosd(dl)
sinE = sqrt(max(0, 1 - ce * ce))
negCosE = 0 - ce
ocl = min(oc, 1)
cthr = ThrA + (ThrB - ThrA) * ocl
skyThr = ClearThr + (cthr - ClearThr) * smooth(0, Ramp, ocl)
cover = (ClearThr - skyThr) / (ClearThr - ThrB)
coverage = CloudLo + (CloudHi - CloudLo) * cover
"""


# ------------------------------------------------------------------------------------------------- assets -----

def build_mpc(spec):
    mpc = ASSETS.load_asset(MPC) if ASSETS.does_asset_exist(MPC) else create(MPC, u.MaterialParameterCollection, u.MaterialParameterCollectionFactoryNew())
    r, s = spec["sky"]["rain"], spec["sky"]["snow"]
    scalars = {"Rain": 0.0, "Snow": 0.0, "Wet": 0.0, "WindX": 0.0, "WindY": 0.0, "Streak": 0.6, "Soffit": spec["soffit"],
               "RainSpeed": r["speed"] * 100, "RainLength": r["len"] * 100, "RainRadius": r["radius"] * 100,
               "RainHeight": r["height"] * 100, "SlantPerMs": r["slantPerMs"], "SlantMax": r["slantMax"],
               "SnowSpeed": s["speed"] * 100, "SnowSway": s["sway"] * 100, "SnowSize": s["size"] * 100,
               "DriftPerMs": s["driftPerMs"], "DriftMax": s["driftMax"] * 100,
               # #2307: DuskLight (what the small lamps follow) -1 = the sky has not run yet (the lamps wait); the clouds; the moon disc
               "DuskLight": -1.0, "Daylight": -1.0, "Hour": 14.0, "PowerAvailable": 1.0,
               "CloudOffsetX": 0.0, "CloudOffsetY": 0.0, "SkyThreshold": spec["sky"]["clouds"]["clearThr"], "Overcast": 0.0,
               "Night": 0.0, "CloudCover": 0.0, "CloudCoverage": 0.0,
               "MoonRadius": spec["sky"]["light"]["moonRadius"], "Earthshine": spec["sky"]["light"]["moonEarthshine"]}
    vectors = {"SunDir": u.LinearColor(0, 0, 1, 0), "MoonDir": u.LinearColor(0, 0, -1, 0), "MoonPh": u.LinearColor(0, 1, 1, 0)}
    for i, box in enumerate(spec["boxes"]):
        vectors[f"Box{i}Min"] = u.LinearColor(*box["min"], 1)
        vectors[f"Box{i}Max"] = u.LinearColor(*box["max"], 1)
    def entry(kind, name, value):
        e = kind()
        e.set_editor_property("parameter_name", name)
        e.set_editor_property("default_value", value)
        return e

    mpc.set_editor_property("scalar_parameters", [entry(u.CollectionScalarParameter, k, float(v)) for k, v in scalars.items()])
    mpc.set_editor_property("vector_parameters", [entry(u.CollectionVectorParameter, k, v) for k, v in vectors.items()])
    return mpc


# HLSL of the precipitation post process (UE units: cm). Cylinders of radius R round the eye carry the drops in their
# own (u = arc length, v = height + fall) coordinates, so they stay put as the view turns; a sample is drawn only in
# front of the opaque scene, outside every indoor box and above the garage deck's soffit.
PRECIP_HLSL = r"""
float3 col = Scene.rgb;
float3 d = WPos - Cam; float depth = length(d); float3 v = d / max(depth, 1e-3);
float3 mn[4] = { B0n.xyz, B1n.xyz, B2n.xyz, B3n.xyz }; float3 mx[4] = { B0x.xyz, B1x.xyz, B2x.xyz, B3x.xyz };
// wet outdoor surfaces: darker, glossier, with a faint sky sheen (src/wetground.js / wetsurface.js in a simple form)
if (Wet > 0.001 && depth < 1e6) {
  float3 q = WPos + N.xyz * 10.0; bool inside = q.z < Soffit;
  for (int b = 0; b < 4; b++) inside = inside || (all(q > mn[b]) && all(q < mx[b]));
  if (!inside) {
    float up = saturate(N.z);
    float k = Wet * (0.35 + 0.25 * up);
    float fres = 0.04 + 0.96 * pow(1.0 - saturate(dot(-v, N.xyz)), 5.0);
    col = col * (1.0 - k) + Light * 0.5 * fres * up * Wet;
  }
}
// #2307: the web's moon disc with its phase, its halo and the stars (daycycle.js skyFrag, transcribed in the web's axes: x
// east, y up, z south) on the sky itself, in display units (x EAI); the clouds cover them as the web mixes its clouds in
if (depth >= 1e6) {
  float3 dw = float3(v.x, v.z, v.y), sw = float3(SunDir.x, SunDir.z, SunDir.y), mw = float3(MoonDir.x, MoonDir.z, MoonDir.y);
  WebClouds clouds;
  col = clouds.daylight(col, dw, sw, Cam*0.01, float2(CloudOffsetX,CloudOffsetY), SkyThreshold, Overcast);
  // #2366: at START the clear night sky measured 0.0139 linear luminance at the game exposure
  // and 0.0257 at +1.76 EV; the web measured 0.0237. Log interpolation gives +1.53 EV (guess).
  // Lift the atmospheric background before drawing the exposure-independent stars and moon.
  // Fade in between civil and astronomical twilight (sin 6 and 18 degrees below the horizon).
  float darkSky = smoothstep(0.104528, 0.309017, -sw.y) * (1.0 - saturate(CloudCover));
  col *= exp2(1.53 * darkSky);
  float clear = 1.0 - 0.85 * CloudCover, sR = sin(MoonRadius);
  float m = max(dot(dw, mw), 0.0);
  if (m > cos(MoonRadius * 1.6)) {
    float3 pd = dw - mw * m, su = sw - mw * dot(sw, mw);
    float3 uu = su / max(length(su), 1e-4), vv = cross(mw, uu);
    float2 xy = float2(dot(pd, uu), dot(pd, vv)) / sR;
    float rr = length(xy), z = sqrt(max(1.0 - rr * rr, 0.0));
    float lit = smoothstep(-0.04, 0.08, xy.x * MoonPh.x + z * MoonPh.y);
    float3 e1 = normalize(cross(float3(0.0, 1.0, 0.0), mw));
    float2 mp = float2(dot(pd, e1), dot(pd, cross(mw, e1))) / sR;
    float mare = 0.80 + 0.20 * smoothstep(-0.5, 0.6, sin(mp.x * 2.6 + 1.1) * sin(mp.y * 2.1 - 0.4) + 0.5 * sin(mp.x * 5.0 - mp.y * 3.5));
    float disc = (1.0 - smoothstep(0.9, 1.0, rr)) * step(-0.05, mw.y);
    float3 surf = float3(0.92, 0.94, 1.0) * mare * (0.85 + 0.15 * z) * EAI;
    col = lerp(col, surf, disc * lit * (0.3 + 0.7 * Night) * clear);
    col = lerp(col, float3(0.92, 0.94, 1.0) * Earthshine * EAI, disc * (1.0 - lit) * Night * 0.9 * clear);
  }
  col += float3(0.25, 0.28, 0.35) * pow(m, 400.0) * Night * MoonPh.z * MoonPh.z * EAI * clear;
  float3 q = floor(dw * 260.0);
  float star = step(0.9975, frac(sin(dot(q, float3(12.9898, 78.233, 37.719))) * 43758.5453)) * Night * smoothstep(0.02, 0.2, dw.y);
  col += star * (0.6 + 0.4 * frac(sin(dot(q + 1.0, float3(12.9898, 78.233, 37.719))) * 43758.5453)) * EAI * clear;
}
float hv = length(v.xy);
float amt = max(Rain, Snow);
if (amt > 0.001 && hv > 0.02) {
  float a = 0.0;
  float ang = atan2(v.y, v.x);
  for (int i = 0; i < 8; i++) {
    float R = 120.0 * pow(1.42, (float)i);           // 1.2 m … 14.1 m, the web's drops lie within WEATHER.radius
    if (R > Radius * 1.1) break;
    float t = R / hv;
    if (t > depth) break;
    float3 p = Cam + v * t;
    if (p.z < Soffit || p.z > Cam.z + Height) continue;
    bool inside = false;
    for (int b = 0; b < 4; b++) inside = inside || (all(p > mn[b]) && all(p < mx[b]));
    if (inside) continue;
    float px = 0.0018 * t;                           // about one pixel at this distance
    float2 tang = float2(-sin(ang), cos(ang));
    float u0 = ang * R;
    if (Rain > 0.001) {
      float slant = clamp(dot(Wind, tang) * SlantPerMs, -SlantMax, SlantMax);
      float2 uv = float2(u0 + slant * p.z + (float)i * 37.0, p.z + Speed * Time + (float)i * 113.0);
      float2 cell = float2(22.0, Length * 2.2);
      float2 c = floor(uv / cell); float2 f = uv / cell - c;
      float h = frac(sin(dot(c, float2(12.9898, 78.233)) + (float)i * 4.1) * 43758.5453);
      float h2 = frac(h * 91.17 + 0.31);
      if (h < Rain * 0.75) {
        float dx = abs(f.x - (0.15 + 0.7 * h2)) * cell.x;
        float w = max(0.25, px);
        float along = saturate((f.y - 0.1) / max(Length / cell.y, 0.01));
        float streakA = saturate(1.0 - dx / w) * step(f.y, 0.1 + Length / cell.y) * step(0.1, f.y) * (0.4 + 0.6 * along);
        a = max(a, streakA * 0.55 * saturate(0.25 / max(px, 0.25)));
      }
    }
    if (Snow > 0.001) {
      float drift = clamp(dot(Wind, tang) * DriftPerMs * 100.0, -DriftMax, DriftMax) * Time;
      float2 uv = float2(u0 - drift + (float)i * 53.0, p.z + SnowSpeed * Time + (float)i * 71.0);
      float2 cell = float2(30.0, 30.0);
      float2 c = floor(uv / cell);
      float h = frac(sin(dot(c, float2(39.346, 11.135)) + (float)i * 2.7) * 43758.5453);
      float h2 = frac(h * 57.31 + 0.17), h3 = frac(h * 13.73 + 0.71);
      if (h < Snow * 0.6) {
        float2 centre = (c + float2(0.2 + 0.6 * h2, 0.2 + 0.6 * h3)) * cell;
        centre.x += sin(Time * (0.8 + h) + h * 6.283) * Sway;
        float r = max(Size * 0.5, px * 0.7);
        float dd = length(uv - centre);
        a = max(a, saturate(1.0 - dd / r) * 0.9);
      }
    }
  }
  float level = Rain >= Snow ? Light : Light * 1.4;
  col = lerp(col, float3(level, level, level * 1.03), saturate(a));
}
return float4(col, 1.0);
"""


SKY_CLOUD_PARAMETERS = ("CloudOffsetX", "CloudOffsetY", "SkyThreshold", "Overcast")


def precip_code(spec):
    return sky_clouds.shader(spec["sky"]["clouds"]) + PRECIP_HLSL.strip()


def precip_matches(spec):
    mat = ASSETS.load_asset(PRECIP)
    node = MEL.get_material_property_input_node(mat, u.MaterialProperty.MP_EMISSIVE_COLOR)
    if not isinstance(node, u.MaterialExpressionCustom) or node.get_editor_property("code") != precip_code(spec):
        return False
    params = {str(source.get_editor_property("parameter_name"))
              for source in MEL.get_inputs_for_material_expression(mat, node)
              if isinstance(source, u.MaterialExpressionCollectionParameter)}
    return all(name in params for name in SKY_CLOUD_PARAMETERS)


def build_precip_material(spec, mpc):
    if ASSETS.does_asset_exist(PRECIP):
        mat = ASSETS.load_asset(PRECIP)
        MEL.delete_all_material_expressions(mat)
    else:
        mat = create(PRECIP, u.Material, u.MaterialFactoryNew())
    mat.set_editor_property("material_domain", u.MaterialDomain.MD_POST_PROCESS)
    mat.set_editor_property("blendable_location", u.BlendableLocation.BL_SCENE_COLOR_BEFORE_DOF)
    custom = MEL.create_material_expression(mat, u.MaterialExpressionCustom, -400, 0)
    names = ["Scene", "WPos", "Cam", "N", "Time", "Light", "Rain", "Snow", "Wet", "Wind", "Soffit", "Radius", "Height",
             "Speed", "Length", "SlantPerMs", "SlantMax", "SnowSpeed", "Sway", "Size", "DriftPerMs", "DriftMax",
             "B0n", "B0x", "B1n", "B1x", "B2n", "B2x", "B3n", "B3x",
             "EAI", "SunDir", "MoonDir", "MoonPh", "Night", "CloudCover", "MoonRadius", "Earthshine", *SKY_CLOUD_PARAMETERS]
    inputs = []
    for name in names:
        ci = u.CustomInput()
        ci.set_editor_property("input_name", name)
        inputs.append(ci)
    custom.set_editor_property("inputs", inputs)
    custom.set_editor_property("output_type", u.CustomMaterialOutputType.CMOT_FLOAT4)
    custom.set_editor_property("description", "LundenPrecipitation")
    custom.set_editor_property("code", precip_code(spec))
    y = [0]

    def expr(cls, **props):
        e = MEL.create_material_expression(mat, cls, -900, y[0])
        y[0] += 60
        for k, v in props.items():
            e.set_editor_property(k, v)
        return e

    def wire(src, name, output=""):
        if not MEL.connect_material_expressions(src, output, custom, name):
            raise RuntimeError("Could not connect the precipitation input " + name)

    def param(name):
        return expr(u.MaterialExpressionCollectionParameter, collection=mpc, parameter_name=name)

    wire(expr(u.MaterialExpressionSceneTexture, scene_texture_id=u.SceneTextureId.PPI_POST_PROCESS_INPUT0), "Scene", "Color")
    wire(expr(u.MaterialExpressionWorldPosition), "WPos")
    wire(expr(u.MaterialExpressionCameraPositionWS), "Cam")
    wire(expr(u.MaterialExpressionSceneTexture, scene_texture_id=u.SceneTextureId.PPI_WORLD_NORMAL), "N", "Color")
    wire(expr(u.MaterialExpressionTime), "Time")
    light = expr(u.MaterialExpressionMultiply)
    MEL.connect_material_expressions(param("Streak"), "", light, "A")
    MEL.connect_material_expressions(expr(u.MaterialExpressionEyeAdaptationInverse), "", light, "B")
    wire(light, "Light")
    for name, source in (("Rain", "Rain"), ("Snow", "Snow"), ("Wet", "Wet"), ("Soffit", "Soffit"), ("Radius", "RainRadius"),
                         ("Height", "RainHeight"), ("Speed", "RainSpeed"), ("Length", "RainLength"), ("SlantPerMs", "SlantPerMs"),
                         ("SlantMax", "SlantMax"), ("SnowSpeed", "SnowSpeed"), ("Sway", "SnowSway"), ("Size", "SnowSize"),
                         ("DriftPerMs", "DriftPerMs"), ("DriftMax", "DriftMax")):
        wire(param(source), name)
    wind = expr(u.MaterialExpressionAppendVector)
    MEL.connect_material_expressions(param("WindX"), "", wind, "A")
    MEL.connect_material_expressions(param("WindY"), "", wind, "B")
    wire(wind, "Wind")
    for i in range(4):
        for suffix, short in (("Min", "n"), ("Max", "x")):
            wire(param(f"Box{i}{suffix}"), f"B{i}{short}")
    wire(expr(u.MaterialExpressionEyeAdaptationInverse), "EAI")
    for name in ("SunDir", "MoonDir", "MoonPh", "Night", "CloudCover", "MoonRadius", "Earthshine", *SKY_CLOUD_PARAMETERS):
        wire(param(name), name)
    MEL.connect_material_property(custom, "", u.MaterialProperty.MP_EMISSIVE_COLOR)
    MEL.recompile_material(mat)
    return mat


def build_clouds(mpc):
    """M_LundenClouds: a copy of Epic's simple volumetric cloud material whose global coverage (a scalar parameter, -0.2 by
    default) is the weather collection's CloudCoverage, which UpdateSky sets from the web's cloud rule. A copy, because the
    sky's cloud cover must follow the weather at run time without a dynamic material instance (captures and tests call
    UpdateSky in an editor world, where BeginPlay never ran)."""
    if ASSETS.does_asset_exist(CLOUDS):
        ASSETS.delete_asset(CLOUDS)
    source = u.load_asset(CLOUD_SOURCE)  # (engine content is not in a commandlet's asset registry: copy the loaded object)
    mat = TOOLS.duplicate_asset(CLOUDS.rsplit("/", 1)[1], DIR, source) if source else None
    if not mat:
        raise RuntimeError("Could not copy " + CLOUD_SOURCE)
    exprs = list(MEL.get_material_expressions(mat))
    old = [e for e in exprs if isinstance(e, u.MaterialExpressionScalarParameter)
           and str(e.get_editor_property("parameter_name")) == "Cloud_GlobalCoverage"]
    if len(old) != 1:
        raise RuntimeError(f"{CLOUD_SOURCE}: expected one Cloud_GlobalCoverage parameter, found {len(old)}")
    x, y = MEL.get_material_expression_node_position(old[0])
    new = MEL.create_material_expression(mat, u.MaterialExpressionCollectionParameter, x, y + 80)
    new.set_editor_property("collection", mpc)
    new.set_editor_property("parameter_name", "CloudCoverage")
    moved = 0
    for e in exprs:
        if e == old[0]:
            continue
        for name, src in zip(MEL.get_material_expression_input_names(e), MEL.get_inputs_for_material_expression(mat, e)):
            if src == old[0]:
                if not MEL.connect_material_expressions(new, "", e, str(name)):
                    raise RuntimeError(f"Could not rewire {e.get_name()}.{name} to CloudCoverage")
                moved += 1
    if not moved:
        raise RuntimeError("Cloud_GlobalCoverage feeds nothing in " + CLOUD_SOURCE)
    MEL.delete_material_expression(mat, old[0])
    MEL.recompile_material(mat)
    u.log(f"LUNDEN_LIGHTING clouds: Cloud_GlobalCoverage -> MPC CloudCoverage on {moved} input(s)")
    return mat


def ambient_ref(spec):
    """The ambient cubemap's full intensity: an upper bound of the unshadowed fill UpdateSky asks for (the larger web
    ambient and hemisphere values at full exposure), so the post process's blend weight, fill / AmbientRef, stays within 0 ... 1."""
    l = spec["sky"]["light"]
    return max(l["ambientOvercast"], l["ambientClear"]) + l["nightAmbient"] * 0.5 + HEMI_SHARE * (max(l["hemiOvercast"], l["hemiClear"]) + l["nightAmbient"])


def hemi_night(spec):
    """The hemisphere light's luminance at night ÷ by day, averaged over its sky and ground colours (see HEMI_NIGHT_SKY)."""
    light = spec["sky"]["light"]
    lum = lambda c: sum(w * (((v / 255 + 0.055) / 1.055) ** 2.4 if v / 255 > 0.04045 else v / 255 / 12.92)
                        for w, v in zip((0.2126, 0.7152, 0.0722), bytes.fromhex(c.lstrip("#"))))
    return (lum(HEMI_NIGHT_SKY) + lum(light["hemiGround"])) / (lum(light["hemiSky"]) + lum(light["hemiGround"]))


def hemisphere_cube(spec):
    """T_LundenHemisphere: a 64 x 32 lat-long HDR, the web's HemisphereLight colours blended by height (three.js mixes
    ground → sky by 0.5 + 0.5 x up), imported as a TextureCube."""
    light = spec["sky"]["light"]
    lin = lambda c: [((v / 255 + 0.055) / 1.055) ** 2.4 if v / 255 > 0.04045 else v / 255 / 12.92 for v in bytes.fromhex(c.lstrip("#"))]
    sky, ground = lin(light["hemiSky"]), lin(light["hemiGround"])
    hdr = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_intermediate_dir())) / "T_LundenHemisphere.hdr"
    with hdr.open("wb") as f:
        f.write(b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 32 +X 64\n")
        for row in range(32):
            k = 0.5 + 0.5 * math.cos(math.pi * (row + 0.5) / 32)
            rgb = [g + (s - g) * k for s, g in zip(sky, ground)]
            _, exponent = math.frexp(max(rgb))
            pixel = [int(value * 256 / 2 ** exponent) for value in rgb] + [exponent + 128]
            f.write(bytes((2, 2, 0, 64)))
            for value in pixel:
                f.write(bytes((128 + 64, value)))
    task = u.AssetImportTask()
    task.filename = str(hdr.resolve())
    task.destination_path = DIR
    task.replace_existing = True
    task.automated = True
    task.save = False
    TOOLS.import_asset_tasks([task])
    cube = u.load_asset(AMBIENT_CUBE)
    if not isinstance(cube, u.TextureCube):
        raise RuntimeError("Could not import " + AMBIENT_CUBE + " as a TextureCube")
    return cube


def patio_string_function(bp):
    """Share one glTF unlit MID across the tagged bulbs. Only the designated lamp writes its fade."""
    if BP.find_graph(bp, "ApplyPatioBulbs"):
        # An earlier build has event nodes calling this function. Clear them before recompiling.
        events = GRAPH.get_graph_editor_by_name(bp, "EventGraph")
        events.remove_nodes(list(events.list_all_nodes()))
        BP.remove_function_graph(bp, "ApplyPatioBulbs")
    pp.variables(bp, {"StringMaterial": BP.get_object_reference_type(u.MaterialInstanceDynamic.static_class())})
    g, _ = pp.function(bp, "ApplyPatioBulbs")
    g.branch(g.pure("Actor:ActorHasTag", Tag="patio:string-driver"))
    needs_material = g.op("Not_PreBool", A=g.pure("KismetSystemLibrary:IsValid", Object=g.get("StringMaterial")))
    existing = g.branch(needs_material)
    found = g.node_of("GameplayStatics:GetAllActorsWithTag", Tag="patio:string-bulb")
    bulbs = pp.out(found, "OutActors")
    g.branch(g.op("Greater_IntInt", A=g.pure("KismetArrayLibrary:Array_Length", TargetArray=bulbs), B=0))

    def bulb_component(graph, actor):
        return graph.pure("Actor:GetComponentByClass", target=actor, ComponentClass="/Script/Engine.StaticMeshComponent")

    first = bulb_component(g, g.item(bulbs, 0))
    mid = g.pure("PrimitiveComponent:CreateDynamicMaterialInstance", target=first, ElementIndex=0)
    g.set("StringMaterial", mid)
    actor, _, done = g.loop(bulbs)
    mesh = bulb_component(g, actor)
    g.run("PrimitiveComponent:SetMaterial", target=mesh, ElementIndex=0, Material=g.get("StringMaterial"))
    tail = g.fork(done, 650)
    live = tail.op("Multiply_DoubleDouble", A=tail.get("K"), B=tail.get("Supply"))
    amount = tail.op("Add_DoubleDouble", A=tail.get("BulbIdle"),
                     B=tail.op("Multiply_DoubleDouble", A=tail.get("BulbBoost"), B=live))
    rgb = tail.op("Multiply_VectorFloat", A=tail.get("BulbColour"), B=amount)
    color = tail.pure("KismetMathLibrary:Conv_VectorToLinearColor", InVec=rgb)
    update = tail.run("MaterialInstanceDynamic:SetVectorParameterValue", target=tail.get("StringMaterial"),
                      ParameterName="BaseColorFactor", Value=color)
    pp.link(existing, pp.inp(update, "execute"))
    BP.compile_blueprint(bp)


def build_lamp(spec, mpc):
    """BP_LundenLamp: IsOn and the events #2285's switches call, plus the web's small-lamp behaviour (src/lights.js
    FloorLamp / Lights.updateAuto, #2307): K is how far on it is (the light's intensity is Candela x K); TurnOn, TurnOff and
    Toggle set it at once. Tick reads the sky's DuskLight from MPC_LundenWeather (-1 until the sky has run) and keeps Dusk
    (-1 unknown, 0 light, 1 dark) with the web's hysteresis: dark below DuskOn, light again above DuskOff, the first
    reading split at their middle. Only a change of Dusk switches a lamp with Auto, so one switched by hand stays until
    the next dusk or dawn; the first reading sets it at once, later ones fade over DuskFade seconds."""
    bp = load_or_create_blueprint(LAMP, u.Actor)
    comps = components(bp, {"Light": u.PointLightComponent})
    light = comps["Light"]
    light.set_editor_property("mobility", u.ComponentMobility.MOVABLE)
    light.set_editor_property("intensity_units", u.LightUnits.CANDELAS)
    light.set_editor_property("attenuation_radius", 100.0 * LAMP_RANGE)
    light.set_editor_property("cast_shadows", False)  # one shadow-casting light (the sun/moon), as the web
    sky = spec["sky"]["light"]
    variables(bp, {"IsOn": ("bool", False), "Auto": ("bool", False), "Candela": ("real", 0.0), "K": ("real", 0.0),
                   "Dusk": ("real", -1.0), "DuskOn": ("real", sky["duskOn"]), "DuskOff": ("real", sky["duskOff"]),
                   "DuskFade": ("real", sky["duskFade"]), "PatioDusk": ("bool", False), "Supply": ("real", 1.0),
                   "BulbIdle": ("real", 0.0),
                   "BulbBoost": ("real", 0.0), "BulbColour": ("vector", u.Vector(0, 0, 0))})
    patio_string_function(bp)
    G = Graph(bp)

    def show(chain):
        """K at once from IsOn, then the light's intensity and visibility."""
        env = Expr(G, {"IsOn": (G.get("IsOn"), "IsOn")})
        k = G.place(G.g.add_set_member_variable_node("K"))
        env.feed(k, "K", env.run("k = select(IsOn, 1, 0)")["k"])
        chain.then(k)
        apply_k(chain)

    def apply_k(chain):
        env = Expr(G, {n: (G.get(n), n) for n in ("K", "Candela", "Supply")})
        power = G.call("LightComponent:SetIntensity")
        connect(G.get("Light"), "Light", power, "self")
        env.feed(power, "NewIntensity", env.run("c = Candela * K * Supply")["c"])
        chain.then(power)
        vis = G.call("SceneComponent:SetVisibility")
        connect(G.get("Light"), "Light", vis, "self")
        env.feed(vis, "bNewVisibility", env.run("v = K * Supply > 0.0001")["v"])
        chain.then(vis)
        chain.then(G.call(LAMP + ".BP_LundenLamp_C:ApplyPatioBulbs"))

    for name, value in (("TurnOn", True), ("TurnOff", False), ("Toggle", None)):
        start = G.custom(name)
        chain = Chain(start)
        setter = G.place(G.g.add_set_member_variable_node("IsOn"))
        if value is None:
            flip = G.call("KismetMathLibrary:Not_PreBool")
            connect(G.get("IsOn"), "IsOn", flip, "A")
            connect(flip, "ReturnValue", setter, "IsOn")
        else:
            constant(setter, "IsOn", "true" if value else "false")
        chain.then(setter)
        show(chain)
    show(Chain(G.event("BeginPlay", "ReceiveBeginPlay")))

    # Tick: the dusk (Lights.updateAuto), then the fade (FloorLamp.update)
    tick = G.event("Tick", "ReceiveTick")
    # The patio reads raw daylight. The other automatic lamps also respond to cloud cover.
    source = G.call("KismetMathLibrary:SelectName", A="Daylight", B="DuskLight")
    connect(G.get("PatioDusk"), "PatioDusk", source, "bPickA")
    daylight = G.call("KismetMaterialLibrary:GetScalarParameterValue")
    connect(source, "ReturnValue", daylight, "ParameterName")
    constant(daylight, "Collection", mpc.get_path_name())
    env = {n: (G.get(n), n) for n in ("Dusk", "DuskOn", "DuskOff", "K", "IsOn", "DuskFade", "PatioDusk")}
    env.update({"day": (daylight, "ReturnValue"), "dt": (tick, "DeltaSeconds")})
    E = Expr(G, env)
    v = E.run("""
stillDark = select(PatioDusk, select(day <= DuskOff, 1, 0), select(day < DuskOff, 1, 0))
d = select(Dusk >= 0, select(Dusk > 0.5, stillDark, select(day < DuskOn, 1, 0)), select(day < (DuskOn + DuskOff) / 2, 1, 0))
valid = day >= 0
changed = (d - Dusk) * (d - Dusk) > 0.25
first = Dusk < 0
""")
    fade = E.run("""
kNew = select(IsOn, min(1, K + dt / DuskFade), max(0, K - dt / DuskFade))
moving = (kNew - K) * (kNew - K) > 0.0000000001
""")
    b_valid, b_changed, b_auto, b_first, b_moving = (G.place(G.g.add_branch_node()) for _ in range(5))
    for branch, cond in ((b_valid, v["valid"]), (b_changed, v["changed"]), (b_first, v["first"]), (b_moving, fade["moving"])):
        E.feed(branch, "Condition", cond)
    connect(G.get("Auto"), "Auto", b_auto, "Condition")
    patio = G.place(G.g.add_branch_node())
    connect(G.get("PatioDusk"), "PatioDusk", patio, "Condition")
    connect(tick, "then", patio, "execute")
    connect(patio, "else", daylight, "execute")
    grid = G.call("KismetMaterialLibrary:GetScalarParameterValue", ParameterName="PowerAvailable")
    constant(grid, "Collection", mpc.get_path_name())
    connect(patio, "then", grid, "execute")
    supply = Expr(G, {"grid": (grid, "ReturnValue"), "previous": (G.get("Supply"), "Supply")})
    changed = G.place(G.g.add_branch_node())
    supply.feed(changed, "Condition", supply.run("changed = (grid - previous) * (grid - previous) > 0.00000001")["changed"])
    connect(grid, "then", changed, "execute")
    connect(changed, "else", daylight, "execute")
    store = G.place(G.g.add_set_member_variable_node("Supply"))
    connect(grid, "ReturnValue", store, "Supply")
    connect(changed, "then", store, "execute")
    refreshed = Chain(store)
    apply_k(refreshed)
    connect(refreshed.node, refreshed.pin, daylight, "execute")
    connect(daylight, "then", b_valid, "execute")
    connect(b_valid, "then", b_changed, "execute")
    connect(b_changed, "then", b_auto, "execute")
    # Auto: on with the dark; the first reading also sets K at once (web: `f.set(dark)`), later ones fade (`f.room.on = dark`)
    on = G.place(G.g.add_set_member_variable_node("IsOn"))
    E.feed(on, "IsOn", E.run("dk = d > 0.5")["dk"])
    connect(b_auto, "then", on, "execute")
    connect(on, "then", b_first, "execute")
    at_once = G.place(G.g.add_set_member_variable_node("K"))
    E.feed(at_once, "K", v["d"])
    connect(b_first, "then", at_once, "execute")
    record = G.place(G.g.add_set_member_variable_node("Dusk"))  # after the lamp: `d` and `first` read the old Dusk
    E.feed(record, "Dusk", v["d"])
    for src, pin in ((b_auto, "else"), (b_first, "else"), (at_once, "then")):
        connect(src, pin, record, "execute")
    shown = Chain(record)  # the light follows a K set at once
    apply_k(shown)
    for src, pin in ((b_valid, "else"), (b_changed, "else"), (shown.node, shown.pin)):
        connect(src, pin, b_moving, "execute")
    step = G.place(G.g.add_set_member_variable_node("K"))
    E.feed(step, "K", fade["kNew"])
    connect(b_moving, "then", step, "execute")
    apply_k(Chain(step))
    pp.compiled(bp)  # inspect both the event graph and the bulb material function
    return bp


def build_sky(spec, mpc, precip, clouds):
    bp = load_or_create_blueprint(SKY, u.Actor)
    comps = components(bp, {"Sun": u.DirectionalLightComponent, "Moon": u.DirectionalLightComponent,
                            "Atmosphere": u.SkyAtmosphereComponent, "SkyLight": u.SkyLightComponent,
                            "Fog": u.ExponentialHeightFogComponent, "Clouds": u.VolumetricCloudComponent,
                            "Weather": u.PostProcessComponent, "Ambient": u.PostProcessComponent, "Exposure": u.PostProcessComponent})
    for name in ("Sun", "Moon"):
        c = comps[name]
        c.set_editor_property("mobility", u.ComponentMobility.MOVABLE)
        c.set_editor_property("atmosphere_sun_light", True)
        c.set_editor_property("atmosphere_sun_light_index", 0 if name == "Sun" else 1)
        c.set_editor_property("cast_shadows", True)
    comps["Moon"].set_editor_property("light_color", u.Color(r=196, g=210, b=255, a=255))  # daycycle.js MOON tint, *guess*
    # the moon's disc is the post process's (with its phase, #2307), not the atmosphere's round light disk
    comps["Moon"].set_editor_property("atmosphere_sun_disk_color_scale", u.LinearColor(0, 0, 0, 1))
    sky = comps["SkyLight"]
    sky.set_editor_property("mobility", u.ComponentMobility.MOVABLE)
    sky.set_editor_property("real_time_capture", True)
    sky.set_editor_property("source_type", u.SkyLightSourceType.SLS_CAPTURED_SCENE)
    fog = comps["Fog"]
    fog.set_editor_property("fog_density", FOG["clear"])
    comps["Clouds"].set_editor_property("material", clouds)
    weather = comps["Weather"]
    weather.set_editor_property("unbound", True)
    pp = weather.get_editor_property("settings")
    pp.set_editor_property("weighted_blendables", u.WeightedBlendables(array=[u.WeightedBlendable(weight=1.0, object=precip)]))
    for key, value in (("auto_exposure_method", u.AutoExposureMethod.AEM_MANUAL), ("auto_exposure_apply_physical_camera_exposure", False),
                       ("auto_exposure_bias", EXPOSURE_BIAS)):
        pp.set_editor_property("override_" + key, True)
        pp.set_editor_property(key, value)
    for key in ("auto_exposure_min_brightness", "auto_exposure_max_brightness"):  # (#2283's histogram range, unused now)
        pp.set_editor_property("override_" + key, False)
    weather.set_editor_property("settings", pp)
    light = spec["sky"]["light"]
    exposure = comps["Exposure"]  # the web's clear-sky exposure on top, weighted by UpdateSky
    exposure.set_editor_property("unbound", True)
    exposure.set_editor_property("priority", 1.0)
    pp = exposure.get_editor_property("settings")
    pp.set_editor_property("override_auto_exposure_bias", True)
    pp.set_editor_property("auto_exposure_bias", EXPOSURE_BIAS + math.log2(light["exposureClear"] / light["exposureOvercast"]))
    exposure.set_editor_property("settings", pp)
    ambient = comps["Ambient"]
    ambient.set_editor_property("unbound", True)
    pp = ambient.get_editor_property("settings")
    pp.set_editor_property("ambient_cubemap", hemisphere_cube(spec))
    pp.set_editor_property("override_ambient_cubemap_intensity", True)
    pp.set_editor_property("ambient_cubemap_intensity", ambient_ref(spec))
    ambient.set_editor_property("settings", pp)

    sky_data, light = spec["sky"], spec["sky"]["light"]
    clouds = sky_data["clouds"]
    wx, wy = clouds.get("wind", (1, 0))  # older exports have no independently moving sky field
    length = math.hypot(wx, wy)
    variables(bp, {
        "CloudOffsetX": ("real", 0), "CloudOffsetY": ("real", 0),
        "CloudDirectionX": ("real", wx / length), "CloudDirectionY": ("real", wy / length),
        "Latitude": ("real", sky_data["lat"]), "Longitude": ("real", sky_data["lon"]), "PlanNorth": ("real", sky_data["planNorthDeg"]),
        "UseClock": ("bool", True), "TimeScale": ("real", 1.0),
        "Year": ("int", 2026), "Month": ("int", 6), "Day": ("int", 21), "Hour": ("real", 14.0),
        "Rain": ("real", 0.0), "Snow": ("real", 0.0), "Wet": ("real", 0.0), "WindSpeed": ("real", 0.0), "WindFromDeg": ("real", 245.0),
        "SunLux": ("real", spec["sunLux"]), "SunOvercast": ("real", light["sunOvercast"]), "SunClear": ("real", light["sunClear"]),
        "Moonlight": ("real", light["moonlight"]), "MoonFloor": ("real", light["moonFloor"]), "MoonExp": ("real", light["moonExp"]),
        "SunCut": ("real", light["sunCut"]), "FogClear": ("real", FOG["clear"]), "FogOvercast": ("real", FOG["overcast"]),
        "SkyScale": ("real", SKY_SCALE), "FogGrey": ("real", FOG_GREY), "AmbientRef": ("real", ambient_ref(spec)),
        "HemiShare": ("real", HEMI_SHARE), "SkyLuminance": ("real", SKY_LUMINANCE), "SkyOvercast": ("real", SKY_OVERCAST),
        "HemiOvercast": ("real", light["hemiOvercast"]), "HemiClear": ("real", light["hemiClear"]), "HemiNight": ("real", hemi_night(spec)),
        "AmbientOvercast": ("real", light["ambientOvercast"]), "AmbientClear": ("real", light["ambientClear"]),
        "NightAmbient": ("real", light["nightAmbient"]),
        "WetSoak": ("real", WET_RATE["soak"]), "WetDry": ("real", WET_RATE["dry"]),
        "SunDirection": ("vector", None), "MoonDirection": ("vector", None),
        "SunElevation": ("real", 0.0), "MoonIllumination": ("real", 0.0), "Daylight": ("real", 0.0),
        "CloudCover": ("real", 0.0), "DuskLight": ("real", 0.0),
    })
    G = Graph(bp)

    # UpdateSky: the web's sun and moon for Year/Month/Day/Hour, then lights, fog and the weather collection
    start = G.custom("UpdateSky")
    chain = Chain(start)
    getters = {n: (G.get(n), n) for n in ("Hour", "Latitude", "Longitude", "PlanNorth", "Rain", "Snow", "Wet", "WindSpeed",
                                          "WindFromDeg", "SunLux", "SunOvercast", "SunClear", "Moonlight", "MoonFloor",
                                          "MoonExp", "SunCut", "FogClear", "FogOvercast", "SkyScale", "FogGrey", "AmbientRef", "AmbientOvercast", "AmbientClear", "NightAmbient",
                                          "HemiShare", "SkyLuminance", "SkyOvercast", "HemiOvercast", "HemiClear", "HemiNight")}
    date = G.call("KismetMathLibrary:MakeDateTime", Hour=0, Minute=0, Second=0, Millisecond=0)
    for n in ("Year", "Month", "Day"):
        connect(G.get(n), n, date, n)
    doy_int = G.call("KismetMathLibrary:GetDayOfYear")
    connect(date, "ReturnValue", doy_int, "A")
    doy = G.call("KismetMathLibrary:Conv_IntToDouble")
    connect(doy_int, "ReturnValue", doy, "InInt")
    j2000 = G.call("KismetMathLibrary:MakeDateTime", Year=2000, Month=1, Day=1, Hour=12, Minute=0, Second=0, Millisecond=0)
    span = G.call("KismetMathLibrary:Subtract_DateTimeDateTime")
    connect(date, "ReturnValue", span, "A")
    connect(j2000, "ReturnValue", span, "B")
    days = G.call("KismetMathLibrary:GetTotalDays")
    connect(span, "ReturnValue", days, "A")
    E = Expr(G, {**getters, "doy": (doy, "ReturnValue"), "days": (days, "ReturnValue"), "SnowOvercast": SNOW_OVERCAST,
                 "ClearThr": float(clouds["clearThr"]), "ThrA": float(clouds["thr"][0]), "ThrB": float(clouds["thr"][1]),
                 "Ramp": float(clouds["ramp"]), "CloudLo": float(CLOUD_RANGE[0]), "CloudHi": float(CLOUD_RANGE[1]),
                 "ExpRatio": float(light["exposureClear"] / light["exposureOvercast"])})
    E.run(SUN)
    E.run(SKYDIR.format(p="sun", dec="dec", ha="ha"))
    E.run(MOON)
    E.run(SKYDIR.format(p="moon", dec="mdec", ha="mha"))
    E.run(LIGHT)
    env = E.run(EXTRA)

    def vector(prefix):
        node = G.call("KismetMathLibrary:MakeVector")
        for axis, key in (("X", prefix + "X"), ("Y", prefix + "Y"), ("Z", prefix + "sinEl")):
            E.feed(node, axis, env[key])
        return node

    sun_vec, moon_vec = vector("sun"), vector("moon")
    for name, node, pin in (("SunDirection", sun_vec, "ReturnValue"), ("MoonDirection", moon_vec, "ReturnValue")):
        s = G.place(G.g.add_set_member_variable_node(name))
        connect(node, pin, s, name)
        chain.then(s)
    elevation = E.k("DegAsin", A=env["sunsinEl"])
    for name, value in (("SunElevation", (elevation, "ReturnValue")), ("MoonIllumination", env["illum"]), ("Daylight", env["day"])):
        s = G.place(G.g.add_set_member_variable_node(name))
        E.feed(s, name, value)
        chain.then(s)
    for comp, vec, lux in (("Sun", sun_vec, env["sunOut"]), ("Moon", moon_vec, env["moonOut"])):
        neg = G.call("KismetMathLibrary:NegateVector")
        connect(vec, "ReturnValue", neg, "A")
        rot = G.call("KismetMathLibrary:MakeRotFromX")
        connect(neg, "ReturnValue", rot, "X")
        turn = G.call("SceneComponent:K2_SetWorldRotation")
        connect(G.get(comp), comp, turn, "self")
        connect(rot, "ReturnValue", turn, "NewRotation")
        chain.then(turn)
        power = G.call("LightComponent:SetIntensity")
        connect(G.get(comp), comp, power, "self")
        E.feed(power, "NewIntensity", lux)
        chain.then(power)
    weight = G.place(G.g.add_set_member_variable_node("BlendWeight", "/Script/Engine.PostProcessComponent"))
    connect(G.get("Ambient"), "Ambient", weight, "self")
    E.feed(weight, "BlendWeight", (E.k("Divide_DoubleDouble", A=env["fill"], B=env["AmbientRef"]), "ReturnValue"))
    chain.then(weight)
    expo = G.place(G.g.add_set_member_variable_node("BlendWeight", "/Script/Engine.PostProcessComponent"))
    connect(G.get("Exposure"), "Exposure", expo, "self")
    E.feed(expo, "BlendWeight", env["expoW"])
    chain.then(expo)
    lum = G.call("KismetMathLibrary:MakeColor", A=1.0)
    for ch in "RGB":
        E.feed(lum, ch, env["skyLum"])
    sky_lum = G.call("SkyAtmosphereComponent:SetSkyLuminanceFactor")
    connect(G.get("Atmosphere"), "Atmosphere", sky_lum, "self")
    connect(lum, "ReturnValue", sky_lum, "NewValue")
    chain.then(sky_lum)
    sky_power = G.call("SkyLightComponent:SetIntensity")
    connect(G.get("SkyLight"), "SkyLight", sky_power, "self")
    E.feed(sky_power, "NewIntensity", env["skyI"])
    chain.then(sky_power)
    tint = G.call("KismetMathLibrary:MakeColor", A=1.0)
    E.feed(tint, "R", env["grey"])
    E.feed(tint, "G", (E.k("Multiply_DoubleDouble", A=env["grey"], B=1.03), "ReturnValue"))
    E.feed(tint, "B", (E.k("Multiply_DoubleDouble", A=env["grey"], B=1.08), "ReturnValue"))
    inscatter = G.call("ExponentialHeightFogComponent:SetFogInscatteringColor")
    connect(G.get("Fog"), "Fog", inscatter, "self")
    connect(tint, "ReturnValue", inscatter, "Value")
    chain.then(inscatter)
    density = G.call("ExponentialHeightFogComponent:SetFogDensity")
    connect(G.get("Fog"), "Fog", density, "self")
    E.feed(density, "Value", env["fog"])
    chain.then(density)
    for name, value in (("CloudOffsetX", (G.get("CloudOffsetX"), "CloudOffsetX")),
                        ("CloudOffsetY", (G.get("CloudOffsetY"), "CloudOffsetY")),
                        ("SkyThreshold", env["skyThr"]), ("Overcast", env["ocl"]), ("Rain", env["Rain"]), ("Snow", env["Snow"]), ("Wet", env["Wet"]), ("WindX", env["windX"]),
                        ("WindY", env["windY"]), ("Streak", env["streak"]), ("DuskLight", env["duskLight"]),
                        ("Daylight", env["day"]), ("Hour", env["Hour"]), ("Night", env["night"]), ("CloudCover", env["cover"]), ("CloudCoverage", env["coverage"])):
        setp = G.call("KismetMaterialLibrary:SetScalarParameterValue", ParameterName=name)
        constant(setp, "Collection", mpc.get_path_name())
        E.feed(setp, "ParameterValue", value)
        chain.then(setp)
    phase = G.call("KismetMathLibrary:MakeVector")
    for axis, key in (("X", "sinE"), ("Y", "negCosE"), ("Z", "illum")):
        E.feed(phase, axis, env[key])
    for name, node in (("SunDir", sun_vec), ("MoonDir", moon_vec), ("MoonPh", phase)):
        colour = G.call("KismetMathLibrary:Conv_VectorToLinearColor")
        connect(node, "ReturnValue", colour, "InVec")
        setv = G.call("KismetMaterialLibrary:SetVectorParameterValue", ParameterName=name)
        constant(setv, "Collection", mpc.get_path_name())
        connect(colour, "ReturnValue", setv, "ParameterValue")
        chain.then(setv)
    for name, key in (("CloudCover", "cover"), ("DuskLight", "duskLight")):
        s = G.place(G.g.add_set_member_variable_node(name))
        E.feed(s, name, env[key])
        chain.then(s)
    BP.compile_blueprint(bp)
    update = bp.generated_class().get_path_name() + ":UpdateSky"

    # ToggleRain / ToggleSnow: on at full strength (and the other off), or off; wet follows the rain in Tick
    for name, own, other in (("ToggleRain", "Rain", "Snow"), ("ToggleSnow", "Snow", "Rain")):
        start = G.custom(name)
        E2 = Expr(G, {own: (G.get(own), own)})
        flip = E2.run(f"v = select({own} > 0.001, 0, 1)")["v"]
        c = Chain(start)
        s = G.place(G.g.add_set_member_variable_node(own))
        E2.feed(s, own, flip)
        c.then(s)
        s2 = G.place(G.g.add_set_member_variable_node(other))
        constant(s2, other, "0.0")
        c.then(s2)
        c.then(G.call(update))

    # BeginPlay: the PC's local date and time (UseClock), else the instance's Year/Month/Day/Hour (a test override)
    begin = G.event("BeginPlay", "ReceiveBeginPlay")
    branch = G.place(G.g.add_branch_node())
    connect(G.get("UseClock"), "UseClock", branch, "Condition")
    connect(begin, "then", branch, "execute")
    now = G.call("KismetMathLibrary:Now")
    brk = G.call("KismetMathLibrary:BreakDateTime")
    connect(now, "ReturnValue", brk, "InDateTime")
    c = Chain(branch, "then")
    for n in ("Year", "Month", "Day"):
        s = G.place(G.g.add_set_member_variable_node(n))
        connect(brk, n, s, n)
        c.then(s)
    hours = {}
    for n in ("Hour", "Minute", "Second"):
        conv = G.call("KismetMathLibrary:Conv_IntToDouble")
        connect(brk, n, conv, "InInt")
        hours[n] = (conv, "ReturnValue")
    E3 = Expr(G, hours)
    s = G.place(G.g.add_set_member_variable_node("Hour"))
    E3.feed(s, "Hour", E3.run("h = Hour + Minute / 60 + Second / 3600")["h"])
    c.then(s)
    after_clock = G.call(update)
    c.then(after_clock)
    Chain(branch, "else").then(G.call(update))

    # Tick: the clock runs at TimeScale (past midnight to the next date) and the wetness follows the rain
    tick = G.event("Tick", "ReceiveTick")
    env4 = {n: (G.get(n), n) for n in ("Hour", "TimeScale", "Rain", "Wet", "WetSoak", "WetDry")}
    env4["dt"] = (tick, "DeltaSeconds")
    for key in ("WindSpeed", "WindFromDeg", "PlanNorth", "CloudDirectionX", "CloudDirectionY", "CloudOffsetX", "CloudOffsetY"):
        env4[key] = (G.get(key), key)
    drift_min, drift_max = clouds.get("drift", (0, 0))
    env4.update(DriftMin=float(drift_min), DriftMax=float(drift_max),
                WindScale=float(clouds.get("windScale", 0)), Tile=float(clouds.get("cell", 1) * clouds.get("cells", 1)))
    E4 = Expr(G, env4)
    v = E4.run("""
directionX = select(WindSpeed > 0.001, 0 - sind(WindFromDeg - PlanNorth), CloudDirectionX)
directionY = select(WindSpeed > 0.001, cosd(WindFromDeg - PlanNorth), CloudDirectionY)
speed = clamp(WindSpeed * WindScale, DriftMin, DriftMax)
offsetX = wrap(CloudOffsetX - dt * speed * directionX, 0, Tile)
offsetY = wrap(CloudOffsetY - dt * speed * directionY, 0, Tile)
h = Hour + dt * TimeScale / 3600
wet = clamp(Wet + dt * select(Rain > 0.05, WetSoak * Rain, 0 - WetDry), 0, 1)
""")
    c = Chain(tick)
    for name, key in (("CloudDirectionX", "directionX"), ("CloudDirectionY", "directionY"),
                      ("CloudOffsetX", "offsetX"), ("CloudOffsetY", "offsetY")):
        setter = G.place(G.g.add_set_member_variable_node(name))
        E4.feed(setter, name, v[key])
        c.then(setter)
    s = G.place(G.g.add_set_member_variable_node("Wet"))
    E4.feed(s, "Wet", v["wet"])
    c.then(s)
    s = G.place(G.g.add_set_member_variable_node("Hour"))
    E4.feed(s, "Hour", v["h"])
    c.then(s)
    midnight = G.place(G.g.add_branch_node())
    over = E4.k("GreaterEqual_DoubleDouble", A=(G.get("Hour"), "Hour"), B=24.0)
    connect(over, "ReturnValue", midnight, "Condition")
    c.then(midnight, "then", "execute")
    back = G.place(G.g.add_set_member_variable_node("Hour"))
    E4.feed(back, "Hour", (E4.k("Subtract_DoubleDouble", A=(G.get("Hour"), "Hour"), B=24.0), "ReturnValue"))
    c.then(back)
    today = G.call("KismetMathLibrary:MakeDateTime", Hour=0, Minute=0, Second=0, Millisecond=0)
    for n in ("Year", "Month", "Day"):
        connect(G.get(n), n, today, n)
    oneday = G.call("KismetMathLibrary:FromDays", Days=1.0)
    nextday = G.call("KismetMathLibrary:Add_DateTimeTimespan")
    connect(today, "ReturnValue", nextday, "A")
    connect(oneday, "ReturnValue", nextday, "B")
    brk2 = G.call("KismetMathLibrary:BreakDateTime")
    connect(nextday, "ReturnValue", brk2, "InDateTime")
    for n in ("Year", "Month", "Day"):
        s = G.place(G.g.add_set_member_variable_node(n))
        connect(brk2, n, s, n)
        c.then(s)
    c.then(G.call(update))
    Chain(midnight, "else").then(G.call(update))

    BP.compile_blueprint(bp)
    broken = G.g.list_nodes_with_errors()
    if broken:
        raise RuntimeError("BP_LundenSky failed to compile: " + ", ".join(n.get_name() for n in broken))
    return bp


# -------------------------------------------------------------------------------------------------- level ------

def build_level(spec, sky_bp, lamp_bp):
    levels = u.EditorLoadingAndSavingUtils
    world = levels.new_blank_map(False)
    actors = u.get_editor_subsystem(u.EditorActorSubsystem)
    sky = actors.spawn_actor_from_class(sky_bp.generated_class(), u.Vector(0, 0, 0))
    sky.set_actor_label("Lunden Sky")
    sky.tags = [u.Name("lunden:sky"), u.Name("kind:sky")]
    for row in spec["lamps"]:
        lamp = actors.spawn_actor_from_class(lamp_bp.generated_class(), u.Vector(*row["xyz"]))
        lamp.set_actor_label("Lamp_" + row["id"])
        lamp.rename("Lamp_" + row["id"])
        tags = [f"lamp:{row['id']}", f"kind:{row['kind']}", f"level:{row['level']}"]
        if row["room"]:
            tags.append(f"room:{row['room']}")
        if row["auto"]:
            tags.append("auto:dusk")
        if row["patioBulbs"]:
            tags.append("patio:string-driver")
        lamp.tags = [u.Name(t) for t in tags + row["seasonTags"]]
        lamp.set_editor_property("Candela", row["candela"])
        lamp.set_editor_property("Auto", row["auto"])
        if rule := row["patioDusk"]:
            lamp.set_editor_property("PatioDusk", True)
            lamp.set_editor_property("Dusk", 0.0)  # web strings start off and fade in from zero
            for prop, key in (("DuskOn", "on"), ("DuskOff", "off"), ("DuskFade", "fade")):
                lamp.set_editor_property(prop, rule[key])
        light = lamp.get_component_by_class(u.PointLightComponent)
        light.set_intensity(row["candela"])
        light.set_editor_property("attenuation_radius", row["radius"])
        if row["stairVisibility"]:
            mask = stair_lamp.build(row, spec["stairBounds"])
            light.set_light_function_material(mask)
            light.set_light_function_disabled_brightness(1.0)
            if light.get_editor_property("light_function_material") != mask:
                raise RuntimeError("Stair light function was not assigned to " + row["id"])
        r, g, b = bytes.fromhex(row["colour"].lstrip("#"))
        colour = u.LinearColor()
        colour.set_from_srgb(u.Color(r=r, g=g, b=b, a=255))
        light.set_light_color(colour)
        if row["patioBulbs"]:
            lamp.set_editor_property("BulbColour", u.Vector(colour.r, colour.g, colour.b))
            lamp.set_editor_property("BulbIdle", row["patioBulbs"]["idle"])
            lamp.set_editor_property("BulbBoost", row["patioBulbs"]["boost"])
    if not levels.save_map(world, LEVEL):
        raise RuntimeError("Could not save " + LEVEL)
    u.log(f"LUNDEN_LIGHTING_LEVEL {LEVEL}: 1 sky, {len(spec['lamps'])} lamps")


def level_files():
    return sorted(p for p in LEVEL_DIR.rglob("*") if p.suffix in (".umap", ".uasset"))


def file_hashes():
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in level_files()}


def main(argv):
    force, check = "--force" in argv, "--check" in argv
    rest = [a for a in argv if not a.startswith("--")]
    m = load_measurements(rest[0] if rest else PROJECT / "Import/measurements.json")
    spec = spec_of(m)
    want = spec_hash(spec)
    assets = (SKY, LAMP, MPC, PRECIP, CLOUDS, AMBIENT_CUBE)
    stair_assets = [stair_lamp.path_for(row) for row in spec["lamps"] if row["stairVisibility"]]
    have = ASSETS.does_asset_exist(SKY) and ASSETS.get_metadata_tag(ASSETS.load_asset(SKY), SPEC_TAG) == want
    cloud_material_ok = ASSETS.does_asset_exist(PRECIP) and precip_matches(spec)
    complete = all(ASSETS.does_asset_exist(p) for p in assets) and cloud_material_ok
    stamp = json.loads(STAMP.read_text(encoding="utf-8")) if STAMP.exists() else {}
    level_ok = (stamp.get("spec") == want and stamp.get("files") == file_hashes() and bool(stamp.get("files"))
                and all(ASSETS.does_asset_exist(path) for path in stair_assets))
    if check:
        problems = [p for p in assets if not ASSETS.does_asset_exist(p)]
        for row in spec["lamps"]:
            if row["stairVisibility"]:
                path = stair_lamp.path_for(row)
                material = ASSETS.load_asset(path) if ASSETS.does_asset_exist(path) else None
                if not stair_lamp.graph_matches(material, stair_lamp.shader(spec["stairBounds"], row["stairVisibility"])):
                    problems.append(f"{path}: missing or stale stair visibility graph")
        if not cloud_material_ok:
            problems.append(f"{PRECIP} cloud shader or weather inputs missing or stale")
        if not have:
            problems.append(f"{SKY} spec hash differs (run build_lighting.py)")
        if not level_ok:
            problems.append(f"{LEVEL} missing or stale (run build_lighting.py)")
        if problems:
            raise RuntimeError("LUNDEN_LIGHTING_CHECK failed: " + "; ".join(problems))
        u.log(f"LUNDEN_LIGHTING_OK check passed ({len(stair_assets)} stair light functions)")
        return
    if have and complete and not force:
        u.log("LUNDEN_LIGHTING assets unchanged, nothing saved")
        sky_bp, lamp_bp = ASSETS.load_asset(SKY), ASSETS.load_asset(LAMP)
    else:
        mpc = build_mpc(spec)
        precip = build_precip_material(spec, mpc)
        lamp_bp = build_lamp(spec, mpc)
        clouds = build_clouds(mpc)
        sky_bp = build_sky(spec, mpc, precip, clouds)
        ASSETS.set_metadata_tag(sky_bp, SPEC_TAG, want)
        for asset in (mpc, precip, clouds, lamp_bp, sky_bp, u.load_asset(AMBIENT_CUBE)):
            save(asset)
        u.log("LUNDEN_LIGHTING assets saved: " + ", ".join(assets))
    if level_ok and not force:
        u.log(f"LUNDEN_LIGHTING_LEVEL {LEVEL} unchanged, nothing saved")
    else:
        build_level(spec, sky_bp, lamp_bp)
        LEVEL_DIR.mkdir(parents=True, exist_ok=True)
        STAMP.write_text(json.dumps({"spec": want, "files": file_hashes()}, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    u.log("LUNDEN_LIGHTING_OK")


if __name__ == "__main__":
    main(sys.argv[1:])
