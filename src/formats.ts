// All sizes in mm. head = chin to crown. eye = eye line height from bottom edge.
export type Spec = {
  w: number;
  h: number;
  headMin: number;
  headMax: number;
  eyeMin?: number;
  eyeMax?: number;
};

const ICAO: Spec = { w: 35, h: 45, headMin: 32, headMax: 36 };
const US: Spec = { w: 50.8, h: 50.8, headMin: 25.4, headMax: 34.9, eyeMin: 28.6, eyeMax: 34.9 };

export const SIZES: Record<string, { label: string; spec: Spec }> = {
  '35x45': { label: '35 × 45 mm (most countries)', spec: ICAO },
  '30x40': { label: '30 × 40 mm', spec: { w: 30, h: 40, headMin: 28, headMax: 32 } },
  '40x50': { label: '40 × 50 mm', spec: { w: 40, h: 50, headMin: 32, headMax: 36 } },
  '2x2in': { label: '2 × 2 in / 51 × 51 mm', spec: US },
  '33x48': { label: '33 × 48 mm', spec: { w: 33, h: 48, headMin: 28, headMax: 33 } },
  '50x70': { label: '50 × 70 mm', spec: { w: 50, h: 70, headMin: 31, headMax: 36 } },
};

// ponytail: short list of rules we are confident about; add a country when its official rule is checked.
export const COUNTRIES: Record<string, Spec> = {
  Australia: ICAO,
  'New Zealand': ICAO,
  'United Kingdom': { ...ICAO, headMin: 29, headMax: 34 },
  'European Union / Schengen': ICAO,
  France: ICAO,
  Germany: ICAO,
  Italy: ICAO,
  Spain: ICAO,
  Japan: ICAO,
  'South Korea': ICAO,
  Singapore: { ...ICAO, headMin: 25, headMax: 35 },
  'Hong Kong': SIZES['40x50'].spec,
  China: SIZES['33x48'].spec,
  Canada: SIZES['50x70'].spec,
  'United States': US,
};

export function specFor(mode: 'country' | 'size', key: string): Spec {
  return (mode === 'country' ? COUNTRIES[key] : SIZES[key]?.spec) ?? ICAO;
}

export const fmtMm = (n: number) => `${+n.toFixed(1)} mm`;
