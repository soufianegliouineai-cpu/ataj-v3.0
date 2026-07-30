# ATAJ Error Handling Guide

## Compiler Errors

### "9th keyword detected"
**Cause**: You used a keyword other than the 8 allowed ones.
**Fix**: Replace with one of: `APP`, `HAVE`, `SHOW`, `DO`, `WHEN`, `ON`, `USE`, `multi-cloud`

### "missing PIN on USE"
**Cause**: A `USE` statement doesn't have a version pin.
**Fix**: Add `PIN x.y.z` — e.g., `USE stripe PIN 1.2.3`

### "duplicate DO name"
**Cause**: Two DO blocks with the same name in the same APP.
**Fix**: Rename one or merge them.

### "approval from 0"
**Cause**: Approval count set to 0 or negative.
**Fix**: Use `approval from 1 CFO` (minimum 1)

### "unknown type in HAVE"
**Cause**: Field type not in the allowed list.
**Fix**: Use one of: `string`, `decimal`, `uuid`, `int`, `bool`, `timestamp`, `enum`

### "no APP declaration"
**Cause**: No `APP` statement at the top of the file.
**Fix**: Add `APP <name> multi-cloud <cloud>` as first line.

### "UNSAFE without review"
**Cause**: `UNSAFE` modifier used but no code review gate configured.
**Fix**: Ensure 2 exec approvals before executing, or remove `UNSAFE`.

## Runtime Errors

### "CIRCUIT OPEN"
**Cause**: An external call failed 5 times in a row.
**Fix**: Wait 30s for half-open probe, or manually retry after fixing the service.

### "COST CAP HIT"
**Cause**: Daily spend exceeded $1000.
**Fix**: Check for infinite loops. Process is auto-killed. Safe.

### "IDEMPOTENT KEY CONFLICT"
**Cause**: Same idempotency key submitted twice.
**Fix**: First execution returned cached result. No data was duplicated. This is correct behavior.

### "APPROVAL PENDING"
**Cause**: A DO requires signatures from a role who haven't approved yet.
**Fix**: Request approval from the required role members.

### "DRIFT DETECTED"
**Cause**: Binary hash doesn't match golden hash.
**Fix**: Rebuild from source. The drift detector caught a modified binary.

## Debugging Tips

1. **Check audit logs**: Every DO writes to S3 WORM. Query there.
2. **Check health**: `atajc test --tier all` runs full diagnostics.
3. **Check cost**: `ataj-admin cost` shows current spend.
4. **Check circuit state**: `ataj-admin status` shows all services.
5. **Rerun on clean state**: Delete and recreate the APP — `atajc run --fresh`.

## Prevention Tips

- Always use `and idempotent` on payment DOs
- Always use `and circuit` on external calls
- Always use `PIN` on USE statements
- Always put `approval from N` on financial operations
- Never use `UNSAFE` without code review
- Never use more than 8 keywords
