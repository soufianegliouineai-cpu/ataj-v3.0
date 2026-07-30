# ATAJ LANGUAGE SPEC v3.0

## Grammar
Program:= APP_DEF USE* HAVE* SHOW* DO* WHEN* ON*
APP_DEF:= "APP" IDENT "multi-cloud" CLOUD+
HAVE:= "HAVE" IDENT "with" FIELD+
FIELD:= IDENT TYPE ["secure"]
DO:= "DO" IDENT ["and" MODIFIER+] BODY
MODIFIER:= "idempotent" | "circuit" | "bulk" | "approval" | "immutable" | "self-heal"
USE:= "USE" IDENT ["PIN" VERSION]
WHEN:= "WHEN" CRON "DO" IDENT
ON:= "ON" EVENT "DO" IDENT

## Runtime Semantics
1. Every DO is retried 5x exponential
2. Every DO is written to immutable audit log
3. Every decimal has ECC + CRC32
4. Every USE is version pinned and sandboxed
5. cost-cap kills process at $1000/day
