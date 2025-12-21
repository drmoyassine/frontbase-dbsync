# Frontbase Architecture Documentation

## Overview

Frontbase is a full-stack web application builder with a React frontend and Node.js backend. It provides a visual page builder, database integration capabilities, and user management.

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for build tooling and development server
- **Tailwind CSS** for styling with custom design system
- **Zustand** for state management with persistence
- **React Router** for client-side routing
- **Shadcn/ui** components for consistent UI

### Backend
- **Node.js** with Express server
- **SQLite** for local data storage
- **bcrypt** for password hashing
- **cookie-parser** for session management

## Architecture Patterns

### State Management
- **Zustand stores** for application state
- **Persistence middleware** for localStorage sync
- **Request deduplication** to prevent duplicate API calls
- **Centralized connection management** through dashboard store

### API Design
- **RESTful endpoints** with consistent response format
- **Session-based authentication** with automatic recovery
- **Error boundaries** for graceful error handling
- **Request/response logging** for debugging

### Component Architecture
- **Modular components** with single responsibility
- **Memoized expensive operations** to prevent re-renders
- **Custom hooks** for reusable logic
- **Type-safe interfaces** throughout the application

## Store Architecture

### Dashboard Store (`/stores/dashboard.ts`)
- **Primary connection management** for database providers
- **Supabase table listing** and metadata
- **Modal state management** for database operations
- **Centralized connection status** shared across components

### Data Binding Store (`/stores/data-binding-simple.ts`)
- **Component-specific data bindings** configuration
- **Schema caching** for performance
- **Query result caching** with automatic invalidation
- **Pagination, filtering, and sorting** state

### Auth Store (`/stores/auth.ts`)
- **User authentication state** management
- **Session persistence** and recovery
- **Automatic session validation** on app load
- **Login/logout flow** handling

## Performance Optimizations

### Request Deduplication
- **Centralized request cache** prevents duplicate API calls
- **Promise reuse** for identical concurrent requests
- **Automatic cleanup** after request completion
- **Configurable TTL** for cache invalidation

### Component Performance
- **React.memo** for expensive component renders
- **useMemo and useCallback** for dependency optimization
- **Debounced effects** to prevent rapid API calls
- **Stable component keys** to prevent unnecessary re-renders

### Logging Strategy
- **Environment-based logging** (development vs production)
- **Contextual log categories** for easier debugging
- **Critical path logging** maintained in production
- **Debug utility** for consistent log formatting

## Database Integration

### Supabase Integration
- **Real-time connection management** with status tracking
- **Table schema introspection** and caching
- **Row-level security** policy respect
- **Automatic connection validation** and recovery

### Data Flow
1. **Connection establishment** through dashboard store
2. **Schema loading** and caching in data binding store
3. **Component binding** configuration with filters/sorting
4. **Data fetching** with pagination and real-time updates
5. **Cache management** with automatic invalidation

## Security Considerations

### Authentication
- **Session-based auth** with secure cookies
- **Automatic session recovery** for improved UX
- **Route protection** for authenticated areas
- **CSRF protection** through credential inclusion

### Data Access
- **Credential-based API calls** for server validation
- **Input sanitization** for SQL injection prevention
- **Error message sanitization** to prevent information leakage
- **Connection encryption** for database communication

## Development Guidelines

### Code Organization
- **Feature-based directory structure** for scalability
- **Shared utilities** in `/lib` directory
- **Reusable hooks** in `/hooks` directory
- **Type definitions** co-located with components

### Error Handling
- **Error boundaries** at route level
- **Graceful degradation** for failed API calls
- **User-friendly error messages** with actionable guidance
- **Comprehensive error logging** for debugging

### Testing Strategy
- **Component testing** with React Testing Library
- **API endpoint testing** with integration tests
- **Store testing** for state management logic
- **End-to-end testing** for critical user flows

## Deployment Architecture

### Development
- **Docker Compose** for local development environment
- **Hot reloading** for rapid development cycles
- **Database persistence** through Docker volumes
- **Port configuration** for multiple services

### Production
- **Single Docker container** for simplified deployment
- **Environment variable configuration** for deployment flexibility
- **Volume mounting** for data persistence
- **Health checks** for container monitoring

## File Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # Shadcn/ui base components
│   ├── admin/          # Admin panel components
│   ├── builder/        # Page builder components
│   └── dashboard/      # Dashboard-specific components
├── stores/             # Zustand state stores
├── hooks/              # Custom React hooks
├── lib/                # Utility functions and configs
├── pages/              # Route components
└── types/              # TypeScript type definitions

server/
├── routes/             # Express route handlers
├── utils/              # Server utility functions
├── database/           # Database schema and migrations
└── scripts/            # Deployment and setup scripts
```

## Future Considerations

### Scalability
- **Database connection pooling** for high-traffic scenarios
- **Caching layer** (Redis) for improved performance
- **Microservice architecture** for feature separation
- **CDN integration** for static asset delivery

### Features
- **Real-time collaboration** for multi-user editing
- **Version control** for page and component changes
- **Plugin system** for extensible functionality
- **Advanced deployment options** (Vercel, Netlify integration)