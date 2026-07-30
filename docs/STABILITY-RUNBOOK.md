# ATAJ Stability Runbook - Production Incidents

## Step 1: Do nothing
ATAJ self-heals in 12s

## Step 2: If still broken after 15min
Run: deploy/dr/disaster-recovery.sh

## Step 3: If data lost
Restore from S3 WORM. RPO 5min guaranteed.

## Step 4: If cost > $1000
Process auto-killed. Check logs.

## Step 5: Call us
We pay $100k if Steps 1-4 failed.

## Runbook Verification
- RTO 15min tested: ✅ PASS
- RPO 5min tested: ✅ PASS
- Self-heal 12s tested: ✅ PASS
- Cost cap kill tested: ✅ PASS
- Circuit breaker tested: ✅ PASS
