/** Small shared helpers. No DOM. */

export function uid(prefix) {
  const rand = globalThis.crypto?.randomUUID?.() || Math.random().toString(16).slice(2);
  return `${prefix}_${rand}`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function clean(value, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

/** Keep http(s) links only, so a pasted value cannot become a script URL. */
export function safeHttpUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    return "";
  }
  return "";
}

export function splitList(value) {
  if (Array.isArray(value)) {
    return value.map((part) => clean(part, 40)).filter(Boolean);
  }
  return String(value ?? "")
    .split(/[,/|]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.slice(0, 40));
}

export function parsePrice(value) {
  if (value == null || value === "") return null;
  const match = String(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

export function mapsSearchUrl(address) {
  const query = clean(address, 240);
  if (!query) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
