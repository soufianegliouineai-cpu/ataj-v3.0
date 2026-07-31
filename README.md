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

## Architecture

ATAJ is a compiler, not a framework. One `.ataj` file compiles to both frontend and backend.

```
┌─────────────────────────────────────────────────────────────────┐
│                     DEVELOPER                                   │
│                                                                 │
│  Write ONE .ataj file                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  EspaceYafaRestaurant.ataj  (39 lines)                 │   │
│  │  APP → HAVE → SHOW → DO → WHEN → ON                   │   │
│  │  8 keywords. Zero framework. Zero bloat.               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Run: ./deploy.sh production                                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ATAJ COMPILER                                │
│                                                                 │
│  atajc EspaceYafaRestaurant.ataj --target vercel               │
│                                                                 │
│  SHOW → React components    DO → Serverless API endpoints     │
│  HAVE → DB table schemas    WHEN → Cloud cron jobs            │
│  ON → Event handlers        USE → Service integrations        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VERCEL DEPLOYMENT                            │
│                                                                 │
│  Frontend → CDN (global edge)                                  │
│  APIs     → Serverless functions (AWS Lambda)                  │
│  Database → Managed PostgreSQL                                  │
│  Cache    → Redis (Vercel KV)                                  │
│  Email    → SendGrid                                          │
│                                                                 │
│  Result: https://atajv3.vercel.app                            │
└─────────────────────────────────────────────────────────────────┘

### Compilation Flow

ATAJ Source	        Compiles To	        Runtime
`HAVE Restaurant id`	`CREATE TABLE`	        Postgres
`SHOW Card name`	`<Card title={name}/>`	React
`DO GetMenuItems`	`export async GET()`	/api/GetMenuItems
`ON Click DO Order`	`onClick={fetch()}`	Browser Event
`WHEN 00:00 DO`	`cron: "0 0 * * *"`	Vercel Cron
`DO Cache.Set`	`redis.setex()`	        Upstash Redis
`DO Email.Send`	`SendGrid trigger`	        Email Service
`DO Audit.Log`	`Audit entry`	        Audit Log

### Stack Comparison

Traditional Stack	ATAJ v3.1.1	Reduction
React + Express + Prisma + TS + SQL + Docker + CI/CD	`EspaceYafaRestaurant.ataj`	7 tools → 1 file
10+ frameworks, 50+ config files	8 keywords	50 configs → 0 configs
Split across 50+ files	Single source of truth	50 files → 1 file
`npm run build && docker push && kubectl apply`	`./deploy.sh production`	10 steps → 1 step
Framework lock-in: Next.js v15	Language lock-in: None. Frozen	Can recompile to anything

Binary size: 18.7MB vs 200MB+ node_modules. Pass.

### Key Insight

The compiler is the framework. The language IS the architecture.

Because the compiler is the framework, we can freeze it.

Traditional: "Upgrade React 18 to 19" = 3 weeks of breaking changes
ATAJ: "Compiler v3.1.1 is frozen until 2031" = 0 breaking changes

The architecture cannot drift because there are only 8 keywords to implement.

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
