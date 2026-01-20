# Phase 1: Landing Page Components - Implementation Plan

**Goal:** Build SSR-compatible landing page sections using shadcn Studio free blocks as design reference.  
**Approach:** Adapt React blocks → Static HTML renderers with data binding.  
**Effort:** ~3 days  
**Mobile-First:** Yes, with visibility controls

**Reference Repo:** `Frontbase-/shadcn-studio-reference/`

---

## Final Component List (8 total)

| Component | Priority | Has Array Props |
|-----------|----------|-----------------|
| **Hero** | Day 1 | No |
| **Features** | Day 1 | Yes (features[]) |
| **Pricing** | Day 1 | Yes (plans[]) |
| **CTA** | Day 1 | No |
| **Navbar** | Day 1 | Yes (links[]) |
| **FAQ** | Day 2 | Yes (items[]) |
| **Logo Cloud** | Day 2 | Yes (logos[]) |
| **Footer** | Day 2 | Yes (links[], socials[]) |

> **Note:** Testimonials excluded from this phase.

---

## Array Props: Dual Editing Mode

Components with array props support **both** editing methods:

### Mode 1: Array Editor (Quick Mode)
- "Add Item" button in Properties Panel
- Edit fields inline (title, description, icon, etc.)
- Best for: Quick edits, simple content

### Mode 2: Nested Children (Advanced Mode)
- Drag individual items (e.g., FeatureItem) into container
- Full styling control per item
- Best for: Custom layouts, unique per-item styling

**Implementation:** Each section component accepts both:
- `items` array prop (for Mode 1)
- `children` slot (for Mode 2)

Children override array if present.

---

## Builder Integration

### Files to Modify

| File | Change |
|------|--------|
| `ComponentPalette.tsx` | Add "Sections" category with 8 components |
| `PropertiesPanel.tsx` | Add array editor UI for list props |
| `ComponentRenderer.tsx` | Add canvas preview renderers |

### New Category in Palette

```typescript
sections: {
  icon: Layout,
  label: 'Sections',
  components: [
    { name: 'Hero', icon: Layout, description: 'Hero section' },
    { name: 'Features', icon: Grid, description: 'Feature cards grid' },
    { name: 'Pricing', icon: DollarSign, description: 'Pricing table' },
    { name: 'CTA', icon: MousePointer, description: 'Call to action' },
    { name: 'Navbar', icon: Menu, description: 'Navigation bar' },
    { name: 'FAQ', icon: HelpCircle, description: 'FAQ accordion' },
    { name: 'LogoCloud', icon: Image, description: 'Partner logos' },
    { name: 'Footer', icon: Layout, description: 'Page footer' },
  ]
}
```

### Array Editor Component (New)

```typescript
// For PropertiesPanel - edits array props
<ArrayEditor
  items={props.features}
  onItemsChange={(items) => updateProp('features', items)}
  itemSchema={{
    icon: { type: 'text', label: 'Icon' },
    title: { type: 'text', label: 'Title' },
    description: { type: 'textarea', label: 'Description' },
  }}
  addLabel="Add Feature"
/>
```

---

## SSR Implementation

### File Structure

```
services/edge/src/ssr/components/landing/
├── Hero.ts
├── Features.ts
├── Pricing.ts
├── CTA.ts
├── Navbar.ts
├── FAQ.ts
├── LogoCloud.ts
├── Footer.ts
└── index.ts
```

### Component Props Summary

#### Hero
| Prop | Type |
|------|------|
| title | string |
| subtitle | string |
| ctaText, ctaLink | string |
| secondaryCta | string |
| backgroundImage | string |
| alignment | 'left' \| 'center' \| 'right' |

#### Features
| Prop | Type |
|------|------|
| title, subtitle | string |
| features | { icon, title, description, link }[] |
| columns | 2 \| 3 \| 4 |

#### Pricing
| Prop | Type |
|------|------|
| title, subtitle | string |
| plans | { name, price, period, features[], cta, highlighted }[] |
| showToggle | boolean |

#### CTA
| Prop | Type |
|------|------|
| title, subtitle | string |
| ctaText, ctaLink | string |
| background | string |

#### Navbar
| Prop | Type |
|------|------|
| logo | string |
| links | { text, href }[] |
| ctaText, ctaLink | string |

#### FAQ
| Prop | Type |
|------|------|
| title, subtitle | string |
| items | { question, answer }[] |

#### Logo Cloud
| Prop | Type |
|------|------|
| title | string |
| logos | { src, alt, href }[] |

#### Footer
| Prop | Type |
|------|------|
| logo | string |
| columns | { title, links[] }[] |
| socials | { icon, href }[] |
| copyright | string |

---

## Tasks Checklist

### Day 1: Core Sections + Builder Setup
- [ ] Create `landing/` directory in edge service
- [ ] Add "Sections" category to ComponentPalette.tsx
- [ ] Implement Hero renderer + preview
- [ ] Implement Features renderer + preview
- [ ] Implement Pricing renderer + preview
- [ ] Implement CTA renderer + preview
- [ ] Implement Navbar renderer + preview
- [ ] Register in PageRenderer.ts

### Day 2: Additional Sections + Array Editor
- [ ] Build ArrayEditor component for PropertiesPanel
- [ ] Implement FAQ renderer + preview
- [ ] Implement LogoCloud renderer + preview
- [ ] Implement Footer renderer + preview
- [ ] Add responsive styles
- [ ] Wire up array props to ArrayEditor

### Day 3: Polish + Testing
- [ ] Test all components on mobile/tablet/desktop
- [ ] Verify data binding ({{ variable }}) works
- [ ] Verify Styling Panel applies to all sections
- [ ] Create sample landing page in builder
- [ ] Test SSR output matches preview

---

## Verification Plan

### Automated
```bash
# Build edge service
cd services/edge && npm run build

# Type check
npm run typecheck
```

### Manual Testing
1. **Builder Test:**
   - Open builder
   - Drag each section component to canvas
   - Verify preview renders
   - Edit props in Properties Panel
   - Verify changes reflect

2. **Array Editor Test:**
   - Add Features section
   - Use "Add Feature" button
   - Add 3 features with icons/titles
   - Verify grid displays correctly

3. **SSR Test:**
   - Publish page with all sections
   - View published page
   - Verify HTML matches preview
   - Check mobile responsiveness

4. **Data Binding Test:**
   - Use `{{ page.title }}` in Hero title
   - Verify SSR resolves variable

---

*Last Updated: 2026-01-19*
