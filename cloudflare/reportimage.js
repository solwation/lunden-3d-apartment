import { REPORTS } from '../src/config.js';

// Read JPEG frame dimensions from the bytes, never from caller-supplied metadata.
// No URL fetch, SVG, decoder, or executable content is involved.
export function validReportImage(image) {
  const prefix = 'data:image/jpeg;base64,';
  if (typeof image !== 'string' || !image.startsWith(prefix)) return false;
  const encoded = image.slice(prefix.length);
  if (!encoded || encoded.length % 4 || encoded.length > 4 * Math.ceil(REPORTS.imageBytes / 3)
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return false;
  let binary;
  try { binary = atob(encoded); } catch { return false; }
  if (binary.length > REPORTS.imageBytes || btoa(binary) !== encoded) return false;
  const at = i => binary.charCodeAt(i), word = i => at(i) * 256 + at(i + 1);
  if (word(0) !== 0xffd8) return false;
  let offset = 2, frame = false, scan = false, components = 0;
  while (offset < binary.length) {
    if (at(offset++) !== 255) return false;
    while (at(offset) === 255) offset++;
    const marker = at(offset++);
    if (marker === 0xd9) return frame && scan && offset === binary.length;
    if (![0xc0, 0xc2, 0xc4, 0xda, 0xdb, 0xdd, 0xfe].includes(marker) && !(marker >= 0xe0 && marker <= 0xef)) return false;
    const length = word(offset);
    if (!Number.isFinite(length) || length < 2 || offset + length > binary.length) return false;
    if ([0xc0, 0xc2].includes(marker)) {
      const height = word(offset + 3), width = word(offset + 5);
      components = at(offset + 7);
      if (frame || at(offset + 2) !== 8 || ![1, 3].includes(components) || length !== 8 + components * 3
        || !width || !height || width > REPORTS.imageEdge || height > REPORTS.imageEdge) return false;
      frame = true;
    }
    if (marker === 0xdd && length !== 4) return false;
    if (marker === 0xda && (!frame || at(offset + 2) < 1 || at(offset + 2) > components || length !== 6 + 2 * at(offset + 2))) return false;
    offset += length;
    if (marker === 0xda) {
      if (!frame || length < 6 || offset >= binary.length - 2) return false;
      scan = true;
      while (offset < binary.length) {
        if (at(offset) !== 255) { offset++; continue; }
        if (at(offset + 1) === 0 || (at(offset + 1) >= 0xd0 && at(offset + 1) <= 0xd7)) { offset += 2; continue; }
        break;
      }
    }
  }
  return false;
}
