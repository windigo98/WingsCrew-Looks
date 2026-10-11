# WingsCrew Looks

WingsCrew Looks is a fashion app by WingsCrew. You add photos of yourself, layer clothes, accessories, and jewelry on them, try a makeup preset, and save the result as a look. Pieces you own go in My Closet. Pieces you want go on a private wishlist with size, color, and where to buy them. When you can't decide, you export the image and cast a **Fit or Miss?** vote (heart, meh, or no).

This repository is the first working prototype: a mobile-first static site. It is meant to run on GitHub Pages from the `main` branch, at the repository root.

**GitHub Pages:** [https://windigo98.github.io/Wingscrew-Looks/](https://windigo98.github.io/Wingscrew-Looks/)

"Fit or Miss?" is the vote question, not the app name.

## Run it

The site is plain HTML, CSS, and JavaScript. It uses ES modules, so open it through a local server (not as a `file://` URL).

```bash
python3 -m http.server 4173
```

Then visit `http://127.0.0.1:4173`.

On a phone, use the same Wi-Fi and open `http://<your-computer>:4173`. Add to Home Screen from Safari if you want it full screen. Photos stay in this browser's storage (IndexedDB).

Wishlist shape checks (no browser needed):

```bash
node --test tests/wishlist.test.js
```

## What's real, and what's a demo

| Piece | In this prototype | Later |
|---|---|---|
| Photos | Real camera or upload. Stored only on the device. One tap deletes them, with undo. | Accounts, encrypted storage, deletion from AI providers |
| Dressing a look | Real drag, pinch, rotate, flip, delete, and layer order. Sample art plus your images. | AI try-on (FASHN, Google Virtual Try-On, or similar) that redraws the garment on the body |
| Makeup | Real preset overlays: Natural, Glam, Bold lip, Smoky eye. Drag them onto the face. | A makeup model (Perfect Corp, a guided image edit, or MediaPipe landmarks) |
| Background lift | Real, on-device, for a plain light backdrop. It will damage white clothing, so it is off unless you turn it on. | A proper matte model such as `@imgly/background-removal` |
| Looks, closet, wishlist, votes | Real, on this device | Shared invites, live votes, live registry |
| "AI preview" badge | Burned into every exported image, and shown on the studio | Keep it. The AI label does not come off. |

Nothing here calls a paid API or needs a secret.

## Provider interface

Screens talk to four providers in [`js/providers.js`](js/providers.js). Swap the object on `providers` and leave the pages alone.

- `providers.avatar.createBases({ blob, label })` → resized photo bases. A later Gemini (or similar) pose edit can return extra poses from the front photo.
- `providers.tryOn.render(scene)` → the final JPEG, already badged. `paint` is the local layer editor. A hosted try-on (FASHN Try-On or Google Virtual Try-On) should return one generated image from the person photo plus the garment photo.
- `providers.makeup.apply({ presetId, slot })` → overlay instructions (`mode: "overlay"`). A hosted makeup provider can return `{ mode: "generate", blob }` instead.
- `providers.background.remove(blob, { strength })` → a PNG with a light backdrop lifted, or the original if it can't see a plain background.

Local ids: `local-photo`, `local-composite`, `local-preset-overlay`, `local-light-matte`.

The wishlist record in [`js/wishlist-model.js`](js/wishlist-model.js) is shaped for a later shared registry: `variants[]` with `status` (`available`, later `claimed` / `purchased`) and `claim`, `places[]` of `online` or `nearby` (with an Open in Maps link), jewelry fields, and `sharing.mode: "private"`.

## Next phase: backend

In-app invites, real-time votes, and a live shared registry need a backend. The product plan points at [Supabase](https://supabase.com) (auth, private file storage, and Realtime for claim / purchased badges). Until that exists:

- votes are stored on this device only
- the wishlist cannot be shared
- photos never leave the phone

## GitHub Pages

The site is ready to serve from the repository root on branch `main`: `index.html`, assets, and a [`.nojekyll`](.nojekyll) file so Jekyll does not rewrite the folder.

If Pages is not turned on yet: GitHub → **windigo98/Wingscrew-Looks** → **Settings** → **Pages** → **Build and deployment** → **Source: Deploy from a branch** → **Branch: `main`**, folder **`/ (root)`** → **Save**. The site address is `https://windigo98.github.io/Wingscrew-Looks/`. The first deploy can take a minute.

## License

Copyright (c) 2026 WingsCrew (windigo98). All rights reserved.

The source is view-only. See [LICENSE](LICENSE). No permission is granted to copy, modify, distribute, or reuse the code, art, names, or content without written permission. Contact [dovewingsbusiness@gmail.com](mailto:dovewingsbusiness@gmail.com).
