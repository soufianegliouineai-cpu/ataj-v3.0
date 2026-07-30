use std::sync::atomic::{AtomicU32, Ordering};

pub struct CircuitBreaker {
  failures: AtomicU32,
  threshold: u32,
}

impl CircuitBreaker {
  pub fn new(threshold: u32) -> Self {
    Self { failures: AtomicU32::new(0), threshold }
  }
  pub fn is_open(&self) -> bool {
    self.failures.load(Ordering::SeqCst) >= self.threshold
  }
  pub fn record_success(&self) {
    self.failures.store(0, Ordering::SeqCst);
  }
  pub fn record_failure(&self) {
    self.failures.fetch_add(1, Ordering::SeqCst);
  }
}
