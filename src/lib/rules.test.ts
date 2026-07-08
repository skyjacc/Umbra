import { describe, it, expect } from 'vitest';
import { hostMatchesPattern, parsePatterns, matchRule, type Rule } from './rules';

describe('hostMatchesPattern', () => {
  it('exact host', () => {
    expect(hostMatchesPattern('music.youtube.com', 'music.youtube.com')).toBe(true);
    expect(hostMatchesPattern('youtube.com', 'music.youtube.com')).toBe(false);
  });

  it('ignores a leading www. on the host', () => {
    expect(hostMatchesPattern('www.youtube.com', 'youtube.com')).toBe(true);
    expect(hostMatchesPattern('www.youtube.com', 'youtube.')).toBe(true);
    expect(hostMatchesPattern('www.youtube.com', '.youtube.')).toBe(true);
    expect(hostMatchesPattern('www.youtube.com', '.youtube.com')).toBe(true);
  });

  it('trailing dot — name + any tld, no subdomains', () => {
    expect(hostMatchesPattern('youtube.com', 'youtube.')).toBe(true);
    expect(hostMatchesPattern('youtube.gg', 'youtube.')).toBe(true);
    expect(hostMatchesPattern('music.youtube.com', 'youtube.')).toBe(false);
    expect(hostMatchesPattern('myyoutube.com', 'youtube.')).toBe(false);
  });

  it('leading + trailing — name anywhere, any tld', () => {
    expect(hostMatchesPattern('youtube.com', '.youtube.')).toBe(true);
    expect(hostMatchesPattern('music.youtube.com', '.youtube.')).toBe(true);
    expect(hostMatchesPattern('youtube.gg', '.youtube.')).toBe(true);
    expect(hostMatchesPattern('notyoutube.com', '.youtube.')).toBe(false);
  });

  it('leading only — any subdomain, fixed tld', () => {
    expect(hostMatchesPattern('music.youtube.com', '.youtube.com')).toBe(true);
    expect(hostMatchesPattern('youtube.com', '.youtube.com')).toBe(true);
    expect(hostMatchesPattern('youtube.gg', '.youtube.com')).toBe(false);
  });

  it('bare word — shorthand for name + any tld', () => {
    expect(hostMatchesPattern('soundcloud.com', 'soundcloud')).toBe(true);
    expect(hostMatchesPattern('soundcloud.gg', 'soundcloud')).toBe(true);
    expect(hostMatchesPattern('m.soundcloud.com', 'soundcloud')).toBe(false);
  });

  it('film piracy case — one name, many tlds', () => {
    expect(hostMatchesPattern('film.gg', 'film.')).toBe(true);
    expect(hostMatchesPattern('film.lol', 'film.')).toBe(true);
    expect(hostMatchesPattern('myfilm.com', 'film.')).toBe(false);
  });

  it('trailing dot on a dotted core (music.youtube.)', () => {
    expect(hostMatchesPattern('music.youtube.com', 'music.youtube.')).toBe(true);
    expect(hostMatchesPattern('music.youtube.gg', 'music.youtube.')).toBe(true);
    expect(hostMatchesPattern('youtube.com', 'music.youtube.')).toBe(false);
  });

  it('normalizes trailing dot + case in the host', () => {
    expect(hostMatchesPattern('YouTube.COM.', 'youtube.')).toBe(true);
  });

  it('empty inputs never match', () => {
    expect(hostMatchesPattern('', 'youtube.')).toBe(false);
    expect(hostMatchesPattern('youtube.com', '')).toBe(false);
    expect(hostMatchesPattern('youtube.com', '..')).toBe(false);
  });
});

describe('parsePatterns', () => {
  it('splits on slash, comma, whitespace, newlines', () => {
    expect(parsePatterns('film./kino./flix.')).toEqual(['film.', 'kino.', 'flix.']);
    expect(parsePatterns('soundcloud, .youtube.\n spotify.')).toEqual(['soundcloud', '.youtube.', 'spotify.']);
    expect(parsePatterns('   ')).toEqual([]);
  });
});

describe('matchRule', () => {
  const rules: Rule[] = [
    { id: 'a', patterns: ['film.', 'kino.'], mode: 'preset', preset: 'Film', enabled: true },
    { id: 'b', patterns: ['.youtube.'], mode: 'preset', preset: 'Music', enabled: true },
    { id: 'c', patterns: ['spotify.'], mode: 'preset', preset: 'Off', enabled: false }
  ];

  it('returns the first matching enabled rule', () => {
    expect(matchRule('film.gg', rules)?.id).toBe('a');
    expect(matchRule('music.youtube.com', rules)?.id).toBe('b');
  });

  it('skips disabled rules', () => {
    expect(matchRule('spotify.com', rules)).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(matchRule('example.org', rules)).toBeNull();
  });

  it('first rule wins on overlap', () => {
    const overlap: Rule[] = [
      { id: '1', patterns: ['.youtube.'], mode: 'preset', preset: 'A', enabled: true },
      { id: '2', patterns: ['music.youtube.'], mode: 'preset', preset: 'B', enabled: true }
    ];
    expect(matchRule('music.youtube.com', overlap)?.id).toBe('1');
  });
});
