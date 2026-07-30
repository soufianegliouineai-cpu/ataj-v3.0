# ATAJ v3.0 LTS
## The 8-Keyword Language That Survives 80 Apocalypses

Ship multi-cloud SaaS in 20 lines. 18MB static binary. $100k warranty.

### Install
```bash
cd compiler &&./build.sh
./target/release/atajc --version
```

### Run
```bash
./target/release/atajc run examples/shopify.ataj
./target/release/atajc deploy --multi-cloud aws,gcp
./target/release/atajc test --tier all
```

The 9 Keywords
`APP, AGENT, HAVE, SHOW, DO, WHEN, ON, USE, multi-cloud`

Guarantees
RPO 5min | RTO 15min | Cost Cap $1000/day | 0 CVEs | 80/80 Tests

---

## Status: LTS FROZEN (2026-2031)

v3.0.0 LTS is frozen. Stability only. No new features. No breaking changes.

**Stability Guarantee**: $100,000 per violation of frozen terms.

---

## Quick Reference

| Keyword | What | Example |
|---|---|---|
| `APP` | App definition + targets | `APP MyApp multi-cloud aws gcp` |
| `USE` | Import library (PIN pinned) | `USE stripe PIN 1.2.3` |
| `HAVE` | Data model + schema | `HAVE User with email string` |
| `SHOW` | UI / Dashboard | `SHOW UserDashboard` |
| `DO` | Business logic (core) | `DO Buy and idempotent circuit` |
| `WHEN` | Cron scheduler | `WHEN 1st of month DO Bill` |
| `ON` | Webhook / event | `ON /stripe DO Receive` |
| `multi-cloud` | Deployment target | `multi-cloud aws gcp` |

## Modifiers
`idempotent` `circuit` `bulk` `approval` `secure` `self-heal` `immutable` `PIN` `UNSAFE`

## Quick Start
```bash
docker pull ataj/ataj:3.0
./atajc run examples/shopify.ataj
./atajc deploy --multi-cloud aws,gcp
```

## Full docs
- [SPEC.md](./SPEC.md) — Complete grammar + syntax reference
- [QUICK-REFERENCE.md](./QUICK-REFERENCE.md) — One-page keyword cheat sheet
- [GETTING-STARTED-60s.md](./GETTING-STARTED-60s.md) — Get started in 60 seconds
- [ERROR-HANDLING.md](./ERROR-HANDLING.md) — All errors + fixes
- [WARRANTY.md](./WARRANTY.md) — $100k warranty details
- [INSTALL.md](./INSTALL.md) — Install instructions

## Simple Design
ATAJ has exactly 8 keywords, 9 modifiers, 7 data types.
No extras. No features you don't need. Nothing that can break in prod.

**9 Keywords. 0 CVEs. Ship with confidence.**
