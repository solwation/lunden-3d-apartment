"""#2409 CPU checks of actual selector HLSL and actual reservation/foreign-user guard.

No Unreal/browser/export. Native compilation, real stencil/depth and the unchanged
bulb/pool/apartment gates remain required before product acceptance.
"""
import ast
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

PYTHON = Path(__file__).resolve().parents[1]/'python'
sys.path.insert(0,str(PYTHON))
import patio_tone as tone


class PatioTone(unittest.TestCase):
    def test_actual_hlsl_rejects_occlusion_and_composites_without_exposure(self):
        # Compile actual branch; emulate vector intrinsics with IEEE float32/16.
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp)
            code = r'''#include <array>
#include <cmath>
#include <cstring>
#include <iostream>
using std::round;
struct V {
 float r,g,b,a;
 V(float x=0,float y=0,float z=0,float w=1):r(x),g(y),b(z),a(w){}
};
using float3=V;
using uint=unsigned int;
V operator*(V v,float x) { return {v.r*x,v.g*x,v.b*x,v.a*x}; }
bool isfinite(V v) { return std::isfinite(v.r)&&std::isfinite(v.g)&&std::isfinite(v.b); }
bool all(bool b) { return b; }
std::array<unsigned short,3> f32tof16(V v) {
 std::array<unsigned short,3> bits;float values[]={v.r,v.g,v.b};
 for(int i=0;i<3;i++){ _Float16 half=(_Float16)values[i];std::memcpy(&bits[i],&half,2); }return bits;
}
// Exact 5.8.4 PackUnpack.ush254-268. Scalar half conversion is IEEE;
// the independent observed GPU tuple below catches wrong masks/rounding.
uint f32tof16(float x) { _Float16 h=(_Float16)x;unsigned short bits;std::memcpy(&bits,&h,2);return bits; }
float f16tof32(uint x) { unsigned short bits=(unsigned short)x;_Float16 h;std::memcpy(&h,&bits,2);return (float)h; }
uint PackR11G11B10F(float3 rgb)
{
 uint r = (f32tof16(rgb.r) << 17) & 0xFFE00000;
 uint g = (f32tof16(rgb.g) << 6) & 0x001FFC00;
 uint b = (f32tof16(rgb.b) >> 5) & 0x000003FF;
 return r | g | b;
}
float3 UnpackR11G11B10F(uint rgb)
{
 float r = f16tof32((rgb >> 17) & 0x7FF0);
 float g = f16tof32((rgb >> 6) & 0x7FF0);
 float b = f16tof32((rgb << 5) & 0x7FE0);
 return float3(r, g, b);
}
struct { float PreExposure; } View;
V selectSource(V Scene,V Neutral,V SceneDepth,V CustomDepth,V CustomStencil,V Expected) {
'''+tone.SELECT_HLSL.replace('.rgb','')+r'''}
int main() { float s0,s1,s2,e0,e1,e2,n,sd,cd,st,ex;
while(std::cin>>s0>>s1>>s2>>e0>>e1>>e2>>n>>sd>>cd>>st>>ex) {
 View.PreExposure=ex;
 V v=selectSource({s0,s1,s2,1},{n,n,n,1},{sd,0,0,0},{cd,0,0,0},{st,0,0,0},{e0,e1,e2,1});
 std::cout.precision(17);std::cout<<v.r<<" "<<v.g<<" "<<v.b<<"\n";
}}'''
            (folder/'selector.cpp').write_text(code)
            subprocess.run(['c++','-std=c++17',str(folder/'selector.cpp'),'-o',str(folder/'selector')],check=True,capture_output=True)
            f32=lambda v:struct.unpack('<f',struct.pack('<f',v))[0]
            half=lambda v:struct.unpack('<e',struct.pack('<e',v))[0]
            cases=[]
            for source in [(0,0,0),(.06,.0374,.0152),(1.46,.910982,.371062),(.3,.6,.9),(4,2,1)]:
                expected=tuple(map(f32,source))
                for pre in [.01,.17,.25613254,1,4]:
                    pre=f32(pre); stored=[half(f32(v*pre)) for v in expected]
                    clean=[f32(v*f32(1/pre)) for v in stored]
                    # Different already-tone-mapped inputs must not affect source bypass.
                    for neutral in [.001,.2,.9,4]:
                        neutral=f32(neutral)
                        def add(scene,sd,cd,st,ex,answer):
                            cases.append(([*scene,*expected,neutral,sd,cd,st,ex],answer))
                        add(clean,100,100,tone.STENCIL,pre,expected)
                        add(clean,100,101,tone.STENCIL,pre,(neutral,)*3)
                        add(clean,100,100,0,pre,(neutral,)*3)
                        add(clean,100,0,tone.STENCIL,pre,(neutral,)*3)
                        add(clean,100,100,tone.STENCIL,0,(neutral,)*3)
                        fog=[f32(.9*v+.1*other) for v,other in zip(clean,[.4,.5,.8])]
                        add(fog,100,100,tone.STENCIL,pre,(neutral,)*3)
                        # One real half-float storage step in one channel is rejected.
                        bits=struct.unpack('<H',struct.pack('<e',stored[0]))[0]
                        changed=struct.unpack('<e',struct.pack('<H',bits+1))[0]
                        mixed=[f32(changed*f32(1/pre)),*clean[1:]]
                        add(mixed,100,100,tone.STENCIL,pre,(neutral,)*3)
            # Actual original-view GPU readback: all15 frontmost samples had
            # this tuple and zero half-only matches. Keep it as measured rather
            # than deriving the answer using the selector's pack implementation.
            expected=tuple(map(f32,[1.460000038,.910982132,.371062040]))
            pre=f32(.1707550436258316)
            measured=list(map(f32,[1.4526474476,.9036152959,.3660213947]))
            actual_stored=[f32(v*pre)for v in measured]
            self.assertEqual(actual_stored,[.248046875,.154296875,.0625])
            half_clean=[f32(half(f32(v*pre))*f32(1/pre))for v in expected]
            for neutral in [.001,.2,.9,4]:
                neutral=f32(neutral)
                for clean in [measured,half_clean]:
                    add(clean,100,100,tone.STENCIL,pre,expected)
                    # Strong foreground transparency and fog still reject on
                    # either path. Depth and stencil alone are insufficient.
                    glass=[f32(v*.5)for v in clean]
                    fog=[f32(.8*v+.2*other)for v,other in zip(clean,[.4,.5,.8])]
                    add(glass,100,100,tone.STENCIL,pre,(neutral,)*3)
                    add(fog,100,100,tone.STENCIL,pre,(neutral,)*3)
                    add(clean,99,100,tone.STENCIL,pre,(neutral,)*3)
            # Known ambiguity: an RGBA16F composite with these exact retained
            # words is indistinguishable from source R11 without a format input.
            # Explicit acceptance documents the bounded union, not perfect
            # detection of every possible foreground composite.
            add(measured,100,100,tone.STENCIL,pre,expected)
            result=subprocess.run([str(folder/'selector')],input=''.join(' '.join(map(str,c[0]))+'\n' for c in cases),
                                  text=True,capture_output=True,check=True)
            for row,case in zip(result.stdout.splitlines(),cases,strict=True):
                self.assertEqual(tuple(map(float,row.split())),tuple(case[1]))

    def test_source_contract_rejects_missing_or_tone_mapped(self):
        self.assertEqual(tone.validate_source({'toneMapped':False}),{'toneMapped':False})
        for row in [{},{'toneMapped':True},{'toneMapped':0}]:
            with self.assertRaises(ValueError):tone.validate_source(row)

    def test_exact_ids_mid_opaque_reservation_and_curtain_foreign_guard(self):
        # Execute the actual collector + existing wallAO inventory, rather than
        # a second implementation of its permission decision.
        class Instance:pass
        class Master:
            def get_path_name(self):return tone.MASTER
            def get_editor_property(self,key):return 'unlit'
        class Dynamic(Instance):
            def __init__(self):self.blend='opaque';self.parent=Master()
            def get_editor_property(self,key):return self.parent
            def get_blend_mode(self):return self.blend
        class Component:
            def __init__(self,name,mid):
                self.name=name;self.mid=mid
                self.props={'render_custom_depth':True,'custom_depth_stencil_value':tone.STENCIL,
                            'render_in_main_pass':True,'render_in_depth_pass':True,'custom_depth_stencil_write_mask':'default'}
            def get_editor_property(self,key):return self.props[key]
            def get_path_name(self):return self.name
            def get_num_materials(self):return 1
            def get_material(self,index):return self.mid
        class Actor:
            def __init__(self,tags,c):self.tags=tags;self.c=c
            def get_component_by_class(self,cls):return self.c
            def get_components_by_class(self,cls):return [self.c]
        class Driver:
            def get_editor_property(self,key):return mid
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'Import').mkdir()
            nodes=[{'extras':{'id':v,'patioStringBulb':True}} for v in ['bulb-a','bulb-b']]
            b=json.dumps({'nodes':nodes}).encode();(root/'Import/l1007-uteplats.glb').write_bytes(
                struct.pack('<IIIII',0x46546c67,2,len(b)+20,len(b),0x4e4f534a)+b)
            mid=Dynamic();bulbs=[Actor([name,tone.TAG],Component(name,mid)) for name in ['bulb-a','bulb-b']]
            curtain=Actor(['lunden:wall-ao-cloth-depth'],Component('curtain',mid));actors=[*bulbs,curtain]
            fake=types.SimpleNamespace(MaterialInstance=Instance,MaterialInstanceDynamic=Dynamic,
                StaticMeshComponent=object,PrimitiveComponent=object,Actor=object,
                RendererStencilMask=types.SimpleNamespace(ERSM_DEFAULT='default'),
                MaterialShadingModel=types.SimpleNamespace(MSM_UNLIT='unlit'),BlendMode=types.SimpleNamespace(BLEND_OPAQUE='opaque'),
                Paths=types.SimpleNamespace(project_dir=lambda:str(root),convert_relative_path_to_full=lambda p:p),
                GameplayStatics=types.SimpleNamespace(get_all_actors_with_tag=lambda w,t:[Driver()] if t=='patio:string-driver' else bulbs,
                                                     get_all_actors_of_class=lambda w,c:actors))
            parsed=ast.parse((PYTHON/'wall_ao_depth.py').read_text())
            inventory=ast.Module(body=[next(n for n in parsed.body if isinstance(n,ast.FunctionDef) and n.name=='inventory')],type_ignores=[])
            env={'u':fake,'TAG':'lunden:wall-ao-cloth-depth'};exec(compile(inventory,'actual-wall-ao-inventory','exec'),env)
            with patch.dict(sys.modules,{'unreal':fake}):
                self.assertEqual(tone.depth_users(None),{'bulb-a','bulb-b'})
                self.assertEqual(env['inventory'](None),['curtain'])
                foreign=Actor(['unknown'],Component('foreign',mid));actors.append(foreign)
                with self.assertRaisesRegex(RuntimeError,'conflicts'):env['inventory'](None)
                actors.remove(foreign)
                mutations=[('render_in_main_pass',False),('render_in_depth_pass',False),('custom_depth_stencil_value',1),('custom_depth_stencil_write_mask','mask1')]
                for key,value in mutations:
                    old=bulbs[0].c.props[key];bulbs[0].c.props[key]=value
                    with self.assertRaises(RuntimeError):tone.depth_users(None)
                    bulbs[0].c.props[key]=old
                bulbs[0].c.mid=Dynamic()
                with self.assertRaises(RuntimeError):tone.depth_users(None)
                bulbs[0].c.mid=mid
                bulbs[0].tags[0]='foreign-id'
                with self.assertRaises(RuntimeError):tone.depth_users(None)
                bulbs[0].tags[0]='bulb-a';mid.blend='translucent'
                with self.assertRaises(RuntimeError):tone.depth_users(None)


if __name__=='__main__':unittest.main()
