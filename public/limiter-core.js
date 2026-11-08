// Stereo-linked sample-peak limiter. The delay lets its detector anticipate each peak; a smooth
// release avoids waveform clipping. The weighted sliding maximum is O(1) amortized per sample.
// This bounds digital samples, not reconstructed inter-sample/analogue true peaks.
export class LookaheadLimiter {
  constructor(sampleRate, channels = 2, options = {}) {
    this.delaySamples = Math.max(1, Math.ceil(sampleRate * (options.lookaheadMs ?? 5) / 1000));
    this.ceiling = Math.pow(10, (options.ceilingDb ?? -1) / 20);
    // Leave one Float32 rounding margin below the advertised sample ceiling.
    this.safeCeiling = this.ceiling * (1 - 1e-7);
    this.release = Math.exp(-1 / (sampleRate * (options.releaseMs ?? 80) / 1000));
    const attackSamples = sampleRate * (options.attackMs ?? 1) / 1000;
    this.weights = Float64Array.from({ length: this.delaySamples + 1 }, (_, i) => Math.exp(-i / attackSamples));
    this.ringSize = this.delaySamples + 1;
    this.delay = Array.from({ length: channels }, () => new Float32Array(this.ringSize));
    this.indices = new Float64Array(this.ringSize + 1);
    this.peaks = new Float64Array(this.ringSize + 1);
    this.head = 0;
    this.count = 0;
    this.at = 0;
    this.detector = 0;
  }

  process(input, output) {
    const frames = output[0]?.length ?? 0;
    const channels = output.length;
    for (let frame = 0; frame < frames; frame++) {
      const t = this.at++;
      const outTime = t - this.delaySamples;
      const write = t % this.ringSize;
      const read = (write + 1) % this.ringSize;
      let peak = 0;
      for (let ch = 0; ch < channels; ch++) {
        const raw = input[ch]?.[frame] ?? input[0]?.[frame] ?? 0;
        const sample = Number.isFinite(raw) ? raw : 0;
        this.delay[ch][write] = sample;
        peak = Math.max(peak, Math.abs(sample));
      }

      const capacity = this.indices.length;
      while (this.count && this.indices[this.head] < outTime) {
        this.head = (this.head + 1) % capacity;
        this.count--;
      }
      // Compare weighted peaks at a common time, avoiding exp(index) overflow in long sessions.
      while (this.count) {
        const last = (this.head + this.count - 1) % capacity;
        if (peak * this.weights[t - this.indices[last]] < this.peaks[last]) break;
        this.count--;
      }
      const tail = (this.head + this.count) % capacity;
      this.indices[tail] = t;
      this.peaks[tail] = peak;
      this.count++;
      const anticipated = this.peaks[this.head] * this.weights[this.indices[this.head] - outTime];
      this.detector = Math.max(anticipated, this.detector * this.release);
      // The detector includes the delayed sample itself (weight=1), so gain always protects it.
      const gain = this.detector > this.safeCeiling ? this.safeCeiling / this.detector : 1;
      for (let ch = 0; ch < channels; ch++) output[ch][frame] = outTime < 0 ? 0 : this.delay[ch][read] * gain;
    }
  }
}
