# WingsCrew Looks

WingsCrew Looks is a fashion app by WingsCrew. You add photos of yourself, layer clothes, accessories, and jewelry on them, try a makeup preset or a hairstyle, and save the result as a look. Pieces you own go in My Closet. Pieces you want go on a private wishlist with size, color, and where to buy them. When you can't decide, you export the image and cast a **Fit or Miss?** vote (heart, meh, or no).

This repository is the first working prototype: a mobile-first static site. It is meant to run on GitHub Pages from the `main` branch, at the repository root.

**GitHub Pages:** [https://windigo98.github.io/WingsCrew-Looks/](https://windigo98.github.io/WingsCrew-Looks/)

Styles, scripts, and images use relative paths (`css/`, `js/`, `assets/`), so the site loads correctly under that project path.

"Fit or Miss?" is the vote question, not the app name.

## Run it

The site is plain HTML, CSS, and JavaScript. It uses ES modules, so open it through a local server (not as a `file://` URL).

```bash
python3 -m http.server 4173
```

Then visit `http://127.0.0.1:4173`.

On a phone, use the same Wi-Fi and open `http://<your-computer>:4173`. Add to Home Screen from Safari if you want it full screen. Photos stay in this browser's storage (IndexedDB).

Unit checks (no browser needed):

```bash
npm test            # same as: node --test tests/*.test.js
```

Third-party code: `assets/vendor/mediapipe/` is Google's MediaPipe Tasks Vision 1.1.1 (Apache License 2.0, see the `LICENSE` and `README.md` in that folder). It runs on the device; the app never calls a face API.

## What's real, and what's a demo

| Piece | In this prototype | Later |
|---|---|---|
| Photos | Real camera or upload. Stored only on the device. One tap deletes them, with undo. | Accounts, encrypted storage, deletion from AI providers |
| Dressing a look | Real drag, pinch, rotate, flip, delete, and layer order. Sample art plus your images. | AI try-on (FASHN, Google Virtual Try-On, or similar) that redraws the garment on the body |
| Makeup | Real preset overlays: Natural, Glam, Bold lip, Smoky eye. Drag them onto the face. | A makeup model (Perfect Corp, a guided image edit, or MediaPipe landmarks) |
| Hair | Photo-real 2026 salon styles under **Women** and **Men** tabs, grouped Short, Medium, Long, Updos, and Textured. Women (16): Sleek Chin Bob, Italian Lob, Butterfly Cut, Long Layers, Bouncy Blowout, Beach Waves, Silk Press, Defined Curls, Knotless Braids, Sleek High Ponytail, High Bun / Chignon, Textured Pixie, Wolf Cut, Natural Afro, Shoulder Locs, Wispy Bangs Shag. Men (14): Low Taper + Textured Crop, Buzz Cut, Classic Side Part, Comma Hair, Two-Block, Soft Wolf Cut, Modern Mullet, Flow (Swept Back), High-Top Fade, 360 Waves, Curly Top + Taper, Two-Strand Twists, Stitch Braids, Shoulder Locs. Six colors (Black, Espresso, Light Brown, Blonde, Auburn, Pink). **Pick a model** shows finished portraits: each made-up model (AI-made, fictional, not real people) wearing every cut from their set, made ahead of time in a neutral medium brown and stored as small WebPs (`assets/looks/<model>/<style>.webp`, 720x960, about 25–65 KB, loaded only when viewed and cached by the service worker as you go). Color is applied on the phone: the bundled MediaPipe hair segmenter finds the hair once per portrait, then a luminance-preserving gradient map repaints it, so strands keep their light and shade. Portraits exist so far for the Oval and Round women and the Oval and Square men (60 of the planned 180); the other eight models stay out of the picker until theirs are made. **Your own photo** gets an approximate overlay, labeled "Approximate preview": the bundled MediaPipe Face Landmarker (no network) finds the face, the hair is sized from hairline to chin, and the cutout is warped so its inner edge follows your head outline from the face mesh (temples and forehead raised to the hairline), with the hair above the head thinned as a rounded dome rather than pressed flat. **Fit to face** re-runs it; a Hairline slider, Width/Height, and Push hair back / Push bangs back fine-tune it. If no face is found, the hair goes in the middle with a hint. Saved looks use the same share link and Fit or Miss vote. Nothing is uploaded until you share. | More styles |
| Background lift | Real, on-device, for a plain light backdrop. It will damage white clothing, so it is off unless you turn it on. | A proper matte model such as `@imgly/background-removal` |
| Looks, closet, wishlist, votes | Real, on this device. **Share link** publishes a Fit or Miss page. Until Supabase is connected it is a demo that only opens on this phone. | Live links on other phones. See [docs/supabase-setup.md](docs/supabase-setup.md) |
| "AI preview" badge | Burned into dressed images, and shown on the studio. Hair saves are drawings, so they do not get that badge. | Keep it on dressed images. The AI label does not come off those. |
| Age and Teen mode | Birthday on first run. Under 13 is refused and not stored. Ages 13–17 get Teen mode: invite-only friends, private looks, video export off until they turn it on, no adult or sponsored-adult packs, optional parent link that shows the friends list only. | Accounts, delivery of invites to another phone, and phone-contact matching (that last one comes with the native app; the web uses invite links) |

Nothing here calls a paid API. The only optional key is the public Supabase anon key, and the app runs without it.

## Provider interface

Screens talk to four providers in [`js/providers.js`](js/providers.js). Swap the object on `providers` and leave the pages alone.

- `providers.avatar.createBases({ blob, label })` → resized photo bases. A later Gemini (or similar) pose edit can return extra poses from the front photo.
- `providers.tryOn.render(scene)` → the final JPEG, already badged. `paint` is the local layer editor. A hosted try-on (FASHN Try-On or Google Virtual Try-On) should return one generated image from the person photo plus the garment photo.
- `providers.makeup.apply({ presetId, slot })` → overlay instructions (`mode: "overlay"`). A hosted makeup provider can return `{ mode: "generate", blob }` instead.
- `providers.background.remove(blob, { strength })` → a PNG with a light backdrop lifted, or the original if it can't see a plain background.
- `providers.circle` → Teen mode friend circle. `createInvite`, `acceptInvite`, `approveFriend`, `blockFriend`, `reportFriend`, `createParentLink`, and `parentSnapshot`. `parentSnapshot` returns names and status only.
- `providers.shareLinks` → `publish(look)`, `get(token)`, `vote(token, choice, deviceId)`, `counts(token)`, and `revoke(token)`. A demo stores the link on this phone. Set `window.WCL_SUPABASE_URL` and `window.WCL_SUPABASE_ANON_KEY` to use Supabase. Steps are in [docs/supabase-setup.md](docs/supabase-setup.md). Teen mode does not get a public link.

Local ids: `local-photo`, `local-composite`, `local-preset-overlay`, `local-light-matte`, `local-invite-link`.

## Teen mode

The first run asks for a birthday.

- Under 13 sees a short refusal. No account is created and the birthday is not stored.
- Ages 13 to 17 are in Teen mode. Sharing is an invite link the teen sends from their own phone (the system share sheet, or a copied link). The friend accepts and the teen approves them by name. The friends list can remove, block, or report. There is no public profile, no search, and no votes or messages from anyone who is not approved. Looks are private. TikTok and video export stay off until the teen turns them on. An optional parent link shows the approved-friends list only, not the looks.
- 18 and up get the normal mode. A device that already finished the older 18+ check stays in normal mode.

True phone-contact matching comes with the native app. This web prototype uses invite links only, stored on the device, behind `providers.circle`.

The wishlist record in [`js/wishlist-model.js`](js/wishlist-model.js) is shaped for a later shared registry: `variants[]` with `status` (`available`, later `claimed` / `purchased`) and `claim`, `places[]` of `online` or `nearby` (with an Open in Maps link), jewelry fields, and `sharing.mode: "private"`.

## Next phase: backend

In-app friend invites and a live shared registry still need more backend work. Share links are ready behind `providers.shareLinks`. Until the Supabase URL and anon key are filled in ([setup steps](docs/supabase-setup.md)):

- a share link only opens on the phone that created it
- heart, meh, and no votes stay on this device
- the wishlist cannot be shared
- photos stay on the phone

A live link uploads that one look image and lets each phone vote Fit or Miss once. The owner sees the counts and can stop the link. Ages 13 to 17 still have no public link.

## GitHub Pages

The site is ready to serve from the repository root on branch `main`: `index.html`, assets, and a [`.nojekyll`](.nojekyll) file so Jekyll does not rewrite the folder.

If Pages is not turned on yet: GitHub → **windigo98/WingsCrew-Looks** → **Settings** → **Pages** → **Build and deployment** → **Source: Deploy from a branch** → **Branch: `main`**, folder **`/ (root)`** → **Save**. The site address is `https://windigo98.github.io/WingsCrew-Looks/`. The first deploy can take a minute.

## License

Copyright (c) 2026 WingsCrew (windigo98). All rights reserved.

The source is view-only. See [LICENSE](LICENSE). No permission is granted to copy, modify, distribute, or reuse the code, art, names, or content without written permission. Contact [wingscrew-looks@wingscrew.com](mailto:wingscrew-looks@wingscrew.com).
