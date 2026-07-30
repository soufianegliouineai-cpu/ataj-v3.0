use std::env;
use crate::runtime;
use crate::tests;

pub fn run() {
 let args: Vec<String> = env::args().collect();
 match args.get(1).map(|s| s.as_str()) {
 Some("run") => runtime::run_file(&args[2]),
 Some("deploy") => runtime::deploy(),
 Some("test") => tests::run_all(),
 Some("audit") => runtime::audit(),
 _ => println!("Usage: atajc <run|deploy|test|audit> <file>")
 }
}
