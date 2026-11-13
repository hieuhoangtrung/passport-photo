import countries from './data/countries.json';

// All sizes in mm. head = chin to crown. eye = eye line height from bottom edge.
export type Spec = {
  w: number;
  h: number;
  headMin: number;
  headMax: number;
  eyeMin?: number;
  eyeMax?: number;
};
export type CountryRule = Spec & { source?: string; low?: boolean }; // low = some details not confirmed

const ICAO: Spec = { w: 35, h: 45, headMin: 32, headMax: 36 };
const US: Spec = { w: 50.8, h: 50.8, headMin: 25.4, headMax: 34.9, eyeMin: 28.6, eyeMax: 34.9 };

export const SIZES: Record<string, { label: string; spec: Spec }> = {
  '35x45': { label: '35 × 45 mm', spec: ICAO },
  '30x40': { label: '30 × 40 mm', spec: { w: 30, h: 40, headMin: 28, headMax: 32 } },
  '40x50': { label: '40 × 50 mm', spec: { w: 40, h: 50, headMin: 32, headMax: 36 } },
  '2x2in': { label: '2 × 2 in / 51 × 51 mm', spec: US },
  '33x48': { label: '33 × 48 mm', spec: { w: 33, h: 48, headMin: 28, headMax: 33 } },
  '35x50': { label: '35 × 50 mm', spec: { w: 35, h: 50, headMin: 32, headMax: 36 } },
  '40x60': { label: '40 × 60 mm', spec: { w: 40, h: 60, headMin: 32, headMax: 36 } },
  '50x70': { label: '50 × 70 mm', spec: { w: 50, h: 70, headMin: 31, headMax: 36 } },
};

// Keyed by ISO 3166-1 alpha-2; names come from Intl.DisplayNames in the user's language.
// Researched 2026-11: "source" only for official government pages; "low" = based on secondary sources.
export const COUNTRIES: Record<string, CountryRule> = countries;

export const DEFAULT_COUNTRY = 'AU';

export function specFor(mode: 'country' | 'size', key: string): CountryRule {
  return (mode === 'country' ? COUNTRIES[key] : SIZES[key]?.spec) ?? ICAO;
}

// Wrapped in Unicode isolates (LRI ... PDI) so measurements keep their order inside right-to-left text.
const ltr = (s: string) => `\u2066${s}\u2069`;
export const fmtMm = (n: number) => ltr(`${+n.toFixed(1)} mm`);
export const fmtSize = (s: Spec) => ltr(`${+s.w.toFixed(1)} × ${+s.h.toFixed(1)} mm`);
export const fmtRange = (a: number, b: number) => ltr(`${+a.toFixed(1)}–${+b.toFixed(1)} mm`);
