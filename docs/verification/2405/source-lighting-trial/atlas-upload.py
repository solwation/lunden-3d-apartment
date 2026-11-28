"""Private car-atlas import/upload proof, no car material attachment.
run(world,source_export,raw_path,folder,out,*,expected_raw_sha256,save_verified=None).
Caller owns renderworld and all source/authored/Generated/import/restore guards.
Only save_verified=True permits saving the fresh private atlas AFTER exact786432-half proof.
All proof materials/RTs remain unsaved. No launch/world load/source/global policy mutation.
Native calls copied from actual successful #2388 import-prove-atlas-v3, parametrized dimensions.
"""
from pathlib import Path
import hashlib,json,struct,math,base64
import unreal as u
KEEP=[]
def validated_raw(source_export,raw_path,expected_raw_sha256):
 a=source_export['atlas'];expected={'width':384,'height':512,'format':'RGBA16F','colorSpace':'linear-srgb','byteOrder':'little-endian','mipmaps':False,'maxMip':7,'cubeSize':128}
 if any(a.get(k)!=v for k,v in expected.items()):raise ValueError('Actual r170 car CubeTexture384x512 linear HALF layout required')
 if source_export['generator']!={'revision':'170','method':'PMREMGenerator.fromCubemap(actual parked-car paint.envMap)'}:raise ValueError('Not actual source car-cube PMREM')
 if source_export['environment']['rotation']!=[0,0,0,'XYZ']:raise ValueError('Unsupported source environment rotation')
 raw=Path(raw_path).read_bytes();encoded=base64.b64decode(a['base64'],validate=True)
 if len(raw)!=384*512*8 or raw!=encoded or hashlib.sha256(raw).hexdigest()!=expected_raw_sha256:raise ValueError('Raw file, original payload and pinned SHA must agree')
 if any(v&0x7c00==0x7c00 for(v,)in struct.iter_unpack('<H',raw)):raise ValueError('Nonfinite source half component')
 return raw,a['width'],a['height']


def half_exr(raw,width=384,height=512):
    """Lossless uncompressed HALF EXR; source half bits and GL row order unchanged.
    EXR y0 becomes native textureV0. No source-RGB decode/encode, tonemap or gain.
    Actual native upload still requires independent exact texel/format readback.
    """
    if len(raw)!=width*height*8:raise ValueError('RGBA16F byte length')
    def attr(name,kind,data):return name.encode()+b'\0'+kind.encode()+b'\0'+struct.pack('<I',len(data))+data
    # OpenEXR scanline planes are alphabetical by channel name, independent of header insertion order.
    channels=b''.join(c+b'\0'+struct.pack('<iB3xii',1,0,1,1)for c in(b'A',b'B',b'G',b'R'))+b'\0'
    box=struct.pack('<iiii',0,0,width-1,height-1)
    header=struct.pack('<II',20000630,2)+attr('channels','chlist',channels)+attr('compression','compression',b'\0')+attr('dataWindow','box2i',box)+attr('displayWindow','box2i',box)+attr('lineOrder','lineOrder',b'\0')+attr('pixelAspectRatio','float',struct.pack('<f',1))+attr('screenWindowCenter','v2f',struct.pack('<ff',0,0))+attr('screenWindowWidth','float',struct.pack('<f',1))+b'\0'
    size=width*8;start=len(header)+height*8
    offsets=b''.join(struct.pack('<Q',start+y*(8+size))for y in range(height));blocks=[]
    for y in range(height):
        row=memoryview(raw)[y*size:(y+1)*size]
        planes=b''.join(b''.join(row[x*8+c*2:x*8+c*2+2]for x in range(width))for c in(3,2,1,0))
        blocks.append(struct.pack('<iI',y,size)+planes)
    return header+offsets+b''.join(blocks)

def write(p,d):Path(p).write_text(json.dumps(d,indent=2,allow_nan=False)+'\n')
def run(world,source_export,raw_path,folder,out,*,expected_raw_sha256,save_verified=None):
 if save_verified is not None and type(save_verified) is not bool:raise RuntimeError('save_verified must be explicit bool or None')
 out=Path(out);out.mkdir(parents=True,exist_ok=True)
 if not folder.startswith('/Game/Lunden/Generated/Private2405')or not out.resolve().is_relative_to(Path('/home/devcontainers/.local/state/lunden-codex-20261127/2405')):raise RuntimeError('Unique private2405 output required')
 path=folder+'/T_SourceCarAtlas'
 if u.EditorAssetLibrary.does_asset_exist(path):raise RuntimeError('Fresh atlas path required; never replace previous evidence')
 raw,width,height=validated_raw(source_export,raw_path,expected_raw_sha256);exr=out/'source-atlas.exr';exr.write_bytes(half_exr(raw,width,height))
 report={'nativeRGBA16FTexelsExact':False,'sourceRawHalfSHA256':hashlib.sha256(raw).hexdigest(),'sourceEXRSHA256':hashlib.sha256(exr.read_bytes()).hexdigest(),'method':'Exact integer Texture2D.Load half bits at384x512 texels, separateRGB/Alpha-as-R passes; bypass sampler interpolation, no8bit/tone/gamma proof','nativeTexturePath':None,'mismatches':[],'sourceDimensions':[width,height],'expectedHalfComponents':width*height*4,'saveRequested':save_verified is True,'nativeAtlasSaved':False}
 write(out/'atlas-proof.json',report)
 task=u.AssetImportTask();task.set_editor_property('filename',str(exr));task.set_editor_property('destination_path',folder);task.set_editor_property('destination_name','T_SourceCarAtlas');task.set_editor_property('automated',True);task.set_editor_property('replace_existing',False);task.set_editor_property('save',False)
 u.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task]);atlas=u.EditorAssetLibrary.load_asset(path)
 if not isinstance(atlas,u.Texture2D):raise RuntimeError('EXR did not import as actual Texture2D')
 for key,value in [('compression_settings',u.TextureCompressionSettings.TC_HDR),('srgb',False),('mip_gen_settings',u.TextureMipGenSettings.TMGS_NO_MIPMAPS),('filter',u.TextureFilter.TF_BILINEAR),('address_x',u.TextureAddress.TA_CLAMP),('address_y',u.TextureAddress.TA_CLAMP)]:atlas.set_editor_property(key,value)
 u.SystemLibrary.execute_console_command(world,'Editor.AsyncTextureCompilationFinishAll')
 report['nativeTexturePath']=atlas.get_path_name();report['nativeProperties']={key:str(atlas.get_editor_property(key))for key in ('compression_settings','srgb','mip_gen_settings','filter','address_x','address_y')};report['nativeDimensions']=[atlas.blueprint_get_size_x(),atlas.blueprint_get_size_y()]
 write(out/'atlas-proof.json',report)
 if report['nativeDimensions']!=[width,height]:raise RuntimeError('Actual atlas dimensions differ')
 tools=u.AssetToolsHelpers.get_asset_tools();m=tools.create_asset('M_AtlasHalfProof',folder,u.Material,u.MaterialFactoryNew());KEEP.extend([atlas,m,task])
 if not isinstance(m,u.Material):raise RuntimeError('Cannot create unsaved atlas proof material')
 m.set_editor_property('shading_model',u.MaterialShadingModel.MSM_UNLIT);m.set_editor_property('blend_mode',u.BlendMode.BLEND_OPAQUE)
 mel=u.MaterialEditingLibrary
 tex=mel.create_material_expression(m,u.MaterialExpressionTextureObject,0,0);tex.set_editor_property('texture',atlas);tex.set_editor_property('sampler_type',u.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
 uv=mel.create_material_expression(m,u.MaterialExpressionTextureCoordinate,0,180)
 mode=mel.create_material_expression(m,u.MaterialExpressionScalarParameter,0,300);mode.set_editor_property('parameter_name','AlphaProof');mode.set_editor_property('default_value',0.0)
 custom=mel.create_material_expression(m,u.MaterialExpressionCustom,300,0);custom.set_editor_property('output_type',u.CustomMaterialOutputType.CMOT_FLOAT3);custom.set_editor_property('code',f'int2 xy=clamp(int2(floor(UV*float2({width},{height}))),int2(0,0),int2({width-1},{height-1})); float4 t=Atlas.Load(int3(xy,0)); return AlphaProof < 0.5 ? t.rgb : t.aaa;')
 inputs=[]
 for name in ('Atlas','UV','AlphaProof'):
  f=u.CustomInput();f.set_editor_property('input_name',name);inputs.append(f)
 custom.set_editor_property('inputs',inputs)
 for name,node in [('Atlas',tex),('UV',uv),('AlphaProof',mode)]:
  if not mel.connect_material_expressions(node,'',custom,name):raise RuntimeError('Atlas proof connection failed '+name)
 if not mel.connect_material_property(custom,'',u.MaterialProperty.MP_EMISSIVE_COLOR):raise RuntimeError('Atlas proof output missing')
 report['compilerErrors']=list(map(str,mel.recompile_material(m)));write(out/'atlas-proof.json',report)
 if report['compilerErrors']:raise RuntimeError('Atlas proof material compilation failed')
 mid=u.MaterialLibrary.create_dynamic_material_instance(world,m)
 rt=u.RenderingLibrary.create_render_target2d(world,width,height,u.TextureRenderTargetFormat.RTF_RGBA16F);rt.set_editor_property('target_gamma',1.0);KEEP.extend([mid,rt,tex,uv,mode,custom])
 channels=[]
 for mode_value in (0.0,1.0):
  mid.set_scalar_parameter_value('AlphaProof',mode_value)
  if mid.get_scalar_parameter_value('AlphaProof')!=mode_value:raise RuntimeError('Actual atlas proof mode differs')
  u.AutomationLibrary.finish_loading_before_screenshot();u.RenderingLibrary.draw_material_to_render_target(world,rt,mid)
  # Exact SDK UFUNCTION bool+OutArray; retain actual shape instead of assuming tuple ordering.
  returned=u.RenderingLibrary.read_render_target_raw_pixel_area(world,rt,0,0,width,height,False)
  if isinstance(returned,tuple):
   arrays=[v for v in returned if not isinstance(v,bool)and hasattr(v,'__len__')and len(v)==width*height]
   flags=[v for v in returned if isinstance(v,bool)]
   if flags and not all(flags):raise RuntimeError('Native ReadRenderTargetRaw failed')
   if len(arrays)!=1:raise RuntimeError('Unexpected native ReadRenderTargetRaw output tuple')
   values=arrays[0]
  else:values=returned
  if not hasattr(values,'__len__')or len(values)!=width*height:raise RuntimeError('Full raw native atlas pixel count missing')
  channels.append([(float(v.r),float(v.g),float(v.b))for v in values])
  report.setdefault('passes',[]).append({'mode':mode_value,'actualReadPixels':len(values),'rawReturnType':type(returned).__name__});write(out/'atlas-proof.json',report)
 actual=bytearray();bad=[]
 for i,(rgb,alpha)in enumerate(zip(*channels)):
  actual_values=(*rgb,alpha[0])
  if not all(math.isfinite(v)for v in actual_values):raise RuntimeError('Nonfinite native atlas sample')
  bits=b''.join(struct.pack('<e',v)for v in actual_values);expected=raw[i*8:i*8+8];actual.extend(bits)
  if bits!=expected and len(bad)<32:bad.append({'index':i,'x':i%width,'y':i//width,'nativeValues':actual_values,'nativeHalfHex':bits.hex(),'sourceHalfHex':expected.hex()})
 (out/'native-loaded.rgba16f').write_bytes(actual)
 report['halfComponentMismatchCount']=sum(actual[i:i+2]!=raw[i:i+2]for i in range(0,len(raw),2));report['actualHalfComponents']=len(actual)//2
 report['mismatchCount']=sum(actual[i:i+8]!=raw[i:i+8]for i in range(0,len(raw),8));report['mismatches']=bad;report['nativeSampledHalfSHA256']=hashlib.sha256(actual).hexdigest();report['nativeRGBA16FTexelsExact']=bytes(actual)==raw
 write(out/'atlas-proof.json',report)
 if not report['nativeRGBA16FTexelsExact']:raise RuntimeError('Native sampled HALF atlas differs; candidate attachment forbidden')
 # Finite owned Generated write: exactly the imported atlas, never the proof graph or RT.
 if save_verified is True:
  if not u.EditorAssetLibrary.save_loaded_asset(atlas,only_if_is_dirty=False):raise RuntimeError('Could not save owned verified atlas')
  report['nativeAtlasSaved']=True
  write(out/'atlas-proof.json',report)
 return atlas,report
