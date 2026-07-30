# P1 INCIDENT PLAYBOOK - FOR YOUR SRE

## Symptom: API Down
1. `ataj-admin status`
2. If unhealthy: Wait 12s. Auto-failover triggers.
3. If >15min: Run `deploy/dr/disaster-recovery.sh`
4. Open ticket: "RTO SLA BREACH - \$10k"

## Symptom: Cost Spike
1. `ataj-admin cost`
2. If >\$900: Check logs for loop
3. If >\$1000: Process auto-killed. Safe.
4. Open ticket: "COST CAP BREACH - 100% REFUND"

DO NOT SSH. DO NOT RESTART MANUALLY. ATAJ HEALS ITSELF.
