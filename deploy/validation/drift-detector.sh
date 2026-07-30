#!/bin/bash
# Runs hourly. If prod drifts from v3.0.0, alert.

CURRENT_HASH=$(sha256sum target/release/atajc 2>/dev/null | awk '{print $1}')
GOLDEN_HASH="9f8e7d6c5b4a3928172635445566778899aabbccddeeff"

if [ "$CURRENT_HASH" != "$GOLDEN_HASH" ]; then
  echo "CRITICAL: BINARY DRIFT DETECTED" | pagerduty-critical
fi
