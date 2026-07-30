use std::time::Duration;
use tokio::time::interval;

#[tokio::main]
async fn main() {
    let mut ticker = interval(Duration::from_secs(5));
    loop {
        ticker.tick().await;
        check_cost();
        check_health();
        check_audit();
    }
}

fn check_cost() {
    // if spend > $900 -> alert CTO
}

fn check_health() {
    // if region down -> trigger failover
}

fn check_audit() {
    // ship logs to S3 WORM
}
