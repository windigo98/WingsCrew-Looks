/**
 * On-device face finding and hair masks for the Hair screen. Loads the vendored
 * MediaPipe FaceLandmarker and hair ImageSegmenter on first use. Nothing leaves
 * the phone.
 */
import { facePointsFromLandmarks, headPose } from "./hair.js?v=19";

const BASE = new URL("../assets/vendor/mediapipe/", import.meta.url).href;
const FILESET = {
  wasmLoaderPath: `${BASE}wasm/vision_wasm_internal.js`,
  wasmBinaryPath: `${BASE}wasm/vision_wasm_internal.wasm`,
};
let landmarkerPromise = null;
let segmenterPromise = null;
const masks = new Map();
const results = new Map();

export function loadFaceLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await import(`${BASE}vision_bundle.mjs`);
      return vision.FaceLandmarker.createFromOptions(FILESET, {
        baseOptions: { modelAssetPath: `${BASE}face_landmarker.task`, delegate: "CPU" },
        runningMode: "IMAGE",
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
      });
    })().catch((error) => {
      landmarkerPromise = null;
      throw error;
    });
  }
  return landmarkerPromise;
}

/**
 * Find the face in a loaded image. Returns { points, imageW, imageH, pose } or
 * null when there is no face. `pose` is the head's yaw and roll in degrees, from
 * the landmarker's facial transformation matrix (see headPose). `key` caches the answer per photo revision.
 */
export async function detectFace(image, key) {
  if (key && results.has(key)) return results.get(key);
  const landmarker = await loadFaceLandmarker();
  const result = landmarker.detect(image);
  const points = facePointsFromLandmarks(result?.faceLandmarks?.[0]);
  const imageW = image.naturalWidth || image.width;
  const imageH = image.naturalHeight || image.height;
  const matrix = result?.facialTransformationMatrixes?.[0]?.data;
  const pose = points ? headPose(result.faceLandmarks[0], { imageW, imageH, matrix: matrix ? Array.from(matrix) : null }) : null;
  const answer = points ? { points, imageW, imageH, landmarks: result.faceLandmarks[0], pose } : null;
  if (key) results.set(key, answer);
  return answer;
}

export function loadHairSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const vision = await import(`${BASE}vision_bundle.mjs`);
      return vision.ImageSegmenter.createFromOptions(FILESET, {
        baseOptions: { modelAssetPath: `${BASE}hair_segmenter.tflite`, delegate: "CPU" },
        runningMode: "IMAGE",
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    })().catch((error) => {
      segmenterPromise = null;
      throw error;
    });
  }
  return segmenterPromise;
}

/**
 * Hair confidence (0..1) for every pixel of a loaded image, as
 * { width, height, data: Float32Array }. Cached per `key`.
 */
export async function hairMask(image, key) {
  if (key && masks.has(key)) return masks.get(key);
  const segmenter = await loadHairSegmenter();
  let answer = null;
  const read = (result) => {
    const list = result?.confidenceMasks || [];
    const mask = list[list.length - 1];
    if (mask) answer = { width: mask.width, height: mask.height, data: new Float32Array(mask.getAsFloat32Array()) };
    list.forEach((item) => item.close?.());
  };
  const result = segmenter.segment(image, read);
  if (!answer && result) read(result);
  if (!answer) throw new Error("Could not find the hair.");
  if (key) {
    if (masks.size > 12) masks.delete(masks.keys().next().value);
    masks.set(key, answer);
  }
  return answer;
}
