/**
 * On-device face finding for the Hair screen. Loads the vendored MediaPipe
 * FaceLandmarker on first use. Nothing leaves the phone.
 */
import { facePointsFromLandmarks } from "./hair.js?v=3";

const BASE = new URL("../assets/vendor/mediapipe/", import.meta.url).href;
let landmarkerPromise = null;
const results = new Map();

export function loadFaceLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await import(`${BASE}vision_bundle.mjs`);
      const fileset = {
        wasmLoaderPath: `${BASE}wasm/vision_wasm_internal.js`,
        wasmBinaryPath: `${BASE}wasm/vision_wasm_internal.wasm`,
      };
      return vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${BASE}face_landmarker.task`, delegate: "CPU" },
        runningMode: "IMAGE",
        numFaces: 1,
      });
    })().catch((error) => {
      landmarkerPromise = null;
      throw error;
    });
  }
  return landmarkerPromise;
}

/**
 * Find the face in a loaded image. Returns { points, imageW, imageH } or null when
 * there is no face. `key` caches the answer per photo revision.
 */
export async function detectFace(image, key) {
  if (key && results.has(key)) return results.get(key);
  const landmarker = await loadFaceLandmarker();
  const result = landmarker.detect(image);
  const points = facePointsFromLandmarks(result?.faceLandmarks?.[0]);
  const imageW = image.naturalWidth || image.width;
  const imageH = image.naturalHeight || image.height;
  const answer = points ? { points, imageW, imageH, landmarks: result.faceLandmarks[0] } : null;
  if (key) results.set(key, answer);
  return answer;
}
