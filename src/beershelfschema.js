// Shared wire format for the Worker, bundled fallback and the persistent browser snapshot (#511).
export const BEER_SOURCE = 'https://untappdbolaget.se/top-10?rank=global';
export const beerDay = time => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[<>\u0000-\u001f]/.test(value);
const number = (value, lo, hi) => typeof value === 'number' && Number.isFinite(value) && value >= lo && value <= hi;
export function validBeerShelf(value, now = Date.now()) {
  if (!value || value.version !== 1 || value.source !== BEER_SOURCE || !number(value.fetchedAt, 0, now + 60000)
    || !number(value.sourceUpdatedAt, 1, now + 60000) || !Array.isArray(value.beers) || value.beers.length !== 4) return false;
  if (value.fetchedAt && value.day !== beerDay(value.fetchedAt)) return false;
  const seen = new Set();
  for (const b of value.beers) {
    if (!b || !/^\d{3,12}$/.test(b.pn ?? '') || seen.has(b.pn) || !text(b.name) || !text(b.brewery) || !text(b.style)
      || !['DIPA', 'TIPA'].includes(b.group) || !['can', 'bottle'].includes(b.type) || !number(b.ml, 250, 500)
      || !number(b.rating, 0, 5) || !number(b.normalizedRating, 0, 5) || !Number.isInteger(b.rank) || b.rank < 1
      || b.sourceURL !== `https://untappdbolaget.se/beer/${b.pn}` || !['product', 'label'].includes(b.labelKind)
      || typeof b.image !== 'string' || b.image.length > 400100 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(b.image)) return false;
    seen.add(b.pn);
  }
  return ['DIPA', 'TIPA'].every(group => value.beers.filter(b => b.group === group).length === 2);
}
