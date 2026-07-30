# ATAJ LANGUAGE SPEC v3.0
## Simple. 8 Keywords. Unbreakable.

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
Clouds: `aws`, `gcp`, `azure`

### USE Statement
```
USE <library> PIN <version>
USE <library> [UNSAFE]
```
Version format: `MAJOR.MINOR.PATCH` (e.g., `1.2.3`)

### HAVE Statement (Data Model)
```
HAVE <Model> with <field1> <type> [modifier] [field2] <type> [modifier]*
```
Types: `string`, `decimal`, `uuid`, `int`, `bool`, `timestamp`, `enum`
Modifiers: `secure` (encrypt at rest + redact in logs), `immutable` (append-only), `unique` (unique constraint)

### SHOW Statement
```
SHOW <ViewName>
```
Shows all fields of the model in a UI/dashboard

### DO Statement (Business Logic)
```
DO <ActionName> [and <modifier>]*
 <body>*
```

Modifiers (applied to DO):
- `idempotent` — Safe to retry, keyed dedup
- `circuit` — Stops after 5 failures, auto-recovers
- `bulk` — Processes in chunks of 1000 with checkpoints  
- `approval from <N> <role>` — Requires N signatures from role
- `secure` — Encrypts output data
- `self-heal` — Auto-retries on failure then escalates
- `immutable` — Output never changes once written

Body actions:
- `Call <library>.<method> <param> = <value>` — External call
- `DO Emit <event>` — Emit side effect
- `DO <ActionName>` — Nested DO call
- `IF <condition>` — Conditional block
- `FOR each <Model> DO <Action>` — Loop

### WHEN Statement (Scheduler)
```
WHEN <cron_expression> DO <ActionName> [and bulk]
```
Cron: `1st of month`, `daily`, `hourly`, `* * * * *`

### ON Statement (Webhook/Event)
```
ON <webhook_path>
DO <ActionName>
```

---

## Complete Syntax Quick Reference

### 8 Keywords
| Keyword | What It Does | Example |
|---|---|---|
| **APP** | Define app + deployment targets | `APP MyApp multi-cloud aws gcp` |
| **USE** | Import library (PIN versioned) | `USE stripe PIN 1.2.3` |
| **HAVE** | Define data model + schema | `HAVE User with id uuid email string` |
| **SHOW** | Create UI/dashboard view | `SHOW UserDashboard` |
| **DO** | Execute logic (the core) | `DO Buy and idempotent circuit` |
| **WHEN** | Schedule cron jobs | `WHEN 1st of month DO Bill` |
| **ON** | Handle webhooks/events | `ON /payment DO Process` |
| **multi-cloud** | Deployment target | `multi-cloud aws gcp` |

### 9 Modifiers
| Modifier | Applies To | Effect |
|---|---|---|
| `idempotent` | DO | Safe retry, no duplicates |
| `circuit` | DO | Auto-stop on failures |
| `bulk` | DO | Batch processing |
| `approval from N role` | DO | N signatures required |
| `secure` | HAVE, DO | Encrypt data |
| `self-heal` | DO | Auto-recover |
| `immutable` | HAVE, DO | Write-once |
| `PIN` | USE | Version-pinned |
| `UNSAFE` | USE | Bypass sandbox |

### Data Types
| Type | Description | Guarantees |
|---|---|---|
| `string` | Text | UTF-8 |
| `decimal` | Money/precision | ECC + CRC32, no float errors |
| `uuid` | Unique ID | v7 time-sortable |
| `int` | Integer | 64-bit |
| `bool` | True/False | — |
| `timestamp` | ISO 8601 UTC | — |
| `enum` | Set of values | Compiler validates |

---

## Example: Minimal App (10 lines)

```ataj
APP MyApp multi-cloud aws

USE stripe PIN 1.2.3

HAVE Order with id uuid total decimal status enum

DO Buy and idempotent
 Call stripe.charge amount = Order.total
DO Emit order.created

DO Refund and idempotent circuit approval from 1
 Call stripe.refund id = Order.id
DO Emit order.refunded

WHEN 1st of month DO MonthlyBill
FOR each Order WHERE status = "pending" DO Charge
```

---

## Error Messages

| Error | Cause | Fix |
|---|---|---|
| `9th keyword detected` | Used a 9th keyword | Remove it or use existing 8 |
| `missing PIN on USE` | Library not versioned | Add `PIN x.y.z` |
| `duplicate DO name` | Same DO defined twice | Rename or merge |
| `approval from 0` | N must be >= 1 | Use `approval from 1 CFO` |
| `unknown type in HAVE` | Type not in allowed list | Use `string`, `decimal`, `uuid`, `int`, `bool`, `timestamp`, `enum` |
| `no APP declaration` | Missing APP statement | Add `APP <name> multi-cloud <cloud>` |
| `UNSAFE without review` | UNSAFE used but no code review | Add 2 exec approvals |

---

## Compiler Pipeline

```
ataj source (.ataj)
    ↓ parse
AST (Abstract Syntax Tree)
    ↓ validate (8 keywords + modifiers only)
codegen → Rust source
    ↓ cargo build --release
18MB static binary
```

---

## Runtime Guarantees

Guarantee | How ATAJ Enforces It
---|---
No double charge | `idempotent` + UUID dedup table + serializable DB
No data leak | `secure` fields encrypted + sandboxed USE calls
No cascade failure | `circuit` breaker on every external call
No $2M bill | `cost_cap $1000/day` + auto-kill
RPO 5min | WAL replication to 2nd cloud every 5min
RTO 15min | Active-active + 8s failover
No CVEs | Static binary + 0 dependencies
GDPR delete | `DO GDPR delete user` completes in 2h
Audit trail | Every DO → immutable S3 WORM log

---

*8 Keywords. 0 Errors. Ship with confidence.*
