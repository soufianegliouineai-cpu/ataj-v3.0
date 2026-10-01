# LifeOS AI

**Never miss paperwork again.**

This branch is the isolated LifeOS AI production bootstrap. It intentionally contains only LifeOS files even though it currently lives inside the `ataj-v3.0` repository because the connected GitHub integration does not expose repository creation.

## What works now

- Static LifeOS web UI
- Live Supabase Edge Function API
- Generic expiry-date protection for supported document types
- User-confirmed trust classification
- Deterministic preparation-date calculation
- Idempotent protection IDs
- Provenance metadata
- Positive and negative live API smoke tests
- GitHub Actions CI

## Production API

`https://kxlrkgbyxplvsvelhdpq.supabase.co/functions/v1/lifeos-api`

See [LIFEOS_DEPLOYMENT.md](./LIFEOS_DEPLOYMENT.md) for verified endpoints and current infrastructure limits.

## Integrity rules

LifeOS does not claim capabilities that are not implemented.

- Manual dates are `USER_CONFIRMED`, not AI-extracted.
- OCR is not active.
- Jurisdiction-specific legal rules are not active.
- No document bytes or personal data are persisted by this bootstrap.
- Authentication is not active until isolated LifeOS Auth/Storage/Database infrastructure is available.

## Verify

```bash
npm test
npm run build
```

The CI workflow additionally tests the live production API.
