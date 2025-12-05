# Product Context

This file provides a high-level overview of the project and the expected product that will be created. Initially it is based upon projectBrief.md (if provided) and all other available project-related information in the working directory. This file is intended to be updated as the project evolves, and should be used to inform all other modes of the project's goals and context.
2025-12-04 23:44:04 - Initial Memory Bank creation based on comprehensive project analysis

## Project Goal

Frontbase is a sophisticated visual page builder application that enables users to create web pages through an intuitive drag-and-drop interface. The project aims to provide a comprehensive no-code/low-code solution that combines:

- **Visual Design Interface**: Drag-and-drop component system with real-time preview
- **Database Integration**: Seamless Supabase connectivity for data-driven applications
- **Component-Based Architecture**: Modular design system supporting custom components
- **Responsive Design**: Built-in responsive design capabilities across multiple viewports
- **Real-time Collaboration**: Live preview and instant feedback during the design process

## Key Features

### Core Builder Features
- **Drag-and-Drop Interface**: Intuitive component placement and arrangement
- **Component Library**: Extensive library of Basic, Form, Layout, and Data components
- **Real-time Preview**: Instant visual feedback with responsive viewport simulation
- **Inline Text Editing**: Direct text editing capabilities within components
- **Style Controls**: Comprehensive styling system with responsive breakpoints

### Data Integration
- **Supabase Connectivity**: Direct database connection and management
- **Data Binding System**: Bind components to database tables and columns
- **Query Management**: Built-in data fetching with pagination, sorting, and filtering
- **Schema Visualization**: Visual representation of database structure
- **Real-time Updates**: Live data synchronization with Supabase

### Developer Experience
- **TypeScript Support**: Full type safety across the application
- **State Management**: Robust Zustand-based state management with persistence
- **API Integration**: RESTful API architecture with authentication
- **Performance Optimization**: Request deduplication, component memoization, and caching
- **Development Tools**: Hot reload, debugging capabilities, and development scripts

## Overall Architecture

### Frontend Architecture
- **Technology Stack**: React 18 + TypeScript + Vite for optimal performance and developer experience
- **UI Framework**: Shadcn UI components with Tailwind CSS for consistent design system
- **State Management**: Zustand stores (builder, dashboard, data-binding) with persistent storage
- **Component System**: Modular renderer architecture with specialized handlers for different component types
- **Drag & Drop**: React DND integration for intuitive component manipulation

### Backend Architecture
- **Server**: Node.js + Express with modular route structure
- **Database**: SQLite for local data persistence and metadata storage
- **Authentication**: JWT-based authentication with session management
- **API Design**: RESTful API with consistent response formatting
- **Security**: Secure token handling and middleware-based protection

### Data Flow Architecture
- **Component Rendering**: Hierarchical component system with nested child components
- **State Persistence**: Browser localStorage for UI state, SQLite for server-side persistence
- **Data Binding**: Cached data fetching with automatic invalidation and refresh
- **API Integration**: Service layer abstraction for consistent data access patterns

### Performance Considerations
- **Code Splitting**: Dynamic imports for optimal bundle sizes
- **Memoization**: React.memo and useMemo for expensive operations
- **Request Optimization**: Request deduplication and intelligent caching strategies
- **Responsive Design**: Mobile-first approach with breakpoint-specific styling