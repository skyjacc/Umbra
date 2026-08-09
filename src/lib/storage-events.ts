// Which of the popup's mirrors a storage change invalidates.
//
// Umbra runs in two places at once: the browser-action popup and the "Full window" page, which is
// a first-class editor of the everywhere-sound and a long-lived ordinary tab. Anything one of them
// writes, the other has to hear about, or it keeps working from a stale copy and its next edit
// writes that copy back — a lost update between two windows of the same extension.
//
// The handler this replaces returned early for every area but `sync`. RULES is in sync, so rules
// propagated; DEFAULT_EQ is in `local`, so the global profile never did. Leave the full-window
// editor open, change the profile a few times from the popup, then touch one band in the full
// window: every change in between is silently overwritten.
//
// Keeping the decision here rather than inside the listener is what makes it testable — the popup
// has no behavioural test, and "does an unrelated key wake anything up" is exactly the kind of
// thing that quietly stops being true.

import { RULES_KEY, DEFAULT_EQ_KEY, PRESET_PREFIX } from './engine-io';

export interface StorageRefresh {
  presets: boolean;
  rules: boolean;
  global: boolean;
}

export const NOTHING: StorageRefresh = { presets: false, rules: false, global: false };

/**
 * Area-aware on purpose. A `DEFAULT_EQ` arriving in sync is not ours and neither is a `RULES` in
 * local; matching on the key alone would have this react to a name collision from another author.
 */
export function refreshFor(area: string, keys: string[]): StorageRefresh {
  if (area === 'sync') {
    return {
      presets: keys.some((k) => k.startsWith(PRESET_PREFIX)),
      rules: keys.includes(RULES_KEY),
      global: false
    };
  }
  if (area === 'local') {
    // Deliberately not the journal: it is this session's own write-ahead scratch, and reacting to
    // it would have the popup chase its own tail during a drag.
    return { presets: false, rules: false, global: keys.includes(DEFAULT_EQ_KEY) };
  }
  return NOTHING;
}
