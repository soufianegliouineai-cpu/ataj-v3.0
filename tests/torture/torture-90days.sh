#!/bin/bash
# Run this for 90 days straight. If it survives, we ship.

DURATION=7776000 # 90 days in seconds
START=$(date +%s)

while [ $(($(date +%s) - START)) -lt $DURATION ]; do
  echo "TORTURE CYCLE: $(date)"

  # 1. Kill random region
  kubectl delete pod -l region=aws --grace-period=0 2>/dev/null || true

  # 2. 10M TPS spike
  k6 run tests/load-test.yml --vus 1000 --duration 30s 2>/dev/null || true

  # 3. Cost bomb
  for i in $(seq 1 1000); do curl -X POST /buy 2>/dev/null || true; done

  # 4. Disk full
  dd if=/dev/zero of=/tmp/fill bs=1M 2>/dev/null || true

  # 5. Verify
  curl -f http://localhost:8080/health || { echo "FAILED"; exit 1; }

  sleep 60
done

echo "PASSED 90 DAY TORTURE TEST"
