# Market Pricing Integration Guide (KBB + Edmunds + Comps)

This guide shows how to move from fallback heuristic pricing to true market-backed pricing in ListForge.

## 1) Why a backend is required

Yes, you should use a backend (or edge functions). Reasons:

- KBB/Edmunds credentials must stay secret (never put API keys in the mobile app).
- Provider APIs often require request signing, rate limiting, and retry logic.
- You need source normalization and confidence scoring before sending results to app clients.

Recommended setup:

- Mobile app -> your backend endpoint (`/pricing/auto`)
- Backend -> KBB, Edmunds, and market comp providers
- Backend returns one normalized response to the app

## 2) Required provider access

You need commercial access or approved APIs for:

- Kelley Blue Book (KBB) valuation data
- Edmunds valuation data
- Optional listing comps provider (auction/sold listing feeds, marketplace aggregators, etc.)

Before coding, confirm:

- Terms of use for display in consumer-facing apps
- Rate limits and caching policy
- Allowed fields and attribution requirements

## 3) Backend API contract (single normalized response)

Create one endpoint:

- `POST /pricing/auto`

Request:

```json
{
  "year": "2020",
  "make": "Toyota",
  "model": "Camry",
  "trim": "SE",
  "vin": "optional",
  "condition": "good",
  "zipCode": "optional"
}
```

Response:

```json
{
  "fastSell": 19800,
  "fairMarket": 21400,
  "premiumAsk": 23100,
  "confidence": 0.86,
  "sources": ["KBB", "Edmunds", "Market comps"],
  "rationale": "Based on KBB/Edmunds and local comps, adjusted for selected condition.",
  "quotes": [
    { "source": "kbb", "low": 19500, "mid": 21200, "high": 22900, "sampleSize": 32 },
    { "source": "edmunds", "low": 20100, "mid": 21700, "high": 23400, "sampleSize": 26 }
  ],
  "fetchedAt": "2026-04-20T12:00:00.000Z"
}
```

## 4) Aggregation logic on backend

For each provider:

1. Fetch quote by year/make/model/trim (+ VIN if supported)
2. Normalize to low/mid/high
3. Reject invalid/outlier responses
4. Merge by weighted average

Suggested weighting:

- KBB: 40%
- Edmunds: 40%
- Market comps: 20%

Then map:

- `fastSell` = weighted low
- `fairMarket` = weighted mid
- `premiumAsk` = weighted high

## 5) Confidence scoring

Start at `0.35`, then add:

- +0.20 if KBB available
- +0.20 if Edmunds available
- +0.10 if comps available
- +0.10 if sample size > 25
- -0.10 if trim/model confidence is low

Clamp to `0.0..0.95`.

## 6) Caching and latency targets

To keep UX under 2 seconds:

- Cache by `(year, make, model, trim, condition, region)` for 30-120 minutes
- Use stale-while-revalidate strategy
- Return cached result immediately, refresh in background

## 7) Mobile app wiring

In ListForge, set:

- `EXPO_PUBLIC_KBB_API_URL`
- `EXPO_PUBLIC_EDMUNDS_API_URL`
- `EXPO_PUBLIC_MARKET_COMPS_API_URL`

Point these to your backend endpoints (not third-party direct APIs).

## 8) UI behavior for user pricing choice

Use a 3-position tap selector:

- **Fast sell**
- **Fair market**
- **Premium ask**

Display the selected number as:

- "Recommended list price: $XX,XXX"

Allow quick copy and keep explanation visible:

- sources
- confidence
- rationale

## 9) Compliance checklist

- Keep provider keys server-side only
- Add attribution text if required by contracts
- Log request IDs and provider responses for audit/debug
- Respect provider usage limits and prohibited use clauses

## 10) Rollout plan

1. Backend endpoint with mock responses
2. Wire mobile to backend
3. Enable one provider (KBB or Edmunds)
4. Add second provider
5. Add comp feed
6. Enable confidence/source telemetry
7. Launch with feature flag and monitor conversion
