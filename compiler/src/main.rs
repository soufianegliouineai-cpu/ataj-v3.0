mod ast;
mod codegen;
mod runtime;
mod cli;
mod decimal;
mod tests;
mod circuit;
mod audit;
mod cost;
mod unsafe_block;
mod parser;
mod idempotency;
mod observability;
mod network;
mod emergency_kill;

fn main() {
    cli::run();
}
