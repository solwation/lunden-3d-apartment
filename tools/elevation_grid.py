#!/usr/bin/env python3 -I
"""#1288: samples Copernicus GLO-30 (DSM, 30 m) over the model's walk extent into data/elevation.json.

Usage: python3 -I tools/elevation_grid.py <Copernicus_DSM_COG_10_N55_00_E013_00_DEM.tif> [out.json]
Source tile: https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N55_00_E013_00_DEM/Copernicus_DSM_COG_10_N55_00_E013_00_DEM.tif
(AWS open data registry, no account). The tile is untrusted data: it is only decoded here (TIFF, deflate, floating-point
predictor), nothing in it is executed. Pure standard library + Pillow-free: no third-party packages needed.
Heights are written relative to the L1007 courtyard's bare-earth estimate (plan 0,0 = the model's y 0), in decimetres, row-major z then x.
`h` = DSM as sampled; `g` = bare-earth estimate = minimum of the DSM over the 3x3 samples 30 m around the point (strips most
building/canopy height at this resolution, may be ~1-2 m too low in narrow valleys).
"""
import json, math, struct, sys, zlib, datetime

PLAN_NORTH = 58.0  # DAY.planNorth
ANCHOR = dict(lon=13.181015825, lat=55.684965075, x=32.3, z=-0.4)  # SITE.geo.anchor
X0, X1, Z0, Z1, STEP = -260, 320, -200, 250, 10  # WALK extent (config.js)
REF = (0.0, 0.0)  # plan point that keeps its current model height (courtyard, y 0)

def plan_to_geo(x, z):
    a = math.radians(PLAN_NORTH); dx, dz = x - ANCHOR['x'], z - ANCHOR['z']
    e = dx * math.cos(a) - dz * math.sin(a); n = -dx * math.sin(a) - dz * math.cos(a)
    return (ANCHOR['lon'] + e / (111319.49 * math.cos(math.radians(ANCHOR['lat']))), ANCHOR['lat'] + n / 111319.49)

class Tile:
    def __init__(self, path):
        d = open(path, 'rb').read(); self.d = d
        assert d[:4] == b'II*\x00', 'little-endian classic TIFF expected'
        off = struct.unpack_from('<I', d, 4)[0]; n = struct.unpack_from('<H', d, off)[0]; tags = {}
        sizes = {3: 2, 4: 4, 12: 8, 5: 8, 1: 1, 2: 1}
        fmt = {3: 'H', 4: 'I', 12: 'd', 1: 'B', 2: 'c'}
        for i in range(n):
            tag, typ, cnt, val = struct.unpack_from('<HHII', d, off + 2 + 12 * i)
            size = sizes[typ] * cnt
            pos = off + 2 + 12 * i + 8 if size <= 4 else val
            if typ in fmt: tags[tag] = struct.unpack_from('<%d%s' % (cnt, fmt[typ]), d, pos)
        self.w, self.h = tags[256][0], tags[257][0]
        self.tw, self.th = tags[322][0], tags[323][0]
        assert tags[259][0] == 8 and tags[339][0] == 3 and tags[317][0] == 3 and tags[258][0] == 32
        self.offs, self.cnts = tags[324], tags[325]
        sc, tp = tags[33550], tags[33922]
        self.lon0, self.lat0, self.dx, self.dy = tp[3], tp[4], sc[0], sc[1]
        self.across = (self.w + self.tw - 1) // self.tw; self.cache = {}
    def tile(self, ti):
        if ti in self.cache: return self.cache[ti]
        raw = bytearray(zlib.decompress(self.d[self.offs[ti]:self.offs[ti] + self.cnts[ti]]))
        w, rows = self.tw, self.th; rb = w * 4; out = []
        for r in range(rows):
            row = raw[r * rb:(r + 1) * rb]; acc = 0
            for i in range(rb): acc = (acc + row[i]) & 255; row[i] = acc  # horizontal byte differencing (predictor 3)
            vals = struct.unpack('<%df' % w, bytes(row[b * w + i] for i in range(w) for b in (3, 2, 1, 0)))
            out.append(vals)
        self.cache[ti] = out; return out
    def px(self, c, r):
        c = min(max(c, 0), self.w - 1); r = min(max(r, 0), self.h - 1)
        return self.tile((r // self.th) * self.across + c // self.tw)[r % self.th][c % self.tw]
    def sample(self, lon, lat):  # bilinear; pixel centres at +0.5 (area-pixel GLO-30)
        fc = (lon - self.lon0) / self.dx - 0.5; fr = (self.lat0 - lat) / self.dy - 0.5
        c, r = math.floor(fc), math.floor(fr); tc, tr = fc - c, fr - r
        a = self.px(c, r) * (1 - tc) + self.px(c + 1, r) * tc; b = self.px(c, r + 1) * (1 - tc) + self.px(c + 1, r + 1) * tc
        return a * (1 - tr) + b * tr

def main():
    t = Tile(sys.argv[1]); out = sys.argv[2] if len(sys.argv) > 2 else 'data/elevation.json'
    def gmin(x, z): return min(t.sample(*plan_to_geo(x + dx, z + dz)) for dx in (-30, 0, 30) for dz in (-30, 0, 30))
    ref = gmin(*REF); rows = []; grows = []
    zs = range(Z0, Z1 + 1, STEP); xs = range(X0, X1 + 1, STEP)
    for z in zs:
        rows.append([round((t.sample(*plan_to_geo(x, z)) - ref) * 10) for x in xs]); grows.append([round((gmin(x, z) - ref) * 10) for x in xs])
    doc = {'id': 'elevation', 'issue': 1288,
           'source': 'Copernicus DEM GLO-30 (DSM, 30 m, tile N55_E013), AWS Open Data copernicus-dem-30m',
           'licence': 'Copernicus DEM licence (free, attribution: "Contains modified Copernicus data" / DEM (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the EU and ESA)',
           'surface': 'DSM: includes buildings and tree canopy, so heights over built-up or wooded cells are too high',
           'sampled': datetime.date.today().isoformat(), 'refAbsM': round(ref, 2), 'ref': {'x': REF[0], 'z': REF[1]},
           'x0': X0, 'z0': Z0, 'step': STEP, 'cols': len(xs), 'rowsN': len(zs), 'unit': 'dm relative to ref (bare-earth estimate at ref)', 'h': rows, 'g': grows}
    open(out, 'w').write(json.dumps(doc, separators=(',', ':')).replace('"h":[[', '"h":[\n[').replace('"g":[[', '"g":[\n[').replace('],[', '],\n['))
    print('ref abs', ref, 'min', min(map(min, rows)), 'max', max(map(max, rows)))
main()
