# ListForge — Plans & pricing (reference)

Use this document as the source of truth before wiring **Sign in / Register**, **IAP**, and **profile plan selection**.

Prices are **suggested bands**; finalize with finance and app-store economics (Apple/Google fees, regional pricing).

---

## A) Consumer app — Electronics & General (in-app subscription)

| Plan | Price (USD / mo) | Who it’s for | Core limits & features |
|------|------------------|--------------|-------------------------|
| **Free** | $0 | First-time sellers, viral onboarding | Basic listing generator; simple title + description; limited AI insights; **cap: e.g. 3 saved listings / month** (tune in product) |
| **Pro** | **$5** | Casual / regular sellers | Market-style pricing suggestion (range + confidence); better descriptions; condition signals from photos; **unlimited** listings; faster generation |
| **Business** | **$29** | Refurbishers, small resale ops | Everything in Pro + **batch** listing flow; batch image processing; export-ready formats; **priority** AI queue; advanced pricing / sell-speed hints |
| **Enterprise** | Custom | Larger ops | SSO, SLA, API, dedicated support — **separate sales** |

**Optional add-ons (consumables or credits)**

| Add-on | Suggested price | Notes |
|--------|-----------------|--------|
| Premium optimized listing | $0.50–$2 each | One-off conversion boost |
| Fast-sell optimization pack | Bundle e.g. 10 for $5 | Credits reduce IAP friction |

*Note: If you offer both “Electronics Pro” and “General Pro” at different price points, use **one subscription group** in App Store with clear feature gating by **category**, or separate products with clear naming to avoid user confusion.*

---

## B) Auto — dealer / pro seller (higher ARPU SaaS)

| Plan | Price (USD / mo) | Who it’s for | Core limits & features |
|------|------------------|--------------|-------------------------|
| **Trial** | $0 (time- or volume-limited) | Evaluation | Limited listings; basic VIN decode; sample listing generation |
| **Dealer Pro** | **$99–199** per **location** | Small lots | VIN → structured listing; AI description; **Fast / Fair / Premium** pricing positioning; marketplace-ready copy; basic workflow |
| **Dealer Growth** | **$199–399** | Mid-size | Multi-platform formatting; bulk upload; photo workflow + quality scoring; optimization suggestions |
| **Enterprise** | **$500+** | Dealer groups | Multi-location; syndication/API feeds; analytics; priority processing; contract + SSO |

---

## C) Fields users should edit in Profile (after auth)

| Field | Editable | Notes |
|-------|----------|--------|
| Display name | Yes | Shown in app |
| Email | Yes (verify) | Account recovery |
| Phone | Optional | OTP / 2FA later |
| Password | Yes | Change password |
| Plan | Select (upgrade/downgrade) | Tied to App Store / Play Billing or Stripe for web |
| Billing | Portal link | Manage subscription |
| Vertical preference | Optional | Electronics / Auto / General — for UX defaults |

---

## D) Implementation order (recommended)

1. Ship **plans table** in-app (read-only) + **guest mode** (current).
2. Add **Sign in / Register** UI → Supabase Auth (or Firebase).
3. Persist **plan** server-side + sync with **RevenueCat** or native IAP.
4. Gate features by plan in app code (`useEntitlements`).
