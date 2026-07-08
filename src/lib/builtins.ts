// Curated built-in presets shown first in the Presets tab. Grounded in standard EQ roles
// (60–120 Hz punch, 250–500 Hz mud, 2–5 kHz presence, >8 kHz air). Gains kept moderate to
// avoid clipping; Q left at the Butterworth default. Names double as identifiers (also used
// as the active-preset key), so keep them stable.
import { NUM_FILTERS, DEFAULT_FREQUENCIES, DEFAULT_Q } from './audio';
import type { PresetBands } from './presets';

const qs = () => Array(NUM_FILTERS).fill(DEFAULT_Q);

function make(gains: number[], freqOverrides: Record<number, number> = {}): PresetBands {
  return {
    frequencies: DEFAULT_FREQUENCIES.map((f, i) => freqOverrides[i] ?? f),
    gains: gains.slice(),
    qs: qs()
  };
}

export const BUILTIN_PRESETS: Record<string, PresetBands> = {
  // Strong, clean bass: a big low-shelf at 90 Hz (below the mud region). The output limiter
  // keeps it from clipping, so it hits hard without crackle.
  'Bass Boost': make([10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { 0: 90 }),
  // de-box (160 −2, 320 −3), lift presence + consonants (1.3k +2, 2.5k +5, 5k +3) — speech pops.
  Vocal: make([0, 0, 0, -2, -3, 0, 2, 5, 3, 0, 0]),
  // low-end weight (shelf 70 Hz +6), clearer dialogue (2.5k +3), tame harsh highs (10k −1).
  Movie: make([6, 0, 0, 0, -1, 0, 0, 3, 0, -1, 0], { 0: 70 }),
  // roll off the top (highshelf −5, 10k −2) and add body (80 +2, 160 +3, 320 +1) — warm, smooth.
  Warm: make([0, 0, 2, 3, 1, 0, 0, 0, 0, -2, -5])
};

export const BUILTIN_ORDER = ['Bass Boost', 'Vocal', 'Movie', 'Warm'];
