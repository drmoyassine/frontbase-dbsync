# System Patterns *Optional*

This file documents recurring patterns and standards used in the project.
2025-12-04 23:45:04 - System patterns documentation initialized

## Coding Patterns

### Component Architecture Patterns
**2025-12-04 23:45:04 - Component Renderer Delegation Pattern**
- **Pattern**: Specialized renderer delegation with modular file organization
- **Implementation**: ComponentRenderer delegates to BasicRenderers.tsx, FormRenderers.tsx, LayoutRenderers.tsx, DataRenderers.tsx
- **Benefits**: Maintainability, extensibility, clear separation of concerns
- **Usage**: Add new component types by creating corresponding renderer files

**2025-12-04 23:45:04 - Draggable Component Wrapper Pattern**
- **Pattern**: Wrapping components with drag-and-drop functionality
- **Implementation**: DraggableComponent wraps all builder components
- **Benefits**: Consistent drag behavior, drop zone management, component selection
- **Usage**: All interactive components in builder use this pattern

**2025-12-04 23:45:04 - Inline Text Editing Pattern**
- **Pattern**: Direct text editing within components using specialized editor
- **Implementation**: InlineTextEditor component with useComponentTextEditor hook
- **Benefits**: Seamless editing experience, consistent text manipulation
- **Usage**: Text, Heading, and other text-based components

### State Management Patterns
**2025-12-04 23:45:04 - Zustand Store Pattern**
- **Pattern**: Centralized state management with persistent storage
- **Implementation**: Three main stores (builder, dashboard, data-binding) with persist middleware
- **Benefits**: Predictable state updates, persistence, TypeScript support
- **Usage**: All application state managed through Zustand stores

**2025-12-04 23:45:04 - Data Caching Pattern**
- **Pattern**: Intelligent data caching with invalidation and refresh
- **Implementation**: data-binding-simple store with query cache and automatic invalidation
- **Benefits**: Performance optimization, reduced API calls, consistent data
- **Usage**: Database operations and component data binding

### Data Flow Patterns
**2025-12-04 23:45:04 - API Service Layer Pattern**
- **Pattern**: Abstracted API calls through service layer
- **Implementation**: database-api.ts service with consistent error handling
- **Benefits**: Centralized API logic, consistent response format, easier testing
- **Usage**: All backend communication through service layer

**2025-12-04 23:45:04 - Hook-based Data Fetching Pattern**
- **Pattern**: Custom hooks for data operations with caching
- **Implementation**: useSimpleData, useTableSchema, useDataMutation hooks
- **Benefits**: Reusable data logic, built-in loading states, error handling
- **Usage**: Component-level data fetching and manipulation

## Architectural Patterns

### Frontend Architecture
**2025-12-04 23:45:04 - Component-Based Architecture**
- **Pattern**: Modular component system with clear hierarchical structure
- **Implementation**: Components organized by type (Basic, Form, Layout, Data)
- **Benefits**: Reusability, maintainability, clear component responsibilities
- **Usage**: All UI elements follow component-based design

**2025-12-04 23:45:04 - Responsive Design Pattern**
- **Pattern**: Mobile-first responsive design with breakpoint management
- **Implementation**: ResponsiveStyles interface with breakpoint-specific styling
- **Benefits**: Consistent cross-device experience, maintainable responsive code
- **Usage**: All components support responsive styling across viewports

**2025-12-04 23:45:04 - TypeScript-First Development**
- **Pattern**: Comprehensive type safety across entire application
- **Implementation**: Strict TypeScript configuration with interface-based design
- **Benefits**: Runtime safety, better IDE support, easier refactoring
- **Usage**: All files use TypeScript with strict type checking

### Backend Architecture
**2025-12-04 23:45:04 - Modular Route Organization**
- **Pattern**: Organized API routes with clear separation of concerns
- **Implementation**: Separate files for auth, database, pages, project, variables
- **Benefits**: Maintainable API structure, easy to extend, clear endpoint organization
- **Usage**: All API endpoints follow modular route structure

**2025-12-04 23:45:04 - Database Abstraction Pattern**
- **Pattern**: Abstraction layer for database operations
- **Implementation**: DatabaseManager class with consistent API interface
- **Benefits**: Database agnostic design, easier testing, consistent operations
- **Usage**: All database interactions through abstraction layer

**2025-12-04 23:45:04 - Middleware-Based Authentication**
- **Pattern**: JWT-based authentication with middleware protection
- **Implementation**: authenticateToken middleware for protected routes
- **Benefits**: Consistent security, easy route protection, token management
- **Usage**: Protected API endpoints use authentication middleware

### Integration Patterns
**2025-12-04 23:45:04 - Supabase Integration Pattern**
- **Pattern**: REST API integration with Supabase using service layer
- **Implementation**: Modular database API with connection, schema, and data operations
- **Benefits**: Clean separation from Supabase SDK, consistent error handling
- **Usage**: All database operations through Supabase REST API

**2025-12-04 23:45:04 - Drag-and-Drop Integration Pattern**
- **Pattern**: React DND integration with custom drop zones
- **Implementation**: React DND provider with custom drop zone utilities
- **Benefits**: Intuitive user interactions, flexible component placement
- **Usage**: All builder interactions use drag-and-drop functionality

## Development Patterns

### File Organization Patterns
**2025-12-04 23:45:04 - Feature-Based Directory Structure**
- **Pattern**: Organize code by feature and functionality
- **Implementation**: Separate directories for components, hooks, stores, services
- **Benefits**: Easy navigation, clear code ownership, scalable structure
- **Usage**: All new features follow feature-based organization

**2025-12-04 23:45:04 - Component Co-location Pattern**
- **Pattern**: Keep related files close together
- **Implementation**: Components, hooks, and utilities grouped by feature
- **Benefits**: Easier maintenance, reduced import complexity, logical grouping
- **Usage**: Related files co-located within feature directories

### Error Handling Patterns
**2025-12-04 23:45:04 - Consistent API Response Pattern**
- **Pattern**: Standardized API response format across all endpoints
- **Implementation**: { success: boolean, data?: any, message?: string } format
- **Benefits**: Predictable error handling, consistent client logic
- **Usage**: All API endpoints return consistent response format

**2025-12-04 23:45:04 - Error Boundary Pattern**
- **Pattern**: React error boundaries for graceful error handling
- **Implementation**: ErrorBoundary component with fallback UI
- **Benefits**: Prevents app crashes, provides user feedback, easier debugging
- **Usage**: Error boundaries wrap critical application sections

### Performance Patterns
**2025-12-04 23:45:04 - Request Deduplication Pattern**
- **Pattern**: Prevent duplicate API requests with request deduplication
- **Implementation**: request-deduplicator utility with request caching
- **Benefits**: Reduced API load, improved performance, better user experience
- **Usage**: All API requests use deduplication before making actual calls

**2025-12-04 23:45:04 - Component Memoization Pattern**
- **Pattern**: Optimize re-renders with React.memo and useMemo
- **Implementation**: Strategic memoization of expensive components and calculations
- **Benefits**: Improved performance, reduced unnecessary re-renders
- **Usage**: Performance-critical components use memoization

**2025-12-04 23:45:04 - Code Splitting Pattern**
- **Pattern**: Dynamic imports for optimal bundle sizes
- **Implementation**: Lazy loading of components and routes
- **Benefits**: Faster initial load times, reduced bundle sizes
- **Usage**: Non-critical components loaded on-demand

### Testing Patterns (Future Implementation)
**2025-12-04 23:45:04 - Component Testing Pattern**
- **Pattern**: Unit tests for components with React Testing Library
- **Implementation**: Test components in isolation with mocked dependencies
- **Benefits**: Reliable components, easier debugging, regression prevention
- **Usage**: All components have corresponding test files

**2025-12-04 23:45:04 - Integration Testing Pattern**
- **Pattern**: End-to-end testing of critical user flows
- **Implementation**: Playwright/Cypress tests for complete user journeys
- **Benefits**: User-facing bug detection, workflow validation
- **Usage**: Critical user flows tested end-to-end

### Security Patterns
**2025-12-04 23:45:04 - Input Validation Pattern**
- **Pattern**: Comprehensive input validation on both client and server
- **Implementation**: Schema validation with consistent error responses
- **Benefits**: Security hardening, data integrity, user experience
- **Usage**: All user inputs validated before processing

**2025-12-04 23:45:04 - Token-Based Authentication Pattern**
- **Pattern**: JWT tokens with httpOnly cookies for security
- **Implementation**: Automatic token refresh and session recovery
- **Benefits**: Secure authentication, seamless user experience
- **Usage**: Authentication system uses JWT with secure token handling