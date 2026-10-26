# MediaPipe Tasks Vision (vendored)

Used by the Hair screen to find the face in a photo and the hair in a model portrait (for recoloring), on the device. Nothing is uploaded.

| File | Source | License |
|---|---|---|
| `vision_bundle.mjs` | npm `@mediapipe/tasks-vision` 1.1.1 | Apache-2.0 |
| `wasm/vision_wasm_internal.js`, `wasm/vision_wasm_internal.wasm` | npm `@mediapipe/tasks-vision` 1.1.1 | Apache-2.0 |
| `face_landmarker.task` | `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` | Apache-2.0 (MediaPipe model card) |
| `hair_segmenter.tflite` | `https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/latest/hair_segmenter.tflite` (downloaded 2026-10-26) | Apache-2.0 (MediaPipe model card) |

Copyright 2023 The MediaPipe Authors. Licensed under the Apache License, Version 2.0 (see `LICENSE`).
Redistribution, including in this repository and on GitHub Pages, is allowed under that license as long as this notice and the license text stay with the files. The files are unmodified except two changes to `vision_bundle.mjs`: the source-map comment was removed, and its built-in usage logging (a POST to `odml.pa.googleapis.com/v1/log`) was turned off so nothing leaves the phone (`flush()` now drops its queue and the 60-second timer is gone).
