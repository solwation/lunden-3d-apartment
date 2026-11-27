"""Source ShadePools' display-space compositing, independent of the editor.

The source bakes lamp K into vertex RGB before sRGB transfer; opacity is the
SRC_ALPHA,ONE factor afterwards. No exposure or tone mapping applies to the pool.
"""
import math


def validate(data):
    if not isinstance(data, dict) or data.get('mask') != {'width': 128, 'height': 128, 'colorSpace': 'linear', 'flipY': True}:
        raise ValueError('Expected the original linear 128x128 ShadePools mask')
    fields = data.get('fields')
    if not isinstance(fields, list) or not fields:
        raise ValueError('Expected actual exported ShadePools fields')
    for field in fields:
        if field.get('kind') not in ('floor', 'ceiling') or not isinstance(field.get('lamp'), str) or not field['lamp']:
            raise ValueError('Each display pool needs its real lamp and floor/ceiling kind')
        corners = field.get('corners', {})
        if set(corners) != {'0,0', '1,0', '1,1', '0,1'}:
            raise ValueError('Expected four actual UV corners')
        for point in corners.values():
            _vector(point, 3)
        _vector(field.get('colour'), 3)
        if any(v < 0 for v in field['colour']) or not _finite(field.get('opacity')) or not 0 <= field['opacity'] <= 1:
            raise ValueError('Invalid source pool colour/opacity')
        origin = corners['0,0']
        a, b = [_minus(corners[k], origin) for k in ('1,0', '0,1')]
        aa, bb = _dot(a, a), _dot(b, b)
        if min(aa, bb) <= 0 or abs(_dot(a, b)) > 1e-5 * math.sqrt(aa * bb):
            raise ValueError('Source pool must retain its rectangular UV mapping')
        expected = [o + x + y for o, x, y in zip(origin, a, b)]
        if max(abs(x-y) for x, y in zip(expected, corners['1,1'])) > .001:
            raise ValueError('Source pool is not planar')
    for receiver in data.get('rugReceivers', []):
        for key in ('0,0', '1,0', '1,1', '0,1'):
            _vector(receiver['corners'][key], 3)
    if data.get('rugReceivers') and not isinstance(data.get('rugLamp'), str):
        raise ValueError('Rug receivers require their actual source floor-pool lamp binding')


def _finite(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _vector(v, n):
    if not isinstance(v, (list, tuple)) or len(v) != n or not all(_finite(x) for x in v):
        raise ValueError('Expected a finite source vector')


def _minus(a, b):
    return [x-y for x, y in zip(a, b)]


def _dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def _number(n):
    s = format(float(n), '.12g')
    return s if '.' in s or 'e' in s.lower() else s+'.0'


def _vec(v):
    return 'float3('+','.join(_number(n) for n in v)+')'


def lamps(data):
    validate(data)
    return sorted({f['lamp'] for f in data['fields']})


def rug_receivers(data, field):
    """Only the associated lower-floor pool can cross its actual 2mm rug gap.

    Other lamps/levels retain ordinary source quad depth testing. Heights come
    from the exported planes; 0.001cm permits only source float32 rounding.
    """
    if field['kind'] != 'floor' or field['lamp'] != data.get('rugLamp'):
        return []
    heights = [p[2] for p in field['corners'].values()]
    if max(heights)-min(heights) > .001:
        return []
    result = []
    for receiver in data.get('rugReceivers', []):
        top = [p[2] for p in receiver['corners'].values()]
        if max(top)-min(top) <= .001 and abs(top[0]-heights[0]-.2) <= .001:
            result.append(receiver)
    return result


def code(data):
    """UE Custom body. Inputs: Scene,WPos,Cam,N,Mask,Lamp0..N (native centimetres)."""
    order = lamps(data)
    out = [r'''struct SourceDisplayPool {
float3 encode(float3 v) {
    v=max(v,0.0);
    return lerp(pow(v,0.41666)*1.055-0.055,v*12.92,float3(v<=0.0031308));
}
};
SourceDisplayPool pool;
float3 ray=WPos-Cam;
float3 added=0.0;
''']
    # Only the original exported rug is permitted across the source's 2mm floor
    # decal/receiver discrepancy. This is a numeric receiver test, no depth bias.
    for field in data['fields']:
        out.append('{\nbool sourceRug=false;\n')
        for receiver in rug_receivers(data, field):
            c = receiver['corners']
            o = c['0,0']
            a, b = [_minus(c[k], o) for k in ('1,0', '0,1')]
            out.append('{ float3 d=WPos-'+_vec(o)+'; float2 uv=float2(dot(d,'+_vec(a)+')/'+_number(_dot(a,a))+',dot(d,'+_vec(b)+')/'+_number(_dot(b,b))+');\n'
                       'sourceRug=sourceRug || (all(uv>=0.0) && all(uv<=1.0) && abs(d.z)<=0.1 && N.z>0.5); }\n')
        c = field['corners']
        o = c['0,0']
        a, b = [_minus(c[k], o) for k in ('1,0', '0,1')]
        n = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
        length = math.sqrt(_dot(n, n))
        n = [x/length for x in n]
        fade = 'Lamp'+str(order.index(field['lamp']))
        out.append('float denominator=dot(ray,'+_vec(n)+');\n'
                   'if(abs(denominator)>1e-8 && '+fade+'>0.0) {\n'
                   'float t=dot('+_vec(o)+'-Cam,'+_vec(n)+')/denominator;\n'
                   'float3 d=Cam+ray*t-'+_vec(o)+';\n'
                   'float2 uv=float2(dot(d,'+_vec(a)+')/'+_number(_dot(a,a))+',dot(d,'+_vec(b)+')/'+_number(_dot(b,b))+');\n')
        rug = ' || sourceRug' if field['kind'] == 'floor' else ''
        out.append('if(t>0.0 && (t<=1.0'+rug+') && all(uv>=0.0) && all(uv<=1.0)) {\n'
                   'float mask=Texture2DSample(Mask,MaskSampler,float2(uv.x,1.0-uv.y)).r;\n'
                   'added+=pool.encode(mask*'+_vec(field['colour'])+'*'+fade+')*'+_number(field['opacity'])+';\n'
                   '}\n}\n}\n')
    out.append('return saturate(Scene.rgb+added);\n')
    return ''.join(out)
