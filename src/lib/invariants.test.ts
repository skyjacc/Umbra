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
import appSrc from '../popup/App.tsx?raw';
import eqGraphSrc from '../popup/components/EqGraph.tsx?raw';
import bandFieldsSrc from '../popup/components/BandFields.tsx?raw';
import navSrc from '../popup/components/BottomNav.tsx?raw';
import bandInputSrc from './band-input.ts?raw';
import resetSrc from './reset.ts?raw';
import resetChangesSrc from './reset-changes.ts?raw';
// `?raw` returns an empty string for CSS here — vitest stubs stylesheets — so this one is read
// off disk. The popup's geometry is the kind of contract that is worth an exception: three
// separate pieces of content moved the window before it was written down.
import { readFileSync } from 'node:fs';
const cssSrc = readFileSync(new URL('../popup/index.css', import.meta.url), 'utf8');
import deploySrc from '../../DEPLOY.md?raw';

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

  it('turning bypass ON writes nothing; turning it OFF is where the draft is saved', () => {
    // Bypass is a draft mode: while it is on, nothing is persisted — not the debounced commit and
    // not the write-ahead journal, because a journal entry written under bypass would be replayed
    // by the next popup as an edit the user never confirmed. Leaving bypass is the one moment that
    // draft becomes a save, so the two halves live in different functions and only the ON half is
    // fenced. A behavioural test would pass with a stray save in here, so assert on the source.
    const block = useEngineSrc.match(/--- bypass:on:start[\s\S]*?--- bypass:on:end/)?.[0];
    expect(block, 'bypass:on:start / bypass:on:end markers not found in useEngine.ts').toBeTruthy();

    // Strip comments first: the block deliberately NAMES these writers to explain the rule.
    const code = block!.replace(/\/\/.*$/gm, '');
    for (const writer of ['commitTarget', 'writeDefaultEq', 'writeRules', 'writeRulesResult', 'writeJournal', 'clearJournal', 'recordJournal']) {
      expect(code, `entering bypass must not call ${writer}`).not.toContain(writer);
    }
    // It must also leave the editing buffer alone, so the graph keeps showing the real curve.
    for (const mutator of ['bandsRef.current =', 'setBands(', 'gainRef.current =', 'setGain(']) {
      expect(code, `entering bypass must not touch ${mutator}`).not.toContain(mutator);
    }

    // The counterweight, so the guard above cannot be satisfied by never saving the draft at all.
    const leave = useEngineSrc.match(/const leaveBypass = useCallback\([\s\S]*?\n  \}, \[/)?.[0];
    expect(leave, 'leaveBypass not found').toBeTruthy();
    expect(leave, 'leaving bypass must be able to write the draft').toContain('commitTarget(');
    expect(leave, 'and must not write when no draft was made').toContain('commitOnUnbypass(');

    // Durability. A bypass draft is deliberately kept out of the journal while bypass is on, so at
    // this moment it exists in exactly one place: memory. commitTarget's storage write is async and
    // the popup can be destroyed the instant the user clicks away, so the write-ahead record has to
    // go first — otherwise "bypass, shape it, switch off, close" loses the draft outright.
    const jIdx = leave!.indexOf('recordJournal(true)');
    const cIdx = leave!.indexOf('commitTarget(');
    expect(jIdx, 'leaveBypass must write the draft ahead of committing it').toBeGreaterThan(-1);
    expect(jIdx, 'and must do it BEFORE the commit, not after').toBeLessThan(cIdx);
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

  it('the rules array is never written by a document that could not read it', () => {
    // A write replaces the WHOLE array, so one assembled from a list we failed to read deletes
    // every rule we never saw. That happened, in a browser, on 2026-08-10: one rejected sync.get
    // emptied the popup's list, the user added a rule, and the save persisted just that one.
    //
    // engine-io.test.ts pins the behaviour. This pins the two spellings that would quietly undo
    // it — a reader that swallows, and a call site that coerces the failure straight back to [].
    const read = engineIoSrc.match(/export async function readRules[\s\S]*?\n}/)?.[0] ?? '';
    expect(read, 'a failed read must report itself').toContain('return null');

    const write = engineIoSrc.match(/export async function writeRulesResult[\s\S]*?\n}/)?.[0] ?? '';
    expect(write, 'and the write must refuse until a read has succeeded').toContain('rulesRead');
    expect(
      write.indexOf('rulesRead'),
      'the refusal has to come before the set, or it guards nothing'
    ).toBeLessThan(write.indexOf('chrome.storage.sync.set'));

    // Both call sites in the popup compare against null. `?? []` or `|| []` here is the bug.
    const boot = useEngineSrc.match(/Promise\.all\(\[io\.readInitialState\(\)[\s\S]*?globalRef\.current = g;/)?.[0];
    const refresh = useEngineSrc.match(/if \(want\.rules\)[\s\S]*?if \(want\.global\)/)?.[0];
    for (const [name, site] of [
      ['the boot read', boot],
      ['the storage-change read', refresh]
    ] as const) {
      expect(site, `${name} not found — this test is anchored to it`).toBeTruthy();
      // Comments off first: both sites name the bad spelling in prose so the next reader knows
      // what not to write, and that prose must not be what fails the test.
      const code = site!.replace(/\/\/.*$/gm, '');
      expect(code, `${name} must not coerce a failure to an empty list`).not.toMatch(/\?\?\s*\[\]|\|\|\s*\[\]/);
      expect(code, `${name} must recognise the failure explicitly`).toContain('=== null');
      // `=== null` present and the list emptied anyway is a real mutation — it survived a review
      // round. The write guard stops it costing data, but the user is still shown "No rules yet"
      // for rules that exist, which is its own half of the promise.
      expect(code, `${name} must not empty the list on a failure`).not.toMatch(/setRules\(\s*\[\s*\]\s*\)|setRulesMirror\(\s*\[\s*\]\s*\)/);
    }

    // And the boot read hands the NULLABLE result to planReplay. Passing the mirror instead makes
    // an unreadable rule set indistinguishable from an empty one, and a rule-targeted recovery
    // journal is then discarded — see journal.ts, and the test there that pins both answers.
    const replayCall = useEngineSrc.match(/planReplay\(\{[\s\S]*?\}\)/)?.[0];
    expect(replayCall, 'the planReplay call was not found').toBeTruthy();
    expect(replayCall, 'planReplay must be told when the rules are unknown').toContain('rules: rs === null ? null :');

    // NOTE. These four are source assertions, and this codebase has learned what they are worth —
    // ten one-line mutations walked through the last set. They are here because the two call sites
    // live in a hook with no behavioural harness; the harness is the real answer and is on the 2.6
    // list. What genuinely prevents the data loss is the engine-io guard above, which IS covered
    // behaviourally in engine-io.test.ts. Do not mistake this block for that.
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

  it('a save reads the editing buffer, never the preview override', () => {
    // Bypass replaces what you HEAR, not what you have shaped, so "bypass, then save for this
    // site" must store the curve rather than silence.
    //
    // This is the invariant bandsForSave() was written to express, and could not: it was the
    // identity function, so its tests asserted that identity is identity and stayed green through
    // a mutation that made the save store flat. The decision it described happens at the call
    // site, so that is where it is now asserted.
    const save = useEngineSrc.match(/const saveRuleFromCurrent = useCallback\([\s\S]*?\n  \);/)?.[0];
    expect(save, 'saveRuleFromCurrent not found').toBeTruthy();
    expect(save, 'the save must read the editing buffer').toContain('bandsToPreset(bandsRef.current)');

    // The override is a thing to play, never a thing to keep. Nothing in the popup may read it.
    expect(useEngineSrc, 'no popup path may persist the preview override').not.toContain('overrideBands');
  });

  it('a commit carries provenance instead of erasing it', () => {
    // The bug this pins was invisible for 200ms. A drag kept "Vocal" on screen, then the debounced
    // commit fired with presetName defaulted to '' and the header dropped to "None" on its own.
    // Removing the default is what makes an omission a type error rather than a silent erase, so
    // the absence of that default is the thing worth asserting.
    const sig = useEngineSrc.match(/const commitTarget = useCallback\(\s*\n?\s*\(([^)]*)\)/)?.[1] ?? '';
    expect(sig, 'commitTarget signature not found').toContain('presetName');
    expect(sig, 'presetName must not default — omitting it has to fail the typecheck').not.toMatch(/presetName\s*=/);

    // And the live-edit pushes must not blank the engine's per-tab label either, or the Tabs view
    // and the header would disagree about the same tab for the length of a drag.
    expect(useEngineSrc, 'a live edit must not blank the engine label').not.toContain("activePreset: ''");
  });

  it('the graph is editable whenever the tab is captured, bypass or not', () => {
    // Bypass is an audio-path state. Every parametric EQ worth the name keeps its curve editable
    // while bypassed, and the lock this replaces was load-bearing by accident — it was the only
    // thing stopping an edit made against a stale buffer from reaching storage. Re-adding the term
    // is a one-token edit that reads as harmless, so it is spelled out here.
    expect(appSrc).not.toContain('eng.canEdit && !eng.bypassed');
    expect(appSrc, 'the graph needs the flag to show what is audible').toContain('bypassed={eng.bypassed}');
  });

  it('a bypassed tab is sent flat, and a drag is not sent to it at all', () => {
    const enter = useEngineSrc.match(/--- bypass:on:start[\s\S]*?--- bypass:on:end/)?.[0] ?? '';
    expect(enter, 'entering bypass must send a flat curve').toContain('eqFilters: io.flatBands()');
    // Bypass must not mute: it silences the equalizer, not the user's volume. It goes through
    // sentGain like every other push, which on a flat curve is the identity — Auto Gain has
    // nothing to compensate for when nothing is being boosted.
    expect(enter, 'and must keep the master volume it found').toContain('gainRef.current');
    expect(enter, 'bypass is not a mute').not.toMatch(/gain: 0[,\s}]/);

    // The live handlers each push their own message and never consulted the preview, so the guard
    // has to be at those two sites. Only the eleven filters are gated: modifyGain keeps flowing,
    // because bypassing the equalizer is not muting the user's volume.
    const drag = useEngineSrc.match(/const onBandsLive = useCallback\([\s\S]*?\n  \);/)?.[0] ?? '';
    expect(drag, 'onBandsLive must not push to a bypassed tab').toContain('sendsBandsToActiveTab(');
    expect(drag, 'and must push the curve being dragged, not the stored one').toContain('eqFilters: nb');
    expect(drag, 'a draft must not be journalled').toContain('persistsNow(');

    const gain = useEngineSrc.match(/const onGainLive = useCallback\([\s\S]*?\n  \);/)?.[0] ?? '';
    expect(gain, 'the master volume stays audible under bypass').not.toContain('sendsBandsToActiveTab(');
  });

  it('one undo, owned by one reset, cleared by a write and not by a clock', () => {
    // The bug: setCanUndoReset(false) existed only inside undoReset, showNotice cleared just the
    // text after 5s, and the toast and its button were gated on DIFFERENT values. So a later
    // "Saved" or "Copied" turned up wearing a live Undo that wrote back a rules array from
    // minutes earlier, over everything done since.
    expect(useEngineSrc, 'the boolean-beside-a-ref shape is what allowed the drift').not.toContain('setCanUndoReset');
    expect(useEngineSrc, 'resetSnapshot must not be a second holder').not.toContain('resetSnapshot');

    // Every canonical write moves the world past the snapshot.
    for (const ev of ['commit', 'rules-write', 'save-for-site']) {
      expect(useEngineSrc, `a ${ev} must invalidate the undo`).toContain(`noteUndoEvent('${ev}')`);
    }

    // And the toast may only offer the undo it armed itself.
    expect(appSrc, 'the toast button must belong to its own notice').toContain('eng.notice.undo && eng.canUndoReset');
  });

  it('Reset sits in the main row and Reset profile does not', () => {
    // Two different actions that both sound like "reset". One restores and can only return the
    // user somewhere they already were; the other DELETES the site's rule or flattens the
    // everywhere-sound. They must never share a position, or muscle memory built on the harmless
    // one will one day land on the destructive one.
    expect(appSrc, 'the restoring one belongs next to Save').toContain('eng.resetChanges');
    expect(appSrc, 'and is gated on its own state, never on a notice or its timer').toContain('eng.canResetChanges &&');

    const row = appSrc.match(/<div className="flex gap-2">[\s\S]*?\n          <\/div>/)?.[0] ?? '';
    expect(row, 'main action row not found').toBeTruthy();
    expect(row, 'the destructive reset must stay in More').not.toContain('eng.resetProfile');
  });

  it('the Reset control outlives the auto-commit', () => {
    // The first attempt was gated on there being an UN-COMMITTED edit, which lasts about 200ms:
    // it appeared on pointer-down and vanished a fifth of a second after pointer-up. Keying on the
    // tested predicate — which counts a landed commit as still resettable — is the fix, so the
    // wiring is asserted rather than the shape of the expression.
    expect(useEngineSrc, 'the shipped answer must come from the tested predicate').toContain('canResetChanges({');
    expect(useEngineSrc, 'and must know whether anything reached storage').toContain('committedSinceBaseline');
    expect(useEngineSrc, 'a landed commit keeps it offerable').toMatch(/committedSinceBaseline\.current = true;\s*\n\s*refreshResettable\(\);/);
  });

  it('a restored global profile keeps the preset it came from', () => {
    // TypeScript will not catch this one: a writer declared with fewer parameters is still
    // assignable, so `writeGlobal: (bands, gain) => io.writeDefaultEq(bands, gain)` typechecked
    // while dropping the name on every Save-for-this-site rollback.
    expect(useEngineSrc, 'the save rollback must forward provenance').toContain(
      'writeGlobal: (bands, gain, presetName) => io.writeDefaultEq(bands, gain, presetName)'
    );
    // Reset and Undo now go through one shared writer set, so the guarantee lives there and in the
    // appliers rather than being repeated at each call site.
    expect(useEngineSrc, 'the shared restore writer must forward provenance').toContain(
      'writeGlobal: (bands, gain, presetName) => io.writeDefaultEq(bands, gain, presetName)'
    );
    expect(resetChangesSrc, 'the restore applier must pass it on').toContain('w.writeGlobal(to.bands, to.gain, to.presetName)');
    expect(resetSrc, 'and so must the undo applier').toContain('w.writeGlobal(g.bands, g.gain, g.presetName)');
    expect(resetSrc, 'the snapshot must carry it in the first place').toContain('presetName: global.presetName');

    // Crash recovery had the name in hand and dropped it: EditJournal stores the curve, not the
    // preset it came from, so the replay has to carry the stored profile's own provenance across.
    const replay = useEngineSrc.match(/if \(plan\.action === 'apply-global'\)[\s\S]*?\n        \}/)?.[0] ?? '';
    expect(replay, 'the global replay branch not found').toBeTruthy();
    expect(replay, 'replay must not blank the provenance').toContain('presetName: g?.presetName');
    expect(replay, 'and must pass it to the write').toMatch(/writeDefaultEq\([^)]*presetName\)/);
  });

  it('Auto Gain changes what is played and never what is stored', () => {
    // The whole safety property. It is a rendering of the master gain for the message to the
    // engine; the stored value stays the user's own. If the compensated number were ever fed back
    // in as the stored one, every push would duck the tab a little further.
    const writers = ['writeDefaultEq(', 'writeRulesResult(', 'writeRules(', 'writeJournal('];
    for (const w of writers) {
      const calls = useEngineSrc.split(w).slice(1).map((chunk) => chunk.slice(0, 120));
      for (const c of calls) expect(c, `${w} must not be handed a compensated gain`).not.toContain('sentGain');
    }

    // And it must reach the engine, or the toggle would be decorative.
    const pushes = useEngineSrc.split("toOffscreen('applySettings'").slice(1);
    expect(pushes.length, 'no applySettings pushes found').toBeGreaterThan(2);
    for (const p of pushes) expect(p.slice(0, 200), 'every push goes through sentGain').toContain('sentGain(');
    expect(useEngineSrc, 'the volume drag too').toContain("toOffscreen('modifyGain', { tabId: id, gain: sentGain(");

    // Toggling it is not an edit: it re-pushes what is already stored and writes nothing.
    const toggle = useEngineSrc.match(/const toggleAutoGain = useCallback\([\s\S]*?\n  \}, \[/)?.[0] ?? '';
    expect(toggle, 'toggleAutoGain not found').toBeTruthy();
    for (const w of ['commitTarget', 'writeDefaultEq', 'writeRules', 'recordJournal']) {
      expect(toggle, `switching Auto Gain must not call ${w}`).not.toContain(w);
    }
  });

  it('the peak meter reads the signal and changes nothing', () => {
    // The contract for 2.5: measure after the equalizer and the master, show it, touch nothing.
    // Limiting is a separate audio feature with its own settings and its own place in the
    // played-versus-stored model, and its absence here is a decision, not a gap.
    const fft = offscreenSrc.match(/function handleFFT\([\s\S]*?\n}/)?.[0] ?? '';
    expect(fft, 'handleFFT not found').toBeTruthy();
    expect(fft, 'the peak must be measured on the post-master tap').toContain('getFloatTimeDomainData');
    for (const node of ['createDynamicsCompressor', 'createWaveShaper', 'createGain(']) {
      expect(fft, `the meter must not add ${node} to the chain`).not.toContain(node);
    }
    expect(fft, 'and must not reconnect anything').not.toContain('.connect(e.postGain)');

    // One poll, not two. The spectrum's payload is skipped when only the meter is showing.
    expect(offscreenSrc, 'the FFT payload must be optional').toContain('if (!wantFft)');
  });

  it('arrows shape the band on a dot and move the caret in a field', () => {
    // The conflict this layout exists to avoid: pressing Left inside a number field must move the
    // text cursor, not retune the band. The separation is structural — the nudge handler lives on
    // the dot, and the fields simply have no arrow handling at all.
    expect(eqGraphSrc, 'the dot keeps its arrow handling').toContain('function nudgeBand');
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      expect(bandFieldsSrc, `a numeric field must not intercept ${k}`).not.toContain(k);
    }
    expect(bandFieldsSrc, 'and must not reach into the graph').not.toContain('nudge(');
  });

  it('typed values go through the same clamps as a drag', () => {
    // A second set of bounds here is how a typed number reaches a state the graph or the engine
    // was never built to receive. parseField is the only door, and it clamps with the shared
    // clampFreq / clampGainDb / clampQ that the pointer path and the engine already agree on.
    expect(bandFieldsSrc, 'the field must not build its own number').toContain('parseField(');
    for (const raw of ['Number(', 'parseFloat(', 'parseInt(']) {
      expect(bandFieldsSrc, `raw ${raw} would bypass the clamps`).not.toContain(raw);
    }
    const bi = bandInputSrc.replace(/\/\/.*$/gm, '');
    for (const c of ['clampFreq', 'clampGainDb', 'clampQ']) {
      expect(bi, `band-input must clamp with ${c}`).toContain(c);
    }
  });

  it('a restore announces nothing until the write has landed', () => {
    // The audit found all three restore paths firing `void io.write...` and then claiming success
    // regardless: a success notice, a cleared journal and a spent undo slot are consequences of a
    // write, not of an intention. Asserted on the source because these are ordering facts and the
    // hook has no behavioural test.
    for (const fn of ['resetChanges', 'resetProfile', 'undoReset']) {
      const block = useEngineSrc.match(new RegExp(`const ${fn} = useCallback\\([\\s\\S]*?\\n  \\}, \\[`))?.[0] ?? '';
      expect(block, `${fn} not found`).toBeTruthy();
      const code = block.replace(/\/\/.*$/gm, '');
      expect(code, `${fn} must not fire a write and discard the result`).not.toMatch(/void io\.write/);
    }

    // And the destructive reset must retire the main-row control, whose baseline may now name a
    // rule that no longer exists.
    const profile = useEngineSrc.match(/const resetProfile = useCallback\([\s\S]*?\n  \}, \[/)?.[0] ?? '';
    expect(profile, 'Reset profile must refresh the Reset control').toContain('refreshResettable()');
    expect(profile, 'and must not arm an undo before the write succeeds').toMatch(/res\.ok[\s\S]*?armUndo\(/);
  });

  it('only a write that happened may spend the undo slot', () => {
    // The release blocker, in one line. planResetChanges returns rules:null when the baseline rule
    // has since been deleted, so Reset writes nothing — and the old code invalidated the undo from
    // an earlier Reset profile anyway, destroying the only copy of that rule.
    const block = useEngineSrc.match(/const resetChanges = useCallback\([\s\S]*?\n  \}, \[/)?.[0] ?? '';
    expect(block, "noteUndoEvent must be gated on the 'restored' outcome").toMatch(
      /outcome === 'restored'\s*\)\s*noteUndoEvent\('commit'\)/
    );
  });

  it('Reset profile and its Undo are one record, armed once, checked against the world', () => {
    // Everything this block pins was a separate bug first, and every one came from the same shape:
    // one operation spread across two clocks and guarded by a flag.
    //
    //   the snapshot was set when the write resolved, the debt written synchronously beside it
    //   -> a second reset issued before the first resolved armed one reset's snapshot next to the
    //      other's bookkeeping, and — different storage areas, so ordinary rather than exotic — a
    //      refused first write handed a stale debt back over a reset that had already succeeded;
    //   validity was "a later write invalidates the slot", raised by this popup's own writers
    //   -> the Full-window editor writes the same keys and raises nothing, so Undo overwrote it;
    //   and the arming ran inside .then while a commit invalidated synchronously
    //   -> an edit made during the in-flight write cleared the slot before the reset armed it,
    //      and the arming then put a stale world back on the button.
    //
    // The hook has no behavioural test, so this is asserted on the source; comments are stripped
    // first so the note above cannot satisfy any of it.
    const block = useEngineSrc.match(/const resetProfile = useCallback\([\s\S]*?\n  \}, \[/)?.[0] ?? '';
    expect(block, 'resetProfile not found').toBeTruthy();
    const code = block.replace(/\/\/.*$/gm, '');

    // ONE record: snapshot, debt, and the world the reset produced, built together.
    // Arguments pinned, not just the call. This escaped a looser assertion: fingerprinting a
    // literal empty world instead of the real one made every undo look current forever.
    expect(code, 'the undo payload must be one record, fingerprinting the world it just made').toMatch(
      /const record: ResetUndoRecord = \{ snapshot, debt, produces: fingerprintWorld\(rulesRef\.current, globalRef\.current\) \}/
    );
    expect(code, 'and the pending slot must hold that same record').toContain('pendingReset.current = record;');
    // `committed` is READ at reset time. Deriving it later from whether a baseline exists
    // over-reports: a drag latches on its first move, an edit under bypass never commits at all.
    expect(code, 'the debt must carry committed as its own fact').toMatch(
      /const debt = \{ baseline: baselineRef\.current, committed: committedSinceBaseline\.current \}/
    );
    expect(useEngineSrc, 'the two-clock stash must be gone').not.toContain('baselineBeforeReset');

    // The baseline retires synchronously, so an edit started during the in-flight write latches
    // against the profile the reset actually produced instead of inheriting a doomed one.
    expect(code, 'Reset profile must drop the baseline it made meaningless').toContain('baselineRef.current = NO_BASELINE');
    expect(code, 'and must retire the Reset control too').toContain('committedSinceBaseline.current = false');
    expect(
      code.indexOf('baselineRef.current = NO_BASELINE') < code.indexOf('void write.then'),
      'the clear must be synchronous, ahead of the write callback'
    ).toBe(true);

    // Arming is a decision, and a superseded reset must not speak for a world it no longer names.
    expect(code, 'arming must go through the tested planner').toMatch(/planArm\(\{ ok: res\.ok, isCurrent: pendingReset\.current === record \}\)/);
    expect(code, 'a superseded reset says nothing at all').toMatch(/=== 'superseded'\) return;/);
    const failure = code.match(/=== 'refused'\) \{([\s\S]*?)\n      \}/)?.[1] ?? '';
    expect(failure, 'the refused-write branch was not found').toBeTruthy();
    expect(failure, 'a reset that did not happen gives the whole debt back').toContain('baselineRef.current = record.debt.baseline');
    expect(failure, 'both halves of it').toContain('committedSinceBaseline.current = record.debt.committed');
    expect(failure, 'but must not steal a baseline a later edit has since latched').toContain('!baselineRef.current.has');

    // A reset owes no rollback, so it must not manufacture one either.
    expect(code, 'Reset profile must not latch a baseline of its own').not.toContain('captureBaseline()');

    // --- Undo ---
    // The restore lives in runUndo; undoReset is the click handler that serialises it.
    const undo = useEngineSrc.match(/const runUndo = useCallback\([\s\S]*?\n  \);/)?.[0] ?? '';
    expect(undo, 'runUndo not found').toBeTruthy();
    const undoCode = undo.replace(/\/\/.*$/gm, '');

    // One restore at a time. The slot is not spent until the write lands, several awaits away, so
    // `armed` cannot stop a second click — and two buttons carry this action at once, which would
    // mean two chrome.storage.sync writes for one user action.
    const click = useEngineSrc.match(/const undoReset = useCallback\([\s\S]*?\n  \}, \[/)?.[0] ?? '';
    expect(click, 'undoReset not found').toBeTruthy();
    const clickCode = click.replace(/\/\/.*$/gm, '');
    expect(clickCode, 'a second click must not start a second restore').toContain('if (undoInFlight.current) return;');
    expect(clickCode, 'and the guard must be released however the restore ends').toMatch(/finally \{\s*\n\s*undoInFlight\.current = false;/);
    // Raised BEFORE the await, not after it. Setting it inside the try, past the await, leaves the
    // flag true only for the instant between the restore resolving and the finally — it guards
    // nothing, and every assertion above still passes because the check and the release are both
    // still present. Ordering is the invariant here, not presence.
    expect(clickCode.indexOf('undoInFlight.current = true'), 'the flag must be raised before the restore starts').toBeGreaterThan(-1);
    expect(clickCode.indexOf('undoInFlight.current = true'), 'and before the await, or it guards nothing').toBeLessThan(
      clickCode.indexOf('await runUndo(')
    );

    // "I don't know" is not "the world is empty": a reset performed with no rules produces exactly
    // the fingerprint of []. A reader that swallowed its failure would reproduce that fingerprint
    // and the undo would write an empty rules array over a rule added since. readRules reports its
    // failures now as well, but this guard does not lean on that — it asks the world directly.
    expect(undoCode, 'the world must be read through the reporting reader').toContain('await io.readWorld()');
    expect(undoCode, 'and a read that failed must refuse rather than guess').toMatch(/if \(!world\) \{[\s\S]*?return;\s*\n\s*\}/);

    // The world decides, not a flag of ours — that is what makes this right about writers we never
    // hear from, and it must be asked BEFORE anything is written.
    expect(undoCode, 'the undo must be checked against the world it promised to restore').toMatch(
      /planUndo\(\{ record, world: fingerprintWorld\(quantizeRules\(world\.rules\), world\.global\) \}\) !== 'restore'/
    );
    // Against STORAGE, not the mirrors. `onChanged` refreshes them a render late, so a click
    // inside that window would fingerprint the pre-change world, match, and restore over the
    // other window's write — the defect this check exists to prevent, narrowed to a race.


    // The superseded branch must RETURN. Without it the undo restores over any newer world while
    // showing the notice that says it did not — every other assertion here still passes, and a
    // dropped `return` is the most ordinary accidental mutation there is.
    const superseded = undoCode.match(/\!== 'restore'\) \{([\s\S]*?)\n      \}/)?.[1] ?? '';
    expect(superseded, 'the superseded branch was not found').toBeTruthy();
    expect(superseded, 'a superseded undo must not fall through into the restore').toMatch(/\n\s*return;\s*$/);
    // ...and must not spend the slot. Nothing was written, and the snapshot is the only copy of a
    // rule the reset deleted — the journal was cleared when it succeeded.
    expect(superseded, 'a path that stores nothing must not destroy the only copy').not.toContain('setUndoSlot(');
    expect(undoCode.indexOf('planUndo('), 'and checked before the restore is attempted').toBeLessThan(undoCode.indexOf('applyUndoReset('));
    // What is restored is the SNAPSHOT — the world before the reset — never the session debt that
    // travels beside it. Passing the wrong half writes undefined rules over the user's own.
    expect(undoCode, 'the restore must replay the snapshot itself').toContain('applyUndoReset(record.snapshot, restoreWriters,');
    // The third argument decides whether the rules half is written at all, and it must be COMPUTED
    // from the world just read — a literal there is either 'always write' (the refusal that blamed
    // the sync quota) or 'never write' (a deleted rule not coming back).
    expect(undoCode, 'the skip must be derived, not hardcoded').not.toMatch(/applyUndoReset\(record\.snapshot, restoreWriters, (true|false)\)/);
    // A commit armed before the click would land after the restore and overwrite it.
    expect(undoCode, 'Undo must cancel a pending commit').toContain('clearTimeout(commitTimer.current)');

    // NOTHING may claim a restore before every part of it is stored. applyUndoReset writes rules
    // first and reports write-failed if the global write then fails; the version this replaces
    // updated the mirror and the audio synchronously regardless, so a partial failure left the
    // user looking at and hearing a full restore that storage did not have.
    const success = undoCode.match(/if \(outcome !== 'restored'\) \{[\s\S]*?\n      \}([\s\S]*?)\n    \},/)?.[1] ?? '';
    expect(success, 'the restored branch of the undo was not found').toBeTruthy();
    // The slot is the ONLY copy of a rule Reset deleted, so a refused restore must leave it armed
    // to try again. Disarming anywhere but here throws that copy away on the one path where it is
    // still needed.
    expect((undoCode.match(/setUndoSlot\(undoAfter\(/g) ?? []).length, 'the undo may be spent in exactly one place').toBe(1);
    expect(success, 'and only once the restore is stored').toContain('setUndoSlot(undoAfter(undoSlot,');
    for (const step of [
      'setRulesMirror(record.snapshot.rules)',
      'globalRef.current = record.snapshot.global',
      'baselineRef.current = record.debt.baseline',
      'committedSinceBaseline.current = record.debt.committed',
      'applyEverywhere(',
      'mirrorResolved()'
    ]) {
      expect(success, step + ' may only run once the whole restore is stored').toContain(step);
    }
  });

  it('the editing buffer is claimed by host, never by tab identity', () => {
    // The full-window editor sets activeTabId to null by construction, so the old
    // `tabs.find(t => t.id === activeTabId)` could never match and the mirror step was dead code
    // for the whole life of that page: its graph kept the curve it had at boot while storage moved
    // on, and its next edit wrote that stale curve over everything the popup had saved. The audio
    // path was already fixed by storage-events.ts; the buffer was not.
    const block = useEngineSrc.match(/const applyEverywhere = useCallback\([\s\S]*?\n  \);/)?.[0] ?? '';
    expect(block, 'applyEverywhere not found').toBeTruthy();
    const code = block.replace(/\/\/.*$/gm, '');
    expect(code, 'the owner comes from the tested planner').toContain('mirrorHost({');
    expect(code, 'and the tab-identity lookup must not come back').not.toMatch(/const cur = tabsList\.find/);
    // The planner is only as good as what it is told. Passing a literal `false` here — or reading
    // the state instead of the ref, which is captured stale in a message-handler closure — puts
    // the bug straight back with the call still in place.
    expect(code, 'the planner must be told the real answer, from the ref').toMatch(
      /mirrorHost\(\{\s*globalEditor:\s*globalEditorRef\.current\s*,/
    );
    // null means "no owner", '' means "the global profile". A falsy test, or an explicit !== '',
    // collapses them and stops the global editor mirroring at all — the same bug, one layer up.
    expect(code, 'no-owner must be distinguished from the global profile by identity').toMatch(/if \(host !== null\)/);
    expect(code, "and '' must not be excluded as if it were empty").not.toMatch(/host !== ''/);
    // The ref has to be kept fresh, or the planner is told the truth of the first render forever.
    // Dropping the per-render assignment leaves `.current` at useState's initial false for the
    // whole life of the page and restores the bug with the call site untouched — and that line
    // lives two hundred lines above this block, where the extract cannot see it.
    expect(useEngineSrc, 'globalEditorRef must be re-synced every render').toMatch(
      /const globalEditorRef = useRef\(globalEditor\);\s*\n\s*globalEditorRef\.current = globalEditor;/
    );
  });

  it('the band the graph selects has somewhere in App to land', () => {
    // What is left of two source-text guards that used to describe pointer selection and the
    // no-op-blur write in full. Both are now asserted BEHAVIOURALLY, by rendering the components
    // in band-editing.test.tsx — which is strictly better, and was worth a jsdom dependency: with
    // these two text assertions deleted, that file still catches every one of the eight mutations
    // they were written for, including the `!isUnchanged(...)` and dead-store bypasses that
    // walked straight through them.
    //
    // Except this one. The DOM tests render EqGraph directly, so they cannot see the other end of
    // the wire: App has to actually pass a handler for the selection to reach the readout, and
    // `onSelectBand={undefined}` restores the original bug with all of them green. Asserting the
    // wire is the one job text still does better here.
    expect(appSrc, 'App must hand the graph somewhere to put the selection').toContain('onSelectBand={setSelBand}');
    expect(appSrc, 'and must render the fields against that same selection').toMatch(/index=\{selBand !== null/);
  });


  it('the storage listener routes by the tested decision, not by its own area check', () => {
    // The lost update: DEFAULT_EQ lives in `local` and the handler returned early for every area
    // but `sync`, so the long-lived Full-window editor never learned the popup had changed the
    // everywhere-sound and its next edit wrote a stale curve back over it.
    //
    // Asserting that refreshFor is called is not enough — re-adding the early return ABOVE it
    // restores the bug while leaving the call in place, which is exactly what a first attempt at
    // this test failed to catch. So the handler must contain no area comparison of its own.
    const h = useEngineSrc.match(/const onChanged = \(changes: any, area: string\) => \{[\s\S]*?\n    \};/)?.[0] ?? '';
    expect(h, 'onChanged not found').toBeTruthy();
    const code = h.replace(/\/\/.*$/gm, '');
    expect(code, 'the routing decision belongs in storage-events.ts').toContain('refreshFor(area,');
    expect(code, 'the handler must not second-guess the area itself').not.toMatch(/area\s*[!=]==/);
    expect(code, 'and must act on the global profile').toContain('want.global');
  });

  it('the debug recorder is marked for removal and reaches the store nowhere', () => {
    // Temporary instrumentation for the 2.5 smoke run. Harmless but not something to ship: a
    // recorder nobody asked for does not belong in a published extension, however inert.
    expect(appSrc, 'the UI must carry its own removal note').toContain('remove before 2.5.0');
    expect(deploySrc, 'and DEPLOY.md must stop the release without it').toContain('debug recorder');
  });

  it('the popup keeps a fixed width, and nothing in the column can be squashed out of reach', () => {
    // Width was the measured problem: More made the document wider than the 620px body and Chrome
    // stretched the window to its 800px maximum, so switching tabs moved the window. Clipping the
    // horizontal overflow fixes it and shows a layout bug instead of hiding it behind a wider
    // window.
    const popup = cssSrc.match(/@media \(max-height: 699px\)[\s\S]*?\n\}/)?.[0] ?? '';
    expect(popup, 'the popup-only sizing block not found').toBeTruthy();
    for (const rule of ['width: 620px', 'max-width: 620px', 'overflow-x: hidden']) {
      expect(popup, `the popup box must pin ${rule}`).toContain(rule);
    }
    expect(popup, 'must not apply to the full-window page').toContain('max-height: 699px');

    // Locking the HEIGHT as well is not here, and the reason is worth keeping: it made views
    // taller than the box unreachable, because in a flex column every child shrinks unless told
    // not to and the nav was not. That is the real defect and it is fixed below; a fixed height on
    // top of it is a separate decision that has to be re-argued, not smuggled back in.
    expect(navSrc, 'the nav must not be squeezed by a tall view').toContain('shrink-0');
    expect(appSrc, 'the content area is what absorbs a tall view').toContain('min-h-0 flex-1 overflow-y-auto');
  });

  it('the meter does not hold a message loop open on its own', () => {
    // Regression from the peak meter: the poll had been gated on the spectrum being on, and became
    // permanent because meterOn defaults to true — a 60/s round trip to the audio engine for a bar
    // that cannot show the difference, worst in the full-window page that stays open for hours.
    expect(eqGraphSrc, 'no capture, nothing to meter').toContain('activeTabId == null');
    expect(eqGraphSrc, 'the meter runs at its own cadence, not the frame rate').toContain('setTimeout(tick, METER_POLL_MS)');
    expect(eqGraphSrc, 'and only the spectrum justifies a frame-rate loop').toMatch(/if \(spectrumOn\) raf = requestAnimationFrame\(tick\)/);
    // One loop, not two.
    expect((eqGraphSrc.match(/requestAnimationFrame\(/g) ?? []).length, 'a second polling loop').toBeLessThanOrEqual(1);
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
