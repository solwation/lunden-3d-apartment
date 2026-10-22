// Opt-in callback intervals (#1507). No saves, media, URLs, positions or user identifiers.
import { PERF } from './config.js';

const summary = (records) => {
  const values = records.map(r => r.intervalMs).sort((a, b) => a - b);
  const percentile = p => values.length ? values[Math.max(0, Math.ceil(values.length * p) - 1)] : null;
  return { samples: values.length, durationMs: values.reduce((a, b) => a + b, 0),
    median: values.length ? (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2 : null, p95: percentile(.95), p99: percentile(.99), max: values.at(-1) ?? null,
    over50: values.filter(v => v > 50).length, over100: values.filter(v => v > 100).length,
    over250: values.filter(v => v > 250).length };
};
const categories = ['startup', 'warmup', 'paused', 'background', 'covered'];
const flags = state => categories.filter(key => state[key]);

export class FrameIntervals {
  constructor({ capacity = PERF.intervals.keep, metadata = () => ({}) } = {}) {
    this.capacity = Math.max(1, Math.min(PERF.intervals.keep, Math.floor(capacity) || 1));
    this.metadata = metadata;
    this.running = false;
    this.records = [];
  }
  start() {
    this.records = []; this.cursor = 0; this.total = 0; this.previous = null; this.work = null;
    this.pending = new Set(); this.diagnosticMs = 0; this.started = performance.now();
    this.initialMetadata = this.metadata();
    this.running = true;
    performance.mark('lunden-perf-start');
    performance.clearMarks('lunden-perf-start'); // keep trace event, bound the User Timing buffer
    return this;
  }
  stop() { this.running = false; return this.export(); }
  // Event-time flags preserve even a hidden→visible transition between callbacks.
  note(state) { if (this.running) for (const key of flags(state)) this.pending.add(key); }
  callback(now, state) {
    if (!this.running) return;
    const t0 = performance.now(), current = flags(state);
    if (this.previous !== null) {
      const tags = [...new Set([...this.previousFlags, ...current, ...this.pending])];
      const intervalMs = now - this.previous;
      const rec = { startMs: this.previous, endMs: now, intervalMs, tags: tags.length ? tags : ['active'],
        // Work in callback N explains part of N→N+1, not the work about to run in N+1.
        previousWork: this.work, outsideWorkMs: this.work ? Math.max(0, intervalMs - this.work.ms) : null };
      if (this.records.length < this.capacity) this.records.push(rec);
      else this.records[this.cursor] = rec;
      this.cursor = (this.cursor + 1) % this.capacity;
      this.total++;
      if (intervalMs > PERF.intervals.markMs) {
        performance.measure('lunden-perf-gap', { start: this.previous, end: now });
        performance.clearMeasures('lunden-perf-gap');
      }
    }
    this.previous = now; this.previousFlags = current; this.pending.clear(); this.work = null;
    this.diagnosticMs += performance.now() - t0;
  }
  complete(record) {
    if (!this.running || !record) return;
    const t0 = performance.now();
    // Whitelist numeric diagnostics; HitchLog's camera position is intentionally excluded.
    this.work = { ms: record.ms, phases: { ...record.phases }, delta: { ...record.delta },
      quality: record.quality, shadow: record.shadow, gcHintMB: record.gc };
    this.diagnosticMs += performance.now() - t0;
  }
  export() {
    const rows = this.records.length === this.capacity
      ? [...this.records.slice(this.cursor), ...this.records.slice(0, this.cursor)] : [...this.records];
    return { schema: 1, timeOrigin: performance.timeOrigin, startedMs: this.started,
      exportedMs: performance.now(), running: this.running, totalSamples: this.total,
      droppedSamples: this.total - rows.length, capacity: this.capacity,
      diagnosticMs: this.diagnosticMs, initialMetadata: this.initialMetadata, metadata: this.metadata(),
      summary: summary(rows), byState: Object.fromEntries(['active', ...categories].map(key =>
        [key, summary(rows.filter(r => r.tags.includes(key)))])), records: rows };
  }
  download() {
    const blob = new Blob([JSON.stringify(this.export())], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'lunden-perf.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
