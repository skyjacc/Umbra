import { describe, expect, it } from 'vitest';
import { LookaheadLimiter } from '../../public/limiter-core.js';

function render(input: Float32Array[], sampleRate = 48000) {
  const limiter = new LookaheadLimiter(sampleRate, input.length);
  const length = input[0].length + limiter.delaySamples;
  const output = input.map(() => new Float32Array(length));
  // Uneven blocks catch state errors at render-quantum and ring-buffer boundaries.
  for (let at = 0; at < length; at += 127) {
    const size = Math.min(127, length - at);
    const block = input.map(channel => Float32Array.from({length:size}, (_, i) => channel[at + i] ?? 0));
    const result = input.map(() => new Float32Array(size));
    limiter.process(block, result);
    result.forEach((channel, i) => output[i].set(channel, at));
  }
  return { limiter, output };
}

describe('shared output lookahead limiter', () => {
  it('passes quiet audio exactly, apart from the declared delay', () => {
    const input = Float32Array.from({length:12000}, (_, i) => .1 * Math.sin(i * .2));
    const {limiter, output} = render([input]);
    expect([...output[0].slice(0, limiter.delaySamples)]).toEqual(Array(limiter.delaySamples).fill(0));
    expect([...output[0].slice(limiter.delaySamples)]).toEqual([...input]);
  });

  it.each([44100, 48000, 96000])('contains loud impulses and combined streams at %i Hz', sampleRate => {
    let seed = 1729;
    const input = Float32Array.from({length:sampleRate}, (_, i) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return i % 577 === 0 ? 10000 : 20 * Math.sin(i * .19) + 10 * Math.sin(i * .07) + (seed / 2 ** 32 - .5) * 3;
    });
    const {limiter, output} = render([input, Float32Array.from(input, x => -.5*x)], sampleRate);
    expect(output[0].every(v => Number.isFinite(v) && Math.abs(v) <= limiter.ceiling)).toBe(true);
    // Stereo-linked gain preserves the channel relationship, including opposite phase.
    expect(output[0].every((v,i) => output[1][i] === -.5*v)).toBe(true);
  });

  it('reduces gain before a transient and recovers smoothly instead of clipping its waveform', () => {
    const input = new Float32Array(48000).fill(.2);
    input[12000] = 8;
    const {limiter, output} = render([input]);
    const onset = 12000 + limiter.delaySamples;
    expect(output[0][onset-1]).toBeLessThan(.04);
    expect(output[0][onset]).toBeLessThanOrEqual(limiter.ceiling);
    expect(output[0][onset+1]).toBeLessThan(.04);
    expect(output[0][output[0].length-1]).toBeCloseTo(.2, 5);
  });

  it('does not propagate invalid samples', () => {
    const {output} = render([new Float32Array([NaN, Infinity, -Infinity, .1])]);
    expect(output[0].every(Number.isFinite)).toBe(true);
  });
});
