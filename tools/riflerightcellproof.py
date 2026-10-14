# #967 source-bound continuous whole-cell witness; no sampled pose lookup.
import json,math,itertools,time,sys,hashlib
from pathlib import Path
P=Path(sys.argv[1]); data=json.loads((P/'native-parity.json').read_text());vs=data['vertices'];head=[];skull=[]
# Source-bound ordinary standing geometry contract, not a general animation engine verifier.
# CPU SkinnedMesh.applyBoneTransform uses Float64 matrices, not GPU boneMatrices.
# Native Float32 vertex data is exported verbatim. Canonical interval arithmetic stays below
# 2 with zero-crossing divisions rejected; 2e-7 outward/op dominates binary64 roundoff.
# For the feet<=5000, scale>=.93 CPU path, a conservative 2048-operation chain with
# intermediates<=1e8 gives 2048*2^-52*1e8/.93 <5e-5; use 1e-4 positional enclosure.
# This is a source-derived conservative CPU numerical bound, not a formal proof of every
# engine operation, a GPU certificate, or a tolerance added to shot/entry validation.
EXPECTED={'src/avatar.js': 'ed9b69e3c0004aa047a56c3a744312220670482ab2a7959705a9a1a397ef5ace', 'src/olof.js': 'c8cc02d57f34b633ae9c6c046e59e2dd3c9cfcecaacb2f6196949a784bf79117', 'src/ghosts.js': '5c259e27986706d0230b0bf205f728b5cb58a1ee9f5153eeac36b1d1e8021025'}
for path,digest in EXPECTED.items():
 if hashlib.sha256(Path(path).read_bytes()).hexdigest()!=digest:raise SystemExit('source geometry/animation changed: review certificate '+path)
for path,digest in data['sourceHashes'].items():
 if hashlib.sha256(Path(path).read_bytes()).hexdigest()!=digest:raise SystemExit('generator source drift: '+path)
assert len(data['models'])==30 and data['positive']['positiveModels']==30
assert [v for v in data['variants']['0'] if v['bone']=='head']==[v for v in data['variants']['1'] if v['bone']=='head']

for i in range(0,len(vs),3):
 t=vs[i:i+3]
 if t[0]['bone']!='head': continue
 q=[[v['p'][0],v['p'][1]-1.54,v['p'][2]] for v in t]
 (skull if t[0]['skull'] else head).append(q)
NATIVE_ERROR=1e-4
def bounds(t):return [(min(v[k] for v in t)-NATIVE_ERROR,max(v[k] for v in t)+NATIVE_ERROR) for k in range(3)]
def split(t,n):
 if not n:return [t]
 a,b,c=t;ab=[(x+y)/2 for x,y in zip(a,b)];bc=[(x+y)/2 for x,y in zip(b,c)];ca=[(x+y)/2 for x,y in zip(c,a)]
 return sum((split(q,n-1) for q in [[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]]),[])
# Exact subdivision changes neither triangles nor their surface.
boxes=[bounds(q) for t in head for q in split(t,2)]

planes=[]
for t in skull:
 a,b,c=t;u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)];n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];length=math.hypot(*n)
 if length<1e-15:continue
 n=[x/length for x in n];d=sum(n[i]*a[i] for i in range(3))
 if sum(n[i]*[0,.1,.01][i] for i in range(3))>d:n=[-x for x in n];d=-d
 planes.append((n,d))
EPS=2e-7 # accommodates native bind translation's Float32 subtraction; explicit computational enclosure, not a gameplay tolerance
add=lambda a,b:(a[0]+b[0]-EPS,a[1]+b[1]+EPS)
neg=lambda a:(-a[1],-a[0])
def mul(a,b):
 q=[x*y for x in a for y in b];return(min(q)-EPS,max(q)+EPS)
def sin(a):return(math.sin(a[0])-EPS,math.sin(a[1])+EPS) # domain [-.03,.105]
def cos(a):return(min(math.cos(a[0]),math.cos(a[1]))-EPS,1+EPS if a[0]<=0<=a[1] else max(math.cos(a[0]),math.cos(a[1]))+EPS)
def pointbox(xs,yaw,pitch,hy):
 # Whole wire-cell cone from exact o=(-4.1,1.63,.04) via cell centred(-.095,1.63,.04).
 scale=((xs[0]+4.1)/(4.1-.095-.0005),(xs[1]+4.1)/(4.1-.095+.0005));scale=(min(scale),max(scale));err=.0005*(xs[1]+4.1)/(4.1-.095-.0005)
 y=add((1.628,1.632),neg(hy));z=(.038,.042)
 xx=add(mul(cos(yaw),xs),neg(mul(sin(yaw),z)));zz=add(mul(sin(yaw),xs),mul(cos(yaw),z)); yy=add(mul(cos(pitch),y),neg(mul(sin(pitch),zz)));zz=add(mul(sin(pitch),y),mul(cos(pitch),zz));return [xx,yy,zz]
def overlap(a,b):return all(a[k][1]>=b[k][0] and b[k][1]>=a[k][0] for k in range(3))
def inside(b):return max(sum(n[i]*(b[i][1] if n[i]>0 else b[i][0]) for i in range(3))-d for n,d in planes)
globalBox=pointbox((-.8,-.087),(0,.105),(-.03,.03),(1.516,1.54));unfiltered=len(boxes);boxes=[b for b in boxes if overlap(b,globalBox)]
start=time.monotonic();states=0;worst=-1;fail=[];xend=-.087
# Each Cartesian box covers a continuous interval, including independent extremes of breathing and pitch.
for iy,ip,hy in itertools.product(range(8),range(8),[(1.516,1.518),(1.518,1.520),(1.520,1.522),(1.522,1.524),(1.54,1.54)]):
 yaw=(iy*.105/8,(iy+1)*.105/8);pitch=(-.03+ip*.06/8,-.03+(ip+1)*.06/8);states+=1;b=pointbox((xend,xend),yaw,pitch,hy);d=inside(b);worst=max(worst,d)
 if d>=-NATIVE_ERROR:fail.append({'reason':'not robust interior','yaw':yaw,'pitch':pitch,'height':hy,'gap':d});break
 for ix in range(256):
  x0=-.8+ix*(.8+xend)/256;x1=-.8+(ix+1)*(.8+xend)/256;b=pointbox((x0,x1),yaw,pitch,hy)
  found=next((j for j,bb in enumerate(boxes) if overlap(b,bb)),None)
  if found is not None:fail.append({'reason':'uncertified head triangle bbox','yaw':yaw,'pitch':pitch,'height':hy,'x':[x0,x1],'rayBox':b,'triangleBox':boxes[found]});break
 if fail:break
result={'type':'analytic interval HEAD-only feasibility; NOT full admission certificate','states':states,'skullInteriorWorstSignedPlane':worst,'fails':fail,'elapsed':time.monotonic()-start,'nativeHeadTriangles':len(head),'subdividedBoxes':len(boxes),'EPS':EPS,'nativeError':NATIVE_ERROR,'unfiltered':unfiltered,'globalFilterBox':globalBox,'scope':'head component; aggregate includes limbs/body/native parity'};(P/'head-gate.json').write_text(json.dumps(result,indent=2));print(json.dumps(result));headResult=result;
if fail:raise SystemExit(1)

import math,json,itertools
from pathlib import Path
EPS=2e-7
v=lambda a:(a,a)
add=lambda a,b:(a[0]+b[0]-EPS,a[1]+b[1]+EPS)
neg=lambda a:(-a[1],-a[0])
sub=lambda a,b:add(a,neg(b))
def mul(a,b):
 q=[x*y for x in a for y in b];return(min(q)-EPS,max(q)+EPS)
def div(a,b):
 if b[0]<=0<=b[1]:raise ValueError('zero denominator')
 return mul(a,(1/b[1],1/b[0]))
def square(a):return (0 if a[0]<=0<=a[1] else min(x*x for x in a),max(x*x for x in a))
def sqrt(a):
 if a[0]<0:raise ValueError(('negative sqrt',a))
 return (math.sqrt(a[0])-EPS,math.sqrt(a[1])+EPS)
def clamp(a,lo,hi):return(max(lo,min(hi,a[0])),max(lo,min(hi,a[1])))
def dot(a,b):
 q=v(0)
 for x,y in zip(a,b):q=add(q,mul(x,y))
 return q
def length(a):
 q=v(0)
 for x in a:q=add(q,square(x))
 return sqrt(q)
def norm(a):
 d=length(a);return [div(x,d) for x in a]
def ik(T,hy,pole):
 S=[v(-.2),add(hy,v(.55)),v(0)];U=[sub(t,s) for t,s in zip(T,S)];d=clamp(length(U),.011,.5699);u=norm(U);cos=clamp(div(add(v(.28**2-.29**2),square(d)),mul(v(.56),d)),-1,1);sin=sqrt(clamp(sub(v(1),square(cos)),0,1));pr=dot(pole,u);p=norm([sub(x,mul(y,pr)) for x,y in zip(pole,u)]);e=[add(mul(x,cos),mul(y,sin)) for x,y in zip(u,p)];E=[add(s,mul(v(.28),x)) for s,x in zip(S,e)];f=norm([sub(mul(x,d),mul(v(.28),y)) for x,y in zip(u,e)]);return S,E,f
# A unit separating plane normal in yz; exact midpoint choice affects tightness only, never validity.
def midpoint(a):return sum(a)/2
fails=[];worst=1;states=0;maxHorizontal=0;restMaxY=0;heldMaxY=0
for mode in ['wave','held','rest']:
 for i,j in itertools.product(range(256),range(64)):
  hy=(.876+j*.008/64,.876+(j+1)*.008/64)
  if mode=='wave':T=[(-.41+i*.14/256,-.41+(i+1)*.14/256),v(1.72),v(.12)];pole=list(map(v,[-1,-.7,-.1]))
  elif mode=='held':s=(i/256,(i+1)/256);T=[add(v(-.2),mul(v(.45),s)),add(v(1.12),mul(v(.1),s)),v(.34)];pole=list(map(v,[-.6,-.6,-.5]))
  else:T=list(map(v,[-.2,.83,.02]));pole=list(map(v,[-.3,-.3,-1]))
  S,E,f=ik(T,hy,pole);states+=1
  for q,r in [(S,.0941),(E,.0941),([add(E[k],mul((-.0451,.37964),f[k])) for k in range(3)],.0471)]:
   maxHorizontal=max(maxHorizontal,math.hypot(max(abs(x) for x in q[0]),max(abs(x) for x in q[2]))+r)
  if mode!='wave':
   maxY=max(S[1][1]+.0940001,E[1][1]+.045,E[1][1]+max(0,f[1][1]*.37954)+.0469)
   margin=1.628-maxY
   if mode=="rest":restMaxY=max(restMaxY,maxY)
   else:heldMaxY=max(heldMaxY,maxY)
  else:
   # Upper arm endpoint capsule (radius .0940001) and elbow ball cannot reach ray height.
   upperMargin=1.628-max(S[1][1],E[1][1])-.0940001
   ny,nz=-.27,1;n=math.hypot(ny,nz);ny/=n;nz/=n
   # Entire lower-arm capsule along E + f*[0,.235], plus exact native maximum radial size .0430001.
   # The elbow sphere (.045) is checked separately by its maximum y.
   lower=add(mul(v(ny),E[1]),mul(v(nz),E[2]));fd=add(mul(v(ny),f[1]),mul(v(nz),f[2]));lower=add(lower,mul((-.0450001,.2350001),fd))[0]-.0431001
   # Whole ray cone through local cell and heading delta 0… .105. In this negative-x slab yaw only REDUCES z.
   ray=add(mul(v(ny),(1.628,1.632)),mul(v(nz),(-.05,.042)))[1]
   foreMargin=lower-ray
   # Hand/fingers lie farther along same forearm axis; native axial interval .27019… .37954 from elbow.
   handY=add(E[1],mul((.27019,.37954),f[1]))[0]-.0470
   margin=min(upperMargin,foreMargin,handY-1.632)
  worst=min(worst,margin)
  if margin<=0:fails.append({'mode':mode,'cell':i,'hip':hy,'margin':margin,'E':E,'f':f});break
 if fails:break
result={'type':'analytic interval arm capsule feasibility, one canonical wire cone; not a complete runtime certificate','states':states,'worstSeparation':worst,'fails':fails,'EPS':EPS,'maxHorizontalRadius':maxHorizontal,'leftArmMirrorRestMaxY':restMaxY,'heldMaxY':heldMaxY,'leftArmReason':'Only ordinary right hand is overridden by Ghosts; rest left/right IK is mirrored in x with equal y/z and native radius bounds validated for both sleeve variants.','scope':'right wave/held/rest and mirrored left rest, actual both-sleeve radii; aggregate also includes torso/legs'};(P/'arm-gate.json').write_text(json.dumps(result,indent=2));print(json.dumps(result));armResult=result;
if fails:raise SystemExit(1)


# Remaining rigid torso/hips and standing legs, for both exported native sleeve variants.
body=[]
for sleeve,vertices in data['variants'].items():
 for side,x in [('L',.085),('R',-.085)]:
  # Native forearm, hand and upper-arm envelopes used above, including both axial ends.
  for bone,by,rad,axial in [('shoulder'+side,1.45,.0541,(-.0401,.2901)),('elbow'+side,1.17,.0431,(-.0451,.2351)),('hand'+side,.92,.047, (.0201,.1296))]:
   points=[q['p'] for q in vertices if q['bone']==bone]
   assert max(math.hypot(q[0]-(.2 if side=='L' else -.2),q[2]) for q in points)<=rad
   assert all(axial[0]<=by-q[1]<=axial[1] for q in points)
  for bone,y in [('thigh'+side,.9),('knee'+side,.46)]:
   points=[q['p'] for q in vertices if q['bone']==bone];above=max(0,max(q[1]-y for q in points));radial=max(math.hypot(q[0]-x,q[2]) for q in points)
   body.append({'sleeve':sleeve,'bone':bone,'standingMaxY':.884+above+radial+NATIVE_ERROR})
 static=[q['p'] for q in vertices if q['bone'] in ['torso','hips']]
 body.append({'sleeve':sleeve,'staticMaxY':max(q[1] for q in static)+NATIVE_ERROR,'standingMaxY':max(q[1] for q in static)+NATIVE_ERROR,'bindHorizontal':max(math.hypot(q['p'][0],q['p'][2]) for q in vertices)})
dlo=math.hypot(.025,.826,.07);dhi=math.hypot(.025,.834,.07);c=(.44**2+dlo*dlo-.41**2)/(2*.44*dlo)
legUpperY=(-.826/dhi)*c+math.sqrt(1-c*c);lowerLegRawY=-.826+.44
assert legUpperY<0 and lowerLegRawY<0 and all(q['standingMaxY']<1.628 for q in body)
assert armResult['maxHorizontalRadius']<.8 and armResult['leftArmMirrorRestMaxY']<1.628 and armResult['heldMaxY']<1.628
assert all(q.get('bindHorizontal',0)<.8 for q in body)
# Original head traversal starts outside every head primitive, certified by native horizontal
# radius and maximal pitch/yaw displacement (all rotations preserve full radius).
assert max(math.hypot(*[v['p'][0],v['p'][1]-1.54,v['p'][2]]) for v in data['vertices'] if v['bone']=='head')<.8
aggregate={'complete':True,'sourceHashes':data['sourceHashes'],'generatorSHA':data['generatorSHA'],'intervalSHA':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'nativeModels':len(data['models']),'positiveModels':data['positive']['positiveModels'],'head':headResult,'arm':armResult,'body':body,'legAxisYUpper':legUpperY,'lowerLegRawAxisYUpper':lowerLegRawY,'nativeCPUPositionEnclosure':NATIVE_ERROR,'claim':'Source-bound continuous prism certificate for new style0 first-turn permission; actual functional Worker acceptance is separate. Not GPU or formal all-engine certification.'}
(P/'certificate.json').write_text(json.dumps(aggregate,indent=2)+'\n')
print('PASS continuous prism aggregate: 30 native models/positives, head + both arms + body')
