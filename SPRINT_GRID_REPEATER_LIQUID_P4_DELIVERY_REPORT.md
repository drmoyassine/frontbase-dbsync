# Delivery Report — Grid/Repeater + Visual Liquid + Phase‑4 Tail

> Implementation report for the sprint plan at
> [`docs/plans/sprint_grid-repeater-liquid-p4.md`](docs/plans/sprint_grid-repeater-liquid-p4.md)
> *(local working doc — `docs/` is gitignored).*
>
> All 10 stages shipped. Verified on `main` @ `2026‑06‑20`.
> Validation: `tsc --noEmit` clean across root app + `services/edge` + `@frontbase/form`
> + `@frontbase/liquid-core`; 41 tests pass (34 new in `liquid-core`, incl. 4 parity + 1
> DoS-limit; 7 pre-existing).

---

## 1. Summary

A single sprint that lands three intertwined features on **one shared Liquid core** so the
builder canvas and the published edge page render identically, plus a new **Repeater**
component (with a "Convert / Wrap" action), **Grid** render polish, **logic-snippet**
authoring, and the cheap **Phase‑4 tail**.

The unifying architectural decision: Liquid engine config + filters + DoS limits now live in
**`@frontbase/liquid-core`**, consumed by the edge SSR, the builder preview, and record-token
resolution — one engine, three surfaces, identical output.

---

## 2. Stage-by-stage

### Stage 1 — `@frontbase/liquid-core` (foundation)
- New package `packages/liquid-core/`: `createLiquidEngine`, `registerFrontbaseFilters`
  (moved verbatim out of `services/edge/src/ssr/lib/liquid.ts`), `renderSafe` (DoS limits +
  per-engine compiled-template LRU cache), and a synchronous `renderSync` /
  `isSimpleInterpolation` fast-path.
- Wired into **all 5** resolution configs: root `tsconfig.json`, `tsconfig.app.json`,
  `vite.config.ts`, `services/edge/tsconfig.json`, `services/edge/vite.config.ts`, plus
  `vitest.config.ts`. Added `liquidjs` to root deps (the builder Vite app needs it for preview).
- `services/edge/src/ssr/lib/liquid.ts` now re-exports the shared filters; the `liquid`
  instance + `parseAndRender` + `Liquid` exports are preserved, so SSR callers are unchanged.
- **Key engineering findings (not in the plan):**
  1. LiquidJS render pumps loops **synchronously** within the microtask queue, so an external
     `setTimeout` deadline never fires — a 10M-iteration loop ran to completion under a naive
     timeout. Routed instead to LiquidJS's **internal** `templateLimit` + `renderLimit`
     (enforced inside the render pump). Runaway loop now aborts in ~400ms.
  2. The repo has **two physical `liquidjs` copies** (root + `services/edge`); their `Liquid`
     class types are structurally incompatible. Solved with a structural `LiquidEngine`
     interface so the shared functions accept either copy without a type conflict.
- Tests: `sync`, `filters`, `limits` (incl. runaway-loop, depth, length, cache), `parity`.

### Stage 2 — Grid Track A (A3 → A1 → A2)
- **A3** column order: `getVisibleColumns()` honors `binding.columnOrder` (fallback to row keys),
  filtered by `visible` + presence. *(Plan claimed a `.slice(0,4)`; the real code already showed
  all columns — the actual fix was ordering.)*
- **A1** `showLabel` per column: added to `ColumnOverride` (`@frontbase/types`), a Switch in
  `DraggableColumnItem`, label span dropped in `Grid.tsx` when `false`.
- **A2** Logo / cover: `image` relabeled **"Logo"** (stored value unchanged), new **"Image (cover)"**
  full-bleed banner rendered above the card header, excluded from the value list.
- **Deviation (documented):** the SSR `renderDataGrid` is **skeleton-only** (the established
  pattern for all data components — real data renders client-side after hydration), so there was
  nothing data-specific to mirror in SSR and **no edge rebuild was required** for Track A.

### Stage 3 — syntaxContext
- New shared `src/lib/liquid/syntaxContext.ts` (`SyntaxContext`, `filtersAllowedForContext`,
  `logicAllowedForContext`). Threaded through `VariableInput` → `VariablePicker`.
- **`expression`** context (visibility/RLS) gates filters off. Default `scalar` preserves prior
  behavior; tagging a field `output` vs `scalar` has zero behavior change at this stage (it only
  governs Stage 6 logic snippets).
- Tagged call sites: Text/Heading/Badge/Button/Card titles + Display/FeatureSection/PropertiesPanel
  titles → `output`; VisibilityConditionEditor → `expression`; HiddenFiltersEditor → `scalar`.
  SEO fields in PageSettingsDrawer intentionally left at default `scalar` (logic tags don't belong
  in meta tags).

### Stage 4 — Repeater (builder) + record context
- `RecordContext` (provider + `useRecord`). `RepeaterRenderer`: fetches rows via
  `@frontbase/grid`'s `useGridQuery`; **edit mode** renders the editable template once (design
  surface, `{{record.*}}` resolving against the first row); **preview mode** repeats per row.
  Layout `grid`/`list`, columns 1–4, gap.
- Registered in palette/registry/defaults; `RepeaterProperties` (Data/Options tabs; layout =
  Display Mode / Columns / Gap; no column configurator — the template is free-form).
- Routed through the container path in `DraggableComponent` so the template is an editable drop
  surface. SSR skeleton added (`renderRepeater`).
- **B2 record-token pass** in `ComponentRenderer.effectiveProps`: resolves simple `{{record.*}}`
  via `renderSync` (sync fast-path); strings with `{% %}` are left untouched (Stage 7 renders
  those). Guarded on `record` presence so non-Repeater components are unaffected.

### Stage 5 — `record.*` drilldown
- `useRepeaterRecordColumns(componentId?)`: tree-walks to the nearest ancestor Repeater, reads
  its binding, returns its columns (columnOrder, else schema). `VariableInput` derives this from
  the selected component; the picker's Record group lists real `{{ record.<col> }}` entries
  instead of a placeholder.

### Stage 6 — Logic & Loops snippets
- `__logic` pseudo-group shown **only in `output`** context. Snippets: If, If/Else, Unless, For
  loop, Case/When, Assign — multi-line, with **`caretOffset`** cursor placement at the first
  logical gap (no invalid `@placeholder`). `@if`/`@for` discoverable via the existing search.
- Extended `VariableInput.handleSelect` to accept `caretOffset` and set the selection after
  insertion (variables/filters still place the caret at the end of the inserted text).

### Stage 7 — Builder preview parity
- `useLiquidPreview(template)`: renders `output` strings through the shared core against a
  synthesized preview context (per-`Variable.type` samples) **merged with `useRecord()`**.
  Sync fast-path for simple `{{ }}`; async `renderSafe` for tags/loops; structured `{ ok, error }`
  drives a non-blocking red-wavy-underline + tooltip.
- Wired into Text/Heading/Badge/Button/Card via a new `displayText`/`error` pair on
  `createEditableText` (preview shown when not editing; the raw template is still edited inline).
- **Parity guarantee:** SSR and preview both call the shared core, so output is identical for
  identical context. `packages/liquid-core/src/__tests__/parity.test.ts` asserts representative
  templates (for/if/filters/record).

### Stage 8 — Convert / Wrap to Repeater
- **Prerequisite:** added a tree-aware `replaceComponent(componentId, newComponent)` to the
  builder store (the source plan assumed it existed — it didn't).
- `canConvertToRepeater` predicate: Grid/DataTable with `tableName` binding (Mode A) **or**
  Container/Row/Column/Card (Mode B). KPICard/Chart/Form/InfoList and leaves are not offered.
  *(Field is `tableName`, not `table` — corrected from the plan.)*
- `convertToRepeater.ts`: Mode A copies the binding and seeds a card template from columns
  (cover→Image, first text→Heading, rest→labeled Texts); Mode B wraps the source **verbatim**
  as the template (fresh id), no binding → selecting it surfaces the data-source picker.
- **Mode B record tokens are the user's job — no auto-bind** (decided). The properties hint
  points them at the `record.*` picker.
- Mode-aware button ("Convert to Repeater" / "Repeat for each row") in the PropertiesPanel
  header, shown only when the predicate passes.

### Stage 9 — Published Repeater (edge)
- **Finding:** the edge has **no client React for layout/basic primitives** (Text/Heading/Card
  are SSR-static HTML), and **no data component fetches at SSR** (all skeleton + client-hydrate).
  So the published Repeater renders its template **client-side per row** (not via SSR data-fetch,
  which would be a new, inconsistent capability).
- Built `services/edge/src/components/repeater/`: `RecordContext`, `RenderNode` (recursive
  renderer for the common template primitives, resolving `{{record.*}}` via the shared core),
  and `Repeater` (fetches rows via `useGridQuery` edge mode, repeats the template per row).
- Registered in `services/edge/src/client/entry.tsx`; the template subtree is passed from
  `__PAGE_DATA__` as `props.template`. **Edge client bundle rebuilt** (`public/react/hydrate.js`).

### Stage 10 — Phase‑4 tail
- **P2‑3 (form label rich text):** added a clean `labelRenderer` IoC seam to `@frontbase/form`
  (non-regressing; default `<label>` unchanged) and wired an `InlineLabel` (Tiptap
  `InlineTextEditor`) in the builder `Form` wrapper. Labels were already editable via the
  settings popover; this adds inline editing without regressing it.
- **P2‑2 (`React.memo` comparators):** profile-first. No interactive React-DevTools profiling was
  possible in the implementation environment, so per the plan **no speculative `arePropsEqual`
  was added**; the policy is documented at the `React.memo` sites in `ComponentRenderer` and
  `DraggableComponent`.

---

## 3. Files touched

**New**
- `packages/liquid-core/**` (package + engine/filters/sync/limits/types + 4 test files)
- `src/components/builder/context/RecordContext.tsx`
- `src/components/builder/renderers/data/RepeaterRenderer.tsx`
- `src/components/builder/properties/basic/RepeaterProperties.tsx`
- `src/components/builder/hooks/useRepeaterRecordColumns.ts`
- `src/lib/liquid/syntaxContext.ts`, `src/lib/builder/{canConvertToRepeater,convertToRepeater}.ts`
- `src/hooks/useLiquidPreview.ts`
- `services/edge/src/components/repeater/{RecordContext.ts,RenderNode.tsx,Repeater.tsx}`

**Modified (notable)**
- Shared-core wiring: 5 tsconfig/vite configs + `vitest.config.ts`; root `package.json` (+`liquidjs`);
  `services/edge/src/ssr/lib/liquid.ts`; `services/edge/src/client/entry.tsx`;
  `services/edge/src/ssr/components/data.ts` (Repeater case + skeleton).
- Types: `packages/types/src/index.ts` (`ColumnOverride`), `packages/form/src/{Form.tsx,types.ts}`
  (`labelRenderer`), `packages/grid/src/Grid.tsx` (Track A).
- Builder: `ComponentRenderer`, `DraggableComponent`, `ComponentPalette`, `VariableInput`,
  `VariablePicker`, `renderers/types.ts`, the 5 content renderers, `PropertiesPanel`,
  `useComponentTextEditor`, `componentDefaults`, `stores/slices/createBuilderSlice`
  (`replaceComponent`), `DraggableColumnItem`, and the tagged property panels.
- Rebuilt artifact: `services/edge/public/react/hydrate.js` (+ css/chunks).

---

## 4. Known limitations / follow-ups

1. **Published Repeater template primitives.** The edge `RenderNode` supports Text, Heading,
   Image, Card, Container, Row, Column, Badge, Button, Link, Icon, Separator, and renders
   children for anything else. A Repeater template using an exotic component on the published
   page degrades to a passthrough (the canvas preview is unaffected). Extending the edge
   renderer (or converging on shared primitives) is the follow-up.
2. **Mode B auto-bind is intentionally absent** (user decision) — wrapping preserves static
   values; the user writes `{{record.*}}` tokens via the Stage‑5 picker after binding.
3. **P2‑2 memo comparators** deferred pending measured re-render profiling on a large page.
4. **Past the GATE (out of scope, next sprint):** Liquid Phase 4 (live client reactivity),
   Phase 5 (visual condition builder), the workflow Liquid extension, and the `ui_event_trigger`
   node.

---

## 5. Verification run

- `npx tsc --noEmit -p tsconfig.app.json` — clean
- `npx tsc --noEmit` (services/edge) — clean
- `packages/form` + `packages/liquid-core` + `packages/grid` typecheck — clean
- `npx vitest run packages/liquid-core …` — 41 passed
- Edge client bundle rebuild (`npm run build:client`) — succeeded (3970 modules → `hydrate.js`)
