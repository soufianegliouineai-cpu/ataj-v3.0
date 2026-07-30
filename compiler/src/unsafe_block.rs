// UNSAFE BLOCK - VOIDS $100K WARRANTY
// Must be manually audited by 2 engineers

pub fn unsafe_block<F: FnOnce()>(f: F) {
  eprintln!("WARNING: EXECUTING UNSAFE BLOCK");
  f();
}
