// A recorder for the smoke run: temporary instrumentation, not a product feature.
//
// The console script it replaces died with the popup, and the popup dies on any click outside it,
// so a session that crossed a popup close recorded nothing — which is most of what needs watching.
// This lives inside the extension instead, survives the popup, and hands the whole thing over on
// one click.
//
// WHAT IT HOLDS. What the user did, what the popup sent the audio engine, what reached storage,
// and how the key state changed. It never sees page content or audio — the extension cannot read
// either — but it DOES record the hostnames of tabs you had open while recording, because that is
// exactly what a rule bug is about. It is copied by hand, by the person recording it.
//
// REMOVE BEFORE 2.5.0. Listed in DEPLOY.md. Nothing here should reach the store: not because it is
// unsafe, but because a recorder nobody asked for is not something to ship quietly.

export interface DebugEntry {
  t: number;
  type: string;
  [k: string]: unknown;
}

const MAX = 3000;

let on = false;
let t0 = 0;
let buf: DebugEntry[] = [];
let onFlush: ((entries: DebugEntry[]) => void) | null = null;

export const debugOn = (): boolean => on;

export function startDebug(now: number, restored: DebugEntry[] = []): void {
  on = true;
  t0 = restored.length ? now - (restored[restored.length - 1].t ?? 0) : now;
  buf = restored.slice(-MAX);
}

export function stopDebug(): void {
  on = false;
}

export function clearDebug(): void {
  buf = [];
}

/** Where a flush goes — the popup wires this to storage.session so a close does not lose it. */
export function onDebugFlush(fn: ((entries: DebugEntry[]) => void) | null): void {
  onFlush = fn;
}

/**
 * Record one thing. Cheap and total when off: a single boolean test, so the call sites can stay
 * where they are once this is removed... which they will not, because it is all coming out.
 */
export function dbg(type: string, data: Record<string, unknown> = {}, now = Date.now()): void {
  if (!on) return;
  const e: DebugEntry = { t: Math.round(now - t0), type };
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    e[k] = typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v;
  }
  buf.push(e);
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
  onFlush?.(buf);
}

export const debugEntries = (): DebugEntry[] => buf;
export const debugCount = (): number => buf.length;

/** The text handed to the clipboard. Newline-delimited JSON: readable, greppable, diffable. */
export function debugDump(meta: Record<string, unknown> = {}): string {
  const head = JSON.stringify({ recorded: buf.length, ...meta });
  return [head, ...buf.map((e) => JSON.stringify(e))].join('\n');
}
