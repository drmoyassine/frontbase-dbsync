# Sprint 3: SSR Pages Engine

## Overview
Render published pages on the Edge with server-side rendering, client hydration, and reactive state management.

**Estimated Effort:** 1.5-2 days

---

## Variable Scopes (Final)

| Type | Lifecycle | Survives Logout? | Server Readable? | Use Case |
| :--- | :--- | :---: | :---: | :--- |
| **Page Variables** | Until refresh | N/A | ❌ | Modals, loading states, temp UI |
| **Session Variables** | Until logout | ❌ Cleared | ❌ | User profile, prefs from DB |
| **Cookies** | Custom expiry | ✅ Persists | ✅ Yes | Auth token, consent, theme |

### Implementation Details
- **Page Variables**: Zustand in-memory (vanilla mode for edge compatibility)
- **Session Variables**: localStorage + Zustand sync, cleared on logout, populated on login from DB
- **Cookies**: Browser cookies via Hono helpers, configurable expiry, httpOnly option

---

## SSR Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        REQUEST FLOW                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Browser ──► Hono SSR ──► Render HTML ──► Browser ──► Hydration     │
│                  │                            │                      │
│                  ▼                            ▼                      │
│         Read cookies for              React takes over               │
│         initial state                 interactive components        │
│                                               │                      │
│                                               ▼                      │
│                                     React Query fetches              │
│                                     data for hydrated               │
│                                     components (Table, Form)        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Deployment Modes

**Local/Docker:**
```
Hono → FastAPI → SQLite/Postgres (page schema)
               → Supabase (user data via sync service)
```

**Edge (Cloudflare/Vercel):**
```
Hono → D1/KV (page schema)
     → User's Supabase (direct, NO FastAPI!)
```

---

## Component Classification & Data Strategy

| Tier | Components | SSR Strategy | Client Data Strategy |
| :--- | :--- | :--- | :--- |
| **Static** | Text, Heading, Image, Badge | Pure HTML | None |
| **Interactive** | Button, Link, Tabs | HTML + JS | Local state (Zustand) |
| **Data-Driven** | DataTable, Form, InfoList | HTML Skeleton | **React Query** (fetches data) |

### React Query Implementation (Hydration)

**1. Hydration Bundle (`hydrate.tsx`)**
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
});

export function hydrateApp() {
  hydrateRoot(document.getElementById('root'), (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  ));
}
```

**2. Data Components (`DataTable.tsx`)**
```tsx
export const DataTable = ({ props }) => {
  // Use React Query for data fetching
  const { data, isLoading } = useQuery({
    queryKey: ['table', props.tableName],
    queryFn: () => fetchTableData(props.tableName) // Hits user's API/Supabase
  });

  if (isLoading) return <TableSkeleton />;
  return <Table data={data} />;
};
```

---

## Caching Strategy

- **Browser Cache**: `Cache-Control: max-age=60` (short TTL)
- **Edge CDN Cache**: `s-maxage=3600` (1 hour at edge)
- **Stale-While-Revalidate**: Background refresh while serving stale
- **Invalidation**: Webhook on page update → purge CDN cache

---

## File Changes

| File | Purpose |
| :--- | :--- |
| `services/actions/src/routes/pages.ts` | SSR route `/:slug` |
| `services/actions/src/ssr/store.ts` | Variable store (3 scopes) |
| `services/actions/src/ssr/PageRenderer.tsx` | Recursive component tree renderer |
| `services/actions/src/ssr/components/static.tsx` | Static component renderers |
| `services/actions/src/ssr/components/interactive.tsx` | Interactive component renderers |
| `services/actions/src/ssr/components/data.tsx` | Data component renderers (React Query) |
| `services/actions/public/hydrate.tsx` | Client hydration bundle (QueryClientProvider) |
| `fastapi-backend/app/routers/pages.py` | Add public page endpoint (no auth) |
| `services/actions/src/index.ts` | Register pages route |

---

## Implementation Phases

### Phase 1: SSR Route (2 hours) ✅
- [x] Create `/:slug` route in Hono
- [x] Fetch page from FastAPI (local) or D1 (edge)
- [x] Return basic HTML

### Phase 2: Component Renderers (4 hours) ✅
- [x] Static components (Text, Heading, Image, etc.)
- [x] Layout components (Container, Tabs, Accordion)
- [x] **Data components with React Query hooks**

### Phase 3: Variable Store (3 hours) ✅
- [x] Zustand vanilla store with 3 scopes
- [x] Cookie read/write helpers
- [x] localStorage sync for session variables

### Phase 4: Hydration Bundle (3 hours) ✅
- [x] Minimal React bundle for interactive components
- [x] **Setup QueryClientProvider**
- [x] Variable store initialization from `window.__INITIAL_STATE__`

### Phase 5: FastAPI Integration (1 hour) ✅
- [x] Add `/api/pages/public/:slug` endpoint (Required for SSR fallback)
- [x] Add `/api/pages/:id/publish` endpoint (Required for Builder publish button)
- [x] Return page for SSR (no auth for public pages)

### Phase 6: Testing & Polish (2 hours)
- [x] Test static page rendering
- [x] Test interactive components and data fetching
- [x] Test variable binding and reactivity

---

## Edge Compatibility Checklist
- [x] Zustand vanilla (no Node deps)
- [x] All storage APIs client-side only
- [x] Cookies readable via Hono `getCookie()`
- [x] No FastAPI calls on edge
- [x] D1/KV for page schema on edge
- [x] **React Query** works client-side (standard fetch)
