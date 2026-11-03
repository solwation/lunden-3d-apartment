#!/usr/bin/env python3
"""#1844 offline illustration from captured real model traces. Uses installed Cairo, no app/browser."""
import ctypes as C, ctypes.util, json, math
from pathlib import Path
root=Path(__file__).resolve().parent.parent
out=root/'docs/verification/1844'
data=json.loads((out/'browser.json').read_text());site=json.loads((out/'map-source.json').read_text())
lib=C.CDLL(ctypes.util.find_library('cairo'))
def bind(name,args,result=None):
 f=getattr(lib,'cairo_'+name);f.argtypes=args;f.restype=result;return f
P=C.c_void_p;D=C.c_double;I=C.c_int;S=C.c_char_p
surface=bind('image_surface_create',[I,I,I],P)(0,1100,1250)
ctx=bind('create',[P],P)(surface)
fn={n:bind(n,[P]+types)for n,types in {'set_source_rgb':[D,D,D],'paint':[],'move_to':[D,D],'line_to':[D,D],'close_path':[],'fill':[],'stroke':[],'set_line_width':[D],'rectangle':[D,D,D,D],'arc':[D,D,D,D,D],'save':[],'restore':[],'clip':[],'set_font_size':[D],'show_text':[S],'select_font_face':[S,I,I]}.items()}
def do(n,*v):fn[n](ctx,*v)
def color(hex):
 h=hex.lstrip('#');do('set_source_rgb',*[int(h[i:i+2],16)/255 for i in(0,2,4)])
def text(x,y,t,size=18,col='#21343b'):
 color(col);do('select_font_face',b'Sans',0,0);do('set_font_size',size);do('move_to',x,y);do('show_text',t.encode())
def line(points,col,width):
 if not points:return
 color(col);do('set_line_width',width);do('move_to',*points[0]);[do('line_to',*p)for p in points[1:]];do('stroke')
def poly(points,col):
 color(col);do('move_to',*points[0]);[do('line_to',*p)for p in points[1:]];do('close_path');do('fill')
def circle(x,y,r,col):color(col);do('arc',x,y,r,0,math.tau);do('fill')
color('#f8f8f2');do('paint')
text(45,48,'Utekatternas faktiska utflykter · #1844',28)
text(45,80,'Testillustration från sparade modellpositioner i appen – ingen ny produktvy.',16)
X0,Z0,SCALE=80,120,1.7
point=lambda x,z:(X0+(x+290)*SCALE,Z0+(z+405)*SCALE)
do('save');do('rectangle',65,105,575,1000);do('clip');color('#e6ead7');do('paint')
for b in site['buildings']:
 poly([point(*p)for p in b['polygon']],'#8aa36e'if'Nordic'in b['name']else'#b8b0a4')
for r in site['roads']:line([point(*p)for p in r['path']],'#878d8b',r['width']*SCALE)
line([point(*p)for p in site['river']],'#8fbeca',9*SCALE)
traces=[(data['nordicTravel']['trace'],'#18a7c6'),(data['roofTravel']['trace'],'#edb421')]
for records,col in traces:
 points=[point(r['p'][0],r['p'][2])for r in records];line(points,'#26383d',7);line(points,col,3.5)
do('restore')
for xy,label in[((-155,-375),'Nordic: baksidan'),((-25,18),'Kv. Lunden'),((-140,145),'Åparken')]:
 x,y=point(*xy);circle(x,y,5,'#26383d');text(x+10,y-8,label,15)
text(690,145,'Verklig appresa',23)
for y,t in [(185,'Findus · blå linje'),(217,'1 652,53 m förflyttning'),(249,'397,94 m nord–syd'),(281,'3 044 sparade positioner'),(335,'Sotis · gul linje'),(367,'201 sparade positioner'),(399,'Upp på entrétaket och ner igen'),(455,'Styrd väggklocka och kamera.'),(485,'Stilla vila kan hoppas över'),(515,'när katten är utanför kameran.'),(570,'Linjerna kommer från modellens'),(600,'faktiska positioner i appen.'),(630,'Byggnader och vägar är'),(660,'förenklade source-konturer.')]:text(690,y,t,18)
# Enlarged local trace: same real positions, not a designed patrol polygon.
text(690,730,'Förstorad takutflykt · Hus A',21)
do('save');do('rectangle',685,750,370,265);do('clip');color('#e6ead7');do('paint')
inset=lambda x,z:(700+(x+43)*6.0,780+(z-15)*7)
for b in site['buildings']:poly([inset(*p)for p in b['polygon']],'#b8b0a4')
points=[inset(r['p'][0],r['p'][2])for r in data['roofTravel']['trace']];line(points,'#26383d',8);line(points,'#edb421',4)
x,y=inset(.75,28.48);circle(x,y,6,'#d89800');do('restore')
text(705,1045,'Entrétak: y = 2,99 m',17)
line([(80,1160),(250,1160)],'#21343b',3);line([(80,1154),(80,1166)],'#21343b',3);line([(250,1154),(250,1166)],'#21343b',3);text(125,1190,'100 m',16)
text(45,1220,'Underlag: browser.json + map-source.json · kartan gjord offline med Cairo.',14)
status=bind('surface_write_to_png',[P,S],I)(surface,str(out/'actual-travel-map.png').encode());assert status==0,status
bind('destroy',[P])(ctx);bind('surface_destroy',[P])(surface)
print(out/'actual-travel-map.png')
