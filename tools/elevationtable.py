#!/usr/bin/env python3 -I
"""#1288: deviation table. Usage: python3 -I tools/elevationtable.py <model.json from elevationcompare.cjs>"""
import json, sys
el = json.load(open('data/elevation.json')); m = json.load(open(sys.argv[1]))['model']
def at(grid, x, z):
    fx = (x - el['x0']) / el['step']; fz = (z - el['z0']) / el['step']; i, j = int(fx), int(fz); tx, tz = fx - i, fz - j
    i2, j2 = min(i + 1, el['cols'] - 1), min(j + 1, el['rowsN'] - 1)
    a = grid[j][i] * (1 - tx) + grid[j][i2] * tx; b = grid[j2][i] * (1 - tx) + grid[j2][i2] * tx
    return (a * (1 - tz) + b * tz) / 10
P = [('L1007 courtyard (ref)', 0, 0), ('Street east of block (Sankt Lars vag)', 45, -30), ('Park south of block', 0, 40),
     ('Meadow before the river (SE)', 100, 60), ('Road bridge north end', 24, 98), ('Water under road bridge', 24, 123),
     ('South bank', 24, 150), ('St Lars area (south, Hus 41 front)', -20, 250), ('Karpvagen / west park', -120, 40),
     ('School: Klockhuset front', 45, -100), ('School: parking E of Klockhuset', 62, 0), ('Campus north edge', 40, -190),
     ('Far west (x-250,z0)', -250, 0), ('Far east (x300,z-50)', 300, -50), ('Far SW (x-200,z220)', -200, 220), ('Far SE (x280,z220)', 280, 220)]
print('%-40s %6s %6s %7s %7s %7s %7s' % ('point', 'x', 'z', 'model', 'DSM', 'ground', 'g-model'))
for n, x, z in P:
    mo, h, g = at(m, x, z), at(el['h'], x, z), at(el['g'], x, z)
    print('%-40s %6d %6d %7.1f %7.1f %7.1f %7.1f' % (n, x, z, mo, h, g, g - mo))
