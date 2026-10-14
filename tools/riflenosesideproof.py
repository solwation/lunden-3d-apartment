"""#971 source-bound immutable Nose prism certificate (CPU/native Three; no WebGL).
Run the native export mode first, then: python3 tools/riflenosesideproof.py OUTPUT_DIR
The generated polygon is a ray-query policy, never replacement avatar geometry.
Continuous enclosure: independent head pitch [-.03,.03], standing pivot [1.516,1.524]
and bind pivot1.54, full source IK limb targets. Native Float32 positions are input.
The .1mm CPU error is an engineering numerical enclosure, not a formal JS/libm or
GPU proof: 2048 rounded Float64 operations at conservative intermediate1e8 / min
scale.93 give <49 micrometres (unit roundoff2^-52); we reserve100 micrometres.
No source-dependent arithmetic is allowed to change without regenerating/reviewing.
"""
import json,math,pathlib,itertools,sys,hashlib

SOURCE={'avatarPhysical': 'b7d77d2953a6e18c85b51a19913d93175f6f3b7663bb572bae0171346715b6b9', 'src/olof.js': 'c8cc02d57f34b633ae9c6c046e59e2dd3c9cfcecaacb2f6196949a784bf79117', 'src/ghosts.js': '5c259e27986706d0230b0bf205f728b5cb58a1ee9f5153eeac36b1d1e8021025'}

def section(P):
 data=json.loads((P/'native-export.json').read_text());verts=data['variants']['0/0'];nose=[v['p']for v in verts if v['nose']];planes=[]
 for i in range(0,len(nose),3):
  a,b,c=[[p[0],p[1]-1.54,p[2]]for p in nose[i:i+3]];u=[b[k]-a[k]for k in range(3)];v=[c[k]-a[k]for k in range(3)];n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];norm=math.hypot(*n)
  if norm<1e-14:continue
  n=[x/norm for x in n];d=sum(n[k]*a[k]for k in range(3))
  if sum(n[k]*[0,.092,.113][k]for k in range(3))>d:n=[-x for x in n];d=-d
  assert all(sum(n[k]*[v[0],v[1]-1.54,v[2]][k]for k in range(3))<=d+1e-7 for v in nose), "native Nose must be convex"
  planes.append((n,d))
 def clip(poly,nx,ny,lim):
  out=[]
  for v,w in zip(poly,poly[1:]+poly[:1]):
   av=nx*v[0]+ny*v[1]-lim;aw=nx*w[0]+ny*w[1]-lim
   if av<=0:out.append(v)
   if (av<=0)!=(aw<=0):
    k=av/(av-aw);out.append((v[0]+k*(w[0]-v[0]),v[1]+k*(w[1]-v[1])))
  return out
 # Initial section search box x±.02,y[1.59,1.65],z≤.119 and pivot[1.516,1.54]
 # has radius <=sqrt(.02²+.134²+.119²)=.18032m <.2. Rotation derivative
 # norm equals distance to its x-axis and is bounded by that radius.
 assert math.hypot(.02,1.65-1.516,.119)<.2
 step=.06/128;eps=.2*step/2+1e-4 # inverse point within .2m of head pivot across initial box; rotation chord <= radius*angle
 poses=[(1.54,0,1e-4)]+[(h,-.03+(i+.5)*step,eps)for h in [1.516,1.524]for i in range(128)]
 results=[]
 for z in [.103,.105,.107,.109,.111,.113,.115,.117,.119]:
  poly=[(-.02,1.59),(.02,1.59),(.02,1.65),(-.02,1.65)]
  for hy,p,e in poses:
   for n,d in planes:
    ny=math.cos(p)*n[1]+math.sin(p)*n[2];nz=-math.sin(p)*n[1]+math.cos(p)*n[2];poly=clip(poly,n[0],ny,d+ny*hy-nz*z-e)
    if not poly:break
   if not poly:break
  if poly:
   area=abs(sum(v[0]*w[1]-v[1]*w[0]for v,w in zip(poly,poly[1:]+poly[:1])))/2
  else:area=0
  results.append({'z':z,'polygon':poly,'area':area,'maxAbsX':max((abs(p[0])for p in poly),default=0)})
 report={'planes':len(planes),'poses':len(poses),'intervalPitchHalfWidth':step/2,'enclosure':eps,'nativeError':1e-4,'results':results,'scope':'Necessary positive continuous Nose cross-section only; no occluder/ray/Worker admission proof.'};(P/'section-gate.json').write_text(json.dumps(report,indent=2));print(json.dumps([{k:v for k,v in r.items()if k!='polygon'}for r in results]))
 return report

def head(P):
 d=json.loads((P/'native-export.json').read_text());sec=json.loads((P/'section-gate.json').read_text());r=next(r for r in sec['results']if r['z']==.119);poly=r['polygon'];zplane=r['z'];e=.0001
 # Interval arithmetic on exact native triangle coordinates; each triangle is convex.
 def mul(a,b):
  q=[x*y for x in a for y in b];return min(q),max(q)
 def add(a,b):return a[0]+b[0],a[1]+b[1]
 def clip(poly,nx,ny,lim):
  out=[]
  for v,w in zip(poly,poly[1:]+poly[:1]):
   av=nx*v[0]+ny*v[1]-lim;aw=nx*w[0]+ny*w[1]-lim
   if av<=0:out.append(v)
   if (av<=0)!=(aw<=0):
    k=av/(av-aw);out.append((v[0]+k*(w[0]-v[0]),v[1]+k*(w[1]-v[1])))
  return out
 def hit(b):
  if b[2][1]<zplane or b[2][0]>1.0:return False
  q=poly
  for nx,ny,v in [(1,0,b[0][1]),(-1,0,-b[0][0]),(0,1,b[1][1]),(0,-1,-b[1][0])]:
   q=clip(q,nx,ny,v)
   if not q:return False
  return True
 def split(t,n):
  if not n:return[t]
  a,b,c=t;ab=[(x+y)/2 for x,y in zip(a,b)];bc=[(x+y)/2 for x,y in zip(b,c)];ca=[(x+y)/2 for x,y in zip(c,a)];return sum((split(u,n-1)for u in[[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]]),[])
 def box(t,h,p):
  x=(min(v[0]for v in t)-e,max(v[0]for v in t)+e);y=(min(v[1]-1.54 for v in t),max(v[1]-1.54 for v in t));z=(min(v[2]for v in t),max(v[2]for v in t));sn=(math.sin(p[0]),math.sin(p[1]));cs=(min(math.cos(p[0]),math.cos(p[1])),1 if p[0]<=0<=p[1]else max(math.cos(p[0]),math.cos(p[1])));yy=add(h,add(mul(y,cs),mul(z,sn)));zz=add(mul(y,(-sn[1],-sn[0])),mul(z,cs));return[x,(yy[0]-e,yy[1]+e),(zz[0]-e,zz[1]+e)]
 result=[]
 for style in range(4):
  vs=d['variants'][str(style)+'/0'];bad=[];tested=0;total=0;coarseDiscard=0;subtested=0;subDiscard=0
  for i in range(0,len(vs),3):
   if vs[i]['nose']or vs[i]['bone']!='head':continue
   total+=1;t=[v['p']for v in vs[i:i+3]]
   if not hit(box(t,(1.516,1.54),(-.03,.03))):coarseDiscard+=1;continue
   for q in split(t,3):
    subtested+=1
    if not hit(box(q,(1.516,1.54),(-.03,.03))):subDiscard+=1;continue
    found=False
    for h,p in [((1.54,1.54),(0,0))]+[((1.516+j*.008/8,1.516+(j+1)*.008/8),(-.03+k*.06/16,-.03+(k+1)*.06/16))for j in range(8)for k in range(16)]:
     tested+=1
     if hit(box(q,h,p)):bad.append({'triangle':i//3,'native':q,'height':h,'pitch':p,'box':box(q,h,p)});found=True;break
    if found:break
  result.append({'style':style,'testedIntervals':tested,'totalHeadOccluderTriangles':total,'coarseDiscards':coarseDiscard,'subtrianglesTested':subtested,'subtriangleDiscards':subDiscard,'uncertified':bad})
 report={'plane':zplane,'footprint':poly,'nativeError':e,'head':result,'scope':'HEAD-only interval pre-entry prism exclusion; no limb/runtime/whole-cell cone admission yet.'};(P/'occlusion-gate.json').write_text(json.dumps(report,indent=2));print(json.dumps([{k:v if k!='uncertified'else len(v)for k,v in r.items()}for r in result]));assert not any(r["uncertified"] for r in result)
 return report

def limbs(P):
 data=json.loads((P/'native-export.json').read_text());section=next(r for r in json.loads((P/'section-gate.json').read_text())['results']if r['z']==.119);xmin=min(v[0]for v in section['polygon']);ymin=min(v[1]for v in section['polygon']);ERR=.0001;EPS=2e-12
 V=lambda x:(x,x)
 def add(a,b):return(a[0]+b[0]-EPS,a[1]+b[1]+EPS)
 def neg(a):return(-a[1],-a[0])
 def sub(a,b):return add(a,neg(b))
 def mul(a,b):
  q=[x*y for x in a for y in b];return(min(q)-EPS,max(q)+EPS)
 def div(a,b):
  assert b[0]>0 or b[1]<0
  return mul(a,(1/b[1],1/b[0]))
 def square(a):return(0 if a[0]<=0<=a[1]else min(x*x for x in a),max(x*x for x in a))
 def sqrt(a):return(math.sqrt(max(0,a[0]))-EPS,math.sqrt(max(0,a[1]))+EPS)
 def length(v):
  q=V(0)
  for x in v:q=add(q,square(x))
  return sqrt(q)
 def norm(v):return[div(x,length(v))for x in v]
 def dot(a,b):
  q=V(0)
  for x,y in zip(a,b):q=add(q,mul(x,y))
  return q
 def clamp(a,lo,hi):return(max(lo,min(hi,a[0])),max(lo,min(hi,a[1])))
 def ik(T,hy,pole):
  S=[V(-.2),add(hy,V(.55)),V(0)];raw=[sub(t,s)for t,s in zip(T,S)];u=norm(raw);d=clamp(length(raw),.011,.5699);c=clamp(div(add(V(.28**2-.29**2),square(d)),mul(V(.56),d)),-1,1);sn=sqrt(clamp(sub(V(1),square(c)),0,1));q=dot(pole,u);p=norm([sub(x,mul(q,y))for x,y in zip(pole,u)]);e=[add(mul(c,x),mul(sn,y))for x,y in zip(u,p)];E=[add(s,mul(V(.28),a))for s,a in zip(S,e)];f=norm([sub(mul(d,x),mul(V(.28),y))for x,y in zip(u,e)]);return S,E,e,f
 bounds=[]
 for variant,vs in data['variants'].items():
  for side,sx in [('R',-.2),('L',.2)]:
   for bone,by in [('shoulder'+side,1.45),('elbow'+side,1.17),('hand'+side,1.17)]:
    points=[v['p']for v in vs if v['bone']==bone];bounds.append({'variant':variant,'bone':bone,'radius':max(math.hypot(p[0]-sx,p[2])for p in points)+ERR,'axial':[min(by-p[1]for p in points)-ERR,max(by-p[1]for p in points)+ERR]})
 # Every appearance/sleeve must fit the same source-derived envelope; no selected seed shape.
 envelopes={k:{'radius':max(v['radius']for v in bounds if v['bone'].startswith(k)),'axial':(min(v['axial'][0]for v in bounds if v['bone'].startswith(k)),max(v['axial'][1]for v in bounds if v['bone'].startswith(k)))}for k in ['shoulder','elbow','hand']}
 worst=1;failure=[];states=0;modeBounds=[]
 for mode in ['wave','held','rest']:
  biggest=-10
  for i,j in itertools.product(range(256),range(32)):
   hy=(.876+j*.008/32,.876+(j+1)*.008/32)
   if mode=='wave':T=[(-.41+i*.14/256,-.41+(i+1)*.14/256),V(1.72),V(.12)];pole=list(map(V,[-1,-.7,-.1]))
   elif mode=='held':sw=(i/256,(i+1)/256);T=[add(V(-.2),mul(V(.45),sw)),add(V(1.12),mul(V(.1),sw)),V(.34)];pole=list(map(V,[-.6,-.6,-.5]))
   else:T=list(map(V,[-.2,.83,.02]));pole=list(map(V,[-.3,-.3,-1]))
   S,E,e,f=ik(T,hy,pole);states+=1
   axis=0 if mode=='wave'else 1;maximum=-10
   for part,start,direction in [('shoulder',S,e),('elbow',E,f),('hand',E,f)]:
    b=envelopes[part];maximum=max(maximum,add(start[axis],mul(b['axial'],direction[axis]))[1]+b['radius']+ERR)
   margin=(xmin if mode=='wave'else ymin)-maximum;biggest=max(biggest,maximum);worst=min(worst,margin)
   if margin<=0:failure.append({'mode':mode,'i':i,'j':j,'maximum':maximum,'margin':margin});break
  modeBounds.append({'mode':mode,'maxCoordinate':biggest,'axis':'x'if mode=='wave'else'y'})
  if failure:break
 static=[]
 for key,vs in data['variants'].items():
  fixed=[v['p']for v in vs if v['bone']in['hips','torso']];static.append({'variant':key,'bindMaxY':max(p[1]for p in fixed)+ERR,'bindMaxZ':max(p[2]for p in fixed)+ERR})
  # Bind limbs all below prism or outside its x span, checked from exact triangles' AABBs.
  for i in range(0,len(vs),3):
   t=vs[i:i+3]
   if t[0]['bone']=='head':continue
   if max(v['p'][1]for v in t)+ERR>=ymin and min(v['p'][0]for v in t)-ERR<=-xmin and max(v['p'][0]for v in t)+ERR>=xmin and max(v['p'][2]for v in t)+ERR>=.119:failure.append({'bindBodyTriangle':i//3,'variant':key})
 assert all(v['bindMaxY']<ymin for v in static)
 # Standing leg upper axis points downward: source d and cosA bounds for feet(.11,.05,.02), hip(.085,hy,0).
 dlo=math.hypot(.025,.826,.02);dhi=math.hypot(.025,.834,.02);co=(.44**2+dlo*dlo-.41**2)/(2*.44*dlo);upperY=-.826/dhi*co+math.sqrt(1-co*co);assert upperY<0
 legRadius=max(math.dist(v['p'],[.085 if v['bone'].endswith('L')else-.085,.9 if v['bone'].startswith('thigh')else.46,0])for vs in data['variants'].values()for v in vs if v['bone'].startswith(('thigh','knee')));assert .884+legRadius+ERR<ymin
 r={'complete':not failure,'states':states,'worstSeparation':worst,'modeBounds':modeBounds,'envelopes':envelopes,'sourceNativeBounds':bounds,'body':static,'legUpperYBound':upperY,'legRadius':legRadius,'nativeCPUError':ERR,'intervalRoundout':EPS,'fails':failure,'scope':'source-bound ordinary immutable standing/bind: both sleeve variants/all styles, right wave/held/saber sweep/rest and mirrored left rest; no product runtime or protocol claim'};(P/'limb-gate.json').write_text(json.dumps(r,indent=2));print(json.dumps({k:v for k,v in r.items()if k not in ['sourceNativeBounds','body']}));assert not failure
 return r

def main():
 P=pathlib.Path(sys.argv[1]); d=json.loads((P/'native-export.json').read_text())
 assert d['sourceHashes']==d['afterHashes'] and not d['gl'] and not d['errors']
 a=pathlib.Path('src/avatar.js').read_text()
 physical=a[a.index('const REGION'):a.index('  /** #897:')]+a[a.index('  update(dt,'):]
 actual={'avatarPhysical':hashlib.sha256(physical.encode()).hexdigest(),**{f:hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest()for f in ['src/olof.js','src/ghosts.js']}}
 assert actual==SOURCE, 'physical source changed; review/regenerate the certificate, never silently update pins'
 assert len(d['models'])==120 and len(d['variants'])==8
 for m in d['models']:
  l=m['look']; assert m['scale']==[[.93,1,1.08][l['build']],l['tall'],[.93,1,1.08][l['build']]]
 for style in range(4):
  assert [v for v in d['variants'][str(style)+'/0']if v['bone']=='head']==[v for v in d['variants'][str(style)+'/1']if v['bone']=='head']
 nose=[v['p'] for v in d['variants']['0/0']if v['nose']]
 profile=[v for tri in d['noseProfile'] for v in tri]
 assert len(nose)==len(profile)
 error=max(abs(a[i]-(b[i]+(1.54 if i==1 else 0)))for a,b in zip(nose,profile)for i in range(3))
 assert error<1e-7, 'pure profile/native translation parity'
 # Exact maximum of rotated Skull forward coordinate over pitch interval; interval extrema include critical angle.
 skull=[v['p'] for v in d['variants']['0/0']if v['skull']]
 front=-math.inf
 for x,y,z in skull:
  y-=1.54; angles=[-.03,.03,0]; critical=math.atan2(-y,z)
  if -.03<=critical<=.03:angles.append(critical)
  front=max(front,*( -math.sin(t)*y+math.cos(t)*z for t in angles))
 barrier=math.ceil((front+.0001)*1000)/1000;assert barrier==.119
 sec=section(P); h=head(P); l=limbs(P)
 # Full actor forward bound ensures an origin beyond1m cannot meet an earlier untested surface.
 legFront=.44+l['legRadius']+.0001
 armFront=.28+max(v['axial'][1]+v['radius']for v in l['envelopes'].values())+.0001
 headFront=max(math.hypot(v['p'][1]-1.54,v['p'][2])for vs in d['variants'].values()for v in vs if v['bone']=='head')+.0001
 assert max(legFront,armFront,headFront,max(v['bindMaxZ']for v in l['body']))<1
 polygon=next(r['polygon']for r in sec['results']if r['z']==barrier)
 assert d['prism']['polygon']==[list(v)for v in polygon] and d['prism']['back']==barrier and d['prism']['front']==1, 'runtime prism is exactly generated, not a handwritten shape'
 report={'source':actual,'nativeSource':d['sourceHashes'],'nativeParityError':error,'skullFront':front,'barrier':barrier,'front':1,'polygon':polygon,'forwardBounds':{'legs':legFront,'arms':armFront,'head':headFront},'section':sec,'head':h,'limbs':l,'numerics':{'CPUError':.0001,'maxFloat64Error':2048*2**-52*1e8/.93,'intervalRoundout':2e-12},'complete':True,'scope':'source-bound continuous conservative CPU certificate; runtime integration/Worker not inferred from certificate'}
 (P/'certificate.json').write_text(json.dumps(report,indent=2)); print('PASS continuous native Nose prism / head and limbs / exact source and profile parity')
if __name__=='__main__':main()
