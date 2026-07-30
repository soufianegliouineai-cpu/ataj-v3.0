use rust_decimal::Decimal;
use crc32fast::Hasher;

pub struct Money {
 value: Decimal,
 checksum: u32,
}

impl Money {
 pub fn new(v: Decimal) -> Self {
 let mut hasher = Hasher::new();
 hasher.update(&v.to_string().as_bytes());
 Self { value: v, checksum: hasher.finalize() }
 }
 pub fn verify(&self) -> bool {
 let mut hasher = Hasher::new();
 hasher.update(&self.value.to_string().as_bytes());
 hasher.finalize() == self.checksum
 }
}
