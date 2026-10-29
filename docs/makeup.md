# Makeup tab

The **Makeup** tab paints makeup on a practice model or on your own photo, on the phone. Nothing is uploaded; a saved look only leaves the device when you share it (same Share link / Fit or Miss flow as every look).

## How it works

- `js/makeup-looks.js` holds the layers, shades, and preset looks (plain data, tested in Node).
- `js/makeup-engine.js` is the painter. It takes the 478 MediaPipe Face Mesh points that `face-fit.js` already finds and builds each layer as a soft mask: anti-aliased polygons from the mesh (Catmull-Rom curves through the lip, lid, and brow points), feathered with a near-Gaussian blur. The blend keeps the photo's own light and shade (pigment hue from the shade, lightness from the skin), so pores, lip lines, and brow hairs show through.
  - Lips: kept inside the outer lip line (the hard edge caps the feather) and out of the mouth opening, with a teeth guard when the mouth is open. Matte flattens shine; satin and gloss add shine that follows the lip's broad highlights.
  - Eyes: lid and crease bands between the lash line and the brow, densest at the lashes; a smoky smudge under the lower lashes; nothing is painted on the eye itself.
  - Liner: thin, winged, or graphic, sitting on the upper lash line.
  - Brows and lashes: darken the hairs more than the skin between them.
  - Blush, bronzer/contour, highlighter, freckles, matte skin: clipped to the face oval, away from eyes, brows, and lips. Deeper skin gets a little more pigment, like a real application.
  - Hair from the bundled hair segmenter keeps makeup off bangs.
- `js/makeup-screen.js` is the tab. It can wear the Hair tab's pick: on a model it uses that model's finished portrait (recolored the same way as the Hair tab); on your photo it draws the fitted hair overlay on top, in the same 3:4 framing as the Hair stage. **Save** stores hair + makeup as one look.

## Presets (2026)

Looks: Natural / No-Makeup, Soft Glam, Clean Girl Glow, Bold Red Lip, Smoky Eye, Graphic Wing Liner, Latte Makeup, Douyin / Cherub Blush, Sunset Eyes, Glossy Berry Lip, Bronzed Summer, Editorial Pop of Color (sky-blue lid).
Groomed: Groomed Natural, Brow Tidy, Matte Skin, Sharp & Groomed (plus Bronzed Summer).

Trend sources, checked October 2026:
- Harper's Bazaar, 2026 makeup trends (cherub cheeks, statement liner, crimson lips, sky-blue shadow, pearlescent clean-girl skin): https://www.harpersbazaar.com/beauty/makeup/a70406540/2026-makeup-trends/
- Allure, fall 2026 (deep berry tint, lips only, soft smoky eye, bare skin): https://www.allure.com/story/fall-makeup-trends-2026
- Byrdie, summer 2026 (tight-lined eyes, candy colors): https://www.byrdie.com/summer-makeup-trends-2026-11963640
- Cosmetics Business, "bro brows" and men's grooming 2026: https://cosmeticsbusiness.com/bro-brows-are-trending-with-gen-z-men
- Vogue, undetectable men's makeup (matte, tinted moisturizer, brow gel): https://www.vogue.com/article/beginners-guide-mens-makeup-tips-tricks

## Custom pickers

Per layer: Off, shade swatches (9 lip incl. Tinted Balm, 6 blush, 8 eyeshadow plus a crease shade, 5 bronzer incl. Match me, 4 highlighter, 4 liner, 2 lash, 5 brow incl. Match me, 2 freckle), a style where it applies (Matte/Satin/Gloss; Thin/Winged/Graphic; Lid/Crease/Lid + crease/Smoky; Apples/Lifted/Cherub; Bronze/Contour), and an Intensity slider.

## Limits

- It is a 2D paint on the photo, labeled "Approximate preview" on your own photo. Strong side light, glasses, or hair over the face reduce accuracy.
- Faces turned far to the side, or very small in the frame, are not supported.
- On a phone each repaint takes roughly 0.1-0.5 s at 720x960.
