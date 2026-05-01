# ListForge AUTO Photo Enhance Backend (Render) — Step by Step

Use this guide to implement production-grade AUTO image enhancement with background removal and selectable background styles.

---

## 1) Architecture (recommended)

- Mobile app uploads captured image to your Render API.
- Render API performs:
  - subject segmentation (vehicle mask),
  - background removal/replacement,
  - enhancement pass (denoise, exposure, contrast, sharpen).
- API returns optimized image URL + metadata.
- App stores both original and optimized URIs and shows side-by-side proof.

---

## 2) Decide enhancement providers

Pick one to start fast:

- **Option A (fastest):** third-party API (remove.bg) for segmentation.
- **Option B (more control):** self-host Python worker on Render using segmentation model (U2Net/MODNet/SAM pipeline).

Recommended rollout:

1. Start with Option A for speed to market.
2. Migrate to Option B for cost/control as usage grows.

### Option A concrete choice: remove.bg

- API docs: [https://www.remove.bg/api](https://www.remove.bg/api)
- Keep `remove.bg` key in Render secret env only.
- Do not call remove.bg directly from mobile app.
- Mobile app calls your Render API, Render calls remove.bg.

---

## 3) Create Render services

Create two Render services:

1. `listforge-enhance-api` (Node/TypeScript REST API)
2. `listforge-enhance-worker` (Python worker, optional if self-hosting model)

Environment variables (API service):

- `ENHANCE_PROVIDER` (`remove_bg` or `internal`)
- `REMOVE_BG_API_KEY`
- `REMOVE_BG_API_BASE_URL=https://api.remove.bg/v1.0`
- `SIGNED_URL_SECRET`
- `MAX_IMAGE_MB=12`
- `REQUEST_TIMEOUT_MS=12000`

---

## 4) API contract (mobile -> backend)

### POST `/v1/photo/enhance`

Request body:

```json
{
  "imageBase64": "<base64-jpeg>",
  "mode": "auto",
  "stepId": "front_3_4",
  "backgroundStyle": "studio_white",
  "enhanceLevel": "pro"
}
```

`backgroundStyle` allowed values (suggested):

- `original` (no replacement)
- `studio_white`
- `studio_gray`
- `showroom`
- `outdoor_soft`
- `blur_subtle`

Response body:

```json
{
  "optimizedImageBase64": "<base64-jpeg>",
  "backgroundRemoved": true,
  "backgroundStyleApplied": "studio_white",
  "quality": {
    "exposure": 0.82,
    "sharpness": 0.76,
    "noise": 0.21
  },
  "provider": "internal",
  "latencyMs": 1840
}
```

---

## 5) Background style behavior

Implement rule mapping by AUTO shot type:

- Exterior (`front_3_4`, `side`, `rear_3_4`):
  - default `studio_white`
  - allow user override.
- Interior (`interior_front`, `dashboard`):
  - force `original` (no background replace), only enhancement.
- Odometer:
  - force `original`, prioritize readability and glare reduction.

This keeps output realistic and avoids fake-looking interiors.

---

## 6) Backend processing pipeline

For each request:

1. Validate payload + size limit.
2. Decode image, normalize orientation.
3. If provider is `remove_bg`, send image to remove.bg API and get transparent foreground output.
4. Refine mask (edge smoothing, hole fill).
5. Composite foreground over selected background style.
6. Enhancement pass:
   - denoise,
   - auto exposure/white-balance normalization,
   - local contrast,
   - gentle sharpening.
7. Encode JPEG/WebP and return base64 or signed URL.

---

## 7) Security and reliability

- Require app auth token/JWT on API.
- Apply rate limits (per user + per IP).
- Redact VIN/PII from logs.
- Keep provider keys server-side only.
- Add allowlist validation for requested `backgroundStyle`.
- Add timeout + fallback:
  - if pro enhance fails, return `backgroundRemoved=false` and a standard-enhanced image.

### remove.bg endpoint notes

- Use remove.bg endpoint for background removal first.
- Then apply your own background style composition on Render.
- Keep a provider adapter layer so you can swap providers later without changing mobile contract.

---

## 8) App integration notes

In ListForge app:

1. Add API client `src/api/photoEnhance.ts`.
2. Update `enhanceListingImage(...)`:
   - AUTO + online => call backend pro enhance.
   - other modes/offline => local enhancement fallback.
3. Save enhancement metadata with each photo:
   - `backgroundRemoved`,
   - `backgroundStyleApplied`,
   - `provider`.
4. In result screen:
   - show side-by-side before/optimized,
   - show badge `AI Background Cleaned` when true.

---

## 9) Suggested UI for selectable backgrounds

Add on AUTO capture screen:

- Button: `Background: Studio White` (tap to open sheet)
- Sheet options:
  - Original
  - Studio White
  - Studio Gray
  - Showroom
  - Outdoor Soft
  - Subtle Blur

Persist selected style in session state and pass to API.

---

## 10) Testing checklist

- Exterior photo + each background style returns valid composite.
- Interior/odometer ignore replacement style and keep original background.
- Low-light input improves exposure without clipping highlights.
- API timeout triggers fallback and app still completes listing.
- Result screen always shows before/optimized pair.

---

## 11) Cost/performance guidance

- Start with max output width ~1800px for speed/cost.
- Track remove.bg request count/cost per listing to protect margin.
- Cache by image hash + style for repeated retries.
- Track p50/p95 latency and provider failure rate.
- Consider queue/async mode only for future heavy 3D features.

