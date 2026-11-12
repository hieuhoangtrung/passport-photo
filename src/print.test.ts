import { describe, expect, it } from 'vitest';
import { GAP, MARGIN, pack, PAPERS } from './print';

const a = { id: 'a', w: 35, h: 45 };
const b = { id: 'b', w: 30, h: 40 };

describe('pack', () => {
  it('fills a 6x4 sheet with as many 35x45 photos as fit', () => {
    const l = pack(PAPERS['6x4'], [{ ...a, count: null }]);
    expect(l.placed.a).toBe(6);
  });

  it('mixes fixed counts with a fill row', () => {
    const l = pack(PAPERS['6x4'], [{ ...a, count: 2 }, { ...b, count: null }]);
    expect(l.placed).toEqual({ a: 2, b: 6 });
    expect(l.dropped).toBe(0);
  });

  it('reports photos that do not fit', () => {
    const l = pack(PAPERS['6x4'], [{ ...a, count: 10 }]);
    expect(l.placed.a).toBe(6);
    expect(l.dropped).toBe(4);
  });

  it('keeps photos inside margins and apart', () => {
    const l = pack(PAPERS.A4, [{ ...a, count: null }, { ...b, count: 3 }]);
    for (const p of l.places) {
      expect(p.x).toBeGreaterThanOrEqual(MARGIN - 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(MARGIN - 1e-6);
      expect(p.x + p.w).toBeLessThanOrEqual(l.w - MARGIN + 1e-6);
      expect(p.y + p.h).toBeLessThanOrEqual(l.h - MARGIN + 1e-6);
    }
    for (const p of l.places)
      for (const q of l.places)
        if (p !== q) {
          const apart = p.x + p.w + GAP <= q.x + 1e-6 || q.x + q.w + GAP <= p.x + 1e-6 || p.y + p.h + GAP <= q.y + 1e-6 || q.y + q.h + GAP <= p.y + 1e-6;
          expect(apart).toBe(true);
        }
    expect(l.placed.b).toBe(3);
    expect(l.placed.a).toBeGreaterThan(20);
  });
});
