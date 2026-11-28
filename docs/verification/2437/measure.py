"""Private #2437 original lawn meter; no browser, resampling or ROI selection."""
import argparse
import hashlib
import json
import math
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def stats(path, rect):
    with Image.open(path) as image:
        image = image.convert('RGB')
        width, height = image.size
        x0,y0,x1,y1 = rect
        # Same Math.round of start/extent as the historical crop-stats.cjs.
        rnd = lambda value: math.floor(value + .5)
        x,y = rnd(x0*width),rnd(y0*height)
        w,h = rnd((x1-x0)*width),rnd((y1-y0)*height)
        pixels = list(image.crop((x,y,x+w,y+h)).getdata())
        mean = [sum(p[k] for p in pixels)/len(pixels) for k in range(3)]
        return {'file':str(Path(path).resolve()),'sha256':sha(path),'size':[width,height],
                'pixelRectXYWH':[x,y,w,h],'pixels':len(pixels),'srgb':mean,
                'decoder':'Pillow RGB; same normalized rectangle without image resampling'}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--native-entrance',required=True)
    parser.add_argument('--native-courtyard',required=True)
    parser.add_argument('--out',required=True)
    args = parser.parse_args()
    contract_path = HERE/'contract.json'
    contract = json.loads(contract_path.read_text())
    web = contract['webLawn']
    if sha(web['file']) != web['sha256']:
        raise RuntimeError('Frozen web entrance reference changed')
    reference = stats(web['file'],contract['lawnROI'])
    native = stats(args.native_entrance,contract['lawnROI'])
    ratios = [n/w for n,w in zip(native['srgb'],reference['srgb'])]
    passed = all(.9 <= ratio <= 1.1 for ratio in ratios)
    result = {'contractSHA256':sha(contract_path),'contract':contract,'lawn':{
        'web':reference,'native':native,'perChannelNativeOverWeb':ratios,'passed':passed},
        'courtyard':{'file':str(Path(args.native_courtyard).resolve()),'sha256':sha(args.native_courtyard),
        'status':'UNASSESSED','reason':'Historical courtyard crown ROI coordinates not preserved; no substitute ROI chosen'},
        'wholeIssuePassed':False,'reason':'Crown saturation acceptance remains unassessed; whole-image review also required'}
    output=Path(args.out)
    if output.exists():raise RuntimeError('Output already exists; preserve prior result')
    output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'lawnPassed':passed,'ratios':ratios,'crowns':'UNASSESSED','wholeIssuePassed':False}))

if __name__ == '__main__':
    main()
