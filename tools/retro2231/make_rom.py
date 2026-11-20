"""Own Fånga ljuset NES NROM proof, original code/art. MIT: see LICENSE.
No assembler/dependencies: explicit 6502 bytes, labels/relative fixups only.
RAM $00=x, $01=y, $02=score, $03=target x; $10..17=controller.
"""
from pathlib import Path
import struct
code=bytearray(); labels={}; fix=[]
def emit(*b): code.extend(b)
def label(n): labels[n]=0x8000+len(code)
def branch(op,n): emit(op,0); fix.append((len(code)-1,n,True))
def jump(n): emit(0x4c,0,0); fix.append((len(code)-2,n,False))
def lda(n): emit(0xa9,n)
def sta(a): emit(0x8d,a&255,a>>8)
def wait(n):
 label(n); emit(0x2c,2,0x20); branch(0x10,n)
label('reset'); emit(0x78,0xd8,0xa2,0xff,0x9a,0xe8,0x8e,0,0x20,0x8e,1,0x20)
wait('boot1'); wait('boot2')
lda(0); emit(0xa2,0)
label('clear'); emit(0x95,0,0xe8); branch(0xd0,'clear')
lda(255); emit(0xa2,0)
label('oam'); emit(0x9d,0,2,0xe8); branch(0xd0,'oam')
# Fill all nametables with blank CHR tile zero.
lda(0x20); sta(0x2006); lda(0); sta(0x2006); emit(0xa0,4,0xa2,0)
label('bg'); sta(0x2007); emit(0xe8); branch(0xd0,'bg'); emit(0x88); branch(0xd0,'bg')
# Sprite palettes, own square/diamond artwork.
lda(0x3f); sta(0x2006); lda(0x10); sta(0x2006)
for c in [0x0f,0x16,0x27,0x30,0x0f,0x28,0x27,0x30]: lda(c); sta(0x2007)
for addr,value in [(0,64),(1,120),(3,160),(0x201,1),(0x202,0),(0x205,2),(0x206,1),(0x204,120)]:
 lda(value); emit(0x85,addr) if addr<256 else sta(addr)
label('frame')
# Wait for a new vblank, not just the still-set previous one.
label('endblank'); emit(0x2c,2,0x20); branch(0x30,'endblank')
wait('vblank')
lda(1); sta(0x4016); lda(0); sta(0x4016); emit(0xa2,0)
label('buttons'); emit(0xad,0x16,0x40,0x29,1,0x95,0x10,0xe8,0xe0,8); branch(0xd0,'buttons')
for key,coord,op in [(4,1,0xc6),(5,1,0xe6),(6,0,0xc6),(7,0,0xe6)]:
 emit(0xa5,0x10+key); branch(0xf0,'skip'+str(key)); emit(op,coord); label('skip'+str(key))
# Exact contact: finite demo score, target wraps across row. No JS-scored game.
emit(0xa5,0,0xc5,3); branch(0xd0,'draw'); emit(0xa5,1,0xc9,120); branch(0xd0,'draw')
emit(0xe6,2,0xa5,3,0x18,0x69,32,0x85,3)
label('draw')
for zp,addr in [(0,0x203),(1,0x200),(3,0x207)]: emit(0xa5,zp); sta(addr)
lda(0); sta(0x2003); lda(2); sta(0x4014); lda(0); sta(0x2005); sta(0x2005); lda(0x14); sta(0x2001)
jump('frame')
label('interrupt'); emit(0x40)
for pos,n,relative in fix:
 target=labels[n]
 if relative:
  delta=target-(0x8000+pos+1); assert -128<=delta<=127; code[pos]=delta&255
 else: code[pos:pos+2]=struct.pack('<H',target)
prg=code+bytes([0xea])*(16384-len(code)); prg[-6:]=struct.pack('<HHH',labels['interrupt'],labels['reset'],labels['interrupt'])
chr=bytearray(8192); chr[16:24]=bytes([0x7e]*8); chr[32:40]=bytes([0x18,0x3c,0x7e,0xff,0xff,0x7e,0x3c,0x18])
rom=b'NES\x1a'+bytes([1,1])+bytes(10)+prg+chr
Path(__file__).with_name('lightcatch.nes').write_bytes(rom)
print(f'{len(rom)} bytes; {len(code)} bytes own 6502 code')
