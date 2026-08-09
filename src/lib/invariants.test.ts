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
import useEngineSrc from '../popup/useEngine.ts?raw';

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

  it('bypass calls no storage writer', () => {
    // Bypass is a listening mode: it must never change what is stored. That is an architectural
    // rule, and a behavioural test would not catch breaking it — a stray commitTarget() in the
    // handler would still leave the UI looking right. So assert it on the source instead.
    const block = useEngineSrc.match(/--- bypass:start[\s\S]*?--- bypass:end/)?.[0];
    expect(block, 'bypass:start / bypass:end markers not found in useEngine.ts').toBeTruthy();

    // Strip comments first: the block deliberately NAMES these writers to explain the rule.
    const code = block!.replace(/\/\/.*$/gm, '');
    for (const writer of ['commitTarget', 'writeDefaultEq', 'writeRules', 'writeRulesResult', 'writeJournal', 'clearJournal', 'recordJournal']) {
      expect(code, `bypass must not call ${writer}`).not.toContain(writer);
    }
    // It must also leave the editing buffer alone, so the graph keeps showing the real curve.
    for (const mutator of ['bandsRef.current =', 'setBands(', 'gainRef.current =', 'setGain(']) {
      expect(code, `bypass must not touch ${mutator}`).not.toContain(mutator);
    }
  });

  it('the sync write quantizes the curve, and the read leaves it alone', () => {
    // Where rounding is allowed to happen. Storage is the only place: the editing buffer, the
    // engine and the graph all keep full precision, so a value is rounded once on its way out
    // rather than a little more on every open-edit-save trip. A behavioural test cannot see the
    // difference — both spellings store the same bytes on the first save — so assert the shape.
    const write = engineIoSrc.match(/export async function writeRulesResult[\s\S]*?\n}/)?.[0];
    expect(write, 'writeRulesResult not found').toBeTruthy();
    expect(write, 'the RULES write must go through quantizeRules').toContain('quantizeRules(');

    const read = engineIoSrc.match(/export async function readRules[\s\S]*?\n}/)?.[0];
    expect(read, 'readRules not found').toBeTruthy();
    // Rules written by an older version keep their exact values until the user next saves them.
    expect(read, 'reading must not rewrite what is stored').not.toContain('quantize');
  });

  it('the in-memory rules array is the one that was persisted', () => {
    // rulesRef is a mirror of storage, not a second source of truth. If the popup keeps the exact
    // curve in memory while storage holds the rounded one, the two disagree for the rest of the
    // session — and the crash-recovery journal identifies its target by comparing the whole curve,
    // so the next boot decides the rule "changed under it" and discards the recovered edit.
    // quantize.test.ts proves those two fingerprints really do differ; this pins the fix.
    //
    // Asserted as a chokepoint rather than per call site: there were five places that assigned the
    // mirror, each able to diverge on its own, and "remember to quantize here too" is not an
    // invariant. Exactly two assignments may exist — the render mirror and the setter itself.
    const assignments = useEngineSrc.match(/rulesRef\.current = /g) ?? [];
    expect(assignments.length, 'every rules write must go through setRulesMirror').toBe(2);

    const setter = useEngineSrc.match(/const setRulesMirror = useCallback\([\s\S]*?\n  \}, \[\]\);/)?.[0];
    expect(setter, 'setRulesMirror not found').toBeTruthy();
    expect(setter, 'the mirror must hold the quantized array').toContain('quantizeRules(');
    expect(setter, 'and must hand it back so the caller writes the same one').toContain('return stored;');
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
