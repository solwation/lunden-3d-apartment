"""Offline unchanged #2388 metrics; reuse executed Chromium JPEG statistics.

Usage: python3 THIS ACTUAL_NATIVE_PNG FRESH_RESULT_JSON
No captures, image edits, masks, thresholds or reference decoding.
"""
import hashlib
import json
import math
import sys
from pathlib import Path
from PIL import Image

S = Path(__file__).resolve().parents[1]
CONTRACT = S / 'locked-acceptance.json'
CACHE = S / 'paired-product-v3/glazing-gate.json'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert sha(CONTRACT) == 'e8a737d787a132776c48fb8051ac7eeb9df115a7e5354e428ace1a8b7fd54131'
assert sha(CACHE) == '35e1767eb5c5a3605444907963322c1ddbd9120d34aa94ec963b8df398241b9e'
contract = json.loads(CONTRACT.read_text())
cache = json.loads(CACHE.read_text())
assert sha(contract['web']['path']) == contract['web']['sha256']


def measure(path, rect):
    image = Image.open(path)
    assert image.size == (640, 360) and image.format == 'PNG'
    assert image.convert('RGBA').getextrema()[3] == (255, 255)
    image = image.convert('RGB')
    x0, y0, x1, y1 = rect
    X, Y, W, H = [math.floor(v + .5) for v in (x0*640, y0*360, (x1-x0)*640, (y1-y0)*360)]
    pixels = list(image.crop((X, Y, X+W, Y+H)).getdata())
    def linear(v):
        v /= 255
        return v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4
    luminance = 0.
    saturation = 0.
    for rgb in pixels:
        luminance += .2126*linear(rgb[0]) + .7152*linear(rgb[1]) + .0722*linear(rgb[2])
        maximum, minimum = max(rgb), min(rgb)
        saturation += (maximum-minimum)/maximum if maximum else 0.
    return {'luminance': float(f'{luminance/len(pixels):.4f}'),
            'saturation': saturation/len(pixels), 'pixelRect': [X, Y, W, H]}


parity = []
for row in cache['rows']:
    path = CACHE.parent / ('unreal-' + row['shot'] + '.png')
    assert sha(path) == cache['inputs'][row['shot']]['nativeSHA256']
    measured = measure(path, contract['rects'][row['region']])
    assert measured['luminance'] == row['native']['luminance']
    assert abs(measured['saturation'] - row['native']['saturation']) < 1e-14
    parity.append({'shot': row['shot'], 'region': row['region'], 'passed': True})

image, output = map(Path, sys.argv[1:])
assert not output.exists()
rows = []
for row in cache['rows']:
    if row['shot'] != 'patio-forward':
        continue
    native = measure(image, contract['rects'][row['region']])
    ratios = {key: native[key]/row['web'][key] for key in ('luminance', 'saturation')}
    rows.append({'region': row['region'], 'native': native, 'web': row['web'],
                 'ratios': ratios, 'passed': all(.85 <= value <= 1.15 for value in ratios.values())})
result = {'classification': 'Original three ROIs and original +/-15% Y/S; unchanged PNG metric, executed canonical JPEG stats reused',
          'image': str(image.resolve()), 'imageSHA256': sha(image),
          'contractSHA256': sha(CONTRACT), 'canonicalCacheSHA256': sha(CACHE),
          'allSixPreviousPNGCanonicalComparisonsPassed': parity,
          'rows': rows, 'passed': all(row['passed'] for row in rows),
          'limits': 'Caller must separately verify actual capture/profile/postflight and review full images; metrics alone do not accept the issue.'}
output.write_text(json.dumps(result, indent=2, allow_nan=False)+'\n')
print(json.dumps({'image': str(image), 'passed': result['passed'], 'rows': rows}, indent=2))
