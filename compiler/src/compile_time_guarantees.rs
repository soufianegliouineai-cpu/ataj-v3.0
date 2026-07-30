// These fail to compile if guarantees are broken
const _: () = assert!(KEYWORD_COUNT == 8); // Fails if 9th added
const _: () = assert!(MAX_BINARY_SIZE_MB < 20); // Fails if bloat
const _: () = assert!(HAS_COST_GUARD == true); // Fails if removed

#[cfg(not(feature = "lts"))]
compile_error!("LTS mode must be enabled for v3.0");
