// #2125: actual cat consumers before/after (before = the base revision's cat/outdoor-cat modules and config served in their place).
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/catlife2125browser.cjs http://localhost:8325 docs/verification/2125 [base]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8325', out = 'docs/verification/2125', baseline = '36005ad1'] = process.argv.slice(2);
const OLD = ['src/cat.js', 'src/outdoorcats.js', 'src/outdoorcatbrain.js', 'src/config.js'];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const report = { baseline, errors: [], external: [], phases: {} }, frames = {};
  try {
    let pass = '';
    for (const phase of ['after', 'before']) {
      const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
      page.on('pageerror', (e) => report.errors.push(`${phase}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram|THREE\.WebGLShader/.test(m.text())) report.errors.push(`${phase}: ${m.text()}`); });
      await page.route('**/*', (r) => {
        const u = new URL(r.request().url());
        if (!r.request().url().startsWith(base + '/')) { report.external.push(r.request().url()); return r.abort(); }
        const f = u.pathname.slice(1);
        if (phase === 'before' && OLD.includes(f)) return r.fulfill({ contentType: 'text/javascript', body: execFileSync('git', ['show', `${baseline}:${f}`], { encoding: 'utf8', maxBuffer: 1 << 26 }) });
        if (phase === 'before' && (f === 'src/catlife.js' || f === 'src/catfur.js')) return r.fulfill({ contentType: 'text/javascript', body: "throw new Error('not in the base revision');" });
        return r.continue();
      });
      await page.goto(`${base}/tools/catlife2125.html${pass}`);
      await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
      frames[phase] = {};
      const t0 = Date.now();
      for (const s of ['indoor', 'fur', 'outdoor']) frames[phase][s] = await page.evaluate((s) => window.__frames(s), s);
      const proof = await page.evaluate(() => window.__proof());
      proof.ms = Date.now() - t0;
      report.phases[phase] = { proof, frames: Object.fromEntries(Object.entries(frames[phase]).map(([k, v]) => [k, v.map(({ label, calls, triangles }) => ({ label, calls, triangles }))])) };
      if (phase === 'after') pass = `?wrap=${proof.wrapT}&flank=${proof.flankT}&owrap=${proof.owrap}`;
      await page.close();
    }
    // sheets: one row before, one row after, native 400×300 frames
    const page = await browser.newPage(); await page.setContent('<canvas></canvas>');
    for (const s of ['indoor', 'fur', 'outdoor']) {
      const img = await page.evaluate(async ({ b, a }) => {
        const n = a.length, c = document.querySelector('canvas'); c.width = n * 400; c.height = 2 * 330;
        const g = c.getContext('2d'); g.fillStyle = '#f7f7f3'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#222'; g.font = '15px sans-serif';
        for (const [row, list] of [b, a].entries()) for (const [i, f] of list.entries()) {
          const im = new Image(); im.src = f.image; await im.decode();
          if (im.naturalWidth !== 400 || im.naturalHeight !== 300) throw new Error('size');
          g.drawImage(im, i * 400, row * 330 + 26); g.fillText(`${row ? 'Efter' : 'Före'} — ${a[i].label}`, i * 400 + 8, row * 330 + 18);
        }
        return c.toDataURL('image/jpeg', 0.9);
      }, { b: frames.before[s], a: frames.after[s] });
      const dir = s === 'fur' ? out : out; fs.writeFileSync(path.join(dir, `${s}-sequence.jpg`), Buffer.from(img.split(',')[1], 'base64'));
    }
    await page.close();
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ errors: report.errors, external: report.external, before: report.phases.before.proof, after: report.phases.after.proof,
      calls: Object.fromEntries(['before', 'after'].map((p) => [p, Object.fromEntries(Object.entries(report.phases[p].frames).map(([k, v]) => [k, v.map((x) => x.calls)]))])) }, null, 1));
    if (report.errors.length || report.external.length) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
