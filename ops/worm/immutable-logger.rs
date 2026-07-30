// Writes to S3 Object Lock - WORM, cannot delete for 7 years
pub fn log_audit(event: AuditEvent) {
    let s3 = S3Client::new();
    s3.put_object()
        .bucket("ataj-audit-worm")
        .key(format!("{}.json", uuid()))
        .body(event.to_json())
        .object_lock_mode("COMPLIANCE")
        .object_lock_retain_until_date("2033-04-08")
        .send();
}
