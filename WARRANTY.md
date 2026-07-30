# ATAJ $100,000 WARRANTY v3.0

ATAJ Inc warrants:
1. No double charge with idempotent
2. RTO <= 15min after total region loss
3. RPO <= 5min
4. Monthly bill <= $1000 with cost-cap
5. CVE patched in 24h

Bounty: $100,000 if you cause 1-3 with <20 lines of ATAJ.
Excludes UNSAFE blocks.

SLA Credits: RTO breach $10k, RPO breach $10k, CVE >24h $5k
Valid 2026-2031. v3.0 LTS frozen.

## v3.1 - AGENT Keyword Added

### Why AGENT?
AI agents need to orchestrate tasks safely in production.
Before AGENT, agents had no language-level support.
Now they do - with all the same guarantees as regular DO blocks.

### AGENT Guarantees
1. Every AGENT action = `DO` with `idempotent` + `circuit` + `audit`
2. Cost-Guard applies to LLM calls (prevents $2M bill from rogue AI)
3. Human approval required for actions > $1000
4. Outputs validated against schema before execution
5. Rollback on any error (self-heal)
6. Emergency kill switch if cost > $1000/day

### New Syntax
```ataj
AGENT FraudDetector with GOAL "Block fraud >99.9%"
 MODEL openai GPT-4 PIN 2.1.0
 SANDBOXED
 COST_CAP $100/day
```

### 9th Keyword Status
The 9th keyword (AGENT) is added for AI orchestration only.
All 9 keywords remain frozen until 2031.
