// If cost > $1000 or RTO > 15min, kill switch
pub fn emergency_kill(reason: &str) {
    eprintln!("EMERGENCY KILL: {}", reason);
    std::process::exit(137);
}
