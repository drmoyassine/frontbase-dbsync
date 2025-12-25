# Product Context

This file provides a high-level overview of the project and the expected product.
2025-12-25 05:20:00 - Updated for FastAPI architecture

## Project Goal

Frontbase is a visual database builder and admin panel for Supabase, enabling users to:

- **Visual Page Builder**: Drag-and-drop component system with real-time preview
- **Database Management**: Seamless Supabase connectivity for data-driven applications
- **Data Binding**: Automatic foreign key detection and display
- **Admin Dashboard**: Manage pages, users, storage, and settings

## Key Features

### Core Builder Features
- **Drag-and-Drop Interface**: Intuitive component placement
- **Component Library**: Basic, Form, Layout, and Data components
- **Real-time Preview**: Instant visual feedback
- **Style Controls**: Comprehensive styling with responsive breakpoints

### Data Integration
- **Supabase Connectivity**: Direct database connection via PostgREST
- **Auto FK Detection**: Automatic foreign key relationship discovery
- **Data Binding System**: Bind components to database tables
- **React Query Caching**: Optimized data fetching with stale-while-revalidate

### Developer Experience
- **TypeScript**: Full type safety
- **React Query**: Modern data fetching with caching
- **Zustand**: Lightweight state management
- **FastAPI Backend**: Python-based API server

## Architecture

### Frontend Stack
| Technology | Purpose |
|------------|---------|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool |
| Tailwind CSS | Styling |
| shadcn/ui | Component library |
| Zustand | State management |
| TanStack Query | Data fetching |

### Backend Stack
| Technology | Purpose |
|------------|---------|
| FastAPI | API server |
| Python 3.11+ | Runtime |
| SQLAlchemy | ORM |
| SQLite | Local config storage |
| Supabase | User data (via PostgREST) |

### Data Flow
```
React Component
    ↓
useSimpleData() hook
    ↓
useTableData() [React Query]
    ↓
databaseApi [Axios]
    ↓
FastAPI /api/database/*
    ↓
Supabase PostgREST
```

## Deployment

- **Development**: Vite (5173) + FastAPI (8000)
- **Production**: Docker with nginx reverse proxy
- **Database**: Supabase cloud instance