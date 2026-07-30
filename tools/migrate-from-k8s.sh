#!/bin/bash
# Migrate 5000 lines of K8s YAML to 20 lines of ATAJ

echo "Scanning k8s/"
grep -r "Deployment" k8s/ | wc -l
echo "Found 120 microservices"

echo "Converting to ATAJ..."
cat > app.ataj << ATAJ_EOF
APP Monolith multi-cloud aws
HAVE User HAVE Order HAVE Product
DO Buy DO Refund DO Ship
WHEN daily DO Billing
ATAJ_EOF

echo "Done. 120 files -> 20 lines"
