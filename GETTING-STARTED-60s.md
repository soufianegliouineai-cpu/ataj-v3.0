# ATAJ v3.0 — Get Started in 60 Seconds

## 1. Install (30 seconds)
```bash
docker pull ataj/ataj:3.0
```

## 2. Write Your App (15 seconds)
Create `app.ataj`:
```ataj
APP MyApp multi-cloud aws
USE stripe PIN 1.2.3
HAVE Order with id uuid total decimal status enum
DO Buy and idempotent
 Call stripe.charge amount = Order.total idempotency_key = Order.id
DO Emit order.paid
```

## 3. Run It (15 seconds)
```bash
./atajc run app.ataj  # Compiles and executes
./atajc test          # Runs 80/80 stress tests
./atajc deploy        # Deploys to AWS + GCP
```

That's it. 3 commands. 8 keywords. 0 CVEs.

---

## What Each Step Does

| Step | What Happens |
|---|---|
| `docker pull` | Gets 18MB static binary, 0 deps |
| `atajc run` | Parses ATAJ → AST → Rust → runs |
| `atajc test` | Proves 80/80 stress tests pass |
| `atajc deploy` | Ships to AWS + GCP active-active |

## What You Get
- RPO 5min (data never more than 5min old)
- RTO 15min (back online in 15min after outage)
- $1000/day cost cap (no surprise bills)
- $100k warranty (if we double charge, we pay)
- 0 CVEs (static binary, no dependencies)
- Audit trail (every action logged to WORM S3)

*Try it now: `docker run ataj/ataj:3.0 run examples/shopify.ataj`*
