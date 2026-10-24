import assert from "node:assert/strict";
import test from "node:test";
import { buildWishlistRecord, firstChoice, wishlistToForm } from "../js/wishlist-model.js";

test("builds a private registry-ready wishlist item", () => {
  const record = buildWishlistRecord({
    name: "Peach sundress",
    category: "dress",
    store: "Neighborhood shop",
    price: "$48",
    sizeFirst: "M",
    colorFirst: "Sage",
    altSizes: "L, M",
    altColors: "Black / Ivory",
    fitNotes: "Runs small, size up",
    link: "https://shop.example/peach",
    nearbyStore: "Main St. boutique",
    address: "100 Main St, Austin, TX",
    nearbyNote: "Saw it in stock Oct 3",
    metal: "",
    lookId: "look_1",
  }, 1000);

  assert.equal(record.name, "Peach sundress");
  assert.equal(record.privacy, "private");
  assert.equal(record.sharing.mode, "private");
  assert.equal(record.sharing.showSizeBeforeClaim, false);
  assert.equal(record.priceAmount, 48);
  assert.equal(record.quantity, 1);
  assert.equal(record.lookId, "look_1");
  assert.equal(record.createdAt, 1000);

  assert.equal(record.variants.length, 4);
  assert.deepEqual(
    record.variants.map((variant) => [variant.role, variant.size, variant.color, variant.status]),
    [
      ["first", "M", "Sage", "available"],
      ["alternate", "L", "Sage", "available"],
      ["alternate", "M", "Black", "available"],
      ["alternate", "M", "Ivory", "available"],
    ],
  );
  assert.equal(firstChoice(record).size, "M");

  const online = record.places.find((place) => place.kind === "online");
  const nearby = record.places.find((place) => place.kind === "nearby");
  assert.equal(online.url, "https://shop.example/peach");
  assert.equal(online.store, "Neighborhood shop");
  assert.equal(nearby.store, "Main St. boutique");
  assert.match(nearby.mapsUrl, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.match(nearby.mapsUrl, /Austin/);
  assert.equal(record.jewelry, null);
});

test("keeps jewelry details and drops unsafe links", () => {
  const record = buildWishlistRecord({
    name: "Gold hoops",
    category: "jewelry",
    link: "javascript:alert(1)",
    metal: "Gold",
    finishStone: "Plain",
    jewelrySize: "Medium hoops",
    sizeFirst: "One size",
    colorFirst: "Gold",
  });

  assert.equal(record.places.find((place) => place.kind === "online"), undefined);
  assert.equal(record.places.some((place) => String(place.url || "").includes("javascript")), false);
  assert.deepEqual(record.jewelry, {
    metal: "Gold",
    finishStone: "Plain",
    sizeOrLength: "Medium hoops",
  });
});

test("round-trips form fields and preserves variant ids", () => {
  const original = buildWishlistRecord({
    id: "wish_1",
    createdAt: 50,
    name: "Interview blouse",
    price: "62.00",
    sizeFirst: "S",
    colorFirst: "Ivory",
    altSizes: "M",
    store: "Atelier",
    link: "https://example.com/blouse",
  }, 50);

  const form = wishlistToForm(original);
  assert.equal(form.name, "Interview blouse");
  assert.equal(form.sizeFirst, "S");
  assert.equal(form.altSizes, "M");
  assert.equal(form.link, "https://example.com/blouse");

  const again = buildWishlistRecord({ ...form, variants: original.variants, places: original.places }, 90);
  assert.equal(again.id, "wish_1");
  assert.equal(again.createdAt, 50);
  assert.equal(again.updatedAt, 90);
  assert.equal(again.variants[0].id, original.variants[0].id);
  assert.equal(again.variants[1].id, original.variants[1].id);
  assert.equal(again.places[0].id, original.places[0].id);
});

test("requires a name", () => {
  assert.throws(() => buildWishlistRecord({ name: "   " }), /name/i);
});
