#!/bin/bash
set -e
echo "ATAJ v3.0 Quickstart"
docker build -t ataj:3.0 .
docker run -p 8080:8080 ataj:3.0 run examples/shopify.ataj
echo "Shopify running on http://localhost:8080"
echo "Run 'ataj-admin status' to check health"
