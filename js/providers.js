/**
 * WingsCrew Looks provider seam.
 *
 * The screens call `providers.avatar`, `providers.tryOn`, `providers.makeup`,
 * `providers.background`, and `providers.circle`. Swap any of them for a hosted
 * model later without rewriting the pages. This prototype ships local
 * implementations only: no API keys, and photos never leave the device.
 *
 * Suggested later replacements (not wired up):
 * - avatar: a Gemini image edit that proposes extra poses from the front photo
 * - tryOn: FASHN Try-On or Google Virtual Try-On, person photo + garment photo
 * - makeup: Perfect Corp YouCam, or a guided Gemini edit
 * - background: @imgly/background-removal, or a server matte
 *
 * A hosted try-on should implement `render(scene) -> Promise<Blob>` and can
 * ignore `paint`. Keep the returned image badged "AI preview / WingsCrew Looks".
 */
import { downscaleImage } from "./images.js";
import { buildStamps, MAKEUP_PRESETS } from "./makeup.js";
import { hitTest, paint, paintToBlob } from "./paint.js";
import {
  acceptInvite,
  allowLookShare,
  allowMessage,
  allowVote,
  approveFriend,
  blockFriend,
  canViewShare,
  createInvite,
  createParentLink,
  parentSnapshot,
  removeFriend,
  reportFriend,
  shareLookWith,
  visiblePacks,
} from "./safety.js";

export const localAvatarProvider = {
  id: "local-photo",
  label: "On-device photo",
  /** Future: return several generated pose images. Now: one resized photo. */
  async createBases({ blob, label = "Photo" }) {
    const resized = await downscaleImage(blob, 1600, "image/jpeg", 0.86);
    return [{ blob: resized, label, providerId: this.id }];
  },
};

export const localTryOnProvider = {
  id: "local-composite",
  label: "On-device layering",
  mode: "layers",
  paint,
  hitTest,
  async render(scene) {
    return paintToBlob(scene);
  },
};

export const localMakeupProvider = {
  id: "local-preset-overlay",
  label: "Preset overlays",
  mode: "overlay",
  presets: MAKEUP_PRESETS,
  /**
   * Overlay mode returns stamps the painter draws.
   * A generate-mode provider should return `{ mode: "generate", blob }` instead.
   */
  async apply({ presetId, slot }) {
    return {
      mode: "overlay",
      presetId: MAKEUP_PRESETS.some((preset) => preset.id === presetId) ? presetId : "none",
      stamps: buildStamps(presetId, slot),
      providerId: this.id,
    };
  },
};

export const localBackgroundProvider = {
  id: "local-light-matte",
  label: "Light-background matte",
  /**
   * Lifts a plain light backdrop (typical product photo on white).
   * Skips images that already have transparency or a busy background.
   * White garments on white will be damaged — the screen warns about that.
   */
  async remove(blob, { strength = "gentle" } = {}) {
    const threshold = strength === "strong" ? 62 : 40;
    const decoded = await decodeToCanvas(blob);
    const ctx = decoded.ctx;
    const { width, height } = decoded;
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    if (hasTransparency(data)) {
      return { blob, removed: false, reason: "This image already has a transparent background." };
    }
    const background = cornerColor(data, width, height);
    if (!background.flat || background.luma < 175) {
      return {
        blob,
        removed: false,
        reason: "No plain light background found. A white or light wall works best.",
      };
    }
    const feather = 22;
    for (let i = 0; i < data.length; i += 4) {
      const distance = Math.hypot(
        data[i] - background.r,
        data[i + 1] - background.g,
        data[i + 2] - background.b,
      );
      let alpha = 255;
      if (distance <= threshold) alpha = 0;
      else if (distance < threshold + feather) alpha = Math.round(((distance - threshold) / feather) * 255);
      data[i + 3] = Math.min(data[i + 3], alpha);
    }
    ctx.putImageData(image, 0, 0);
    const next = await new Promise((resolve) => decoded.canvas.toBlob(resolve, "image/png"));
    if (!next) return { blob, removed: false, reason: "Could not update that image." };
    return { blob: next, removed: true, reason: "" };
  },
};

async function decodeToCanvas(blob) {
  const bitmap = await createImageBitmap(blob);
  const maxEdge = 1400;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return { canvas, ctx, width, height };
}

function hasTransparency(data) {
  let transparent = 0;
  const step = Math.max(4, Math.floor(data.length / 4000) * 4);
  let samples = 0;
  for (let i = 3; i < data.length; i += step) {
    samples += 1;
    if (data[i] < 250) transparent += 1;
  }
  return samples > 0 && transparent / samples > 0.04;
}

function cornerColor(data, width, height) {
  const points = [];
  const size = Math.max(4, Math.round(Math.min(width, height) * 0.03));
  const origins = [
    [0, 0],
    [width - size, 0],
    [0, height - size],
    [width - size, height - size],
  ];
  for (const [ox, oy] of origins) {
    for (let y = oy; y < oy + size; y += 2) {
      for (let x = ox; x < ox + size; x += 2) {
        const i = (y * width + x) * 4;
        points.push([data[i], data[i + 1], data[i + 2]]);
      }
    }
  }
  const average = [0, 0, 0];
  for (const point of points) {
    average[0] += point[0];
    average[1] += point[1];
    average[2] += point[2];
  }
  average[0] /= points.length;
  average[1] /= points.length;
  average[2] /= points.length;
  let variance = 0;
  for (const point of points) {
    variance += Math.hypot(point[0] - average[0], point[1] - average[1], point[2] - average[2]);
  }
  variance /= points.length;
  const luma = 0.2126 * average[0] + 0.7152 * average[1] + 0.0722 * average[2];
  return {
    r: average[0],
    g: average[1],
    b: average[2],
    flat: variance < 26,
    luma,
  };
}

/**
 * Friend circle for Teen mode.
 * True phone-contact matching comes with the native app.
 * The web uses personal invite links only: no search, no public profile.
 * A hosted circle provider would deliver accepts and parent views across phones.
 */
export const localCircleProvider = {
  id: "local-invite-link",
  label: "Invite links",
  contactMatching: "native-app",
  webInvites: "link",
  createInvite,
  acceptInvite,
  approveFriend,
  removeFriend,
  blockFriend,
  reportFriend,
  createParentLink,
  parentSnapshot,
  allowVote,
  allowMessage,
  allowLookShare,
  shareLookWith,
  canViewShare,
  visiblePacks,
};

export const providers = {
  avatar: localAvatarProvider,
  tryOn: localTryOnProvider,
  makeup: localMakeupProvider,
  background: localBackgroundProvider,
  circle: localCircleProvider,
};
