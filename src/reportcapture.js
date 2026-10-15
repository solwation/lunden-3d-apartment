import { REPORTS } from './config.js';

// Copy only the game canvas, in the same task as its completed screen render.
// The disposable 2D copy survives WebGL's normal drawing-buffer discard.
export class ReportCapture {
  constructor(renderer) { this.renderer = renderer; this.pending = null; }
  capture() {
    if (this.pending) return Promise.reject(Error('capture busy'));
    return new Promise((resolve, reject) => {
      const job = { resolve, reject };
      job.timer = setTimeout(() => this.finish(job, Error('capture timeout')), REPORTS.captureMs);
      this.pending = job;
    });
  }
  finish(job, error, image) {
    if (this.pending !== job) return;
    clearTimeout(job.timer); this.pending = null;
    if (error) job.reject(error); else job.resolve(image);
  }
  afterRender() {
    const job = this.pending;
    if (!job || job.copying) return;
    job.copying = true;
    let copy;
    try {
      const source = this.renderer.domElement;
      if (!source.width || !source.height || this.renderer.getContext().isContextLost()) throw Error('unavailable canvas');
      copy = document.createElement('canvas');
      const scale = Math.min(1, REPORTS.imageEdge / Math.max(source.width, source.height));
      copy.width = Math.max(1, Math.floor(source.width * scale));
      copy.height = Math.max(1, Math.floor(source.height * scale));
      const context = copy.getContext('2d', { alpha: false });
      if (!context) throw Error('unavailable copy');
      context.drawImage(source, 0, 0, copy.width, copy.height);
    } catch (error) { this.finish(job, error); return; }
    this.encode(copy, job).then(image => this.finish(job, null, image), error => this.finish(job, error));
  }
  async encode(copy, job) {
    for (let attempt = 0; attempt < 6; attempt++) {
      if (this.pending !== job) throw Error('capture expired');
      if (attempt === 3) {
        const smaller = document.createElement('canvas');
        smaller.width = Math.max(1, Math.floor(copy.width / 2));
        smaller.height = Math.max(1, Math.floor(copy.height / 2));
        const context = smaller.getContext('2d', { alpha: false });
        if (!context) throw Error('unavailable resize');
        context.drawImage(copy, 0, 0, smaller.width, smaller.height); copy = smaller;
      }
      const blob = await new Promise(resolve => copy.toBlob(resolve, 'image/jpeg', [.8, .55, .3][attempt % 3]));
      if (!blob || blob.type !== 'image/jpeg') throw Error('JPEG unavailable');
      if (blob.size > REPORTS.imageBytes) continue;
      const data = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.subarray(i, i + 8192));
      return 'data:image/jpeg;base64,' + btoa(binary);
    }
    throw Error('capture too large');
  }
}
