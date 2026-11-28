"""#2437: new WEB-ONLY prelocked crown interiors, historical leaf-stats method."""
import argparse
import hashlib
import json
import math
from pathlib import Path
from PIL import Image
HERE=Path(__file__).resolve().parent

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def stats(path,rect):
    with Image.open(path) as image:
        image=image.convert('RGB'); width,height=image.size
        x0,y0,x1,y1=rect; rnd=lambda v:math.floor(v+.5)
        x,y=rnd(x0*width),rnd(y0*height); w,h=rnd((x1-x0)*width),rnd((y1-y0)*height)
        pixels=list(image.crop((x,y,x+w,y+h)).getdata())
    count=0; sums=[0.,0.,0.]; saturation=lightness=0.; huecos=huesin=0.
    for R,G,B in pixels:
        if B>R+12 and B>=G:continue
        rn,gn,bn=R/255,G/255,B/255
        mx=max(rn,gn,bn); mn=min(rn,gn,bn); delta=mx-mn; light=(mx+mn)/2
        if mx>.93 and delta<.08:continue
        count+=1
        for k,v in enumerate((R,G,B)):sums[k]+=v
        lightness+=light
        saturation+=0 if delta==0 else delta/(1-abs(2*light-1))
        if delta>.02:
            if mx==rn:hue=((gn-bn)/delta)%6
            elif mx==gn:hue=(bn-rn)/delta+2
            else:hue=(rn-gn)/delta+4
            angle=math.radians((hue*60+360)%360);huecos+=math.cos(angle);huesin+=math.sin(angle)
    if not count:raise RuntimeError('No retained crown pixels')
    return {'size':[width,height],'pixelRectXYWH':[x,y,w,h],'totalPixels':len(pixels),'retainedPixels':count,
            'share':count/len(pixels),'srgb':[s/count for s in sums],'sat':saturation/count,
            'light':lightness/count,'hue':math.degrees(math.atan2(huesin,huecos))%360}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--native-courtyard',required=True);parser.add_argument('--out',required=True);args=parser.parse_args()
    contract_path=HERE/'crown-contract.json'; contract=json.loads(contract_path.read_text())
    web=contract['webReference']
    if sha(web['file'])!=web['sha256']:raise RuntimeError('Frozen web reference changed')
    rows={}
    for name,roi in contract['regions'].items():
        source=stats(web['file'],roi['rect']);native=stats(args.native_courtyard,roi['rect']);ratio=native['sat']/source['sat']
        rows[name]={'web':source,'native':native,'saturationNativeOverWeb':ratio,'withinOriginal15Percent':.85<=ratio<=1.15}
    result={'contractSHA256':sha(contract_path),'contract':contract,'nativeFile':str(Path(args.native_courtyard).resolve()),
            'nativeSHA256':sha(args.native_courtyard),'regions':rows,'numericallyPassed':all(r['withinOriginal15Percent']for r in rows.values()),
            'geometryComparable':'Requires whole-frame review of same fixed crown positions; no automatic geometry pass',
            'wholeIssuePassed':False,'scope':'Crown supplement only; original lawn and whole-image review are separate requirements'}
    out=Path(args.out)
    if out.exists():raise RuntimeError('Preserve prior result; output must be fresh')
    out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'numericallyPassed':result['numericallyPassed'],'ratios':{k:v['saturationNativeOverWeb']for k,v in rows.items()}}))
if __name__=='__main__':main()
