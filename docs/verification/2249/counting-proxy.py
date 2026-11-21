# Throttling HTTPS CONNECT proxy for the #2249 upgrade test. TLS stays end to end.
# Rate (bytes/s, 0 = unlimited) is read from RATE_FILE on every chunk; byte counts go to LOG.
import asyncio, sys, time, os
PORT, RATE_FILE, LOG = int(sys.argv[1]), sys.argv[2], sys.argv[3]
def rate():
    try: return int(open(RATE_FILE).read().strip() or 0)
    except Exception: return 0
def log(msg):
    with open(LOG, 'a') as f: f.write(time.strftime('%H:%M:%S ') + msg + '\n')
async def pipe(r, w, counter, throttle):
    try:
        while True:
            data = await r.read(16384)
            if not data: break
            counter[0] += len(data)
            w.write(data); await w.drain()
            lim = rate() if throttle else 0
            if lim: await asyncio.sleep(len(data) / lim)
    except Exception: pass
    finally:
        try: w.close()
        except Exception: pass
async def handle(cr, cw):
    head = await cr.readuntil(b'\r\n\r\n')
    line = head.split(b'\r\n')[0].decode()
    method, target, _ = line.split(' ', 2)
    if method != 'CONNECT':
        cw.write(b'HTTP/1.1 405 Method Not Allowed\r\n\r\n'); await cw.drain(); cw.close(); return
    host, port = target.rsplit(':', 1)
    sr, sw = await asyncio.open_connection(host, int(port))
    cw.write(b'HTTP/1.1 200 Connection established\r\n\r\n'); await cw.drain()
    up, down = [0], [0]; t0 = time.time()
    await asyncio.gather(pipe(cr, sw, up, False), pipe(sr, cw, down, True))
    log(f'{target} down={down[0]} up={up[0]} secs={time.time()-t0:.1f}')
async def main():
    srv = await asyncio.start_server(handle, '127.0.0.1', PORT)
    log(f'listening {PORT}')
    async with srv: await srv.serve_forever()
asyncio.run(main())
