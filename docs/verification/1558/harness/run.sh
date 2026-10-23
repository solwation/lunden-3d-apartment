#!/bin/bash
# run.sh <name> <extra query> [profile-suffix]
# H1558_DIR: Windows path (\\wsl.localhost\...) of a directory holding cdp.mjs and the job; WIN_TEMP: a Windows temp directory.
W="${H1558_DIR:?set H1558_DIR}"
exec timeout 1200 "/mnt/c/Program Files/nodejs/node.exe" "$W\\cdp.mjs" "http://localhost:8358/index.html?cloud=&life&perf&quality=3&time=12&month=7&day=1&freeze&weather=clear&mess=0&at=3.5,3,0,0$2" "$W\\${JOB:-route.js}" "$W\\$1.json" "${WIN_TEMP:?set WIN_TEMP}\\lunden1558-$1" "${WW:-1363}" "${HH:-849}"
