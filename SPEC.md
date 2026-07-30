# ATAJ LANGUAGE SPEC v3.1
## 9 Keywords. 0 Errors. Unbreakable.

---

## Complete Grammar

### Program
```
Program ::= APP_Statement Decl*
```

### APP Statement
```
APP <name> multi-cloud <cloud> ["," <cloud>]*
```

### USE Statement
```
USE <library> PIN <version>
USE <library> [UNSAFE]
```

### HAVE Statement
```
HAVE <Model> with <field1> <type> [modifier]*
HAVE <Model> with <field1> <type> unique
```
Types: `string`, `decimal`, `uuid`, `int`, `bool`, `timestamp`, `enum`
Modifiers: `secure`, `immutable`, `unique`

### SHOW Statement
```
SHOW <ViewName>
```

### AGENT Statement (NEW - AI Agent Orchestration)
```
AGENT <Name> with GOAL "<goal>"
  MODEL <provider> <model> PIN <version>
  SANDBOXED
  COST_CAP $<amount>/day
```

Agents execute AI tasks with safety guarantees:
- Every agent action = DO (idempotent + circuit + audit)
- Cost-Guard applies to LLM calls
- Human approval required for actions > $1000
- Outputs validated against schema

### DO Statement (Business Logic)
```
DO <ActionName> [and <modifier>]*
 <body>*
```

### WHEN Statement (Scheduler)
```
WHEN <cron_expression> DO <ActionName> [and bulk]
```
Cron: `1st of month`, `daily`, `hourly`, `* * * * *`

### ON Statement (Webhook/Event)
```
ON <event_path> [DO <ActionName>]
```

### multi-cloud Statement
```
multi-cloud <cloud> ["," <cloud>]*
```
Clouds: `aws`, `gcp`, `azure`

---

## 9 Keywords (v3.1)

| # | Keyword | Purpose | Example |
|---|---|---|---|
| 1 | **APP** | App definition + targets | `APP MyApp multi-cloud aws gcp` |
| 2 | **HAVE** | Data models + schema | `HAVE Order with id uuid total decimal` |
| 3 | **SHOW** | UI / API / Dashboard | `SHOW Store` |
| 4 | **DO** | Business logic / actions | `DO Buy and idempotent circuit` |
| 5 | **WHEN** | Cron / Scheduler | `WHEN 1st of month DO Billing` |
| 6 | **ON** | Webhooks / Events / Queues | `ON /payment DO Receive` |
| 7 | **USE** | Libraries (PIN versioned) | `USE stripe PIN 1.2.3` |
| 8 | **multi-cloud** | Deployment target | `multi-cloud aws gcp azure` |
| 9 | **AGENT** | AI agent orchestration | `AGENT FraudDetector with GOAL "..."` |

## Modifiers
`idempotent` `circuit` `bulk` `approval` `secure` `self-heal` `immutable` `PIN` `UNSAFE`

---

## AGENT Example

```ataj
APP Fintech multi-cloud aws gcp

AGENT FraudDetector with GOAL "Block fraud >99.9%"
 MODEL openai GPT-4 PIN 2.1.0
 SANDBOXED
 COST_CAP $100/day

USE stripe PIN 1.2.3
USE openai PIN 2.1.0

HAVE Transaction with id uuid amount decimal status enum

DO ProcessPayment and idempotent circuit approval from 2
 Call stripe.charge amount = Transaction.amount idempotency_key = Transaction.id
 CALL FraudDetector.analyze Transaction.amount Transaction.user_id
 IF FraudDetector.verdict = "FRAUD"
 DO Block and approval from FraudTeam circuit
 CALL stripe.refund amount = Transaction.amount
 DO Audit and immutable
DO Emit payment.completed

WHEN hourly DO FraudReport and bulk
FOR each Transaction DO Export to S3 WORM

DO Backup and immutable
DO GDPR delete user and audit
```

---

## AGENT Safety Guarantees

1. **Every AGENT action = DO** — idempotent + circuit + audit enforced
2. **Cost-Guard** — applies to LLM calls, prevents runaway spending
3. **Approval gate** — required for actions > $1000
4. **Schema validation** — agent outputs validated before execution
5. **Rollback on error** — self-heal triggers retry
6. **Kill switch** — `emergency_kill` if cost > $1000 or RTO > 15min

---

## Grammar Extension (v3.1)

### AGENT Block
```
AGENT <Name> with GOAL "<goal>"
  MODEL <provider> <model> PIN <version>
  [SANDBOXED]
  [COST_CAP $<amount>/day]
```

### Conditional Blocks in DO
```
IF <condition>
 <actions>
ELSE
 <actions>
```

### Method Call
```
Call <library_or_agent>.<method> <param> = <value>
```

---

## 8 (or 9) Keywords. Nothing More. Nothing Less.

If it cannot be expressed in 9 keywords or fewer, reconsider the design.

*Simple. Provable. Unbreakable.*
