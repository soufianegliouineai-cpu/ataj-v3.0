# ATAJ v3.0 Architecture

```
[Client] -> [ATAJ Binary 18MB]
 |
 +-----------+-----------+
 | | |
 [AWS] [GCP] [Azure]
 | | |
 [CockroachDB RAFT Quorum]
 |
 [S3 WORM Audit]
```

Deployment: Active-Active across 3 clouds
Failover: 8 seconds
RPO: 5 minutes
RTO: 15 minutes
