"""#2372: exact exported web wall-AO triangles; no Unreal import or fitted light."""
import math


def _vector(value, size):
    if not isinstance(value, (list, tuple)) or len(value) != size or any(
            isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) for n in value):
        raise ValueError('Wall AO requires finite source vectors')


def validate(data):
    if data.get('version') != 1 or data.get('blendSpace') != 'display-srgb-multiply' \
            or data.get('runtimeCoverage') != 'static-built-geometry' \
            or data.get('coordinates') != {'units': 'metres', 'axes': 'x east, y up, z south'}:
        raise ValueError('Changed wall AO coordinate/display contract')
    _vector(data['wall'], 5)
    x, z0, y0, z1, y1 = data['wall']
    bottom = data['bandBottom']
    _vector([bottom], 1)
    if not z0 < z1 or not y0 <= bottom < y1:
        raise ValueError('Invalid bounded wall AO ceiling band')
    for name in ('floor', 'ceil', 'corner'):
        pair = data['coefficients'][name]
        _vector(pair, 2)
        if not 0 <= pair[0] <= 1 or pair[1] <= 0:
            raise ValueError('Invalid wall AO source coefficient')
    expected = {'depthTest': True, 'depthWrite': False, 'frontSide': True, 'polygonOffset': True,
                'polygonOffsetFactor': -2, 'polygonOffsetUnits': -2, 'renderOrder': 1,
                'toneMapped': False, 'blend': 'DstColor * source + Zero * destination'}
    if data.get('depth') != expected or not data.get('triangles'):
        raise ValueError('Changed wall AO source depth contract')
    plane = data['triangles'][0]['positions'][0][0]
    for triangle in data['triangles']:
        for key, size in (('positions', 3), ('aDist', 4)):
            if len(triangle[key]) != 3:
                raise ValueError('Wall AO requires source triangles')
            for row in triangle[key]:
                _vector(row, size)
        if any(v < 0 for row in triangle['aDist'] for v in row):
            raise ValueError('Negative source wall AO distance')
        if any(not x-.01 < p[0] < x or not z0-1e-5 <= p[2] <= z1+1e-5
               or not bottom-1e-5 <= p[1] <= y1+1e-5 for p in triangle['positions']):
            raise ValueError('Wall AO triangle escaped its actual target band')
        if any(abs(p[0]-plane) > 1e-6 for p in triangle['positions']):
            raise ValueError('Wall AO must retain its one actual source plane')
        a, b, c = triangle['positions']
        n = _cross(_minus(b, a), _minus(c, a))
        if _dot(n, n) < 1e-12 or n[0] >= 0 or abs(n[1])+abs(n[2]) > 1e-8:
            raise ValueError('Wall AO must retain the actual east-wall front face')
    for index, triangle in enumerate(data['triangles']):
        for other in data['triangles'][:index]:
            if _overlap_area(triangle['positions'], other['positions']) > 1e-9:
                raise ValueError('Overlapping wall AO triangles would multiply twice on web')
    return data


def _minus(a, b):
    return [x-y for x, y in zip(a, b)]


def _dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def _cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def _overlap_area(first, second):
    """Convex clipping in the actual wall's YZ plane; shared edges have zero area."""
    polygon = [[p[1], p[2]] for p in first]
    clip = [[p[1], p[2]] for p in second]
    def side(a, b, p):
        return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
    orientation = 1 if side(clip[0], clip[1], clip[2]) > 0 else -1
    for a, b in zip(clip, clip[1:]+clip[:1]):
        output = []
        for previous, current in zip(polygon[-1:]+polygon[:-1], polygon):
            sp, sc = side(a, b, previous)*orientation, side(a, b, current)*orientation
            if (sp >= 0) != (sc >= 0):
                t = sp/(sp-sc)
                output.append([p+(c-p)*t for p, c in zip(previous, current)])
            if sc >= 0:
                output.append(current)
        polygon = output
        if not polygon:
            return 0
    return abs(sum(a[0]*b[1]-a[1]*b[0] for a, b in zip(polygon, polygon[1:]+polygon[:1])))/2


def factor(data, point, camera):
    """Source display multiplier at a visible web-world point; includes front/depth clipping."""
    validate(data)
    ray = _minus(point, camera)
    for triangle in data['triangles']:
        a, b, c = triangle['positions']
        e, f = _minus(b, a), _minus(c, a)
        n = _cross(e, f)
        den = _dot(ray, n)
        if den >= -1e-12:
            continue
        t = _dot(_minus(a, camera), n)/den
        if not 0 < t <= 1:
            continue
        q = [o+r*t-v for o, r, v in zip(camera, ray, a)]
        ee, ef, ff = _dot(e, e), _dot(e, f), _dot(f, f)
        determinant = ee*ff-ef*ef
        u = (_dot(q, e)*ff-_dot(q, f)*ef)/determinant
        v = (_dot(q, f)*ee-_dot(q, e)*ef)/determinant
        if min(u, v, 1-u-v) < 0:
            continue
        distances = [sum(weight*row[k] for weight, row in zip((1-u-v, u, v), triangle['aDist'])) for k in range(4)]
        result = 1
        for name, distance in zip(('floor', 'ceil', 'corner', 'corner'), distances):
            strength, radius = data['coefficients'][name]
            result *= 1-strength*math.exp(-max(distance, 0)/radius)
        return result  # shared triangle edges are rasterized only once on web
    return 1.0


def code(data):
    """Custom inputs Scene,WPos,Cam in native cm; the result remains display encoded."""
    validate(data)
    def number(value):
        s = format(float(value), '.17g')
        return s if '.' in s or 'e' in s.lower() else s+'.0'
    def vec(values):
        return 'float'+str(len(values))+'('+','.join(number(v) for v in values)+')'
    out = ['float3 p=float3(WPos.x,WPos.z,WPos.y)*0.01;',
           'float3 camera=float3(Cam.x,Cam.z,Cam.y)*0.01;', 'float3 ray=p-camera;']
    for triangle in data['triangles']:
        a, b, c = triangle['positions']
        e, f = _minus(b, a), _minus(c, a)
        n = _cross(e, f)
        ee, ef, ff = _dot(e, e), _dot(e, f), _dot(f, f)
        determinant = ee*ff-ef*ef
        out.extend(['{', 'float den=dot(ray,'+vec(n)+');', 'if(den < -1e-12) {',
                    'float t=dot('+vec(a)+'-camera,'+vec(n)+')/den;', 'if(t>0.0 && t<=1.0) {',
                    'float3 q=camera+ray*t-'+vec(a)+';',
                    'float u=(dot(q,'+vec(e)+')*'+number(ff)+'-dot(q,'+vec(f)+')*'+number(ef)+')/'+number(determinant)+';',
                    'float v=(dot(q,'+vec(f)+')*'+number(ee)+'-dot(q,'+vec(e)+')*'+number(ef)+')/'+number(determinant)+';',
                    'if(u>=0.0 && v>=0.0 && u+v<=1.0) {',
                    'float4 distances=(1.0-u-v)*'+vec(triangle['aDist'][0])+'+u*'+vec(triangle['aDist'][1])+'+v*'+vec(triangle['aDist'][2])+';',
                    'float multiplier=1.0;'])
        for name, channel in zip(('floor', 'ceil', 'corner', 'corner'), 'xyzw'):
            strength, radius = data['coefficients'][name]
            out.append('multiplier*=1.0-'+number(strength)+'*exp(-max(distances.'+channel+',0.0)/'+number(radius)+');')
        out.extend(['return Scene.rgb*multiplier;', '}', '}', '}', '}'])
    out.append('return Scene.rgb;')
    return '\n'.join(out)+'\n'
