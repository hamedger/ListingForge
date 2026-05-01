# Photo Editor UX Spec (Pixelcut-Parity)

This defines what users should see after backend processing to match Pixelcut-level expectations and keep ListForge differentiation.

## Primary actions (top bar)

- Compare (before/after toggle/slider)
- Save
- Apply to all photos
- Reset edits

## Quick actions (one-tap chips)

- Auto Fix
- Remove BG
- Relight
- Upscale 2x
- Upscale 4x
- Style: Studio White / Gray / Showroom / Outdoor / Original

## Full tool panels

### 1) Background
- Remove background toggle
- Style selector:
  - Original
  - Studio White
  - Studio Gray
  - Showroom
  - Outdoor Soft
  - Blur Subtle
- Edge quality slider (soft/hard edge)
- Contact shadow intensity

### 2) Retouch (core parity)
- Exposure
- Contrast
- Highlights
- Shadows
- Whites
- Blacks
- Temperature
- Tint
- Saturation
- Vibrance
- Clarity
- Sharpen
- Denoise

### 3) AI tools
- Magic Eraser (brush + object remove)
- Relight preset:
  - Soft studio
  - Neutral daylight
  - Premium gloss
- AI background generation prompt (optional in v2)

### 4) Upscale
- Scale: 2x / 4x
- Output format: JPG / PNG / WEBP
- Marketplace export profile:
  - Facebook
  - Craigslist
  - eBay

### 5) Batch
- Apply current settings to all listing photos
- Keep consistency mode on/off
- Per-photo status and retry

## Metadata surfaced to user

- Background removed: yes/no
- Style applied
- Provider used
- Processing time
- Quality delta (before -> after score)

## ListForge edge controls (in same screen)

- Listing readiness score
- Missing required shot checklist
- Recommended hero photo
- Next step CTA:
  - Generate title/description
  - Pricing strategy
  - Export to marketplace

