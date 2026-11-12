import { FaceLandmarker, FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { findCrown, LM, type Face, type Mask } from './checks';

// Models and WASM are served from this site (public/), so nothing leaves the browser.
const base = import.meta.env.BASE_URL;
let models: Promise<[FaceLandmarker, ImageSegmenter]> | undefined;

function load() {
  return (models ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe`);
    return Promise.all([
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}models/face_landmarker.task` },
        runningMode: 'IMAGE',
        numFaces: 3,
        outputFaceBlendshapes: true,
      }),
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}models/selfie_segmenter.tflite` },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      }),
    ]);
  })());
}

export type Detection = { faceCount: number; face: Face | null; mask: Mask | null; maskCanvas: HTMLCanvasElement | null };

export async function detect(img: HTMLCanvasElement): Promise<Detection> {
  const [landmarker, segmenter] = await load();
  const W = img.width;
  const H = img.height;
  const res = landmarker.detect(img);
  const faceCount = res.faceLandmarks.length;

  const seg = segmenter.segment(img);
  const masks = seg.confidenceMasks ?? [];
  const m = masks[masks.length - 1]; // last channel is the person
  let mask: Mask | null = m ? { data: m.getAsFloat32Array().slice(), w: m.width, h: m.height } : null;
  seg.close();

  if (!faceCount) return { faceCount, face: null, mask, maskCanvas: null };

  // Pick the biggest face.
  const sizeOf = (f: { y: number }[]) => Math.abs(f[LM.chin].y - f[LM.forehead].y);
  const raw = res.faceLandmarks.reduce((a, b) => (sizeOf(b) > sizeOf(a) ? b : a));
  const idx = res.faceLandmarks.indexOf(raw);
  const lm = raw.map((p) => ({ x: p.x * W, y: p.y * H }));

  if (mask) {
    // Some models put background first: flip if the nose is not "person".
    const n = lm[LM.nose];
    const v = mask.data[Math.floor((n.y / H) * mask.h) * mask.w + Math.floor((n.x / W) * mask.w)];
    if (v < 0.5) mask = { ...mask, data: mask.data.map((x) => 1 - x) };
  }

  const blend: Record<string, number> = {};
  for (const c of res.faceBlendshapes[idx]?.categories ?? []) blend[c.categoryName] = c.score;

  return {
    faceCount,
    face: { lm, crown: findCrown(lm, mask, W, H), blend },
    mask,
    maskCanvas: mask ? maskToCanvas(mask) : null,
  };
}

function maskToCanvas(mask: Mask) {
  const c = document.createElement('canvas');
  c.width = mask.w;
  c.height = mask.h;
  const img = new ImageData(mask.w, mask.h);
  for (let i = 0; i < mask.data.length; i++) img.data[i * 4 + 3] = mask.data[i] * 255;
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}
