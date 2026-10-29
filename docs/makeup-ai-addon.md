# Paid AI makeup add-on: research (not built)

Checked October 26, 2026. Prices change; re-check before launch. Nothing here is wired into the app.

## Options

| Option | Cost per selfie edit | Quality for makeup | Privacy / retention | Server? |
|---|---|---|---|---|
| xAI `grok-imagine-image` (POST /v1/images/edits) | $0.002 input + $0.02 output = **$0.022** | Generative: photo-real makeup, but it redraws the image, so identity, skin detail, hair, or background can drift. Needs a strict "only apply makeup, keep everything else" prompt and a face check. | Default: requests and responses kept 30 days for abuse audit, not used for training. **ZDR** (team-wide, self-serve) keeps nothing on disk; outputs must come back as base64 or to your own upload URL. | Yes: key must stay server-side (Cloudflare Worker). |
| xAI `grok-imagine-image-2.0` | $0.01 input + $0.04 output (1K low) = **$0.05**; up to $0.09 at 2K medium | Better detail and instruction-following than base; same drift caveats. | Same as above. | Yes |
| xAI `grok-imagine-image-quality` | $0.01 + $0.05 = **$0.06** (1K) | Highest xAI quality. | Same. | Yes |
| Perfect Corp / YouCam "AI Makeup Virtual Try-On" | 1 unit per success. Units ~**$0.048-0.09** each (e.g. 100 units $8.99/mo, 200 $14.99/mo, 500 $24/mo or $27.50 pay-as-you-go) | Purpose-built: keeps the real face, 13 makeup categories, product-accurate color and finish, light balancing. Most faithful try-on. Async (poll a task). | Terms: Client Data and output generally kept **30 days** (marketing page says 24 h; the API terms and docs say 30 days, so assume 30). Not used to improve the service without consent. Adults only. You must collect consent for facial geometry processing. Terms 8.6(s) forbid creating "any effect similar to the effects" of the service, which may conflict with our own free makeup engine: get this cleared in writing first. | Yes |
| AILabTools | Full "AI Makeup" API is **retired**. Remaining single-feature APIs: Lips Color Changer ~$0.0054, AI Eyeshadow Try-On ~$0.0405, Face Beauty (skin) ~$0.0135-0.03 | Piecemeal; no full looks. Not a fit. | Uploads processed in memory and deleted; URL results kept 24 h; base64 results not stored; not used for training. | Yes |
| Google Gemini 3.1 Flash Lite Image (Nano Banana 2 Lite) | ~**$0.034** per 1K image (+ tiny input) | Generative editor, good at faithful edits; same drift caveats. | Paid tier: not used to improve products; kept up to 55 days for abuse monitoring. | Yes |
| OpenAI GPT Image 2.5 (/v1/images/edits) | Token-priced ($30/M image output tokens); third-party estimates ~$0.006 low, ~$0.013 medium, ~$0.05 high at 1024px | Strong editor; same drift caveats. | 30-day abuse retention by default; ZDR only for approved customers. | Yes |
| FLUX.1 Kontext [pro] (fal.ai / Replicate) | **$0.04** | Good local edits that keep identity. | Depends on host; check each host's retention. | Yes |

Cloudflare Worker: free plan 100k requests/day with a 10 ms CPU limit per request (tight for parsing a base64 selfie); the $5/month paid plan has 10 M requests and 30 M CPU-ms included. The Worker holds the key, checks the user's token balance, strips EXIF, sends the selfie, and returns the image. It stores nothing.

## Recommendation

1. Keep the free on-device makeup as the default. It is instant, private, and costs nothing.
2. Add an optional paid add-on for adults, off in Teen mode. Call it something like "AI Glam" or "Photo-real makeup". Don't put "Grok" or "Try-On" in the name; caption results "Created with Grok".
3. Use xAI `grok-imagine-image` for standard previews ($0.022) and `grok-imagine-image-2.0` for HD ($0.05), through a Cloudflare Worker on the $5 plan. Turn on ZDR before any selfie is sent and return base64 only. Send a hashed `safety_identifier`. Prepay the xAI credits.
4. Look at Perfect Corp only if you want exact product-shade try-on later, after their 30-day retention and the 8.6(s) "similar effects" clause are cleared in writing.
5. Run every result through the on-device face mesh. If the face moved or changed shape, refund the token automatically.

## Token pricing

Stripe takes 2.9% + $0.30 per sale (https://stripe.com/pricing), so very small packs lose a big share to fees.

| Pack | Stripe fee | You keep | Kept per token | Margin, 1 token = standard ($0.022) | Margin, 2 tokens = HD ($0.05) |
|---|---|---|---|---|---|
| 40 for $2.99 | $0.39 (12.9%) | $2.60 | $0.065 | 66% | 62% |
| 75 for $4.99 | $0.44 (8.9%) | $4.55 | $0.061 | 64% | 59% |
| 175 for $9.99 | $0.59 (5.9%) | $9.40 | $0.054 | 59% | 53% |
| (for contrast) 10 for $0.99 | $0.33 (33%) | $0.66 | $0.066 | — | — |

The plan works at 1 token for a standard preview and 2 for HD. Suggestions:
- Don't sell anything under $2.99. Making $4.99 the entry pack is better still: the fee drops to 9%.
- Add a bigger pack (about 400 for $19.99: fee 4.4%, $0.048 kept per token, 54% margin on standard) for heavy users.
- Give 3 free AI previews once per account (about $0.07 of cost) instead of a micro-pack.
- Keep about 15% of the margin to cover moderation failures, automatic retries, and $15 Stripe dispute fees.
- If you switch the engine to Perfect Corp (about $0.05-0.09 per image), charge 2 tokens for every preview.

## Sources

- xAI pricing (Imagine image edit input + output prices): https://docs.x.ai/developers/pricing
- xAI grok-imagine-image-2.0 model page: https://docs.x.ai/developers/models/grok-imagine-image-2.0
- xAI image editing / POST /v1/images/edits: https://docs.x.ai/developers/model-capabilities/images/editing
- xAI security FAQ (30-day retention, ZDR, base64 outputs under ZDR, safety_identifier): https://docs.x.ai/developers/faq/security
- Perfect Corp makeup VTO unit consumption: https://docs.perfectcorp.com/reference/makeup_vto/section/overview/unit-consumption
- Perfect Corp file retention (30 days): https://docs.perfectcorp.com/develop/file_retention_period
- Perfect Corp API terms (units, plan prices, 30-day retention, adults only, 8.6(s)): https://www.perfectcorp.com/perfectbeauty/youcam/terms-of-service-api
- Perfect Corp API catalog ("deleted in 24 hours" marketing line): https://yce.makeupar.com/ai-api
- YouCam API plan prices (third-party snapshot, Sep 2026): https://www.itechguides.com/products/youcam-ai-virtual-try-on-apis/pricing/
- AILabTools AI Makeup API (retirement notice): https://www.ailabtools.com/docs/ai-portrait/effects/face-makeup/api
- AILabTools per-API prices: https://www.ailabtools.com/ai-portrait-apis
- AILabTools file storage policy: https://www.ailabtools.com/docs/file-storage-policy
- Gemini API pricing (Nano Banana 2 Lite): https://ai.google.dev/gemini-api/docs/pricing
- Gemini API terms / abuse monitoring retention: https://ai.google.dev/gemini-api/terms
- OpenAI image generation guide (GPT Image 2.5 token rates): https://developers.openai.com/api/docs/guides/image-generation
- GPT Image 2.5 per-image estimates (third-party): https://cellcog.ai/blog/gpt-image-2-5-release-date/
- FLUX.1 Kontext [pro] on fal: https://fal.ai/models/fal-ai/flux-pro/kontext
- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Stripe pricing: https://stripe.com/pricing
