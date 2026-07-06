// Custom accent color. The user picks a single hue; we derive the whole accent set
// from it at FIXED OKLCH lightness/chroma, so any hue stays readable and equally bright
// (a raw RGB picker would let people choose an unreadable dark-on-dark accent).

export type ThemeId = 'eclipse' | 'nocturne' | 'aurora' | 'solar' | 'custom';

const CUSTOM_VARS = ['--primary', '--accent', '--ring', '--g-peak', '--g-shelf', '--g-viz'];

function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const toS = (x: number) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(1, v));
  };
  return [toS(lr) * 255, toS(lg) * 255, toS(lb) * 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
}

// shadcn HSL triplet ("H S% L%") for a given OKLCH accent, so hsl(var(--primary)) works.
const hslTriplet = (L: number, C: number, H: number) => {
  const [h, s, l] = rgbToHsl(...oklchToRgb(L, C, H));
  return `${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%`;
};

// Apply a custom hue as inline body vars (inline beats the data-theme stylesheet rules).
export function applyCustomHue(hue: number) {
  const st = document.body.style;
  const accent = hslTriplet(0.72, 0.11, hue);
  st.setProperty('--primary', accent);
  st.setProperty('--accent', accent);
  st.setProperty('--ring', accent);
  st.setProperty('--g-peak', `oklch(0.69 0.09 ${hue})`);
  st.setProperty('--g-shelf', `oklch(0.69 0.07 ${(hue + 35) % 360})`);
  st.setProperty('--g-viz', `oklch(0.47 0.06 ${hue})`);
}

export function clearCustomHue() {
  for (const p of CUSTOM_VARS) document.body.style.removeProperty(p);
}

// Central theme applier: preset themes use the CSS data-theme rules; custom uses inline vars.
export function applyThemeId(id: ThemeId, hue: number) {
  if (id === 'custom') {
    document.body.dataset.theme = 'eclipse'; // neutral base; inline vars win over it
    applyCustomHue(hue);
  } else {
    clearCustomHue();
    document.body.dataset.theme = id;
  }
}
