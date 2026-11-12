import { describe, expect, it } from 'vitest';
import { apply, autoTransform, DEFAULT_EDITS, findCrown, geometryChecks, invert, LM, pixelChecks, setJpegDpi, type Face, type Pt } from './checks';
import { COUNTRIES, SIZES } from './formats';

// Synthetic upright face in a 1000x1400 photo: eyes at y=500, chin at y=750, forehead landmark at y=350.
function face(tiltDeg = 0): Face {
  const lm: Pt[] = Array.from({ length: 478 }, () => ({ x: 500, y: 500 }));
  const set = (i: number, x: number, y: number) => (lm[i] = { x, y });
  set(LM.eyeL, 440, 500);
  set(LM.eyeR, 560, 500);
  set(LM.chin, 500, 750);
  set(LM.forehead, 500, 350);
  set(LM.nose, 500, 600);
  set(LM.sideL, 380, 560);
  set(LM.sideR, 620, 560);
  const a = (tiltDeg * Math.PI) / 180;
  const c = { x: 500, y: 500 };
  const r = (p: Pt) => ({ x: c.x + (p.x - c.x) * Math.cos(a) - (p.y - c.y) * Math.sin(a), y: c.y + (p.x - c.x) * Math.sin(a) + (p.y - c.y) * Math.cos(a) });
  const out = lm.map(r);
  return { lm: out, crown: r({ x: 500, y: 300 }), blend: {} };
}
const src = { w: 1000, h: 1400 };
const status = (checks: { id: string; status: string }[], id: string) => checks.find((c) => c.id === id)?.status;

describe('autoTransform', () => {
  it('puts head at mid range, eyes centred and level, even for a tilted photo', () => {
    for (const tilt of [0, 8]) {
      const f = face(tilt);
      const spec = COUNTRIES.Australia;
      const t = autoTransform(f, spec, DEFAULT_EDITS);
      const crown = apply(t, f.crown);
      const chin = apply(t, f.lm[LM.chin]);
      expect(chin.y - crown.y).toBeCloseTo(34, 5);
      expect(apply(t, f.lm[LM.eyeL]).y).toBeCloseTo(apply(t, f.lm[LM.eyeR]).y, 5);
      expect((apply(t, f.lm[LM.eyeL]).x + apply(t, f.lm[LM.eyeR]).x) / 2).toBeCloseTo(17.5, 5);
      expect(crown.y).toBeCloseTo((45 - 34) * 0.45, 5);
      const back = invert(t, crown);
      expect(back.x).toBeCloseTo(f.crown.x, 5);
    }
  });

  it('uses the eye line rule for US photos', () => {
    const t = autoTransform(face(), COUNTRIES['United States'], DEFAULT_EDITS);
    expect(50.8 - t.o.y).toBeCloseTo((28.6 + 34.9) / 2, 5);
  });
});

describe('geometryChecks', () => {
  const run = (edits = DEFAULT_EDITS, faces = 1) => {
    const f = face();
    return geometryChecks(faces, f, SIZES['35x45'].spec, autoTransform(f, SIZES['35x45'].spec, edits), src, false);
  };
  it('passes a good photo', () => {
    expect(run().filter((c) => c.status !== 'pass')).toEqual([]);
  });
  it('fails after edits break the rules', () => {
    expect(status(run({ ...DEFAULT_EDITS, rotate: 6 }), 'tilt')).toBe('fail');
    expect(status(run({ ...DEFAULT_EDITS, zoom: 1.15 }), 'head')).toBe('fail');
    expect(status(run({ ...DEFAULT_EDITS, offsetX: 3 }), 'center')).toBe('fail');
    expect(status(run(DEFAULT_EDITS, 2), 'one')).toBe('fail');
  });
  it('fails when there is no face', () => {
    expect(geometryChecks(0, null, SIZES['35x45'].spec, null, src, false)[0].status).toBe('fail');
  });
});

describe('findCrown', () => {
  it('follows the person mask above the forehead, within limits', () => {
    const f = face();
    const w = 100, h = 140; // mask at 1/10 scale
    const data = new Float32Array(w * h);
    for (let y = 28; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = 1; // head top at y=280 px
    expect(findCrown(f.lm, { data, w, h }, 1000, 1400).y).toBeCloseTo(280, -1);
    expect(findCrown(f.lm, null, 1000, 1400).y).toBeCloseTo(350 - 0.25 * 400, 5);
    data.fill(1); // mask to the top edge (hat / big hair): capped
    expect(findCrown(f.lm, { data, w, h }, 1000, 1400).y).toBeCloseTo(350 - 0.5 * 400, 5);
  });
});

describe('pixelChecks', () => {
  const w = 40, h = 40;
  const img = (bg: number, face: number) => {
    const rgba = new Uint8ClampedArray(w * h * 4);
    const mask = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const inFace = x >= 10 && x < 30 && y >= 10;
        const i = (y * w + x) * 4;
        rgba.set(inFace ? [face + 40, face, face - 30, 255] : [bg, bg, bg, 255], i);
        mask[y * w + x] = inFace ? 255 : 0;
      }
    const box = { x0: 12, y0: 12, x1: 28, y1: 30 };
    return { rgba, mask, w, h, face: box, cheekL: box, cheekR: box, chinY: 30 };
  };
  it('passes a light plain background and a well-lit colour face', () => {
    expect(pixelChecks(img(235, 150)).filter((c) => c.status !== 'pass')).toEqual([]);
  });
  it('flags a dark background and dark face', () => {
    const c = pixelChecks(img(80, 40));
    expect(status(c, 'bgLight')).toBe('fail');
    expect(status(c, 'exposure')).toBe('fail');
  });
});

it('setJpegDpi writes JFIF density', () => {
  const b = new Uint8Array(20);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1]);
  setJpegDpi(b, 600);
  expect([...b.slice(13, 18)]).toEqual([1, 2, 88, 2, 88]);
});
