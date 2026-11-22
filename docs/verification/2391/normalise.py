"""#2391: daylight-normalised rail colour. Display sRGB -> linear -> inverse three.js NeutralToneMapping (toe only:
every value here is far below its 0.76 compression start) -> scene linear. Daylight factor per channel = Unreal / web
scene-linear value of a neutral matte reference (linear albedo 0.04, metalness 0) on the same rail faces in both engines.
Normalised Unreal rail = Unreal rail / factor, tone mapped back to sRGB and compared per channel with the web.
Crops ending in "-top" (sunlit upward faces) are reported but not judged: there the web keeps a sun highlight that
the fix cannot keep (docs/development/unreal.md, Metals without environment).
    python3 normalise.py <crop-stats output> <reference shot> <shot>..."""
import re, sys
L = lambda v: v / 255 / 12.92 if v / 255 <= 0.04045 else ((v / 255 + 0.055) / 1.055) ** 2.4
S = lambda x: 255 * (x * 12.92 if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055)
def untone(rgb):
    d = [L(v) for v in rgb]; m_d = min(d)
    m = (m_d / 6.25) ** .5 if m_d < 6.25 * .08 ** 2 else m_d + .04
    off = m - 6.25 * m * m if m < .08 else .04
    return [x + off for x in d]
def tone(rgb):
    m = min(rgb); off = m - 6.25 * m * m if m < .08 else .04
    assert max(rgb) - off < .76
    return [S(x - off) for x in rgb]
d = {}
for line in open(sys.argv[1]):
    m = re.match(r'(\S+)\s+(\S+)\s+web .*?sRGB ([\d.,]+)\s+unreal .*?sRGB ([\d.,]+)', line)
    if m: d[(m[1], m[2])] = ([float(x) for x in m[3].split(',')], [float(x) for x in m[4].split(',')])
ref, variants = sys.argv[2], sys.argv[3:]
worst = {}
for crop in sorted({c for _, c in d}):
    gw, gu = d[(ref, crop)]; F = [u / w for w, u in zip(untone(gw), untone(gu))]
    print(f"{crop:11} reference web {gw} unreal {gu} daylight factor {[round(f, 3) for f in F]}")
    for v in variants:
        w, u = d[(v, crop)]; n = tone([x / f for x, f in zip(untone(u), F)])
        dev = [100 * (a / b - 1) for a, b in zip(n, w)]
        if not crop.endswith("-top"):
            worst[v] = max(worst.get(v, 0), max(abs(x) for x in dev))
        print(f"   {v:11} web {w} unreal {u} normalised {[round(x, 1) for x in n]} deviation % {[round(x, 1) for x in dev]}")
for v, x in worst.items(): print(f"{v}: worst channel deviation on the shaded faces {x:.1f} % ({'within' if x <= 10 else 'outside'} ±10 %)")
sys.exit(0 if all(x <= 10 for x in worst.values()) else 1)
