import { REPORTS } from './config.js';

// #1181: shared JPEG encoder for report images. Re-encoding a canvas writes a bare JFIF,
// so camera EXIF (GPS position, device, time) never leaves the browser.
export async function encodeReportJpeg(canvas, alive = () => true) {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (!alive()) throw Error('encode expired');
    if (attempt === 3) {
      const smaller = document.createElement('canvas');
      smaller.width = Math.max(1, Math.floor(canvas.width / 2));
      smaller.height = Math.max(1, Math.floor(canvas.height / 2));
      const context = smaller.getContext('2d', { alpha: false });
      if (!context) throw Error('unavailable resize');
      context.drawImage(canvas, 0, 0, smaller.width, smaller.height); canvas = smaller;
    }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', [.8, .55, .3][attempt % 3]));
    if (!blob || blob.type !== 'image/jpeg') throw Error('JPEG unavailable');
    if (blob.size > REPORTS.imageBytes) continue;
    const data = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.subarray(i, i + 8192));
    return 'data:image/jpeg;base64,' + btoa(binary);
  }
  throw Error('image too large');
}

// Decode with the browser's own codecs (HEIC only where the browser supports it) and
// apply EXIF orientation before drawing, so portrait phone photos stay upright.
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {}
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.style.imageOrientation = 'from-image'; img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

// A user-chosen photo or picture file becomes a bounded metadata-free JPEG data URL.
export async function prepareReportPhoto(file) {
  if (!file || (file.type && !file.type.startsWith('image/'))) throw Object.assign(Error('not an image'), { code: 'type' });
  let source;
  try { source = await decode(file); } catch { throw Object.assign(Error('unsupported'), { code: 'format' }); }
  const width = source.width || source.naturalWidth, height = source.height || source.naturalHeight;
  if (!width || !height) throw Object.assign(Error('empty'), { code: 'format' });
  const scale = Math.min(1, REPORTS.imageEdge / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw Error('unavailable canvas');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); // transparent PNGs get a white page
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  return encodeReportJpeg(canvas);
}
