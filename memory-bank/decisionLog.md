# Decision Log

## [2026-01-29] Modular Builder Refactoring - "One File Per X" Architecture

**Context**: The Builder codebase had become monolithic, particularly `PropertiesPanel.tsx` (>1000 lines) and `BasicRenderers.tsx` (handling all basic components). This made maintenance, extension, and testing difficult.

**Decisions Made**:

1.  **Decentralized Architecture ("Vertical Slicing")**:
    - Split components into three distinct modules:
        - `renderers/`: Visual logic (e.g., `ButtonRenderer.tsx`).
        - `properties/`: Configuration panels (e.g., `ButtonProperties.tsx`).
        - `templates/`: JSON structure generators (e.g., `buttonTemplate.ts`).
    - Adopted a "One File Per Component" rule.

2.  **Registry Pattern**:
    - Replaced monolithic imports with `componentRegistry.tsx` (Renderers) and `templates/index.ts` (Templates).
    - `PropertiesPanel` uses a `switch` statement that delegates to specific property files (acting as an orchestrator, not a logic handler).

3.  **Visual Styling Panel Standardization**:
    - Moved all styling logic to `styling/styleProcessor.ts`.
    - Components use `generateStyles` to apply metadata-driven CSS.

**Impact**:
- `PropertiesPanel.tsx` reduced from 1,140 to 299 lines (74% reduction).
- `BasicRenderers.tsx` split into 12 individually maintainable files.
- New `developmentPatterns.md` guide created to standardize future development.
- Zero TypeScript errors after refactor.

---

## [2026-01-06] RLS Single Policy Builder - Validation Logic Fix

**Context**: User reported that the "Create Policy" button was disabled in the single policy builder even when the form appeared valid.

**Issue**: 
- The validation logic (`isValid`) was only checking for legacy `contactTypes`/`permissionLevels` or `Row Conditions`.
- It completely ignored the modern `actorConditionGroup` state (Visual Builder "Who" conditions).
- It also didn't explicitly handle "Unauthenticated" (public) mode as a valid state without conditions.

**Decision**: Updated `isValid` logic in `RLSPolicyBuilder.tsx` to include checks for:
1. `actorConditionGroup.conditions` (presence of valid actor conditions)
2. `isUnauthenticated` state (if true, policy is valid without explicit actor conditions)

**Impact**:
- "Create Policy" button now enables correctly when actor conditions are set.
- Public policies can be created without forced dummy conditions.
- Pushed fix to main branch (commit `886e2b8`).

---

## [2026-01-06] RLS Batch Policy Builder - TypeScript Property Fix

**Context**: User encountered a TypeScript error while working on RLS policy functionality.

**Issue**: 
- Error: `Property 'authIdColumn' does not exist on type {...}. Did you mean 'authUserIdColumn'?`
- Location: `RLSBatchPolicyBuilder.tsx:L159`

**Root Cause**: The `columnMapping` interface was updated to use `authUserIdColumn` (more descriptive name for the Supabase auth user ID reference) but the RLS batch policy builder still referenced the old property name `authIdColumn`.

**Decision**: Fixed the property reference from `authIdColumn` to `authUserIdColumn` to match the current type definition.

**Impact**:
- TypeScript compilation error resolved
- RLS batch policy builder now correctly reads the auth user ID column from config
- Pushed to main branch (commit `9e80d59`)

---

## [2026-01-02] Builder UI/UX Revamp - Visual CSS Styling & Responsive Builder

**Context**: Major builder overhaul to improve UX, implement visual styling, and add responsive features.

**Decisions Made**:

1. **Metadata-driven CSS Properties Engine**
   - Created `src/lib/styles/` with configs, defaults, converters, types
   - Visual toggle groups for flex properties instead of dropdowns
   - Single source of truth via `getDefaultPageStyles()`

2. **Zero-migration Container Styles Persistence**
   - Store styles in `page.layoutData.root.containerStyles` (nested JSON)
   - Extract to `page.containerStyles` on load for convenience
   - No database schema changes required

3. **Responsive Viewport Auto-Switching**
   - < 768px → Mobile canvas
   - 768-1024px → Tablet canvas
   - > 1024px → Desktop canvas
   - Combined with mobile drawer pattern for sidebars

4. **Canvas UX Improvements**
   - Grid overlay now constrained to canvas viewport only
   - Double-click to add components from palette
   - 800px minimum canvas height for comfortable editing
   - Removed snap-to-grid (not needed for Flexbox layout)

5. **Flexbox-first Layout Strategy**
   - Decided against absolute positioning after analysis
   - Flexbox provides better responsiveness and cleaner code generation
   - Future: Optional absolute mode for specific creative needs

**Impact**:
- 17-phase revamp completed
- Production-ready responsive builder
- Clean, extensible styling architecture
- Improved DX with @dnd-kit migration

---

## [2025-12-25] React Query Migration & Initial Commit Preparation

**Context**: Preparing Frontbase for initial commit with FastAPI as sole backend and improved data layer.

**Decisions Made**:

1. **Migrate data layer to React Query**
   - Created `src/hooks/useDatabase.ts` with centralized data hooks
   - Replaced manual fetching in `useSimpleData.ts` with React Query hooks
   - Benefits: Caching, stale-while-revalidate, automatic error handling

2. **Fixed FK data display bug**
   - Root cause: Joins were passed as separate param, but PostgREST requires them in `select` clause
   - Fix: `select=*,providers(*),categories(*)` construction in `useTableData`

3. **Archive Express.js backend**
   - Added `server/` to `.gitignore` (kept locally, not pushed)
   - FastAPI is now the sole production backend
   - Express remains for local reference until verified not needed

4. **Exclude debug components from push**
   - Added `src/components/debug/` to `.gitignore`
   - BackendSwitcher and related tools stay local

5. **Document FK enhancement for v2**
   - Future: User-configurable display columns
   - Future: Fetch only needed columns instead of `table(*)`

**Impact**:
- Clean initial commit without legacy code
- Modern data layer with React Query
- FK relationships display correctly

---

## [2025-12-12] Refactor Builder Store and Enable Strict Types
- **Context**: The `builder.ts` store file was becoming unmanageable (>750 lines) and mixed various concerns (UI, Data, Logic). Additionally, strict type checking was disabled.
- **Decision**: 
    1. Split `builder.ts` into modular slices (`PageSlice`, `ProjectSlice`, `BuilderSlice`, etc.) using Zustand's slice pattern.
    2. Enable `noImplicitAny` in `tsconfig.json` to improve type safety.
- **Consequences**: 
    - Improved maintainability and testability of the store.
    - Better type safety across the codebase.
    - Minor risk of breaking imports (mitigated by re-exporting types).

This file records architectural and implementation decisions using a list format.
2025-12-04 23:44:46 - Decision logging system initialized

## Decision: Memory Bank System Implementation
**Date: 2025-12-04 23:44:04**

**Decision:** Implement comprehensive Memory Bank system for project context management

**Rationale:**
- Project analysis revealed complex architecture requiring centralized documentation
- Multiple modes and extensive codebase need context preservation across sessions
- Development workflow benefits from structured decision tracking and progress monitoring
- Need for maintainable knowledge base for team collaboration

**Implementation Details:**
- Created 5-core file structure: productContext.md, activeContext.md, progress.md, decisionLog.md, systemPatterns.md
- Established timestamp-based update protocols for all entries
- Integrated with mode-specific instructions for automated context management
- Set up cross-mode synchronization capabilities for seamless context preservation

**Impact:**
- Provides structured approach to project documentation and knowledge management
- Enables better team coordination and decision tracking
- Facilitates onboarding and continuous development processes

---

## Decision: Comprehensive Project Analysis Framework
**Date: 2025-12-04 23:44:04**

**Decision:** Conduct thorough multi-dimensional analysis of Frontbase project before implementation

**Rationale:**
- Visual page builder architecture requires deep understanding before modifications
- Complex state management and data flow patterns need comprehensive mapping
- Integration with Supabase and multiple UI frameworks requires careful consideration
- Security and performance implications require detailed analysis

**Implementation Details:**
- Analyzed complete directory structure and component hierarchy
- Documented technology stack: React 18 + TypeScript + Vite frontend, Node.js + Express + SQLite backend
- Mapped state management: Zustand stores for builder, dashboard, and data-binding
- Examined data flow: Supabase integration with caching and real-time updates
- Documented API structure: RESTful endpoints for all major functionality
- Identified development patterns and extension workflows

**Impact:**
- Established solid foundation for informed decision-making
- Created comprehensive reference documentation for ongoing development
- Identified potential optimization opportunities and technical debt areas
- Set baseline understanding for team collaboration and feature development

---

## Decision: Component Architecture Documentation Strategy
**Date: 2025-12-04 23:44:04**

**Decision:** Document component system using modular renderer architecture approach

**Rationale:**
- Large-scale component library requires clear categorization and organization
- Drag-and-drop functionality needs consistent component interface standards
- Data binding system requires careful integration patterns
- Extension and customization workflows need clear guidelines

**Implementation Details:**
- Categorized components into Basic, Form, Layout, and Data types
- Documented ComponentRenderer delegation pattern to specialized renderer files
- Mapped component structure with props, styles, and children relationships
- Analyzed DraggableComponent integration with React DND
- Documented inline editing capabilities and component selection systems

**Impact:**
- Provides clear guidelines for component development and extension
- Establishes consistent interface patterns across the component library
- Enables predictable development workflows for new component types
- Facilitates maintenance and debugging of component interactions

---

## Decision: State Management Architecture Documentation
**Date: 2025-12-04 23:44:04**

**Decision:** Document Zustand-based state management with persistent storage patterns

**Rationale:**
- Multiple interconnected stores require clear responsibility boundaries
- Data persistence strategies need documented patterns for consistency
- Component-level state interactions need clear flow documentation
- Performance optimization opportunities require state management understanding

**Implementation Details:**
- Analyzed three main Zustand stores: builder, dashboard, data-binding
- Documented persistent storage strategies: localStorage for UI, SQLite for server-side
- Mapped data binding state management with caching and invalidation patterns
- Examined authentication state handling with JWT and session recovery
- Analyzed state synchronization patterns across components

**Impact:**
- Establishes clear state management patterns for consistent development
- Provides guidance for implementing new state-dependent features
- Enables optimization of state updates and component re-renders
- Facilitates debugging and troubleshooting of state-related issues

---

## Decision: Frontbase vs DB-Synchronizer Architectural Comparison
**Date: 2025-12-23 23:28:55**

**Decision:** Conduct comprehensive architectural comparison between Frontbase and DB-Synchronizer applications to inform integration strategy

**Rationale:**
- Integration requires deep understanding of both architectures and their compatibility
- Different technology stacks (Node.js vs Python) present significant integration challenges
- Frontend similarities provide opportunities for unification
- Database strategies need careful alignment for successful integration

**Implementation Details:**
- Analyzed Frontbase: Express.js + SQLite + React 18 + TypeScript + Zustand
- Analyzed DB-Synchronizer: FastAPI + Multi-database + React 18 + TypeScript + Zustand + React Query
- Identified high frontend compatibility (React, TypeScript, Vite, Tailwind, Zustand)
- Documented backend integration challenges (Node.js vs Python, Express vs FastAPI)
- Created 12-month phased integration roadmap with Frontbase-dominant approach
- Established risk assessment with mitigation strategies

**Impact:**
- Provides comprehensive integration strategy leveraging Frontbase's mature architecture
- Identifies specific technical challenges and solutions for backend unification
- Establishes clear migration path with measurable success metrics
- Enables informed decision-making for resource allocation and timeline planning

---

## Decision: Database Integration Architecture Documentation
**Date: 2025-12-04 23:44:04**

**Decision:** Document Supabase integration with REST API patterns and caching strategies

**Rationale:**
- Complex data binding system requires comprehensive documentation
- Performance considerations around data fetching and caching need analysis
- API structure requires clear documentation for consistency and maintenance
- Authentication and security patterns need established guidelines

**Implementation Details:**
- Analyzed Supabase REST API integration patterns
- Documented database API service layer and modular route structure
- Mapped data fetching hooks with caching and deduplication strategies
- Examined authentication middleware and session management
- Analyzed data persistence patterns across SQLite and browser storage

**Impact:**
- Provides clear guidelines for database integration and API development
- Establishes consistent patterns for data fetching and state management
- Enables optimization of database queries and API performance
- Facilitates security audit and compliance verification

---

## Decision: Shift to DB-Sync-Dominant Hybrid Integration Strategy
**Date: 2025-12-24 03:48:09**

**Decision:** Pivot from Frontbase-dominant to DB-Sync-dominant hybrid approach with complete Node.js elimination

**Rationale:**
- DB-Sync has stronger and more buildproof backend with async processing capabilities
- DB-Sync is more future-ready with multi-database support and built-in job processing
- Frontbase has excellent frontend architecture and visual builder patterns
- Complete Node.js elimination reduces maintenance burden and deployment complexity
- Zod to Pydantic validation alignment ensures type safety during transition

**Implementation Details:**
- Updated all integration documents to reflect DB-Sync-dominant approach
- Modified timeline from 8-10 months to 10-12 months for comprehensive migration
- Adjusted success probability from 75% to 70% due to increased complexity
- Established 3-phase approach: Backend Integration → Frontend Integration → Node.js Elimination
- Created validation library alignment strategy between Zod and Pydantic
- Updated risk assessment to prioritize Node.js elimination and validation alignment

**Key Changes:**
- Phase 1: Backend Integration (Months 1-2) - Optimize Frontbase with Zod validation, create unified schema
- Phase 2: Frontend Integration (Months 3-6) - Unify frontend, begin Node.js elimination
- Phase 3: Node.js Elimination (Months 7-12) - Complete FastAPI migration, eliminate Node.js

**Impact:**
- Future-ready architecture with eliminated Node.js maintenance overhead
- Leverages DB-Sync's robust backend patterns for better scalability
- Maintains Frontbase's excellent frontend patterns while modernizing backend
- Provides clear migration path with gradual Node.js elimination
- Establishes validation compatibility layer for type safety during transition

---

## Decision: 2025 Express.js to FastAPI Backend Migration
**Date: Dec 24, 2025**

**Decision:** Migrate entire system from Express.js to FastAPI and unify databases.

**Implementation Details:**
- Established Zod to Pydantic compatibility layer.
- Realigned database models on an Alembic-managed SQLite/Postgres setup.
- Validated endpoints with 100% test coverage using BackendSwitcher dynamic swapping.
**Impact:** Phased out Node.js entirely, delivering a fully Python-based control plane.
