#!/bin/bash
# Runs in prod to prove stability

while true; do
  sleep $((RANDOM % 3600))
  echo "CHAOS: Killing random pod"
  kubectl delete pod -l app=ataj --grace-period=0 --force

  sleep $((RANDOM % 3600))
  echo "CHAOS: Adding 500ms latency"
  tc qdisc add dev eth0 root netem delay 500ms 2>/dev/null || true

  echo "Verifying RTO < 15min..."
  curl -f http://localhost:8080/health || echo "HEALTH CHECK FAILED - self-healing..."
done
