# Gameplay-key extraction repair (#2251)

Base `09c8b39b` (full SHA in [source-results.json](source-results.json)).
Only test helpers/consumers and verification docs change. No `src/`, `data/`,
CI, gameplay, player news or assertion/tolerance changes.

`mainKeys(source)` moves the existing #2222 implementation from bicycletest
into `tools/mainfixture.cjs`. The three tests now share its unique gameplay-gate
lookup, nearest enclosing keydown-listener start and following blur boundary.
Statements before the gate, including reaction-camera handling, remain verbatim.
The original old fixed prefix has no match on this base, reproducing the cause.
`statspaneltest --before` retains its old historical extraction for `b2efbc5`;
that source does not have the modern gate and must not use the new helper.

## Checks and actual outcomes

- **5 PASS, 0 FAIL**, `node --test tools/mainfixturetest.cjs`, 53 ms.
  Actual main excerpt parses and includes the prefix/key-up handlers; unrelated
  listeners do not change it; newly prepended statements survive; absent or
  duplicated gates/listener/boundary fail closed. [Raw TAP](extraction-tests.txt).
- Exact byte equality with #2222's pre-edit output, exact equality and syntax
  of the historical `--before` branch, and current statspanel branch equality
  passed. All three consumers' execution/assertion tails from `let failures=0`
  onward are byte-identical to the base. [Parity hashes](extraction-parity.json).
  `node --check` passed for mainfixture and all three edited consumer files.
- **statspaneltest: exit 1, zero completed assertions.** Its actual native
  browser command passed extraction but raised `updateAppMenu is not defined`
  in the original startMouse excerpt; the pointer-lock wait then timed out
  after 5000 ms. [Unmodified raw log](statspanel.log).
- **courtyardbicycletest: exit 1, zero completed assertions.** Its actual native
  command passed extraction but initial focus setup raised
  `ReferenceError: roofPicnic is not defined`.
  [Unmodified raw log](courtyard.log), [fixture failure record](courtyard/failure.json).

Both browser commands were run once on own server 8454 via the shared wrapper,
without `--render`, followed to their actual exit 1, and stopped. Production and
test source remained frozen while they ran. Served main/helper hashes were checked
before starting and still match the final manifest. No browser rerun, historic
before-profile, long bicycletest profile or full apartment was run. The moved
bicycletest helper is covered by exact extraction parity rather than a duplicate
long profile. These are component fixtures, not whole-app or physical-device evidence.

The two newly exposed runtime failures have the same shared-fixture dependency
cause and are independently tracked in **[#2252](https://github.com/solwation/lunden-3d-apartment/issues/2252)**.
`startMouse` calls updateAppMenu from `e5c6c3f0a`/#1873; focus reads roofPicnic
from `a59138164`/#1858. The production definitions exist but the native excerpt
fixtures omit their bindings. No fix for those globals is included in #2251.
This delivery proves repaired extraction; **neither browser suite is green**.

## Images, applicability and handoff

Neither run reached its first assertion or normal screenshot, so there is no
meaningful result image. The changed handler-extraction logic is nonvisual;
raw runtime errors, syntax/parity contracts and source hashes are the evidence.
No additional image/render profile was started.

No public transfer: these harnesses test original gameplay/statistics and have
no consumer in the neutral downstream. Root conductor of
`orkester: olw-win10-gpt-6-20261120` owns integration/publication and closure;
the worker neither pushes nor closes. Preserve independently integrated shared
mainfixture defaults when applying this patch to a newer main.

Own browser processes exited and own server 8454 was stopped. Approximate phases:
reading/plan 2 min, implementation/contracts 1 min, browser commands under 1 min,
failure/source review and documentation 2 min. Stopped at the first out-of-scope
runtime failures as assigned, well before the 10-minute verification threshold.
