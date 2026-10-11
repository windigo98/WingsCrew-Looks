import { getPreset } from "./makeup.js";

const STAMP_RATIO = { blush: 0.72, lip: 0.42, shadow: 0.46, highlight: 0.72 };

export function layoutPhoto(canvasW, canvasH, imageW, imageH) {
  const pad = 0.035;
  const availableW = canvasW * (1 - pad * 2);
  const availableH = canvasH * (1 - pad * 2);
  const scale = Math.min(availableW / imageW, availableH / imageH);
  const w = imageW * scale;
  const h = imageH * scale;
  return {
    x: (canvasW - w) / 2,
    y: (canvasH - h) / 2,
    w,
    h,
  };
}

export function layerBox(photoRect, layer) {
  const cx = photoRect.x + layer.x * photoRect.w;
  const cy = photoRect.y + layer.y * photoRect.h;
  if (layer.kind === "stamp") {
    const bw = photoRect.w * layer.scale * 2;
    const bh = bw * (STAMP_RATIO[layer.stampKind] || 0.7);
    return { cx, cy, bw, bh, rotation: layer.rotation || 0 };
  }
  const aspect = layer.aspect || 1;
  const bw = photoRect.w * 0.42 * (layer.scale || 1);
  const bh = bw / aspect;
  return { cx, cy, bw, bh, rotation: layer.rotation || 0 };
}

export function hitTest(x, y, photoRect, layers) {
  if (!photoRect) return null;
  const sorted = [...layers].sort((a, b) => (b.z || 0) - (a.z || 0));
  for (const layer of sorted) {
    if (layer.kind !== "stamp" && !layer.image) continue;
    const box = layerBox(photoRect, layer);
    if (pointInBox(x, y, box)) return layer.id;
  }
  return null;
}

function pointInBox(px, py, box) {
  const dx = px - box.cx;
  const dy = py - box.cy;
  const angle = -(box.rotation || 0) * Math.PI / 180;
  const x = dx * Math.cos(angle) - dy * Math.sin(angle);
  const y = dx * Math.sin(angle) + dy * Math.cos(angle);
  return Math.abs(x) <= box.bw / 2 && Math.abs(y) <= box.bh / 2;
}

export function paint(ctx, width, height, scene, options = {}) {
  const badge = Boolean(options.badge);
  const handles = Boolean(options.handles);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, width, height);
  const backdrop = ctx.createLinearGradient(0, 0, 0, height);
  backdrop.addColorStop(0, "#f6e4d8");
  backdrop.addColorStop(1, "#e4cbbd");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = Math.max(2, width * 0.004);
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.08, width * 0.16, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.restore();

  let photoRect = null;
  if (scene.photo) {
    photoRect = layoutPhoto(width, height, scene.photo.naturalWidth || scene.photo.width, scene.photo.naturalHeight || scene.photo.height);
    ctx.drawImage(scene.photo, photoRect.x, photoRect.y, photoRect.w, photoRect.h);
    drawGrade(ctx, photoRect, scene);
  }

  const layers = [...(scene.layers || [])].sort((a, b) => (a.z || 0) - (b.z || 0));
  if (photoRect) {
    for (const layer of layers) {
      if (scene.hideStamps && layer.kind === "stamp") continue;
      drawLayer(ctx, photoRect, layer, scene.strength ?? 1);
      if (handles && layer.id && layer.id === scene.selectedId) drawHandle(ctx, photoRect, layer, width);
    }
  }

  if (badge) drawBadge(ctx, width, height);
  return { photoRect, width, height };
}

function drawGrade(ctx, photoRect, scene) {
  const preset = getPreset(scene.makeupId || "none");
  if (!preset.grade && !preset.vignette) return;
  const strength = scene.strength ?? 0.85;
  ctx.save();
  ctx.beginPath();
  ctx.rect(photoRect.x, photoRect.y, photoRect.w, photoRect.h);
  ctx.clip();
  if (preset.grade) {
    ctx.globalCompositeOperation = preset.grade.blend || "soft-light";
    ctx.globalAlpha = (preset.grade.alpha || 0.3) * strength;
    ctx.fillStyle = preset.grade.color;
    ctx.fillRect(photoRect.x, photoRect.y, photoRect.w, photoRect.h);
  }
  if (preset.vignette) {
    const cx = photoRect.x + photoRect.w / 2;
    const cy = photoRect.y + photoRect.h * 0.42;
    const gradient = ctx.createRadialGradient(cx, cy, photoRect.h * 0.18, cx, cy, photoRect.h * 0.72);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(24, 16, 32, ${preset.vignette * strength})`);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = gradient;
    ctx.fillRect(photoRect.x, photoRect.y, photoRect.w, photoRect.h);
  }
  ctx.restore();
}

function drawLayer(ctx, photoRect, layer, strength) {
  const box = layerBox(photoRect, layer);
  ctx.save();
  ctx.translate(box.cx, box.cy);
  ctx.rotate((box.rotation || 0) * Math.PI / 180);
  ctx.scale(layer.flip || 1, 1);
  if (layer.kind === "stamp") {
    drawStamp(ctx, layer, box, strength);
  } else if (layer.image) {
    ctx.drawImage(layer.image, -box.bw / 2, -box.bh / 2, box.bw, box.bh);
  }
  ctx.restore();
}

function drawStamp(ctx, layer, box, strength) {
  const rx = box.bw / 2;
  const ry = box.bh / 2;
  const color = layer.color || "rgba(180,40,70,0.6)";
  const fade = color.replace(/[\d.]+\)$/, "0)");
  const gradient = ctx.createRadialGradient(0, 0, rx * 0.05, 0, 0, Math.max(rx, ry));
  const solidStop = layer.stampKind === "lip" ? 0.32 : layer.stampKind === "shadow" ? 0.22 : 0.12;
  gradient.addColorStop(0, color);
  gradient.addColorStop(solidStop, color);
  gradient.addColorStop(1, fade);
  ctx.globalCompositeOperation = layer.stampKind === "highlight" ? "screen" : "source-over";
  ctx.globalAlpha = (0.45 + 0.55 * strength);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawHandle(ctx, photoRect, layer, canvasW) {
  const box = layerBox(photoRect, layer);
  ctx.save();
  ctx.translate(box.cx, box.cy);
  ctx.rotate((box.rotation || 0) * Math.PI / 180);
  ctx.strokeStyle = "#fffdfb";
  ctx.lineWidth = Math.max(2, canvasW * 0.004);
  ctx.setLineDash([10, 7]);
  ctx.strokeRect(-box.bw / 2, -box.bh / 2, box.bw, box.bh);
  ctx.restore();
}

function drawBadge(ctx, width, height) {
  const pad = Math.round(width * 0.028);
  const fontSize = Math.max(16, Math.round(width * 0.026));
  const small = Math.round(fontSize * 0.68);
  ctx.save();
  ctx.font = `600 ${fontSize}px Outfit, "Avenir Next", sans-serif`;
  const titleW = ctx.measureText("WingsCrew Looks").width;
  const boxW = titleW + pad * 3.2 + fontSize;
  const boxH = Math.round(fontSize * 2.35);
  const x = pad;
  const y = height - pad - boxH;
  roundRect(ctx, x, y, boxW, boxH, boxH / 2);
  ctx.fillStyle = "rgba(28, 20, 36, 0.84)";
  ctx.fill();

  const icon = fontSize * 0.95;
  ctx.translate(x + pad * 0.9, y + boxH / 2);
  ctx.strokeStyle = "#f3e6c8";
  ctx.lineWidth = Math.max(1.4, fontSize * 0.08);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(icon * 0.45, icon * 0.28);
  ctx.bezierCurveTo(-icon * 0.1, icon * 0.15, -icon * 0.35, -icon * 0.15, -icon * 0.15, -icon * 0.42);
  ctx.moveTo(icon * 0.45, icon * 0.28);
  ctx.bezierCurveTo(icon * 0.1, -icon * 0.05, -icon * 0.05, -icon * 0.35, icon * 0.05, -icon * 0.55);
  ctx.moveTo(icon * 0.55, icon * 0.28);
  ctx.bezierCurveTo(icon * 1.1, icon * 0.15, icon * 1.35, -icon * 0.15, icon * 1.15, -icon * 0.42);
  ctx.moveTo(icon * 0.55, icon * 0.28);
  ctx.bezierCurveTo(icon * 0.9, -icon * 0.05, icon * 1.05, -icon * 0.35, icon * 0.95, -icon * 0.55);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "#f3e6c8";
  ctx.font = `600 ${small}px Outfit, "Avenir Next", sans-serif`;
  ctx.fillText("AI preview", x + pad * 1.5 + fontSize, y + boxH * 0.4);
  ctx.fillStyle = "#fffdfb";
  ctx.font = `600 ${fontSize}px Outfit, "Avenir Next", sans-serif`;
  ctx.fillText("WingsCrew Looks", x + pad * 1.5 + fontSize, y + boxH * 0.76);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export async function paintToBlob(scene, { width = 1080, height = 1440 } = {}) {
  if (globalThis.document?.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* badge falls back to sans-serif */ }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  paint(ctx, width, height, scene, { badge: true, handles: false });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("Could not create the image.");
  return blob;
}
