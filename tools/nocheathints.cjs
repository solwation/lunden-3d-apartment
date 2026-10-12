// #724: no player-facing text hints that cheat codes exist, and README lists none of them.
// Plain node, no browser: node tools/nocheathints.cjs
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let failed = 0;
const check = (ok, text, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${text}${ok ? '' : ' ' + extra}`); if (!ok) failed++; };
// Strip comments so only strings/markup that can be shown are searched.
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const hits = [];
const scan = (file, text) => text.split('\n').forEach((l, i) => { if (/fusk|cheat/i.test(l)) hits.push(`${file}: ${l.trim().slice(0, 90)}`); });
for (const f of fs.readdirSync(path.join(root, 'src')).filter((n) => n.endsWith('.js'))) {
  const code = stripJs(fs.readFileSync(path.join(root, 'src', f), 'utf8'));
  const strings = code.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || [];
  // Import paths and element ids are not shown text.
  scan('src/' + f, strings.filter((x) => !/^['"`][\w./-]+\.js['"`]$/.test(x) && !/^['"`]cheat-note\w*-?\w*['"`]$/.test(x) && !/^['"`]cheat-?note['"`]$/.test(x)).join('\n'));
}
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '');
html = html.replace(/(id|aria-labelledby)="cheat-note[\w-]*"/g, '');
scan('index.html', html);
check(hits.length === 0, 'no shown string in src/*.js or index.html mentions fusk/cheat', '\n' + hits.join('\n'));
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
check(!/fusk|goat|jetpack|handsfree|lights o(n|ff)|`help`/i.test(readme), 'README.md lists no cheat codes and does not mention fusk');
const cheats = fs.readFileSync(path.join(root, 'src/cheats.js'), 'utf8');
check(!/code: 'help'/.test(cheats), "'help' is not in the cheat catalogue");
// #745: nothing the player can read in data/*.json (changelog, todo sample …) hints at hidden features. The words are
// built from parts so this file is no list either.
const W = [['fu', 'sk'], ['che', 'at'], ['go', 'at'], ['gra', 'ffiti'], ['tusch', 'klotter']].map((a) => a.join(''));
const SECRET = ['olof', 'sarah'].map((n) => n + ' is the ' + 'go' + 'at');
const re = new RegExp(W.join('|'), 'i');
const kodRe = /(^|[^a-zåäö])(?!qr-)[a-zåäö-]*kod(en|er|erna)?(?![a-zåäö])/i; // "QR-koden" is fine; "avkodningen" is not matched
const strs = (v, out = []) => { if (typeof v === 'string') out.push(v); else if (v && typeof v === 'object') Object.values(v).forEach((x) => strs(x, out)); return out; };
const bad = [];
for (const f of fs.readdirSync(path.join(root, 'data')).filter((n) => n.endsWith('.json') && n !== 'plan.json')) {
  let j; try { j = JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8')); } catch { continue; }
  const texts = f === 'changelog.json' ? strs(j.map((e) => e.text)) : f.startsWith('beer-shelf') ? [] : strs(j);
  for (const t of texts) {
    const u = t.replace(/QR-kod\w*/gi, '');
    if (re.test(t) || SECRET.some((c) => t.toLowerCase().includes(c)) || kodRe.test(u)) bad.push(`data/${f}: ${t.slice(0, 80)}`);
  }
}
check(bad.length === 0, 'no text in data/*.json (changelog, todo sample) hints at hidden features or names the secret phrases', '\n' + bad.join('\n'));
process.exit(failed ? 1 : 0);
