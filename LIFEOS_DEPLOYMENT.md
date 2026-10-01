# LifeOS AI production deployment

## Current status

Backend/API: LIVE and verified
Frontend source: deploy-ready; public render host blocked by external account limits
Dedicated GitHub repository: blocked because the installed GitHub connector does not expose repository creation

## Source
Repository: `soufianegliouineai-cpu/ataj-v3.0`
Isolated branch: `lifeos-production-bootstrap`

## Production API
Base:
`https://kxlrkgbyxplvsvelhdpq.supabase.co/functions/v1/lifeos-api`

Endpoints:
- `GET /health`
- `GET /readiness`
- `GET /version`
- `GET /v1/home`
- `GET /v1/demo/passport?expiry=YYYY-MM-DD`
- `POST /v1/protection/passport`

POST body:
```json
{"expiryDate":"2027-06-12"}
```

Optional header:
`Idempotency-Key: <client-generated-key>`

## Version
LifeOS API: 0.2.0
Supabase Edge Function deployment: version 3

## Verified behavior
- health => 200
- readiness => 200
- passport POST => 200
- invalid calendar date => 400 INVALID_EXPIRY_DATE
- same Idempotency-Key + same expiry => same protectionId
- 2027-06-12 expiry => 2027-03-14 recommended preparation date
- provenance preserved
- deterministic rule ownership explicitly reported

## Intentional limitations
This bootstrap API accepts no document bytes, persists no personal data, and enables no LifeOS user authentication. This is deliberate until LifeOS has isolated Auth/Storage/Database infrastructure instead of sharing Mihani's user-data plane.

## External deployment blockers
- Vercel Git integration is connected but currently reports a build-rate limit.
- Render MCP is connected but service creation returns HTTP 402 because billing information is required.
- GitHub connector can mutate existing repositories but does not expose account-level repository creation.
