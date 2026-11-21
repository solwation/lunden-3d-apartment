"""#2390: per view, Unreal/web ratios of mean luminance and HSV saturation of the mean sRGB colour, over crop-stats.json."""
import json, math, sys
d = json.load(open(sys.argv[1]))
sat = lambda c: (max(c) - min(c)) / max(max(c), 1e-6)
rows, views = [], {}
for shot, sides in d["stats"].items():
    lr, sr = [], []
    for crop in sides["web"]:
        w, u = sides["web"][crop], sides["unreal"][crop]
        l, s = u["luminance"] / w["luminance"], sat(u["srgb"]) / max(sat(w["srgb"]), 1e-6)
        lr.append(l)
        if sat(w["srgb"]) >= 0.1:  # a near-grey crop has no meaningful saturation ratio
            sr.append(s)
        else:
            s = float("nan")
        rows.append((shot, crop, w["srgb"], u["srgb"], l, s))
    g = lambda xs: math.exp(sum(map(math.log, xs)) / len(xs))
    views[shot] = (g(lr), g(sr) if sr else 1.0)
for shot, crop, w, u, l, s in rows:
    print(f"| {shot} | {crop} | {', '.join(f'{x:.0f}' for x in w)} | {', '.join(f'{x:.0f}' for x in u)} | {l:.2f} | {s:.2f} |")
ok = 0
for shot, (l, s) in views.items():
    p = 0.8 <= l <= 1.25 and 0.8 <= s <= 1.25
    ok += p and shot != "start"
    print(f"VIEW {shot}: luminance {l:.2f}, saturation {s:.2f} {'within' if p else 'OUTSIDE'}")
print(f"PASSING #2325 VIEWS {ok} of {len([v for v in views if v != 'start'])}")
