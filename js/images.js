/** Decode and resize images in the browser. Used by the local providers. */

function loadUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read that image. Try a JPEG or PNG."));
    image.src = url;
  });
}

export async function decodeImage(source) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(source);
      return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
    } catch {
      /* Some files (for example HEIC outside Safari) fall through to an <img>. */
    }
  }
  const url = URL.createObjectURL(source);
  try {
    const image = await loadUrl(url);
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function downscaleImage(source, maxEdge = 1600, type = "image/jpeg", quality = 0.86) {
  const decoded = await decodeImage(source);
  try {
    const scale = Math.min(1, maxEdge / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(decoded.image, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob) throw new Error("Could not save that image.");
    return blob;
  } finally {
    decoded.close?.();
  }
}

export function loadImage(src) {
  return loadUrl(src);
}
