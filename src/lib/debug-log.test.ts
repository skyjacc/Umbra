import { describe, it, expect, beforeEach } from 'vitest';
import { startDebug, stopDebug, clearDebug, dbg, debugEntries, debugCount, debugDump, debugOn, onDebugFlush } from './debug-log';

beforeEach(() => {
  stopDebug();
  clearDebug();
  onDebugFlush(null);
});

describe('recording only when asked', () => {
  it('is off until started', () => {
    expect(debugOn()).toBe(false);
    dbg('click', { on: 'Reset' });
    expect(debugCount()).toBe(0);
  });

  it('records once started and stops once stopped', () => {
    startDebug(1000);
    dbg('click', { on: 'Reset' }, 1000);
    expect(debugCount()).toBe(1);
    stopDebug();
    dbg('click', { on: 'Save' }, 1100);
    expect(debugCount()).toBe(1);
  });
});

describe('what an entry looks like', () => {
  it('stamps a relative time so a log is readable without knowing when it started', () => {
    startDebug(5000);
    dbg('a', {}, 5000);
    dbg('b', {}, 5250);
    expect(debugEntries().map((e) => e.t)).toEqual([0, 250]);
  });

  it('drops undefined fields rather than writing nulls', () => {
    startDebug(0);
    dbg('applySettings', { gain: 1, preset: undefined }, 0);
    expect(debugEntries()[0]).toEqual({ t: 0, type: 'applySettings', gain: 1 });
    expect('preset' in debugEntries()[0]).toBe(false);
  });

  it('rounds numbers so a float does not fill the line', () => {
    startDebug(0);
    dbg('msg', { gain: 0.70710678118 }, 0);
    expect(debugEntries()[0].gain).toBe(0.7071);
  });
});

describe('surviving a long session', () => {
  it('keeps the most recent entries and drops the oldest', () => {
    startDebug(0);
    for (let i = 0; i < 3200; i++) dbg('n', { i }, i);
    expect(debugCount()).toBe(3000);
    expect(debugEntries()[0].i).toBe(200); // the first 200 fell off the front
    expect(debugEntries().at(-1)!.i).toBe(3199);
  });

  it('continues the clock when restored from a previous popup', () => {
    // The popup dies on any click outside it. Resuming has to keep the timeline, or a log that
    // crosses a close reads as two runs that both start at zero.
    startDebug(9000, [{ t: 500, type: 'click' }]);
    dbg('after', {}, 9100);
    expect(debugEntries().map((e) => e.t)).toEqual([500, 600]);
  });

  it('hands every flush to the sink so a close cannot lose the tail', () => {
    let seen = 0;
    onDebugFlush((e) => (seen = e.length));
    startDebug(0);
    dbg('a', {}, 0);
    dbg('b', {}, 1);
    expect(seen).toBe(2);
  });
});

describe('the dump', () => {
  it('is one JSON object per line, headed by a summary', () => {
    startDebug(0);
    dbg('click', { on: 'Reset' }, 0);
    const lines = debugDump({ build: '2.4.1' }).split('\n');
    expect(JSON.parse(lines[0])).toEqual({ recorded: 1, build: '2.4.1' });
    expect(JSON.parse(lines[1])).toEqual({ t: 0, type: 'click', on: 'Reset' });
  });
});
