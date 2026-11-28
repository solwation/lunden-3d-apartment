"""Offline only. Root runs after prior editor has exited; this never starts Unreal."""
import argparse,hashlib,json,pathlib,stat,subprocess
S=pathlib.Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def files(base):return {p.relative_to(base).as_posix():sha(p) for p in sorted(base.rglob('*')) if p.is_file()}
def main():
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ('root','source-root','out'):p.add_argument('--'+arg,type=pathlib.Path,required=True)
    for arg in ('expected-native-head','expected-source-head','fixture-name'):p.add_argument('--'+arg,required=True)
    p.add_argument('--authored-count',type=int,default=250)
    a=p.parse_args();root,source,out=a.root.resolve(),a.source_root.resolve(),a.out.resolve()
    if out.exists() or not out.is_relative_to(S) or out==S:raise RuntimeError('Fresh output under live-context-smoke-v1 required')
    if not a.fixture_name.isidentifier():raise RuntimeError('Unique identifier fixture-name required')
    for base,head in ((root,a.expected_native_head),(source,a.expected_source_head)):
        if subprocess.check_output(['git','rev-parse','HEAD'],cwd=base,text=True).strip()!=head:raise RuntimeError('HEAD mismatch '+str(base))
        if subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=base,text=True).strip():raise RuntimeError('Tracked source changes present')
    prefix='/Game/Lunden/Generated/SourceAmbientContextSmoke/'+a.fixture_name
    if (root/'unreal/Lunden/Content/Lunden/Generated/SourceAmbientContextSmoke'/a.fixture_name).exists():raise RuntimeError('Scratch prefix already saved')
    packages={q.relative_to(root).as_posix():{'sha256':sha(q),'mode':stat.S_IMODE(q.stat().st_mode)} for q in (root/'unreal/Lunden/Content').rglob('*') if q.suffix in ('.uasset','.umap') and 'Generated' not in q.relative_to(root).parts}
    if len(packages)!=a.authored_count or any(v['mode']&0o222 for v in packages.values()):raise RuntimeError('Authored count/read-only failure')
    native_py=root/'tools/unreal-engine/python';candidate_py=source/'tools/unreal-engine/python'
    # Candidate imports source_ambient from Native's proven helper context: require exact parity.
    if sha(native_py/'source_ambient.py')!=sha(candidate_py/'source_ambient.py'):raise RuntimeError('Native/candidate source oracle mismatch')
    for base in (root,source):
        if json.loads((base/'tools/unreal-engine/source-ambient-policy.json').read_text())['enabled'] is not False:raise RuntimeError('Require both policies OFF')
    data=json.loads((root/'unreal/Lunden/Import/measurements.json').read_text())
    if not data.get('site',{}).get('sourceAmbient'):raise RuntimeError('Actual exported contract missing')
    paths=[q for q in sorted((root/'tools/unreal-engine').rglob('*')) if q.is_file() and q.suffix in ('.py','.json')]
    paths += [candidate_py/'build_source_ambient.py',candidate_py/'source_ambient.py',source/'tools/unreal-engine/source-ambient-policy.json',S/'smoke.py',pathlib.Path(__file__)]
    c={'root':str(root),'sourceRoot':str(source),'head':a.expected_native_head,'sourceHead':a.expected_source_head,'out':str(out/'product'),'fixturePrefix':prefix,'authored':packages,'generated':files(root/'unreal/Lunden/Content/Lunden/Generated'),'exportFiles':files(root/'unreal/Lunden/Import'),'dependenciesSHA256':{str(q):sha(q) for q in paths},'scope':'Unsaved private CPU BP/MPC propagation only, not caller/global/GPU acceptance','nativeLaunch':'Root-only NullRHI run-linux.py with Python child smoke.py and LUNDEN_2424_CONTEXT_CONFIG=config.json; cap300s; no RenderOffscreen needed'}
    out.mkdir();cp=out/'config.json';cp.write_text(json.dumps(c,indent=2)+'\n');print('OFFLINE_PREFLIGHT_PASS',sha(cp));print('LUNDEN_2424_CONTEXT_CONFIG='+str(cp))
if __name__=='__main__':main()
