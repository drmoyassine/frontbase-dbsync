# Hidden Dynamic Filters — Implementation Plan

> Status: Ready for implementation
> Author: design handoff
> Scope: Add always-applied, non-UI filters to data-bound components (Chart, DataTable, Grid, KPICard) whose values may be static literals or runtime templates (`{{ user.id }}`, `{{ url.x }}`, …).

---

## 1. Goal & scope

Add a third filtering mechanism to data bindings, **`hiddenFilters`**, distinct from the two that already exist:

| Mechanism | Today | Visible to end user? | Purpose |
|---|---|---|---|
| `filtering.searchEnabled` / search | yes | yes (search box) | free-text search |
| `frontendFilters` | yes | yes (dropdowns/inputs) | user-driven filtering |
| **`hiddenFilters`** | **new** | **no** | builder-defined default scoping (static or dynamic) |

A hidden filter is always applied to the query and never rendered as a control. Its value is either:

- **Static** — a literal (`status = active`)
- **Dynamic** — a template resolved at runtime from the existing variable context (`owner_id = {{ user.id }}`, `category = {{ url.category }}`).

### Confirmed product decisions
1. **Operators:** full set — extend the `frontbase_get_rows` RPC (Phase 3).
2. **Dynamic values:** supported from the start (Phase 2).
3. **Security:** scoping by default **plus** server-side enforcement for the proxy path (Phase 4).

### Non-goals
- No new end-user-facing filter UI.
- Direct-Supabase fetches cannot be server-enforced (anon key + client fetch); for those, hidden filters are scoping only and RLS remains the real boundary. This must be documented in the UI.

---

## 2. Architecture recap (verified)

- Data-bound components render a **skeleton on SSR** and **fetch client-side on hydration**:
  - Chart: [`packages/chart/src/hooks/useChartQuery.ts`](../../packages/chart/src/hooks/useChartQuery.ts) (`fetchFromBuilder` / `fetchFromEdge`).
  - DataTable/Grid/KPICard: [`services/edge/src/components/datatable/useDataTableQuery.ts`](../../services/edge/src/components/datatable/useDataTableQuery.ts) and the `@frontbase/datatable` package.
- Filters reach the DB as a `filters: [{ column, filterType, value }]` array consumed by the `frontbase_get_rows` Postgres RPC ([`supabase_setup.sql`](../../supabase_setup.sql) ~line 206). Current filterTypes: `text` (ILIKE), `dropdown` (=), `multiselect` (IN), `number` (range), `dateRange`, `boolean`.
- Publish-time request building: [`fastapi-backend/app/services/data_request.py`](../../fastapi-backend/app/services/data_request.py) (`_compute_supabase_request` builds `queryConfig`; `frontendFilters` already carried there).
- SSR render path: [`services/edge/src/ssr/PageRenderer.ts`](../../services/edge/src/ssr/PageRenderer.ts) `renderComponent` — already has `binding`, a `liquid` engine, and a `TemplateContext`. At ~line 235 it merges `binding` into `resolvedProps` then calls `renderDataComponent`.
- Variable context builder: [`services/edge/src/ssr/lib/context.ts`](../../services/edge/src/ssr/lib/context.ts) (`buildTemplateContext` → `user`, `url`, `page`, `visitor`, `system`, `cookies`, `local`, `session`).
- Client variable store: [`services/edge/src/ssr/store.ts`](../../services/edge/src/ssr/store.ts) (`createClientStore`, `resolveVariable`).
- Proxy execution (server-side, credentials never reach client): [`services/edge/src/routes/data.ts`](../../services/edge/src/routes/data.ts) (`buildProxyRequest`, `/api/data/execute`).
- Supabase RPC provisioning to a user's datasource: [`fastapi-backend/app/services/sync/routers/datasources/migration.py`](../../fastapi-backend/app/services/sync/routers/datasources/migration.py).
- Reusable builder inputs: [`src/components/builder/VariablePicker.tsx`](../../src/components/builder/VariablePicker.tsx) (`useVariables`-backed autocomplete; props: `onSelect`, `onClose`, `searchTerm`, `position`, `allowedGroups`).

---

## 3. Data model

Add to **both** type definitions (keep them in sync — they are intentionally duplicated):
- [`packages/types/src/index.ts`](../../packages/types/src/index.ts)
- [`src/hooks/data/useSimpleData.ts`](../../src/hooks/data/useSimpleData.ts)

```ts
export type HiddenFilterOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'in' | 'is_null' | 'not_null';

export interface HiddenFilter {
  id: string;                    // crypto.randomUUID() at creation
  column: string;                // supports "table.col" for joined columns
  operator: HiddenFilterOperator;
  value?: string;                // literal or template e.g. "{{ user.id }}"; omitted for is_null/not_null
  previewValue?: string;         // optional: value used ONLY in builder preview when `value` is a non-resolvable template
}

// On ComponentDataBinding:
hiddenFilters?: HiddenFilter[];
```

**Wire-format filter object** (what the RPC/edge consume) gains an optional `op`:

```ts
// extends the existing { column, filterType, value }
interface WireFilter {
  column: string;
  op?: HiddenFilterOperator;   // present => new operator path
  filterType?: string;         // legacy path (frontendFilters/search) — unchanged
  value?: any;
}
```

`op` and `filterType` are mutually exclusive on a given object. Legacy objects (no `op`) keep their exact current behavior — **do not** change the existing branches.

---

## 4. Phase 1 — Foundation, builder UI, builder preview

Self-contained and testable entirely in the builder. No runtime/publish changes.

### 4.1 Types
- Add `HiddenFilter`, `HiddenFilterOperator`, and `hiddenFilters?` to the two files in §3.

### 4.2 Shared editor component — `HiddenFiltersEditor`
New file: `src/components/builder/data-binding/HiddenFiltersEditor.tsx` (create `data-binding/` subfolder under builder if absent; otherwise colocate beside `data-table/`).

Props:
```ts
interface HiddenFiltersEditorProps {
  tableName: string;
  dataSourceId: string;
  columns: { name: string; type: string }[]; // caller passes resolved column list
  value: HiddenFilter[];
  onChange: (filters: HiddenFilter[]) => void;
}
```

UI/behavior:
- Section header "Hidden Filters" + helper text: *"Always applied to the query. Not shown to visitors. Use `{{ variables }}` for dynamic values."*
- Each row: **Column** select (reuse the type-icon `ColumnSelect` pattern from [`ChartProperties.tsx`](../../src/components/builder/properties/basic/ChartProperties.tsx) — extract it to a shared file `src/components/builder/data-binding/ColumnSelect.tsx` and import in both places) · **Operator** select · **Value** input · remove (X) button.
- **Value input** = literal text input with a `{{ }}` trigger that opens [`VariablePicker`](../../src/components/builder/VariablePicker.tsx). On select, insert the chosen `{{ path }}` token at the cursor. Hide the value input entirely when `operator ∈ {is_null, not_null}`. For `operator = in`, accept comma-separated literals (store as the raw string; parsing happens at resolution time).
- "+ Add filter" appends `{ id: crypto.randomUUID(), column: '', operator: 'eq', value: '' }`.
- Operator labels: equals / not equals / greater than / greater or equal / less than / less or equal / contains / in / is empty / is not empty.
- If `dataSourceId` indicates a direct-Supabase datasource, show a one-line inline note: *"Hidden filters scope data but are not a security boundary on this datasource — pair with RLS."* (Detection can be deferred to Phase 4; a static always-on note is acceptable for Phase 1.)

Extract the existing column-fetch logic from `ChartProperties` into a reusable hook `src/hooks/data/useBindingColumns.ts(tableName, dataSourceId)` returning `{ name, type }[]` (it currently lives inline in `ChartProperties` `useEffect`). Use it in both the editor's callers and `ChartProperties` to avoid duplication.

### 4.3 Wire into property panels
Add `<HiddenFiltersEditor … />` to each, in the **Options/advanced** area, gated on `binding && tableName`:
- [`ChartProperties.tsx`](../../src/components/builder/properties/basic/ChartProperties.tsx) — Options tab, new bordered section.
- [`DataTablePropertiesPanel.tsx`](../../src/components/builder/data-table/DataTablePropertiesPanel.tsx) — beside the existing `FilterConfigurator`.
- [`GridProperties.tsx`](../../src/components/builder/properties/basic/GridProperties.tsx).
- [`KPICardProperties.tsx`](../../src/components/builder/properties/basic/KPICardProperties.tsx).

Each panel already has an `onBindingUpdate`/`updateBinding`; persist via `updateBinding({ hiddenFilters })`.

### 4.4 Builder preview fetch
The builder preview fetches via `/api/sync/datasources/:id/tables/:table/data` (see `fetchFromBuilder` in [`useChartQuery.ts`](../../packages/chart/src/hooks/useChartQuery.ts) and the equivalent in `useSimpleData`/`useDatabase`).

Add a shared resolver `src/lib/data-binding/resolveHiddenFilters.ts`:
```ts
// Returns wire filters with `op`, resolving templates against a context.
// Unresolved dynamic values fall back to previewValue; if still empty, the filter is dropped.
export function resolveHiddenFilters(
  hidden: HiddenFilter[] | undefined,
  ctx: Record<string, any>,         // { url, system, user?, page?, ... }
  opts?: { dropUnresolved?: boolean }
): WireFilter[]
```
- In the builder, build `ctx` from what's available: `url` from `window.location.search`, `system` from `Date`, and (best-effort) the current builder `user`. For unresolved templates, use `previewValue`; if absent and `dropUnresolved`, omit the filter.
- Merge the resolved list into the query the preview sends. The current builder data endpoint expects `filters` as `[{ field, operator: '==', value }]` — extend that endpoint (FastAPI sync data route) to also accept the `{ column, op, value }` shape, OR translate in the client to the endpoint's existing shape for the operators it supports and document the gap. **Recommended:** add operator support to the sync data endpoint so preview matches production. (File: the FastAPI route serving `/datasources/{id}/tables/{table}/data`; find via `tables/{table_name}/data`.)

### 4.5 Phase 1 acceptance
- Add/edit/remove hidden filters in all four panels; persists in the saved page JSON under `binding.hiddenFilters`.
- Builder preview applies static filters and `{{ url.* }}` / `{{ system.* }}` correctly; `{{ user.* }}` uses preview value or is skipped.
- No regression to search or `frontendFilters`.

---

## 5. Phase 2 — Publish + SSR resolution + client runtime merge

Makes hidden filters work on published pages with full dynamic resolution.

### 5.1 Publish-time carry-through
In [`data_request.py`](../../fastapi-backend/app/services/data_request.py):
- In `_compute_supabase_request` and `_compute_sql_request`, read `binding.get('hiddenFilters', [])` and place it into `queryConfig['hiddenFilters']` (raw, unresolved — templates intact). Mirror how `frontendFilters` is already attached to `queryConfig`.
- Do **not** resolve templates here (publish time has no visitor context).

### 5.2 SSR template resolution + bake
In [`PageRenderer.ts`](../../services/edge/src/ssr/PageRenderer.ts) `renderComponent`, where `binding` is merged into `resolvedProps` (~line 235):
- Add a helper `resolveHiddenFiltersSSR(binding, context, liquid)`:
  - For each hidden filter, render `value` with `liquid.parseAndRender(value, context)` against the `TemplateContext`.
  - Classify each by variable source: resolve `user/url/page/system/visitor/cookies` now (server has them). For client-only sources (`session.*`, `local.*`) **leave the template intact** and mark it for client resolution.
  - Produce two arrays on the binding passed to hydration props:
    - `binding._resolvedHiddenFilters: WireFilter[]` (fully resolved, ready to send).
    - `binding._pendingHiddenFilters: HiddenFilter[]` (still-templated, client-only sources).
  - Drop any resolved-to-empty filter unless operator is `is_null`/`not_null`.
- These ride along in the serialized hydration props produced by [`data.ts`](../../services/edge/src/ssr/components/data.ts) (no change needed there if they live on `binding`, which is already serialized into `reactProps`/`propsJson`).

> Note: liquid `parseAndRender` is async — `renderComponent` is already async and `resolveProps` already awaits liquid, so this fits.

### 5.3 Client runtime merge
- **Edge hook** [`useDataTableQuery.ts`](../../services/edge/src/components/datatable/useDataTableQuery.ts): after building `filterList` from user-facing filters, append:
  - `binding._resolvedHiddenFilters` (already resolved), and
  - `resolveHiddenFilters(binding._pendingHiddenFilters, clientCtx)` where `clientCtx` reads from the client store ([`store.ts`](../../services/edge/src/ssr/store.ts) `resolveVariable`) plus `window.location`.
  - Combined into `rpcBody.filters`. Include hidden filters in the React Query `queryKey` so changes refetch.
- **Chart edge hook** [`useChartQuery.ts`](../../packages/chart/src/hooks/useChartQuery.ts) `fetchFromEdge`: same merge into `queryBody.filters` (currently hardcoded `filters: []`). Add hidden filters to the `queryKey` in `useChartQuery`.
- Mirror the merge anywhere `@frontbase/datatable` builds its own request (check `packages/datatable/src/hooks/useDataTableData.ts`).

### 5.4 Phase 2 acceptance
- Published page: a chart/table with `owner_id = {{ user.id }}` returns only the logged-in user's rows; anonymous visitor sees the empty/!match result deterministically.
- `{{ url.x }}` reflects query string on the published URL.
- `{{ session.x }}` resolves on the client after the store is populated.

---

## 6. Phase 3 — RPC operator extension

Gives the wire `op` field real SQL semantics end-to-end.

### 6.1 Update canonical SQL
In [`supabase_setup.sql`](../../supabase_setup.sql), inside the `frontbase_get_rows` filter loop (~line 206), **before** the existing `CASE filter_type` block, add:

```sql
filter_op := filter_item->>'op';
IF filter_op IS NOT NULL AND filter_op <> '' THEN
  -- new operator path
  CASE filter_op
    WHEN 'eq'        THEN condition := format('%s = %L',  quoted_col, filter_value#>>'{}');
    WHEN 'neq'       THEN condition := format('%s IS DISTINCT FROM %L', quoted_col, filter_value#>>'{}');
    WHEN 'gt'        THEN condition := format('%s > %L',  quoted_col, filter_value#>>'{}');
    WHEN 'gte'       THEN condition := format('%s >= %L', quoted_col, filter_value#>>'{}');
    WHEN 'lt'        THEN condition := format('%s < %L',  quoted_col, filter_value#>>'{}');
    WHEN 'lte'       THEN condition := format('%s <= %L', quoted_col, filter_value#>>'{}');
    WHEN 'contains'  THEN condition := format('%s ILIKE %L', quoted_col, '%' || (filter_value#>>'{}') || '%');
    WHEN 'in'        THEN
      IF jsonb_typeof(filter_value) = 'array' AND jsonb_array_length(filter_value) > 0 THEN
        condition := format('%s IN (SELECT jsonb_array_elements_text(%L::jsonb))', quoted_col, filter_value::text);
      END IF;
    WHEN 'is_null'   THEN condition := format('%s IS NULL', quoted_col);
    WHEN 'not_null'  THEN condition := format('%s IS NOT NULL', quoted_col);
    ELSE condition := NULL;
  END CASE;
ELSE
  -- existing CASE filter_type block, unchanged
END IF;
```
- Declare `filter_op text;` with the other locals.
- Keep the existing null/empty guard, but allow `is_null`/`not_null` to pass without a value (adjust the early `CONTINUE` so it doesn't skip valueless null-checks).
- `%L` quoting via `format` keeps it injection-safe; Postgres coerces the literal to the column type for typed columns. For `in`, the value arrives as a JSON array (client must convert the comma-separated `in` string to an array before sending — do this in `resolveHiddenFilters`).

### 6.2 Provision to datasources
- Follow the existing RPC-provisioning pattern in [`migration.py`](../../fastapi-backend/app/services/sync/routers/datasources/migration.py) so connected Supabase datasources get the updated function. Bump any function-version marker used there.
- If SQL datasources (Neon/Turso/etc.) build raw SQL in the edge proxy instead of calling an RPC, the operator → SQL translation must also be added in that proxy SQL builder (Phase 4 touches the same area — coordinate).

### 6.3 Phase 3 acceptance
- All ten operators produce correct results against a Supabase datasource, verified with a temp table covering nulls, numerics, text, and array membership.
- Legacy `filterType` filters (search + frontendFilters) still behave identically.

---

## 7. Phase 4 — Server-side enforcement (proxy path)

Tamper-resistance for **proxy** datasources (SQL DBs). Direct-Supabase remains scoping-only by design.

### 7.1 Enforce on the edge
In [`routes/data.ts`](../../services/edge/src/routes/data.ts) `/api/data/execute` (and `buildProxyRequest`):
- The request must carry enough to re-derive hidden filters server-side: include `binding.hiddenFilters` (unresolved templates) in the proxy `dataRequest` payload, **not** just the client-resolved list.
- On the server, rebuild the `TemplateContext` for the current request (reuse `buildTemplateContext` / the same context available to SSR; the edge has the session). Resolve hidden-filter templates server-side.
- **Override**, don't trust: discard any hidden filters the client included in `body.filters` and replace them with the server-resolved set before constructing the SQL/RPC body. (Distinguish hidden filters from user-facing ones — tag hidden wire filters with a marker like `_h: true`, strip client-supplied `_h` filters, then inject server-resolved ones.)
- Apply the same operator → SQL translation as §6.1 when the proxy builds raw SQL.

### 7.2 Direct-Supabase
- No server interception is possible. Keep the client-side merge from Phase 2 and ensure the builder UI note (§4.2) is shown for these datasources. Document in [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md).

### 7.3 Phase 4 acceptance
- For a proxy datasource: editing the outgoing request in devtools to remove/alter a hidden filter has no effect — the server re-injects it from the session.
- For direct-Supabase: behavior unchanged from Phase 2; note visible in builder.

---

## 8. Cross-cutting concerns

- **Type sync:** `packages/types` and `src/hooks/data/useSimpleData.ts` define `ComponentDataBinding` independently — update both, and rebuild `@frontbase/types` if consumers use its dist.
- **Query keys:** hidden filters must be part of every React Query `queryKey` (Chart + DataTable + datatable package) or stale data will be served.
- **Empty/unresolved values:** a dynamic filter resolving to empty must be dropped (not sent as `col = ''`), except `is_null`/`not_null`. Centralize this in `resolveHiddenFilters`.
- **`in` operator:** stored as comma-separated string in the builder; convert to a JSON array in `resolveHiddenFilters` before sending.
- **Joined columns:** `table.col` is already supported by the RPC's auto-join scan; the column dropdown should offer related columns where the panel already exposes them.
- **Backwards compatibility:** pages without `hiddenFilters` are unaffected; all new branches are additive and guarded.

---

## 9. File-change checklist

Phase 1:
- [ ] `packages/types/src/index.ts` — types
- [ ] `src/hooks/data/useSimpleData.ts` — types
- [ ] `src/hooks/data/useBindingColumns.ts` — extracted column hook (new)
- [ ] `src/components/builder/data-binding/ColumnSelect.tsx` — extracted (new)
- [ ] `src/components/builder/data-binding/HiddenFiltersEditor.tsx` — new
- [ ] `src/lib/data-binding/resolveHiddenFilters.ts` — new
- [ ] `ChartProperties.tsx`, `DataTablePropertiesPanel.tsx`, `GridProperties.tsx`, `KPICardProperties.tsx` — wire editor
- [ ] FastAPI sync data route — accept `{column, op, value}` filters (preview parity)

Phase 2:
- [ ] `fastapi-backend/app/services/data_request.py` — carry `hiddenFilters` into `queryConfig`
- [ ] `services/edge/src/ssr/PageRenderer.ts` — SSR resolve + bake `_resolvedHiddenFilters` / `_pendingHiddenFilters`
- [ ] `services/edge/src/components/datatable/useDataTableQuery.ts` — merge into `filters`
- [ ] `packages/chart/src/hooks/useChartQuery.ts` — merge into `filters` (+ queryKey)
- [ ] `packages/datatable/src/hooks/useDataTableData.ts` — merge if it builds its own request

Phase 3:
- [ ] `supabase_setup.sql` — operator branch in `frontbase_get_rows`
- [ ] `fastapi-backend/app/services/sync/routers/datasources/migration.py` — provision updated RPC

Phase 4:
- [ ] `services/edge/src/routes/data.ts` — server-side resolve + override for proxy; operator→SQL in proxy builder
- [ ] `docs/ARCHITECTURE.md` — document security model

---

## 10. Testing strategy

- **Unit:** `resolveHiddenFilters` — static, dynamic resolved, dynamic unresolved→previewValue→drop, `in` parsing, `is_null` retention.
- **SQL:** seed a temp table; assert each operator (incl. nulls and array membership) via direct RPC calls.
- **Builder:** manual — add filters across all four components; verify persistence in page JSON and preview behavior.
- **Published page (Phase 2+):** verify `{{ user.id }}` scoping for logged-in vs anonymous; `{{ url.x }}`; `{{ session.x }}`.
- **Security (Phase 4):** devtools tamper test on a proxy datasource (must be ineffective) and confirmation that direct-Supabase is scoping-only.
- **Regression:** existing search and `frontendFilters` unchanged on a representative published page.

---

## 11. Suggested commit boundaries

1. `feat(types): add hiddenFilters to ComponentDataBinding`
2. `feat(builder): HiddenFiltersEditor + wire into data component panels`
3. `feat(builder): hidden filter resolution in builder preview`
4. `feat(publish): carry hiddenFilters into queryConfig`
5. `feat(edge): SSR resolve + client merge of hidden filters`
6. `feat(db): operator support in frontbase_get_rows + provisioning`
7. `feat(edge): server-side enforcement of hidden filters on proxy path`
8. `docs: hidden filters security model`

Each is independently shippable and leaves the app working.
