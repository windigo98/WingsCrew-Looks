import assert from "node:assert/strict";
import test from "node:test";
import { shareLinks } from "../js/providers.js";
import {
  DEMO_SHARE_LABEL,
  createLocalShareLinks,
  createMemoryShareLinks,
  createSupabaseShareLinks,
  shareLinkUrl,
} from "../js/share-links.js";

const PAGE = "https://windigo98.github.io/WingsCrew-Looks/";

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

test("publish returns a public vote link and hides the owner secret", async () => {
  const owner = createMemoryShareLinks({ href: PAGE });
  const published = await owner.publish({
    lookId: "look_1",
    name: "Garden midi",
    occasion: "wedding-guest",
    image: "data:image/jpeg;base64,abc",
  });
  assert.equal(published.url, shareLinkUrl(published.token, PAGE));
  assert.match(published.url, /^https:\/\/windigo98\.github\.io\/WingsCrew-Looks\/#\/v\//);
  const look = await owner.get(published.token);
  assert.equal(look.name, "Garden midi");
  assert.equal(look.occasion, "wedding-guest");
  assert.equal(look.image, "data:image/jpeg;base64,abc");
  assert.equal(look.ownerSecret, undefined);
  assert.equal(DEMO_SHARE_LABEL, "Demo: links only open on this phone until sharing goes live");
});

test("a phone can vote fit or miss once", async () => {
  const looks = new Map();
  const votes = [];
  const owner = createMemoryShareLinks({ href: PAGE, looks, votes, secrets: new Map() });
  const visitor = createMemoryShareLinks({ href: PAGE, looks, votes, secrets: new Map() });
  const published = await owner.publish({
    lookId: "look_1",
    name: "Straw hat",
    occasion: "everyday",
    image: "data:image/jpeg;base64,abc",
  });
  const first = await visitor.vote(published.token, "fit", "phone-a");
  const again = await visitor.vote(published.token, "miss", "phone-a");
  const other = await visitor.vote(published.token, "Miss", "phone-b");
  const bad = await visitor.vote(published.token, "heart", "phone-c");
  assert.equal(first.duplicate, false);
  assert.equal(again.duplicate, true);
  assert.equal(again.choice, "fit");
  assert.equal(other.choice, "miss");
  assert.equal(bad.ok, false);
  assert.deepEqual(await owner.counts(published.token), { ok: true, fit: 1, miss: 1 });
  assert.deepEqual(await visitor.counts(published.token), { ok: false, fit: 0, miss: 0, forbidden: true });
});

test("revoke hides the look and blocks a new vote", async () => {
  const looks = new Map();
  const votes = [];
  const owner = createMemoryShareLinks({ href: PAGE, looks, votes, secrets: new Map() });
  const visitor = createMemoryShareLinks({ href: PAGE, looks, votes, secrets: new Map() });
  const published = await owner.publish({ lookId: "look_2", name: "Ink blazer", occasion: "interview", image: "pic" });
  await visitor.vote(published.token, "fit", "phone-a");
  const stopped = await owner.revoke(published.token);
  assert.equal(stopped.ok, true);
  assert.equal(await visitor.revoke(published.token).then((result) => result.ok), false);
  assert.equal(await visitor.get(published.token), null);
  assert.equal((await visitor.vote(published.token, "miss", "phone-b")).ok, false);
  assert.deepEqual(await owner.counts(published.token), { ok: true, fit: 1, miss: 0 });
});

test("teen mode has no public link", async () => {
  const api = createMemoryShareLinks({ href: PAGE });
  const teen = await api.publish({ lookId: "look_3", name: "Look", occasion: "everyday", image: "pic", teen: true });
  assert.equal(teen.error, "Teen mode has no public link.");
  assert.equal(teen.token, undefined);
  const audience = await api.publish({ lookId: "look_4", name: "Look", image: "pic", audience: "teen" });
  assert.equal(audience.token, undefined);
});

test("a demo link survives a reload on the same phone", async () => {
  const storage = memoryStorage();
  const first = createLocalShareLinks({ storage, href: PAGE });
  const published = await first.publish({
    lookId: "look_5",
    name: "Pearl strand",
    occasion: "date-night",
    image: "data:image/jpeg;base64,abc",
  });
  const second = createLocalShareLinks({ storage, href: PAGE });
  assert.equal((await second.get(published.token)).name, "Pearl strand");
  await second.vote(published.token, "fit", "phone-a");
  await second.vote(published.token, "miss", "phone-a");
  const third = createLocalShareLinks({ storage, href: PAGE });
  assert.deepEqual(await third.counts(published.token), { ok: true, fit: 1, miss: 0 });
  assert.equal(third.deviceChoice(published.token), "fit");
  assert.equal((await third.owned()).some((item) => item.token === published.token), true);
});

test("supabase client uses the anon key and dedupes a second vote", async () => {
  const storage = memoryStorage();
  const votes = [];
  let publishedToken = "";
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const bodyText = typeof init.body === "string" ? init.body : "";
    calls.push({ url, method: init.method || "GET", headers: init.headers || {}, bodyText });
    if (url.includes("/storage/v1/object/looks/") && init.method === "POST") {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (url.endsWith("/rest/v1/shared_looks") && init.method === "POST") {
      publishedToken = JSON.parse(bodyText).token;
      return { ok: true, status: 201, json: async () => ({}) };
    }
    if (url.includes("/rest/v1/shared_looks?") && (init.method || "GET") === "GET") {
      return {
        ok: true,
        status: 200,
        json: async () => [{ token: publishedToken, name: "Garden midi", occasion: "everyday", image_path: `${publishedToken}.jpg` }],
      };
    }
    if (url.includes("/storage/v1/object/looks/") && (init.method || "GET") === "GET") {
      return { ok: true, status: 200, blob: async () => new Blob(["img"], { type: "image/jpeg" }) };
    }
    if (url.endsWith("/rest/v1/votes") && init.method === "POST") {
      const body = JSON.parse(bodyText);
      if (votes.some((item) => item.device_id === body.device_id)) return { ok: false, status: 409, json: async () => ({}) };
      votes.push(body);
      return { ok: true, status: 201, json: async () => ({}) };
    }
    if (url.includes("/rest/v1/votes?") && (init.method || "GET") === "GET") {
      return { ok: true, status: 200, json: async () => votes.map((item) => ({ choice: item.choice })) };
    }
    if (url.endsWith("/rest/v1/rpc/revoke_look") && init.method === "POST") {
      const body = JSON.parse(bodyText);
      const allowed = body.look_token === publishedToken && body.secret && body.secret.length > 10;
      return { ok: true, status: 200, json: async () => allowed };
    }
    if (init.method === "DELETE") return { ok: true, status: 200, json: async () => ({}) };
    return { ok: false, status: 500, json: async () => ({}) };
  };
  const api = createSupabaseShareLinks({
    url: "https://example.supabase.co/",
    anonKey: "anon-public-key",
    fetchImpl,
    storage,
    href: PAGE,
  });
  const stranger = createSupabaseShareLinks({
    url: "https://example.supabase.co",
    anonKey: "anon-public-key",
    fetchImpl,
    storage: memoryStorage(),
    href: PAGE,
  });
  const image = new Blob(["pic"], { type: "image/jpeg" });
  const published = await api.publish({ lookId: "look_9", name: "Garden midi", occasion: "everyday", image });
  assert.match(published.url, /#\/v\//);
  const look = await api.get(published.token);
  assert.equal(look.name, "Garden midi");
  assert.equal(look.ownerSecret, undefined);
  const first = await api.vote(published.token, "fit", "phone-a");
  const second = await api.vote(published.token, "miss", "phone-a");
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.choice, "fit");
  assert.deepEqual(await api.counts(published.token), { ok: true, fit: 1, miss: 0 });
  assert.equal((await stranger.counts(published.token)).forbidden, true);
  assert.equal((await api.revoke(published.token)).ok, true);

  const insert = calls.find((call) => call.url.endsWith("/rest/v1/shared_looks") && call.method === "POST");
  const read = calls.find((call) => call.url.includes("/rest/v1/shared_looks?") && call.method === "GET");
  const tally = calls.find((call) => call.url.includes("/rest/v1/votes?") && call.method === "GET");
  const patch = calls.find((call) => call.url.endsWith("/rest/v1/rpc/revoke_look"));
  const removed = calls.find((call) => call.method === "DELETE" && call.url.includes("/storage/v1/object/looks/"));
  assert.equal(insert.headers.apikey, "anon-public-key");
  assert.equal(insert.headers.Authorization, "Bearer anon-public-key");
  assert.equal(insert.headers.Prefer, "return=minimal");
  assert.equal(JSON.parse(insert.bodyText).owner_secret.length > 10, true);
  assert.equal(read.headers["x-look-token"], published.token);
  assert.equal(read.headers["x-owner-secret"], undefined);
  assert.equal(read.url.includes("owner_secret"), false);
  assert.equal(tally.headers["x-owner-secret"], JSON.parse(insert.bodyText).owner_secret);
  assert.equal(JSON.parse(patch.bodyText).look_token, published.token);
  assert.equal(JSON.parse(patch.bodyText).secret, JSON.parse(insert.bodyText).owner_secret);
  assert.equal(removed.headers["x-owner-secret"], JSON.parse(insert.bodyText).owner_secret);
  assert.equal(calls.some((call) => call.method === "PATCH"), false);
  assert.equal(calls.some((call) => JSON.stringify(call.headers).includes("service_role")), false);
});

test("shareLinks stays a demo until both Supabase settings are present", () => {
  const previous = globalThis.window;
  try {
    globalThis.window = {};
    assert.equal(shareLinks.demo(), true);
    assert.equal(shareLinks.id, "demo");
    globalThis.window = { WCL_SUPABASE_URL: "https://example.supabase.co", WCL_SUPABASE_ANON_KEY: "" };
    assert.equal(shareLinks.demo(), true);
    globalThis.window = { WCL_SUPABASE_URL: "http://example.supabase.co", WCL_SUPABASE_ANON_KEY: "anon-public-key" };
    assert.equal(shareLinks.id, "demo");
    globalThis.window = { WCL_SUPABASE_URL: "https://example.supabase.co/", WCL_SUPABASE_ANON_KEY: "anon-public-key" };
    assert.equal(shareLinks.id, "supabase");
    assert.equal(shareLinks.demo(), false);
  } finally {
    globalThis.window = previous;
  }
});
