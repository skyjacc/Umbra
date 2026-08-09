import { describe, it, expect } from 'vitest';
import { refreshFor, NOTHING } from './storage-events';
import { RULES_KEY, DEFAULT_EQ_KEY, JOURNAL_KEY, PRESET_PREFIX } from './engine-io';

describe('what a storage change should make the popup re-read', () => {
  it('refreshes the rules when RULES changes', () => {
    expect(refreshFor('sync', [RULES_KEY])).toEqual({ presets: false, rules: true, global: false });
  });

  it('refreshes the global profile when DEFAULT_EQ changes', () => {
    // The lost update this exists to stop. DEFAULT_EQ lives in `local`, and the handler used to
    // return early for every area but `sync` — so the long-lived Full-window editor never learned
    // that the popup had changed the everywhere-sound, and its next edit wrote an hour-old curve
    // back over it.
    expect(refreshFor('local', [DEFAULT_EQ_KEY])).toEqual({ presets: false, rules: false, global: true });
  });

  it('refreshes the presets when any preset key changes', () => {
    expect(refreshFor('sync', [PRESET_PREFIX + 'Vocal'])).toEqual({ presets: true, rules: false, global: false });
  });

  it('does nothing for an unrelated local key', () => {
    expect(refreshFor('local', [JOURNAL_KEY])).toEqual(NOTHING);
    expect(refreshFor('local', ['SOMETHING_ELSE'])).toEqual(NOTHING);
  });

  it('does nothing for an unrelated sync key', () => {
    expect(refreshFor('sync', ['SOMETHING_ELSE'])).toEqual(NOTHING);
  });

  it('does not confuse the two areas', () => {
    // Same key name, wrong area: a DEFAULT_EQ in sync is not ours, and RULES in local is not either.
    expect(refreshFor('sync', [DEFAULT_EQ_KEY])).toEqual(NOTHING);
    expect(refreshFor('local', [RULES_KEY])).toEqual(NOTHING);
  });

  it('handles several keys landing in one event', () => {
    expect(refreshFor('sync', [RULES_KEY, PRESET_PREFIX + 'Vocal'])).toEqual({ presets: true, rules: true, global: false });
  });

  it('ignores the session area entirely', () => {
    // background.js keeps stoppedTabs there; it is a UX hint, not user state.
    expect(refreshFor('session', ['stoppedTabs'])).toEqual(NOTHING);
  });

  it('does nothing for an empty change set', () => {
    expect(refreshFor('local', [])).toEqual(NOTHING);
  });
});
