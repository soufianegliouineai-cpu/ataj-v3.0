use std::sync::atomic::{AtomicF64, Ordering};

pub struct CostGuard {
  spend_today: AtomicF64,
  cap: f64,
}

impl CostGuard {
  pub fn new(cap: f64) -> Self {
    Self { spend_today: AtomicF64::new(0.0), cap }
  }
  pub fn charge(&self, amount: f64) {
    let new = self.spend_today.fetch_add(amount, Ordering::SeqCst) + amount;
    if new > self.cap {
      panic!("COST CAP HIT: ${:.2}. Killing process", new);
    }
  }
  pub fn today_spend(&self) -> f64 {
    self.spend_today.load(Ordering::SeqCst)
  }
}
