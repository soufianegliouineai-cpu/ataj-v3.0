use std::collections::HashSet;
use std::sync::Mutex;

lazy_static! {
    static ref SEEN_KEYS: Mutex<HashSet<String>> = Mutex::new(HashSet::new());
}

pub fn check_idempotency(key: &str) -> bool {
    let mut set = SEEN_KEYS.lock().unwrap();
    if set.contains(key) {
        return false;
    }
    set.insert(key.to_string());
    true
}
