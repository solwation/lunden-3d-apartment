import { PLAYROOM } from './config.js';

// The official iframe is a separate viewing surface, never a WebGL texture.
// Discovery starts when the visitor opens the cinema; the player loads after film selection.
export function youtubeId(value) {
  const text = value.trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  let url;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  let id;
  if (host === 'youtu.be') id = url.pathname.slice(1);
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:embed|shorts|live)\/([^/]+)$/.exec(url.pathname)?.[1];
  }
  return /^[\w-]{11}$/.test(id ?? '') ? id : null;
}

export function youtubeError(code) {
  if (code === 101 || code === 150) return 'Ägaren tillåter inte att filmen visas här. Välj en annan film.';
  if (code === 100) return 'Filmen saknas eller är privat. Välj en annan film.';
  if (code === 153) return 'YouTube kunde inte godkänna visningsplatsen. Prova en annan film eller webbläsare.';
  if (code === 151) return 'YouTube begränsar den här filmen för ditt konto eller nätverk. Välj en annan film.';
  return `Filmen kunde inte spelas (YouTube-fel ${code}). Välj en annan film.`;
}

let apiPromise;
function youtubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const previous = window.onYouTubeIframeAPIReady;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.onYouTubeIframeAPIReady = previous;
      if (error) { script.remove(); apiPromise = null; reject(error); }
      else resolve(window.YT);
    };
    const timer = setTimeout(() => finish(new Error('timeout')), PLAYROOM.devices.videoTimeoutMs);
    window.onYouTubeIframeAPIReady = () => { try { previous?.(); } finally { finish(); } };
    script.onerror = () => finish(new Error('network'));
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.append(script);
  });
  return apiPromise;
}

export class CinemaPlayer {
  constructor(el, onClose, searchEndpoint = '') {
    this.el = el; this.onClose = onClose; this.generation = 0; this.searchGeneration = 0;
    this.mount = el.querySelector('.cinema-video');
    this.status = el.querySelector('[role="status"]');
    this.input = el.querySelector('input');
    this.searchEndpoint = searchEndpoint;
    this.results = el.querySelector('[data-cinema="results"]');
    this.resultsTitle = el.querySelector('[data-cinema="results-title"]');
    for (const button of el.querySelectorAll('[data-query]')) button.addEventListener('click', () => {
      this.input.value = button.dataset.query;
      this.search(button.dataset.query);
    });
    this.playButton = el.querySelector('[data-cinema="play"]');
    this.pauseButton = el.querySelector('[data-cinema="pause"]');
    el.querySelector('form').addEventListener('submit', e => { e.preventDefault(); this.search(this.input.value); });
    this.playButton.addEventListener('click', () => this.player?.playVideo());
    this.pauseButton.addEventListener('click', () => this.player?.pauseVideo());
    el.querySelector('[data-cinema="off"]').addEventListener('click', () => this.stop());
    el.querySelector('[data-cinema="close"]').addEventListener('click', () => this.close());
    // Form typing and native Escape belong to the dialog, including the short
    // asynchronous interval between requesting pointer unlock and its event.
    for (const type of ['keydown', 'keyup']) el.addEventListener(type, e => e.stopPropagation());
    el.addEventListener('cancel', e => { e.preventDefault(); this.close('Escape'); });
    window.addEventListener('pagehide', () => this.close('pagehide'));
  }

  get open() { return this.el.open; }
  show() {
    if (!this.open) {
      this.el.showModal(); this.input.focus();
      if (!this.results.childElementCount && this.searchEndpoint) this.search('animerad kortfilm', true);
    }
  }
  close(reason = 'button') {
    this.stop();
    if (this.open) { this.el.close(); this.onClose(reason); }
  }
  stop() {
    this.generation++;
    clearTimeout(this.timer);
    const player = this.player; this.player = null;
    try { player?.destroy(); } catch { /* Always remove the viewing surface, even after a vendor error. */ }
    this.mount.replaceChildren();
    this.playButton.disabled = this.pauseButton.disabled = true;
    this.status.textContent = 'Avstängd. Välj en YouTube-film som får bäddas in.';
  }
  async search(query, suggestions = false) {
    const searchGeneration = ++this.searchGeneration;
    this.results.replaceChildren();
    if (this.resultsTitle) this.resultsTitle.textContent = suggestions ? 'Förslag för filmkvällen' : 'Sökresultat';
    const q = query.trim();
    if (q.length < 2 || q.length > 80) { this.status.textContent = 'Skriv minst två och högst 80 tecken.'; return; }
    if (youtubeId(q)) { this.choose(q); return; }
    if (/youtube|youtu\.be/i.test(q)) { this.status.textContent = 'Det där är ingen giltig YouTube-film.'; return; }
    if (!this.searchEndpoint) { this.status.textContent = 'Filmsökningen är inte tillgänglig just nu.'; return; }
    const generation = this.generation;
    this.status.textContent = 'Söker på YouTube…';
    try {
      const url = new URL(this.searchEndpoint, location.href); url.searchParams.set('q', q);
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('search');
      const data = await response.json();
      if (!this.open || generation !== this.generation || searchGeneration !== this.searchGeneration) return;
      if (!Array.isArray(data.items)) throw new Error('search');
      for (const item of data.items) {
        if (!/^[A-Za-z0-9_-]{11}$/.test(item.id) || typeof item.title !== 'string' || typeof item.channel !== 'string') continue;
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'cinema-result';
        const thumbnail = document.createElement('img');
        thumbnail.src = `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`;
        thumbnail.alt = ''; thumbnail.loading = 'lazy'; thumbnail.referrerPolicy = 'no-referrer';
        const caption = document.createElement('span'); caption.textContent = `${item.title} · ${item.channel}`;
        button.append(thumbnail, caption);
        button.addEventListener('click', () => { this.input.value = item.id; this.choose(item.id); });
        this.results.append(button);
      }
      this.status.textContent = this.results.childElementCount ? 'Välj en film i listan.' : 'Inga filmer hittades.';
    } catch {
      if (this.open && generation === this.generation && searchGeneration === this.searchGeneration) this.status.textContent = 'Filmsökningen kunde inte nås. Försök igen.';
    }
  }
  async choose(value) {
    this.stop();
    const id = youtubeId(value);
    if (!id) { this.status.textContent = 'Klistra in en giltig YouTube-länk eller ett video-id.'; return; }
    const generation = this.generation;
    const current = () => this.open && generation === this.generation;
    this.status.textContent = 'Laddar YouTube…';
    try {
      const YT = await youtubeAPI();
      if (!current()) return;
      const frame = document.createElement('iframe');
      frame.title = 'Film i bion · YouTube';
      frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      const url = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
      url.search = new URLSearchParams({ enablejsapi: '1', origin: location.origin, playsinline: '1', autoplay: '0' });
      frame.src = url.href; this.mount.append(frame);
      this.timer = setTimeout(() => {
        if (current()) { this.stop(); this.status.textContent = 'YouTube svarar inte. Kontrollera anslutningen och försök igen.'; }
      }, PLAYROOM.devices.videoTimeoutMs);
      this.player = new YT.Player(frame, { events: {
        onReady: () => {
          if (!current()) return;
          clearTimeout(this.timer);
          this.playButton.disabled = this.pauseButton.disabled = false;
          this.status.textContent = 'Redo. Tryck Spela eller filmens playknapp för bild och ljud.';
        },
        onStateChange: e => {
          if (!current()) return;
          if (e.data === 0) { this.stop(); this.status.textContent = 'Filmen är slut. Välj film igen för att se mer.'; return; }
          this.status.textContent = ({ 0: 'Filmen är slut.', 1: 'Spelar.', 2: 'Pausad.', 3: 'Buffrar…', 5: 'Redo. Tryck Spela för bild och ljud.' })[e.data] ?? 'Tryck Spela för bild och ljud.';
        },
        onAutoplayBlocked: () => { if (current()) this.status.textContent = 'Tryck på playknappen i själva filmen för att starta bild och ljud.'; },
        onError: e => { if (current()) { this.stop(); this.status.textContent = youtubeError(e.data); } },
      } });
    } catch {
      if (current()) { this.stop(); this.status.textContent = 'YouTube kunde inte nås. Kontrollera anslutningen och försök igen.'; }
    }
  }
}
