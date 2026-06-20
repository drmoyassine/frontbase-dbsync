# Builder + SSR — Delivery Report (Sprints 1–3)

> **Commit:** `65ffa51` · **Branch:** `main` (fast-forward merged from `feat/builder-ssr-sprints`)
> **Track:** Builder + SSR · **Scope:** 16 points, 4 tasks · **Status:** ✅ Complete, shipped to `origin/main`

---

## Executive Summary

All three sprints of the Builder + SSR track are complete. Every change is type-checked, tested (176 frontend + 111 edge tests, all green), and the production build succeeds. Conditional Visibility (Task 4) was already implemented and is now verified with automated tests.

| Sprint | Task | Points | Status |
|--------|------|--------|--------|
| 1 | Canvas Re-render Optimization | 4 | ✅ |
| 1 | Verify Conditional Visibility | 1 | ✅ |
| 2 | Schema-Driven Properties | 5 | ✅ |
| 3 | Structural Layout Wrapper | 3 | ✅ |

---

## Sprint 1 — Canvas Re-render Optimization

**Root cause found beyond the backlog:** `DraggableComponent` subscribed to the **entire `pages` array**, so every component re-rendered on every keystroke regardless of memo. A custom comparator alone would not have fixed the cascade.

**Files**
- `src/lib/equality.ts` (new) + `equality.test.ts` (26 tests) — bounded `deepEqual` (bails on functions / class instances / React elements; recursion-bounded so circular payloads can't hang it).
- `src/components/builder/DraggableComponent.tsx` — custom `areDraggablePropsEqual` comparator; **removed the full-store `pages` + dead `moveComponent` subscription**; `isLastComponent` is now a parent-provided prop; memoized `handleDoubleClick`; `onSelect` passed directly as `onComponentClick`.
- `src/components/builder/ComponentRenderer.tsx` — custom `areComponentRendererPropsEqual` comparator.
- `src/components/builder/BuilderCanvas.tsx` — memoized `handleComponentClick` (`useCallback`) so `onSelect` is reference-stable; moved pure `findComponentById` to module scope; removed dead `moveComponent`; passes `isLastComponent`.

**Key correctness decisions**
- The comparator **reference-compares `component.children`** — structural sharing (`.map()` in `updateComponentInTree`) produces a new array ref whenever a descendant changes, which is how container edits propagate to their children. Deep-comparing `children` would have been wrong and expensive.
- Also compares `index` (drop-zone positions) and, added in Sprint 3, `layout`.

**Review note:** `onComponentClick` / `onDoubleClick` are destructured by `ComponentRenderer` but never consumed (not in `rendererProps`, no renderer uses them) — selection happens in `DraggableComponent`'s wrapper `onClick`. So passing `onSelect` directly is safe; no behavior change.

---

## Sprint 2 — Schema-Driven Properties

**Approach:** Built the schema engine and migrated the **6 genuinely-simple** components. Complex data-bound components (DataTable, Chart, Grid, KPICard, Repeater, Form, InfoList) and landing sections (Navbar, Footer, Pricing, LogoCloud, FeatureSection) keep their bespoke panels via a legacy switch fallback. This is the correct split — simple → declarative schema, complex → purpose-built editor.

**Files created**
- `src/components/builder/registry/propertySchemas.ts` — field-config type system + registry (`getPropertySchema` / `registerPropertySchema`) + schema definitions.
- `src/components/builder/SchemaDrivenProperties.tsx` — form engine; maps each field type (`text` / `input` / `textarea` / `number` / `select` / `boolean` / `color` / `icon`) to a shared primitive (VariableInput, Select, ColorInput, IconPicker, …), with `visible` conditional fields.
- `src/components/builder/properties/ColorInput.tsx` — reusable dual color-swatch + free-text control (extracted from BadgeProperties where it was triplicated).
- `src/components/builder/registry/propertySchemas.test.ts` — 8 tests locking in migrated field shapes.

**Files changed**
- `src/components/builder/PropertiesPanel.tsx` — `renderPropertyFields` is now schema-first; falls back to the legacy switch for components without a schema.
- `src/components/builder/properties/basic/index.ts` — dropped migrated exports.

**Files deleted** (migrated to schemas; no other consumers)
- `properties/basic/{Heading,Text,Link,Badge,Alert,Progress}Properties.tsx`

**Migrated components (6):** Heading, Text, Link, Progress, Alert, Badge. Each schema mirrors its previous panel's exact fields (incl. Badge's conditional icon fields and color inputs) — zero behavior change.

**Minor improvement (called out):** the number field uses `??` instead of the old `||`, so a Progress value of `0` now renders as `0` rather than falling back to `50` (the previous `props.value || 50` bug).

---

## Sprint 3 — Structural Layout Wrapper

**Approach:** A `LayoutShell` carries spatial tokens on a dedicated channel (`component.layout`), separate from the component's aesthetic styles (which stay on the component element). Layout-owning components are never wrapped. When no spatial tokens are present the shell renders `display: contents` — it generates no box, so there is **zero layout impact** on existing pages.

**Files created**
- `src/components/builder/layout/layoutTokens.ts` — `LAYOUT_COMPONENT_TYPES` (the no-wrap set), `LayoutTokens` interface, `hasLayoutTokens`, `layoutTokensToStyle`.
- `src/components/builder/layout/LayoutShell.tsx` — the wrapper.
- `src/components/builder/layout/layoutTokens.test.ts` (10 tests) + `LayoutShell.test.tsx` (5 tests).

**Files changed**
- `src/components/builder/ComponentRenderer.tsx` — wraps registry / Form / InfoList output in `LayoutShell` for non-layout types; reads `component.layout`; extended the Sprint 1 comparator to deep-compare `layout`.

**Review note — bug caught & fixed during review:** the first version put `fb-{id}` on the shell, but that class is **already** on `DraggableComponent`'s wrapper and is the hook used for **user raw-CSS scoping** (`BuilderCanvas.getAllRawCSS` rewrites `&` → `.fb-{id}`). Duplicating it would let user CSS mutate the shell and override `display: contents`. **Fixed** — the shell now carries only `fb-layout-shell`. A regression test locks this in.

**Intentional follow-up (documented):** no component populates `component.layout` yet, so the shell is `display: contents` everywhere today (= no change). Migrating existing margin/size values from `stylesData` into this dedicated channel, plus a layout-token editor in the styling panel, is the deferred next step — intentionally avoided so as not to touch every component's current rendering.

---

## Verification (final, post-review)

| Check | Result |
|-------|--------|
| Frontend `tsc --noEmit` | ✅ exit 0 |
| Frontend tests | ✅ 176 pass (15 files) |
| Frontend production build | ✅ ~14s |
| Edge `tsc --noEmit` | ✅ exit 0 |
| Edge tests | ✅ 111 pass (13 files) |

**New tests added (63 total):** `equality` (26), `propertySchemas` (8), `layoutTokens` (10), `LayoutShell` (5), visibility SSR (14, in edge).

---

## Commit details

- **Commit:** `65ffa51` — `feat(builder): schema-driven properties, render optimization, layout shell`
- 23 files changed (6 modified, 6 deleted, 11 added). Real diff ≈ 201 insertions / 77 deletions across the modified files (the larger raw stat on `ComponentRenderer.tsx` is benign `autocrlf` LF-normalization; real change 59/6, verified via `--ignore-all-space`).
- Fast-forward merged `feat/builder-ssr-sprints` → `main`; pushed `280612f..65ffa51` to `origin/main`; feature branch deleted.
- Only the implementation source + tests were committed. Pre-existing working-tree churn (root `.md` deletions, `fastapi-backend` change, `dist/` artifacts, edge bundles, `tsbuildinfo`) was left untouched.

---

## Known limitations / follow-ups

1. **Render optimization:** logic-verified; the final confirmation is a React DevTools profiling pass on a large page (needs the running app).
2. **Layout shell activation:** wire the styling panel to write spatial tokens into `component.layout` so the shell becomes functional (today it is `display: contents` everywhere by design).
3. **Schema migration tail:** the remaining complex components (DataTable, Chart, Grid, KPICard, Repeater, Form, InfoList, landing sections) intentionally remain on bespoke panels.
4. **Pre-existing lint:** one `no-case-declarations` error in the untouched `DataTable` switch case — out of scope, left as-is.

---

**Author:** Yassine · **Co-Authored-By:** Claude `<noreply@anthropic.com>`
