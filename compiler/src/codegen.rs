use quote::quote;
use proc_macro2::TokenStream;
use crate::ast::Stmt;

pub fn generate(stmt: Stmt) -> TokenStream {
 match stmt {
 Stmt::Do { name, modifiers,.. } => {
 let is_idem = modifiers.contains(&"idempotent".to_string());
 let is_circuit = modifiers.contains(&"circuit".to_string());
 quote! {
 #[retry(max_attempts = 5)]
 #[audit]
 async fn #name() -> Result<(), Box<dyn std::error::Error>> {
 if #is_idem { check_idempotency()?; }
 if #is_circuit { circuit_guard()?; }
 Ok(())
 }
 }
 }
 _ => quote!{}
 }
}
