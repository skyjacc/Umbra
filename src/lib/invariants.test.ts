import { describe, it, expect } from 'vitest';
// Read the sources as raw strings (Vite ?raw) — no Node fs/types needed, and it works in CI.
import pkgRaw from '../../package.json?raw';
import manifestSrc from '../manifest.config.ts?raw';
import backgroundSrc from '../background.js?raw';
import offscreenSrc from '../../public/offscreen.js?raw';
import engineIoSrc from './engine-io.ts?raw';
import audioSrc from './audio.ts?raw';
import changelogSrc from '../../CHANGELOG.md?raw';
import i18nSrc from '../popup/i18n.tsx?raw';

// Guards three hand-maintained invariants so they can't silently drift:
//  1. the six-place version / BUILD bump (a mismatch makes the popup show "STALE — reload"),
//  2. the frequency clamp duplicated between the popup and the engine — they must agree or a band
//     round-trips differently in each, and
//  3. en/ru parity in the i18n dictionary — t() falls back to English on a missing key, so a
//     forgotten translation ships silently with a green CI.
const grab = (src: string, re: RegExp): string | null => src.match(re)?.[1] ?? null;

// Pull one locale's key set out of the DICT literal in i18n.tsx. Keys are quoted and start a line
// ('nav.eq': 'EQ',) so the ^ anchor can't mistake a value for a key.
function localeKeys(src: string, lang: 'en' | 'ru'): string[] {
  const start = src.indexOf(`\n  ${lang}: {`);
  if (start < 0) throw new Error(`i18n: "${lang}" block not found`);
  const rest = src.slice(start);
  const end = rest.indexOf('\n  }');
  if (end < 0) throw new Error(`i18n: end of "${lang}" block not found`);
  return [...rest.slice(0, end).matchAll(/^\s+'([^']+)'\s*:/gm)].map((m) => m[1]);
}

// {placeholder} tokens a t(key, vars) call must fill. A translation that drops one renders the
// literal "{pattern}" to the user.
function placeholders(src: string, lang: 'en' | 'ru'): Map<string, string[]> {
  const start = src.indexOf(`\n  ${lang}: {`);
  const rest = src.slice(start);
  const block = rest.slice(0, rest.indexOf('\n  }'));
  const out = new Map<string, string[]>();
  for (const m of block.matchAll(/^\s+'([^']+)'\s*:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/gm)) {
    const value = m[2] ?? m[3] ?? '';
    out.set(m[1], [...value.matchAll(/\{(\w+)\}/g)].map((p) => p[1]).sort());
  }
  return out;
}

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
    // the newest DATED release heading must be this version (an [Unreleased] section may sit above it)
    const head = changelogSrc.match(/^## \[(?!Unreleased\])([^\]]+)\] — (\d{4}-\d{2}-\d{2})\s*$/m);
    expect(head, 'CHANGELOG: no "## [x.y.z] — YYYY-MM-DD" heading found').not.toBeNull();
    expect(head![1], 'changelog').toBe(pkg);
    expect(Number.isNaN(Date.parse(head![2])), 'changelog date').toBe(false);
  });

  it('frequency clamp ceiling matches between the popup and the engine', () => {
    const popup = grab(audioSrc, /clampFreq\s*=.*Math\.min\((\d+),/);
    const engine = grab(offscreenSrc, /clampFrequency\s*=.*Math\.min\((\d+),/);
    expect(popup).not.toBeNull();
    expect(popup).toBe(engine);
  });

  it('every i18n key exists in both en and ru', () => {
    const en = localeKeys(i18nSrc, 'en');
    const ru = localeKeys(i18nSrc, 'ru');
    // Sanity: the parser found a real dictionary, not an empty match.
    expect(en.length, 'en keys parsed').toBeGreaterThan(50);

    expect([...new Set(en)].length, 'duplicate keys in en').toBe(en.length);
    expect([...new Set(ru)].length, 'duplicate keys in ru').toBe(ru.length);

    const inEn = new Set(en);
    const inRu = new Set(ru);
    expect(en.filter((k) => !inRu.has(k)), 'keys in en but missing from ru').toEqual([]);
    expect(ru.filter((k) => !inEn.has(k)), 'keys in ru but missing from en').toEqual([]);
  });

  it('en and ru use the same {placeholders} in every string', () => {
    const en = placeholders(i18nSrc, 'en');
    const ru = placeholders(i18nSrc, 'ru');
    const mismatched: string[] = [];
    for (const [key, vars] of en) {
      const other = ru.get(key);
      if (other && vars.join(',') !== other.join(',')) mismatched.push(`${key}: en{${vars}} ru{${other}}`);
    }
    expect(mismatched, 'placeholder mismatch between locales').toEqual([]);
  });
});
