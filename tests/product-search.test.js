import assert from "node:assert/strict";
import test from "node:test";
import { affiliate, productSearch, remoteProductSearch } from "../js/providers.js";
import {
  EXAMPLE_ITEMS,
  categoryForSlot,
  configuredSearchUrl,
  fetchRemoteProducts,
  formatPrice,
  pieceQuery,
  rankProducts,
  runProductSearch,
  showsEtsyNotice,
} from "../js/product-search.js";

test("builds a search query from type, color, and style words", () => {
  const hat = pieceQuery({ name: "Straw hat", category: "hat", occasion: "texas-summer" });
  assert.equal(hat.type, "hat");
  assert.equal(hat.color, "");
  assert.equal(hat.slotLabel, "Hat");
  assert.match(hat.query, /hat/);
  assert.match(hat.query, /straw/);
  assert.match(hat.query, /texas/);
  assert.match(hat.query, /summer/);

  const pearls = pieceQuery({ name: "Pearl strand", category: "jewelry" });
  assert.equal(pearls.type, "neck");
  assert.equal(pearls.color, "pearl");
  assert.match(pearls.query, /necklace/);
  assert.match(pearls.query, /pearl/);
  assert.match(pearls.query, /strand/);

  const glasses = pieceQuery({ name: "Gold frame glasses", category: "accessory" });
  assert.equal(glasses.type, "eyes");
  assert.equal(glasses.slotLabel, "Glasses");
  assert.equal(glasses.color, "gold");
  assert.equal(categoryForSlot("eyes"), "jewelry");
  assert.equal(categoryForSlot("dress"), "dress");
});

test("ranks by closeness, then by price", async () => {
  const items = await runProductSearch({ query: "hat straw summer texas", type: "hat" });
  assert.equal(items[0].id, "ex-straw-sun");
  assert.ok(items[0].price > items[1].price);
  assert.equal(items[1].id, "ex-straw-visor");
  assert.equal(items.at(-1).id, "ex-felt-fedora");
  assert.equal(items[0].currency, "USD");
  assert.equal(items[0].affiliate, false);
  assert.equal(formatPrice(items[0].price, items[0].currency), "$34");
});

test("priceMax drops expensive matches", async () => {
  const items = await runProductSearch({ query: "hat straw", type: "hat", priceMax: 20 });
  assert.deepEqual(items.map((item) => item.id), ["ex-straw-visor"]);
});

test("teen mode hides adult sponsored items", () => {
  const adult = rankProducts(EXAMPLE_ITEMS, { query: "dress", type: "dress", teen: false });
  const teen = rankProducts(EXAMPLE_ITEMS, { query: "dress", type: "dress", teen: true });
  assert.ok(adult.some((item) => item.id === "ex-after-hours"));
  assert.equal(teen.some((item) => item.id === "ex-after-hours"), false);
  assert.ok(teen.length >= 2);
});

test("example catalog covers each wear slot", async () => {
  for (const type of ["hat", "top", "bottom", "dress", "outerwear", "shoes", "bag", "neck", "ears", "eyes"]) {
    const items = await runProductSearch({ query: type, type, teen: true });
    assert.ok(items.length >= 2, type);
    for (const item of items) {
      assert.equal(typeof item.title, "string");
      assert.equal(typeof item.price, "number");
      assert.ok(item.store);
      assert.match(item.url, /^https:\/\/example\.com\//);
    }
  }
});

test("affiliate wrap is a passthrough for http links", () => {
  assert.equal(affiliate.wrap("https://example.com/shop/hat"), "https://example.com/shop/hat");
  assert.equal(affiliate.wrap("javascript:alert(1)"), "");
  assert.equal(affiliate.wrap(""), "");
});

test("remote search calls the configured URL and still ranks", async () => {
  let seen = "";
  const items = await runProductSearch(
    { query: "hat straw", type: "hat", color: "", priceMax: 40, teen: true },
    {
      url: "https://search.example/looks",
      fetchImpl: async (url) => {
        seen = url;
        return {
          ok: true,
          json: async () => ({
            items: [
              { id: "wool", title: "Wool hat", price: 10, currency: "USD", image: "", url: "https://shop.example/wool", store: "Shop", affiliate: false, type: "hat", tags: ["wool"] },
              { id: "straw", title: "Straw hat", price: 30, currency: "USD", image: "https://example.com/a.png", url: "https://shop.example/straw", store: "Shop", affiliate: true, type: "hat", tags: ["straw", "hat"] },
              { id: "night", title: "After-hours hat", price: 12, currency: "USD", image: "", url: "https://shop.example/night", store: "Shop", affiliate: false, type: "hat", tags: ["hat"], adultSponsored: true, audience: "18+", sponsorCategory: "adult" },
              { id: "pricey", title: "Straw hat deluxe", price: 90, currency: "USD", image: "", url: "https://shop.example/pricey", store: "Shop", affiliate: false, type: "hat", tags: ["straw"] },
            ],
          }),
        };
      },
    },
  );
  const parsed = new URL(seen);
  assert.equal(`${parsed.origin}${parsed.pathname}`, "https://search.example/looks");
  assert.equal(parsed.searchParams.get("query"), "hat straw");
  assert.equal(parsed.searchParams.get("type"), "hat");
  assert.equal(parsed.searchParams.get("priceMax"), "40");
  assert.equal(parsed.searchParams.get("teen"), null);
  assert.deepEqual(items.map((item) => item.id), ["straw", "wool"]);
  assert.equal(items[0].affiliate, true);
  assert.equal(items[0].source, "");
});

test("keeps an etsy source and shows the trademark notice only then", async () => {
  const demo = await runProductSearch({ query: "hat straw", type: "hat" });
  assert.ok(demo.length > 0);
  assert.equal(demo.every((item) => item.source === ""), true);
  assert.equal(showsEtsyNotice(demo), false);
  assert.equal(showsEtsyNotice([]), false);

  const items = await runProductSearch(
    { query: "hat straw", type: "hat" },
    {
      url: "https://search.example/etsy",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          items: [
            { id: "shop", title: "Straw hat", price: 22, url: "https://shop.example/straw", store: "Shop", type: "hat", tags: ["straw", "hat"] },
            { id: "etsy", title: "Straw sun hat", price: 28, url: "https://www.etsy.com/listing/1", store: "Etsy", type: "hat", source: "Etsy", tags: ["straw", "hat"] },
          ],
        }),
      }),
    },
  );
  assert.equal(items.find((item) => item.id === "etsy").source, "etsy");
  assert.equal(items.find((item) => item.id === "shop").source, "");
  assert.equal(showsEtsyNotice(items), true);
  assert.equal(showsEtsyNotice([{ source: "shop" }, { source: "" }]), false);
});

test("remote provider returns nothing until a URL is configured", async () => {
  const items = await remoteProductSearch.search({ query: "hat", type: "hat" });
  assert.deepEqual(items, []);
  const failed = await fetchRemoteProducts({ query: "hat" }, {
    url: "https://search.example/down",
    fetchImpl: async () => { throw new Error("offline"); },
  });
  assert.deepEqual(failed, []);
});

test("productSearch follows window.WCL_SEARCH_URL", () => {
  const previousWindow = globalThis.window;
  globalThis.window = { WCL_SEARCH_URL: "https://search.example/api" };
  try {
    assert.equal(configuredSearchUrl(), "https://search.example/api");
    assert.equal(productSearch.exampleData(), false);
    assert.equal(productSearch.id, "remote");
    assert.equal(productSearch.label, "Store search");
  } finally {
    globalThis.window = previousWindow;
  }
  assert.equal(productSearch.exampleData(), true);
  assert.equal(productSearch.label, "Example items");
});
