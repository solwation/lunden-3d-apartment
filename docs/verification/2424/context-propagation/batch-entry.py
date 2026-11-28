"""Root integration: independent CPU context smoke and corrected car capture, one editor start."""
import datetime
import importlib.util
import json
from pathlib import Path
import sys
import traceback

STATE = Path('/home/devcontainers/.local/state/lunden-codex-20261127')
OUT = STATE / 'batch-context-car-v1-result.json'
KEEP = []

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    KEEP.append(module)
    spec.loader.exec_module(module)
    return module

def main():
    if OUT.exists():
        raise RuntimeError('Fresh batch result required')
    result = {'completed': False, 'passed': False, 'entries': [],
              'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'scope': 'CPU-only BP/MPC smoke followed by car images; actual process uses render RHI for car, not NullRHI'}
    def write():
        OUT.write_text(json.dumps(result, indent=2)+'\n')
    write()
    try:
        context = STATE / '2424/live-context-smoke-v1'
        load('root2424_context_batch', context/'smoke.py').main(context/'native-v1/config.json')
        result['entries'].append({'issue': 2424, 'entryCompleted': True,
                                  'result': str(context/'native-v1/product/result.json')})
        write()
        car = STATE / '2405/ao-isolation-v2'
        load('root2405_car_batch', car/'capture.py').main(['--config', str(car/'config-native-v2.json')])
        result['entries'].append({'issue': 2405, 'entryCompleted': True,
                                  'result': str(car/'native/capture.json')})
        result.update(completed=True, passed=True)
    except BaseException:
        result['error'] = traceback.format_exc()
        raise
    finally:
        result['endedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        write()

if __name__ == '__main__':
    main()
