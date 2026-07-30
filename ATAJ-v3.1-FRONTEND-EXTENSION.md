*MASTER PROMPT FOR AGENT: ATAJ v3.1 FRONTEND EXTENSION*

ROLE: You are the ATAJ v3.1 Language Architect.

CONTEXT:
ATAJ v3.0 LTS is FROZEN. 8 backend keywords only. Zero breaking changes until 2031.
We now need to add FRONTEND DESIGN keywords in a new v3.1 extension.
Goal: Let users and devs design components, cards, pages, navs with 1 line of ATAJ.
Must feel like Tailwind + React + Flutter but 10x simpler.

CONSTRAINTS - DO NOT VIOLATE:
1. Backend 8 keywords remain FROZEN. No changes.
2. New frontend keywords must be prefixed `UI_` to avoid collision.
3. Compiler must still pass all 80 backend tests + torture tests.
4. Generated code must be React + Tailwind. No runtime. Static build.
5. RTO/RPO/Cost guarantees still apply.

TASK: DESIGN AND IMPLEMENT ATAJ v3.1 FRONTEND DSL

#### STEP 1: ADD 8 NEW UI KEYWORDS
Add these to grammar, parser, codegen. Do not touch backend keywords.

| Keyword | Purpose | Example |
| --- | --- | --- |
| `PAGE` | Define route/page | `PAGE Home and public` |
| `CARD` | Reusable component | `CARD Product with title image price` |
| `NAV` | Navbar with links | `NAV Main with Home About Contact` |
| `GRID` | Grid layout | `GRID Products and 3 columns gap 4` |
| `FLEX` | Flex layout | `FLEX Header and row justify-between` |
| `STYLE` | Inline styles/tokens | `STYLE Primary and bg-blue text-white` |
| `STATE` | Local UI state | `STATE cart and []` |
| `EVENT` | UI events | `EVENT onClick and AddToCart` |

#### STEP 2: UPDATE GRAMMAR
File: `compiler/src/grammar.lalrpop`
Add rules for the 8 UI keywords. Grammar must be backwards compatible.

#### STEP 3: CODEGEN TO REACT + TAILWIND
File: `compiler/src/codegen/frontend.rs`
Each keyword → 1 React component + Tailwind classes.
Example:
`CARD Product with title image price`
→
```tsx
export function ProductCard({title, image, price}: Props) {
 return <div className="rounded-lg shadow p-4">
 <img src={image}/>
 <h3>{title}</h3>
 <p>{price}</p>
 </div>
}

STEP 4: DESIGN SYSTEM TOKENS
File: `compiler/src/design_system.rs`
Pre-built tokens: `Primary`, `Danger`, `Card`, `Nav`, `Grid3`, `FlexCenter`
Devs can do: `STYLE Primary` instead of writing classes

STEP 5: EXAMPLES
File: `examples/frontend/ecommerce.ataj`

APP Shop frontend react

PAGE Home and public
 FLEX Header and row justify-between
 NAV Main with Home Products Cart

 GRID Products and 3 columns gap 6
 FOR product in products DO
 CARD Product with product.title product.image product.price
 EVENT onClick and AddToCart product.id

Compile → `shop-home.tsx` with Tailwind

STEP 6: TESTS
Add 20 new tests in `tests/frontend/`
1. `PAGE` compiles to http://Next.js route
2. `GRID` → `grid grid-cols-3 gap-6`
3. `STATE` → `useState`
4. `EVENT` → `onClick={}`
5. Must pass `npm run build` with 0 errors

STEP 7: BACKWARDS COMPAT
Run full `make stability`. Backend tests must still be 80/80.
Frontend is additive only. v3.0 apps must still compile.

OUTPUT:
1. Updated `compiler/src/grammar.lalrpop`
2. New `compiler/src/codegen/frontend.rs`
3. New `compiler/src/design_system.rs`
4. 20 tests in `tests/frontend/`
5. `examples/frontend/ecommerce.ataj`
6. Update `README.md` with UI keyword docs

VALIDATION:
Run `cargo test && npm run build && bash tests/torture/torture-90days.sh`
If green, tag `v3.1.0-frontend`

DO NOT add runtime. DO NOT add 9th backend keyword. ONLY UI_ namespace.

---

### **WHY THIS IS SAFE**
1. **Namespace isolation**: `UI_PAGE` vs `PAGE` - no collision
2. **Compile time only**: Generates static React. No new runtime to break RTO
3. **Versioned**: `v3.1` not `v3.0`. LTS v3.0 still frozen
4. **Optional**: Backend-only apps never import frontend compiler

### **WHAT DEVS GET AFTER THIS**
```ataj
PAGE Dashboard
 FLEX Topbar and row justify-between
 GRID Stats and 4 columns
 CARD Revenue with "$14M"
 CARD Users with "40k"
 NAV Sidebar with Analytics Users Settings

→ 1 file → Full responsive dashboard

---

Send that prompt to your agent.

After it runs, we add 1 more file: `ops/reports/daily-stability-report.sh v2` to also check `npm run build` passes.

Want me to also draft `UI_COMPONENT_LIBRARY.md` with 50 prebuilt CARD/NAV components?
