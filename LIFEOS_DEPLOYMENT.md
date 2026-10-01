# LifeOS AI production deployment

Status: backend LIVE

GitHub branch: lifeos-production-bootstrap

Production API:
- https://kxlrkgbyxplvsvelhdpq.supabase.co/functions/v1/lifeos-api/health
- https://kxlrkgbyxplvsvelhdpq.supabase.co/functions/v1/lifeos-api/v1/home
- https://kxlrkgbyxplvsvelhdpq.supabase.co/functions/v1/lifeos-api/v1/demo/passport?expiry=2027-06-12

Supabase Edge Function:
- lifeos-api
- version 2
- production version: 0.1.1

Verification:
- /health => HTTP 200
- passport demo => HTTP 200
- 2027-06-12 expiry => recommended action 2027-03-14
- evidence/provenance metadata present

Frontend:
- build artifact is committed as index.html on this isolated branch.
- Vercel connector currently exposes reads but its deploy action errors as unavailable.
- GitHub Pages activation is blocked because the GitHub app lacks repository-admin permission.
- Supabase Storage intentionally serves HTML as text/plain, so it is not used as the production frontend host.

No Mihani database tables or schema were modified for LifeOS.
