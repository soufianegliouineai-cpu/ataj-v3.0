#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn idempotent_never_double_charges(key in "\\PC*") {
            assert!(check_idempotency(&key));
        }
    }
}

// Run: cargo test proptests -- --test-threads=1 1M iterations
