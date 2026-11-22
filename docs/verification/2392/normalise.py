"""#2392: daylight-normalised walk colour (method of docs/verification/2391/normalise.py, with the full three.js
NeutralToneMapping instead of its toe only: the sunlit walk reaches the curve's compression range).
Display sRGB -> linear -> inverse NeutralToneMapping -> scene linear. Daylight factor per channel = Unreal / web
scene-linear value of a neutral matte reference (linear albedo 0.2, no texture) put on the paving in both engines.
Normalised Unreal walk = Unreal walk / factor, tone mapped back to sRGB and compared per channel with the web.
    python3 normalise.py <crop-stats output: base pair> <crop-stats output: grey pair>"""
import re, sys
L = lambda v: v / 255 / 12.92 if v / 255 <= 0.04045 else ((v / 255 + 0.055) / 1.055) ** 2.4
S = lambda x: 255 * (x * 12.92 if x <= 0.0031308 else 1.055 * max(x, 0) ** (1 / 2.4) - 0.055)
def tone_lin(c):  # three.js NeutralToneMapping (r170), exposure 1, linear in and out
    x = min(c); off = x - 6.25 * x * x if x < .08 else .04
    c = [v - off for v in c]; peak = max(c); start = .76
    if peak < start: return c
    d = 1 - start; newp = 1 - d * d / (peak + d - start)
    c = [v * newp / peak for v in c]; g = 1 - 1 / (.15 * (peak - newp) + 1)
    return [v + (newp - v) * g for v in c]
def untone(srgb):
    t = [L(v) for v in srgb]; c = list(t)
    for _ in range(200):  # damped fixed point on the residual
        r = tone_lin(c); c = [ci + (ti - ri) * 1.0 for ci, ti, ri in zip(c, t, r)]
    assert max(abs(a - b) for a, b in zip(tone_lin(c), t)) < 1e-6, (srgb, c)
    return c
def tone(c): return [S(v) for v in tone_lin(c)]
def read(path):
    d = {}
    for line in open(path):
        m = re.match(r'(\S+)\s+(\S+)\s+web .*?sRGB ([\d.,]+)\s+unreal .*?sRGB ([\d.,]+)', line)
        if m: d[(m[1], m[2])] = ([float(x) for x in m[3].split(',')], [float(x) for x in m[4].split(',')])
    return d
base, grey = read(sys.argv[1]), read(sys.argv[2])
worst = 0
for key in sorted(base):
    w, u = base[key]; gw, gu = grey[key]
    F = [a / b for a, b in zip(untone(gu), untone(gw))]
    n = tone([x / f for x, f in zip(untone(u), F)])
    dev = [100 * (a / b - 1) for a, b in zip(n, w)]
    worst = max(worst, max(abs(x) for x in dev))
    print(f"{key[0]:11} {key[1]:10} reference web {gw} unreal {gu} daylight factor {[round(f, 3) for f in F]}")
    print(f"{'':22} walk web {w} unreal {u} normalised {[round(x, 1) for x in n]} deviation % {[round(x, 1) for x in dev]}")
print(f"worst channel deviation {worst:.1f} % ({'within' if worst <= 10 else 'outside'} ±10 %)")
sys.exit(0 if worst <= 10 else 1)
