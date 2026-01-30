# Development Patterns & Extension Guides

This document serves as a "How-To" reference for extending the Frontbase Builder. It reflects the modular architecture established in Phase 8 (Jan 2026).

## 1. How to Add a New Component

Adding a new component involves 3 parts: Renderer, Properties Panel, and Registry.

### Step A: Create the Renderer
1. Create file `src/components/builder/renderers/[category]/MyComponentRenderer.tsx`.
2. Implement the component using the standard `RendererProps`.
3. Export from `src/components/builder/renderers/[category]/index.ts`.

```typescript
// Example: BasicRenderer.tsx
import { RendererProps } from '../types';

export const MyComponentRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName }) => {
  return <div className={combinedClassName}>{effectiveProps.text}</div>;
};
```

### Step B: Create the Properties Panel
1. Create file `src/components/builder/properties/[category]/MyComponentProperties.tsx`.
2. Implement controls to update props.
3. Export from `src/components/builder/properties/[category]/index.ts`.

```typescript
// Example: properties/basic/MyComponentProperties.tsx
export const MyComponentProperties = ({ props, updateComponentProp }) => (
  <div className="space-y-4">
    <Input 
      label="Text" 
      value={props.text} 
      onChange={(v) => updateComponentProp('text', v)} 
    />
  </div>
);
```

### Step C: Register the Component
1. Open `src/components/builder/registry/componentRegistry.tsx`.
2. Add to `COMPONENT_REGISTRY`:

```typescript
import { MyComponentRenderer } from '../renderers/basic';

export const COMPONENT_REGISTRY = {
  // ...
  MyComponent: MyComponentRenderer
};
```

3. Open `src/components/builder/PropertiesPanel.tsx`.
4. Add case to `renderPropertyFields`:

```typescript
case 'MyComponent':
  return <MyComponentProperties {...props} />;
```

5. Open `src/components/builder/ComponentPalette.tsx`.
6. Add to `DraggableComponent` list.

---

## 2. How to Add a Landing Section

Landing sections (Hero, Features, etc.) follow a slightly different pattern as they are composite templates.

### Step A: Create the Template
1. Create `src/components/builder/templates/sections/mySectionTemplate.ts`.
2. Define the JSON structure.

```typescript
export const mySectionTemplate = () => ({
  type: 'MySection',
  props: { ... },
  children: [ ... ]
});
```

### Step B: Create the Renderer
1. Create `src/components/builder/renderers/landing/MySectionRenderer.tsx`.
2. Often delegates to children or specific logic.

### Step C: Create the Properties Panel
1. Create `src/components/builder/properties/landing/MySectionProperties.tsx`.

---

## 3. Style Processing Pattern

All style processing is centralized in `src/components/builder/styling/styleProcessor.ts`.

- **`processStylesData(styles)`**: Converts Visual Styling Panel JSON to CSS.
- **`processLegacyStyles(styles)`**: Handles backward compatibility.

Use `ComponentRenderer.tsx`'s automatic style generation unless you need custom overrides.

```typescript
// Inside ComponentRenderer
const { classes, inlineStyles } = generateStyles(mergedStyles, ...);
// classes includes tailwind classes
// inlineStyles includes dynamic values (colors, backgrounds)
```
