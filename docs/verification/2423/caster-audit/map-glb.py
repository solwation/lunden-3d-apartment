"""Read-only exact existing GLB identities/world bounds and winter directional projections."""
from pathlib import Path
import argparse,json,hashlib,struct,itertools
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--exports',type=Path,required=True,help='Existing exported GLB directory; never written')
parser.add_argument('--baseline',type=Path,default=Path(__file__).resolve().parents[1]/'native-capture.json')
parser.add_argument('--out',type=Path,required=True,help='New output JSON outside protected project assets')
args=parser.parse_args();D=args.exports
if args.out.exists():raise RuntimeError('Output must be a new file')
ref=json.loads(args.baseline.read_text())['shots'][0]['sourceReference'];sun=ref['sunDirWeb'];plane=12.705
R={'sourceHead':'84e35c47e5b358cea4eedc4e37d77fbd0cd42948','exportRoot':str(D),'sunReference':ref,'wallPlaneSource':'src/exterior.js eps.006 + exportedL1007D12.699','planeWebZ':plane,'receivers':[],'nearPatioPlantFenceCandidates':[],'upperWallProjectionCandidates':[],'limit':'Projected AABB candidate bound only, not pixel/ray occlusion identity. Current real GLB hashes pinned; not fresh84e export. No colour/crop/threshold used.'}
I=[[int(i==j)for j in range(4)]for i in range(4)]
def mul(a,b):return[[sum(a[i][k]*b[k][j]for k in range(4))for j in range(4)]for i in range(4)]
def transform(m,v):return[sum(m[i][k]*v[k]for k in range(3))+m[i][3]for i in range(3)]
def bounds(v):return[[f(p[k]for p in v)for k in range(3)]for f in(min,max)]
def mat(nd):
 if'matrix'in nd:return[[nd['matrix'][j*4+i]for j in range(4)]for i in range(4)]
 x,y,z,w=nd.get('rotation',[0,0,0,1]);m=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),0],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),0],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),0],[0,0,0,1]];scale=nd.get('scale',[1,1,1]);tr=nd.get('translation',[0,0,0])
 for i in range(3):
  for j in range(3):m[i][j]*=scale[j]
  m[i][3]=tr[i]
 return m
for zone in('l1007','l1007-uteplats','hus-l','vegetation'):
 blob=(D/(zone+'.glb')).read_bytes();n=struct.unpack_from('<I',blob,12)[0];g=json.loads(blob[20:20+n]);R.setdefault('glbSHA256',{})[zone]=hashlib.sha256(blob).hexdigest();start=28+n
 def acc(i):
  a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];assert'sparse'not in a and a['componentType']==5126 and a['type']=='VEC3';off=start+v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',12);return[struct.unpack_from('<3f',blob,off+j*stride)for j in range(a['count'])]
 def walk(i,parent):
  nd=g['nodes'][i];world=mul(parent,mat(nd))
  if'mesh'in nd:
   for p in g['meshes'][nd['mesh']]['primitives']:
    a=g['accessors'][p['attributes']['POSITION']];mn,mx=bounds([transform(world,v)for v in itertools.product(*zip(a['min'],a['max']))]);mi=g['materials'][p['material']];brick=mi.get('name')=='std_ffffff_r100_m0_tex_ds';local=not(mx[0]<-2 or mn[0]>9 or mx[2]<plane-.1 or mn[2]>20 or mx[1]<0 or mn[1]>7)
    if not local:continue
    pts=[transform(world,v)for v in acc(p['attributes']['POSITION'])];mn,mx=bounds(pts);count=g['accessors'][p['indices']]['count']//3 if'indices'in p else len(pts)//3;row={'zone':zone,'id':nd.get('name'),'extras':nd.get('extras',{}),'materialKey':mi.get('name'),'material':mi,'worldAABBMin':mn,'worldAABBMax':mx,'vertices':len(pts),'triangles':count,'sourceCastsShadow':nd.get('extras',{}).get('castShadow',True),'sourceReceivesShadow':'Not serialized; source builder explicitly required'}
    if brick:
     on=[v for v in pts if abs(v[2]-plane)<1e-5 and -.01<=v[0]<=5.763]
     if on:R['receivers'].append({**row,'wallPlaneVertices':len(on),'wallPlaneBounds':bounds(on)})
    if zone=='l1007-uteplats'and any(t in nd.get('name','')for t in('planter','mesh_l0_x4_z1522','mesh_l0_x571_z1522')):R['nearPatioPlantFenceCandidates'].append(row)
    near=[v for v in pts if v[2]>plane+.005]
    if near and row['sourceCastsShadow']:
     projected=[[v[k]-(v[2]-plane)/sun[2]*sun[k]for k in range(3)]for v in near];lo,hi=bounds(projected)
     if hi[0]>=2 and lo[0]<=4.8 and hi[1]>=2.5 and lo[1]<=3.8:R['upperWallProjectionCandidates'].append({k:v for k,v in {**row,'projectedAABBMin':lo,'projectedAABBMax':hi}.items()if k!='material'})
  for child in nd.get('children',[]):walk(child,world)
 for i in g['scenes'][g.get('scene',0)]['nodes']:walk(i,I)
args.out.write_text(json.dumps(R,indent=2)+'\n');print(json.dumps({'receiverIDs':[x['id']for x in R['receivers']],'projectionCandidates':[{k:x[k]for k in('zone','id','materialKey','projectedAABBMin','projectedAABBMax')}for x in R['upperWallProjectionCandidates']]},indent=2))
