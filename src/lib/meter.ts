// The peak meter's ballistics — how the bar rises, falls and holds.
//
// WHAT THE METER IS. It reads the signal AFTER the equalizer and the master gain, purely to show
// it. It does not touch the audio chain, storage, or any profile. Above full scale it says so; it
// does not do anything about it.
//
// Limiting is a different feature with its own settings, its own default, and its own place in the
// played-versus-stored model, and it is deliberately not in 2.5. The absence of a limiter is not a
// bug in the meter — the meter's job is to tell you that you are clipping, and the answer is to
// pull the boost back or switch Auto Gain on.
//
// WHY BALLISTICS AT ALL. Drawing the raw per-frame peak gives a bar that flickers at frame rate on
// ordinary music, which reads as noise and gets ignored. The shape below is the usual one:
//
//   attack   instant        a meter that ramps up under-reads the transient you are looking for
//   decay    40 dB/s        fast enough to track a mix, slow enough to follow with your eyes
//   hold     1.2s           the recent maximum stays put so you can read it after it has gone
//   clip     1.5s latch     a clipped frame is 16ms; without a latch the warning is invisible
//
// Decay is computed from the WALL CLOCK, not per frame. The poll is rAF-driven, so the interval is
// whatever the machine gives, and a per-frame constant would make the meter fall at a different
// rate on a busy tab than on an idle one. That is why `at` is part of the state: the step function
// stays pure and testable, and the caller does not have to remember to pass the previous timestamp.

export const DECAY_DB_PER_SEC = 40;

/**
 * How often the meter asks the engine for a peak, in milliseconds.
 *
 * Not the frame rate. The spectrum needs every frame because it draws 2048 bins of detail; a level
 * bar does not — at the 40 dB/s decay above, 50ms is a 2 dB step, which is below what the eye
 * resolves on a 250px bar. Polling it at 60/s was a regression that put a permanent message loop
 * between the popup and the audio engine for no visible gain, worst of all in the full-window page
 * that stays open for hours.
 */
export const METER_POLL_MS = 50;
export const HOLD_MS = 1200;
export const CLIP_MS = 1500;

/** Below this the bar is simply at rest — about -70 dBFS. */
const FLOOR = 0.0003;

export interface MeterState {
  /** Current bar, in linear amplitude. Can exceed 1 — that is what clipping looks like. */
  level: number;
  /** The recent maximum, drawn as a line above the bar. */
  hold: number;
  /** When the held maximum is allowed to start falling. */
  holdUntil: number;
  /** Non-zero while the clip warning is lit; the value is when it goes out. */
  clipUntil: number;
  /**
   * Timestamp of the frame this state was computed from, or null before the first one.
   *
   * Explicitly nullable rather than 0-as-sentinel: performance.now() legitimately starts near
   * zero, so a falsy check would treat the first real frames as "no previous frame" and refuse to
   * decay at all.
   */
  at: number | null;
}

export const METER_INIT: MeterState = { level: 0, hold: 0, holdUntil: 0, clipUntil: 0, at: null };

/**
 * Amplitude dB — the same convention as the band gains, and NOT the master's 10*log10 scale. The
 * meter reports signal level, so 0.5 reads as -6 dB, which is what anyone reading a meter expects.
 */
export const meterDb = (level: number): number => (level > FLOOR ? 20 * Math.log10(level) : -70);

export function stepMeter(current: MeterState, input: { peak: number; now: number }): MeterState {
  const peak = Number.isFinite(input.peak) && input.peak > 0 ? input.peak : 0;
  const now = Number.isFinite(input.now) ? input.now : (current.at ?? 0);

  // A clock that runs backwards — a reopened popup, a machine resumed from sleep — must not decay
  // by a negative amount and push the bar UP. Clamping the interval to zero freezes it one frame.
  const dtSec = current.at === null ? 0 : Math.max(0, now - current.at) / 1000;

  const decayed = current.level * Math.pow(10, (-DECAY_DB_PER_SEC * dtSec) / 20);
  const level = Math.max(peak, decayed < FLOOR ? 0 : decayed);

  // A louder peak takes the marker immediately and restarts its clock; otherwise it sits where it
  // is until the hold runs out, and then simply rides the bar down.
  const louder = peak >= current.hold;
  const expired = now >= current.holdUntil;
  const hold = louder ? peak : expired ? level : current.hold;
  const holdUntil = louder ? now + HOLD_MS : current.holdUntil;

  const clipUntil = peak >= 1 ? now + CLIP_MS : now >= current.clipUntil ? 0 : current.clipUntil;

  return { level, hold, holdUntil, clipUntil, at: now };
}
