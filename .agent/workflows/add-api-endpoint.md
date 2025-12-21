---
description: How to add a new API endpoint
---

# Adding a New API Endpoint

Follow these steps to add a new API endpoint to the backend:

## 1. Choose Route File
Determine which route file to add the endpoint to:

- **Authentication**: `server/routes/api/auth.js`
- **Database operations**: `server/routes/api/database/` (connection.js, schema.js, or data.js)
- **Page management**: `server/routes/api/pages.js`
- **Project settings**: `server/routes/api/project.js`
- **App variables**: `server/routes/api/variables.js`

Or create a new route file if needed.

## 2. Add Route Handler
Add the route in the appropriate file:

```javascript
const express = require('express');
const { authenticateToken } = require('./auth'); // If protected
const DatabaseManager = require('../utils/db');

const router = express.Router();
const db = new DatabaseManager();

// GET endpoint example
router.get('/my-endpoint', authenticateToken, async (req, res) => {
  try {
    // Extract parameters
    const { param1, param2 } = req.query;
    
    // Validate input
    if (!param1) {
      return res.status(400).json({ 
        success: false, 
        message: 'param1 is required' 
      });
    }
    
    // Perform operation
    const data = await performOperation(param1, param2);
    
    // Return success response
    res.json({ 
      success: true, 
      data 
    });
  } catch (error) {
    console.error('My endpoint error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to process request' 
    });
  }
});

// POST endpoint example
router.post('/my-endpoint', authenticateToken, async (req, res) => {
  try {
    const { field1, field2 } = req.body;
    
    // Validate
    if (!field1 || !field2) {
      return res.status(400).json({ 
        success: false, 
        message: 'field1 and field2 are required' 
      });
    }
    
    // Process
    const result = await createSomething(field1, field2);
    
    res.json({ 
      success: true, 
      data: result 
    });
  } catch (error) {
    console.error('Create error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create' 
    });
  }
});

module.exports = router;
```

## 3. Register Route (if new file)
If you created a new route file, register it in `server/server.js`:

```javascript
const myRoutes = require('./routes/api/my-routes');
app.use('/api/my-routes', myRoutes);
```

## 4. Create Frontend Service (Optional)
Add to `src/services/database-api.ts` or create new service file:

```typescript
export const myApi = {
  fetchData: async (param1: string, param2?: string) => {
    const params = new URLSearchParams();
    params.append('param1', param1);
    if (param2) params.append('param2', param2);
    
    const response = await fetch(`/api/my-endpoint?${params}`, {
      credentials: 'include'
    });
    return response.json();
  },
  
  createData: async (data: { field1: string; field2: string }) => {
    const response = await fetch('/api/my-endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });
    return response.json();
  }
};
```

## 5. Use in Component/Hook
```typescript
import { myApi } from '@/services/my-api';

const MyComponent = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await myApi.fetchData('value1', 'value2');
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // ... rest of component
};
```

## 6. Test
- Test with valid inputs
- Test with invalid inputs
- Test authentication (if protected)
- Test error cases
- Verify response format

## 7. Document
Add endpoint to `API.md` if it exists, or create documentation.

## Response Format Standard
Always use this format:

```typescript
{
  success: boolean;
  data?: any;
  message?: string;
  total?: number; // For paginated responses
}
```

## Common Patterns

### Pagination
```javascript
const { limit = 20, offset = 0 } = req.query;
const data = await fetchPaginatedData(limit, offset);
const total = await getTotalCount();

res.json({
  success: true,
  data,
  total
});
```

### Filtering
```javascript
const filters = {};
Object.keys(req.query).forEach(key => {
  if (key.startsWith('filter_')) {
    filters[key.replace('filter_', '')] = req.query[key];
  }
});
```

### Sorting
```javascript
const { orderBy, orderDirection = 'asc' } = req.query;
const data = await fetchSortedData(orderBy, orderDirection);
```
