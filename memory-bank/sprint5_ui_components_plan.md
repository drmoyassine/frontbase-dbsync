# Sprint 5: UI Components Implementation Plan

**Goal:** Add essential UI components for landing pages, data visualization, and polish the SSR experience.  
**Risk:** Low  
**Estimated Effort:** 2-3 days  
**Priority Order:** Landing Pages → Charts & Lists → Polish & Responsiveness

**Last Updated:** 2026-01-18

---

## Pre-Sprint Review Summary

### Current Architecture

| File | Components | Purpose |
|------|------------|---------|
| `ssr/components/static.ts` | 12 | Pure HTML renderers (Text, Heading, Image, Badge, etc.) |
| `ssr/components/interactive.ts` | 10 | Hydration-ready (Button, Tabs, Accordion, Modal, etc.) |
| `ssr/components/data.ts` | 7 | Data-driven with skeletons (DataTable, Form, Chart stub, etc.) |
| `ssr/PageRenderer.ts` | - | Component classification, variable resolution, page rendering |
| `client/entry.tsx` | - | React hydration with QueryClient (currently only DataTable) |
| `client/globals.css` | - | CSS variables, skeleton animations, base theming |

### Key Patterns Identified

1. **Component Classification**: `PageRenderer.ts` uses Sets to classify components (`STATIC_COMPONENTS`, `INTERACTIVE_COMPONENTS`, `DATA_COMPONENTS`, `LAYOUT_COMPONENTS`)
2. **Hydration Markers**: Interactive/data components use `data-fb-hydrate` or `data-react-component` attributes
3. **Skeleton Loading**: Data components render skeleton placeholders that are replaced on hydration
4. **Props Resolution**: Variables are resolved server-side via `{{var}}` or `${var}` syntax
5. **Styling**: Components support `style` object props and `className` for custom styling

### Existing Chart Stub

```typescript
// data.ts:224-237
function renderChart(id: string, props: Record<string, unknown>, propsJson: string): string {
    const title = escapeHtml(String(props.title || 'Chart'));
    const chartType = props.type as string || props.chartType as string || 'bar';
    const height = props.height as string || '300px';
    // Returns skeleton placeholder - needs full implementation
}
```

---

## Phase 0: LiquidJS Templating Engine (PREREQUISITE)

> [!CAUTION]
> **This phase MUST be completed before Sprint 5.** It establishes the foundational templating system that all components depend on.

**Goal:** Replace regex-based variable resolution with LiquidJS for filters/transformations + add `@` mention autocomplete in Builder.  
**Estimated Effort:** 1 day  
**Risk:** Low (LiquidJS is battle-tested, used by Shopify)

---

### 0.1 Why LiquidJS?

| Feature | Current (Regex) | LiquidJS |
|---------|-----------------|----------|
| Basic variables | ✅ `{{user.name}}` | ✅ `{{ user.name }}` |
| Nested paths | ✅ `{{user.address.city}}` | ✅ `{{ user.address.city }}` |
| **Filters** | ❌ Not supported | ✅ `{{ name \| upcase }}` |
| **Conditionals** | ❌ Not supported | ✅ `{% if user %}...{% endif %}` |
| **Loops** | ❌ Not supported | ✅ `{% for item in items %}...{% endfor %}` |
| Edge Runtime | ✅ | ✅ (Pure JS, no eval) |
| Bundle Size | 0KB | ~15KB gzipped |

### 0.2 Built-in Filters (40+)

```liquid
{{ name | upcase }}                    → "JOHN"
{{ name | downcase }}                  → "john"
{{ name | capitalize }}                → "John"
{{ text | truncate: 50 }}              → "Lorem ipsum..."
{{ price | plus: 10 }}                 → 39.99
{{ items | size }}                     → 5
{{ date | date: "%Y-%m-%d" }}          → "2026-01-18"
{{ array | join: ", " }}               → "a, b, c"
{{ text | split: "," | first }}        → "first item"
{{ amount | money }}                   → "$29.99" (custom filter)
```

### 0.3 Edge Engine Implementation

#### Files to Modify

| File | Changes |
|------|---------|
| `services/edge/package.json` | Add `liquidjs` dependency |
| `ssr/PageRenderer.ts` | Replace `resolveProps()` with LiquidJS |
| `ssr/lib/liquid.ts` | NEW: LiquidJS instance with custom filters |

#### Implementation Tasks

- [ ] **Install LiquidJS**
  ```bash
  cd services/edge && npm install liquidjs
  ```

- [ ] **Create Liquid Engine** (`ssr/lib/liquid.ts`)
  ```typescript
  import { Liquid } from 'liquidjs';
  
  // Create engine with strict mode off (allows undefined variables)
  export const liquid = new Liquid({
    strictVariables: false,
    strictFilters: false,
  });
  
  // Register custom filters
  liquid.registerFilter('money', (value: number) => 
    `$${value.toFixed(2)}`
  );
  
  liquid.registerFilter('date_ago', (value: Date) => {
    // "2 days ago", "just now", etc.
  });
  ```

- [ ] **Update `resolveProps()`** in `PageRenderer.ts`
  ```typescript
  import { liquid } from './lib/liquid.js';
  
  async function resolveProps(
    props: Record<string, unknown>,
    store: VariableStore
  ): Promise<Record<string, unknown>> {
    const context = store.getAllVariables(); // { user: {...}, page: {...}, url: {...} }
    const resolved: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'string' && value.includes('{{')) {
        resolved[key] = await liquid.parseAndRender(value, context);
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }
  ```

- [ ] **Handle Async Rendering** (LiquidJS is async)
  - Update `renderComponent()` to be async
  - Update `renderPage()` to await component rendering

---

### 0.4 Builder: @ Mention Autocomplete

**Goal:** When user types `@` in any text field on the builder canvas, properties and styles panels, and page settings, show dropdown with available variables and filters.

#### Component: `VariablePicker.tsx`

```
User types: "Welcome, @"
                       ↓
┌─────────────────────────────────┐
│ 📁 Variables                    │
│   ├─ user.name                  │
│   ├─ user.email                 │
│   ├─ page.title                 │
│   └─ url.slug                   │
│ 🔧 Filters                      │
│   ├─ upcase                     │
│   ├─ downcase                   │
│   └─ truncate: N                │
└─────────────────────────────────┘
                       ↓
User selects "user.name"
                       ↓
Field shows: "Welcome, {{ user.name }}"
```

#### Files to Create

| File | Purpose |
|------|---------|
| `src/components/builder/VariablePicker.tsx` | Autocomplete dropdown component |
| `src/components/builder/VariableInput.tsx` | Text input with @ trigger |
| `src/hooks/useVariables.ts` | Hook to fetch available variables |

#### Implementation Tasks

- [ ] **Create VariablePicker Component**
  - Trigger on `@` keystroke
  - Fuzzy search through available variables
  - Insert `{{ variable.path }}` on selection
  - Show filter options after `|` character

- [ ] **Create Variables Registry API** (FastAPI)
  ```python
  @router.get("/variables")
  def get_available_variables(page_id: str):
      return {
          "variables": [
              {"path": "user.name", "type": "string", "source": "session"},
              {"path": "page.title", "type": "string", "source": "page"},
              {"path": "url.id", "type": "string", "source": "url"},
          ],
          "filters": [
              {"name": "upcase", "description": "Convert to uppercase"},
              {"name": "truncate", "args": ["length"], "description": "Truncate text"},
          ]
      }
  ```

- [ ] **Integrate into Builder Text Fields**
  - Replace standard inputs in Properties Panel
  - Add to Rich Text Editor
  - Add to Styles Panel (for dynamic values)

---

### 0.5 Variable Sources (VariableStore)

The variables available in templates come from multiple sources. These are collected into a **context object** that LiquidJS uses for template rendering.

#### Current Implementation (`ssr/store.ts`)

The existing `VariableStore` already supports 3 scopes:

| Scope | Storage | Lifetime | SSR Support |
|-------|---------|----------|-------------|
| **Page Variables** | In-memory | Cleared on page refresh | ✅ Yes |
| **Session Variables** | localStorage | Cleared on logout | ⚠️ Client-only |
| **Cookies** | Browser cookies | Configurable expiry | ✅ Yes (via request headers) |

```typescript
// Current VariableStore interface
interface VariableStore {
    getPageVariable(key: string): unknown;
    setPageVariable(key: string, value: unknown): void;
    getSessionVariable(key: string): unknown;
    setSessionVariable(key: string, value: unknown): void;
    getCookie(key: string): string | undefined;
    setCookie(key: string, value: string, options?: CookieOptions): void;
    resolveVariable(expression: string): unknown;  // Auto-searches page → session → cookie
}
```

---

#### Proposed Variable Scopes (Expanded)

For LiquidJS integration, we need to build a **unified context object** from multiple sources:

#### Nested Property Access Syntax

LiquidJS supports **deep property access** for drilling down into JSON/JSONB objects and arrays:

```liquid
{{ variable.field }}                    → First level
{{ variable.field.subfield }}           → Nested object
{{ variable.field.subfield.deep }}      → Deeply nested
{{ variable.items[0] }}                 → Array index
{{ variable.items[0].name }}            → Array item property
{{ variable.items.first }}              → First array item
{{ variable.items.last }}               → Last array item
{{ variable.items.size }}               → Array length
```

**Examples with real data:**
```liquid
<!-- User with nested address -->
{{ user.address.city }}                 → "Nairobi"
{{ user.address.country.code }}         → "KE"

<!-- Record with JSONB metadata -->
{{ record.metadata.tags[0] }}           → "featured"
{{ record.metadata.dimensions.width }}  → 1920

<!-- Custom page variables -->
{{ page.custom.hero.background }}       → "gradient-blue"
{{ page.custom.features[0].title }}     → "Fast Shipping"
```

##### 1. Page Variables (`page.*`)

Used for page metadata, SEO, OpenGraph, and JSON-LD structured data.

| Variable | Example | Description |
|----------|---------|-------------|
| `page.id` | `"abc123"` | Unique page identifier |
| `page.title` | `"Welcome"` | Page title (`<title>` tag) |
| `page.url` | `"https://example.com/home"` | Canonical URL |
| `page.slug` | `"home"` | URL slug |
| `page.description` | `"Your one-stop shop..."` | Meta description |
| `page.published` | `true` | Publication status |
| `page.createdAt` | `"2026-01-18"` | Creation date |
| `page.updatedAt` | `"2026-01-18"` | Last update date |
| `page.image` | `"https://...og.jpg"` | OpenGraph/social share image |
| `page.type` | `"website"` | OpenGraph type (website, article, product) |
| `page.custom.*` | `page.custom.heroImage` | User-defined page variables |

**Source:** Page settings stored in database, loaded during SSR route handler.

**SSR Output Example:**
```html
<!-- Generated from page.* variables -->
<title>{{ page.title }}</title>
<meta name="description" content="{{ page.description }}">
<link rel="canonical" href="{{ page.url }}">
<meta property="og:title" content="{{ page.title }}">
<meta property="og:description" content="{{ page.description }}">
<meta property="og:image" content="{{ page.image }}">
<meta property="og:type" content="{{ page.type }}">
<meta property="og:url" content="{{ page.url }}">
```

##### 2. User Variables (`user.*`)

The authenticated user's full record from the **contacts table** (as defined in `/users` dashboard).

| Variable | Example | Description |
|----------|---------|-------------|
| `user.*` | `user.customField` | Any column from contacts table |

**Source:** Session variable. Populated on login from contacts table record, persisted in session storage.

**Note:** `user` is `null` if not authenticated. Use conditionals:
```liquid
{% if user %}
  Welcome, {{ user.firstName }}!
{% else %}
  <a href="/login">Sign In</a>
{% endif %}
```

##### 2b. Visitor Variables (`visitor.*`) — Request Context

Available for **ALL users** (authenticated and anonymous). Captures browser/device/location from request headers:

| Variable | Example | Description |
|----------|---------|-------------|
| `visitor.ip` | `"203.0.113.42"` | IP address (from `CF-Connecting-IP` or `X-Forwarded-For`) |
| `visitor.country` | `"KE"` | Country code (from `CF-IPCountry` or IP geolocation) |
| `visitor.city` | `"Nairobi"` | City (if available from Cloudflare or geo service) |
| `visitor.timezone` | `"Africa/Nairobi"` | Timezone (from geo-IP or Cloudflare) |
| `visitor.device` | `"mobile"` | Device type: `mobile`, `tablet`, `desktop` |
| `visitor.browser` | `"Chrome"` | Browser name (parsed from User-Agent) |
| `visitor.os` | `"iOS"` | Operating system (parsed from User-Agent) |
| `visitor.language` | `"en-US"` | Preferred language (from `Accept-Language` header) |
| `visitor.referrer` | `"https://google.com"` | Referring URL (from `Referer` header) |
| `visitor.isBot` | `false` | Whether request appears to be from a bot |

**Source:** Parsed from HTTP request headers on every request (available for both authenticated and anonymous users).

**Storage Strategy:**

| Type | Storage | When |
|------|---------|------|
| **Core visitor variables** | None (per-request) | Always — parsed from headers |
| **Tracking variables** | Cookie (optional) | Only if enabled in `/settings` |

Core variables (ip, country, device, browser, etc.) are **never stored** — they're derived fresh from HTTP headers on every request. This is:
- ✅ More accurate (reflects current request)
- ✅ Privacy-friendly (no persistent tracking)
- ✅ Zero storage overhead

**Optional Tracking Variables** (require cookie storage, configurable in `/settings → Privacy & Tracking`):

| Variable | Description |
|----------|-------------|
| `visitor.isFirstVisit` | `true` if first visit (no tracking cookie found) |
| `visitor.visitCount` | Number of visits |
| `visitor.firstVisitAt` | Timestamp of first visit |
| `visitor.landingPage` | First page visited |

**Settings UI (`/settings → Privacy & Tracking`):**
- [ ] Enable visitor tracking cookies
- Cookie expiry: `[365]` days
- Require cookie consent: `[Yes/No]`

**Usage Example:**
```liquid
<!-- Available for ALL users -->
{% if visitor.country == "KE" %}
  🇰🇪 Welcome! We ship free to Kenya.
{% endif %}

{% if visitor.device == "mobile" %}
  <a href="/app">Download our app</a>
{% endif %}

<!-- Combine with user data -->
{% if user %}
  Welcome back, {{ user.firstName }}! ({{ visitor.city }})
{% endif %}

<!-- Optional tracking (if enabled in settings) -->
{% if visitor.isFirstVisit %}
  <div class="welcome-banner">First time here? Get 10% off!</div>
{% endif %}
```

**Implementation Note:** Cloudflare Workers provide many of these via `request.cf` object. For other edge runtimes, use User-Agent parsing libraries.

##### 3. URL Parameters (`url.*`)

Direct access to URL query parameters. For `?param1=A&param2=B`:

| Variable | URL Example | Returns |
|----------|-------------|---------|
| `url.param1` | `?param1=A` | `"A"` |
| `url.param2` | `?param1=A&param2=B` | `"B"` |
| `url.sort` | `?sort=price` | `"price"` |
| `url.page` | `?page=2` | `"2"` |
| `url.search` | `?search=shoes` | `"shoes"` |
| `url.utm_source` | `?utm_source=google` | `"google"` |

**Source:** Parsed from `URLSearchParams` in Hono request.

**Usage Examples:**
```liquid
<!-- Dynamic content based on URL params -->
Showing results for: {{ url.search | default: "all products" }}

<!-- Pagination -->
Page {{ url.page | default: 1 }} of {{ totalPages }}

<!-- Tracking -->
{% if url.utm_source %}
  <script>trackSource("{{ url.utm_source }}")</script>
{% endif %}
```

**Implementation:**
```typescript
// Flatten query params directly onto url object
const url: Record<string, string> = {};
const searchParams = new URL(request.url).searchParams;
searchParams.forEach((value, key) => {
    url[key] = value;
});
// Result: { param1: "A", param2: "B", sort: "price" }
```

##### 4. System Variables (`system.*`)

> [!IMPORTANT]
> All system time variables are captured in **UTC**. Use `visitor.timezone` with filters to display in user's local time.

| Variable | Example | Description |
|----------|---------|-------------|
| `system.date` | `"2026-01-18"` | Current date (UTC, ISO format) |
| `system.time` | `"12:00:00Z"` | Current time (UTC) |
| `system.datetime` | `"2026-01-18T12:00:00Z"` | Full ISO timestamp (UTC) |
| `system.timestamp` | `1737201600000` | Unix timestamp (ms, UTC) |
| `system.year` | `2026` | Current year (UTC) |
| `system.month` | `1` | Current month (UTC) |
| `system.day` | `18` | Current day (UTC) |
| `system.env` | `"production"` | Environment name |

**Source:** Generated at render time from `new Date().toISOString()` (always UTC).

**Why UTC?**
- ✅ Consistent across all edge locations
- ✅ Reliable for comparisons and calculations
- ✅ Use `visitor.timezone` to display in user's local time

**Usage Example:**
```liquid
<!-- UTC timestamp for records -->
Created at: {{ system.datetime }}

<!-- Display in user's local time (using custom filter) -->
Your local time: {{ system.datetime | timezone: visitor.timezone }}

<!-- Date comparisons always work correctly -->
{% if record.expiresAt < system.datetime %}
  This offer has expired.
{% endif %}
```

##### 5. Data Context (`record.*`)

| Variable | Example | Description |
|----------|---------|-------------|
| `record.*` | `record.name.first` | Current record in a data context |
| `records` | `[{...}, {...}]` | Array of records (for loops) |
| `record.index` | `0` | Current index in loop |
| `record.first` | `true` | Is first item in loop |
| `record.last` | `false` | Is last item in loop |

**Source:** Data sources (Supabase queries) bound to components. Populated when:
- A DataTable or Chart fetches data
- A Repeater/List iterates over records
- A Form loads a record for editing

##### 6. User-Defined Variables

These are **custom variables** that users can define and manage via actions/workflows:

###### 6a. Local Variables (`local.*`) — Page-Level Temporary

| Scope | Storage | Lifetime | SSR |
|-------|---------|----------|-----|
| `local.*` | In-memory | Cleared on page navigation/refresh | ✅ Yes |

| Variable | Example | Description |
|----------|---------|-------------|
| `local.formData` | `{ name: "John" }` | Temporary form state |
| `local.selectedTab` | `"pricing"` | Current UI state |
| `local.modalOpen` | `true` | Component visibility |
| `local.cartCount` | `3` | Temporary counter |
| `local.*` | Any key | User-defined local variable |

**Use cases:** Temporary UI state, form data before submit, wizard step tracking.

**Setting (via Actions):**
```liquid
<!-- In workflow/action -->
{% assign local.selectedTab = "features" %}
{% assign local.cartCount = local.cartCount | plus: 1 %}
```

###### 6b. Session Variables (`session.*`) — Cross-Page Persistent

| Scope | Storage | Lifetime | SSR |
|-------|---------|----------|-----|
| `session.*` | localStorage | Cleared on logout or browser close | ⚠️ Client-only |

| Variable | Example | Description |
|----------|---------|-------------|
| `session.cartItems` | `[{...}, {...}]` | Shopping cart |
| `session.selectedPlan` | `"pro"` | User selection |
| `session.wizardStep` | `3` | Multi-page form progress |
| `session.preferences` | `{ theme: "dark" }` | User preferences |
| `session.*` | Any key | User-defined session variable |

**Use cases:** Shopping cart, multi-page forms, user preferences before login.

**Setting (via Actions):**
```liquid
<!-- Add to cart -->
{% assign session.cartItems = session.cartItems | push: product %}

<!-- Save preferences -->
{% assign session.preferences = { theme: "dark", currency: "USD" } %}
```

**Note:** Session variables are **not available on SSR** (first render). Use with fallbacks:
```liquid
{% if session.theme %}
  <body class="{{ session.theme }}">
{% else %}
  <body class="light">
{% endif %}
```

###### 6c. Cookie Variables (`cookies.*`) — Persistent with Expiry

| Scope | Storage | Lifetime | SSR |
|-------|---------|----------|-----|
| `cookies.*` | Browser cookies | Configurable (days/never) | ✅ Yes |

**Reading Cookies:**
| Variable | Example | Description |
|----------|---------|-------------|
| `cookies.theme` | `"dark"` | UI theme preference |
| `cookies.consent` | `"accepted"` | Cookie consent status |
| `cookies.locale` | `"fr"` | Language preference |
| `cookies.currency` | `"EUR"` | Currency preference |
| `cookies.*` | Any key | User-defined cookie |

**Setting Cookies (via Actions):**
```typescript
// In workflow action
setCookie("theme", "dark", { maxAge: 86400 * 365 });  // 1 year
setCookie("locale", "fr", { maxAge: 86400 * 30 });    // 30 days
setCookie("consent", "accepted", { secure: true, sameSite: "Strict" });
```

**Source:** Parsed from `Cookie` request header on SSR.

**Use cases:** Theme, locale, consent (anything that should persist across sessions and be readable on first SSR render).

---

##### Variable Scope Comparison

| Scope | Storage | Lifetime | SSR | Use Case |
|-------|---------|----------|-----|----------|
| `local.*` | In-memory | Page navigation | ✅ | Form state, UI state |
| `session.*` | localStorage | Browser session | ❌ | Cart, preferences |
| `cookies.*` | Cookies | Configurable | ✅ | Theme, locale, consent |
| `page.*` | Database | Permanent | ✅ | Page metadata |
| `user.*` | Database | Login session | ✅ | User profile |
| `visitor.*` | Headers | Per-request | ✅ | Device, location |
| `system.*` | Runtime | Per-request | ✅ | Date/time |
| `record.*` | Query | Per-component | ✅ | Data binding |

---

#### Context Object Structure

When LiquidJS renders a template, it receives this unified context:

```typescript
interface TemplateContext {
    // Page metadata & SEO (flat structure)
    page: {
        id: string;
        title: string;
        url: string;           // Canonical URL
        slug: string;
        description: string;
        published: boolean;
        createdAt: string;
        updatedAt: string;
        image: string;         // OpenGraph/social image
        type: string;          // OpenGraph type
        custom: Record<string, unknown>;
    };
    
    // Authenticated user (full record from contacts table)
    user: {
        id: string;
        email: string;
        name: string;
        firstName: string;
        lastName: string;
        avatar?: string;
        role: string;
        phone?: string;
        company?: string;
        createdAt: string;
        [key: string]: unknown;  // Any column from contacts table
    } | null;  // null if not authenticated
    
    // URL query parameters (flattened)
    url: Record<string, string>;  // { param1: "A", sort: "price", page: "2" }
    
    // System variables
    system: {
        date: string;
        time: string;
        datetime: string;
        timestamp: number;
        year: number;
        month: number;
        day: number;
        locale: string;
        timezone: string;
        env: string;
    };
    
    // Cookies
    cookies: Record<string, string>;
    
    // Data context (set by parent data components)
    record?: Record<string, unknown>;
    records?: Record<string, unknown>[];
}
```

#### Implementation Task

- [ ] **Create `buildTemplateContext()`** function in `ssr/lib/context.ts`
  ```typescript
  export async function buildTemplateContext(
      request: Request,
      pageData: PageData,
      dataContext?: Record<string, unknown>
  ): Promise<TemplateContext> {
      // Parse cookies from request
      const cookies = parseCookies(request.headers.get('Cookie') || '');
      
      // Get user from JWT (if authenticated)
      const userId = decodeJWTFromRequest(request)?.sub;
      const user = userId ? await fetchUserFromContacts(userId) : null;
      
      // Flatten URL query params
      const url: Record<string, string> = {};
      new URL(request.url).searchParams.forEach((value, key) => {
          url[key] = value;
      });
      
      return {
          page: {
              id: pageData.id,
              title: pageData.title,
              slug: pageData.slug,
              description: pageData.description,
              og: pageData.openGraph || {},
              jsonld: pageData.jsonLd || {},
              custom: pageData.customVariables || {},
          },
          user,
          url,
          system: buildSystemVariables(request),
          cookies,
          record: dataContext?.record,
          records: dataContext?.records,
      };
  }
  ```

> **Note:** The actual variable dictionary and data sources will be designed and documented separately in the Actions Engine sprint. This section defines the **structure**, not the complete list of variables.

---

### 0.6 Phase 0 Acceptance Criteria

- [ ] LiquidJS installed and configured in Edge service
- [ ] `resolveProps()` uses LiquidJS for template rendering
- [ ] Filters work: `{{ name | upcase }}` renders as "JOHN"
- [ ] Builder shows `@` autocomplete in text fields
- [ ] Variable picker shows available variables from context
- [ ] Filter picker shows available filters after `|`
- [ ] All existing pages still render correctly (backward compatible)

---

### 0.7 Phase 0 Dependencies

```json
{
  "liquidjs": "^10.10.0"
}
```

**Bundle Impact:** ~15KB gzipped

---

## Data Binding Architecture

> [!IMPORTANT]
> **ALL components support data binding.** Any text prop can contain LiquidJS template expressions that resolve during SSR.

### Template Syntax

```liquid
{{ variable }}                         Simple variable
{{ user.name }}                        Nested property
{{ name | upcase }}                    With filter
{{ price | plus: 10 | money }}         Chained filters
{% if user %}Hello{% endif %}          Conditional
{% for item in items %}...{% endfor %} Loop
```

### How it Works

1. **Builder**: User types `@` → selects `user.name` → field shows `Welcome, {{ user.name }}!`
2. **Stored JSON**: `{ "title": "Welcome, {{ user.name }}!" }`
3. **SSR Render**: LiquidJS renders with context `{ user: { name: "John" } }`
4. **HTML Output**: `<h1>Welcome, John!</h1>`

---

## Phase 1: Landing Page Components (Day 1)

> [!TIP]
> These components are **SSR-complete** (no React hydration needed) but **fully support data binding**. Any text prop can use `{{variable}}` syntax to pull from context sources. They are added to `static.ts` and registered in `PageRenderer.ts`.

### 1.1 Hero Section Component

**File:** `ssr/components/static.ts`

#### Props Interface
```typescript
interface HeroProps {
    title: string;
    subtitle?: string;
    ctaText?: string;
    ctaLink?: string;
    secondaryCtaText?: string;
    secondaryCtaLink?: string;
    backgroundImage?: string;
    backgroundGradient?: string; // e.g., "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
    alignment?: 'left' | 'center' | 'right';
    height?: string; // e.g., "100vh", "600px"
    overlay?: boolean; // dark overlay on background image
}
```

#### Implementation Tasks
- [ ] Add `renderHero()` function to `static.ts`
- [ ] Support gradient backgrounds with fallback colors
- [ ] Add CTA buttons with hover states
- [ ] Register `Hero` in `STATIC_COMPONENTS` set in `PageRenderer.ts`

---

### 1.2 Feature Grid Component

**File:** `ssr/components/static.ts`

#### Props Interface
```typescript
interface FeatureGridProps {
    features: Array<{
        icon?: string;     // Icon name or emoji
        title: string;
        description: string;
        link?: string;
    }>;
    columns?: 2 | 3 | 4;
    iconColor?: string;
    gap?: string;
}
```

#### Implementation Tasks
- [ ] Add `renderFeatureGrid()` function to `static.ts`
- [ ] Support 2-4 column layouts with CSS Grid
- [ ] Add icon rendering (emoji, lucide icons, or image URLs)
- [ ] Add hover effects via CSS classes
- [ ] Register `FeatureGrid` in `STATIC_COMPONENTS`

---

### 1.3 Testimonial Carousel Component

**File:** `ssr/components/interactive.ts` (needs client-side interaction)

#### Props Interface
```typescript
interface TestimonialCarouselProps {
    testimonials: Array<{
        quote: string;
        author: string;
        role?: string;
        company?: string;
        avatar?: string;
        rating?: number; // 1-5
    }>;
    autoPlay?: boolean;
    interval?: number; // ms
    showDots?: boolean;
    showArrows?: boolean;
}
```

#### Implementation Tasks
- [ ] Add `renderTestimonialCarousel()` to `interactive.ts`
- [ ] Render first testimonial in SSR, others hidden
- [ ] Add hydration logic for client-side carousel
- [ ] Create `TestimonialCarousel` React component in `client/`
- [ ] Register in `entry.tsx` component registry
- [ ] Register `TestimonialCarousel` in `INTERACTIVE_COMPONENTS`

---

### 1.4 Pricing Table Component

**File:** `ssr/components/static.ts`

#### Props Interface
```typescript
interface PricingTableProps {
    plans: Array<{
        name: string;
        price: string;         // e.g., "$29", "Free"
        period?: string;       // e.g., "/month", "/year"
        description?: string;
        features: string[];
        ctaText: string;
        ctaLink: string;
        highlighted?: boolean; // "Popular" badge
        badge?: string;        // Custom badge text
    }>;
    columns?: 2 | 3 | 4;
}
```

#### Implementation Tasks
- [ ] Add `renderPricingTable()` function to `static.ts`
- [ ] Support highlighted/featured plan styling
- [ ] Add checkmark icons for features
- [ ] Mobile-responsive (horizontal scroll or stacked)
- [ ] Register `PricingTable` in `STATIC_COMPONENTS`

---

### 1.5 CTA Section Component

**File:** `ssr/components/static.ts`

#### Props Interface
```typescript
interface CTASectionProps {
    title: string;
    subtitle?: string;
    ctaText: string;
    ctaLink: string;
    secondaryCtaText?: string;
    secondaryCtaLink?: string;
    background?: string; // color or gradient
    textColor?: string;
    pattern?: 'dots' | 'grid' | 'none';
}
```

#### Implementation Tasks
- [ ] Add `renderCTASection()` function to `static.ts`
- [ ] Add background pattern overlays (CSS)
- [ ] Support two CTA buttons
- [ ] Register `CTASection` in `STATIC_COMPONENTS`

---

### 1.6 Stats/Counter Section

**File:** `ssr/components/static.ts` (or interactive for animated counters)

#### Props Interface
```typescript
interface StatsSectionProps {
    stats: Array<{
        value: string;      // "10K+", "99.9%", "$2M"
        label: string;
        icon?: string;
    }>;
    columns?: 2 | 3 | 4;
    animate?: boolean; // count-up animation on scroll
}
```

#### Implementation Tasks
- [ ] Add `renderStatsSection()` to `static.ts`
- [ ] Support animated counters (optional, interactive variant)
- [ ] Register `StatsSection` in `STATIC_COMPONENTS`

---

### 1.7 Logo Cloud Component

**File:** `ssr/components/static.ts`

#### Props Interface
```typescript
interface LogoCloudProps {
    logos: Array<{
        src: string;
        alt: string;
        link?: string;
    }>;
    title?: string; // e.g., "Trusted by..."
    grayscale?: boolean;
    columns?: 3 | 4 | 5 | 6;
}
```

#### Implementation Tasks
- [ ] Add `renderLogoCloud()` function to `static.ts`
- [ ] Add grayscale filter with hover color
- [ ] Register `LogoCloud` in `STATIC_COMPONENTS`

---

## Phase 2: Charts & Lists (Day 2)

> [!IMPORTANT]
> These components are **data-driven** and require React hydration. They should use the existing pattern in `data.ts` with skeleton placeholders.

### 2.1 Chart Component (Full Implementation)

**Files:**
- `ssr/components/data.ts` - SSR renderer
- `client/ChartComponent.tsx` - React component
- `client/entry.tsx` - Register for hydration

#### Chart Library Selection

| Library | Size | SSR Support | Features |
|---------|------|-------------|----------|
| **Recharts** | ~50KB | Good (SVG-based) | Declarative, React-native |
| Chart.js | ~60KB | Partial | Canvas-based, more chart types |
| Nivo | ~40KB | Excellent | Beautiful defaults, responsive |

**Recommendation:** Use **Recharts** for React-native API and SSG-friendly SVG rendering.

#### Props Interface
```typescript
interface ChartProps {
    type: 'bar' | 'line' | 'pie' | 'area' | 'donut';
    data: Array<Record<string, any>>;
    xKey?: string;           // Key for X axis
    yKey?: string;           // Key for Y axis (single series)
    series?: string[];       // Keys for multiple series
    title?: string;
    height?: string | number;
    colors?: string[];
    showLegend?: boolean;
    showGrid?: boolean;
    animate?: boolean;
    // Data binding
    binding?: {
        datasourceId: string;
        tableName: string;
        columns: string[];
        limit?: number;
    };
}
```

#### Implementation Tasks
- [ ] Install Recharts: `npm install recharts`
- [ ] Create `client/ChartComponent.tsx` with all chart types
- [ ] Enhance `renderChart()` in `data.ts` with better skeleton
- [ ] Add data fetching via Supabase in ChartComponent
- [ ] Register `Chart` in `entry.tsx`
- [ ] Add `BarChart`, `LineChart`, `PieChart`, `AreaChart` aliases

---

### 2.2 InfoList Component Enhancement

**Current:** Basic skeleton-only implementation in `data.ts`

#### Enhancements
- [ ] Add icon support for list items
- [ ] Add horizontal/vertical layout option
- [ ] Add data binding for dynamic lists
- [ ] Create React hydration component if data-bound

---

### 2.3 Stat Cards (Data-Bound)

**File:** `ssr/components/data.ts`

#### Props Interface
```typescript
interface StatCardProps {
    title: string;
    value?: string;           // Static value
    binding?: {
        datasourceId: string;
        query: string;        // e.g., "SELECT COUNT(*) FROM users"
    };
    icon?: string;
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string;      // e.g., "+12%"
    color?: string;
}
```

#### Implementation Tasks
- [ ] Add `renderStatCard()` to `data.ts`
- [ ] Create `StatCard.tsx` React component
- [ ] Support data binding with aggregation queries
- [ ] Register in `entry.tsx`

---

## Phase 3: Polish & Responsiveness (Day 3)

### 3.1 CSS Enhancement

**File:** `client/globals.css`

#### Tasks
- [ ] Add responsive breakpoints variables
- [ ] Add component-specific mobile styles
- [ ] Add smooth transitions for all interactive elements
- [ ] Add focus states for accessibility
- [ ] Add print styles (hide navigation, etc.)

#### Responsive Breakpoints
```css
:root {
    --breakpoint-sm: 640px;
    --breakpoint-md: 768px;
    --breakpoint-lg: 1024px;
    --breakpoint-xl: 1280px;
}

@media (max-width: 768px) {
    .fb-hero { min-height: auto; padding: 3rem 1rem; }
    .fb-feature-grid { grid-template-columns: 1fr; }
    .fb-pricing-table { flex-direction: column; }
}
```

---

### 3.2 Animation Library

**Options:**
- **Framer Motion** (~30KB) - Full animation library
- **CSS Animations** (0KB) - Use `@keyframes` for simple effects
- **Auto-Animate** (~2KB) - Automatic animations

**Recommendation:** Use **CSS animations** for SSR components, add Framer Motion only for complex interactive components.

#### Tasks
- [ ] Add fade-in animations for sections on scroll
- [ ] Add hover scale effects for cards
- [ ] Add skeleton shimmer improvements
- [ ] Add page transition effects

---

### 3.3 Mobile Responsiveness Audit

#### Components to Audit
| Component | Mobile Behavior |
|-----------|-----------------|
| Hero | Stack CTA buttons, reduce font sizes |
| Feature Grid | Single column on mobile |
| Testimonial Carousel | Touch swipe support |
| Pricing Table | Horizontal scroll or accordion |
| Charts | Reduce height, hide legend on small screens |
| DataTable | Horizontal scroll, hide columns |

#### Tasks
- [ ] Test all landing page components on mobile viewports
- [ ] Add touch swipe support for carousels
- [ ] Add responsive font sizes (clamp())
- [ ] Fix any overflow issues

---

### 3.4 Dark Mode Support

**Current:** `globals.css` has `.dark` theme variables

#### Tasks
- [ ] Ensure all new components respect dark mode variables
- [ ] Test skeleton animations in dark mode
- [ ] Add dark mode variants for charts

---

## Files to Create/Modify

### New Files
| Path | Purpose |
|------|---------|
| `client/ChartComponent.tsx` | React chart wrapper with Recharts |
| `client/TestimonialCarousel.tsx` | Client-side carousel logic |
| `client/StatCard.tsx` | Data-bound stat card |

### Modified Files
| Path | Changes |
|------|---------|
| `ssr/components/static.ts` | Add 6 landing page component renderers |
| `ssr/components/interactive.ts` | Add TestimonialCarousel renderer |
| `ssr/components/data.ts` | Enhance Chart, add StatCard |
| `ssr/PageRenderer.ts` | Register new components in classification Sets |
| `client/entry.tsx` | Register new React components |
| `client/globals.css` | Add component styles, responsive rules, animations |
| `package.json` | Add recharts dependency |

---

## Verification Plan

### Automated Tests
```bash
# Build the edge service
cd services/edge && npm run build

# Start dev server
npm run dev

# Test SSR output
curl http://localhost:3000/test-landing | grep "fb-hero"
```

### Browser Tests
1. Create a test page in Builder with all new components
2. Verify SSR renders correct HTML
3. Verify React hydration works
4. Test responsive behavior at 320px, 768px, 1024px, 1440px
5. Test dark mode toggle
6. Test chart data binding

### Manual Verification
- [ ] All components render in SSR mode
- [ ] Charts display data from Supabase
- [ ] Carousel navigation works
- [ ] Mobile layout is usable
- [ ] Dark mode looks correct
- [ ] No console errors on hydration

---

## Acceptance Criteria

### Phase 1: Landing Pages
- [ ] Hero section renders with gradient backgrounds
- [ ] Feature grid displays icons and descriptions
- [ ] Testimonial carousel auto-plays
- [ ] Pricing table highlights featured plan
- [ ] CTA sections are clickable

### Phase 2: Charts & Lists
- [ ] Bar, Line, Pie, Area charts render with data
- [ ] Charts are interactive (hover tooltips)
- [ ] Stat cards show live data from database
- [ ] InfoList shows formatted data

### Phase 3: Polish
- [ ] All components work on mobile
- [ ] Smooth animations on interactions
- [ ] Dark mode supported
- [ ] No layout shifts on hydration

---

## Dependencies

```json
{
  "liquidjs": "^10.10.0",
  "recharts": "^2.12.0"
}
```

**Bundle Impact:** 
- LiquidJS: ~15KB gzipped
- Recharts: ~50KB gzipped
- **Total:** ~65KB gzipped

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| LiquidJS async rendering | Ensure all component rendering is async-aware |
| Recharts SSR issues | Use dynamic import, render placeholder on SSR |
| Bundle size increase | Tree-shake unused chart types |
| Carousel accessibility | Add ARIA attributes, keyboard navigation |
| Mobile performance | Lazy load images, reduce animation on low-power devices |

---

## Sprint Summary

| Phase | Focus | Effort |
|-------|-------|--------|
| **0. Prerequisite** | LiquidJS Engine + @ Mention Autocomplete | 1 day |
| 1. Landing Pages | Hero, FeatureGrid, Testimonials, Pricing, CTA, Stats, LogoCloud | 1 day |
| 2. Charts & Lists | Chart (4 types), StatCard, InfoList enhancement | 1 day |
| 3. Polish | CSS, Animations, Responsive, Dark Mode | 0.5-1 day |

**Total:** 3.5-4 days (including prerequisite)
