# ATAJ v3.0 Quick Reference Card
## One page. 8 keywords. All you need.

---

```
APP MyApp multi-cloud aws gcp
```
Define app + where it runs (aws, gcp, azure)

```
USE stripe PIN 1.2.3
```
Import library, version-pinned (PIN), sandboxed (UNSAFE optional)

```
HAVE Order with id uuid total decimal status enum
```
Define data model. `secure` encrypts fields. `immutable` makes append-only.

```
SHOW Store
```
Generate UI/dashboard for the model

```
DO Buy and idempotent circuit approval from 2 CFO
 Call stripe.charge amount = Order.total idempotency_key = Order.id
 Call s3.put key = "receipts/" + Order.id
DO Emit order.paid
```
Execute logic. Every DO has audit trail.

```
ON /stripe/webhook DO ReceivePayment
 Call order.update status = "paid"
 Call email.send template = "receipt"
```
Handle webhooks/events

```
WHEN 1st of month DO Billing
 FOR each Tenant DO Charge
 Call stripe.subscription_create
DO Emit billing.complete
```
Schedule cron jobs

---

## Modifiers Cheat Sheet

| On DO | Meaning |
|---|---|
| `idempotent` | Retry safely, no duplicates |
| `circuit` | Stop after 5 failures |
| `bulk` | Process 1000 at a time |
| `approval from N role` | N signatures needed |
| `secure` | Encrypt output |
| `self-heal` | Auto-retry on failure |
| `immutable` | Never change once written |

| On USE | Meaning |
|---|---|
| `PIN x.y.z` | Version-pinned to exact version |
| `UNSAFE` | Bypass sandbox (needs 2 approvals) |

| On HAVE | Meaning |
|---|---|
| `secure` | Encrypt at rest + redact in logs |
| `immutable` | Write-once, append-only |
| `unique` | Enforce uniqueness constraint |

---

## Data Types

| Type | Use Case | Guarantee |
|---|---|---|
| `string` | Text, names, emails | UTF-8 |
| `decimal` | Money, prices | ECC + no float bugs |
| `uuid` | IDs, references | UUID v7 |
| `int` | Counters, quantities | 64-bit integer |
| `bool` | Flags, toggles | true/false |
| `timestamp` | Dates | ISO 8601 UTC |
| `enum` | Fixed set of values | Compiler validates |

---

## Common Patterns

### Idempotent Payment
```ataj
DO Charge and idempotent circuit
 Call stripe.charge amount = Order.total idempotency_key = Order.id
 DO Emit payment.complete
```

### Approval Gate
```ataj
DO Wire and approval from 2 CFO circuit idempotent
 Call swift.send from to amount
 DO Audit and immutable
```

### Scheduled Job
```ataj
WHEN daily DO Cleanup
FOR each Task WHERE status = "stale" DO Delete
DO Audit and immutable
```

### Webhook Handler
```ataj
ON /stripe/webhook DO StripeEvent
IF payload.type = "payment.succeeded"
 DO CompleteOrder and idempotent
 Call order.mark_paid id = payload.id
DO Audit
```

---

*8 Keywords. Ship fast. Nothing breaks.*
