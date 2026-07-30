# ATAJ Oncall Runbook

## P1: Cost > $900
1. `ataj-admin cost`
2. Check logs for infinite loop
3. Runtime auto-kills at $1000

## P1: Region Down
1. `ataj-admin status`
2. If RTO > 15min, run `deploy/dr/disaster-recovery.sh aws-us-east-1`
3. Open $10k credit ticket

## P1: CVE
1. Patch in 24h
2. `docker pull ataj/ataj:3.0.1`
3. Claim $5k credit if >24h
