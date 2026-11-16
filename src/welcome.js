import { MenuSettings } from './menusettings.js';
import { BUILD } from './version.js';

let settings;

/** One controller, available before the world imports; main keeps the same focus/keyboard owner. */
export function welcomeSettings() {
  if (settings) return settings;
  const dialog = document.getElementById('settings-dialog');
  settings = new MenuSettings({ dialog, trigger: document.getElementById('menu-settings'),
    menu: document.getElementById('overlay'), backgrounds: [document.getElementById('loading')],
    children: [document.getElementById('reset-confirm'), document.getElementById('privacy-dialog')],
    onClose: restoreFocus => {
      const playerDialog = document.getElementById('player-dialog');
      if (restoreFocus && playerDialog && !playerDialog.hidden) document.getElementById('player-name')?.focus({ preventScroll: true });
    } });
  const early = document.getElementById('loading-settings');
  early.addEventListener('click', () => settings.open(early));
  return settings;
}

/** Release only the runtime-dependent settings; instructions are useful even while loading. */
export function finishWelcome() {
  document.body.classList.remove('welcome-pending');
  document.querySelectorAll('[data-welcome-pending]').forEach(el => { el.hidden = true; });
  document.querySelectorAll('[data-welcome-runtime]').forEach(el => { el.hidden = false; });
}

/** Defensive, read-only preview: no identity, score upload or persistent cache. */
export function cleanWelcomeScores(value, limit) {
  if (!Array.isArray(value)) return [];
  return value.filter(row => row && typeof row.name === 'string' && Number.isFinite(row.score) && row.score >= 0)
    .slice(0, limit).map(row => ({ name: row.name.trim().slice(0, 20) || 'Anonym', score: Math.floor(row.score) }));
}

export async function welcomeScores(url, { timeout, limit, fetcher = fetch } = {}) {
  if (!url) return { rows: [], state: 'off' };
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetcher(`${url.replace(/\/$/, '')}/scores`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw Error('Scores unavailable');
    const rows = cleanWelcomeScores(await response.json(), limit);
    return { rows, state: rows.length ? 'ready' : 'empty' };
  } catch { return { rows: [], state: 'unavailable' }; }
  finally { clearTimeout(timer); }
}

function showScores({ rows, state }) {
  const text = { off: 'Topplistan är avstängd för det här besöket.', empty: 'Inga resultat ännu. Bli en av de första!',
    unavailable: 'Topplistan kan inte hämtas just nu. Du kan besöka Lunden ändå.', ready: '' }[state];
  for (const id of ['loading-scores', 'lb-start']) {
    const list = document.getElementById(id);
    // The running leaderboard owns its list once it has real rows.
    if (id === 'lb-start' && list.children.length) continue;
    list.replaceChildren(...rows.map((row, index) => {
      const li = document.createElement('li'), name = document.createElement('span'), score = document.createElement('b');
      name.textContent = `${index + 1}. ${row.name}`;
      score.textContent = row.score.toLocaleString('sv-SE');
      li.append(name, score); return li;
    }));
    list.hidden = !rows.length;
  }
  for (const status of document.querySelectorAll('[data-welcome-scores-status]')) status.textContent = text;
}

/** Run alongside version checking and module/world loading, never in their awaited path. */
export function startWelcome() {
  welcomeSettings();
  const list = document.getElementById('lb-start'), note = document.querySelector('#overlay [data-welcome-scores-status]');
  new MutationObserver(() => {
    if (list.children.length) note.textContent = '';
    else if (!note.textContent) note.textContent = 'Inga resultat ännu. Bli en av de första!';
  }).observe(list, { childList: true });
  const configURL = new URL('./config.js', import.meta.url);
  if (BUILD !== 'dev') configURL.searchParams.set('v', BUILD);
  import(configURL.href).then(({ CLOUD_URL, STARTUP, LEADERBOARD }) => {
    const params = new URLSearchParams(location.search), url = params.has('cloud') ? params.get('cloud') : BUILD === 'dev' ? '' : CLOUD_URL;
    return welcomeScores(url, { timeout: STARTUP.welcomeScoresTimeout, limit: LEADERBOARD.show });
  }).then(showScores).catch(() => showScores({ rows: [], state: 'unavailable' }));
}
