import { REPORTS } from './config.js';
/** Byte count after the fixed JPEG/base64 envelope. Callers validate/encode JPEG content separately. */
export function reportJpegBytes(value) {
  if(typeof value!=='string'||!value.startsWith('data:image/jpeg;base64,'))return Infinity;
  const s=value.slice(23);return s.length/4*3-(s.endsWith('==')?2:s.endsWith('=')?1:0);
}
export function reportImageBytes({image,photo,photos=[]}) {
  return [...(image===undefined?[]:[image]),...(photo===undefined?[]:[photo]),...photos].reduce((n,p)=>n+reportJpegBytes(p),0);
}
export const reportOwnImages = images => images.length ? {photo:images[0],...(images.length>1?{photos:images.slice(1)}:{})} : {};
export const reportImagesFit = payload => reportImageBytes(payload)<=REPORTS.imageTotalBytes;
