import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BandFields } from './BandFields';
import { EqGraph } from './EqGraph';
import { DEFAULT_FREQUENCIES, DEFAULT_Q, filterType, type Band } from '@/lib/audio';

// The only DOM test in the project, and the two bugs it exists for are the reason it is here.
//
// Both lived in wiring that no pure function can reach: a pointer press that never selected a
// band, and a focus-and-leave that rewrote that band and spent the Reset-profile undo slot. Both
// were first guarded with source-text assertions, and across two adversarial review rounds ten
// separate one-line mutations walked straight through them — a stray `!`, a dead store, a deleted
// ref assignment, an argument swapped for the value parsed out of the field. Each time the
// assertion was tightened the next bypass simply changed shape. Text cannot encode behaviour.
//
// So these tests do not look at the source. They render the component, do what a user does, and
// assert what reaches the callbacks the popup persists from.

afterEach(cleanup);

const band = (over: Partial<Band> = {}, i = 3): Band => ({
  frequency: DEFAULT_FREQUENCIES[i],
  gain: 0,
  q: DEFAULT_Q,
  type: filterType(i),
  ...over
});

const bands = (): Band[] => Array.from({ length: 11 }, (_, i) => band({}, i));

describe('BandFields — a field the user only passed through', () => {
  /** A band carrying the kind of values a DRAG produces: nothing lands on display precision. */
  const dragged = band({ frequency: 437.3421875, gain: 1.2534, q: 0.7071067811865476 });

  const setup = (b: Band = dragged) => {
    const onBand = vi.fn();
    const onCommit = vi.fn();
    render(<BandFields band={b} index={3} editable onBand={onBand} onCommit={onCommit} />);
    const [freq, gain, q] = screen.getAllByRole('textbox') as HTMLInputElement[];
    return { onBand, onCommit, freq, gain, q };
  };

  it('shows the band at display precision', () => {
    const { freq, gain, q } = setup();
    expect([freq.value, gain.value, q.value]).toEqual(['437', '1.3', '0.71']);
  });

  it('writes NOTHING when a field is focused and left untouched', () => {
    // THE BUG. Tabbing through the row committed the band at the precision the readout prints,
    // so 437.3421875 Hz became 437 Hz — and the commit spent the Reset-profile undo slot, which
    // holds the only copy of a rule Reset had just deleted.
    const { onBand, onCommit, freq } = setup();
    fireEvent.focus(freq);
    fireEvent.blur(freq);
    expect(onBand).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('writes nothing when every field in the row is tabbed through', () => {
    const { onBand, onCommit, freq, gain, q } = setup();
    for (const el of [freq, gain, q]) {
      fireEvent.focus(el);
      fireEvent.blur(el);
    }
    expect(onBand).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('writes nothing when the user types and then presses Escape', () => {
    // Escape restores the old text and blurs, and the blur is what commits — so the round trip
    // has to come back to "no change" rather than to "write the old value again".
    const { onBand, onCommit, freq } = setup();
    fireEvent.focus(freq);
    fireEvent.change(freq, { target: { value: '999' } });
    fireEvent.keyDown(freq, { key: 'Escape' });
    fireEvent.blur(freq, { target: { value: '437' } });
    expect(onBand).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('still writes a value the user actually changed', () => {
    // The other half, and the one a `!` in the guard destroys: the whole point of the feature is
    // that typing a number works.
    const { onBand, onCommit, freq } = setup();
    fireEvent.focus(freq);
    fireEvent.change(freq, { target: { value: '440' } });
    fireEvent.blur(freq);
    expect(onBand).toHaveBeenCalledWith({ frequency: 440 });
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('writes a changed gain and Q too, through the shared clamps', () => {
    const { onBand, gain, q } = setup();
    fireEvent.focus(gain);
    fireEvent.change(gain, { target: { value: '-6' } });
    fireEvent.blur(gain);
    expect(onBand).toHaveBeenCalledWith({ gain: -6 });

    fireEvent.focus(q);
    fireEvent.change(q, { target: { value: '2.5' } });
    fireEvent.blur(q);
    expect(onBand).toHaveBeenCalledWith({ q: 2.5 });
  });

  it('commits on Enter as well as on blur', () => {
    const { onBand, onCommit, freq } = setup();
    fireEvent.focus(freq);
    fireEvent.change(freq, { target: { value: '1.3k' } });
    fireEvent.keyDown(freq, { key: 'Enter' });
    expect(onBand).toHaveBeenCalledWith({ frequency: 1300 });
    expect(onCommit).toHaveBeenCalled();
  });

  it('leaves the band alone when the text is not a number', () => {
    const { onBand, onCommit, freq } = setup();
    fireEvent.focus(freq);
    fireEvent.change(freq, { target: { value: 'abc' } });
    fireEvent.blur(freq);
    expect(onBand).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('clamps an out-of-range number instead of refusing it', () => {
    const { onBand, gain } = setup();
    fireEvent.focus(gain);
    fireEvent.change(gain, { target: { value: '9999' } });
    fireEvent.blur(gain);
    expect(onBand).toHaveBeenCalledWith({ gain: 30 });
  });

  it('says so when no band is selected, and offers nothing to type into', () => {
    render(<BandFields band={null} index={null} editable onBand={vi.fn()} onCommit={vi.fn()} />);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
});

describe('EqGraph — selecting a band with the pointer', () => {
  const setup = () => {
    const onSelectBand = vi.fn();
    const onBands = vi.fn();
    const onCommit = vi.fn();
    render(
      <EqGraph
        bands={bands()}
        sampleRate={44100}
        // null keeps the FFT/meter poll switched off — this test is about selection, and the
        // poll would otherwise message an engine that does not exist here.
        activeTabId={null}
        onBands={onBands}
        onCommit={onCommit}
        onSelectBand={onSelectBand}
      />
    );
    return { onSelectBand, onBands, onCommit, dots: screen.getAllByRole('slider') };
  };

  it('renders one grabbable dot per band', () => {
    const { dots } = setup();
    expect(dots).toHaveLength(11);
  });

  it('selects the band when it is pressed with a pointer', () => {
    // THE BUG. dotDown calls preventDefault to make the drag work, which also suppresses the
    // focus mousedown would have given the dot — and onFocus was the only caller of
    // onSelectBand. So clicking a dot never populated the numeric readout, and typing a band's
    // numbers, the headline 2.5 feature, was reachable by Tab alone.
    const { onSelectBand, dots } = setup();
    fireEvent.pointerDown(dots[4]);
    expect(onSelectBand).toHaveBeenCalledWith(4);
  });

  it('selects the band the pointer actually pressed, not a fixed one', () => {
    const { onSelectBand, dots } = setup();
    fireEvent.pointerDown(dots[0]);
    fireEvent.pointerDown(dots[10]);
    expect(onSelectBand.mock.calls.map((c) => c[0])).toEqual([0, 10]);
  });

  it('still selects on keyboard focus, so the Tab path is unchanged', () => {
    const { onSelectBand, dots } = setup();
    fireEvent.focus(dots[7]);
    expect(onSelectBand).toHaveBeenCalledWith(7);
  });

  it('does not select on a read-only graph', () => {
    // No capture on the active tab: the dots are not draggable and must not answer the pointer
    // either, or the readout would offer to edit a curve that cannot be edited.
    const onSelectBand = vi.fn();
    render(
      <EqGraph
        bands={bands()}
        sampleRate={44100}
        activeTabId={null}
        editable={false}
        onBands={vi.fn()}
        onCommit={vi.fn()}
        onSelectBand={onSelectBand}
      />
    );
    fireEvent.pointerDown(screen.getAllByRole('slider')[4]);
    expect(onSelectBand).not.toHaveBeenCalled();
  });

  it('focuses the dot it grabbed, so the arrow keys reach it', () => {
    // THE BUG. dotDown calls preventDefault to make the drag work, and focus is one of the
    // default actions that removes — so after clicking a dot the popup still had focus somewhere
    // else, every arrow key went there, and keyboard shaping was reachable only by Tab. A smoke
    // recording caught the arrows landing on the section element rather than on any dot.
    const { dots } = setup();
    fireEvent.pointerDown(dots[4]);
    expect(document.activeElement).toBe(dots[4]);
  });

  it('lets an arrow key shape the band immediately after a click', () => {
    // The property the user actually cares about, end to end: click, then press a key, and the
    // band moves. Asserting focus alone would pass if nudgeBand were wired to the wrong element.
    const { onBands, onCommit, dots } = setup();
    fireEvent.pointerDown(dots[4]);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(onBands).toHaveBeenCalledOnce();
    expect(onBands.mock.calls[0][0][4].gain).toBeGreaterThan(0);
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('moves frequency with the sideways arrows, from the same click', () => {
    const { onBands, dots } = setup();
    fireEvent.pointerDown(dots[4]);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    const before = bands()[4].frequency;
    expect(onBands.mock.calls[0][0][4].frequency).toBeGreaterThan(before);
  });

  it('does not steal focus on a read-only graph', () => {
    // The dots are tabIndex -1 there, so nothing should be focusable and nothing should select.
    const onSelectBand = vi.fn();
    render(
      <EqGraph
        bands={bands()}
        sampleRate={44100}
        activeTabId={null}
        editable={false}
        onBands={vi.fn()}
        onCommit={vi.fn()}
        onSelectBand={onSelectBand}
      />
    );
    const dot = screen.getAllByRole('slider')[4];
    fireEvent.pointerDown(dot);
    expect(document.activeElement).not.toBe(dot);
    expect(onSelectBand).not.toHaveBeenCalled();
  });

  it('a pointer press alone is a selection, not an edit', () => {
    // Selecting must not commit anything: the band only changes once the pointer MOVES.
    const { onBands, onCommit, dots } = setup();
    fireEvent.pointerDown(dots[4]);
    expect(onBands).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('keeps the keyboard nudge working after a pointer selection', () => {
    // The two paths share the dot; adding the pointer one must not disturb the other.
    const { onBands, onCommit, dots } = setup();
    fireEvent.pointerDown(dots[4]);
    fireEvent.keyDown(dots[4], { key: 'ArrowUp' });
    expect(onBands).toHaveBeenCalledOnce();
    expect(onBands.mock.calls[0][0][4].gain).toBeGreaterThan(0);
    expect(onCommit).toHaveBeenCalledOnce();
  });
});
