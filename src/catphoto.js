import * as THREE from 'three';

// A snapshot of a cat for its binder card (#1249): moved here from the old cork board's src/catboard.js (#1255).
/**
 * Photograph `target` (world position) from the visitor's eye: a 4:3 render to an offscreen
 * target, returned as a JPEG data URL.
 */
export function snapshot(renderer, scene, camera, target, w = 320, h = 240) {
  // frame about 0.6 m around the cat, whatever the distance
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(0.3 / camera.position.distanceTo(target)));
  const cam = new THREE.PerspectiveCamera(THREE.MathUtils.clamp(fov, 12, 60), w / h, 0.05, 100);
  cam.position.copy(camera.position);
  cam.lookAt(target);
  const rt = new THREE.WebGLRenderTarget(w, h);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const previous = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
  const viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4()), scissorTest = renderer.getScissorTest();
  const counters = { ...renderer.info.render }, auto = renderer.autoClear, xr = renderer.xr.enabled;
  const buf = new Uint8Array(w * h * 4);
  try {
    renderer.xr.enabled = false; renderer.autoClear = true;
    renderer.setRenderTarget(rt); renderer.setViewport(0, 0, w, h); renderer.setScissorTest(false);
    renderer.render(scene, cam); renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  } finally {
    renderer.setRenderTarget(previous, face, mip); renderer.setViewport(viewport); renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest); renderer.autoClear = auto; renderer.xr.enabled = xr;
    Object.assign(renderer.info.render, counters); rt.dispose();
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // flip
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/jpeg', 0.85);
}
