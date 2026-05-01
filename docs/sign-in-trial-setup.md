# Sign-in trial setup (Firebase + Render)

## Stack

- Auth + profile DB: Firebase Auth + Firestore
- Backend APIs: Render (KBB/Edmunds/market comps proxy)

## What is implemented in app

- Email/password Sign in (`/sign-in`)
- Email/password Register (`/register`)
- 7-day full-feature trial profile on first signup
- Profile editing: display name + phone
- Entitlement gating in result screen for market-backed pricing

## 1) Firebase setup

Create Firebase project and enable:

- Authentication -> Sign-in method -> Email/Password
- Firestore Database -> Native mode

Create collection model:

- `users/{uid}` document fields:
  - `id`
  - `email`
  - `display_name`
  - `phone`
  - `plan` (`free|trial|pro|business|enterprise`)
  - `trial_ends_at` (ISO string)
  - `created_at` (ISO)
  - `updated_at` (ISO)

## 2) Firestore security rules

Use rules equivalent to:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 3) Environment variables

Copy `.env.example` to `.env.local` and set all Firebase vars:

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`

Pricing API URLs should point to your Render backend:

- `EXPO_PUBLIC_KBB_API_URL`
- `EXPO_PUBLIC_EDMUNDS_API_URL`
- `EXPO_PUBLIC_MARKET_COMPS_API_URL`

Restart Expo after env updates.

## 4) Trial behavior

On first register:

- app creates Firebase auth user
- app creates `users/{uid}` profile with:
  - `plan = 'trial'`
  - `trial_ends_at = now + 7 days`

Entitlements:

- `trial` active or paid plans (`pro`, `business`, `enterprise`) -> market pricing enabled
- otherwise locked with sign-in/upgrade prompt

## 5) Render backend note

Your pricing APIs on Render should return normalized values:

```json
{ "low": 19500, "mid": 21200, "high": 22900, "sampleSize": 32 }
```

for each provider endpoint queried by the app.
