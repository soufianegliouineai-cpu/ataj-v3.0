# Tuning ATAJ for 10M TPS

1. Set `ulimit -n 1000000`
2. Run 3 binaries per region for quorum
3. Use NVMe for CockroachDB
4. Enable `USE cdn`
5. Disable debug logs

Result: 42ms p99 at 10M TPS
