# ListForge Photo Quality Roadmap (Pixelcut Parity + Listing Edge)

Goal: match top photo-editing expectations for marketplace sellers, then win on listing workflow (pricing + copy + readiness).

## 1) Pixelcut-style parity targets

Core parity features to implement in ListForge photo pipeline:

1. Background removal quality (hair/chrome/glass edges)
2. Object removal (magic eraser/inpainting)
3. Relighting and natural contact shadows
4. Upscaling/super-resolution (2x and 4x)
5. Color tuning presets (clean, vivid, luxury, neutral)
6. Batch editing with consistent style across all listing photos
7. One-tap retouch (exposure, WB, denoise, sharpen)
8. AI background generation (studio/showroom/outdoor prompt-based)
9. Reflection/ground shadow realism after cutout
10. Marketplace export presets (size/crop/profile)

## 2) ListForge differentiation layer (must keep)

These are your durable moat features:

1. Guided capture by shot type (front/rear/side/interior/odometer)
2. Quality gate and retake prompts during capture
3. Photo + pricing + description generated in one flow
4. Listing readiness score and missing-items checklist
5. Marketplace handoff package (images + title + description + price strategy)

## 3) Implementation phases

### Phase A (2 weeks): "Looks clearly better"

- Upgrade backend enhancement stack:
  - robust tone mapping (highlight recovery, shadow lift),
  - edge-aware sharpening,
  - color cast neutralization,
  - stronger relight and contact shadow for exterior shots.
- Add `enhanceLevel` presets:
  - `standard`, `pro`, `wow`, `luxury`.
- Add per-photo diagnostics in API response:
  - `quality.before`, `quality.after`, `improvements[]`.

Acceptance:
- Side-by-side shows obvious difference on low-light and mixed-light samples.
- At least 80% of test photos rate as "noticeably improved".

### Phase B (2-3 weeks): Pixelcut parity core tools

- Add Magic Eraser endpoint:
  - `POST /v1/photo/erase` with mask/prompt.
- Add upscaler endpoint:
  - `POST /v1/photo/upscale` (`2x|4x`).
- Add relight/background generation endpoint:
  - `POST /v1/photo/style` with preset/prompt.
- Add batch processing API with job IDs and per-item status.

Acceptance:
- Batch of 20 photos completes with progress and retry support.
- Object removal, upscale, and relight are available from app UI.

### Phase C (2 weeks): Listing-native polish

- Add listing-consistency mode:
  - apply same style profile across all listing images.
- Add marketplace presets:
  - Facebook, Craigslist, eBay image sizes and compression profiles.
- Add result proof:
  - before/after slider,
  - "AI actions applied" tags.

Acceptance:
- Seller can produce a complete listing media set in one pass.
- Visual consistency across exterior set scores above threshold.

## 4) Recommended technical stack

Use a hybrid architecture:

- Current: remove.bg (keep for speed)
- Add:
  - Sharp + OpenCV post-processing for deterministic quality,
  - optional ML worker (Python) for inpainting and relighting models.
- Provider adapter interface:
  - `remove_bg`, `internal_cv`, `internal_ml`.

## 5) API additions

Add endpoints:

- `POST /v1/photo/enhance` (existing; expand response metrics)
- `POST /v1/photo/enhance/batch` (existing; add async job mode)
- `POST /v1/photo/erase` (new)
- `POST /v1/photo/upscale` (new)
- `POST /v1/photo/style` (new)
- `GET /v1/photo/jobs/:id` (new)

## 6) UI additions

1. Edit panel after capture:
   - Erase,
   - Relight,
   - Upscale,
   - Style preset.
2. Batch action bar:
   - Apply to all photos.
3. Compare view:
   - before/after slider + quality delta.

## 7) Metrics to prove quality improvement

- Background failure rate (edge artifacts)
- % photos needing manual retake
- Mean user rating of enhancement (1-5)
- Listing publish conversion
- Time-to-ready-listing

## 8) Next implementation slice

Start with these three engineering tasks:

1. Add `luxury` preset and quality delta metrics in `/v1/photo/enhance`.
2. Build `POST /v1/photo/upscale` (2x, 4x).
3. Add app compare slider and "apply style to all" in batch flow.

