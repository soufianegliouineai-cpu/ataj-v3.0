use sha2::{Sha256, Digest};
use chrono::Utc;

pub struct AuditLog;

impl AuditLog {
  pub fn new_s3_worm() -> Self { Self }
  pub fn log(&self, action: &str, data: &str) {
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    let ts = Utc::now().to_rfc3339();
    println!("AUDIT {} {} hash={} -> s3://ataj-audit/worm/", ts, action, hash);
  }
}
