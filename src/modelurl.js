// Model resources do not inherit the importing module's query automatically.
// Follow the stamped module build for HTTP(S); keep Node file URLs untouched.
export function modelURL(path, moduleURL) {
  const url = new URL(path, moduleURL);
  const version = new URL(moduleURL).searchParams.get('v');
  if ((url.protocol === 'http:' || url.protocol === 'https:') && version) url.searchParams.set('v', version);
  return url;
}
