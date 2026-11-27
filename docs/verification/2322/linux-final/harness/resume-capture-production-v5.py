"""Private #2322: byte-proven successful-prefix resume, strict 247 authored guards,
source/PBR/controller tests and original day/evening/upper captures in one RHI.
Root pins source/export and owns the only launch. No existing proof overwritten.
"""
import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import time
import traceback
import types
import unreal as u

parser = argparse.ArgumentParser(description='Private #2322 one-RHI full canonical sync + PBR/fade tests + three views')
for field in ('expected-source', 'expected-export-source', 'expected-export-hash', 'expected-manifest-sha'):
    parser.add_argument('--'+field, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args(sys.argv[1:])
STATE = args.out.resolve()
PRIVATE = Path('/home/devcontainers/.local/state/lunden-codex-20261127/2322-final')
if not STATE.is_relative_to(PRIVATE) or STATE == PRIVATE or STATE.exists():
    raise RuntimeError('Output must be a fresh private S/2322-final child')
EXPECTED_SOURCE = args.expected_source
EXPECTED_EXPORT_SOURCE = args.expected_export_source
EXPECTED_EXPORT_HASH = args.expected_export_hash
EXPECTED_MANIFEST_SHA = args.expected_manifest_sha
BASELINE = PRIVATE.parent / '2394/native-baseline.json'
CLOSURE = PRIVATE / 'resume-final-closure.json'
PRIOR = PRIVATE / 'native-after-final'
PRIOR_SOURCE = 'ea2ea98c3dd24ae28679d472fb026ede452c2d69'
project = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())).resolve()
root = project.parents[1]
tools = root / 'tools/unreal-engine'
python_dir = tools / 'python'
content = project / 'Content'
GENERATED = '/Game/Lunden/Generated/'
prefix = 'unreal/Lunden/Content/Lunden/Lighting/'
OLD_WRITABLE = {prefix + name + '.uasset' for name in (
    'BP_LundenLamp', 'BP_LundenSky', 'MPC_LundenWeather', 'M_LundenClouds',
    'M_LundenNeutralTonemap', 'M_LundenPrecipitation', 'T_LundenHemisphere')}
NEW_WRITABLE = {prefix + 'M_LundenWindowDaylight.uasset'}
WRITABLE = OLD_WRITABLE | NEW_WRITABLE
DERIVED = ('build_l1007', 'build_exterior', 'build_site', 'build_lighting',
           'build_facade', 'build_vegetation', 'build_interaction',
           'build_curtains', 'build_cabinet_washes', 'build_rug_pool')
ZONES = {'l1007', 'l1007-uteplats', 'fixture', 'l1007-entre', 'hus-l',
         'kvarteret', 'gard', 'omgivning', 'vegetation', 'fond'}
records, guards, held_modules = [], [], []
metadata = {'harness': str(Path(__file__).resolve()), 'expectedSource': EXPECTED_SOURCE,
            'project': str(project), 'baseline': str(BASELINE),
            'historicallyChangedExistingLighting': sorted(OLD_WRITABLE),
            'historicallyCreatedLighting': sorted(NEW_WRITABLE),
            'canonicalDerivedOrder': list(DERIVED),
            'nativeLogErrorsCheckedBy': 'external run-python-linux runner; Python records exceptions only',
            'status': 'starting'}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def persist():
    for filename, value in (('sync-capture-steps.json', {'metadata': metadata, 'steps': records}),
                            ('sync-capture-guards.json', {'metadata': metadata, 'guards': guards})):
        target = STATE / filename
        target.write_text(json.dumps(value, indent=2) + '\n')
        target.chmod(0o700)


def authored_snapshot():
    return {p.relative_to(root).as_posix(): {'sha256': sha(p), 'mode': stat.S_IMODE(p.stat().st_mode)}
            for p in content.rglob('*') if p.suffix in ('.uasset', '.umap')
            and 'Generated' not in p.relative_to(content).parts}


def load_builder(name):
    if name in sys.modules:
        module = sys.modules[name]
        if Path(module.__file__).resolve() != (python_dir / (name + '.py')).resolve():
            raise RuntimeError('Builder imported from another checkout: ' + name)
        return module
    path = python_dir / (name + '.py')
    tree = ast.parse(path.read_text(), filename=str(path))
    removed, body = [], []
    for node in tree.body:
        if (isinstance(node, ast.Expr) and isinstance(node.value, ast.Call)
                and isinstance(node.value.func, ast.Name) and node.value.func.id in ('main', 'compose')):
            removed.append(node.lineno)
        else:
            body.append(node)
    tree.body = body
    module = types.ModuleType(name)
    module.__file__ = str(path)
    sys.modules[name] = module
    held_modules.append(module)  # keep Unreal wrapper/module globals alive until process exit
    exec(compile(tree, str(path), 'exec'), module.__dict__)
    metadata.setdefault('loadedBuilders', {})[name] = {'sha256': sha(path), 'omittedStandaloneCalls': removed}
    return module


def source_snapshot():
    paths = [*python_dir.glob('*.py'), tools / 'sync-import.ps1', tools / 'check-import.mjs',
             tools / 'check-export.mjs', tools / 'world-levels.json', tools / 'material-map.json']
    return {p.relative_to(root).as_posix(): sha(p) for p in sorted(paths)}


def guard(label, expected_authored=None):
    observed = authored_snapshot()
    changes = sorted(k for k in set(initial_authored) | set(observed)
                     if initial_authored.get(k) != observed.get(k))
    bad_original = sorted(k for k, value in baseline.items() if k not in WRITABLE
                          and observed.get(k, {}).get('sha256') != value)
    writable = sorted(k for k, value in observed.items() if value['mode'] & 0o222)
    source_changed = source_snapshot() != source_before
    export_changed = any(not (project / 'Import' / k).is_file() or sha(project / 'Import' / k) != v
                         for k, v in export_files.items())
    current_head = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    result = {'phase': label, 'protectedCurrentAuthoredCount': len(initial_authored),
              'protectedOriginalBaselineCount': len(baseline) - len(OLD_WRITABLE),
              'currentAuthoredChanged': changes, 'badOriginalProtectedBytes': bad_original,
              'writableAuthoredPackages': writable, 'sourceChanged': source_changed,
              'sourceHeadChanged': current_head != EXPECTED_SOURCE, 'exportChanged': export_changed}
    result['passed'] = not any((changes, bad_original, writable, source_changed,
                                current_head != EXPECTED_SOURCE, export_changed))
    guards.append(result)
    persist()
    if not result['passed']:
        raise RuntimeError('Incremental guard failed at ' + label + ': ' + json.dumps(result))
    return observed


def step(name, operation):
    start = time.monotonic()
    record = {'step': name, 'passed': False}
    records.append(record)
    before = None
    try:
        before = guard(name + ':before', None)
        u.log('LUNDEN_2322_SYNC_START ' + name)
        result = operation()
        record['result'] = result
        guard(name + ':after', before)
        record['passed'] = True
    except BaseException as error:
        record['error'] = str(error)
        record['traceback'] = traceback.format_exc()
        # Run postflight even for a failed builder; retain both actual exceptions.
        try:
            guard(name + ':failed-postflight', before)
        except BaseException as guard_error:
            record['postflightError'] = str(guard_error)
        raise
    finally:
        record['seconds'] = round(time.monotonic() - start, 3)
        persist()
    u.log('LUNDEN_2322_SYNC_DONE ' + name)


def invoke(name, args=None, entry='main'):
    module = load_builder(name)
    old_argv = sys.argv
    sys.argv = [module.__file__, *(args or [])]
    try:
        if entry == 'compose':
            module.compose(check_only=True)
        elif name in ('build_curtains', 'build_cabinet_washes', 'build_rug_pool'):
            module.main()
        else:
            getattr(module, entry)(args or [])
    finally:
        sys.argv = old_argv


def node(args):
    executable = shutil.which('node')
    if not executable:
        raise RuntimeError('Node executable missing; canonical export/release checks cannot run')
    command = [executable, *map(str, args)]
    result = subprocess.run(command, cwd=root, capture_output=True, text=True, timeout=180)
    detail = {'command': command, 'exitCode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}
    if result.returncode:
        raise RuntimeError('Canonical Node check failed: ' + json.dumps(detail))
    u.log(result.stdout)
    return detail


def existing_prerequisites():
    seasons = load_builder('build_seasons')
    vegetation = load_builder('build_vegetation')
    interaction = load_builder('build_interaction')
    seasons.main(['--check'])
    data = vegetation.read_vegetation(str(project / 'Import'))
    vegetation.materials(data['look'], check=True)
    interaction_tags = {}
    for path in (interaction.LISTENER, interaction.DOOR):
        asset = interaction.ASSETS.load_asset(path) if interaction.ASSETS.does_asset_exist(path) else None
        interaction_tags[path] = bool(asset and interaction.ASSETS.get_metadata_tag(asset, interaction.SPEC_TAG) == interaction.SPEC)
    if not all(interaction_tags.values()):
        raise RuntimeError('Existing interaction assets do not match source: ' + repr(interaction_tags))
    invoke('build_lighting', ['--check'])
    invoke('import_world', ['--check'])
    skip_checks = {}
    for name in ('build_l1007', 'build_exterior', 'build_site'):
        builder = load_builder(name)
        wanted = builder.inputs(builder.ground_list(str(project / 'Import'))) if name == 'build_site' else builder.inputs()
        if not builder.unchanged(wanted):
            raise RuntimeError('Refusing expensive unexpected incremental rebuild: ' + name)
        skip_checks[name] = 'actual unchanged(inputs) passed'
    metadata['majorDerivedSkipPreflight'] = skip_checks
    return {'seasons': 'canonical --check passed', 'vegetation': 'canonical materials(check=True) passed',
            'interaction': interaction_tags, 'lighting': 'canonical --check required before actual skip invocation'}


def nanite_check():
    nanite = sys.modules['prepare_nanite_materials']
    for zone in sorted(ZONES):
        nanite.prepare_zone(zone, check_only=True)
    return {'zones': sorted(ZONES), 'checkOnly': True}


try:
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    STATE.chmod(0o700)
    metadata['harnessSha256'] = sha(__file__)
    metadata['sourceCommit'] = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    if metadata['sourceCommit'] != EXPECTED_SOURCE:
        raise RuntimeError('Native source revision differs from approved checkpoint')
    changed_paths = set(filter(None, subprocess.check_output(
        ['git', '-C', str(root), 'diff', '--name-only', 'HEAD', '-z'], text=True).split('\0')))
    untracked_paths = set(filter(None, subprocess.check_output(
        ['git', '-C', str(root), 'ls-files', '--others', '--exclude-standard', '-z'], text=True).split('\0')))
    if (changed_paths | untracked_paths) - WRITABLE:
        raise RuntimeError('Unexpected dirty/untracked source outside the eight Lighting outputs: '
                           + repr(sorted((changed_paths | untracked_paths) - WRITABLE)))
    metadata['initialDirtyPaths'] = sorted(changed_paths | untracked_paths)
    baseline_doc = json.loads(BASELINE.read_text())
    if Path(baseline_doc['root']).resolve() != root:
        raise RuntimeError('Baseline belongs to another native checkout')
    baseline = baseline_doc['protected']
    if len(baseline) != 246 or not OLD_WRITABLE <= set(baseline) or NEW_WRITABLE & set(baseline):
        raise RuntimeError('Expected exact 246-package baseline with seven existing Lighting outputs')
    initial_authored = authored_snapshot()
    expected_packages = set(baseline) | NEW_WRITABLE
    if set(initial_authored) != expected_packages or len(initial_authored) != 247:
        raise RuntimeError('Expected exact current 247 authored packages, with new window material')
    initial_bad = sorted(k for k, value in baseline.items() if k not in WRITABLE
                         and initial_authored.get(k, {}).get('sha256') != value)
    if initial_bad:
        raise RuntimeError('Original protected239 changed outside authorized Lighting outputs: ' + repr(initial_bad))
    writable = sorted(k for k, value in initial_authored.items() if value['mode'] & 0o222)
    if writable:
        raise RuntimeError('All247 current authored packages must already be read-only: ' + repr(writable))
    manifest_path = project / 'Import/export-manifest.json'
    manifest = json.loads(manifest_path.read_text())
    if (manifest.get('sourceCommit') != EXPECTED_EXPORT_SOURCE or manifest.get('sourceDirty')
            or manifest.get('sourceHash') != EXPECTED_EXPORT_HASH or sha(manifest_path) != EXPECTED_MANIFEST_SHA):
        raise RuntimeError('Export differs from explicitly pinned clean full manifest/source binding')
    if {row['zone'] for row in manifest['files'] if row['kind'] == 'glb'} != ZONES:
        raise RuntimeError('Incremental full sync requires all ten canonical zones')
    export_files = {row['path']: row['sha256'] for row in manifest['files']}
    export_files['export-manifest.json'] = sha(manifest_path)
    source_before = source_snapshot()
    metadata['currentAuthoredSnapshot'] = initial_authored
    metadata['allCurrentAuthoredMustRemainExact'] = True
    metadata['exportSourceCommit'] = EXPECTED_EXPORT_SOURCE
    metadata.update({'sourceFileSha256': source_before, 'baselineSha256': sha(BASELINE),
                     'exportManifestSha256': sha(manifest_path), 'exportSourceHash': manifest['sourceHash'],
                     'exportResolvedPath': str((project / 'Import').resolve()), 'status': 'running'})
    sys.path.insert(0, str(python_dir))
    import prepare_nanite_materials as nanite

    class MaterialWriteGuard:
        def __getattr__(self, name):
            original = getattr(u.MaterialEditingLibrary, name)
            if name not in ('set_material_usage_override', 'set_base_material_usage'):
                return original
            def guarded(asset, *args, **kwargs):
                if not asset.get_path_name().startswith(GENERATED):
                    raise RuntimeError('Refusing Nanite mutation outside Generated: ' + asset.get_path_name())
                return original(asset, *args, **kwargs)
            return guarded

    nanite.materials = MaterialWriteGuard()
    original_nanite_save = nanite.save

    def generated_only_save(asset):
        if not asset.get_path_name().startswith(GENERATED):
            raise RuntimeError('Refusing Nanite save outside Generated: ' + asset.get_path_name())
        return original_nanite_save(asset)

    nanite.save = generated_only_save
    def verify_prior_closure():
        closure = json.loads(CLOSURE.read_text())
        if Path(closure['root']).resolve() != root or closure['native3Source'] != PRIOR_SOURCE:
            raise RuntimeError('Wrong stopped prior V4 closure/source')
        for path, wanted in closure['priorProofSha256'].items():
            if sha(path) != wanted:
                raise RuntimeError('Previous actual proof changed: '+path)
        previous = json.loads((PRIOR/'sync-capture-steps.json').read_text())
        prior_guards = json.loads((PRIOR/'sync-capture-guards.json').read_text())
        native_result = json.loads(Path(closure['native3Result']).read_text())
        if not (native_result.get('completed') and native_result.get('passed')
                and native_result.get('exitCode') == 0 and native_result.get('revision') == PRIOR_SOURCE):
            raise RuntimeError('Previous V4 actual process was not successful at pinned source')
        if previous['metadata']['sourceCommit'] != PRIOR_SOURCE:
            raise RuntimeError('Unexpected previous actual source')
        actual_previous = ['preflight-reuse-stopped-prefix','build_curtains','build_cabinet_washes','build_rug_pool',
            'compose-check','import-check','nanite-usage-check','sync-stamp','release-gate',
            'native-source-PBR-pool-contract','three-views-and-fade-controls']
        if ([r['step'] for r in previous['steps']] != actual_previous
                or not all(r.get('passed') for r in previous['steps'])
                or not prior_guards['guards'] or not all(r.get('passed') for r in prior_guards['guards'])):
            raise RuntimeError('Previous actual V4 execution/guards incomplete')
        prior_steps = ['export','preflight-existing','seasons','import',*DERIVED[:7]]
        rows = previous['metadata']['reusedSteps']
        if [r['step'] for r in rows] != prior_steps or not all(r.get('passed') for r in rows):
            raise RuntimeError('Previous bound actual canonical prefix differs')
        if previous['metadata']['reusedCanonicalSteps'] != [r['step'] for r in rows if r['step']!='preflight-existing']:
            raise RuntimeError('Previous actual prefix metadata mismatch')
        changes = sorted(k for k in set(source_before)|set(previous['metadata']['sourceFileSha256'])
                         if source_before.get(k)!=previous['metadata']['sourceFileSha256'].get(k))
        allowed = ['tools/unreal-engine/python/'+name+'.py' for name in
                   ('build_cabinet_washes',)]
        if changes != allowed:
            raise RuntimeError('Cannot reuse unaffected dependency prefix after source delta: '+repr(changes))
        if initial_authored != closure['authored'] or initial_authored != previous['metadata']['currentAuthoredSnapshot']:
            raise RuntimeError('Current247 differ from stopped V4 checkpoint/guards')
        for key in ('exportManifestSha256','exportSourceHash'):
            if metadata[key] != previous['metadata'][key]:
                raise RuntimeError('Export differs from previous actual successful prefix')
        directory = Path(closure['generated'])
        if directory.resolve() != (content/'Lunden/Generated').resolve():
            raise RuntimeError('Wrong Generated closure path')
        observed = {p.relative_to(directory).as_posix():{'sha256':sha(p),'size':p.stat().st_size,
                    'mtimeNs':p.stat().st_mtime_ns} for p in directory.rglob('*') if p.is_file()}
        if observed != closure['files'] or any(v['mtimeNs'] > closure['native3CompletionMtimeNs'] for v in observed.values()):
            raise RuntimeError('V4 stopped Generated closure changed or newer asset write found')
        reused = rows + [previous['steps'][1]]  # actual V4 curtains plus bound unchanged older prefix.
        metadata.update({'mode':'bounded resume from successful V4 actual prefix',
            'priorNativePass':True,'priorNativeSource':PRIOR_SOURCE,'priorOuterExit':143,
            'priorOuterInvocationCompleted':False,'reusedSteps':reused,
            'reusedCanonicalSteps':[r['step'] for r in reused if r['step']!='preflight-existing'],
            'reuseClosureSha256':sha(CLOSURE),'reuseGeneratedFileCount':len(observed),
            'allGeneratedMtimeAtOrBeforeNative3Completion':True,
            'reuseProofSha256':closure['priorProofSha256'],'sourceDeltaSinceReusedSteps':changes,
            'reusedPrefixSource':previous['metadata']['priorNativeSource'],
            'reusedPrefixBinding':'Actual V4 source EA/process0 proves curtains and previously bound older import/interactions; exact cabinet-only source delta invalidates cabinet and later steps, not this prefix. Visual acceptance is not reused.'})
        return {'provenActualPriorSteps':prior_steps+['build_curtains'],'GeneratedFilesByteExact':len(observed),
                'priorNativeResultPassed':True,'priorOuterExit':143,'sourceDelta':changes}

    step('preflight-reuse-stopped-prefix', verify_prior_closure)
    step('build_cabinet_washes', lambda: invoke('build_cabinet_washes'))
    step('build_rug_pool', lambda: invoke('build_rug_pool'))
    step('compose-check', lambda: invoke('compose_world', entry='compose'))
    step('import-check', lambda: invoke('import_world', ['--check']))
    step('nanite-usage-check', nanite_check)
    canonical_steps = ['export', 'seasons', 'import', *DERIVED, 'compose-check', 'import-check']
    required = ['preflight-reuse-stopped-prefix','build_cabinet_washes','build_rug_pool',
                'compose-check','import-check','nanite-usage-check']
    if [r['step'] for r in records] != required or not all(r.get('passed') for r in records):
        raise RuntimeError('Refusing fresh stamp before ALL actual remaining steps passed')
    actual_canonical = [r['step'] for r in records if r['step'] in canonical_steps]
    if metadata['reusedCanonicalSteps'] + actual_canonical != canonical_steps:
        raise RuntimeError('Actual pinned old/new execution union does not cover exact canonical sequence')
    guard('before-fresh-sync-stamp')
    step('sync-stamp', lambda: node([tools / 'check-import.mjs', '--write-sync-stamp', '--steps', ','.join(canonical_steps)]))
    step('release-gate', lambda: node([tools / 'check-import.mjs']))
    final_authored = guard('final', None)
    def native_contract():
        path = tools / 'tests/test_rug_floor_pool.py'
        tree = ast.parse(path.read_text(), filename=str(path))
        tree.body = [node for node in tree.body if not (isinstance(node, ast.Expr)
                     and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name)
                     and node.value.func.id == 'main')]
        module = types.ModuleType('lunden2322_native_contract')
        module.__file__ = str(path)
        sys.modules[module.__name__] = module
        held_modules.append(module)
        exec(compile(tree, str(path), 'exec'), module.__dict__)
        module.main()
        return {'path': str(path), 'sha256': sha(path), 'actualMainPassed': True}

    def captures():
        path = PRIVATE / 'probe-after-production-v2.py'
        module = types.ModuleType('lunden2322_after_capture')
        module.__file__ = str(path)
        sys.modules[module.__name__] = module
        held_modules.append(module)
        exec(compile(path.read_text(), str(path), 'exec'), module.__dict__)
        module.main(['--root', str(root), '--out', str(STATE / 'captures'), '--upper'])
        result = json.loads((STATE / 'captures/capture.json').read_text())
        if not result.get('completed') or len(result.get('shots', [])) != 3:
            raise RuntimeError('All three actual original poses did not complete')
        return {'harness': str(path), 'sha256': sha(path), 'completed': True,
                'shots': [row['id'] for row in result['shots']]}

    step('native-source-PBR-pool-contract', native_contract)
    step('three-views-and-fade-controls', captures)
    guard('after-captures')
    metadata['currentAuthoredUnchangedCount'] = len(initial_authored)
    metadata['originalProtectedBaselineUnchangedCount'] = len(baseline) - len(OLD_WRITABLE)
    metadata['status'] = 'python-steps-passed-native-process-exit-and-log-review-pending'
    persist()
    u.log('LUNDEN_2322_SYNC_CAPTURE_OK')
except BaseException as error:
    metadata.update({'status': 'failed', 'error': str(error), 'traceback': traceback.format_exc()})
    persist()
    raise
