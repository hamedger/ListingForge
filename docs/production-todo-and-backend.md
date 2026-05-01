# ListForge — Production checklist & KBB/Edmunds backend guide

Use this as the master **production** backlog and as the **step-by-step** path to ship real market-backed auto pricing.

---

## Part A — Production todo list

### Security & compliance

- [ ] **No third-party API keys in the mobile app** — only `EXPO_PUBLIC_*` URLs pointing at *your* backend.
- [ ] **Secrets in env** (Vercel/Fly/AWS Secrets Manager): KBB credentials, Edmunds credentials, comp provider keys.
- [ ] **Review KBB/Edmunds terms** for consumer-app display, caching limits, and attribution.
- [ ] **PII minimization** — log request IDs, not full VINs in client logs if avoidable.

### Backend (pricing service)

- [ ] **Single normalized endpoint** e.g. `POST /api/pricing/auto` (see Part B).
- [ ] **Provider adapters** — one module per source (KBB, Edmunds, market comps).
- [ ] **Aggregation** — weighted merge → `fastSell` / `fairMarket` / `premiumAsk`.
- [ ] **Confidence score** — based on sources available + sample size + model match quality.
- [ ] **Caching** — Redis or similar keyed by `(year, make, model, trim, condition, region)`; TTL 30–120 min.
- [ ] **Rate limiting** — per IP + per API key; backoff/retries with jitter.
- [ ] **Observability** — structured logs, metrics (latency, error rate, cache hit rate).

### Mobile app

- [ ] **Env**: `EXPO_PUBLIC_KBB_API_URL`, `EXPO_PUBLIC_EDMUNDS_API_URL`, `EXPO_PUBLIC_MARKET_COMPS_API_URL` → your backend routes (not raw KBB/Edmunds URLs).
- [ ] **Pricing Health** screen — verify providers before launch (`/pricing-health`).
- [ ] **Result screen** — show source + confidence; clear fallback when offline.
- [ ] **EAS / production builds** — env injected per environment (staging vs prod).

### Data quality

- [ ] **VIN decode** — already using NHTSA; validate trim mapping for pricing APIs.
- [ ] **Region** — pass ZIP or metro when backend supports it (improves comps).
- [ ] **Mileage** — optional user input later (many APIs need odometer).

### Launch readiness

- [ ] **Staging** end-to-end test with real backend + mock providers first.
- [ ] **Load test** pricing endpoint under expected QPS.
- [ ] **Rollback plan** — feature flag to fall back to heuristic-only pricing.

---

## Part B — Backend for KBB & Edmunds (step by step)

### Step 1 — Choose stack and host

Pick one:

- **Node** on Fly.io / Railway / AWS Lambda + API Gateway  
- **Node** on Vercel Edge (if latency/cold-start acceptable)

Create repo: `listforge-pricing-api` (or monorepo `apps/pricing-api`).

### Step 2 — Obtain commercial API access

1. **KBB** — apply for developer / partner API access; get docs, sandbox keys, production keys.
2. **Edmunds** — same process (product names vary; confirm current offering).
3. Store keys only server-side: `KBB_API_KEY`, `EDMUNDS_API_KEY` (example names).

Until contracts are signed, implement **mock responses** that match the contract in `docs/market-pricing-integration.md`.

### Step 3 — Define your public API contract (what the app calls)

Implement:

`POST /pricing/auto`

**Request body (example):**

```json
{
  "year": "2020",
  "make": "Toyota",
  "model": "Camry",
  "trim": "SE",
  "vin": "1HGBH41JXMN109186",
  "condition": "good",
  "zipCode": "94102"
}
```

**Response body (example):**

```json
{
  "fastSell": 19800,
  "fairMarket": 21400,
  "premiumAsk": 23100,
  "confidence": 0.86,
  "sources": ["KBB", "Edmunds", "Market comps"],
  "rationale": "Aggregated from KBB and Edmunds, adjusted for condition.",
  "quotes": [
    { "source": "kbb", "low": 19500, "mid": 21200, "high": 22900, "sampleSize": 32 },
    { "source": "edmunds", "low": 20100, "mid": 21700, "high": 23400, "sampleSize": 26 }
  ],
  "fetchedAt": "2026-04-20T12:00:00.000Z"
}
```

Map provider-specific fields → `low` / `mid` / `high` in each `quotes[]` entry.

### Step 4 — Implement provider clients (server-only)

1. Create `lib/kbb.ts` — `getQuote(input)` → `{ low, mid, high, sampleSize? }`.
2. Create `lib/edmunds.ts` — same shape.
3. Create `lib/marketComps.ts` — optional third source.
4. Use **timeouts** (e.g. 3–5s per provider) and `Promise.allSettled` so one failure does not kill the whole response.

### Step 5 — Aggregation logic

1. Collect successful quotes.
2. If none: return **structured error** or fallback band (document that mobile shows “estimate”).
3. If some: compute weighted averages (example weights: KBB 0.4, Edmunds 0.4, comps 0.2).
4. Map:
   - `fastSell` = weighted **low**
   - `fairMarket` = weighted **mid**
   - `premiumAsk` = weighted **high**

### Step 6 — Confidence score (server)

Start ~0.35, add points for each live source, sample size, trim match; clamp 0–0.95. Return in JSON so the app can show “78% confidence”.

### Step 7 — Caching

1. Key: hash of `(year, make, model, trim, condition, zipCode)`.
2. Store full JSON response in Redis (or DB) with TTL.
3. On cache hit, still refresh async if TTL > soft threshold (optional).

### Step 8 — Secure the endpoint

1. **API key** or **JWT** from app (short-lived) so random clients cannot scrape your pricing proxy.
2. CORS: allow only your app origins / bundle IDs if web.
3. Rate limit per key/IP.

### Step 9 — Wire the mobile app

1. Deploy backend to HTTPS URL, e.g. `https://api.yourdomain.com`.
2. Set in Expo/EAS:
   - `EXPO_PUBLIC_KBB_API_URL=https://api.yourdomain.com/pricing/kbb-health` *(optional health)*  
   Or point the **existing** env vars to your **unified** endpoint pattern.

**Important:** ListForge currently expects three URLs in `src/ai/pricing/providers.ts`. Easiest production approach:

- **Option A:** Three routes on same host:  
  `/pricing/providers/kbb`, `/pricing/providers/edmunds`, `/pricing/providers/comps` — each returns `{ low, mid, high, sampleSize }` for the same query params.
- **Option B (recommended):** One route `POST /pricing/auto` and refactor app to call **one** URL; remove three separate pings for pricing data (keep three health checks OR one `/health/pricing`).

### Step 10 — Verify

1. Call `POST /pricing/auto` from curl/Postman with real credentials in staging.
2. Open app **Profile → Pricing provider health** (or add health URLs).
3. Generate an AUTO listing and confirm **Fast sell / Fair market / Premium ask** match backend.

### Step 11 — Production cutover

1. Enable feature flag: `MARKET_PRICING_ENABLED=true`.
2. Monitor errors and latency.
3. If provider outage, backend returns partial quotes + lower confidence; app already supports fallback messaging.

---

## Quick reference — files in this repo

| Topic | Location |
|--------|-----------|
| Integration overview | `docs/market-pricing-integration.md` |
| Client pricing engine | `src/ai/pricing/engine.ts` |
| Provider fetch stubs | `src/ai/pricing/providers.ts` |
| Health ping | `src/ai/pricing/health.ts` |
| Result UI + selector | `app/result.tsx` |
| Diagnostics UI | `app/pricing-health.tsx` |

---

## Optional next todos (product)

- [ ] Collect **mileage** + **ZIP** on vehicle flow for tighter quotes.
- [ ] Single “Pricing API base URL” env to simplify mobile config.
- [ ] Admin dashboard for provider error rates and cache hit rate.
