#!/usr/bin/env python3 -I
"""#1339: cross-sections of Copernicus GLO-30 across Hoje a, to compare the model's ground with (tools/elevationsections.cjs).

Usage: python3 -I tools/elevationsections.py <Copernicus_DSM_COG_10_N55_00_E013_00_DEM.tif> [out.json]
Stations lie every STATION m along SITE.river.path (plan coordinates), each with samples every STEP m from -HALF to +HALF m along
the perpendicular (positive = left of the flow direction, i.e. the side the path list turns towards). For each point: `h` = the
DSM bilinear at 30 m (as in data/elevation.json), `g` = the bare-earth estimate (3 x 3 minimum 30 m round the point), both in
metres relative to the courtyard like the model (same `ref`). Reuses the decoder of tools/elevation_grid.py (untrusted data is only
decoded, never executed).
"""
import json, math, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from elevation_grid import Tile, plan_to_geo, REF

RIVER = [[204.64, 74.37], [190.76, 79.13], [131.38, 74.61], [127.15, 83.64], [124.35, 101.96], [116.11, 114.02], [105.35, 119.29],
         [74.99, 119.53], [44.31, 119.8], [1.16, 125.14], [-15.1, 129.89], [-67.45, 166.11], [-89.43, 183.37], [-101.32, 198.71],
         [-110.41, 205.34], [-181.7, 207.36], [-220.92, 225.61], [-235.63, 235.51], [-248.18, 251.46]]  # SITE.river.path
STATION, STEP, HALF = 25, 5, 60

def along(path, s):
    for a, b in zip(path, path[1:]):
        d = math.dist(a, b)
        if s <= d: t = s / d; return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), ((b[0] - a[0]) / d, (b[1] - a[1]) / d)
        s -= d
    return None

def main():
    t = Tile(sys.argv[1]); out = sys.argv[2] if len(sys.argv) > 2 else 'elevationsections.json'
    def gmin(x, z): return min(t.sample(*plan_to_geo(x + dx, z + dz)) for dx in (-30, 0, 30) for dz in (-30, 0, 30))
    ref = gmin(*REF); total = sum(math.dist(a, b) for a, b in zip(RIVER, RIVER[1:])); stations = []; s = 0
    while s <= total:
        (cx, cz), (dx, dz) = along(RIVER, s); nx, nz = -dz, dx; pts = []
        for o in range(-HALF, HALF + 1, STEP):
            x, z = cx + nx * o, cz + nz * o
            pts.append({'o': o, 'x': round(x, 2), 'z': round(z, 2), 'h': round(t.sample(*plan_to_geo(x, z)) - ref, 2), 'g': round(gmin(x, z) - ref, 2)})
        stations.append({'s': s, 'c': [round(cx, 2), round(cz, 2)], 'dir': [round(dx, 3), round(dz, 3)], 'pts': pts}); s += STATION
    json.dump({'ref': round(ref, 2), 'station': STATION, 'step': STEP, 'half': HALF, 'stations': stations}, open(out, 'w'), separators=(',', ':'))
    print(len(stations), 'stations ->', out)

if __name__ == '__main__': main()
