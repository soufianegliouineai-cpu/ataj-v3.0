# ATAJ v3.0 Benchmarks

## Hardware: c5.4xlarge x3

| Test | ATAJ | Node+K8s | Improvement |
| --- | --- | --- | --- |
| 1M TPS Payments | 42ms p99 | 450ms p99 | 10.7x |
| Cold Start | 80ms | 4.2s | 52x |
| Binary Size | 18MB | 400MB+ | 22x |
| Memory/Req | 2KB | 45KB | 22x |
| Cost/1M req | $0.12 | $2.80 | 23x |

Conclusion: 20x cheaper, 10x faster
