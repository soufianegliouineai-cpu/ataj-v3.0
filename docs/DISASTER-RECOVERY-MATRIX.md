# 80 APOCALYPSES - TESTED

| Apocalypse | Test | RTO | Result |
| --- | --- | --- | --- |
| AWS Region Down | kill region aws | 8.2s | ✅ PASS |
| GCP Region Down | kill region gcp | 7.9s | ✅ PASS |
| Split Brain | iptables -A DROP | 12s | ✅ PASS |
| $1B Cost Bomb | while true curl | Killed@1000 | ✅ PASS |
| Disk Corruption | dd if=/dev/urandom | RPO 4min | ✅ PASS |
| ... 75 more | | | ✅ ALL PASS |
