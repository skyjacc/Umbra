import { NUM_FILTERS, DEFAULT_FREQUENCIES, DEFAULT_Q, clampMasterGain, sanitizeFilter, filterType, type Band } from './audio';
import { coerceBands, UNSAFE_KEYS, type PresetBands } from './presets';
import { matchRule, type Rule } from './rules';
import { BUILTIN_PRESETS } from './builtins';

export interface SoundProfile {
  bands: Band[];
  gain: number;
  presetName?: string;
}

export const flatBands = (): Band[] => Array.from({ length: NUM_FILTERS }, (_, i) => ({
  frequency: DEFAULT_FREQUENCIES[i], gain: 0, q: DEFAULT_Q, type: filterType(i)
}));

export function presetToBands(p: PresetBands): Band[] {
  const c = coerceBands(p);
  if (!c) return flatBands();
  return Array.from({ length: NUM_FILTERS }, (_, i) =>
    sanitizeFilter({ frequency: c.frequencies[i], gain: c.gains[i], q: c.qs[i] }, i));
}

/** The popup and worker use the same rule → global → flat resolution. */
export function resolveSound(host: string, rules: Rule[], presets: Record<string, PresetBands>, global: SoundProfile | null): Required<SoundProfile> {
  const rule = host ? matchRule(host, rules) : null;
  if (rule?.mode === 'curve' && rule.curve) {
    return { bands: presetToBands(rule.curve), gain: clampMasterGain(rule.gain ?? 1), presetName: rule.preset || '' };
  }
  if (rule?.mode === 'preset' && rule.preset) {
    const own = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);
    const preset = own(presets, rule.preset) ? presets[rule.preset] : own(BUILTIN_PRESETS, rule.preset) ? BUILTIN_PRESETS[rule.preset] : null;
    if (preset) return { bands: presetToBands(preset), gain: 1, presetName: rule.preset };
  }
  return global
    ? { bands: global.bands, gain: clampMasterGain(global.gain), presetName: global.presetName || '' }
    : { bands: flatBands(), gain: 1, presetName: '' };
}

/** Decode one storage snapshot for startup, including command-only captures without a popup. */
export function resolveStoredSound(host: string, sync: Record<string, any>, local: Record<string, any>): Required<SoundProfile> {
  const presets: Record<string, PresetBands> = Object.create(null);
  for (const [key, value] of Object.entries(sync)) {
    if (!key.startsWith('PRESETS.')) continue;
    const name = key.slice('PRESETS.'.length);
    if (!UNSAFE_KEYS.includes(name)) presets[name] = value;
  }
  const raw = local.DEFAULT_EQ;
  const global = raw && Array.isArray(raw.filters) && raw.filters.length === NUM_FILTERS
    ? { bands: raw.filters.map((b: any, i: number) => sanitizeFilter({ frequency: b?.f, gain: b?.g, q: b?.q }, i)), gain: raw.gain ?? 1, presetName: typeof raw.preset === 'string' ? raw.preset : '' }
    : null;
  return resolveSound(host, Array.isArray(sync.RULES) ? sync.RULES : [], presets, global);
}
