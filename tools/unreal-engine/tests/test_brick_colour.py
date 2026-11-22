"""Lunden (#2427): per-brick colour of the Unreal brick instances against the web canvases. Plain Python 3, no Unreal.

    python3 tools/unreal-engine/tests/test_brick_colour.py [--stats]

The web gives every brick of its brick canvases its own colour with THREE.Color.offsetHSL((rand - 0.5) * range, ...):
src/exterior.js brickTexture (Hus L), src/surroundings.js facadeTexture (Hus A, B and C) and brickCourses (the
retaining walls' and the school wall's historicBrick). M_LundenTiled draws the same jitter per cell from the instance's
HueJitter, SaturationJitter and LightnessJitter (build_materials.py TILED_HSL). Checks:
  1. each brick instance's jitter parameters equal the ranges in its canvas's per-brick offsetHSL call, read from the
     web source, and its Variation is 0 (the old lightness-only stand-in);
  2. its Color is the canvas's base colour: COLORS.brick, with the canvas's own base offsetHSL where it has one;
  3. a Python port of TILED_HSL (the same step-based hue2rgb) gives three.js's offsetHSL colour for random offsets,
     and its percentile spread of CIE L*, C* and hue over many bricks is the canvas's (the shader keeps the mean).
--stats prints the spread (p10-p90) of L*, C* and hue per instance for the web model, the old Variation 0.15 model and
the new one. Exit 0 when all hold, 1 otherwise; prints BRICK_COLOUR_OK.
"""
import json
import math
import os
import random
import re
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
MATERIALS = "/Game/Lunden/Materials/"
# instance -> (web file, the canvas function's opening text, base offsetHSL applied by the caller or None)
CANVASES = {
    "MI_LundenFacadeBrick": ("src/exterior.js", "function brickTexture()", None),
    "MI_LundenFacadeBrickAHus": ("src/surroundings.js", "function facadeTexture(", None),
    "MI_LundenBrickHistoric": ("src/surroundings.js", "const brickCourses = ", ("src/surroundings.js", "export function brickTexture()")),
}
JITTER = ("HueJitter", "SaturationJitter", "LightnessJitter")
ARG = re.compile(r"^\(\s*r\w*\(\)\s*-\s*0\.5\s*\)\s*\*\s*([0-9.]+)$")


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def body(text, opening):
    """The declaration that starts with `opening`, up to the next top-level declaration."""
    start = text.index(opening)
    end = re.search(r"\n(?:export )?(?:async )?(?:function|const|let|class) ", text[start + len(opening):])
    return text[start:start + len(opening) + end.start()] if end else text[start:]


def split_args(call):
    """The top-level comma-separated arguments of the parenthesised text following offsetHSL."""
    depth, args, cur = 0, [], ""
    for ch in call:
        if ch == "(":
            depth += 1
            if depth == 1:
                continue
        elif ch == ")":
            depth -= 1
            if depth == 0:
                args.append(cur.strip())
                return args
        if depth == 1 and ch == ",":
            args.append(cur.strip())
            cur = ""
        elif depth >= 1:
            cur += ch
    raise ValueError("unbalanced offsetHSL call")


def brick_ranges(text):
    """The full ranges of the first offsetHSL call whose arguments draw random numbers (the per-brick one)."""
    for m in re.finditer(r"offsetHSL\(", text):
        args = split_args(text[m.end() - 1:])
        if any("()" in a for a in args):
            out = []
            for a in args:
                if re.fullmatch(r"0(\.0*)?", a):
                    out.append(0.0)
                    continue
                mm = ARG.match(a)
                if not mm:
                    raise ValueError(f"unexpected per-brick offsetHSL argument {a!r}")
                out.append(float(mm.group(1)))
            return out
    raise ValueError("no per-brick offsetHSL call")


def base_offset(text):
    """The constant offsetHSL on COLORS.brick that a canvas passes as its base (brickTexture -> brickCourses)."""
    m = re.search(r"new THREE\.Color\(COLORS\.brick\)\.offsetHSL\(([-0-9., ]+)\)", text)
    return [float(v) for v in m.group(1).split(",")] if m else [0.0, 0.0, 0.0]


# ---------------------------------------------------------------- colour
def s2l(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def l2s(c):
    c = min(1.0, max(0.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def hex_linear(text):
    v = text.lstrip("#")
    return [s2l(int(v[i:i + 2], 16) / 255) for i in (0, 2, 4)]


def linear_hex(c):
    return "#" + "".join("%02x" % round(l2s(x) * 255) for x in c)


def get_hsl(r, g, b):  # three.js Color.getHSL in the working (linear) space
    mx, mn = max(r, g, b), min(r, g, b)
    light = (mx + mn) / 2
    if mx == mn:
        return 0.0, 0.0, light
    d = mx - mn
    sat = d / (mx + mn) if light <= 0.5 else d / (2 - mx - mn)
    if mx == r:
        hue = (g - b) / d + (6 if g < b else 0)
    elif mx == g:
        hue = (b - r) / d + 2
    else:
        hue = (r - g) / d + 4
    return hue / 6, sat, light


def hue2rgb(p, q, t):
    if t < 0:
        t += 1
    if t > 1:
        t -= 1
    if t < 1 / 6:
        return p + (q - p) * 6 * t
    if t < 1 / 2:
        return q
    if t < 2 / 3:
        return p + (q - p) * 6 * (2 / 3 - t)
    return p


def offset_hsl(c, dh, ds, dl):  # three.js Color.offsetHSL (setHSL wraps hue, clamps s and l)
    hue, sat, light = get_hsl(*c)
    hue, sat, light = (hue + dh) % 1, min(1, max(0, sat + ds)), min(1, max(0, light + dl))
    if sat == 0:
        return [light] * 3
    p = light * (1 + sat) if light <= 0.5 else light + sat - light * sat
    q = 2 * light - p
    return [hue2rgb(q, p, hue + 1 / 3), hue2rgb(q, p, hue), hue2rgb(q, p, hue - 1 / 3)]


def shader_hsl(c, jitter, j):
    """build_materials.py TILED_HSL in Python: j are the cell's three hashes - 0.5."""
    hue, sat, light = get_hsl(*c)
    frac = lambda v: v - math.floor(v)  # noqa: E731
    hue = frac(hue + jitter[0] * j[0])
    sat = min(1, max(0, sat + jitter[1] * j[1]))
    light = min(1, max(0, light + jitter[2] * j[2]))
    hi = light * (1 + sat) if light <= 0.5 else light + sat - light * sat
    lo = 2 * light - hi
    out = []
    for shift in (1 / 3, 0.0, -1 / 3):
        t = frac(hue + shift)
        rise, fall = lo + (hi - lo) * 6 * t, lo + (hi - lo) * 6 * (2 / 3 - t)
        step = lambda edge: 1.0 if t >= edge else 0.0  # noqa: E731
        lerp = lambda a, b, w: a + (b - a) * w  # noqa: E731
        out.append(lerp(lerp(lerp(rise, hi, step(1 / 6)), fall, step(0.5)), lo, step(2 / 3)))
    return out


def lab(c):  # linear sRGB -> CIE L*, C*, hue (degrees), D65; quantised through 8-bit sRGB as a canvas stores it
    r, g, b = (s2l(round(l2s(x) * 255) / 255) for x in c)
    X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 216 / 24389 else (24389 / 27 * t + 16) / 116  # noqa: E731
    fx, fy, fz = f(X), f(Y), f(Z)
    a, bb = 500 * (fx - fy), 200 * (fy - fz)
    return 116 * fy - 16, math.hypot(a, bb), math.degrees(math.atan2(bb, a))


def spread(colours):
    """p10-p90 width of L*, C* and hue over a list of linear colours."""
    labs = [lab(c) for c in colours]
    out = []
    for i in range(3):
        v = sorted(t[i] for t in labs)
        out.append(v[int(0.9 * (len(v) - 1))] - v[int(0.1 * (len(v) - 1))])
    return out


def main(argv):
    table = json.loads(read("tools/unreal-engine/material-map.json"))["materials"]
    config = read("src/config.js")
    m = re.search(r"export const COLORS = \{.*?\bbrick: 0x([0-9a-fA-F]{6})", config, re.S)
    brick = hex_linear(m.group(1))
    errors = []
    rng = random.Random(2427)
    for name, (rel, opening, base_from) in CANVASES.items():
        spec = table.get(MATERIALS + name)
        if not spec:
            errors.append(f"{name}: missing from material-map.json")
            continue
        params = spec["params"]
        ranges = brick_ranges(body(read(rel), opening))
        got = [float(params.get(k, 0.0)) for k in JITTER]
        if any(abs(a - b) > 1e-9 for a, b in zip(got, ranges)):
            errors.append(f"{name}: jitter {got} but {rel} {opening.strip()} draws offsetHSL ranges {ranges}")
        if float(params.get("Variation", 0.0)) != 0.0:
            errors.append(f"{name}: Variation {params.get('Variation')} must be 0 (the per-brick colour is the HSL jitter)")
        base_rel, base_opening = base_from or (rel, opening)
        base = offset_hsl(brick, *base_offset(body(read(base_rel), base_opening)))
        if params.get("Color", "").lower() != linear_hex(base):
            errors.append(f"{name}: Color {params.get('Color')} but the canvas's base colour is {linear_hex(base)}")
        # the shader port against three.js, and the distribution it draws
        web, new, old = [], [], []
        c = hex_linear(params["Color"])
        for _ in range(20000):
            j = [rng.random() - 0.5 for _ in range(3)]
            w = offset_hsl(c, *(r * x for r, x in zip(got, j)))
            s = shader_hsl(c, got, j)
            if max(abs(a - b) for a, b in zip(w, s)) > 1e-9:
                errors.append(f"{name}: shader port {s} differs from offsetHSL {w} at offsets {j}")
                break
            web.append(offset_hsl(c, *(r * x for r, x in zip(ranges, j))))
            new.append(s)
            old.append([x * (1 + 0.15 * (2 * rng.random() - 1)) for x in c])
        if len(new) < 20000:
            continue
        sw, sn, so = spread(web), spread(new), spread(old)
        mean = [sum(col[i] for col in new) / len(new) for i in range(3)]
        if any(abs(a - b) / max(a, 1e-6) > 0.03 for a, b in zip(mean, c)):
            errors.append(f"{name}: the jittered linear mean {linear_hex(mean)} moved from the face colour {params['Color']}")
        if "--stats" in argv:
            fmt = lambda s: "L* %.1f C* %.1f hue %.1f" % tuple(s)  # noqa: E731
            print(f"{name:26} web {fmt(sw)} | old Variation 0.15 {fmt(so)} | new {fmt(sn)} (p10-p90)")
    for e in errors:
        print("FAIL", e)
    if errors:
        return 1
    print("BRICK_COLOUR_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
