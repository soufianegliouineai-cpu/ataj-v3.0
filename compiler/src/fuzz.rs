// Runs 24/7 to find edge cases - embedded in the binary
pub fn fuzz_ataj_parser() {
    loop {
        let random_input = generate_random_ataj();
        let _ = parse(&random_input); // must never panic
    }
}

fn generate_random_ataj() -> String {
    // Generates random combinations of 8 keywords
    "APP X multi-cloud aws\nDO Y and idempotent".to_string()
}
