import { apply, autoTransform, geometryChecks, LM, pixelChecks, setJpegDpi, type Check, type Edits, type Pt, type Xform } from './checks';
import type { Detection } from './detect';
import { bgColorFor, type Spec } from './formats';

export const DPI = 600;
const PX_PER_MM = DPI / 25.4;

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  return c;
};

function setXform(ctx: CanvasRenderingContext2D, t: Xform, k: number, srcW: number, srcH: number, img: CanvasImageSource & { width: number; height: number }) {
  const cos = Math.cos(t.theta) * t.s * k;
  const sin = Math.sin(t.theta) * t.s * k;
  // the mask canvas may be smaller than the photo, so scale it up to photo pixels first
  const sx = srcW / img.width;
  const sy = srcH / img.height;
  ctx.setTransform(
    cos * sx,
    sin * sx,
    -sin * sy,
    cos * sy,
    k * t.o.x - (cos * t.pivot.x - sin * t.pivot.y),
    k * t.o.y - (sin * t.pivot.x + cos * t.pivot.y),
  );
}

export type Result = { canvas: HTMLCanvasElement; checks: Check[]; t: Xform | null; crown: Pt | null; chin: Pt | null };

export function render(src: HTMLCanvasElement, det: Detection, spec: Spec, e: Edits): Result {
  const k = PX_PER_MM;
  const out = canvas(spec.w * k, spec.h * k);
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  // Replaced background gets the country's colour; otherwise white shows only at uncovered edges.
  ctx.fillStyle = e.replaceBg ? bgColorFor(spec, e.bgColor) : '#fff';
  ctx.fillRect(0, 0, out.width, out.height);

  const { face } = det;
  const t = face ? autoTransform(face, spec, e) : null;
  const filter = `brightness(${e.brightness}%) contrast(${e.contrast}%)`;
  // ponytail: no face = show the photo fitted, nothing to align it to
  const fit: Xform = { s: Math.min(spec.w / src.width, spec.h / src.height), theta: 0, pivot: { x: 0, y: 0 }, o: { x: 0, y: 0 } };
  const xf = t ?? fit;

  let maskData: Uint8ClampedArray | null = null;
  if (det.maskCanvas) {
    const m = canvas(out.width, out.height);
    const mctx = m.getContext('2d', { willReadFrequently: true })!;
    setXform(mctx, xf, k, src.width, src.height, det.maskCanvas);
    mctx.drawImage(det.maskCanvas, 0, 0);
    if (e.replaceBg) {
      // keep only the person (alpha stays = mask), then put it on white
      mctx.globalCompositeOperation = 'source-in';
      mctx.filter = filter;
      setXform(mctx, xf, k, src.width, src.height, src);
      mctx.drawImage(src, 0, 0);
      ctx.drawImage(m, 0, 0);
    }
    maskData = alpha(mctx, m);
  }
  if (!e.replaceBg || !det.maskCanvas) {
    ctx.filter = filter;
    setXform(ctx, xf, k, src.width, src.height, src);
    ctx.drawImage(src, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
  }

  const checks = geometryChecks(det.faceCount, face, spec, t, { w: src.width, h: src.height }, e.replaceBg);
  if (face && t) {
    const P = (i: number) => {
      const p = apply(t, face.lm[i]);
      return { x: p.x * k, y: p.y * k };
    };
    const fw = P(LM.sideR).x - P(LM.sideL).x;
    const box = (c: Pt, r: number) => ({ x0: c.x - r, y0: c.y - r, x1: c.x + r, y1: c.y + r });
    checks.push(
      ...pixelChecks({
        rgba: ctx.getImageData(0, 0, out.width, out.height).data,
        mask: maskData,
        w: out.width,
        h: out.height,
        face: { x0: P(LM.sideL).x + fw * 0.2, x1: P(LM.sideR).x - fw * 0.2, y0: P(LM.forehead).y, y1: P(LM.chin).y },
        cheekL: box(P(LM.cheekL), fw * 0.06),
        cheekR: box(P(LM.cheekR), fw * 0.06),
        chinY: P(LM.chin).y,
        want: spec.bg,
      }),
    );
  }
  return {
    canvas: out,
    checks,
    t,
    crown: face && t ? apply(t, face.crown) : null,
    chin: face && t ? apply(t, face.lm[LM.chin]) : null,
  };
}

function alpha(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement) {
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const a = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  return a;
}

export async function downloadJpeg(c: HTMLCanvasElement, dpi: number, name: string) {
  const blob = await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('Could not encode image'))), 'image/jpeg', 0.95));
  const bytes = setJpegDpi(new Uint8Array(await blob.arrayBuffer()), dpi);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
