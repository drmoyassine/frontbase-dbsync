# Contributing to Frontbase Builder

## Development Setup

### Prerequisites
- Node.js 18+ and npm
- Git

### Installation
```bash
# Clone repository
git clone <repository-url>
cd frontbase-now

# Install dependencies
npm install
cd server && npm install && cd ..

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Running Development Servers
```bash
# Terminal 1: Frontend (http://localhost:5173)
npm run dev

# Terminal 2: Backend (http://localhost:3001)
cd server && npm run dev
```

## Code Style Guidelines

### TypeScript
- Use TypeScript for all new files
- Define interfaces for all data structures
- Avoid `any` types - use `unknown` or proper types
- Use functional components with hooks

### File Organization
- **Max 400 lines per file** - refactor if exceeding
- **Single responsibility** - one component/hook/utility per file
- **Colocate related files** - keep renderers, hooks, and types together

### Naming Conventions
- **Components**: PascalCase (`ComponentRenderer.tsx`)
- **Hooks**: camelCase with `use` prefix (`useSimpleData.ts`)
- **Utilities**: camelCase (`styleUtils.ts`)
- **Types**: PascalCase (`ComponentStyles`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_PAGE_SIZE`)

### Import Order
```typescript
// 1. React imports
import React, { useState, useEffect } from 'react';

// 2. Third-party libraries
import { useQuery } from '@tanstack/react-query';

// 3. UI components
import { Button } from '@/components/ui/button';

// 4. Internal components
import { ComponentRenderer } from '@/components/builder/ComponentRenderer';

// 5. Hooks
import { useSimpleData } from '@/hooks/useSimpleData';

// 6. Stores
import { useBuilderStore } from '@/stores/builder';

// 7. Utilities and types
import { cn } from '@/lib/utils';
import type { ComponentStyles } from '@/types/styles';
```

## Component Guidelines

### Creating New Components

1. **Use Shadcn UI components** as base when possible
2. **Make components reusable** - accept props for customization
3. **Handle loading and error states** explicitly
4. **Use TypeScript interfaces** for props

Example:
```typescript
interface MyComponentProps {
  title: string;
  onAction?: () => void;
  className?: string;
}

export const MyComponent: React.FC<MyComponentProps> = ({
  title,
  onAction,
  className
}) => {
  return (
    <div className={cn("base-styles", className)}>
      <h2>{title}</h2>
      {onAction && <Button onClick={onAction}>Action</Button>}
    </div>
  );
};
```

### State Management

- **Local state**: `useState` for component-specific state
- **Shared state**: Zustand stores for app-wide state
- **Server state**: React Query for API data (if needed)
- **Form state**: Controlled components with `useState`

### Styling

- **Use Tailwind CSS** utility classes
- **Use `cn()` utility** for conditional classes
- **Follow Shadcn UI patterns** for consistency
- **Responsive design**: Mobile-first approach

## API Development

### Adding New Endpoints

1. Create route in appropriate file in `server/routes/api/`
2. Use `authenticateToken` middleware for protected routes
3. Follow RESTful conventions
4. Return consistent response format

Example:
```javascript
router.get('/my-endpoint', authenticateToken, async (req, res) => {
  try {
    const data = await fetchData();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch data' 
    });
  }
});
```

### Response Format
```typescript
{
  success: boolean;
  data?: any;
  message?: string;
  total?: number; // For paginated responses
}
```

## Testing

### Manual Testing Checklist
- [ ] Component renders without errors
- [ ] Loading states display correctly
- [ ] Error states display correctly
- [ ] Responsive design works on mobile/tablet/desktop
- [ ] Drag-and-drop works (for builder components)
- [ ] Data binding works (for data components)
- [ ] Build completes without errors

### Running Build
```bash
npm run build
```

## Git Workflow

### Branch Naming
- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation updates

### Commit Messages
Follow conventional commits:
```
feat: add new data table component
fix: resolve drag-and-drop issue in builder
refactor: split ComponentRenderer into modules
docs: update agent.md with new patterns
```

### Pull Request Process
1. Create feature branch from `main`
2. Make changes and commit
3. Run build and verify no errors
4. Create PR with description of changes
5. Request review
6. Merge after approval

## Common Tasks

### Adding a New Builder Component

1. **Define defaults** in `src/lib/componentDefaults.ts`:
```typescript
MyComponent: {
  text: 'Default text',
  variant: 'default'
}
```

2. **Create renderer** in appropriate file:
```typescript
export const MyComponentRenderer: React.FC<RendererProps> = ({
  component,
  isSelected,
  onComponentClick
}) => {
  const { text, variant } = component.props;
  return <MyComponent text={text} variant={variant} />;
};
```

3. **Add to ComponentPalette**:
```typescript
{
  type: 'MyComponent',
  label: 'My Component',
  icon: Icon,
  category: 'basic'
}
```

4. **Add properties panel** in `PropertiesPanel.tsx`:
```typescript
case 'MyComponent':
  return (
    <>
      <div className="space-y-2">
        <Label>Text</Label>
        <Input value={props.text} onChange={...} />
      </div>
    </>
  );
```

### Adding a New Data Hook

1. Create in `src/hooks/data/`:
```typescript
export function useMyData(options: MyDataOptions) {
  const { connected } = useDataBindingStore();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Implementation
  
  return { data, loading, refetch };
}
```

2. Export from `src/hooks/useSimpleData.ts`:
```typescript
export { useMyData } from './data/useMyData';
```

## Troubleshooting

### Build Errors
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Clear Vite cache: `rm -rf node_modules/.vite`
- Check for TypeScript errors: `npx tsc --noEmit`

### Runtime Errors
- Check browser console for errors
- Verify API endpoints are running
- Check database connection
- Verify environment variables

### Performance Issues
- Use React DevTools Profiler
- Check for unnecessary re-renders
- Verify data fetching is debounced
- Check bundle size with `npm run build`

## Resources

- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Shadcn UI](https://ui.shadcn.com/)
- [Zustand](https://github.com/pmndrs/zustand)
- [React DND](https://react-dnd.github.io/react-dnd/)

## Questions?

Refer to `agent.md` for architecture details and common patterns.
