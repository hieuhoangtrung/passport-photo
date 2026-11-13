import type { Spec } from './formats';
import { fmtMm, fmtRange } from './formats';
import type { MessageKey } from './i18n/en';

export type Pt = { x: number; y: number };
export type Mask = { data: Float32Array; w: number; h: number }; // person confidence 0..1
export type Face = { lm: Pt[]; crown: Pt; blend: Record<string, number> }; // source pixels
export type Edits = {
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotate: number;
  brightness: number;
  contrast: number;
  whiteBg: boolean;
};
// out(mm) = o + s * R(theta) * (p - pivot)
export type Xform = { s: number; theta: number; pivot: Pt; o: Pt };
export type Status = 'pass' | 'warn' | 'fail';
// label = t(`check.${id}`), detail = t(msg, vars): checks stay language-free.
export type Check = { id: string; status: Status; msg: MessageKey; vars?: Record<string, string | number> };

export const DEFAULT_EDITS: Edits = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotate: 0,
  brightness: 100,
  contrast: 100,
  whiteBg: false,
};

// MediaPipe face mesh indices
export const LM = { eyeL: 468, eyeR: 473, chin: 152, forehead: 10, nose: 1, sideL: 234, sideR: 454, cheekL: 50, cheekR: 280 };

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const len = (a: Pt) => Math.hypot(a.x, a.y);
const rot = (a: number, p: Pt): Pt => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
});
const deg = (r: number) => (r * 180) / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const apply = (t: Xform, p: Pt): Pt => {
  const r = rot(t.theta, sub(p, t.pivot));
  return { x: t.o.x + t.s * r.x, y: t.o.y + t.s * r.y };
};
export const invert = (t: Xform, q: Pt): Pt => {
  const r = rot(-t.theta, { x: (q.x - t.o.x) / t.s, y: (q.y - t.o.y) / t.s });
  return { x: r.x + t.pivot.x, y: r.y + t.pivot.y };
};

/** Top of head: walk up from the forehead landmark until the person mask ends. */
export function findCrown(lm: Pt[], mask: Mask | null, srcW: number, srcH: number): Pt {
  const top = lm[LM.forehead];
  const faceLen = len(sub(top, lm[LM.chin]));
  const up = { x: (top.x - lm[LM.chin].x) / faceLen, y: (top.y - lm[LM.chin].y) / faceLen };
  const at = (t: number, side: number) => ({
    x: top.x + (up.x * t - up.y * side) * faceLen,
    y: top.y + (up.y * t + up.x * side) * faceLen,
  });
  let frac = 0.25; // ponytail: typical forehead-landmark-to-crown gap when there is no mask
  if (mask) {
    const conf = (p: Pt) => {
      if (p.x < 0 || p.y < 0 || p.x >= srcW || p.y >= srcH) return 0;
      const mx = Math.floor((p.x / srcW) * mask.w);
      const my = Math.floor((p.y / srcH) * mask.h);
      return mask.data[my * mask.w + mx];
    };
    let best = 0;
    for (const side of [-0.15, 0, 0.15]) {
      let t = 0.05;
      while (t < 0.8 && conf(at(t, side)) >= 0.5) t += 0.01;
      best = Math.max(best, t);
    }
    // big hair or a hat should not count as head height
    frac = clamp(best, 0.15, 0.5);
  }
  return at(frac, 0);
}

/** Level the eyes, scale the head to the middle of the allowed range, place it in the frame. */
export function autoTransform(face: Face, spec: Spec, e: Edits): Xform {
  const eyeL = face.lm[LM.eyeL];
  const eyeR = face.lm[LM.eyeR];
  const pivot = mid(eyeL, eyeR);
  const theta = -Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x) + (e.rotate * Math.PI) / 180;
  const headPx = len(sub(face.lm[LM.chin], face.crown));
  const headMm = ((spec.headMin + spec.headMax) / 2) * e.zoom;
  const s = headMm / headPx;
  const crownDy = s * rot(theta, sub(face.crown, pivot)).y; // negative: crown is above the eyes
  const eyeY =
    spec.eyeMin !== undefined && spec.eyeMax !== undefined
      ? spec.h - (spec.eyeMin + spec.eyeMax) / 2
      : (spec.h - headMm) * 0.45 - crownDy;
  return { s, theta, pivot, o: { x: spec.w / 2 + e.offsetX, y: eyeY + e.offsetY } };
}

const check = (id: string, ok: boolean | Status, msg: MessageKey, vars?: Check['vars']): Check => ({
  id,
  status: typeof ok === 'string' ? ok : ok ? 'pass' : 'fail',
  msg,
  vars,
});

export function geometryChecks(
  faceCount: number,
  face: Face | null,
  spec: Spec,
  t: Xform | null,
  src: { w: number; h: number },
  whiteBg: boolean,
): Check[] {
  if (faceCount === 0 || !face || !t) return [check('face', false, 'msg.noFace')];
  const out: Check[] = [check('one', faceCount === 1, faceCount === 1 ? 'msg.oneFace' : 'msg.manyFaces', { n: faceCount })];
  const P = (i: number) => apply(t, face.lm[i]);
  const crown = apply(t, face.crown);
  const chin = P(LM.chin);
  const eyeL = P(LM.eyeL);
  const eyeR = P(LM.eyeR);
  const eyes = mid(eyeL, eyeR);

  const head = len(sub(chin, crown));
  out.push(check('head', head >= spec.headMin && head <= spec.headMax, 'msg.head', { value: fmtMm(head), range: fmtRange(spec.headMin, spec.headMax) }));
  if (spec.eyeMin !== undefined && spec.eyeMax !== undefined) {
    const eyeH = spec.h - eyes.y;
    out.push(check('eyeline', eyeH >= spec.eyeMin && eyeH <= spec.eyeMax, 'msg.eyeline', { value: fmtMm(eyeH), range: fmtRange(spec.eyeMin, spec.eyeMax) }));
  }
  const inFrame = crown.y >= 0.5 && chin.y <= spec.h && P(LM.sideL).x >= 0 && P(LM.sideR).x <= spec.w;
  out.push(check('frame', inFrame, inFrame ? 'msg.frameOk' : 'msg.frameCut'));

  const tilt = deg(Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x));
  out.push(check('tilt', Math.abs(tilt) <= 3, 'msg.tilt', { value: `${tilt.toFixed(1)}°` }));

  const off = eyes.x - spec.w / 2;
  out.push(check('center', Math.abs(off) <= 2, 'msg.center', { value: fmtMm(Math.abs(off)) }));

  const a = P(LM.sideL);
  const b = P(LM.sideR);
  const yaw = (P(LM.nose).x - a.x) / (b.x - a.x);
  const front = yaw >= 0.38 && yaw <= 0.62;
  out.push(check('yaw', front, front ? 'msg.yawOk' : 'msg.yawBad'));

  const bs = (k: string) => face.blend[k] ?? 0;
  const eyesOpen = Math.max(bs('eyeBlinkLeft'), bs('eyeBlinkRight')) < 0.5;
  out.push(check('eyes', eyesOpen, eyesOpen ? 'msg.eyesOk' : 'msg.eyesClosed'));

  const gaze = Math.max(
    ...['LookInLeft', 'LookInRight', 'LookOutLeft', 'LookOutRight', 'LookUpLeft', 'LookUpRight', 'LookDownLeft', 'LookDownRight'].map(
      (k) => bs('eye' + k),
    ),
  );
  out.push(check('gaze', gaze < 0.6 ? 'pass' : 'warn', gaze < 0.6 ? 'msg.gazeOk' : 'msg.gazeAway'));

  const neutral = Math.max(bs('mouthSmileLeft'), bs('mouthSmileRight')) < 0.5 && bs('jawOpen') < 0.3;
  out.push(check('expr', neutral, neutral ? 'msg.exprOk' : 'msg.exprBad'));

  const dpi = 25.4 / t.s;
  out.push(check('res', dpi >= 300, 'msg.res', { dpi: Math.round(dpi) }));

  const corners = [
    { x: 0, y: 0 },
    { x: spec.w, y: 0 },
    { x: 0, y: spec.h },
    { x: spec.w, y: spec.h },
  ].map((q) => invert(t, q));
  const covered = corners.every((p) => p.x >= 0 && p.y >= 0 && p.x <= src.w && p.y <= src.h);
  out.push(check('cover', covered ? 'pass' : whiteBg ? 'warn' : 'fail', covered ? 'msg.coverOk' : 'msg.coverBad'));
  return out;
}

type Box = { x0: number; y0: number; x1: number; y1: number };
export type PixelInput = {
  rgba: Uint8ClampedArray;
  mask: Uint8ClampedArray | null; // person alpha per output pixel, 0..255
  w: number;
  h: number;
  face: Box;
  cheekL: Box;
  cheekR: Box;
  chinY: number;
};

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

function boxStats(p: PixelInput, b: Box) {
  let n = 0, sum = 0, sat = 0, clip = 0;
  for (let y = Math.max(0, b.y0 | 0); y < Math.min(p.h, b.y1); y++) {
    for (let x = Math.max(0, b.x0 | 0); x < Math.min(p.w, b.x1); x++) {
      const i = (y * p.w + x) * 4;
      const l = lum(p.rgba, i);
      sum += l;
      sat += Math.max(p.rgba[i], p.rgba[i + 1], p.rgba[i + 2]) - Math.min(p.rgba[i], p.rgba[i + 1], p.rgba[i + 2]);
      if (l > 250) clip++;
      n++;
    }
  }
  return { mean: sum / (n || 1), sat: sat / (n || 1), clip: clip / (n || 1) };
}

export function pixelChecks(p: PixelInput): Check[] {
  const out: Check[] = [];
  // background: non-person pixels above the chin
  let n = 0, sum = 0, sq = 0;
  if (p.mask) {
    for (let y = 0; y < Math.min(p.h, p.chinY); y += 2) {
      for (let x = 0; x < p.w; x += 2) {
        const j = y * p.w + x;
        if (p.mask[j] > 50) continue;
        const l = lum(p.rgba, j * 4);
        sum += l;
        sq += l * l;
        n++;
      }
    }
  }
  if (n > 100) {
    const mean = sum / n;
    const std = Math.sqrt(Math.max(0, sq / n - mean * mean));
    out.push(check('bgLight', mean >= 160, mean >= 160 ? 'msg.bgLightOk' : 'msg.bgDark'));
    out.push(check('bgPlain', std <= 20, std <= 20 ? 'msg.bgPlainOk' : 'msg.bgBusy'));
  }

  const f = boxStats(p, p.face);
  const exposure: Status = f.mean < 70 || f.mean > 220 ? 'fail' : f.clip > 0.08 ? 'warn' : 'pass';
  out.push(
    check('exposure', exposure, f.mean < 70 ? 'msg.tooDark' : f.mean > 220 ? 'msg.tooBright' : f.clip > 0.08 ? 'msg.glare' : 'msg.exposureOk'),
  );
  const l = boxStats(p, p.cheekL).mean;
  const r = boxStats(p, p.cheekR).mean;
  const even = Math.abs(l - r) / Math.max(l, r, 1) <= 0.25;
  out.push(check('light', even ? 'pass' : 'warn', even ? 'msg.lightOk' : 'msg.lightUneven'));
  out.push(check('colour', f.sat >= 10, f.sat >= 10 ? 'msg.colourOk' : 'msg.grey'));
  return out;
}

/** Set JFIF density so printers know the physical size. */
export function setJpegDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  const isJfif = bytes[2] === 0xff && bytes[3] === 0xe0 && String.fromCharCode(...bytes.slice(6, 10)) === 'JFIF';
  if (!isJfif) return bytes;
  bytes[13] = 1; // dots per inch
  bytes[14] = bytes[16] = dpi >> 8;
  bytes[15] = bytes[17] = dpi & 0xff;
  return bytes;
}
