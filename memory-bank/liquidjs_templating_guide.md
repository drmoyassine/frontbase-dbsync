# LiquidJS Templating Guide

Comprehensive reference for template expressions in Frontbase. All templates are rendered on the Edge at runtime using [LiquidJS](https://liquidjs.com/).

**Last Updated:** 2026-01-18

---

## Quick Reference

| Syntax | Purpose | Example |
|--------|---------|---------|
| `{{ }}` | Output variable | `{{ user.name }}` |
| `{% %}` | Logic/control | `{% if user %}...{% endif %}` |
| `\|` | Apply filter | `{{ price \| money }}` |

---

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| LiquidJS Engine | ✅ 100% | `liquidjs@^10.24.0` |
| Context Builder | ✅ 100% | All 9 scopes |
| Auth Integration | ✅ 100% | Supabase |
| Custom Filters | ✅ 100% | 12 filters |
| Builder Tools | ✅ 100% | `@` mentions, picker |
| Variables API | ✅ 100% | Dynamic user vars |
| Visitor Detection | ✅ 100% | SSR + Client hybrid |
| Privacy Settings | ✅ 100% | Three-tier system |

---

## Variables

### Available Scopes

| Scope | Description | Example |
|-------|-------------|---------|
| `page` | Current page metadata | `{{ page.title }}` |
| `user` | Authenticated user (if logged in) | `{{ user.email }}` |
| `visitor` | Detected visitor info | `{{ visitor.country }}` |
| `url` | Query parameters | `{{ url.page }}` |
| `system` | Date/time values | `{{ system.date }}` |
| `cookies` | Request cookies | `{{ cookies.theme }}` |
| `record` | Single data record (data pages) | `{{ record.name }}` |
| `records` | Array of records (lists) | `{% for item in records %}` |

### Page Variables
```liquid
{{ page.id }}          → "abc123"
{{ page.title }}       → "Welcome"
{{ page.slug }}        → "welcome"
{{ page.url }}         → "https://example.com/welcome"
{{ page.description }} → "Page description"
{{ page.image }}       → "https://.../og.png"
{{ page.createdAt }}   → "2026-01-18T12:00:00Z"
{{ page.updatedAt }}   → "2026-01-18T14:30:00Z"
```

### User Variables (Authenticated)
```liquid
{{ user.id }}        → "user_123"
{{ user.email }}     → "john@example.com"
{{ user.name }}      → "John Doe"
{{ user.firstName }} → "John"
{{ user.lastName }}  → "Doe"
{{ user.avatar }}    → "https://.../avatar.png"
{{ user.role }}      → "admin"
```

> [!NOTE]
> User variables are dynamically loaded from the contacts table schema. All contact fields are available.

### Visitor Variables

#### Basic (Always Available - SSR)
```liquid
{{ visitor.country }}  → "United States"
{{ visitor.city }}     → "New York"
{{ visitor.timezone }} → "America/New_York"
{{ visitor.device }}   → "mobile" | "tablet" | "desktop"
```

#### Advanced (Configurable via Settings)
```liquid
{{ visitor.ip }}       → "203.0.113.42"
{{ visitor.browser }}  → "Chrome"
{{ visitor.os }}       → "Windows"
{{ visitor.language }} → "en-US"
```

#### Cookie-Based (When Tracking Enabled)
```liquid
{{ visitor.isFirstVisit }}  → true (no tracking cookie)
{{ visitor.visitCount }}    → 5
{{ visitor.firstVisitAt }}  → "2026-01-01T10:00:00Z"
{{ visitor.lastVisitAt }}   → "2026-01-18T14:30:00Z"
{{ visitor.landingPage }}   → "/welcome"
```

### System Variables
```liquid
{{ system.date }}      → "2026-01-18"
{{ system.time }}      → "14:30:00Z"
{{ system.datetime }}  → "2026-01-18T14:30:00Z"
{{ system.timestamp }} → 1768755000000
{{ system.year }}      → 2026
{{ system.month }}     → 1
{{ system.day }}       → 18
```

### URL Query Parameters
```liquid
<!-- URL: /products?category=shoes&page=2 -->
{{ url.category }} → "shoes"
{{ url.page }}     → "2"
```

### Nested Property Access

LiquidJS supports **deep property access** for drilling into JSON/JSONB objects and arrays:

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

#### JSONB Example
```liquid
{% comment %} 
  record.metadata = {
    "author": {
      "name": "John",
      "roles": ["admin", "editor"]
    }
  }
{% endcomment %}

{{ record.metadata.author.name }}        → "John"
{{ record.metadata.author.roles[0] }}    → "admin"
{{ record.metadata.author.roles.first }} → "admin"
{{ record.metadata.author.roles.last }}  → "editor"
{{ record.metadata.author.roles.size }}  → 2
```

> [!TIP]
> With `strictVariables: false`, undefined paths return empty strings instead of errors. Use `| default:` for fallbacks.

---

## Operators

### Comparison Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `==` | Equal | `{% if status == "active" %}` |
| `!=` | Not equal | `{% if role != "guest" %}` |
| `>` | Greater than | `{% if count > 10 %}` |
| `<` | Less than | `{% if price < 100 %}` |
| `>=` | Greater or equal | `{% if age >= 18 %}` |
| `<=` | Less or equal | `{% if stock <= 5 %}` |
| `contains` | Contains value | `{% if tags contains "sale" %}` |

### Logical Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `and` | Both true | `{% if user and user.active %}` |
| `or` | Either true | `{% if admin or moderator %}` |

### Examples
```liquid
{% if visitor.country == "US" and user %}
  Welcome back, {{ user.name }}!
{% endif %}

{% if product.price < 50 or product.tags contains "clearance" %}
  Great deal!
{% endif %}
```

---

## Control Flow

### If / Elsif / Else
```liquid
{% if user %}
  Hello, {{ user.name }}!
{% elsif visitor.country == "France" %}
  Bonjour!
{% else %}
  Welcome, guest!
{% endif %}
```

### Unless (Negation)
```liquid
{% unless cart.empty %}
  You have items in your cart
{% endunless %}
```

### Case / When
```liquid
{% case visitor.device %}
  {% when "mobile" %}
    📱 Mobile Layout
  {% when "tablet" %}
    📋 Tablet Layout
  {% else %}
    🖥️ Desktop Layout
{% endcase %}
```

---

## Loops

### For Loop
```liquid
{% for product in records %}
  <div>{{ product.name }} - {{ product.price | money }}</div>
{% endfor %}
```

### Loop Variables
```liquid
{% for item in records %}
  {{ forloop.index }}     → 1, 2, 3... (1-based)
  {{ forloop.index0 }}    → 0, 1, 2... (0-based)
  {{ forloop.first }}     → true (first item only)
  {{ forloop.last }}      → true (last item only)
  {{ forloop.length }}    → total items
{% endfor %}
```

### Loop with Limit/Offset
```liquid
{% for item in records limit:5 %}
  <!-- First 5 items -->
{% endfor %}

{% for item in records offset:2 limit:3 %}
  <!-- Items 3, 4, 5 -->
{% endfor %}
```

### Empty Check
```liquid
{% for item in records %}
  {{ item.name }}
{% else %}
  No items found.
{% endfor %}
```

---

## Filters

### Built-in Filters

#### String Filters
```liquid
{{ "hello" | upcase }}        → "HELLO"
{{ "HELLO" | downcase }}      → "hello"
{{ "hello" | capitalize }}    → "Hello"
{{ "  hello  " | strip }}     → "hello"
{{ "hello" | size }}          → 5
{{ "hello world" | truncate: 8 }} → "hello..."
{{ "hello" | append: " world" }}  → "hello world"
{{ "hello" | prepend: "say " }}   → "say hello"
{{ "a-b-c" | split: "-" }}        → ["a", "b", "c"]
{{ "hello" | replace: "l", "L" }} → "heLLo"
```

#### Array Filters
```liquid
{{ records | size }}          → 10
{{ records | first }}         → first item
{{ records | last }}          → last item
{{ records | reverse }}       → reversed array
{{ records | sort: "name" }}  → sorted by name
{{ names | join: ", " }}      → "a, b, c"
```

#### Number Filters
```liquid
{{ 4 | plus: 2 }}         → 6
{{ 10 | minus: 3 }}       → 7
{{ 5 | times: 3 }}        → 15
{{ 10 | divided_by: 2 }}  → 5
{{ 5 | modulo: 3 }}       → 2
{{ 4.5 | floor }}         → 4
{{ 4.1 | ceil }}          → 5
{{ 4.5 | round }}         → 5
```

#### Default Value
```liquid
{{ url.page | default: 1 }}         → 1 (if undefined)
{{ user.name | default: "Guest" }}  → "Guest" (if null)
```

### Custom Frontbase Filters

#### Currency Formatting
```liquid
{{ 29.99 | money }}         → "$29.99"
{{ 29.99 | money: "EUR" }}  → "€29.99"
{{ 29.99 | money: "GBP" }}  → "£29.99"
{{ 29.99 | money: "KES" }}  → "KSh29.99"
{{ 29.99 | money: "JPY" }}  → "¥29.99"
```

#### Time Ago (Relative Time)
```liquid
{{ record.createdAt | time_ago }}
→ "just now"
→ "5 minutes ago"
→ "2 hours ago"
→ "3 days ago"
→ "1 month ago"
→ "2 years ago"
```

#### Timezone Conversion
```liquid
{{ system.datetime | timezone: visitor.timezone }}
→ "1/18/2026, 5:30:00 PM" (in visitor's timezone)
```

#### Date Formatting
```liquid
{{ record.date | date_format: "short" }} → "Jan 18, 2026"
{{ record.date | date_format: "long" }}  → "January 18, 2026"
{{ record.date | date_format: "iso" }}   → "2026-01-18"
{{ record.date | date_format: "time" }}  → "02:30 PM"
```

#### Number Formatting
```liquid
{{ 1234567.89 | number }}        → "1,234,567.89"
{{ 0.75 | percent }}             → "75%"
{{ 0.7534 | percent: 2 }}        → "75.34%"
```

#### Text Processing
```liquid
{{ content | truncate_words: 20 }}     → First 20 words...
{{ title | slugify }}                  → "my-page-title"
{{ userInput | escape_html }}          → Safe HTML output
```

#### JSON
```liquid
{{ page.metadata | json }}
→ '{"author":"John","tags":["news"]}'
```

#### Pluralize
```liquid
{{ count }} {{ count | pluralize: "item", "items" }}
→ "1 item" or "5 items"
```

---

## Visitor Detection

### Three-Tier System

| Tier | Data Source | Availability |
|------|-------------|--------------|
| **Basic** | Request Headers (SSR) | Always |
| **Advanced** | Privacy Settings Toggle | Configurable |
| **Cookie-Based** | `visitor-enhanced` Cookie | When enabled + accepted |

### SSR Detection (Basic Layer)

Extracted on every request from HTTP headers:
- **IP** → `CF-Connecting-IP` / `X-Forwarded-For`
- **Country** → `CF-IPCountry` (auto-converted: `KW` → `Kuwait`)
- **Device/Browser/OS** → `User-Agent` parsing
- **Language** → `Accept-Language` header
- **Timezone** → `cf.timezone` or deduced from country

### Client Enhancement (Cookie Layer)

The `visitor-enhanced` JSON cookie captures:
```javascript
{
  tz: "America/New_York",     // Accurate timezone
  sd: "1920x1080",            // Screen dimensions
  cs: "dark",                 // Color scheme preference
  ct: "4g",                   // Connection type
  te: true                    // Touch enabled
}
```

Set by `/static/visitor-enhancement.js` on first visit.

### Privacy Considerations

| Action | Legal Status |
|--------|-------------|
| Read own cookies | ✅ Safe |
| Detect third-party presence | ⚠️ Internal only |
| Store third-party values | ❌ Forbidden |

---

## Common Patterns

### Personalized Greeting
```liquid
{% if user %}
  Welcome back, {{ user.firstName | default: user.name }}!
{% else %}
  Hello, visitor from {{ visitor.country }}!
{% endif %}
```

### First-Time Visitor Banner
```liquid
{% if visitor.isFirstVisit %}
  <div class="welcome-banner">
    🎉 First time here? Get 10% off!
  </div>
{% endif %}
```

### Loyalty Badge
```liquid
{% if visitor.visitCount > 5 %}
  <div class="loyalty-badge">
    ⭐ Thank you for being a loyal visitor!
  </div>
{% endif %}
```

### Device-Responsive Content
```liquid
{% if visitor.device == "mobile" %}
  <a href="tel:+1234567890">📞 Call Us</a>
{% else %}
  <span>Call us at +1 (234) 567-890</span>
{% endif %}
```

### Geo-Targeted Pricing
```liquid
{% case visitor.country %}
  {% when "United States" %}
    {{ product.price | money: "USD" }}
  {% when "United Kingdom" %}
    {{ product.price_gbp | money: "GBP" }}
  {% when "Germany" %}
    {{ product.price_eur | money: "EUR" }}
  {% else %}
    {{ product.price | money }}
{% endcase %}
```

### Data Table with Loop
```liquid
<table>
  <thead>
    <tr><th>#</th><th>Name</th><th>Price</th></tr>
  </thead>
  <tbody>
    {% for item in records %}
    <tr>
      <td>{{ forloop.index }}</td>
      <td>{{ item.name }}</td>
      <td>{{ item.price | money }}</td>
    </tr>
    {% else %}
    <tr><td colspan="3">No data available</td></tr>
    {% endfor %}
  </tbody>
</table>
```

### URL Parameter Handling
```liquid
<!-- Pagination: /products?page=2 -->
Showing page {{ url.page | default: 1 }} of {{ total_pages }}

<!-- Active tab: /settings?tab=security -->
{% if url.tab == "security" %}
  Security settings...
{% elsif url.tab == "billing" %}
  Billing settings...
{% else %}
  General settings...
{% endif %}
```

---

## Edge Sufficiency

All templates are rendered entirely on the Edge. After publishing, **no communication with FastAPI occurs**.

### Runtime Data Sources

| Source | Purpose | Connection |
|--------|---------|------------|
| Supabase | Page data, auth | Direct REST |
| Upstash Redis | Caching | REST API |
| Request Headers | Visitor context | Edge native |
| Cookies | User preferences | Edge native |

### Key Files

| File | Purpose |
|------|---------|
| `services/edge/src/ssr/lib/liquid.ts` | LiquidJS engine + custom filters |
| `services/edge/src/ssr/lib/context.ts` | Template context builder |
| `services/edge/src/ssr/lib/auth.ts` | Supabase auth integration |
| `services/edge/src/ssr/lib/tracking.ts` | Visitor tracking logic |
| `services/edge/src/ssr/PageRenderer.ts` | Async page renderer |

---

## Builder Tools

### @ Mention Autocomplete

Type `@` in any text field to trigger variable picker:
1. Variables grouped by scope (page, user, visitor, etc.)
2. Filter picker appears after `|`
3. Keyboard navigation (↑↓ Enter Esc)

### Key Files

| File | Purpose |
|------|---------|
| `src/components/builder/VariablePicker.tsx` | Autocomplete dropdown |
| `src/components/builder/VariableInput.tsx` | Text input wrapper |
| `src/hooks/useVariables.ts` | Fetch variables from API |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Variable shows empty | Check if variable exists: `{% if var %}{{ var }}{% endif %}` |
| Filter not working | Verify filter name, use `\| default: "fallback"` |
| Template syntax error | Check for matching `{% endif %}`, `{% endfor %}` |
| User is null | User only available for authenticated visitors |
| Cookie-based vars undefined | Check if tracking enabled in Settings |

---

*Last Updated: 2026-01-18*
