# ATAJ v3.1.1 - Agent System Prompt (Iron Clad)

## LAW 1: ATAJ HAS 8 KEYWORDS ONLY

`APP HAVE SHOW DO WHEN ON USE AGENT`

That is **all**. These are the only allowed keywords in `.ataj` files.

### ❌ BANNED Keywords (will be rejected by compiler)
- `API` → Use `DO` + `DB.Query` instead
- `PAGE` → Use `SHOW` + `ON Click DO` instead
- `ROUTE` → Use `SHOW` + `ON Click DO` instead
- `CALL` → Use `DO` + service name instead
- `ENUM` → Use string values in HAVE declarations
- `WEBSOCKET` → Compiler handles via `--target cloud`
- `START_SERVER` → Compiler handles via `--target aws`
- `CORS` → Compiler handles via `--target cloud`
- `SECURITY` → Compiler handles via `--target cloud`
- `circuit`, `idempotent`, `approval` → Compiler handles via `--target aws`

### Why these are banned
```
CALL = 9th keyword → violates 8-keyword freeze
API = framework keyword → ATAJ is not a framework
PAGE = routing keyword → ATAJ compiles to everything
ROUTE = framework keyword → ATAJ has no framework
ENUM = type system keyword → ATAJ uses HAVE with string values
```

## LAW 2: ATAJ COMPILES TO EVERYTHING

| ATAJ Keyword | Compiles To |
|-------------|-------------|
| `DO GetMenu` | Backend API endpoint at `/api/menu` |
| `DO HandleClick` | Frontend event handler |
| `SHOW Hero` | React component for hero section |
| `SHOW Grid 3` | Frontend grid layout |
| `HAVE Order with status` | DB table + state type |
| `WHEN 00:00 DO` | Cloud scheduler (cron) |

### Example: Restaurant menu endpoint

**WRONG** (adds API/ROUTE keywords):
```ataj
API "/menu" GET DO GetMenu
PAGE Menu with template "menu.html"
ROUTE "/menu" GET DoRenderMenu
```

**RIGHT** (8 keywords only):
```ataj
DO GetMenu
 DO DB.Query "SELECT * FROM menu_items"
 DO Cache.Set "menu:cache" 1800
 DO Emit menu.items_loaded

SHOW Grid 3 6
 FOR EACH item IN MenuItem
 SHOW Card item.name item.price
```

The compiler handles the rest. `DO GetMenu` → `/api/menu` endpoint. `SHOW Card` → React component.

## LAW 3: NO FRAMEWORK CODE IN .ataj FILES

No `CORS`, `START_SERVER`, `WEBSOCKET`, `SECURITY`, or framework-level configuration in `.ataj` source files.

These are handled by compiler flags:
```bash
atajc app.ataj --target aws --target react
```

The `--target` flag tells the compiler what infrastructure to generate, not the `.ataj` file.

## LAW 4: ONLY 3 ALLOWED SYNTAX FIXES

The ATAJ v3.1.1 Iron Clad spec allows exactly 3 syntax corrections:
1. `FOR each` → `FOR EACH` (17 files)
2. `DORe` → `DO` (1 file)
3. `DO.Emit` → `DO Emit` (2 files)

Nothing else is changed in the language specification.

## LAW 5: 15 COMPONENTS MAX, 15 TOKENS MAX

- Components: max 15 (cards, grids, buttons, inputs, modals, etc.)
- Tokens: max 15 (colors, spacing, typography, shadows, etc.)
- These are fixed and frozen

## LAW 6: BINARY SIZE < 25MB

Any compiled binary must be under 25MB. The language runtime is lightweight by design.

## LAW 7: CI/CD STAYS IN COMPILER, NOT IN .ataj FILES

Deployment automation (GitHub Actions, Vercel, etc.) is in the compiler/config, not in the `.ataj` source files.

---

## TEST: IS THIS VALID ATAJ SOURCE?

### ❌ INVALID (violates laws)
```ataj
API "/menu" GET DO GetMenu
PAGE Menu ROUTE "/menu"
CALL audit.log action = "LIST"
ENUM Status with "active" "inactive"
```

### ✅ VALID (8 keywords only)
```ataj
DO GetMenu
 DO DB.Query "SELECT * FROM menu_items"
 DO Audit.Log "MENU_VIEWED"
 DO Emit menu.loaded

SHOW Grid 3 6
 FOR EACH item IN MenuItem
 SHOW Card item.name item.price
```

---

## ROLLBACK CHECKLIST

If you see any of these, the agent violated the contract:
```bash
# Check 1: No banned keywords
grep -r "API\|PAGE\|ROUTE\|CALL\|ENUM\|WEBSOCKET\|START_SERVER\|CORS\|SECURITY" *.ataj
# Expected: empty

# Check 2: Only 8 keywords used
grep -orh 'APP\|HAVE\|SHOW\|DO\|WHEN\|ON\|USE\|AGENT' *.ataj | sort | uniq
# Expected: exactly 8 unique values

# Check 3: ataj audit passes
ataj audit
# Expected: Keywords: 8/8, Components: ≤15, Tokens: ≤15, Status: FROZEN

# Check 4: Binary size check
ls -la compiled/ataj-binary
# Expected: < 25MB
```

---

## Summary

ATAJ v3.1.1 is like `gcc`, `rustc`, or `go` — a compiler that takes 8 keywords and produces complete applications. No framework dependencies. No keyword creep. No bloat. Just 8 keywords → compiled output.

When in doubt: use only `APP HAVE SHOW DO WHEN ON USE AGENT`. Everything else is a compiler flag, not source code.