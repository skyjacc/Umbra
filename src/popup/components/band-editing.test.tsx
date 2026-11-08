import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BandFields } from './BandFields';
import { EqGraph } from './EqGraph';
import { GuideOverlay } from './GuideOverlay';
import { Select } from './Select';
import { VerticalVolume } from './VerticalVolume';
import { DEFAULT_FREQUENCIES, DEFAULT_Q, EQ_W, EQ_H, xToFreq, yToDb, filterType, type Band } from '@/lib/audio';

// These controls are tested through DOM interactions, including the two original editing bugs.
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

describe('Restored controls — keyboard, gain and modal isolation', () => {
  it('reports amplitude gain in dB and sends Home/End to the volume rails', () => {
    const onGain = vi.fn();
    const onCommit = vi.fn();
    render(<VerticalVolume gain={2} onGain={onGain} onCommit={onCommit} />);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuetext')).toBe('+6 dB');
    expect(slider.getAttribute('aria-orientation')).toBe('vertical');
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(onGain).toHaveBeenLastCalledWith(10 ** (-50 / 20));
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onGain).toHaveBeenLastCalledWith(10);
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it('keeps a disabled fader read-only from the keyboard', () => {
    const onGain = vi.fn();
    render(<VerticalVolume gain={1} editable={false} onGain={onGain} onCommit={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowUp' });
    expect(onGain).not.toHaveBeenCalled();
  });

  it('opens the list on an arrow, navigates options and returns focus after selection or Escape', () => {
    const onChange = vi.fn();
    render(<Select value="b" ariaLabel="Sound" options={[
      { value: 'a', label: 'Flat' }, { value: 'b', label: 'Vocal' }, { value: 'c', label: 'A long user preset name' }
    ]} onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Sound: Vocal' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const options = screen.getAllByRole('option');
    expect(document.activeElement).toBe(options[1]);
    expect(trigger.getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
    fireEvent.keyDown(options[1], { key: 'End' });
    expect(document.activeElement).toBe(options[2]);
    fireEvent.click(options[2]);
    expect(onChange).toHaveBeenCalledWith('c');
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('isolates the guide, traps focus and restores the previous inert state before returning focus', () => {
    const onClose = vi.fn();
    const content = (open: boolean) => <>
      <button>Open guide</button>
      <div data-testid="already-inert">Already unavailable</div>
      <GuideOverlay open={open} onClose={onClose} />
    </>;
    const { rerender } = render(content(false));
    const trigger = screen.getByRole('button', { name: 'Open guide' });
    const previous = screen.getByTestId('already-inert');
    previous.setAttribute('inert', '');
    trigger.focus();
    rerender(content(true));
    const dialog = screen.getByRole('dialog');
    const close = dialog.querySelector('button')!;
    const scrollArea = dialog.querySelector<HTMLElement>('[tabindex="0"]')!;
    expect(document.activeElement).toBe(close);
    expect(trigger.hasAttribute('inert')).toBe(true);
    expect(dialog.hasAttribute('inert')).toBe(false);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(scrollArea);
    fireEvent.keyDown(scrollArea, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    rerender(content(false));
    expect(trigger.hasAttribute('inert')).toBe(false);
    expect(previous.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });
});

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

  it('keeps the selected marker visible when focus moves into the inspector', () => {
    render(<EqGraph bands={bands()} sampleRate={48000} selectedBand={4} onBands={vi.fn()} onCommit={vi.fn()} />);
    const dots = screen.getAllByRole('slider');
    const point = (i: number) => dots[i];
    fireEvent.focus(dots[4]);
    fireEvent.blur(dots[4]);
    expect(point(4).getAttribute('r')).toBe('7.5');
    expect(point(3).getAttribute('r')).toBe('6.5');

    // Hover temporarily previews another band without losing the stored selection.
    fireEvent.pointerEnter(dots[3]);
    expect(point(3).getAttribute('r')).toBe('7.5');
    fireEvent.pointerLeave(dots[3]);
    expect(point(4).getAttribute('r')).toBe('7.5');
    expect(point(3).getAttribute('r')).toBe('6.5');
  });
});


describe('Responsive graph editing and shelf filters', () => {
  it.each([0.7, 1, 1.7])('maps a pointer at scale %s back to the plotted coordinates', (scale) => {
    const onBands = vi.fn();
    render(<EqGraph bands={bands()} sampleRate={48000} onBands={onBands} onCommit={vi.fn()} />);
    const graph = screen.getByRole('group');
    vi.spyOn(graph, 'getBoundingClientRect').mockReturnValue({ left: 30, top: 40, width: EQ_W * scale, height: EQ_H * scale } as DOMRect);
    fireEvent.pointerDown(screen.getAllByRole('slider')[4]);
    fireEvent.pointerMove(graph, { clientX: 30 + 250 * scale, clientY: 40 + 110 * scale });
    const edited = onBands.mock.calls.at(-1)?.[0][4];
    expect(edited.frequency).toBeCloseTo(xToFreq(250));
    expect(edited.gain).toBeCloseTo(yToDb(110));
  });

  it('keeps both gain limits visible and reachable in the full viewport', () => {
    const values = bands();
    values[0].gain = 30;
    values[10].gain = -30;
    const onBands = vi.fn();
    render(<EqGraph bands={values} sampleRate={48000} onBands={onBands} onCommit={vi.fn()} />);
    const graph = screen.getByRole('group');
    const dots = screen.getAllByRole('slider');
    const [, top, , height] = graph.getAttribute('viewBox')!.split(' ').map(Number);
    for (const dot of [dots[0], dots[10]]) {
      expect(Number(dot.getAttribute('cy')) - Number(dot.getAttribute('r'))).toBeGreaterThan(top);
      expect(Number(dot.getAttribute('cy')) + Number(dot.getAttribute('r'))).toBeLessThan(top + height);
    }
    vi.spyOn(graph, 'getBoundingClientRect').mockReturnValue({ left: 30, top: 40, width: EQ_W, height } as DOMRect);
    fireEvent.pointerDown(dots[4]);
    fireEvent.pointerMove(graph, { clientX: 280, clientY: 40 });
    expect(onBands.mock.calls.at(-1)?.[0][4].gain).toBe(30);
    fireEvent.pointerMove(graph, { clientX: 280, clientY: 40 + height });
    expect(onBands.mock.calls.at(-1)?.[0][4].gain).toBe(-30);
  });

  it.each([0.7, 1.7])('keeps Shift-drag Q movement independent of viewport scale %s', (scale) => {
    const onBands = vi.fn();
    render(<EqGraph bands={bands()} sampleRate={48000} onBands={onBands} onCommit={vi.fn()} />);
    const graph = screen.getByRole('group');
    vi.spyOn(graph, 'getBoundingClientRect').mockReturnValue({ left: 30, top: 40, width: EQ_W * scale, height: EQ_H * scale } as DOMRect);
    fireEvent.pointerDown(screen.getAllByRole('slider')[4]);
    const movement = new MouseEvent('pointermove', { bubbles: true, shiftKey: true });
    Object.defineProperty(movement, 'movementY', { value: 10 * scale });
    fireEvent(graph, movement);
    expect(onBands.mock.calls.at(-1)?.[0][4].q).toBeCloseTo(DEFAULT_Q + 1);
  });

  it('disables Q for a shelf without blocking its frequency and gain', () => {
    const onBand = vi.fn();
    render(<BandFields band={band({ type: 'lowshelf' })} index={0} editable onBand={onBand} onCommit={vi.fn()} />);
    const [freq, gain, q] = screen.getAllByRole('textbox') as HTMLInputElement[];
    expect(q.disabled).toBe(true);
    expect(q.value).toBe('—');
    expect(freq.disabled).toBe(false);
    expect(gain.disabled).toBe(false);
    fireEvent.blur(q, { target: { value: '2.5' } });
    expect(onBand).not.toHaveBeenCalled();
  });

  it('ignores Shift-drag on a shelf instead of storing an inaudible Q change', () => {
    const values = bands(); values[0].type = 'lowshelf';
    const onBands = vi.fn();
    render(<EqGraph bands={values} sampleRate={48000} onBands={onBands} onCommit={vi.fn()} />);
    const dot = screen.getAllByRole('slider')[0];
    expect(dot.getAttribute('aria-valuetext')).not.toContain('Q');
    fireEvent.pointerDown(dot);
    fireEvent.pointerMove(screen.getByRole('group'), { shiftKey: true, movementY: 10 });
    expect(onBands).not.toHaveBeenCalled();
  });
});
