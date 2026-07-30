#!/bin/bash
set -e
echo "Building ATAJ v3.0 static binary..."
rustup target add x86_64-unknown-linux-musl
cargo build --release --target x86_64-unknown-linux-musl
strip target/x86_64-unknown-linux-musl/release/atajc
mv target/x86_64-unknown-linux-musl/release/atajc target/release/atajc
echo "Done. Size:"
ls -lh target/release/atajc
