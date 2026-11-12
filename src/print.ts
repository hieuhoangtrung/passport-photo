// All sizes in mm, portrait (w <= h). We try both paper orientations.
export const PAPERS: Record<string, { label: string; w: number; h: number }> = {
  '6x4': { label: '6 × 4 in (10 × 15 cm)', w: 101.6, h: 152.4 },
  '7x5': { label: '7 × 5 in (13 × 18 cm)', w: 127, h: 177.8 },
  A5: { label: 'A5 (148 × 210 mm)', w: 148, h: 210 },
  A4: { label: 'A4 (210 × 297 mm)', w: 210, h: 297 },
  Letter: { label: 'US Letter (8.5 × 11 in)', w: 215.9, h: 279.4 },
};

export const GAP = 3; // space between photos for cutting
export const MARGIN = 3; // most printers cannot print to the edge
const MAX_FILL = 200;
const EPS = 1e-6;

export type PrintItem = { id: string; w: number; h: number; count: number | null }; // null = as many as fit
export type Place = { id: string; x: number; y: number; w: number; h: number };
export type Layout = { w: number; h: number; places: Place[]; placed: Record<string, number>; dropped: number };

/** Shelf packing: tallest first, left to right, new row when full. Null if it does not fit. */
function shelf(W: number, H: number, list: Omit<Place, 'x' | 'y'>[]): Place[] | null {
  const sorted = [...list].sort((a, b) => b.h - a.h);
  const out: Place[] = [];
  let x = MARGIN, y = MARGIN, rowH = 0;
  for (const it of sorted) {
    if (x + it.w > W - MARGIN + EPS) {
      y += rowH + GAP;
      x = MARGIN;
      rowH = 0;
    }
    if (x + it.w > W - MARGIN + EPS || y + it.h > H - MARGIN + EPS) return null;
    out.push({ ...it, x, y });
    x += it.w + GAP;
    rowH = Math.max(rowH, it.h);
  }
  // centre the block on the paper
  const dx = (W - Math.max(MARGIN, ...out.map((p) => p.x + p.w)) - MARGIN) / 2;
  const dy = (H - Math.max(MARGIN, ...out.map((p) => p.y + p.h)) - MARGIN) / 2;
  return out.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

function packOn(W: number, H: number, items: PrintItem[]): Layout {
  let list: Omit<Place, 'x' | 'y'>[] = [];
  let places: Place[] = [];
  let dropped = 0;
  const tryAdd = (it: PrintItem) => {
    const next = [...list, { id: it.id, w: it.w, h: it.h }];
    const p = shelf(W, H, next);
    if (!p) return false;
    list = next;
    places = p;
    return true;
  };
  for (const it of items) for (let i = 0; i < (it.count ?? 0); i++) if (!tryAdd(it)) dropped++;
  // ponytail: fill rows are filled in order, one by one (O(n²) repacks, fine for n ≤ 200)
  for (const it of items) if (it.count === null) for (let i = 0; i < MAX_FILL && tryAdd(it); i++);
  const placed: Record<string, number> = {};
  for (const it of items) placed[it.id] = 0;
  for (const p of places) placed[p.id]++;
  return { w: W, h: H, places, placed, dropped };
}

/** Best of portrait and landscape: fewest dropped, then most photos. */
export function pack(paper: { w: number; h: number }, items: PrintItem[]): Layout {
  const a = packOn(paper.w, paper.h, items);
  const b = packOn(paper.h, paper.w, items);
  if (a.dropped !== b.dropped) return a.dropped < b.dropped ? a : b;
  return b.places.length > a.places.length ? b : a;
}

export function drawSheet(layout: Layout, photos: Record<string, CanvasImageSource>, pxPerMm: number, canvas = document.createElement('canvas')) {
  canvas.width = Math.round(layout.w * pxPerMm);
  canvas.height = Math.round(layout.h * pxPerMm);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#bbb';
  ctx.lineWidth = Math.max(1, pxPerMm * 0.1);
  for (const p of layout.places) {
    const [x, y, w, h] = [p.x, p.y, p.w, p.h].map((v) => v * pxPerMm);
    ctx.drawImage(photos[p.id], x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }
  return canvas;
}
