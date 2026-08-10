import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readWorld, readRules, readDefaultEq, RULES_KEY, DEFAULT_EQ_KEY } from './engine-io';

// engine-io is the persistence boundary and had no tests. This file covers the one question the
// reset undo now depends on, and it exists because a mutation proved the gap: making readWorld's
// catch return `{ rules: [], global: null }` instead of `null` left the whole suite green while
// reintroducing a destructive bug.
//
// The bug it was written for: a reader that answers `[]` for BOTH "there are no rules" and "the
// read threw". A Reset profile on an install with no rules fingerprints exactly the empty world,
// so a swallowed read failure reproduces that fingerprint, the undo's staleness check concludes
// "nothing has changed", and it writes an empty rules array over a rule that arrived in between.
// readWorld exists solely to be able to say "I don't know", and this pins that it does.
//
// readRules had the same flaw for the ordinary path, and in the 2.5 smoke it cost a real rule.
// It reports failure now too — see the two describes below.

type Area = { get: (k: string) => Promise<Record<string, unknown>> };
const area = (data: Record<string, unknown>): Area => ({ get: async () => ({ ...data }) });
const failing = (): Area => ({
  get: async () => {
    throw new Error('storage unavailable');
  }
});

const install = (sync: Area, local: Area) => {
  (globalThis as any).chrome = { runtime: {}, storage: { sync, local } };
};

const RULE = { id: 'r1', patterns: ['youtube.'], mode: 'curve', enabled: true };
const STORED_EQ = {
  v: 1,
  filters: Array.from({ length: 11 }, () => ({ f: 1000, g: 3, q: 0.7071 })),
  gain: 1,
  preset: 'Vocal',
  updatedAt: 1
};

beforeEach(() => install(area({ [RULES_KEY]: [RULE] }), area({ [DEFAULT_EQ_KEY]: STORED_EQ })));
afterEach(() => {
  delete (globalThis as any).chrome;
});

describe('readWorld — the reader that can admit it failed', () => {
  it('returns both halves when both reads succeed', async () => {
    const w = await readWorld();
    expect(w).not.toBeNull();
    expect(w!.rules).toEqual([RULE]);
    expect(w!.global?.presetName).toBe('Vocal');
    expect(w!.global?.bands).toHaveLength(11);
  });

  it('returns null — not an empty world — when the RULES read throws', async () => {
    // THE BUG, in one assertion. `{ rules: [], global: null }` here is indistinguishable from a
    // real empty install, and the undo would take it as "nothing changed" and delete rules.
    install(failing(), area({ [DEFAULT_EQ_KEY]: STORED_EQ }));
    expect(await readWorld()).toBeNull();
  });

  it('returns null when the DEFAULT_EQ read throws', async () => {
    // The two live in different storage areas — RULES in sync, DEFAULT_EQ in local — so they fail
    // independently, and half a world is not a world to decide on.
    install(area({ [RULES_KEY]: [RULE] }), failing());
    expect(await readWorld()).toBeNull();
  });

  it('returns null when there is no chrome runtime at all', async () => {
    delete (globalThis as any).chrome;
    expect(await readWorld()).toBeNull();
  });

  it('distinguishes a genuinely empty install from a failure', async () => {
    // Empty is a real, common answer — a fresh install with no rules and no saved profile — and
    // it must NOT read as failure, or the undo could never fire there at all.
    install(area({}), area({}));
    const w = await readWorld();
    expect(w).not.toBeNull();
    expect(w!.rules).toEqual([]);
    expect(w!.global).toBeNull();
  });

  it('treats a non-array RULES value as no rules rather than crashing', async () => {
    install(area({ [RULES_KEY]: 'corrupt' }), area({}));
    const w = await readWorld();
    expect(w!.rules).toEqual([]);
  });

  it('parses the global profile exactly as the ordinary reader does', async () => {
    // Two readers, one parse. If they ever diverged, the undo would compare a world against a
    // differently-shaped copy of itself and refuse every time.
    const viaWorld = (await readWorld())!.global;
    const viaReader = await readDefaultEq();
    expect(viaWorld).toEqual(viaReader);
  });
});

describe('reading the rules — and what a failed read is allowed to mean', () => {
  // THE BUG, reproduced in a real browser on 2026-08-10 and then here. readRules used to answer
  // `[]` for BOTH "there are no rules" and "the read threw". A single rejected sync.get emptied
  // the popup's list, the user saw "no rules", created one, and the save wrote a one-element
  // array over a rule that was still in storage. Nothing anywhere reported a problem.
  //
  // Two things had to change, and both are pinned below: the reader has to be able to say "I
  // don't know", and the writer has to refuse until somebody has actually read.

  it('answers with the rules when the read succeeds', async () => {
    expect(await readRules()).toEqual([RULE]);
  });

  it('answers [] when the read succeeds and there genuinely are none', async () => {
    install(area({}), area({}));
    expect(await readRules()).toEqual([]);
  });

  it('answers null when the read fails — NOT []', async () => {
    install(failing(), area({}));
    expect(await readRules()).toBeNull();
  });

  it('answers null rather than [] when there is no storage at all', async () => {
    delete (globalThis as any).chrome;
    expect(await readRules()).toBeNull();
  });
});

describe('writing the rules — refused until a read has succeeded', () => {
  /** A read/write area, so a test can see what actually landed in storage. */
  const rw = (data: Record<string, unknown>) => {
    const store: Record<string, unknown> = { ...data };
    return {
      area: {
        get: async () => ({ ...store }),
        set: async (patch: Record<string, unknown>) => void Object.assign(store, patch)
      },
      read: () => store
    };
  };
  /** A fresh module, because "has this document read the rules" is per document. */
  const fresh = async () => {
    vi.resetModules();
    return await import('./engine-io');
  };
  const NEW_RULE = { id: 'r2', patterns: ['spotify.'], mode: 'preset', enabled: true, preset: 'Bass Boost' } as any;

  it('refuses a write when the rules were never read', async () => {
    const sync = rw({ [RULES_KEY]: [RULE] });
    install(sync.area as any, area({}));
    const io = await fresh();
    const res = await io.writeRulesResult([NEW_RULE]);
    expect(res.ok).toBe(false);
    expect(sync.read()[RULES_KEY], 'storage must be untouched').toEqual([RULE]);
  });

  it('allows the write once a read has succeeded', async () => {
    const sync = rw({ [RULES_KEY]: [RULE] });
    install(sync.area as any, area({}));
    const io = await fresh();
    expect(await io.readRules()).toEqual([RULE]);
    expect((await io.writeRulesResult([NEW_RULE])).ok).toBe(true);
    expect(sync.read()[RULES_KEY]).toHaveLength(1);
  });

  it('THE LOSS: a failed read then a new rule must not delete the rule that was there', async () => {
    // End to end, in the order it happened. The popup boots, the read throws, the user adds a
    // rule. Before the fix this left storage holding only the new one.
    const store: Record<string, unknown> = { [RULES_KEY]: [RULE] };
    install(
      {
        get: async () => {
          throw new Error('storage unavailable');
        },
        set: async (patch: Record<string, unknown>) => void Object.assign(store, patch)
      } as any,
      area({})
    );
    const io = await fresh();
    expect(await io.readRules()).toBeNull();
    expect((await io.writeRulesResult([NEW_RULE])).ok).toBe(false);
    expect(store[RULES_KEY], 'the rule that was never read is still there').toEqual([RULE]);
  });

  it('recovers: a read that succeeds later re-enables writing', async () => {
    let broken = true;
    const store: Record<string, unknown> = { [RULES_KEY]: [RULE] };
    install(
      {
        get: async () => {
          if (broken) throw new Error('storage unavailable');
          return { ...store };
        },
        set: async (patch: Record<string, unknown>) => void Object.assign(store, patch)
      } as any,
      area({})
    );
    const io = await fresh();
    expect(await io.readRules()).toBeNull();
    expect((await io.writeRulesResult([NEW_RULE])).ok).toBe(false);

    broken = false;
    expect(await io.readRules()).toEqual([RULE]);
    expect((await io.writeRulesResult([RULE, NEW_RULE])).ok).toBe(true);
    expect(store[RULES_KEY]).toHaveLength(2);
  });

  it('THE STALE LIST: a read that fails AFTER a good one closes the door again', async () => {
    // The second version of the same bug, found in review. A first draft latched the flag on and
    // never cleared it, which is only half the question. Two windows of this extension:
    //
    //   1. this popup reads [A]                          — the list matches storage
    //   2. the other window adds C; storage is [A, C]     — ours is now stale
    //   3. our refresh read fails                         — we do not learn about C
    //   4. the user toggles A                             — we write [A'] and C is gone
    //
    // The list being preserved at step 3 is right and not enough: preserved is not current. A
    // whole-array replace may only be built on a list known to reflect what is there.
    let broken = false;
    const store: Record<string, unknown> = { [RULES_KEY]: [RULE] };
    install(
      {
        get: async () => {
          if (broken) throw new Error('storage unavailable');
          return { ...store };
        },
        set: async (patch: Record<string, unknown>) => void Object.assign(store, patch)
      } as any,
      area({})
    );
    const io = await fresh();

    expect(await io.readRules()).toEqual([RULE]); // step 1
    store[RULES_KEY] = [RULE as any, NEW_RULE]; // step 2, by the other window
    broken = true;
    expect(await io.readRules()).toBeNull(); // step 3

    expect((await io.writeRulesResult([RULE as any])).ok, 'the write must be refused, not merely stale').toBe(false); // step 4
    expect(store[RULES_KEY], 'the rule this document never saw is still there').toEqual([RULE, NEW_RULE]);
  });

  it('writeRules, the boolean spelling, refuses on the same terms', async () => {
    const sync = rw({ [RULES_KEY]: [RULE] });
    install(sync.area as any, area({}));
    const io = await fresh();
    expect(await io.writeRules([NEW_RULE])).toBe(false);
    expect(sync.read()[RULES_KEY]).toEqual([RULE]);
  });
});

describe('the swallowing reader, for contrast', () => {
  it('readDefaultEq answers null for a failure, same reason', async () => {
    install(area({}), failing());
    expect(await readDefaultEq()).toBeNull();
  });
});
