/**
 * Public "Fit or Miss?" links.
 *
 * `publish` returns `{ token, url }`. The url looks like
 * https://windigo98.github.io/WingsCrew-Looks/#/v/<token>
 * `get` is what a visitor can see. `counts` and `revoke` work only for the
 * phone that published the link (it keeps an owner secret). A device votes once.
 */
const STORE_KEY = "wcl-share-links";
const DEVICE_KEY = "wcl-device-id";
const OWNER_KEY = "wcl-share-owner";
const CHOICE_KEY = "wcl-device-votes";

export const DEMO_SHARE_LABEL = "Demo: links only open on this phone until sharing goes live";

export function shareLinkUrl(token, href) {
  const fallback = "https://windigo98.github.io/WingsCrew-Looks/";
  const base = href || (typeof location !== "undefined" && location.href ? location.href : fallback);
  const url = new URL(base, fallback);
  url.hash = `/v/${token}`;
  url.search = "";
  return url.href;
}

export function supabaseShareConfig() {
  const win = globalThis.window;
  const url = String(win?.WCL_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const anonKey = String(win?.WCL_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anonKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url, anonKey };
}

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

function cleanText(value, max) {
  return String(value || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
}

function choiceOf(value) {
  const choice = String(value || "").toLowerCase();
  return choice === "fit" || choice === "miss" ? choice : "";
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
  };
}

function storageOf(storage) {
  if (storage) return storage;
  try {
    if (typeof localStorage !== "undefined" && localStorage) return localStorage;
  } catch {
    /* private mode */
  }
  return memoryStorage();
}

function readDeviceId(storage) {
  let id = storage.getItem(DEVICE_KEY);
  if (!id) {
    id = newId();
    storage.setItem(DEVICE_KEY, id);
  }
  return id;
}

async function toDataUrl(image) {
  if (typeof image === "string") return image;
  if (typeof Blob === "undefined" || !(image instanceof Blob)) return "";
  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return `data:${image.type || "image/jpeg"};base64,${btoa(binary)}`;
}

async function asBlob(image) {
  if (typeof Blob !== "undefined" && image instanceof Blob) return image;
  if (typeof image !== "string" || !image.startsWith("data:")) return null;
  const [meta, data] = image.split(",");
  const type = /data:(.*?);/.exec(meta)?.[1] || "image/jpeg";
  const binary = atob(data || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

export function createMemoryShareLinks(options = {}) {
  const looks = options.looks || new Map();
  const votes = options.votes || [];
  const secrets = options.secrets || new Map();
  const localChoices = options.localChoices || new Map();
  const href = options.href;
  const persist = options.persist || (() => {});
  const fixedDeviceId = options.deviceId || "";

  function deviceId() {
    if (fixedDeviceId) return fixedDeviceId;
    if (options.readDeviceId) return options.readDeviceId();
    return newId();
  }

  function owned() {
    return [...secrets.values()].map((entry) => ({
      lookId: entry.lookId,
      token: entry.token,
      revoked: Boolean(entry.revoked),
    }));
  }

  async function publish(look) {
    if (look?.teen || look?.audience === "teen") return { error: "Teen mode has no public link." };
    const name = cleanText(look?.name, 80);
    if (!name || look?.image == null || look.image === "") return { error: "Save the look image first." };
    const lookId = cleanText(look?.lookId, 80);
    const previous = [...secrets.values()].find((entry) => entry.lookId && entry.lookId === lookId && !entry.revoked);
    if (previous) {
      const stopped = await revoke(previous.token);
      if (!stopped.ok) return { error: stopped.error || "Could not replace the old link." };
    }
    const token = newId();
    const ownerSecret = newId();
    looks.set(token, {
      token,
      lookId,
      name,
      occasion: cleanText(look?.occasion, 40),
      image: look.image,
      ownerSecret,
      revoked: false,
      createdAt: Date.now(),
    });
    secrets.set(token, { token, lookId, ownerSecret, revoked: false });
    persist();
    return { token, url: shareLinkUrl(token, href) };
  }

  async function get(token) {
    const record = looks.get(String(token || ""));
    if (!record || record.revoked) return null;
    return {
      token: record.token,
      name: record.name,
      occasion: record.occasion,
      image: record.image,
    };
  }

  async function vote(token, choice, deviceIdValue) {
    const record = looks.get(String(token || ""));
    if (!record || record.revoked) return { ok: false, error: "This link isn't available." };
    const picked = choiceOf(choice);
    if (!picked) return { ok: false, error: "Vote fit or miss." };
    const id = String(deviceIdValue || deviceId() || "");
    if (!id) return { ok: false, error: "This phone could not save a vote." };
    const existing = votes.find((item) => item.token === record.token && item.deviceId === id);
    if (existing) {
      localChoices.set(record.token, existing.choice);
      persist();
      return { ok: true, choice: existing.choice, duplicate: true };
    }
    votes.push({ token: record.token, deviceId: id, choice: picked });
    localChoices.set(record.token, picked);
    persist();
    return { ok: true, choice: picked, duplicate: false };
  }

  async function counts(token) {
    const record = looks.get(String(token || ""));
    const secret = secrets.get(String(token || ""));
    if (!record || !secret || secret.ownerSecret !== record.ownerSecret) {
      return { ok: false, fit: 0, miss: 0, forbidden: true };
    }
    const rows = votes.filter((item) => item.token === record.token);
    return {
      ok: true,
      fit: rows.filter((item) => item.choice === "fit").length,
      miss: rows.filter((item) => item.choice === "miss").length,
    };
  }

  async function revoke(token) {
    const record = looks.get(String(token || ""));
    const secret = secrets.get(String(token || ""));
    if (!record || !secret || secret.ownerSecret !== record.ownerSecret) {
      return { ok: false, error: "Only the owner can stop sharing." };
    }
    record.revoked = true;
    secret.revoked = true;
    persist();
    return { ok: true };
  }

  function deviceChoice(token) {
    return localChoices.get(String(token || "")) || "";
  }

  return {
    publish,
    get,
    vote,
    counts,
    revoke,
    owned,
    deviceId,
    deviceChoice,
    url: (token) => shareLinkUrl(token, href),
  };
}

export function createLocalShareLinks(options = {}) {
  const storage = storageOf(options.storage);
  let data = { looks: {}, votes: [], choices: {} };
  try {
    data = { ...data, ...JSON.parse(storage.getItem(STORE_KEY) || "{}") };
  } catch {
    data = { looks: {}, votes: [], choices: {} };
  }
  const looks = new Map(Object.entries(data.looks || {}));
  const votes = Array.isArray(data.votes) ? data.votes : [];
  const secrets = new Map();
  for (const record of looks.values()) {
    secrets.set(record.token, {
      token: record.token,
      lookId: record.lookId,
      ownerSecret: record.ownerSecret,
      revoked: Boolean(record.revoked),
    });
  }
  const localChoices = new Map(Object.entries(data.choices || {}));
  const core = createMemoryShareLinks({
    looks,
    votes,
    secrets,
    localChoices,
    href: options.href,
    readDeviceId: () => readDeviceId(storage),
    persist() {
      const stored = {};
      for (const [token, record] of looks) stored[token] = record;
      try {
        storage.setItem(STORE_KEY, JSON.stringify({
          looks: stored,
          votes,
          choices: Object.fromEntries(localChoices),
        }));
      } catch {
        throw new Error("This phone is out of space for the demo link.");
      }
    },
  });
  return {
    ...core,
    async publish(look) {
      const image = await toDataUrl(look?.image);
      return core.publish({ ...look, image });
    },
  };
}

function readJson(storage, key) {
  try {
    const parsed = JSON.parse(storage.getItem(key) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function createSupabaseShareLinks(options = {}) {
  const endpoint = String(options.url || "").replace(/\/$/, "");
  const anonKey = String(options.anonKey || "");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const storage = storageOf(options.storage);
  const href = options.href;

  function headers(extra = {}) {
    return {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      ...extra,
    };
  }

  function book() {
    return readJson(storage, OWNER_KEY);
  }

  function saveBook(next) {
    storage.setItem(OWNER_KEY, JSON.stringify(next));
  }

  function owned() {
    return Object.values(book()).map((entry) => ({
      lookId: entry.lookId,
      token: entry.token,
      revoked: Boolean(entry.revoked),
    }));
  }

  async function publish(look) {
    if (look?.teen || look?.audience === "teen") return { error: "Teen mode has no public link." };
    const name = cleanText(look?.name, 80);
    const blob = await asBlob(await toDataUrl(look?.image));
    if (!name || !blob) return { error: "Save the look image first." };
    const lookId = cleanText(look?.lookId, 80);
    const previous = owned().find((entry) => entry.lookId && entry.lookId === lookId && !entry.revoked);
    if (previous) {
      const stopped = await revoke(previous.token);
      if (!stopped.ok) return { error: stopped.error || "Could not replace the old link." };
    }
    const token = newId();
    const ownerSecret = newId();
    const imagePath = `${token}.jpg`;
    const upload = await fetchImpl(`${endpoint}/storage/v1/object/looks/${imagePath}`, {
      method: "POST",
      headers: headers({ "Content-Type": blob.type || "image/jpeg" }),
      body: blob,
    });
    if (!upload?.ok) return { error: "Could not publish that look." };
    const insert = await fetchImpl(`${endpoint}/rest/v1/shared_looks`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }),
      body: JSON.stringify({
        token,
        look_id: lookId,
        name,
        occasion: cleanText(look?.occasion, 40),
        image_path: imagePath,
        owner_secret: ownerSecret,
        revoked: false,
      }),
    });
    if (!insert?.ok) {
      await fetchImpl(`${endpoint}/storage/v1/object/looks/${imagePath}`, {
        method: "DELETE",
        headers: headers(),
      }).catch(() => {});
      return { error: "Could not publish that look." };
    }
    const next = book();
    next[token] = { token, lookId, ownerSecret, revoked: false };
    saveBook(next);
    return { token, url: shareLinkUrl(token, href) };
  }

  async function get(token) {
    const id = String(token || "");
    if (!id) return null;
    const response = await fetchImpl(
      `${endpoint}/rest/v1/shared_looks?token=eq.${encodeURIComponent(id)}&select=token,name,occasion,image_path`,
      { headers: headers({ Accept: "application/json", "x-look-token": id }) },
    );
    if (!response?.ok) return null;
    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.token) return null;
    let image = "";
    if (row.image_path) {
      const file = await fetchImpl(`${endpoint}/storage/v1/object/looks/${row.image_path}`, {
        headers: headers(),
      });
      if (file?.ok && file.blob) image = await file.blob();
    }
    return { token: row.token, name: row.name, occasion: row.occasion || "", image };
  }

  async function vote(token, choice, deviceIdValue) {
    const id = String(token || "");
    const picked = choiceOf(choice);
    if (!picked) return { ok: false, error: "Vote fit or miss." };
    const device = String(deviceIdValue || readDeviceId(storage));
    const response = await fetchImpl(`${endpoint}/rest/v1/votes`, {
      method: "POST",
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "return=minimal",
        "x-look-token": id,
      }),
      body: JSON.stringify({ look_token: id, device_id: device, choice: picked }),
    });
    const choices = readJson(storage, CHOICE_KEY);
    if (response?.status === 409) {
      return { ok: true, choice: choices[id] || picked, duplicate: true };
    }
    if (!response?.ok) return { ok: false, error: "Could not save that vote." };
    choices[id] = picked;
    storage.setItem(CHOICE_KEY, JSON.stringify(choices));
    return { ok: true, choice: picked, duplicate: false };
  }

  async function counts(token) {
    const id = String(token || "");
    const entry = book()[id];
    if (!entry?.ownerSecret) return { ok: false, fit: 0, miss: 0, forbidden: true };
    const response = await fetchImpl(
      `${endpoint}/rest/v1/votes?look_token=eq.${encodeURIComponent(id)}&select=choice`,
      { headers: headers({ Accept: "application/json", "x-owner-secret": entry.ownerSecret }) },
    );
    if (!response?.ok) return { ok: false, fit: 0, miss: 0, forbidden: true };
    const rows = await response.json();
    const list = Array.isArray(rows) ? rows : [];
    return {
      ok: true,
      fit: list.filter((item) => item.choice === "fit").length,
      miss: list.filter((item) => item.choice === "miss").length,
    };
  }

  async function revoke(token) {
    const id = String(token || "");
    const entry = book()[id];
    if (!entry?.ownerSecret) return { ok: false, error: "Only the owner can stop sharing." };
    const response = await fetchImpl(`${endpoint}/rest/v1/rpc/revoke_look`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({ look_token: id, secret: entry.ownerSecret }),
    });
    const revoked = response?.ok ? await response.json().catch(() => false) : false;
    if (revoked !== true) return { ok: false, error: "Only the owner can stop sharing." };
    await fetchImpl(`${endpoint}/storage/v1/object/looks/${id}.jpg`, {
      method: "DELETE",
      headers: headers({ "x-owner-secret": entry.ownerSecret }),
    }).catch(() => {});
    const next = book();
    next[id] = { ...next[id], revoked: true };
    saveBook(next);
    return { ok: true };
  }

  function deviceChoice(token) {
    return readJson(storage, CHOICE_KEY)[String(token || "")] || "";
  }

  return {
    publish,
    get,
    vote,
    counts,
    revoke,
    owned,
    deviceId: () => readDeviceId(storage),
    deviceChoice,
    url: (token) => shareLinkUrl(token, href),
  };
}
