# Contributing to Frontbase Builder

## Development Setup

### Prerequisites
- Node.js 18+ and npm
- Python 3.11+
- Git

### Installation
```bash
# Clone repository
git clone <repository-url>
cd frontbase

# Install frontend dependencies
npm install

# Setup FastAPI backend
cd fastapi-backend
python -m venv venv
.\venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
cd ..

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Running Development Servers
```bash
# Terminal 1: Frontend (http://localhost:5173)
npm run dev

# Terminal 2: Backend (http://localhost:8000)
cd fastapi-backend
.\venv\Scripts\activate
python -m uvicorn main:app --port 8000 --reload
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

### State Management

- **Local state**: `useState` for component-specific state
- **Server state**: React Query for API data
- **Shared state**: Zustand stores for app-wide state
- **Form state**: Controlled components with `useState`

### Styling

- **Use Tailwind CSS** utility classes
- **Use `cn()` utility** for conditional classes
- **Follow Shadcn UI patterns** for consistency
- **Responsive design**: Mobile-first approach

## API Development (FastAPI)

### Adding New Endpoints

1. Create route in `fastapi-backend/app/routers/`
2. Use Pydantic models for request/response validation
3. Follow RESTful conventions
4. Return consistent response format

Example:
```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

class MyRequest(BaseModel):
    name: str
    value: int

@router.post("/my-endpoint")
async def my_endpoint(request: MyRequest):
    try:
        data = process_data(request)
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### Response Format
```json
{
  "success": true,
  "data": {},
  "message": "Optional message"
}
```

## Database Changes (Alembic)

> [!IMPORTANT]
> **Never edit database schema manually.** Always use Alembic migrations.

### Workflow
1. **Modify Models**: Update `app/models/models.py`
2. **Generate Migration**:
   ```bash
   cd fastapi-backend
   alembic revision --autogenerate -m "describe_your_change"
   ```
3. **Review**: Check `alembic/versions/` for correctness (auto-gen can be imperfect)
4. **Apply**:
   ```bash
   alembic upgrade head
   ```
5. **Commit**: Add both the model change and the migration file.

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
refactor: migrate to React Query hooks
docs: update agent.md with FastAPI patterns
```

## Common Tasks

### Adding a New Data Hook

Create in `src/hooks/useDatabase.ts`:
```typescript
export function useMyData(tableName: string) {
  return useQuery({
    queryKey: ['myData', tableName],
    queryFn: async () => {
      const response = await databaseApi.fetchMyData(tableName);
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

### Adding a New Builder Component

See `/add-component` workflow in `.agent/workflows/`.

## Troubleshooting

### Build Errors
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Clear Vite cache: `rm -rf node_modules/.vite`
- Check for TypeScript errors: `npx tsc --noEmit`

### Runtime Errors
- Check browser console for errors
- Verify FastAPI backend is running (port 8000)
- Check database connection
- Verify environment variables

## Resources

- [React Documentation](https://react.dev/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [TanStack Query](https://tanstack.com/query/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Shadcn UI](https://ui.shadcn.com/)
- [Zustand](https://github.com/pmndrs/zustand)

## Questions?

Refer to `agent.md` for architecture details and `memory-bank/` for project context.
