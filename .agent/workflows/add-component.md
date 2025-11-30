---
description: How to add a new builder component
---

# Adding a New Builder Component

Follow these steps to add a new component to the page builder:

## 1. Define Default Props
Add default props in `src/lib/componentDefaults.ts`:

```typescript
export const componentDefaults = {
  // ... existing components
  MyNewComponent: {
    text: 'Default text',
    variant: 'default',
    size: 'medium'
  }
};
```

## 2. Create Renderer
Add renderer in the appropriate file in `src/components/builder/renderers/`:

- Basic UI → `BasicRenderers.tsx`
- Forms → `FormRenderers.tsx`
- Layouts → `LayoutRenderers.tsx`
- Data-bound → `DataRenderers.tsx`

```typescript
export const MyNewComponentRenderer: React.FC<RendererProps> = ({
  component,
  isSelected,
  onComponentClick
}) => {
  const { text, variant, size } = component.props;
  
  return (
    <div
      onClick={(e) => onComponentClick?.(component.id!, e)}
      className={cn(
        "my-component",
        isSelected && "ring-2 ring-primary"
      )}
    >
      <MyNewComponent text={text} variant={variant} size={size} />
    </div>
  );
};
```

## 3. Register in ComponentRenderer
Add case in `src/components/builder/ComponentRenderer.tsx`:

```typescript
case 'MyNewComponent':
  return <MyNewComponentRenderer {...rendererProps} />;
```

## 4. Add to Component Palette
Add to `src/components/builder/ComponentPalette.tsx`:

```typescript
{
  type: 'MyNewComponent',
  label: 'My New Component',
  icon: IconName, // Import from lucide-react
  category: 'basic' // or 'form', 'layout', 'data'
}
```

## 5. Add Properties Panel
Add case in `src/components/builder/PropertiesPanel.tsx`:

```typescript
case 'MyNewComponent':
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="text">Text</Label>
        <Input
          id="text"
          value={props.text || ''}
          onChange={(e) => updateComponentProp('text', e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="variant">Variant</Label>
        <Select 
          value={props.variant || 'default'} 
          onValueChange={(value) => updateComponentProp('variant', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default</SelectItem>
            <SelectItem value="primary">Primary</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
```

## 6. (Optional) Add Styling Support
If component needs custom styling, ensure it accepts `className` and `style` props.

## 7. Test
- Drag component from palette
- Verify it renders correctly
- Test property editing
- Test styling
- Test in different viewports

## 8. Build and Verify
```bash
npm run build
```

Ensure no errors and component works in production build.
