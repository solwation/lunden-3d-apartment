"""Root-only private EXR atlas import and exact native sampled HALF proof; caller owns renderworld/frozenfile guards.
run(world, glass_module, source_export, folder, out) -> (Texture2D, proof).
Only saves fresh folder/T_SourceGlassAtlas; all proof materials/RTs remain unsaved.
No launch/worldload/global policy/MPC/source mutation.
"""
from pathlib import Path
import hashlib,json,struct,math,time
import unreal as u
KEEP=[]
def write(p,d):Path(p).write_text(json.dumps(d,indent=2,allow_nan=False)+'\n')
def run(world,glass,source_export,folder,out):
 out=Path(out);out.mkdir(parents=True,exist_ok=True)
 if not folder.startswith('/Game/Lunden/Generated/Private2388')or not out.resolve().is_relative_to(Path('/home/devcontainers/.local/state/lunden-codex-20261127/2388')):raise RuntimeError('Unique private2388 output required')
 path=folder+'/T_SourceGlassAtlas'
 if u.EditorAssetLibrary.does_asset_exist(path):raise RuntimeError('Fresh atlas path required; never replace previous evidence')
 raw=glass.half_atlas(source_export);exr=out/'source-atlas.exr';exr.write_bytes(glass.half_exr(raw))
 report={'nativeRGBA16FTexelsExact':False,'sourceRawHalfSHA256':hashlib.sha256(raw).hexdigest(),'sourceEXRSHA256':hashlib.sha256(exr.read_bytes()).hexdigest(),'method':'Exact integer Texture2D.Load half bits at336x256 texels, separateRGB/Alpha-as-R passes; bypass sampler interpolation, no8bit/tone/gamma proof','nativeTexturePath':None,'mismatches':[]}
 write(out/'atlas-proof.json',report)
 task=u.AssetImportTask();task.set_editor_property('filename',str(exr));task.set_editor_property('destination_path',folder);task.set_editor_property('destination_name','T_SourceGlassAtlas');task.set_editor_property('automated',True);task.set_editor_property('replace_existing',False);task.set_editor_property('save',False)
 u.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task]);atlas=u.EditorAssetLibrary.load_asset(path)
 if not isinstance(atlas,u.Texture2D):raise RuntimeError('EXR did not import as actual Texture2D')
 for key,value in [('compression_settings',u.TextureCompressionSettings.TC_HDR),('srgb',False),('mip_gen_settings',u.TextureMipGenSettings.TMGS_NO_MIPMAPS),('filter',u.TextureFilter.TF_BILINEAR),('address_x',u.TextureAddress.TA_CLAMP),('address_y',u.TextureAddress.TA_CLAMP)]:atlas.set_editor_property(key,value)
 u.SystemLibrary.execute_console_command(world,'Editor.AsyncTextureCompilationFinishAll')
 report['nativeTexturePath']=atlas.get_path_name();report['nativeProperties']={key:str(atlas.get_editor_property(key))for key in ('compression_settings','srgb','mip_gen_settings','filter','address_x','address_y')};report['nativeDimensions']=[atlas.blueprint_get_size_x(),atlas.blueprint_get_size_y()]
 write(out/'atlas-proof.json',report)
 if report['nativeDimensions']!=[336,256]:raise RuntimeError('Actual atlas dimensions differ')
 tools=u.AssetToolsHelpers.get_asset_tools();m=tools.create_asset('M_AtlasHalfProof',folder,u.Material,u.MaterialFactoryNew());KEEP.extend([atlas,m,task])
 if not isinstance(m,u.Material):raise RuntimeError('Cannot create unsaved atlas proof material')
 m.set_editor_property('shading_model',u.MaterialShadingModel.MSM_UNLIT);m.set_editor_property('blend_mode',u.BlendMode.BLEND_OPAQUE)
 mel=u.MaterialEditingLibrary
 tex=mel.create_material_expression(m,u.MaterialExpressionTextureObject,0,0);tex.set_editor_property('texture',atlas);tex.set_editor_property('sampler_type',u.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
 uv=mel.create_material_expression(m,u.MaterialExpressionTextureCoordinate,0,180)
 mode=mel.create_material_expression(m,u.MaterialExpressionScalarParameter,0,300);mode.set_editor_property('parameter_name','AlphaProof');mode.set_editor_property('default_value',0.0)
 custom=mel.create_material_expression(m,u.MaterialExpressionCustom,300,0);custom.set_editor_property('output_type',u.CustomMaterialOutputType.CMOT_FLOAT3);custom.set_editor_property('code','int2 xy=clamp(int2(floor(UV*float2(336,256))),int2(0,0),int2(335,255)); float4 t=Atlas.Load(int3(xy,0)); return AlphaProof < 0.5 ? t.rgb : t.aaa;')
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
 rt=u.RenderingLibrary.create_render_target2d(world,336,256,u.TextureRenderTargetFormat.RTF_RGBA16F);rt.set_editor_property('target_gamma',1.0);KEEP.extend([mid,rt,tex,uv,mode,custom])
 channels=[]
 for mode_value in (0.0,1.0):
  mid.set_scalar_parameter_value('AlphaProof',mode_value)
  if mid.get_scalar_parameter_value('AlphaProof')!=mode_value:raise RuntimeError('Actual atlas proof mode differs')
  u.AutomationLibrary.finish_loading_before_screenshot();u.RenderingLibrary.draw_material_to_render_target(world,rt,mid)
  # Exact SDK UFUNCTION bool+OutArray; retain actual shape instead of assuming tuple ordering.
  returned=u.RenderingLibrary.read_render_target_raw_pixel_area(world,rt,0,0,336,256,False)
  if isinstance(returned,tuple):
   arrays=[v for v in returned if not isinstance(v,bool)and hasattr(v,'__len__')and len(v)==336*256]
   flags=[v for v in returned if isinstance(v,bool)]
   if flags and not all(flags):raise RuntimeError('Native ReadRenderTargetRaw failed')
   if len(arrays)!=1:raise RuntimeError('Unexpected native ReadRenderTargetRaw output tuple')
   values=arrays[0]
  else:values=returned
  if not hasattr(values,'__len__')or len(values)!=336*256:raise RuntimeError('Full raw native atlas pixel count missing')
  channels.append([(float(v.r),float(v.g),float(v.b))for v in values])
  report.setdefault('passes',[]).append({'mode':mode_value,'actualReadPixels':len(values),'rawReturnType':type(returned).__name__});write(out/'atlas-proof.json',report)
 actual=bytearray();bad=[]
 for i,(rgb,alpha)in enumerate(zip(*channels)):
  actual_values=(*rgb,alpha[0])
  if not all(math.isfinite(v)for v in actual_values):raise RuntimeError('Nonfinite native atlas sample')
  bits=b''.join(struct.pack('<e',v)for v in actual_values);expected=raw[i*8:i*8+8];actual.extend(bits)
  if bits!=expected and len(bad)<32:bad.append({'index':i,'x':i%336,'y':i//336,'nativeValues':actual_values,'nativeHalfHex':bits.hex(),'sourceHalfHex':expected.hex()})
 (out/'native-loaded.rgba16f').write_bytes(actual)
 report['mismatchCount']=sum(actual[i:i+8]!=raw[i:i+8]for i in range(0,len(raw),8));report['mismatches']=bad;report['nativeSampledHalfSHA256']=hashlib.sha256(actual).hexdigest();report['nativeRGBA16FTexelsExact']=bytes(actual)==raw
 write(out/'atlas-proof.json',report)
 if not report['nativeRGBA16FTexelsExact']:raise RuntimeError('Native sampled HALF atlas differs; candidate attachment forbidden')
 # Finite owned Generated write: exactly the imported atlas, never the proof graph or RT.
 if not u.EditorAssetLibrary.save_loaded_asset(atlas,only_if_is_dirty=False):raise RuntimeError('Could not save owned verified atlas')
 return atlas,report
