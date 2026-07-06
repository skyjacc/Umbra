// Domain rules — pattern-based EQ assignment. A rule maps one or more hostname
// patterns to a target (a named preset OR an inline curve). At capture time the
// engine finds the first matching enabled rule for a tab's hostname.
//
// Pattern language (dots are markers):
//   music.youtube.com   exact host
//   youtube.            registrable name + ANY tld, no subdomains   (youtube.com, youtube.gg)
//   .youtube.           name anywhere: subdomains + any tld         (music.youtube.com, youtube.gg)
//   .youtube.com        any subdomain, fixed tld                    (music.youtube.com, youtube.com)
//   soundcloud          bare word == "soundcloud." (name + any tld)
// A rule may hold several patterns (OR); the first rule whose ANY pattern matches wins.
//
// Caveat: matching is label-based with no Public Suffix List, so multi-part TLDs
// (e.g. .co.uk) are matched approximately. Fine for the single-label TLDs common on
// streaming/piracy sites (.com/.gg/.lol/.to/.ru).
import type { PresetBands } from './presets';

export interface Rule {
  id: string;
  patterns: string[];
  mode: 'preset' | 'curve';
  preset?: string; // when mode === 'preset'
  curve?: PresetBands; // when mode === 'curve'
  gain?: number; // optional master gain for curve mode
  enabled: boolean;
}

export const normHost = (host: string): string => (host || '').toLowerCase().replace(/\.+$/, '');

// Split a raw textarea/string of patterns into individual patterns.
export const parsePatterns = (raw: string): string[] =>
  (raw || '')
    .split(/[\s,/\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export function hostMatchesPattern(host: string, pattern: string): boolean {
  const h = normHost(host);
  if (!h) return false;
  const p = (pattern || '').trim().toLowerCase();
  if (!p) return false;

  let lead = p.startsWith('.');
  let trail = p.endsWith('.');
  const core = p.replace(/^\.+/, '').replace(/\.+$/, '');
  if (!core) return false;
  // A bare word ("soundcloud") is shorthand for "soundcloud." — name + any tld.
  if (!lead && !trail && !core.includes('.')) trail = true;

  const hl = h.split('.');
  const cl = core.split('.');

  if (!lead && !trail) return h === core; // exact host (has dots, no markers)

  if (trail && !lead) {
    // registrable name + exactly one tld label, no subdomains
    return hl.length === cl.length + 1 && hl.slice(0, cl.length).join('.') === core;
  }
  if (lead && !trail) {
    // any subdomain, fixed suffix (core already includes the tld)
    return h === core || h.endsWith('.' + core);
  }
  // lead && trail: the core label-run appears anywhere, any tld
  for (let i = 0; i + cl.length <= hl.length; i++) {
    if (hl.slice(i, i + cl.length).join('.') === core) return true;
  }
  return false;
}

export function ruleMatchesHost(rule: Rule, host: string): boolean {
  if (!rule || rule.enabled === false) return false;
  return (rule.patterns || []).some((p) => hostMatchesPattern(host, p));
}

// First enabled rule whose any pattern matches the host, or null.
export function matchRule(host: string, rules: Rule[]): Rule | null {
  for (const r of rules || []) if (ruleMatchesHost(r, host)) return r;
  return null;
}

// Deterministic-ish id without Date.now()/Math.random (banned in some contexts):
// caller passes a seed (e.g. an incrementing counter or a hostname).
export const makeRuleId = (seed: string): string => 'r_' + seed.replace(/[^a-z0-9]+/gi, '').slice(0, 24) + '_' + seed.length;
