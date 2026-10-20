import { PLAYROOM } from './config.js';

// The official iframe is a separate viewing surface, never a WebGL texture.
// No third-party connection is made until the visitor submits their own video.
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
  return 'Filmen kunde inte spelas. Kontrollera länken och välj en annan film.';
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
  constructor(el, onClose) {
    this.el = el; this.onClose = onClose; this.generation = 0;
    this.mount = el.querySelector('.cinema-video');
    this.status = el.querySelector('[role="status"]');
    this.input = el.querySelector('input');
    this.playButton = el.querySelector('[data-cinema="play"]');
    this.pauseButton = el.querySelector('[data-cinema="pause"]');
    el.querySelector('form').addEventListener('submit', e => { e.preventDefault(); this.choose(this.input.value); });
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
  show() { if (!this.open) { this.el.showModal(); this.input.focus(); } }
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
