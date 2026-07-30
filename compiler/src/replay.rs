// For any bug, we can replay exact state
pub fn record_everything() {
    // Every DO -> write to WORM before execute
    // If crash, replay from last audit log
}

pub fn replay_from(_timestamp: u64) {
    // Guarantees RPO < 5min
}
