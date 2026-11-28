"""Native material inputs for the desktop facade export. Distances in cm unless the HLSL uses metres."""
from math import hypot, isclose, isfinite
from pathlib import Path
from string import Template

SHADERS = Path(__file__).resolve().parents[1] / "facade"
# Packed in UPrimitiveComponent.DefaultCustomPrimitiveData, shared by all faces using the material.
COMMON = "Cx Cy Cz Nx Ny".split()
FIELDS = {
    "room": COMMON + "HalfW HalfH Depth FloorZ Ceiling Left Right Kind Cover Seed DuskLit WallR WallG WallB FloorR FloorG FloorB FabricR FabricG FabricB".split(),
    "window": COMMON + "Width Height Hall Home OnHour OffHour Morning Wake Leave LampR LampG LampB Rate Phase PhaseMillis GlowSeed LocalPower".split(),
    "lens": ["Direct"], "wash": ["Peak", "ColourR", "ColourG", "ColourB"],  # #2397: each surface's own linear colour
    "band": "On LitR LitG LitB OffR OffG OffB".split(),  # #2430: the courtyard bollards' bands
}
INPUTS = {"room": ["PositionWS", "ViewDir", "Night", "PowerAvailable"],
          "window": ["PositionWS", "Hour", "Night", "PowerAvailable", "Seconds"],
          "lens": ["Night", "PowerAvailable", "WallOn"], "wash": ["UV", "WallLevel"], "band": ["Night", "PowerAvailable"]}
KINDS = ("open", "curtain", "blind", "sheer", "roller")


def linear_colour(packed):
    def linear(channel):
        s = (packed >> channel & 255) / 255
        return s / 12.92 if s <= .04045 else ((s + .055) / 1.055) ** 2.4
    return [linear(i) for i in (16, 8, 0)]


def shader(kind, spec):
    levels, dusk, schedule = (spec[k] for k in ("roomLevels", "facadeGlow", "schedule"))
    tv, glow = schedule["tv"], schedule["glow"]

    def rgb(v):
        return "float3(" + ",".join(map(str, v)) + ")"

    return Template((SHADERS / (kind + ".hlsl")).read_text()).substitute(
        strength=levels["strength"], roomDay=levels["day"][0], fabricDay=levels["day"][1],
        roomNight=levels["night"][0], fabricNight=levels["night"][1], duskOn=dusk["on"],
        windowColour=rgb(linear_colour(dusk["window"])), windowIntensity=dusk["intensity"],
        lensOn=rgb(linear_colour(dusk["lampOn"])), lensOff=rgb(linear_colour(dusk["lampOff"])),
        fade=schedule["fade"],
        tvColour=rgb(tv["rgb"]), tvFrom=tv["from"], tvUntil=tv["until"], tvDepth=tv["depth"], tvStep=tv["step"],
        glowBase=glow["base"], glowLamp=glow["lamp"], glowFloor=glow["floor"], glowCurtain=glow["curtain"])


def wash_values(surface):
    """#2397: a wash/pool mesh's custom primitive data (FIELDS["wash"])."""
    return [surface["peak"], *linear_colour(surface["colour"])]


def band_values(bands):
    """#2430: the bollard bands' custom primitive data (FIELDS["band"]): threshold, lit and day colour (linear)."""
    return [bands["on"], *linear_colour(bands["lit"]), *linear_colour(bands["off"])]


def planes(spec):
    def plane(kind, row, normal, offset, size, values):
        x, y, z = row["position"]
        nx, ny = normal
        if (row["house"] not in ({"A", "B", "C", "external"} if kind == "window" else {"A", "B", "C", "L"}) or not isclose(hypot(nx, ny), 1, abs_tol=1e-4)
                or min(size) <= 0 or len(values) != len(FIELDS[kind]) or not all(map(isfinite, values))):
            raise ValueError(f"Invalid {kind} at {row['position']}")
        # Clear the coplanar imported glass/lens by one mm. Rooms start at their measured front surface.
        return {"kind": kind, "house": row["house"], "xyz": [x+nx*(offset+.1), y+ny*(offset+.1), z],
                "normal": normal, "size": size, "values": values}

    for r in spec["panes"]:
        dims = [r[k]/100 for k in ("halfWidth", "halfHeight", "depth", "floor", "ceiling", "left", "right")]
        dress = [KINDS.index(r["dressing"]), r["cover"], r["seed"], r["duskLit"]]
        colours = [c for k in ("wall", "floor", "fabric") for c in r["colours"][k]]
        for face in r["faces"]:
            n = face["normal"]
            yield plane("room", r, n, face["offset"], [r["halfWidth"]*2, r["halfHeight"]*2],
                        r["position"] + n + dims + dress + colours)
    for w in spec["windows"]:
        h = spec["schedule"]["routines"][w["routine"]]
        tv = h["tv"] or {"rate": 0, "phase": 0}
        size = [w["width"], w["height"]]
        params = [h[k] for k in ("home", "on", "off", "morning", "wake", "leave")]
        yield plane("window", w, w["normal"], 0, size, w["position"] + w["normal"] + size + [w["hall"]] + params
                    + h["rgb"] + [tv["rate"], tv["phase"], round(tv["phase"]*1000), w["glowSeed"], w["localPower"]])
    for l in spec["fixtures"]:
        yield plane("lens", l, l["normal"], 0, [l["width"], l["height"]], [l["house"] == "L"])


def validate(spec):
    for key in ("panes", "windows", "fixtures"):
        want = set("ABC" if key == "windows" else "ABCL")
        got = {r["house"] for r in spec[key]}
        if (got - {"external"} if key == "windows" else got) != want:
            raise ValueError(f"Export both hus-l and kvarteret for native facade {key}")
    for w in spec["windows"]:
        if type(w.get("localPower")) is not bool or w["localPower"] != (w["house"] != "external"):
            raise ValueError("Re-export facade windows with their source power scope (#2421)")
    if not all(p.get("faces") for p in spec["panes"]):
        raise ValueError("Re-export facade surfaces and pane faces with the current desktop exporter")
    surfaces = spec.get("surfaces", [])
    if {s["name"] for s in surfaces} != {"doorLampWash","doorLampPools","loggiaLampWash","loggiaLampPools","courtyardBollardPools"}:
        raise ValueError("Missing measured facade wash/pool geometry (export hus-l, kvarteret and gard)")
    for s in surfaces:
        v, i = s["vertices"], s["indices"]
        if not v or not i or len(i)%3 or min(i)<0 or max(i)>=len(v) or any(len(p)!=5 or not all(map(isfinite,p)) for p in v):
            raise ValueError("Invalid facade light geometry: " + s["name"])
        if not isinstance(s.get("colour"), int) or not 0 < s.get("peak", 0) <= 1:
            raise ValueError("Re-export the facade light colour and peak: " + s["name"])
    # #2397: the bollard pools share BP_LundenFacade's wall-light latch (the web fades both from the same night fraction)
    wall, bollard = spec["wallLight"], spec.get("bollardLight", {})
    if any(bollard.get(k) != wall[k] for k in ("on", "off", "fade")):
        raise ValueError("The courtyard bollard pools need their own latch: their on/off/fade differ from wallLight")
    bands = spec.get("bollardBands")
    if not bands or bands.get("name") != "courtyardBollardBands":
        raise ValueError("Missing the courtyard bollards' bands (#2430): export gard with hus-l and kvarteret")
    v, i = bands["vertices"], bands["indices"]
    if (not v or not i or len(i)%3 or min(i)<0 or max(i)>=len(v) or any(len(p)!=5 or not all(map(isfinite,p)) for p in v)
            or not 0 < bands["on"] < 1 or not all(isinstance(bands[k], int) for k in ("lit", "off"))):
        raise ValueError("Invalid courtyard bollard bands")
    return list(planes(spec))
