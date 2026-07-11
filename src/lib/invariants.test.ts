import { describe, it, expect } from 'vitest';
// Read the sources as raw strings (Vite ?raw) — no Node fs/types needed, and it works in CI.
import pkgRaw from '../../package.json?raw';
import manifestSrc from '../manifest.config.ts?raw';
import backgroundSrc from '../background.js?raw';
import offscreenSrc from '../../public/offscreen.js?raw';
import engineIoSrc from './engine-io.ts?raw';
import audioSrc from './audio.ts?raw';
import changelogSrc from '../../CHANGELOG.md?raw';

// Guards two hand-maintained cross-file invariants so they can't silently drift:
//  1. the six-place version / BUILD bump (a mismatch makes the popup show "STALE — reload"), and
//  2. the frequency clamp duplicated between the popup and the engine — they must agree or a band
//     round-trips differently in each.
const grab = (src: string, re: RegExp): string | null => src.match(re)?.[1] ?? null;

describe('cross-file invariants', () => {
  it('version / BUILD agree across package.json, manifest, background, offscreen, engine-io + CHANGELOG', () => {
    const pkg = (JSON.parse(pkgRaw) as { version: string }).version;
    const places = {
      manifest: grab(manifestSrc, /version:\s*'([^']+)'/),
      background: grab(backgroundSrc, /BUILD\s*=\s*'([^']+)'/),
      offscreen: grab(offscreenSrc, /BUILD\s*=\s*'([^']+)'/),
      engineIo: grab(engineIoSrc, /BUILD\s*=\s*'([^']+)'/)
    };
    for (const [name, v] of Object.entries(places)) expect(v, name).toBe(pkg);
    expect(changelogSrc).toContain(`[${pkg}]`);
  });

  it('frequency clamp ceiling matches between the popup and the engine', () => {
    const popup = grab(audioSrc, /clampFreq\s*=.*Math\.min\((\d+),/);
    const engine = grab(offscreenSrc, /clampFrequency\s*=.*Math\.min\((\d+),/);
    expect(popup).not.toBeNull();
    expect(popup).toBe(engine);
  });
});
