# ATAJ v3.1.1 — IRON CLAD
## The 8-Keyword Language That Survives 80 Apocalypses

Ship complete applications in 39 lines. 8 keywords frozen forever. Zero framework. Zero bloat.

### The Language
```
APP, HAVE, SHOW, DO, WHEN, ON, USE, AGENT
```
That is all. 8 keywords. Frozen since v3.1.1. No more, no less.

### Quick Start
```bash
# Deploy the restaurant app
./deploy.sh production
# → https://atajv3.vercel.app

# Deploy the perfume shop
./deploy.sh production
# → https://perfumeshop.vercel.app
```

### How It Works
ATAJ is a compiler, not a framework. One `.ataj` file compiles to both frontend and backend:

- `DO` statements → serverless API endpoints
- `SHOW` statements → React UI components
- `HAVE` statements → database tables
- `WHEN` statements → scheduled tasks

No `API` keyword. No `PAGE` keyword. No `CALL` keyword. No framework. Just the language.

---

## Production Apps

| App | File | Lines | Keywords | Status |
|-----|------|-------|----------|--------|
| Espace Yafa Restaurant | `EspaceYafaRestaurant.ataj` | 39 | 8/8 | ✅ FROZEN |
| Maison de Parfum | `PerfumeShop.ataj` | 39 | 8/8 | ✅ FROZEN |

Both apps:
- 8 keywords only
- Zero type annotations in HAVE
- Single-line FOR EACH
- Under 15 components
- Under 15 tokens
- Zero violations

---

## Keywords

| Keyword | Purpose | Example |
|---------|---------|---------|
| `APP` | Application definition | `APP MyApp frontend react backend cloud` |
| `HAVE` | Data model (implicit types) | `HAVE User id name email` |
| `SHOW` | UI component | `SHOW Hero "Title" "Subtitle" "hero"` |
| `DO` | Business logic + API endpoint | `DO GetItems DO DB.Query "..."` |
| `WHEN` | Scheduled task | `WHEN 00:00 DO UpdateAnalytics` |
| `ON` | Event handler | `ON Click DO HandleClick` |
| `USE` | External service (PIN pinned) | `USE stripe PIN 1.2.3` |
| `AGENT` | AI/ML worker | `AGENT FraudDetector with GOAL "..."` |

---

## Governance

ATAJ v3.1.1 is governed by `ataj.deny.json`:

- **8 keywords** — enforced by CI
- **No type annotations** — `HAVE` uses implicit types
- **No illegal keywords** — `API`, `PAGE`, `ROUTE`, `CALL`, `ENUM` blocked
- **No framework directives** — `START_SERVER`, `CORS`, `SECURITY`, `WEBSOCKET` blocked
- **15 components max** — enforced by CI
- **15 tokens max** — enforced by CI
- **25MB binary cap** — enforced by CI

CI Guard: `.github/workflows/ataj-guard.yml` — rejects commits with violations.

---

## Deploy

```bash
# One command
./deploy.sh production

# Or preview
./deploy.sh preview

# Or dev
./deploy.sh dev
```

---

## Docs

| File | Purpose |
|------|---------|
| `ATAJ-SPECIFICATION-3.1.1.md` | Complete language specification |
| `AGENTS.md` | Agent system prompt (prevents over-engineering) |
| `ataj.deny.json` | Governance rules (CI enforcement) |
| `deploy.sh` | One-command deployment |
| `stress-test.sh` | Load testing |

---

## Status

**ATAJ v3.1.1 IRON CLAD**

- 8 keywords frozen since 2026-07-31
- Expires 2031-07-31 (then re-ratify)
- 2 production apps deployed
- Zero violations
- Zero framework dependencies
- Zero bloat

**8 keywords. One file. Forever frozen.**
