#!/bin/bash
# Runs every Sunday. Sends hash to 3 external auditors.

HASH=$(sha256sum target/release/atajc | awk '{print $1}')
DATE=$(date +%Y-%m-%d)

echo "Submitting $HASH to auditors..."
curl -X POST https://audit.bishopfox.com/submit -d "hash=$HASH&date=$DATE" 2>/dev/null || true
curl -X POST https://audit.nccgroup.com/submit -d "hash=$HASH&date=$DATE" 2>/dev/null || true
curl -X POST https://audit.cure53.de/submit -d "hash=$HASH&date=$DATE" 2>/dev/null || true

echo "If any auditor finds diff, we freeze and pay \$100k"
