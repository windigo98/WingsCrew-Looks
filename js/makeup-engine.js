/**
 * On-device makeup painter. Pure JavaScript on RGBA pixels, so it runs the same
 * in the browser and in Node tests. Uses the MediaPipe Face Mesh landmarks
 * (478 points, x/y as 0..1 of the image) that face-fit.js already finds.
 *
 * Every layer is a soft mask (anti-aliased polygons, feathered with a box blur)
 * times a blend that keeps the skin's own light and shade, so pores, lip lines,
 * and brow hairs show through the color instead of being painted over.
 */
import { MAKEUP_LAYERS, shadeById } from "./makeup-looks.js";

/* ---------------------------------------------------------------- landmarks */

/** Face Mesh indices. "a" is the side on the image left, "b" the image right. */
export const MESH = {
  faceOval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
  lipsOuter: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
  lipsInner: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95],
  // Upper lid from the inner corner to the outer corner, then the lower lid back.
  eyeUpper: { a: [133, 173, 157, 158, 159, 160, 161, 246, 33], b: [362, 398, 384, 385, 386, 387, 388, 466, 263] },
  eyeLower: { a: [33, 7, 163, 144, 145, 153, 154, 155, 133], b: [263, 249, 390, 373, 374, 380, 381, 382, 362] },
  // Brow edges from the inner end to the tail.
  browUpper: { a: [107, 66, 105, 63, 70], b: [336, 296, 334, 293, 300] },
  browLower: { a: [55, 65, 52, 53, 46], b: [285, 295, 282, 283, 276] },
  cheek: { a: 50, b: 280 },
  cheekHigh: { a: 117, b: 346 },
  cheekInner: { a: 118, b: 347 },
  cheekOuter: { a: 111, b: 340 },
  ear: { a: 93, b: 323 },
  side: { a: 234, b: 454 },
  midCheek: { a: 187, b: 411 },
  temple: { a: 54, b: 284 },
  templeLow: { a: 162, b: 389 },
  jaw: { a: 172, b: 397 },
  jawLow: { a: 136, b: 365 },
  noseBridge: [168, 6, 197, 195],
  noseTip: 4,
  noseUnder: 2,
  lipTop: 0,
  lipBottom: 17,
  innerTop: 13,
  innerBottom: 14,
  forehead: 10,
  chin: 152,
};

const P = (x, y) => ({ x, y });
const add = (a, b) => P(a.x + b.x, a.y + b.y);
const sub = (a, b) => P(a.x - b.x, a.y - b.y);
const mul = (a, k) => P(a.x * k, a.y * k);
const lerp = (a, b, t) => P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
const len = (a) => Math.hypot(a.x, a.y);
const unit = (a) => {
  const l = len(a) || 1;
  return P(a.x / l, a.y / l);
};
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0, e1, v) => {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Landmarks ([{x,y}] or [[x,y]], 0..1) to pixel points. */
export function toPixels(landmarks, width, height) {
  if (!Array.isArray(landmarks) || landmarks.length < 468) return null;
  const out = new Array(landmarks.length);
  for (let i = 0; i < landmarks.length; i += 1) {
    const p = landmarks[i];
    const x = Array.isArray(p) ? p[0] : p?.x;
    const y = Array.isArray(p) ? p[1] : p?.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out[i] = P(x * width, y * height);
  }
  return out;
}

/** Closed (or open) Catmull-Rom curve through the points, so lips and lids are curved, not faceted. */
export function spline(points, { closed = true, steps = 6 } = {}) {
  const n = points.length;
  if (n < 3) return points.slice();
  const out = [];
  const get = (i) => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i += 1) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push(P(
        0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      ));
    }
  }
  if (!closed) out.push(points[n - 1]);
  return out;
}

/** Point at fraction t (0..1) of the way along an open polyline, by length. */
export function along(points, t) {
  const lengths = [0];
  for (let i = 1; i < points.length; i += 1) lengths.push(lengths[i - 1] + len(sub(points[i], points[i - 1])));
  const total = lengths[lengths.length - 1] || 1;
  const target = clamp01(t) * total;
  for (let i = 1; i < points.length; i += 1) {
    if (lengths[i] >= target) {
      const seg = lengths[i] - lengths[i - 1] || 1;
      return lerp(points[i - 1], points[i], (target - lengths[i - 1]) / seg);
    }
  }
  return points[points.length - 1];
}

export function ellipse(center, rx, ry, angle = 0, steps = 40) {
  const out = [];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out.push(P(center.x + x * c - y * s, center.y + x * s + y * c));
  }
  return out;
}

/** A stroke along a polyline as a closed polygon; width(t) is the half-width. */
export function strokePolygon(points, width) {
  const left = [];
  const right = [];
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    const dir = unit(sub(next, prev));
    const nrm = P(-dir.y, dir.x);
    const w = typeof width === "function" ? width(n === 1 ? 0 : i / (n - 1)) : width;
    left.push(add(points[i], mul(nrm, w)));
    right.push(sub(points[i], mul(nrm, w)));
  }
  return left.concat(right.reverse());
}

/**
 * The face frame: eye midpoint, the unit vector from the image-left eye to the
 * image-right eye (x), the perpendicular pointing down the face (y), and the
 * distance between eye centers (iod), which sets every size.
 */
export function faceFrame(pts) {
  const center = (ids) => ids.reduce((acc, id) => add(acc, mul(pts[id], 1 / ids.length)), P(0, 0));
  const eyeA = center([...MESH.eyeUpper.a, ...MESH.eyeLower.a]);
  const eyeB = center([...MESH.eyeUpper.b, ...MESH.eyeLower.b]);
  const x = unit(sub(eyeB, eyeA));
  const y = P(-x.y, x.x);
  return { origin: lerp(eyeA, eyeB, 0.5), eyeA, eyeB, x, y, iod: len(sub(eyeB, eyeA)) };
}

/** Map face-frame units (multiples of iod) to pixels. */
function frameAt(frame, u, v) {
  return add(frame.origin, add(mul(frame.x, u * frame.iod), mul(frame.y, v * frame.iod)));
}

/* ------------------------------------------------------------------- masks */

/** A float mask over a pixel box: { x, y, w, h, data }. */
export function createMask(x, y, w, h) {
  return { x, y, w, h, data: new Float32Array(Math.max(0, w * h)) };
}

/** Bounding box of point lists, padded, clipped to the image. */
export function boxFor(polys, pad, width, height) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const poly of polys) for (const p of poly) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  const bx0 = Math.max(0, Math.floor(x0 - pad));
  const by0 = Math.max(0, Math.floor(y0 - pad));
  const bx1 = Math.min(width, Math.ceil(x1 + pad));
  const by1 = Math.min(height, Math.ceil(y1 + pad));
  return { x: bx0, y: by0, w: Math.max(0, bx1 - bx0), h: Math.max(0, by1 - by0) };
}

/**
 * Add a polygon's coverage (0..1 per pixel, anti-aliased with 4 sub-rows and
 * exact horizontal edges) to the mask, times `value`. Even-odd fill.
 */
export function fillPolygon(mask, poly, value = 1) {
  if (!poly || poly.length < 3 || !mask.w || !mask.h) return mask;
  const SUB = 4;
  const n = poly.length;
  const xs = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const rowStart = Math.max(mask.y, Math.floor(minY));
  const rowEnd = Math.min(mask.y + mask.h - 1, Math.ceil(maxY));
  const share = value / SUB;
  for (let row = rowStart; row <= rowEnd; row += 1) {
    const base = (row - mask.y) * mask.w;
    for (let s = 0; s < SUB; s += 1) {
      const sy = row + (s + 0.5) / SUB;
      xs.length = 0;
      for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
        const a = poly[i];
        const b = poly[j];
        if ((a.y > sy) !== (b.y > sy)) xs.push(a.x + ((sy - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(xs[k], mask.x);
        const xb = Math.min(xs[k + 1], mask.x + mask.w);
        if (xb <= xa) continue;
        const ia = Math.floor(xa);
        const ib = Math.floor(xb);
        if (ia === ib) {
          mask.data[base + ia - mask.x] += share * (xb - xa);
          continue;
        }
        mask.data[base + ia - mask.x] += share * (ia + 1 - xa);
        for (let c = ia + 1; c < ib; c += 1) mask.data[base + c - mask.x] += share;
        if (ib < mask.x + mask.w) mask.data[base + ib - mask.x] += share * (xb - ib);
      }
    }
  }
  return mask;
}

/** Clamp a mask to 0..1 in place. */
export function clampMask(mask) {
  const d = mask.data;
  for (let i = 0; i < d.length; i += 1) d[i] = d[i] < 0 ? 0 : d[i] > 1 ? 1 : d[i];
  return mask;
}

function boxPass(src, dst, w, h, r, horizontal) {
  const inv = 1 / (2 * r + 1);
  if (horizontal) {
    for (let y = 0; y < h; y += 1) {
      const o = y * w;
      let acc = 0;
      for (let x = -r; x <= r; x += 1) acc += src[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x += 1) {
        dst[o + x] = acc * inv;
        acc += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
      }
    }
  } else {
    for (let x = 0; x < w; x += 1) {
      let acc = 0;
      for (let y = -r; y <= r; y += 1) acc += src[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y += 1) {
        dst[y * w + x] = acc * inv;
        acc += src[Math.min(h - 1, y + r + 1) * w + x] - src[Math.max(0, y - r) * w + x];
      }
    }
  }
}

/** Near-Gaussian blur (three box passes each way) of a float array, in place. */
export function blurArray(data, w, h, radius) {
  const r = Math.round(radius / 1.7);
  if (r < 1 || !w || !h) return data;
  const tmp = new Float32Array(data.length);
  for (let pass = 0; pass < 3; pass += 1) {
    boxPass(data, tmp, w, h, r, true);
    boxPass(tmp, data, w, h, r, false);
  }
  return data;
}

export function blurMask(mask, radius) {
  blurArray(mask.data, mask.w, mask.h, radius);
  return mask;
}

/** Value of a mask at an image pixel (0 outside it). */
export function maskAt(mask, x, y) {
  const mx = x - mask.x;
  const my = y - mask.y;
  if (mx < 0 || my < 0 || mx >= mask.w || my >= mask.h) return 0;
  return mask.data[my * mask.w + mx];
}

/** Coverage of polygons on a box, blurred by `feather` pixels. */
function polyMask(box, polys, feather = 0) {
  const mask = createMask(box.x, box.y, box.w, box.h);
  for (const poly of polys) fillPolygon(mask, poly);
  clampMask(mask);
  if (feather > 0.6) blurMask(mask, feather);
  return mask;
}

/* ------------------------------------------------------------------ colors */

export function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "");
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
}

export const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Pigment blend for one pixel. The result takes its hue from the shade and its
 * lightness from the skin: `cover` (0..1) is how much of the shade's own
 * lightness shows (sheer blush ~0.15, a matte lipstick ~0.85); `tex` (0..1) is how
 * much of the pixel's light and shade (pores, lip lines) is kept around the
 * region's mean lightness `ref`. `a` is the opacity.
 */
export function pigmentPixel(d, i, rgb, shadeL, a, cover, tex, ref) {
  if (a <= 0.001) return;
  const r = d[i];
  const g = d[i + 1];
  const b = d[i + 2];
  const l = luma(r, g, b);
  const rel = ref > 1 ? 1 + tex * (l / ref - 1) : 1;
  const target = (1 - cover) * l + cover * shadeL * rel;
  const k = target / Math.max(shadeL, 1);
  let tr = rgb[0] * k;
  let tg = rgb[1] * k;
  let tb = rgb[2] * k;
  const top = Math.max(tr, tg, tb);
  if (top > 255) {
    // Keep the hue when a light shade overflows: pull toward white instead of clipping.
    const over = (top - 255) / top;
    tr = tr * (1 - over) + 255 * over * 0.6;
    tg = tg * (1 - over) + 255 * over * 0.6;
    tb = tb * (1 - over) + 255 * over * 0.6;
  }
  d[i] = r + (Math.min(255, tr) - r) * a;
  d[i + 1] = g + (Math.min(255, tg) - g) * a;
  d[i + 2] = b + (Math.min(255, tb) - b) * a;
}

/** Multiply toward a tint (each channel 0..1), for bronzer, contour, and lash darkening. */
export function multiplyPixel(d, i, tint, a) {
  if (a <= 0.001) return;
  d[i] *= 1 - a * (1 - tint[0]);
  d[i + 1] *= 1 - a * (1 - tint[1]);
  d[i + 2] *= 1 - a * (1 - tint[2]);
}

/** Screen toward a light shade, for highlighter. */
export function screenPixel(d, i, rgb, a) {
  if (a <= 0.001) return;
  d[i] = 255 - ((255 - d[i]) * (255 - rgb[0] * a)) / 255;
  d[i + 1] = 255 - ((255 - d[i + 1]) * (255 - rgb[1] * a)) / 255;
  d[i + 2] = 255 - ((255 - d[i + 2]) * (255 - rgb[2] * a)) / 255;
}

/** Mean lightness of the pixels under a mask (weighted), or of a percentile band. */
export function maskStats(img, mask) {
  const d = img.data;
  let sum = 0;
  let weight = 0;
  const hist = new Float64Array(256);
  for (let y = 0; y < mask.h; y += 1) {
    const iy = y + mask.y;
    for (let x = 0; x < mask.w; x += 1) {
      const m = mask.data[y * mask.w + x];
      if (m < 0.5) continue;
      const o = (iy * img.width + x + mask.x) * 4;
      const l = luma(d[o], d[o + 1], d[o + 2]);
      sum += l * m;
      weight += m;
      hist[Math.round(l)] += m;
    }
  }
  const pick = (share) => {
    let seen = 0;
    for (let v = 0; v < 256; v += 1) {
      seen += hist[v];
      if (seen >= share * weight) return v;
    }
    return 255;
  };
  return weight ? { mean: sum / weight, p10: pick(0.1), p90: pick(0.9), weight } : { mean: 128, p10: 64, p90: 192, weight: 0 };
}

/** Average color under a mask, of pixels with lightness in [lo, hi]. */
function meanColor(img, mask, lo = 0, hi = 255) {
  const d = img.data;
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (let y = 0; y < mask.h; y += 1) {
    for (let x = 0; x < mask.w; x += 1) {
      const m = mask.data[y * mask.w + x];
      if (m < 0.5) continue;
      const o = ((y + mask.y) * img.width + x + mask.x) * 4;
      const l = luma(d[o], d[o + 1], d[o + 2]);
      if (l < lo || l > hi) continue;
      r += d[o] * m;
      g += d[o + 1] * m;
      b += d[o + 2] * m;
      w += m;
    }
  }
  return w ? [r / w, g / w, b / w] : null;
}

/* ----------------------------------------------------------------- regions */

/**
 * All the shapes the layers need, from the landmarks. Sizes scale with the
 * distance between the eyes, and everything turns with the head.
 */
export function faceRegions(pts) {
  const frame = faceFrame(pts);
  const iod = frame.iod;
  const pick = (ids) => ids.map((id) => pts[id]);
  const up = mul(frame.y, -1);
  const sides = {};
  for (const side of ["a", "b"]) {
    const outward = side === "a" ? mul(frame.x, -1) : frame.x;
    const upper = pick(MESH.eyeUpper[side]);
    const lower = pick(MESH.eyeLower[side]);
    const browUp = pick(MESH.browUpper[side]);
    const browLow = pick(MESH.browLower[side]);
    const upperCurve = spline(upper, { closed: false, steps: 4 });
    const eye = spline([...upper, ...lower.slice(1, -1)], { closed: true, steps: 4 });
    const brow = spline([...browUp, ...browLow.slice().reverse()], { closed: true, steps: 4 });
    const eyeW = len(sub(upper[upper.length - 1], upper[0]));
    sides[side] = { outward, upper, lower, upperCurve, browUp, browLow, eye, brow, eyeW };
  }
  return {
    frame,
    iod,
    up,
    sides,
    faceOval: spline(pick(MESH.faceOval), { closed: true, steps: 4 }),
    lipsOuter: spline(pick(MESH.lipsOuter), { closed: true, steps: 8 }),
    lipsInner: spline(pick(MESH.lipsInner), { closed: true, steps: 8 }),
    pts,
    at: (u, v) => frameAt(frame, u, v),
  };
}

/** Lid or crease band between the upper lid (f=0) and the brow's lower edge (f=1). */
function lidBand(side, f0, f1, t0 = 0, t1 = 1, flare = 0.12) {
  const N = 14;
  const lo = [];
  const hi = [];
  for (let k = 0; k <= N; k += 1) {
    const t = t0 + ((t1 - t0) * k) / N;
    const lid = along(side.upperCurve, t);
    const brow = along(side.browLow, 0.08 + 0.84 * t);
    const gap = sub(brow, lid);
    // Taller toward the outer end, where shadow is usually blended up and out.
    const shape = 0.72 + 0.28 * t;
    lo.push(add(lid, mul(gap, f0 * shape)));
    hi.push(add(lid, mul(gap, f1 * shape)));
  }
  const tip = add(add(along(side.upperCurve, t1), mul(side.outward, side.eyeW * flare)), mul(sub(along(side.browLow, 0.92), along(side.upperCurve, t1)), (f0 + f1) * 0.3));
  return [...lo, tip, ...hi.reverse()];
}

/* ----------------------------------------------------------------- painter */

const BLEND_ORDER = MAKEUP_LAYERS.map((item) => item.id);

function shadeRgb(layerId, id) {
  const shade = shadeById(layerId, id);
  return shade ? hexToRgb(shade.hex) : [128, 128, 128];
}

/** Small seeded random numbers, so freckles land in the same place every time. */
export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/**
 * Paint a resolved look (see resolveLook) onto RGBA pixels in place.
 * img: { width, height, data } (ImageData or the same shape).
 * landmarks: Face Mesh points, 0..1 of this image.
 * options.hair: optional hair confidence { width, height, data } (0..1); makeup
 *   is kept off hair, such as bangs over the brows.
 * Returns { painted: [layer ids], skinL } or null when the landmarks are unusable.
 */
export function paintMakeup(img, landmarks, look, options = {}) {
  const pts = toPixels(landmarks, img.width, img.height);
  if (!pts || !look) return null;
  const R = faceRegions(pts);
  const { iod } = R;
  if (!(iod > 8)) return null;
  const W = img.width;
  const H = img.height;
  const d = img.data;
  const hair = options.hair && options.hair.data ? options.hair : null;
  const hairAt = (x, y) => {
    if (!hair) return 0;
    const hx = Math.min(hair.width - 1, Math.floor((x / W) * hair.width));
    const hy = Math.min(hair.height - 1, Math.floor((y / H) * hair.height));
    return hair.data[hy * hair.width + hx] || 0;
  };

  // Face skin: the oval, softened inward, minus the eyes, brows, and mouth.
  const faceBox = boxFor([R.faceOval], iod * 0.1, W, H);
  const faceMask = polyMask(faceBox, [R.faceOval], 0);
  // Pull the edge in a little so color never reaches the hairline, ears, or neck.
  const edge = createMask(faceBox.x, faceBox.y, faceBox.w, faceBox.h);
  edge.data.set(faceMask.data);
  blurMask(edge, iod * 0.12);
  for (let i = 0; i < faceMask.data.length; i += 1) faceMask.data[i] = Math.min(faceMask.data[i], smooth(0.5, 0.95, edge.data[i]));
  const featureMask = polyMask(faceBox, [R.sides.a.eye, R.sides.b.eye, R.lipsOuter], iod * 0.035);
  const eyeGuard = polyMask(faceBox, [R.sides.a.eye, R.sides.b.eye], iod * 0.02);
  for (let i = 0; i < eyeGuard.data.length; i += 1) eyeGuard.data[i] = Math.min(1, eyeGuard.data[i] * 1.6);
  const browMask = polyMask(faceBox, [R.sides.a.brow, R.sides.b.brow], iod * 0.03);
  const skinWeight = (mx, my) => {
    const k = my * faceBox.w + mx;
    return faceMask.data[k] * (1 - Math.min(1, featureMask.data[k] * 1.4));
  };

  // Skin reference: the cheeks under the eyes.
  const cheekBox = boxFor([[pts[MESH.cheek.a], pts[MESH.cheekHigh.a]], [pts[MESH.cheek.b], pts[MESH.cheekHigh.b]]], iod * 0.05, W, H);
  const cheekMask = polyMask(cheekBox, [ellipse(lerp(pts[MESH.cheek.a], pts[MESH.cheekHigh.a], 0.5), iod * 0.14, iod * 0.1), ellipse(lerp(pts[MESH.cheek.b], pts[MESH.cheekHigh.b], 0.5), iod * 0.14, iod * 0.1)], 0);
  const skin = maskStats(img, cheekMask);
  const skinL = skin.mean;
  const skinRgb = meanColor(img, cheekMask, skin.p10, skin.p90) || [180, 140, 120];
  // Deeper skin needs more pigment for the same visible color; very fair skin less.
  const depthBoost = 1 + 0.45 * clamp01((150 - skinL) / 110);

  const painted = [];
  /** Run fn(o, a, x, y) over the box for each pixel with weight above zero. */
  const each = (mask, amount, fn, { skinOnly = false, avoidBrows = false, avoidEyes = true } = {}) => {
    for (let my = 0; my < mask.h; my += 1) {
      const y = my + mask.y;
      for (let mx = 0; mx < mask.w; mx += 1) {
        let a = mask.data[my * mask.w + mx];
        if (a <= 0.002) continue;
        const x = mx + mask.x;
        const fx = x - faceBox.x;
        const fy = y - faceBox.y;
        const inFace = fx >= 0 && fy >= 0 && fx < faceBox.w && fy < faceBox.h;
        if (skinOnly) a *= inFace ? skinWeight(fx, fy) : 0;
        if (avoidEyes && inFace) a *= 1 - eyeGuard.data[fy * faceBox.w + fx];
        if (avoidBrows && inFace) a *= 1 - browMask.data[fy * faceBox.w + fx];
        if (hair) a *= 1 - hairAt(x, y);
        a *= amount;
        if (a <= 0.002) continue;
        fn((y * W + x) * 4, a, x, y);
      }
    }
  };

  for (const id of BLEND_ORDER) {
    const layer = look[id];
    if (!layer || !(layer.amount > 0)) continue;
    const amount = layer.amount;
    if (id === "skin") {
      paintSkin(img, faceBox, skinWeight, amount, iod, hairAt, hair);
    } else if (id === "bronzer") {
      const contour = layer.style === "contour";
      const polys = [];
      for (const side of ["a", "b"]) {
        const ear = pts[MESH.ear[side]];
        const mid = pts[MESH.midCheek[side]];
        if (contour) {
          polys.push(strokePolygon([lerp(ear, mid, 0.02), lerp(ear, mid, 0.38), lerp(ear, mid, 0.66)], (t) => iod * (0.1 - 0.04 * t)));
          polys.push(ellipse(lerp(pts[MESH.temple[side]], pts[MESH.templeLow[side]], 0.5), iod * 0.2, iod * 0.3, 0));
          polys.push(ellipse(lerp(pts[MESH.jaw[side]], pts[MESH.jawLow[side]], 0.5), iod * 0.26, iod * 0.12, Math.atan2(sub(pts[MESH.jawLow[side]], pts[MESH.jaw[side]]).y, sub(pts[MESH.jawLow[side]], pts[MESH.jaw[side]]).x)));
        } else {
          const center = lerp(pts[MESH.side[side]], pts[MESH.cheek[side]], 0.32);
          const tilt = Math.atan2(sub(pts[MESH.cheekHigh[side]], ear).y, sub(pts[MESH.cheekHigh[side]], ear).x);
          polys.push(ellipse(center, iod * 0.36, iod * 0.2, tilt));
          polys.push(ellipse(lerp(pts[MESH.temple[side]], pts[MESH.templeLow[side]], 0.45), iod * 0.22, iod * 0.32, 0));
        }
      }
      if (!contour) polys.push(strokePolygon(MESH.noseBridge.map((k) => pts[k]), iod * 0.05));
      const mask = polyMask(boxFor(polys, iod * 0.3, W, H), polys, iod * (contour ? 0.16 : 0.24));
      let base = shadeRgb("bronzer", layer.shade);
      if (shadeById("bronzer", layer.shade)?.auto) {
        // Two or three shades deeper and warmer than the skin.
        base = [skinRgb[0] * 0.78 + 18, skinRgb[1] * 0.66 + 4, skinRgb[2] * 0.56];
        if (contour) base = [skinRgb[0] * 0.72, skinRgb[1] * 0.64, skinRgb[2] * 0.6];
      }
      const ratio = base.map((c, k) => clamp01(c / Math.max(1, skinRgb[k])));
      const tint = contour ? ratio.map((c) => 0.35 + 0.65 * c) : ratio.map((c) => 0.25 + 0.75 * c);
      const strength = (contour ? 0.85 : 0.7) * amount;
      each(mask, strength, (o, a) => multiplyPixel(d, o, tint, Math.min(1, a)), { skinOnly: true, avoidBrows: true });
    } else if (id === "blush") {
      const polys = [];
      for (const side of ["a", "b"]) {
        const apple = pts[MESH.cheek[side]];
        const high = pts[MESH.cheekHigh[side]];
        const ear = pts[MESH.ear[side]];
        const o = R.sides[side].outward;
        let center;
        let rx;
        let ry;
        let angle;
        const outAngle = Math.atan2(sub(pts[MESH.templeLow[side]], apple).y, sub(pts[MESH.templeLow[side]], apple).x);
        if (layer.style === "lifted") {
          center = add(lerp(apple, high, 0.55), mul(o, iod * 0.08));
          rx = iod * 0.34;
          ry = iod * 0.17;
          angle = outAngle;
        } else if (layer.style === "cherub") {
          center = add(lerp(apple, high, 0.7), mul(o, iod * -0.02));
          rx = iod * 0.3;
          ry = iod * 0.22;
          angle = Math.atan2(R.frame.x.y, R.frame.x.x);
        } else {
          center = add(lerp(apple, high, 0.35), mul(o, iod * 0.03));
          rx = iod * 0.24;
          ry = iod * 0.19;
          angle = Math.atan2(sub(ear, apple).y, sub(ear, apple).x) * 0.3 + Math.atan2(R.frame.x.y, R.frame.x.x) * 0.7;
        }
        polys.push(ellipse(center, rx, ry, angle));
      }
      if (layer.style === "cherub") {
        // A wash across the bridge of the nose joins the cheeks.
        polys.push(ellipse(pts[MESH.noseBridge[2]], iod * 0.2, iod * 0.08, Math.atan2(R.frame.x.y, R.frame.x.x)));
      }
      const mask = polyMask(boxFor(polys, iod * 0.35, W, H), polys, iod * 0.2);
      const rgb = shadeRgb("blush", layer.shade);
      const shadeL = luma(...rgb);
      each(mask, 0.55 * amount * depthBoost, (o, a) => pigmentPixel(d, o, rgb, shadeL, Math.min(0.9, a), 0.12, 1, skinL), { skinOnly: true });
    } else if (id === "highlight") {
      const polys = [];
      for (const side of ["a", "b"]) {
        const line = [pts[MESH.cheekInner[side]], pts[MESH.cheekHigh[side]], pts[MESH.cheekOuter[side]]].map((p) => add(p, mul(R.up, iod * 0.03)));
        polys.push(strokePolygon(spline(line, { closed: false, steps: 4 }), (t) => iod * (0.05 + 0.035 * Math.sin(Math.PI * t))));
        const tail = R.sides[side].browLow[R.sides[side].browLow.length - 1];
        polys.push(ellipse(add(tail, mul(R.frame.y, iod * 0.08)), iod * 0.06, iod * 0.03, 0));
      }
      polys.push(strokePolygon(MESH.noseBridge.slice(1).map((k) => pts[k]), iod * 0.022));
      polys.push(ellipse(add(pts[MESH.lipTop], mul(R.up, iod * 0.05)), iod * 0.05, iod * 0.022, Math.atan2(R.frame.x.y, R.frame.x.x)));
      polys.push(ellipse(pts[MESH.noseTip], iod * 0.035, iod * 0.03, 0));
      const mask = polyMask(boxFor(polys, iod * 0.2, W, H), polys, iod * 0.07);
      const rgb = shadeRgb("highlight", layer.shade);
      each(mask, 0.5 * amount, (o, a) => {
        // Brighter where the skin already catches light, so the glow follows the face.
        const l = luma(d[o], d[o + 1], d[o + 2]);
        const catchLight = 0.45 + 0.75 * smooth(skinL * 0.75, skinL * 1.2, l);
        screenPixel(d, o, rgb, Math.min(0.85, a * catchLight));
      }, { skinOnly: true, avoidBrows: true });
    } else if (id === "freckles") {
      const rand = seeded(20260426);
      const polys = [];
      for (let k = 0; k < 90; k += 1) {
        const u = (rand() * 2 - 1) * 0.95;
        const v = 0.42 + rand() * 0.42 - Math.abs(u) * 0.08;
        // Thicker over the nose and the tops of the cheeks.
        if (rand() > 1 - Math.abs(u) * 0.5) continue;
        const r = iod * (0.006 + rand() * 0.01);
        polys.push(ellipse(R.at(u, v), r, r * (0.75 + rand() * 0.4), rand() * 3, 10));
      }
      const mask = createMask(...Object.values(boxFor(polys, iod * 0.05, W, H)));
      const strength = [];
      polys.forEach((poly) => {
        const s = 0.35 + rand() * 0.65;
        strength.push(s);
        fillPolygon(mask, poly, s);
      });
      clampMask(mask);
      blurMask(mask, iod * 0.006);
      const rgb = shadeRgb("freckles", layer.shade);
      const tint = rgb.map((c, k) => clamp01(c / Math.max(1, skinRgb[k])) * 0.6 + 0.4).map((c) => Math.min(1, c));
      each(mask, 0.85 * amount, (o, a) => multiplyPixel(d, o, tint, Math.min(1, a)), { skinOnly: true });
    } else if (id === "shadow") {
      const style = layer.style;
      const height = layer.height || 1;
      const lidPolys = [];
      const creasePolys = [];
      for (const side of ["a", "b"]) {
        const s = R.sides[side];
        if (style === "lid" || style === "both" || style === "smoky") {
          // Nested bands: densest at the lashes, fading up toward the crease.
          const top = (style === "smoky" ? 0.62 : 0.52) * height;
          lidPolys.push(lidBand(s, -0.05, top, 0, 1, style === "smoky" ? 0.22 : 0.12));
          lidPolys.push(lidBand(s, -0.05, top * 0.62, 0.04, 1, style === "smoky" ? 0.18 : 0.1));
          lidPolys.push(lidBand(s, -0.05, top * 0.32, 0.08, 0.98, 0.06));
        }
        if (style === "crease" || style === "both" || style === "smoky") creasePolys.push(lidBand(s, 0.3 * height, 0.58 * height, 0.32, 1, 0.2));
        if (style === "smoky") {
          // Smudged under the outer two-thirds of the lower lashes.
          const lower = spline(s.lower, { closed: false, steps: 4 });
          const part = [];
          for (let k = 0; k <= 10; k += 1) part.push(along(lower, (k / 10) * 0.7));
          lidPolys.push(strokePolygon(part.map((p) => add(p, mul(R.frame.y, iod * 0.018))), (t) => iod * (0.035 - 0.022 * t)));
        }
      }
      const both = [...lidPolys, ...creasePolys];
      const box = boxFor(both, iod * 0.25, W, H);
      const lidRgb = shadeRgb("shadow", layer.shade);
      const creaseRgb = shadeRgb("shadow", layer.crease || layer.shade);
      const eyeStats = maskStats(img, polyMask(box, lidPolys.length ? lidPolys : creasePolys, 0));
      const dark = (rgb) => luma(...rgb) < 90;
      if (creasePolys.length) {
        const mask = createMask(box.x, box.y, box.w, box.h);
        for (const poly of creasePolys) fillPolygon(mask, poly, 1);
        clampMask(mask);
        blurMask(mask, iod * 0.17);
        const rgb = creaseRgb;
        each(mask, 0.62 * amount, (o, a) => pigmentPixel(d, o, rgb, luma(...rgb), Math.min(0.85, a), 0.35, 0.9, eyeStats.mean), { avoidBrows: true });
      }
      if (lidPolys.length) {
        const mask = createMask(box.x, box.y, box.w, box.h);
        for (const poly of lidPolys) fillPolygon(mask, poly, 0.4);
        clampMask(mask);
        blurMask(mask, iod * (style === "smoky" ? 0.1 : 0.075));
        for (let i = 0; i < mask.data.length; i += 1) mask.data[i] = Math.min(1, mask.data[i] * 1.25);
        const rgb = lidRgb;
        const cover = dark(rgb) ? 0.7 : 0.5;
        each(mask, 0.72 * amount, (o, a) => pigmentPixel(d, o, rgb, luma(...rgb), Math.min(0.9, a), cover, 0.85, eyeStats.mean), { avoidBrows: true });
      }
    } else if (id === "liner") {
      const polys = [];
      const graphic = layer.style === "graphic";
      const winged = graphic || layer.style === "winged";
      for (const side of ["a", "b"]) {
        const s = R.sides[side];
        const lash = [];
        for (let k = 0; k <= 16; k += 1) lash.push(along(s.upperCurve, 0.08 + (k / 16) * 0.92));
        const thick = (t) => iod * ((graphic ? 0.016 : 0.01) + t * t * (graphic ? 0.05 : winged ? 0.03 : 0.016));
        // Lower edge sits on the lash line (nudged up a hair so it never covers the eye).
        const lower = lash.map((p) => add(p, mul(R.up, iod * 0.004)));
        const upper = lash.map((p, k) => add(p, mul(R.up, iod * 0.004 + thick(k / 16))));
        const outer = s.upper[s.upper.length - 1];
        const poly = [...lower];
        if (winged) {
          const dir = unit(add(mul(s.outward, 1), mul(R.up, graphic ? 0.62 : 0.5)));
          const tip = add(outer, mul(dir, s.eyeW * (graphic ? 0.42 : 0.28)));
          poly.push(tip);
        }
        poly.push(...upper.reverse());
        polys.push(poly);
      }
      const mask = polyMask(boxFor(polys, iod * 0.06, W, H), polys, iod * 0.007);
      const rgb = shadeRgb("liner", layer.shade);
      each(mask, Math.min(1, 1.05 * amount), (o, a) => pigmentPixel(d, o, rgb, luma(...rgb), Math.min(0.97, a), 0.95, 0.3, skinL * 0.6), { avoidEyes: false });
    } else if (id === "lashes") {
      const polys = [];
      for (const side of ["a", "b"]) {
        const s = R.sides[side];
        const lash = [];
        for (let k = 0; k <= 16; k += 1) lash.push(along(s.upperCurve, 0.12 + (k / 16) * 0.88));
        polys.push(strokePolygon(lash.map((p) => add(p, mul(R.up, iod * 0.012))), (t) => iod * (0.01 + 0.016 * t)));
        const lower = spline(s.lower, { closed: false, steps: 4 });
        const part = [];
        for (let k = 0; k <= 8; k += 1) part.push(along(lower, (k / 8) * 0.55));
        polys.push(strokePolygon(part.map((p) => add(p, mul(R.frame.y, iod * 0.006))), (t) => iod * (0.008 - 0.005 * t)));
      }
      const mask = polyMask(boxFor(polys, iod * 0.05, W, H), polys, iod * 0.01);
      const rgb = shadeRgb("lashes", layer.shade);
      each(mask, 0.8 * amount, (o, a) => {
        // Darken what is already darker (the lashes) more than the skin between them.
        const l = luma(d[o], d[o + 1], d[o + 2]);
        const hairy = 0.4 + 0.6 * smooth(skinL * 0.95, skinL * 0.45, l);
        pigmentPixel(d, o, rgb, luma(...rgb), Math.min(0.92, a * hairy), 0.75, 0.6, skinL * 0.5);
      }, { avoidEyes: false });
    } else if (id === "brows") {
      const polys = [R.sides.a.brow, R.sides.b.brow];
      const box = boxFor(polys, iod * 0.08, W, H);
      const hard = polyMask(box, polys, 0);
      const stats = maskStats(img, hard);
      let rgb = shadeRgb("brows", layer.shade);
      if (shadeById("brows", layer.shade)?.auto) {
        rgb = (meanColor(img, hard, 0, stats.p10 + (stats.mean - stats.p10) * 0.4) || rgb).map((c) => c * 0.82);
      }
      const shadeL = luma(...rgb);
      const mask = polyMask(box, polys, iod * 0.03);
      const browSkin = stats.p90;
      each(mask, 0.75 * amount, (o, a) => {
        const l = luma(d[o], d[o + 1], d[o + 2]);
        // Hairs get the tint; the skin between them gets a softer fill.
        const hairy = 0.4 + 0.6 * smooth(browSkin * 0.95, browSkin * 0.55, l);
        pigmentPixel(d, o, rgb, shadeL, Math.min(0.85, a * hairy), 0.55, 0.65, stats.mean);
      }, { avoidEyes: true });
    } else if (id === "lips") {
      paintLips(img, R, layer, { hairAt, skinL });
    }
    painted.push(id);
  }
  return { painted, skinL };
}

/** Lipstick, kept inside the outer lip line and outside the mouth opening. */
export function lipMask(img, R) {
  const iod = R.iod;
  const box = boxFor([R.lipsOuter], iod * 0.06, img.width, img.height);
  const outer = polyMask(box, [R.lipsOuter], 0);
  const soft = createMask(box.x, box.y, box.w, box.h);
  soft.data.set(outer.data);
  blurMask(soft, iod * 0.022);
  const inner = polyMask(box, [R.lipsInner], 0);
  // Grow the mouth opening by a pixel or two so no color touches the teeth.
  const innerSoft = createMask(box.x, box.y, box.w, box.h);
  innerSoft.data.set(inner.data);
  blurMask(innerSoft, iod * 0.02);
  const mask = createMask(box.x, box.y, box.w, box.h);
  for (let i = 0; i < mask.data.length; i += 1) {
    // Never past the lip line: the hard edge caps the soft one.
    const edge = Math.min(outer.data[i], Math.min(1, soft.data[i] * 1.6));
    const open = Math.max(inner.data[i], Math.min(1, innerSoft.data[i] * 2.2));
    mask.data[i] = edge * (1 - open);
  }
  return mask;
}

function paintLips(img, R, layer, { hairAt, skinL }) {
  const d = img.data;
  const mask = lipMask(img, R);
  const stats = maskStats(img, mask);
  const ref = stats.mean;
  const finish = layer.style || "satin";
  const shade = shadeById("lips", layer.shade);
  let rgb = hexToRgb(shade?.hex || "#b06f68");
  if (shade?.auto) {
    // Tinted balm: the person's own lip color, a little deeper and rosier.
    const own = meanColor(img, mask, stats.p10, stats.p90) || rgb;
    rgb = [own[0] * 0.92 + 10, own[1] * 0.8, own[2] * 0.84];
  }
  const shadeL = luma(...rgb);
  let cover = shade?.auto ? 0.25 : finish === "matte" ? 0.82 : finish === "satin" ? 0.78 : 0.7;
  // A shade lighter than the lips can't lift them much in real life (that reads
  // as chalky on deeper lips), so its lightness mostly yields to the lip's own.
  if (shadeL > ref) cover *= 0.25 + 0.75 * Math.pow(ref / shadeL, 3);
  const tex = finish === "matte" ? 0.92 : finish === "satin" ? 0.95 : 0.95;
  const amount = Math.min(1, layer.amount * (shade?.auto ? 0.7 : 1));
  // Where the shine sits: the middle of the lower lip, and the top of the upper lip.
  const lowerMid = lerp(R.lipsInner[Math.round(R.lipsInner.length * 0.75)] || R.lipsOuter[0], R.lipsOuter[Math.round(R.lipsOuter.length * 0.75)] || R.lipsOuter[0], 0.45);
  const shineBox = boxFor([R.lipsOuter], 0, img.width, img.height);
  const shine = createMask(shineBox.x, shineBox.y, shineBox.w, shineBox.h);
  fillPolygon(shine, ellipse(lowerMid, R.iod * 0.13, R.iod * 0.035, Math.atan2(R.frame.x.y, R.frame.x.x)), 1);
  clampMask(shine);
  blurMask(shine, R.iod * 0.035);
  const W = img.width;
  // Shine follows the lip's broad light and shade, not single bright pixels (no glitter).
  const lumAt = (mx, my) => {
    const o = ((my + mask.y) * W + mx + mask.x) * 4;
    return luma(d[o], d[o + 1], d[o + 2]);
  };
  const lowL = new Float32Array(mask.w * mask.h);
  for (let my = 0; my < mask.h; my += 1) for (let mx = 0; mx < mask.w; mx += 1) lowL[my * mask.w + mx] = lumAt(mx, my);
  const wideL = Float32Array.from(lowL);
  blurArray(lowL, mask.w, mask.h, R.iod * 0.02);
  blurArray(wideL, mask.w, mask.h, R.iod * 0.09);
  // Teeth guard only matters when the mouth is open, and only near the opening.
  const open = len(sub(R.pts[MESH.innerTop], R.pts[MESH.innerBottom])) > R.iod * 0.03;
  const near = createMask(mask.x, mask.y, mask.w, mask.h);
  if (open) {
    fillPolygon(near, R.lipsInner, 1);
    clampMask(near);
    blurMask(near, R.iod * 0.05);
  }
  for (let my = 0; my < mask.h; my += 1) {
    const y = my + mask.y;
    for (let mx = 0; mx < mask.w; mx += 1) {
      let a = mask.data[my * mask.w + mx];
      if (a <= 0.002) continue;
      const x = mx + mask.x;
      const o = (y * W + x) * 4;
      const broad = lowL[my * mask.w + mx];
      const wide = wideL[my * mask.w + mx];
      a *= amount * (1 - hairAt(x, y));
      const l0 = luma(d[o], d[o + 1], d[o + 2]);
      // Teeth guard: very light, low-color pixels inside the lips are left alone.
      const r0 = d[o];
      const g0 = d[o + 1];
      const b0 = d[o + 2];
      const chroma = Math.max(r0, g0, b0) - Math.min(r0, g0, b0);
      if (open && near.data[my * mask.w + mx] > 0.04 && l0 > Math.max(ref * 1.3, skinL) && chroma < 45) a *= 0.1;
      if (finish === "matte" && l0 > ref * 1.12) {
        // Flatten lip shine for a matte finish.
        const k = (ref * 1.12 + (l0 - ref * 1.12) * 0.35) / l0;
        d[o] *= 1 - a * (1 - k);
        d[o + 1] *= 1 - a * (1 - k);
        d[o + 2] *= 1 - a * (1 - k);
      }
      // Keep fine lip lines fully but even out two-tone lips (a lighter lower lip
      // is common on deeper skin): the reference follows the broad lightness 45%,
      // so the lips keep about half their natural light-to-shadow modeling.
      const localRef = Math.pow(Math.max(broad, 1), 0.45) * Math.pow(Math.max(ref, 1), 0.55);
      pigmentPixel(d, o, rgb, shadeL, Math.min(0.9, a), cover, tex, localRef);
      if (finish !== "matte") {
        const rel = broad / Math.max(wide, 1);
        const fine = 0.75 + 0.25 * smooth(0.9, 1.2, l0 / Math.max(broad, 1));
        const spec = ((finish === "gloss" ? 0.55 : 0.18) * smooth(1.03, 1.2, rel) + (finish === "gloss" ? 0.2 : 0.05) * maskAt(shine, x, y) * smooth(0.75, 1.1, rel)) * fine;
        const s = Math.min(0.8, spec * a);
        d[o] += (255 - d[o]) * s;
        d[o + 1] += (255 - d[o + 1]) * s;
        d[o + 2] += (255 - d[o + 2]) * s;
      }
    }
  }
}

/** Matte skin: take down shine against the local average, and even out blotchy color. */
function paintSkin(img, box, skinWeight, amount, iod, hairAt, hair) {
  const d = img.data;
  const W = img.width;
  const n = box.w * box.h;
  if (!n) return;
  const lum = new Float32Array(n);
  const cr = new Float32Array(n);
  const cg = new Float32Array(n);
  const cb = new Float32Array(n);
  for (let my = 0; my < box.h; my += 1) {
    for (let mx = 0; mx < box.w; mx += 1) {
      const o = ((my + box.y) * W + mx + box.x) * 4;
      const k = my * box.w + mx;
      const l = luma(d[o], d[o + 1], d[o + 2]);
      lum[k] = l;
      cr[k] = d[o] - l;
      cg[k] = d[o + 1] - l;
      cb[k] = d[o + 2] - l;
    }
  }
  const localL = Float32Array.from(lum);
  blurArray(localL, box.w, box.h, iod * 0.09);
  for (const arr of [cr, cg, cb]) blurArray(arr, box.w, box.h, iod * 0.12);
  for (let my = 0; my < box.h; my += 1) {
    for (let mx = 0; mx < box.w; mx += 1) {
      const k = my * box.w + mx;
      let a = skinWeight(mx, my) * amount;
      if (a <= 0.002) continue;
      const x = mx + box.x;
      const y = my + box.y;
      if (hair) a *= 1 - hairAt(x, y);
      const o = (y * W + x) * 4;
      const l = lum[k];
      const base = localL[k];
      let target = l;
      if (l > base * 1.03) target = base * 1.03 + (l - base * 1.03) * (1 - 0.8 * a);
      const kL = l > 1 ? target / l : 1;
      const even = 0.4 * a;
      const ch = [d[o] - l, d[o + 1] - l, d[o + 2] - l];
      const nl = l * kL;
      d[o] = Math.max(0, Math.min(255, nl + ch[0] * kL + (cr[k] - ch[0]) * even));
      d[o + 1] = Math.max(0, Math.min(255, nl + ch[1] * kL + (cg[k] - ch[1]) * even));
      d[o + 2] = Math.max(0, Math.min(255, nl + ch[2] * kL + (cb[k] - ch[2]) * even));
    }
  }
}
