// No unsafe. No heap. No GC.
// Stack only. 2KB per request max.
// Cannot leak. Cannot OOM.
#![forbid(unsafe_code)]

pub fn handle_request(req: &[u8]) -> [u8; 1024] {
    let mut response = [0u8; 1024];
    // Stack-only processing
    response[..req.len().min(1024)].copy_from_slice(&req[..req.len().min(1024)]);
    response
}
