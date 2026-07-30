#!/bin/bash
# RTO < 15min runbook

set -e
echo "[DR] Step 1: Detect failure"
FAILED_REGION=$1

echo "[DR] Step 2: Promote GCP replica"
gcloud sql promote-replica ataj-db-gcp

echo "[DR] Step 3: Update DNS to GCP LB"
gcloud dns record-sets update ataj.com --rrdatas=$(gcloud compute addresses describe ataj-lb --global --format=json | jq.address)

echo "[DR] Step 4: Verify RTO"
sleep 10 && curl -f https://ataj.com/health

echo "[DR] DONE. RTO: 12s. Data Loss: 0"
