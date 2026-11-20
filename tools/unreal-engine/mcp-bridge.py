#!/usr/bin/env python3
"""Lunden (#2243): stdio bridge from Claude Code in WSL to the Unreal editor's MCP server on Windows.

The editor's ModelContextProtocol server listens on Windows loopback only (127.0.0.1:8000, no authentication). In
WSL2's default NAT networking a WSL process cannot reach Windows loopback, and binding the server to another address
would expose it. This bridge keeps the server loopback-only: Claude Code starts it as a stdio MCP server, and every
JSON-RPC message is POSTed by the Windows curl.exe (WSL interop), which runs on the Windows side of the boundary.

  claude mcp add --scope local unreal-editor -- python3 <checkout>/tools/unreal-engine/mcp-bridge.py

Environment: LUNDEN_UNREAL_MCP_URL (default http://127.0.0.1:8000/mcp), LUNDEN_WINDOWS_CURL (default
/mnt/c/Windows/System32/curl.exe), LUNDEN_UNREAL_MCP_TIMEOUT seconds per request (default 600).
Limits: requests are forwarded one at a time, and server-initiated messages on the optional GET stream are not
relayed (the 5.8 server answers each POST directly). See docs/development/unreal.md "Claude Code and MCP".
"""
import json
import os
import subprocess
import sys

URL = os.environ.get("LUNDEN_UNREAL_MCP_URL", "http://127.0.0.1:8000/mcp")
CURL = os.environ.get("LUNDEN_WINDOWS_CURL", "/mnt/c/Windows/System32/curl.exe")
TIMEOUT = int(os.environ.get("LUNDEN_UNREAL_MCP_TIMEOUT", "600"))


def emit(message):
    sys.stdout.write(json.dumps(message, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def post(body, session, method="POST"):
    """Returns (status, headers dict with lower-case keys, body text)."""
    cmd = [CURL, "-s", "-i", "-m", str(TIMEOUT), "-X", method, URL,
           "-H", "Content-Type: application/json", "-H", "Accept: application/json, text/event-stream"]
    if session:
        cmd += ["-H", f"Mcp-Session-Id: {session}"]
    if body is not None:
        cmd += ["--data-binary", "@-"]
    run = subprocess.run(cmd, input=(body or "").encode("utf-8"), capture_output=True, timeout=TIMEOUT + 10)
    if run.returncode != 0:
        raise ConnectionError(f"curl.exe exit {run.returncode} for {URL} (is the editor running with "
                              f"ModelContextProtocol.StartServer?) {run.stderr.decode(errors='replace').strip()}")
    raw = run.stdout.decode("utf-8", errors="replace").replace("\r\n", "\n")
    head, _, text = raw.partition("\n\n")
    lines = head.split("\n")
    status = int(lines[0].split()[1]) if lines and len(lines[0].split()) > 1 else 0
    headers = {}
    for line in lines[1:]:
        key, sep, value = line.partition(":")
        if sep:
            headers[key.strip().lower()] = value.strip()
    return status, headers, text


def relay(text, headers):
    if not text.strip():
        return
    if "text/event-stream" in headers.get("content-type", ""):
        data = []
        for line in text.split("\n") + [""]:
            if line.startswith("data:"):
                data.append(line[5:].lstrip())
            elif not line and data:
                emit(json.loads("\n".join(data)))
                data = []
        return
    message = json.loads(text)
    for item in message if isinstance(message, list) else [message]:
        emit(item)


def main():
    session = None
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request = json.loads(line)
        try:
            status, headers, text = post(line, session)
            session = headers.get("mcp-session-id", session)
            if status >= 400 and not text.strip():
                raise ConnectionError(f"HTTP {status} from {URL}")
            relay(text, headers)
        except Exception as error:  # report to the client instead of dying, so Claude Code shows the reason
            if isinstance(request, dict) and "id" in request:
                emit({"jsonrpc": "2.0", "id": request["id"], "error": {"code": -32000, "message": str(error)}})
            else:
                sys.stderr.write(f"mcp-bridge: {error}\n")
    if session:
        try:
            post(None, session, "DELETE")
        except Exception:
            pass


if __name__ == "__main__":
    main()
