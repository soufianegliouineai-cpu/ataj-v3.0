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
- `GET /v1/document-types`
- `GET /v1/home`
- `GET /v1/demo/passport?expiry=YYYY-MM-DD`
- `POST /v1/protection/passport`
- `POST /v1/protection/expiry`

Generic expiry request:
```json
{
  "documentType": "driving_license",
  "expiryDate": "2027-08-20",
  "leadDays": 60
}
```

Optional header:
`Idempotency-Key: <client-generated-key>`

## Version
LifeOS API: 0.3.0
Supabase Edge Function deployment: version 4

## Integrity guarantees
- Manually entered dates are labeled `USER_CONFIRMED`, not AI-extracted.
- `aiExtractionPerformed=false` unless an actual OCR/extraction pipeline is introduced later.
- `legalRuleApplied=false` for the generic expiry-protection engine.
- No jurisdiction-specific renewal claim is made.
- Deterministic lead-time calculation remains fully traceable.

## Verified behavior
- health => 200
- document types => 200
- generic expiry protection => 200
- unsupported document type => 400 INVALID_DOCUMENT_TYPE
- same idempotency key + same request => same protectionId
- driving licence 2027-08-20 with 60-day lead => 2027-06-21 preparation date

## Intentional limitations
This bootstrap API accepts no document bytes, persists no personal data, and enables no LifeOS user authentication. This remains deliberate until LifeOS has isolated Auth/Storage/Database infrastructure instead of sharing Mihani's user-data plane.

## External deployment blockers
- Vercel Git integration is connected but currently reports a build-rate limit.
- Render MCP is connected, but service creation returns HTTP 402 because billing information is required.
- GitHub connector can mutate existing repositories but does not expose account-level repository creation.
