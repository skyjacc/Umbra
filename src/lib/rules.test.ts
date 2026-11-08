import { describe, it, expect } from 'vitest';
import { hostMatchesPattern, parsePatterns, matchRule, patternForHost, normHost, type Rule } from './rules';

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

describe('patternForHost', () => {
  it('uses the host verbatim for the exact scope', () => {
    expect(patternForHost('music.youtube.com', 'exact')).toBe('music.youtube.com');
  });

  it('strips a leading www. so www.site and site are one', () => {
    expect(patternForHost('www.youtube.com', 'exact')).toBe('youtube.com');
    expect(patternForHost('www.youtube.com', 'anyTld')).toBe('youtube.');
  });

  it('picks the registrable name for the any-TLD scope', () => {
    expect(patternForHost('youtube.com', 'anyTld')).toBe('youtube.');
    expect(patternForHost('music.youtube.com', 'anyTld')).toBe('youtube.');
  });

  it('picks the registrable name for the any-subdomain scope', () => {
    expect(patternForHost('music.youtube.com', 'anySub')).toBe('.youtube.');
  });

  it('steps past a second-level label under a two-letter ccTLD', () => {
    // Without the guard these would yield "co", and ".co." would match amazon.co.jp and much else.
    expect(patternForHost('bbc.co.uk', 'anyTld')).toBe('bbc.');
    expect(patternForHost('www.amazon.co.jp', 'anySub')).toBe('.amazon.');
  });

  it('does not step past a second-level label under a long TLD', () => {
    // "co" here is the registrable name, not a suffix component.
    expect(patternForHost('co.company', 'anyTld')).toBe('co.');
  });

  it('handles a single-label host', () => {
    expect(patternForHost('localhost', 'exact')).toBe('localhost');
    expect(patternForHost('localhost', 'anyTld')).toBe('localhost.');
  });

  it('returns an empty pattern for an empty host', () => {
    for (const s of ['exact', 'anyTld', 'anySub'] as const) expect(patternForHost('', s)).toBe('');
  });

  it('produces exact and any-subdomain patterns that match the host they came from', () => {
    // The two halves of the pattern language must agree, or a one-click rule would be inert.
    for (const host of ['youtube.com', 'music.youtube.com', 'bbc.co.uk', 'www.spotify.com']) {
      for (const s of ['exact', 'anySub'] as const) {
        const p = patternForHost(host, s);
        expect(hostMatchesPattern(normHost(host), p), `${host} / ${s} -> ${p}`).toBe(true);
      }
    }
  });

  it('any-TLD deliberately excludes subdomains, so on a subdomain host it does not match', () => {
    // Documented semantics, not a defect: `youtube.` means "registrable name + any TLD, no
    // subdomains" (see the pattern table). Picking that scope while on music.youtube.com therefore
    // yields a rule that does not cover the current page — the any-subdomain scope is the one that
    // does. Pinned here so the behaviour is a decision rather than a surprise.
    expect(hostMatchesPattern('youtube.com', patternForHost('youtube.com', 'anyTld'))).toBe(true);
    expect(hostMatchesPattern('music.youtube.com', patternForHost('music.youtube.com', 'anyTld'))).toBe(false);
    expect(hostMatchesPattern('music.youtube.com', patternForHost('music.youtube.com', 'anySub'))).toBe(true);
  });
});
