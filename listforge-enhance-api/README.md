# listforge-enhance-api

Minimal Render-ready Node/TypeScript API service for ListForge image enhancement.

## Endpoints

- `GET /health` - health check for Render deploy validation.
- `GET /v1/billing/config` - app billing and credit pack configuration.
- `GET /v1/billing/wallet/:userId` - wallet snapshot (balance + refill settings).
- `POST /v1/billing/topup` - add credits using idempotency key.
- `POST /v1/billing/consume` - consume credits per mode, with optional auto-refill.
- `GET /v1/billing/owner/weekly` - owner weekly dashboard metrics (PIN protected).
- `POST /v1/photo/enhance` - photo enhancement.
- `POST /v1/photo/enhance/batch` - batch photo enhancement.
- `POST /v1/photo/upscale` - upscaling.
- `POST /v1/photo/enhance-upscale` - enhance + upscale in one request.

## Local run

```bash
npm install
npm run build
npm start
```

## Required environment variables

- `ENHANCE_PROVIDER`
- `REMOVE_BG_API_KEY`
- `REMOVE_BG_API_BASE_URL`
- `SIGNED_URL_SECRET`
- `MAX_IMAGE_MB`
- `REQUEST_TIMEOUT_MS`
- `MODE_MULTIPLIER_AUTO` (default `1.5`)
- `MODE_MULTIPLIER_ELECTRONICS` (default `1.0`)
- `MODE_MULTIPLIER_GENERAL` (default `0.8`)
- `BILLING_TOPUP_PACKS_JSON` (optional JSON array of packs)
- `DEFAULT_AUTO_REFILL_THRESHOLD` (default `20`)
- `DEFAULT_AUTO_REFILL_PACK_ID` (default `growth`)
- `DEFAULT_CREDITS_BALANCE` (default `40`)
- `FIREBASE_SERVICE_ACCOUNT_JSON` (preferred for Render, full JSON string)
- `FIREBASE_PROJECT_ID` (if not using JSON)
- `FIREBASE_CLIENT_EMAIL` (if not using JSON)
- `FIREBASE_PRIVATE_KEY` (if not using JSON; preserve newlines as `\n`)
- `BILLING_API_KEY` (optional but recommended; required in `x-billing-api-key` header)
- `BILLING_OWNER_PIN` (required for owner dashboard endpoint, sent as `x-owner-pin`)

### Render env example

Use this for a one-time credit model with optional auto-refill:

```bash
ENHANCE_PROVIDER=remove_bg
REMOVE_BG_API_KEY=your_key
REMOVE_BG_API_BASE_URL=https://api.remove.bg/v1.0
SIGNED_URL_SECRET=replace_me
MAX_IMAGE_MB=12
REQUEST_TIMEOUT_MS=12000

MODE_MULTIPLIER_AUTO=1.5
MODE_MULTIPLIER_ELECTRONICS=1.0
MODE_MULTIPLIER_GENERAL=0.8
DEFAULT_AUTO_REFILL_THRESHOLD=20
DEFAULT_AUTO_REFILL_PACK_ID=growth
BILLING_TOPUP_PACKS_JSON=[{"id":"starter","label":"Starter Pack","credits":120,"priceUsd":9},{"id":"growth","label":"Growth Pack","credits":400,"priceUsd":25,"popular":true},{"id":"pro","label":"Pro Pack","credits":1200,"priceUsd":59}]
DEFAULT_CREDITS_BALANCE=40

# preferred auth to Firestore (single env)
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}
BILLING_API_KEY=replace_with_random_secret
BILLING_OWNER_PIN=your_secret_owner_pin
```

### Firestore collections used

- `users/{userId}`
  - `credits_balance` (number)
  - `auto_refill_enabled` (boolean)
  - `auto_refill_pack_id` (string)
  - `auto_refill_threshold` (number)
- `users/{userId}/credit_ledger/{idempotencyKey}`
  - top-up / consume / auto-refill ledger entries

### Billing API examples

```bash
# wallet
curl -H "x-billing-api-key: $BILLING_API_KEY" \
  https://your-service.onrender.com/v1/billing/wallet/USER_ID

# topup (idempotent)
curl -X POST https://your-service.onrender.com/v1/billing/topup \
  -H "Content-Type: application/json" \
  -H "x-billing-api-key: $BILLING_API_KEY" \
  -d '{"userId":"USER_ID","packId":"growth","idempotencyKey":"topup-ORDER123","paymentRef":"ORDER123"}'

# consume (idempotent)
curl -X POST https://your-service.onrender.com/v1/billing/consume \
  -H "Content-Type: application/json" \
  -H "x-billing-api-key: $BILLING_API_KEY" \
  -d '{"userId":"USER_ID","mode":"electronics","jobCount":1,"idempotencyKey":"job-abc-1","jobRef":"enhance-job-abc"}'
```
