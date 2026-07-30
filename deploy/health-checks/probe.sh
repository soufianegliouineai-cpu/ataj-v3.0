#!/bin/bash
# Run this every 30s from your monitoring

HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health)
COST=$(curl -s http://localhost:9090/metrics | grep cost_usd | awk '{print $2}')

if [ "$HEALTH" != "200" ]; then
 echo "ALERT: ATAJ DOWN" | pagerduty-trigger
fi

if (( $(echo "$COST > 900" | bc -l) )); then
 echo "ALERT: COST > \$900" | pagerduty-trigger
fi
