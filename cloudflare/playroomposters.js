import { posterDay, seededRandom } from './youtubesearch.js';

// #1670: real posters for the playhouse's hall, SPEL and BILJARD rooms. The candidates are a hand-picked allow-list of Wikimedia Commons files
// (each looked at on 2026-10-29: family-friendly, portrait, a free licence on its file page). Once per Europe/Stockholm day the Worker asks the
// Commons API for each file's current licence, author and a 330 px thumbnail (upload.wikimedia.org answers with CORS `*`, so the client can draw it
// into its WebGL atlas; since 2026 the API names thumb.wikimedia.org, which does the same) and keeps only the files whose licence is still on LICENCES. The vetted pool is cached in KV ('playroom-posters'); the
// day's pick shuffles each theme with the day as seed (the same for every visitor that day, new the next day). A failed day keeps the last good
// pool (`stale: true`, still rotated daily) and waits RETRY_HOURS before trying again. Titles/authors are untrusted plain text for the client's canvas.
// Adding a file: check its Commons page (licence, content), then add the exact file name (without "File:") to its theme below.
export const POOLS = {
  // 1920s US silent-film posters (public domain: published in the US before 1930); the hall
  film: [
    "Alice's Spooky Adventure.jpg",
    "Alice's Fishy Story.jpg",
    "Alice peace.jpg",
    "Alice Gets in Dutch.jpg",
    "Fairbanks Thief of Bagdad 1924 Miner Co Poster.jpg",
    "Alice in the Jungle (FBO, 1924) (27.25 X 41).jpg",
    "Buster Keaton - The Navigator film poster.jpg",
    "Peter Pan 1924 movie.jpg",
    "The Thief of Bagdad (1924) - film poster.jpg",
    "Peter Pan 1924 poster.jpg",
    "Sherlock jr poster.jpg",
    "The Navigator (1924) Window Card.jpg",
    "Alice in the Jungle Film Poster.jpg",
    "Alice Comedies Poster.jpg",
    "Poster - Freshman, The (1925) 01.jpg",
    "The Lost World (1925) - film poster.jpg",
    "Gold rush poster.jpg",
    "Go West (1925) Window Card.jpg",
    "Black pirate 1926 poster.jpg",
    "Alice the Lumberjack poster.jpg",
    "The General (1926) - Movie Poster.png",
    "The General (1926) - Movie Poster 2.png",
    "Alice the Golf Bug (1927) poster.jpg",
    "Keaton College 1927 H C Miner.jpg",
    "The Kid Brother poster.jpg",
    "The cameraman poster.jpg",
    "The Circus (1928) - Hap Hadley poster.jpg",
    "Mickey Mouse Poster.jpg",
    "Speedy poster.jpg",
    "Steamboat bill poster.jpg",
    "Steamboat Willie 1928 Poster.png",
    "Circus-Clowns-1922-Poster.jpg",
    "Grandmas Boy Poster.jpg",
    "Grandma's Boy 1922.jpg",
    "Douglas Fairbanks Robin Hood 1922 film poster.jpg",
  ],
  // retro and indie game covers (Sierra On-Line boxes under CC BY-SA 4.0, indie studios' own CC covers, a few public-domain covers); SPEL and the hall
  game: [
    "Alto's Adventure promo artwork - Poster.png",
    "Celeste box art full.png",
    "APICO Cover Art.png",
    "Don't Buy This ZX Spectrum cassette inlay.png",
    "Dandy APX Cover Art.jpg",
    "Fez (video game) cover art.png",
    "Guacamelee! STCE box art.jpg",
    "Manifold Garden poster art.jpg",
    "Outer Wilds poster (no credits).jpg",
    "On-Line Systems - Time Zone.jpg",
    "On-Line Systems-02-Wizard and the Princess.jpg",
    "On-Line-Systems-00-Mission-Asteroid.jpg",
    "SierraOnLine-Box-CastleofDrBrain.jpg",
    "SierraOnLine-Box-ConquestoftheLongbow.jpg",
    "SierraOnLine-Box-EcoQuest.jpg",
    "SierraOnLine-Box-GoldRush.jpg",
    "SierraOnLine-Box-HoyleBookofGames.jpg",
    "SierraOnLine-Box-JohnnyCastaway.jpg",
    "Super Mega Baseball Game Cover.png",
    "Tomb of the Mask promo art.png",
    "SierraOnLine-Box-JonesintheFastLane.jpg",
    "SierraOnLine-Box-KingsQuest1.jpg",
    "SierraOnLine-Box-KingsQuest3.jpg",
    "SierraOnLine-Box-KingsQuest5.jpg",
    "SierraOnLine-Box-KingsQuest6.jpg",
    "SierraOnLine-Box-LostSecretoftheRainforest.jpg",
    "SierraOnLine-Box-MixedUpFairyTales.jpg",
    "SierraOnLine-Box-MixedUpMotherGoose.jpg",
    "SierraOnLine-Box-OilsWell.jpg",
    "SierraOnLine-Box-PeppersAdventureinTime.jpg",
    "SierraOnLine-Box-QuestforGlory.jpg",
    "SierraOnLine-Box-SpaceQuest 5.jpg",
    "SierraOnLine-Box-SpaceQuest1 EGA.jpg",
    "SierraOnLine-Box-SpaceQuest3.jpg",
    "SierraOnLine-Box-SpaceQuest4.jpg",
    "SierraOnLine-Box-SpaceQuest6.jpg",
    "Telegames Tank-Plus cover art.jpg",
    "Skillshot City Box Art.png",
  ],
  // WPA Federal Music Project and US cultural-presentation concert posters, an operetta poster (public domain); BILJARD/DJ and the hall
  music: [
    "Il Trovatore.jpg",
    "Federal Music Program.jpg",
    "Cuyahoga County Opera presents Carmen, WPA poster, 1939.jpg",
    "\"The chocolate soldier\" LCCN98507266.jpg",
    "Bridgeport Symphony Orchestra - Frank Foti, conductor LCCN98507291.jpg",
    "American music festival - Bridgeport Symphony Orchestra - Frank Foti, conductor LCCN98507599.jpg",
    "Illinois symphony orchestra LCCN98507726.jpg",
    "American concert orchestra-Federal Music Project-Works Progress Administration LCCN98509669.jpg",
    "Colored concert band, Norman L. Black, conductor LCCN98509681.jpg",
    "Russian symphony series, Eugene Plotnikoff conducting LCCN98516317.jpg",
    "\"The Pirates of Penzance\" LCCN98516972.jpg",
    "\"Carmen\" LCCN98517001.jpg",
    "Cincinnati Federal Symphonic Orchestra, Works Progress Administration presents young people's concert under the sponsorship of the Hamilton Mothersingers at the Wilson Auditorium LCCN98517135.jpg",
    "Federal Music presents Gilbert & Sullivan's light opera \"The gondoliers\" LCCN98517164.jpg",
    "The W.P.A. Federal Music Project of New York City announces free music instruction - register now LCCN98517461.jpg",
    "Federal Music Project presents the comic opera \"Die fledermaus\" - \"The bat\" by Johann Strauss LCCN98517704.jpg",
    "Victor Herbert's comic opera \"Fortune teller\" with famous \"gypsy love song\" LCCN98518815.jpg",
    "\"The chocolate soldier\" LCCN98518998.jpg",
    "Los Angeles Federal Music Project presents \"The chocolate soldier\" LCCN98518999.jpg",
    "WPA Federal Music Project of NYC (presents) Brahms symphony series LCCN97502884.jpg",
    "WPA Federal Music Project of New York City presents free orchestra & band concerts LCCN98513651.jpg",
    "WPA Federal Music Project presents songs and piano music everybody should know LCCN98516606.jpg",
    "WPA Federal Music Project of New York City presents free symphony concerts LCCN98516711.jpg",
    "WPA Federal Music Project of New York City presents free band concerts (at the) Brooklyn Museum LCCN98516715.jpg",
    "WPA Federal Music Project of New York City presents free band concerts (at the) Bronx County Building LCCN98516716.jpg",
    "Bowling Green Blues Trio. John Cephas, Guitar, Phil Wiggins Ham1onica, Barry Lee Pearson, Guitar. A Cultural Presentation of the United States of America - DPLA - 3ad7142c8decb46da148282d248044ec.jpg",
    "BENNY GOLSON ALL-STARS FEATURING CURTIS FULLER. A Cultural Presentation of the United States - DPLA - 7cda04a80af4a8ddbfa87f851e6eab58.jpg",
    "Country Roads, Featuring Doyle Lawson & Quicksilver and the Junior Daugherty Band. A Presentation of the International Communication Agency - DPLA - d6988e4174f1284077e5e1e0a25bb804.jpg",
    "The New Orleans Classic Jazz Orchestra. A Cultural Presentation of the United States of America - DPLA - 4007aa1f4a748134c40733ba28c0449e.jpg",
    "Tadeusz Trepkowski V Międzynarodowy Konkurs im. Fryderyka Chopina.jpg",
    "Operettenplakat - Princesses Dollar - 1912.jpg",
  ],
  // 19th-/early-20th-century billiard advertisements (public domain; one CC BY 2.0); BILJARD
  billiard: [
    "The Noble Game of Billiards.png",
    "Schaefer—Matuyama balkline match ad.png",
    "Company-merchandise-poster.jpg",
    "Content-johnston-city.jpg",
    "Thurston Billiards-Portrait of John Thurston-Royal Warrant Holder.jpg",
    "Thurston Billiards-Rubber cushion 1835.jpg",
    "Brunswick & Brother Ad in 1854.jpg",
    "Advertisement for The Cafe Royal, White Rock, Hastings and The Wellington Billiards Saloons, Claremont, Hastings. c.1882 (9077640623).jpg",
  ],
};
/** How many of each theme a room shows per day, in atlas-cell order (hall = designs 0-9, SPEL 10-18, BILJARD 19-27, see PLAYROOM.posters.walls). */
export const ROOMS = { hall: [['film', 6], ['music', 2], ['game', 2]], spel: [['game', 9]], biljard: [['music', 6], ['billiard', 3]] };
/** Licences that allow showing a file in the game without asking (public domain, CC0, CC BY, CC BY-SA; the BY ones are credited on the poster). */
export const LICENCES = /^(Public domain|PDM(-owner)?|CC0( 1\.0)?|CC BY(-SA)? [1-4]\.0( [A-Za-z]{2,3})?)$/;
export const THUMB = /^https:\/\/(upload|thumb)\.wikimedia\.org\/wikipedia\/commons\/(thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/[^\s?#"'<>\\]+$/;
const API = 'https://commons.wikimedia.org/w/api.php', KEY = 'playroom-posters', VERSION = 1, WIDTH = 330, RETRY_HOURS = 6, BATCH = 50;
const UA = 'lunden-3d-apartment/1.0 (https://github.com/solwation/lunden-3d-apartment; playroom posters)';
const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', '#39': "'", '#34': '"', '#38': '&', nbsp: ' ' };
/** extmetadata values are HTML: tags dropped, the common entities decoded, plain text of at most `max` characters. */
export const plain = (html, max) => (typeof html === 'string' ? html : '').replace(/<[^>]*>/g, ' ').replace(/&(amp|quot|apos|lt|gt|#39|#34|#38|nbsp);/g, (_, e) => ENTITIES[e])
  .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const fileTitle = (name) => name.replace(/\.(jpe?g|png)$/i, '').replace(/_/g, ' ').replace(/\s+LCCN\w+$/, '').trim();

/** One Commons page → a poster item, or null (missing, not a JPEG/PNG, an unlisted licence, a thumbnail off upload.wikimedia.org, not portrait). */
export function posterItem(page) {
  const ii = page?.imageinfo?.[0], em = ii?.extmetadata ?? {}, licence = plain(em.LicenseShortName?.value, 40);
  if (!ii || page.missing || !LICENCES.test(licence) || !['image/jpeg', 'image/png'].includes(ii.mime)) return null;
  // (Commons adds utm_* tracking parameters to the URL; the file needs none)
  const src = String(ii.thumburl ?? ii.url ?? '').split('?')[0], w = ii.thumbwidth ?? ii.width, h = ii.thumbheight ?? ii.height;
  if (!THUMB.test(src ?? '') || !(w > 0 && h > 0) || h / w < 1 || h / w > 1.8) return null;
  const name = String(page.title).replace(/^File:/, ''), licenceUrl = plain(em.LicenseUrl?.value, 200);
  return { src, w, h, title: plain(fileTitle(name), 120), artist: plain(em.Artist?.value, 80), licence,
    licenceUrl: /^https?:\/\/[^\s"'<>]+$/.test(licenceUrl) ? licenceUrl : '', page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name.replace(/ /g, '_'))}` };
}

/** Today's vetted pool from Commons: { film: [item], game, music, billiard }; ceil(files / 50) API calls. */
export async function fetchPool({ fetcher = fetch, pools = POOLS } = {}) {
  const theme = new Map(), names = [];
  for (const [t, list] of Object.entries(pools)) for (const n of list) if (!theme.has(n)) { theme.set(n, t); names.push(n); }
  const pool = Object.fromEntries(Object.keys(pools).map((t) => [t, []]));
  let kept = 0;
  for (let i = 0; i < names.length; i += BATCH) {
    const q = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata',
      iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist', iiurlwidth: String(WIDTH), titles: names.slice(i, i + BATCH).map((n) => `File:${n}`).join('|') });
    const r = await fetcher(`${API}?${q}`, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA } }).catch(() => null);
    if (!r?.ok) continue; // one failed batch costs its files, not the day
    const data = await r.json().catch(() => null), asked = new Map((data?.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const page of data?.query?.pages ?? []) {
      const name = String(asked.get(page.title) ?? page.title ?? '').replace(/^File:/, ''), t = theme.get(name) ?? theme.get(name.replace(/_/g, ' '));
      const item = t && posterItem(page);
      if (item) { pool[t].push(item); kept++; }
    }
  }
  if (!kept) throw new Error('upstream');
  return pool;
}

/** The day's posters per room: each theme shuffled with `${day}:${theme}` as seed; SPEL and BILJARD take their counts first, the hall the rest (no file twice). */
export function pickRooms(pool, day) {
  const order = {};
  for (const [t, list] of Object.entries(pool)) {
    const random = seededRandom(`${day}:${t}`), a = [...list].sort((x, y) => (x.src < y.src ? -1 : x.src > y.src ? 1 : 0)); // a stable start, whatever order Commons answered in
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    order[t] = a;
  }
  const used = Object.fromEntries(Object.keys(order).map((t) => [t, 0])), rooms = {};
  for (const room of ['spel', 'biljard', 'hall']) {
    rooms[room] = [];
    for (const [t, n] of ROOMS[room]) for (let k = 0; k < n && used[t] < (order[t]?.length ?? 0); k++) rooms[room].push(order[t][used[t]++]);
  }
  return { hall: rooms.hall, spel: rooms.spel, biljard: rooms.biljard };
}

const validItem = (i) => !!i && THUMB.test(i.src ?? '') && LICENCES.test(i.licence ?? '') && i.w > 0 && i.h > 0 && typeof i.title === 'string' && i.title.length <= 120
  && typeof i.artist === 'string' && i.artist.length <= 80;
const validPool = (v) => v?.version === VERSION && typeof v.day === 'string' && !!v.pool && Object.keys(POOLS).every((t) => Array.isArray(v.pool[t]) && v.pool[t].every(validItem))
  && Object.values(v.pool).some((l) => l.length > 0);
let memory = null, inflight = null; // this isolate's copy of the KV record and the running refresh
export const resetPlayroomPosterMemory = () => { memory = null; inflight = null; };

/** { day, rooms: { hall, spel, biljard }, stale } for today, or throws when there has never been a good pool. */
export async function dailyPlayroomPosters(env, { fetcher = fetch, now = Date.now() } = {}) {
  const today = posterDay(now);
  if (!(memory?.day === today && validPool(memory)) && env.LUNDEN) {
    const stored = await env.LUNDEN.get(KEY, 'json').catch(() => null);
    if (stored && (validPool(stored) || Number.isFinite(stored.tried))) memory = stored;
  }
  const fresh = memory?.day === today && validPool(memory), waiting = memory?.triedDay === today && now - memory.tried < RETRY_HOURS * 3600e3;
  if (!fresh && !waiting) {
    inflight ??= (async () => {
      const before = memory;
      try {
        const next = { version: VERSION, day: today, pool: await fetchPool({ fetcher }) };
        if (!validPool(next)) throw new Error('upstream');
        memory = next;
      } catch {
        memory = { ...(validPool(before) ? { version: VERSION, day: before.day, pool: before.pool } : {}), triedDay: today, tried: now };
      }
      await env.LUNDEN?.put(KEY, JSON.stringify(memory)).catch(() => {});
    })().finally(() => { inflight = null; });
    await inflight;
  }
  if (validPool(memory)) return { day: today, rooms: pickRooms(memory.pool, today), stale: memory.day !== today };
  throw new Error('upstream');
}

export async function playroomPostersFetch(request, env, headers, { fetcher = fetch, now = Date.now() } = {}) {
  const response = (data, status = 200, cache = 'no-store') => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': cache } });
  if (request.method !== 'GET') return response({ error: 'GET only' }, 405);
  try { return response(await dailyPlayroomPosters(env, { fetcher, now }), 200, 'public, max-age=1800'); }
  catch { return response({ error: 'posters unavailable' }, 502); }
}
