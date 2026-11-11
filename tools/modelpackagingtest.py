#!/usr/bin/env python3
"""Exercise the real stamp pipeline in an isolated source fixture; keep BASE_OUT for browser loader tests."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1]).resolve()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
with tempfile.TemporaryDirectory(prefix='lunden-model-package-') as temp:
    source = Path(temp) / 'source'
    source.mkdir()
    for name in ['index.html', 'manifest.webmanifest', 'icons', 'src', 'data', 'textures', 'music', 'models', 'L1007_mattsatt_planritning.pdf', 'README.md']:
        p = root / name
        if p.is_dir(): shutil.copytree(p, source / name)
        else: shutil.copy2(p, source / name)
    (source / '.git').symlink_to(root / '.git', target_is_directory=True)
    (source / 'tools').mkdir()
    for name in ['stamp.sh', 'changelog_stamp.py']:
        shutil.copy2(root / 'tools' / name, source / 'tools' / name)
    # The optional fridge issue feed is outside CONTENT and unrelated to model delivery.
    (source / 'tools/todo.py').write_text("import pathlib,sys; pathlib.Path(sys.argv[1]).write_text('[]')\n")
    def build(dest, version):
        subprocess.run(['sh', 'tools/stamp.sh', str(dest), version], cwd=source, check=True)
        return json.loads((dest / 'version.json').read_text())
    base = build(out, '1913-local')
    models = sorted((root / 'models').glob('*.glb'))
    assert len(models) == 12
    hashes = {}
    for p in models:
        assert p.read_bytes() == (out / 'models' / p.name).read_bytes(), p.name
        hashes[p.name] = {'bytes': p.stat().st_size, 'sha256': sha(p)}
    assert not (out / 'tools').exists()
    assert '?v=1913-local' in (out / 'src/cat.js').read_text()
    assert "BUILD = '1913-local'" in (out / 'src/version.js').read_text()
    # Different build and documentation must keep CONTENT stable.
    (source / 'docs').mkdir()
    (source / 'docs/only.md').write_text('documentation only')
    with (source / 'models/ATTRIBUTION.md').open('a') as f: f.write('\nDocumentation-only edit.\n')
    with (source / 'README.md').open('a') as f: f.write('\nDocumentation-only edit.\n')
    changed = Path(temp) / 'changed'
    docs = build(changed, '1913-docs')
    assert docs['content'] == base['content'], (base, docs)
    # A GLB byte mutation must change CONTENT and the packaged bytes.
    model = source / 'models' / models[0].name
    with model.open('ab') as f: f.write(b'model-byte-change')
    asset = build(changed, '1913-model')
    assert asset['content'] != base['content'], (base, asset)
    assert (changed / 'models' / model.name).read_bytes() == model.read_bytes()
    result = {'version': base, 'models': hashes, 'docsOnlyContent': docs['content'], 'mutatedModelContent': asset['content'], 'optionalTodoFeed': 'isolated, outside content hash'}
    (out.parent / 'model-package.json').write_text(json.dumps(result, indent=2) + '\n')
    print('PASS: all 12 exact model bytes; model mutation changes CONTENT; docs/build-only changes keep CONTENT; tools excluded.')
