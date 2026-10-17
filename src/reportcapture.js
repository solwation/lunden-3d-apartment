import { REPORTS } from './config.js';
import { encodeReportJpeg } from './reportphoto.js';

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
  // #1181: the same bounded encoder serves chosen report photos.
  encode(copy, job) { return encodeReportJpeg(copy, () => this.pending === job); }
}
