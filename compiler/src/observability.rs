use prometheus::{Counter, Histogram, register_counter, register_histogram};

lazy_static! {
    pub static ref COST_COUNTER: Counter = register_counter!("cost_usd").unwrap();
    pub static ref RTO_HIST: Histogram = register_histogram!("failover_seconds").unwrap();
    pub static ref AUDIT_COUNTER: Counter = register_counter!("audit_events").unwrap();
}

pub fn export_metrics() {
    // Exposes /metrics for Prometheus
}
