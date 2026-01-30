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
4. **Props Resolution**: Variables are resolved server-side via LiquidJS `{{ var }}` syntax
5. **Styling**: Components support `style` object props and `className` for custom styling

---

## Phase 0: LiquidJS Templating Engine ✅ COMPLETE

> [!NOTE]
> **Phase 0 is COMPLETE.** All LiquidJS infrastructure, Builder tools, and Privacy settings have been implemented. See [liquidjs_templating_guide.md](./liquidjs_templating_guide.md) for comprehensive documentation.

### Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| LiquidJS Engine | ✅ Complete | `liquidjs@^10.24.0` |
| Async Rendering | ✅ Complete | `resolveProps()`, `renderPage()` are async |
| Context Builder | ✅ Complete | All 9 scopes (page, user, visitor, url, system, cookies, local, session, record) |
| Custom Filters | ✅ Complete | 12 filters: `money`, `time_ago`, `timezone`, `date_format`, `json`, `pluralize`, `escape_html`, `truncate_words`, `slugify`, `number`, `percent` |
| Auth Integration | ✅ Complete | Supabase JWT + contacts table |
| Visitor Detection | ✅ Complete | Three-tier: Basic (SSR) → Advanced (configurable) → Cookie-based |
| Privacy Settings | ✅ Complete | UI in Settings page with toggles |
| Builder Autocomplete | ✅ Complete | `@` trigger, variable picker, filter picker |
| Variables API | ✅ Complete | `/api/variables/registry/` with dynamic user vars |

### Key Files Implemented

| File | Purpose |
|------|---------|
| `services/edge/src/ssr/lib/liquid.ts` | LiquidJS engine + 12 custom filters |
| `services/edge/src/ssr/lib/context.ts` | Template context builder |
| `services/edge/src/ssr/lib/auth.ts` | Supabase auth integration |
| `services/edge/src/ssr/lib/tracking.ts` | Visitor tracking logic |
| `services/edge/src/ssr/PageRenderer.ts` | Async page renderer with LiquidJS |
| `src/components/builder/VariablePicker.tsx` | Autocomplete dropdown |
| `src/components/builder/VariableInput.tsx` | Text input with `@` trigger |
| `src/hooks/useVariables.ts` | Fetch variables from API |

### Documentation

- **Full Guide:** [liquidjs_templating_guide.md](./liquidjs_templating_guide.md)

---

## Data Binding Architecture

> [!IMPORTANT]
> **ALL components support data binding.** Any text prop can contain LiquidJS template expressions that resolve during SSR.

### Template Syntax

```liquid
{{ variable }}                         Simple variable
{{ user.name }}                        Nested property
{{ record.metadata.tags[0] }}          Array/JSONB access
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
> These components are **SSR-complete** (no React hydration needed) but **fully support data binding**. They are added to `static.ts` and registered in `PageRenderer.ts`.

### 1.1 Hero Section Component

**File:** `ssr/components/static.ts`

```typescript
interface HeroProps {
    title: string;
    subtitle?: string;
    ctaText?: string;
    ctaLink?: string;
    secondaryCtaText?: string;
    secondaryCtaLink?: string;
    backgroundImage?: string;
    backgroundGradient?: string;
    alignment?: 'left' | 'center' | 'right';
    height?: string;
    overlay?: boolean;
}
```

**Tasks:**
- [ ] Add `renderHero()` function to `static.ts`
- [ ] Support gradient backgrounds with fallback colors
- [ ] Add CTA buttons with hover states
- [ ] Register `Hero` in `STATIC_COMPONENTS`

---

### 1.2 Feature Grid Component

**File:** `ssr/components/static.ts`

```typescript
interface FeatureGridProps {
    features: Array<{
        icon?: string;
        title: string;
        description: string;
        link?: string;
    }>;
    columns?: 2 | 3 | 4;
    iconColor?: string;
}
```

**Tasks:**
- [ ] Add `renderFeatureGrid()` function to `static.ts`
- [ ] Support 2-4 column layouts with CSS Grid
- [ ] Add icon rendering (emoji, lucide icons, or image URLs)
- [ ] Register `FeatureGrid` in `STATIC_COMPONENTS`

---

### 1.3 Testimonial Carousel Component

**File:** `ssr/components/interactive.ts`

```typescript
interface TestimonialCarouselProps {
    testimonials: Array<{
        quote: string;
        author: string;
        role?: string;
        avatar?: string;
        rating?: number;
    }>;
    autoPlay?: boolean;
    interval?: number;
    showDots?: boolean;
}
```

**Tasks:**
- [ ] Add `renderTestimonialCarousel()` to `interactive.ts`
- [ ] Create `TestimonialCarousel` React component in `client/`
- [ ] Register in `entry.tsx` and `INTERACTIVE_COMPONENTS`

---

### 1.4 Pricing Table Component

**File:** `ssr/components/static.ts`

```typescript
interface PricingTableProps {
    plans: Array<{
        name: string;
        price: string;
        period?: string;
        features: string[];
        ctaText: string;
        ctaLink: string;
        highlighted?: boolean;
    }>;
    columns?: 2 | 3 | 4;
}
```

**Tasks:**
- [ ] Add `renderPricingTable()` function to `static.ts`
- [ ] Support highlighted/featured plan styling
- [ ] Mobile-responsive (horizontal scroll or stacked)
- [ ] Register `PricingTable` in `STATIC_COMPONENTS`

---

### 1.5 CTA Section Component

**File:** `ssr/components/static.ts`

**Tasks:**
- [ ] Add `renderCTASection()` function to `static.ts`
- [ ] Add background pattern overlays (CSS)
- [ ] Support two CTA buttons
- [ ] Register `CTASection` in `STATIC_COMPONENTS`

---

### 1.6 Stats/Counter Section

**File:** `ssr/components/static.ts`

**Tasks:**
- [ ] Add `renderStatsSection()` to `static.ts`
- [ ] Support animated counters (optional)
- [ ] Register `StatsSection` in `STATIC_COMPONENTS`

---

### 1.7 Logo Cloud Component

**File:** `ssr/components/static.ts`

**Tasks:**
- [ ] Add `renderLogoCloud()` function to `static.ts`
- [ ] Add grayscale filter with hover color
- [ ] Register `LogoCloud` in `STATIC_COMPONENTS`

---

## Phase 2: Charts & Lists (Day 2)

> [!IMPORTANT]
> These components are **data-driven** and require React hydration. They use the existing pattern in `data.ts` with skeleton placeholders.

### 2.1 Chart Component

**Library:** Recharts (~50KB)

```typescript
interface ChartProps {
    type: 'bar' | 'line' | 'pie' | 'area' | 'donut';
    data: Array<Record<string, any>>;
    xKey?: string;
    yKey?: string;
    series?: string[];
    title?: string;
    height?: string | number;
    colors?: string[];
    showLegend?: boolean;
    binding?: {
        datasourceId: string;
        tableName: string;
        columns: string[];
    };
}
```

**Tasks:**
- [ ] Install Recharts: `npm install recharts`
- [ ] Create `client/ChartComponent.tsx` with all chart types
- [ ] Enhance `renderChart()` in `data.ts` with better skeleton
- [ ] Register in `entry.tsx`

---

### 2.2 InfoList Component Enhancement

**Tasks:**
- [ ] Add icon support for list items
- [ ] Add horizontal/vertical layout option
- [ ] Add data binding for dynamic lists

---

### 2.3 Stat Cards (Data-Bound)

**Tasks:**
- [ ] Add `renderStatCard()` to `data.ts`
- [ ] Create `StatCard.tsx` React component
- [ ] Support data binding with aggregation queries

---

## Phase 3: Polish & Responsiveness (Day 3)

### 3.1 CSS Enhancement

**Tasks:**
- [ ] Add responsive breakpoints variables
- [ ] Add component-specific mobile styles
- [ ] Add smooth transitions for all interactive elements
- [ ] Add focus states for accessibility

---

### 3.2 Animation

**Approach:** CSS animations for SSR components

**Tasks:**
- [ ] Add fade-in animations for sections on scroll
- [ ] Add hover scale effects for cards
- [ ] Add skeleton shimmer improvements

---

### 3.3 Mobile Responsiveness Audit

| Component | Mobile Behavior |
|-----------|-----------------|
| Hero | Stack CTA buttons, reduce font sizes |
| Feature Grid | Single column on mobile |
| Testimonial Carousel | Touch swipe support |
| Pricing Table | Horizontal scroll or accordion |
| Charts | Reduce height, hide legend on small screens |

---

### 3.4 Dark Mode Support

**Tasks:**
- [ ] Ensure all new components respect dark mode variables
- [ ] Test skeleton animations in dark mode
- [ ] Add dark mode variants for charts

---

## Files Summary

### New Files to Create
| Path | Purpose |
|------|---------|
| `client/ChartComponent.tsx` | React chart wrapper with Recharts |
| `client/TestimonialCarousel.tsx` | Client-side carousel logic |
| `client/StatCard.tsx` | Data-bound stat card |

### Files to Modify
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
cd services/edge && npm run build
npm run dev
curl http://localhost:3000/test-landing | grep "fb-hero"
```

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

### Phase 2: Charts & Lists
- [ ] Bar, Line, Pie, Area charts render with data
- [ ] Charts are interactive (hover tooltips)
- [ ] Stat cards show live data from database

### Phase 3: Polish
- [ ] All components work on mobile
- [ ] Smooth animations on interactions
- [ ] Dark mode supported
- [ ] No layout shifts on hydration

---

## Dependencies

```json
{
  "recharts": "^2.12.0"
}
```

**Bundle Impact:** ~50KB gzipped (Recharts only, LiquidJS already installed)

---

## Sprint Summary

| Phase | Focus | Status |
|-------|-------|--------|
| **0. Prerequisite** | LiquidJS Engine + @ Mention Autocomplete | ✅ Complete |
| 1. Landing Pages | Hero, FeatureGrid, Testimonials, Pricing, CTA, Stats, LogoCloud | 🔲 Ready |
| 2. Charts & Lists | Chart (4 types), StatCard, InfoList enhancement | 🔲 Ready |
| 3. Polish | CSS, Animations, Responsive, Dark Mode | 🔲 Ready |

**Remaining Effort:** 2-3 days
