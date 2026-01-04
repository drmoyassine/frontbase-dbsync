# Builder Page UI/UX Complete Revamp Proposal

## Executive Summary

The current builder page follows **outdated Frontbase patterns** and does not align with the modern, polished **db-sync UI/UX standards**. This document provides a comprehensive analysis of existing issues and proposes a complete revamp to achieve a responsive, professional, and consistent interface.

---

## Current State Analysis

### Screenshot Analysis
Based on the provided screenshot, the builder shows:
- **Left Sidebar**: Components panel with tabs
- **Center Canvas**: Main building area with data table
- **Right Sidebar**: Properties and Styling tabs
- **Top Header**: Navigation and action buttons

### Critical Issues Identified

#### 1. **Non-Responsive Design**
- **Fixed widths** (300px sidebars) - doesn't adapt to different screen sizes
- **No breakpoint handling** - mobile/tablet experience is broken
- **Rigid 3-column grid** - no flexibility for different workflows
- **Poor space utilization** - excessive whitespace and cramped content

#### 2. **Inconsistent Design Language**
The builder uses different patterns from db-sync:

| Aspect | Current Builder | db-sync Pattern |
|--------|----------------|-----------------|
| **Color Scheme** | Basic HSL vars, bland borders | Rich primary colors (primary-600), vibrant accents, glassmorphism |
| **Typography** | Default weights, inconsistent sizing | Bold headings, uppercase labels, tracking-wider |
| **Component Density** | Sparse, excessive padding | Compact, information-dense |
| **Visual Hierarchy** | Flat, monotone | Clear layers, shadows, depth |
| **Interactivity** | Basic hover states | Smooth transitions, micro-animations, active states |
| **Status Indicators** | Missing or basic | Rich badges with gradients and icons |
| **Drag-and-Drop Library** | ⚠️ **react-dnd** (outdated) | ✅ **@dnd-kit** (modern, performant) |

#### 2.1 **Drag-and-Drop Library Mismatch** 🚨

**CRITICAL**: The builder uses **react-dnd** while db-sync uses **@dnd-kit**

**Why this matters:**
- **Performance**: @dnd-kit is more performant and has better accessibility
- **Consistency**: Same patterns across the entire app
- **Maintenance**: Single DnD library to maintain
- **Modern API**: @dnd-kit has better TypeScript support and modern React patterns
- **Features**: @dnd-kit has better touch support, better animations, and collision detection

**Current builder usage (react-dnd):**
```typescript
// CustomBuilder.tsx
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

// ComponentPalette.tsx
import { useDrag } from 'react-dnd';

// BuilderCanvas.tsx
import { useDrop } from 'react-dnd';
```

**db-sync usage (@dnd-kit):**
```typescript
// ColumnsDropdown.tsx
import { DndContext, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
```

#### 3. **Poor Visual Hierarchy**

**Header Issues:**
- Lacks visual prominence - no gradient background or brand identity
- Button styles are inconsistent (mix of variants)
- "Synced" badge is plain and uninformative
- No clear separation between navigation and actions
- Missing breadcrumb or context indicators

**Sidebar Issues:**
- Tabs are **too small** and hard to tap
- Component palette items lack **visual richness** (no icons showing component preview)
- Search is buried - should be **more prominent**
- **No categorization indicators** or badges showing component counts
- Properties panel has **no visual distinction** between sections

#### 4. **Suboptimal Information Architecture**

**Components Palette:**
```typescript
// Current: Generic list with small icons
<ComponentItem name="Button" icon={MousePointer} />

// Missing:
- Visual previews of components
- Drag feedback indicators
- Recent/favorite components
- Component usage stats
- Quick actions (add to canvas directly)
```

**Properties Panel:**
```typescript
// Current: Simple form fields with plain labels
<Label>Text</Label>
<Input />

// Missing:
- Collapsible sections
- Visual property selectors (color pickers, size presets)
- Live preview of changes
- Property search/filter
- Contextual help tooltips
```

#### 5. **Limited Functionality Indicators**

**Missing Features:**
- No **undo/redo** visual indicators
- No **keyboard shortcuts** hints
- No **component tree breadcrumb**
- No **zoom controls** for canvas
- No **responsive preview modes** (mobile/tablet/desktop)
- No **collaboration indicators** (who's editing)
- No **change tracking** or diff view

#### 6. **Poor User Feedback**

**Current Issues:**
- **Save state** is unclear - "Synced" badge is passive
- **No loading states** for component operations
- **No error boundaries** or validation feedback
- **No success confirmations** for actions
- **No progress indicators** for complex operations

#### 7. **Accessibility Concerns**
- Small touch targets (tabs, icons)
- Insufficient color contrast in some areas
- Missing ARIA labels
- No keyboard navigation hints
- No focus indicators on interactive elements

---

## db-sync UI Patterns Reference

### Design Principles from db-sync

Based on analysis of `DataPreviewHeader.tsx`, `DataPreviewToolbar.tsx`, and `Layout.tsx`:

#### 1. **Rich Visual Language**
```css
/* db-sync uses vibrant, branded colors */
bg-primary-600        /* Rich primary background */
text-primary-100      /* Light primary text on dark bg */
border-primary-500/50 /* Subtle borders with opacity */

/* Gradients and depth */
bg-gradient-to-br from-primary-500 to-primary-700
shadow-lg hover:shadow-xl

/* Glass effects */
bg-white/10 backdrop-blur-lg
```

#### 2. **Typography Hierarchy**
```css
/* db-sync typography patterns */
text-xs font-bold uppercase tracking-wider  /* Labels */
text-sm font-medium                          /* Body */
text-lg font-semibold                        /* Headings */

/* Visual separators */
text-white/70  /* Muted text on colored backgrounds */
text-gray-400  /* Secondary information */
```

#### 3. **Interactive Elements**
```tsx
// db-sync button patterns
<button className="
  px-3 py-1.5 
  bg-primary-600 text-white 
  hover:bg-primary-700 
  shadow-md hover:shadow-lg 
  transition-all 
  rounded-lg
">
  {/* Rich feedback on interaction */}
</button>

// Micro-animations
<div className="
  animate-in slide-in-from-top-2 
  duration-200
">
</div>
```

#### 4. **Status Indicators**
```tsx
// db-sync shows rich status with gradients
<div className="
  px-3 py-1 
  bg-primary-600 rounded-lg 
  shadow-sm
">
  <span className="text-xs font-bold text-white/70">
    STATUS
  </span>
</div>
```

#### 5. **Form Fields**
```tsx
// db-sync input styling
<input className="
  px-4 py-2 
  bg-white/10 
  border border-white/20 
  rounded-lg 
  text-white 
  placeholder:text-white/40 
  focus:ring-2 focus:ring-white/30 
  outline-none 
  transition-all
" />
```

---

## Proposed Revamp: Complete Redesign

### Vision Statement
> Transform the builder into a **modern, responsive, visually stunning interface** that matches db-sync's quality while providing professional-grade page building capabilities with seamless drag-and-drop, rich visual feedback, and intelligent contextual tools.

---

## Phase 1: Responsive Foundation

### 1.1 Flexible Grid System

**Replace rigid CSS Grid with dynamic system:**

```tsx
// Current (builder.css)
.builder-layout.design-mode {
  grid-template-columns: 300px 1fr 300px; // FIXED!
}

// Proposed: Responsive breakpoint system
.builder-layout {
  display: flex;
  gap: 0;
  position: relative;
}

.builder-sidebar {
  width: var(--sidebar-width, 280px);
  min-width: 240px;
  max-width: 400px;
  resize: horizontal;
  overflow: hidden;
}

@media (max-width: 1280px) {
  .builder-sidebar {
    width: 260px;
  }
}

@media (max-width: 1024px) {
  .builder-sidebar {
    position: absolute;
    z-index: 50;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }
  
  .builder-sidebar.open {
    transform: translateX(0);
  }
}
```

### 1.2 Collapsible Panels

```tsx
interface BuilderLayoutProps {
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
}

export const ResponsiveBuilderLayout = ({
  leftPanelOpen,
  rightPanelOpen,
  onToggleLeft,
  onToggleRight
}: BuilderLayoutProps) => {
  return (
    <div className="flex h-full relative">
      {/* Collapsible Left Panel */}
      <AnimatePresence>
        {leftPanelOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-r border-gray-200 dark:border-gray-700"
          >
            <LeftSidebar />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Canvas - Takes remaining space */}
      <main className="flex-1 flex flex-col min-w-0">
        <BuilderCanvas />
      </main>

      {/* Collapsible Right Panel */}
      <AnimatePresence>
        {rightPanelOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-l border-gray-200 dark:border-gray-700"
          >
            <RightSidebar />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Toggle Buttons - Floating */}
      <button
        onClick={onToggleLeft}
        className="absolute left-0 top-1/2 -translate-y-1/2 
                   bg-white dark:bg-gray-800 border-r border-gray-200 
                   px-1 py-8 rounded-r-lg shadow-lg hover:shadow-xl 
                   transition-all z-40"
      >
        {leftPanelOpen ? <ChevronLeft /> : <ChevronRight />}
      </button>
    </div>
  );
};
```

### 1.3 Migrate from react-dnd to @dnd-kit

**CRITICAL MIGRATION**: Replace all react-dnd usage with @dnd-kit to align with db-sync patterns.

#### Why @dnd-kit?

| Feature | react-dnd | @dnd-kit |
|---------|-----------|----------|
| **Bundle Size** | ~45KB | ~25KB |
| **Performance** | Good | Excellent (uses transform instead of position) |
| **Accessibility** | Basic | Built-in keyboard & screen reader support |
| **Touch Support** | Limited | Full multi-touch support |
| **Animation** | Custom required | Built-in with CSS transforms |
| **TypeScript** | Partial | Full type safety |
| **Modular** | Monolithic | Tree-shakeable |

#### Migration Step-by-Step

**Step 1: Update Dependencies**

```bash
# Remove react-dnd
npm uninstall react-dnd react-dnd-html5-backend

# Install @dnd-kit
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Step 2: Migrate CustomBuilder Provider**

**Before (react-dnd):**
```tsx
// src/components/builder/CustomBuilder.tsx
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

export const CustomBuilder = () => {
  return (
    <DndProvider backend={HTML5Backend}>
      {/* Builder content */}
    </DndProvider>
  );
};
```

**After (@dnd-kit):**
```tsx
// src/components/builder/CustomBuilder.tsx
import { DndContext, useSensor, useSensors, PointerSensor, KeyboardSensor } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

export const CustomBuilder = () => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 } // 5px threshold to prevent accidental drags
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) return;
    
    // Handle component drop logic
    console.log('Dropped:', active.id, 'onto:', over.id);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {/* Builder content */}
    </DndContext>
  );
};
```

**Step 3: Migrate Component Palette (Draggable Items)**

**Before (react-dnd):**
```tsx
// ComponentPalette.tsx
import { useDrag } from 'react-dnd';

const ComponentItem = ({ name, icon }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'component',
    item: { type: name },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  return (
    <div ref={drag} className={isDragging ? 'opacity-50' : ''}>
      {name}
    </div>
  );
};
```

**After (@dnd-kit):**
```tsx
// ComponentPalette.tsx
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

const ComponentItem = ({ name, icon }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `component-${name}`,
    data: { type: name, category: 'component' }
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab'
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      {...attributes}
      {...listeners}
      className="component-item"
    >
      <icon.Icon className="w-4 h-4" />
      {name}
    </div>
  );
};
```

**Step 4: Migrate Canvas (Drop Zone)**

**Before (react-dnd):**
```tsx
// BuilderCanvas.tsx
import { useDrop } from 'react-dnd';

export const BuilderCanvas = () => {
  const [{ isOver }, drop] = useDrop({
    accept: 'component',
    drop: (item: any) => {
      console.log('Dropped:', item);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  return (
    <div ref={drop} className={isOver ? 'bg-primary-50' : ''}>
      {/* Canvas content */}
    </div>
  );
};
```

**After (@dnd-kit):**
```tsx
// BuilderCanvas.tsx
import { useDroppable } from '@dnd-kit/core';

export const BuilderCanvas = () => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'canvas-drop-zone',
    data: { accepts: ['component'] }
  });

  return (
    <div 
      ref={setNodeRef} 
      className={`canvas-container ${isOver ? 'bg-primary-50 border-primary-400' : ''}`}
    >
      {/* Canvas content */}
    </div>
  );
};
```

**Step 5: Migrate Sortable Lists (Layers Panel)**

**Before (react-dnd):**
```tsx
// LayersPanel.tsx
import { useDrag, useDrop } from 'react-dnd';

const SortableLayer = ({ layer, index, moveLayer }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'layer',
    item: { index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: 'layer',
    hover: (item: any) => {
      if (item.index !== index) {
        moveLayer(item.index, index);
        item.index = index;
      }
    },
  });

  return (
    <div ref={(node) => drag(drop(node))}>
      {layer.name}
    </div>
  );
};
```

**After (@dnd-kit - MUCH SIMPLER):**
```tsx
// LayersPanel.tsx  
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SortableLayer = ({ layer }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: layer.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <GripVertical className="w-4 h-4 text-gray-400" />
      {layer.name}
    </div>
  );
};

// In parent component:
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

<SortableContext items={layers} strategy={verticalListSortingStrategy}>
  {layers.map(layer => (
    <SortableLayer key={layer.id} layer={layer} />
  ))}
</SortableContext>
```

**Step 6: Advanced Features - Drag Overlay (Optional but Recommended)**

```tsx
// CustomBuilder.tsx
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { useState } from 'react';

export const CustomBuilder = () => {
  const [activeItem, setActiveItem] = useState(null);

  const handleDragStart = (event) => {
    setActiveItem(event.active.data.current);
  };

  const handleDragEnd = (event) => {
    setActiveItem(null);
    // Handle drop logic
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Builder content */}
      
      {/* Drag Overlay - shows custom preview while dragging */}
      <DragOverlay>
        {activeItem ? (
          <div className="bg-white shadow-2xl rounded-lg p-3 border-2 border-primary-500">
            <activeItem.icon className="w-5 h-5 text-primary-600" />
            <span className="font-bold">{activeItem.type}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
```

**Step 7: Migration Checklist**

- [ ] Install @dnd-kit packages
- [ ] Remove react-dnd packages
- [ ] Update `CustomBuilder.tsx` with `DndContext`
- [ ] Migrate `ComponentPalette.tsx` to use `useDraggable`
- [ ] Migrate `BuilderCanvas.tsx` to use `useDroppable`
- [ ] Migrate `LayersPanel.tsx` to use `useSortable`
- [ ] Migrate `DraggableComponent.tsx` to use `useSortable`
- [ ] Update column configurators (`DraggableColumnItem.tsx`)
- [ ] Test drag and drop functionality
- [ ] Test keyboard accessibility (Tab + Space/Enter)
- [ ] Test touch support on mobile devices
- [ ] Remove all react-dnd imports

**Benefits After Migration:**
- ✅ 40% smaller bundle size
- ✅ Better performance (uses CSS transforms)
- ✅ Full keyboard navigation support
- ✅ Screen reader support
- ✅ Better TypeScript types
- ✅ Consistent with db-sync patterns
- ✅ Easier to maintain (one DnD library)

---

## Phase 2: Visual Enhancement - db-sync Alignment

### 2.1 Enhanced Header

```tsx
export const EnhancedBuilderHeader = () => {
  const { currentPage, saveStatus } = useBuilderStore();

  return (
    <header className="h-16 bg-gradient-to-r from-primary-600 to-primary-700 
                       border-b border-primary-800 shadow-lg">
      <div className="h-full px-6 flex items-center justify-between">
        
        {/* Left: Branding + Breadcrumb */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm 
                            flex items-center justify-center">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-white">Builder</span>
          </div>

          {/* Rich Breadcrumb */}
          <div className="flex items-center gap-2 px-4 py-2 
                          bg-white/10 rounded-lg backdrop-blur-md">
            <span className="text-xs font-bold text-white/50 uppercase 
                           tracking-wider cursor-pointer hover:text-white 
                           transition-colors">
              Project
            </span>
            <ChevronRight className="w-3 h-3 text-white/30" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              {currentPage?.name || 'Untitled Page'}
            </span>
            <button className="ml-2 p-1 hover:bg-white/20 rounded">
              <Pencil className="w-3 h-3 text-white/70" />
            </button>
          </div>
        </div>

        {/* Center: View Mode Switcher */}
        <div className="flex items-center gap-2 bg-white/10 p-1 rounded-lg">
          <button className="px-4 py-2 bg-white text-primary-600 rounded-md 
                           text-xs font-bold shadow-md transition-all">
            <Eye className="w-4 h-4 inline mr-2" />
            Design
          </button>
          <button className="px-4 py-2 text-white/70 hover:bg-white/10 
                           rounded-md text-xs font-bold transition-all">
            <Monitor className="w-4 h-4 inline mr-2" />
            Preview
          </button>
          <button className="px-4 py-2 text-white/70 hover:bg-white/10 
                           rounded-md text-xs font-bold transition-all">
            <Smartphone className="w-4 h-4 inline mr-2" />
            Mobile
          </button>
        </div>

        {/* Right: Actions + Status */}
        <div className="flex items-center gap-3">
          
          {/* Save Status Badge */}
          <div className={`
            px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider 
            flex items-center gap-2 transition-all
            ${saveStatus === 'saved' 
              ? 'bg-green-500/20 text-green-200 border border-green-400/30' 
              : saveStatus === 'saving'
              ? 'bg-yellow-500/20 text-yellow-200 border border-yellow-400/30 animate-pulse'
              : 'bg-red-500/20 text-red-200 border border-red-400/30'}
          `}>
            {saveStatus === 'saved' && <CheckCircle className="w-3 h-3" />}
            {saveStatus === 'saving' && <Loader2 className="w-3 h-3 animate-spin" />}
            {saveStatus === 'unsaved' && <AlertCircle className="w-3 h-3" />}
            {saveStatus}
          </div>

          {/* Action Buttons */}
          <button className="px-4 py-2 bg-white/10 hover:bg-white/20 
                           text-white rounded-lg text-sm font-bold 
                           transition-all flex items-center gap-2 
                           border border-white/20">
            <Save className="w-4 h-4" />
            Save
          </button>

          <button className="px-4 py-2 bg-white text-primary-600 
                           hover:bg-primary-50 rounded-lg text-sm font-bold 
                           transition-all shadow-lg hover:shadow-xl 
                           flex items-center gap-2">
            <Play className="w-4 h-4" />
            Publish
          </button>

          <div className="w-px h-8 bg-white/20" />

          <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <MoreVertical className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </header>
  );
};
```

### 2.2 Enhanced Component Palette

```tsx
export const EnhancedComponentPalette = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  return (
    <div className="h-full flex flex-col bg-gradient-to-b 
                    from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      
      {/* Header with Search */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white 
                       uppercase tracking-wider">
            Components
          </h2>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-md">
            <button
              onClick={() => setView('grid')}
              className={`p-1.5 rounded transition-all ${
                view === 'grid' 
                  ? 'bg-white dark:bg-gray-700 shadow-sm' 
                  : 'hover:bg-white/50'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`p-1.5 rounded transition-all ${
                view === 'list' 
                  ? 'bg-white dark:bg-gray-700 shadow-sm' 
                  : 'hover:bg-white/50'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Prominent Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 
                           w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search components..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 
                     bg-white dark:bg-gray-800 
                     border border-gray-200 dark:border-gray-700 
                     rounded-lg text-sm 
                     focus:ring-2 focus:ring-primary-500/50 
                     focus:border-primary-500 
                     outline-none transition-all
                     placeholder:text-gray-400"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 
                       p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Category Pills */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 
                    overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`
                px-3 py-1.5 rounded-full text-xs font-bold uppercase 
                tracking-wider transition-all whitespace-nowrap
                ${activeCategory === category.id
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                }
              `}
            >
              <category.icon className="w-3 h-3 inline mr-1.5" />
              {category.label}
              <span className="ml-1.5 opacity-70">({category.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Components Grid/List */}
      <div className="flex-1 overflow-y-auto p-4">
        {view === 'grid' ? (
          <div className="grid grid-cols-2 gap-3">
            {filteredComponents.map((component) => (
              <RichComponentCard key={component.name} component={component} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredComponents.map((component) => (
              <RichComponentListItem key={component.name} component={component} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Rich Component Card
const RichComponentCard = ({ component }: { component: Component }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'component',
    item: { type: component.name },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  return (
    <div
      ref={drag}
      className={`
        group relative p-3 rounded-xl border-2 
        bg-white dark:bg-gray-800 
        hover:shadow-lg hover:-translate-y-1 
        transition-all duration-200 cursor-grab active:cursor-grabbing
        ${isDragging 
          ? 'opacity-50 border-primary-500 shadow-xl scale-105' 
          : 'border-gray-200 dark:border-gray-700 hover:border-primary-400'
        }
      `}
    >
      {/* Component Preview Icon */}
      <div className="aspect-square rounded-lg bg-gradient-to-br 
                    from-primary-50 to-primary-100 dark:from-primary-900/30 
                    dark:to-primary-800/30 
                    flex items-center justify-center mb-2 
                    group-hover:scale-110 transition-transform">
        <component.icon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
      </div>

      {/* Component Info */}
      <div className="text-center">
        <div className="font-bold text-xs text-gray-900 dark:text-white mb-0.5">
          {component.name}
        </div>
        <div className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1">
          {component.description}
        </div>
      </div>

      {/* Quick Action - Shows on Hover */}
      <button
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 
                 p-1.5 bg-primary-600 text-white rounded-md 
                 shadow-lg hover:bg-primary-700 transition-all"
        onClick={(e) => {
          e.stopPropagation();
          // Add to canvas directly
        }}
      >
        <Plus className="w-3 h-3" />
      </button>

      {/* Drag Indicator */}
      <div className="absolute inset-0 border-2 border-dashed border-primary-500 
                    rounded-xl opacity-0 group-hover:opacity-20 pointer-events-none" />
    </div>
  );
};
```

### 2.3 Enhanced Properties Panel

```tsx
export const EnhancedPropertiesPanel = () => {
  const { selectedComponent } = useBuilderStore();
  const [expandedSections, setExpandedSections] = useState(['general', 'layout']);

  if (!selectedComponent) {
    return (
      <div className="h-full flex flex-col items-center justify-center 
                    text-center p-8">
        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 
                      flex items-center justify-center mb-4">
          <Settings className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="font-bold text-gray-900 dark:text-white mb-2">
          No Selection
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Select a component to view and edit its properties
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-b 
                  from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      
      {/* Header with Component Info */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br 
                          from-primary-500 to-primary-600 
                          flex items-center justify-center shadow-md">
              <selectedComponent.icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-xs font-bold text-gray-500 dark:text-gray-400 
                            uppercase tracking-wider">
                Component
              </div>
              <div className="font-bold text-gray-900 dark:text-white">
                {selectedComponent.type}
              </div>
            </div>
          </div>
          <button className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 
                           rounded-lg text-red-600 dark:text-red-400 
                           transition-colors group">
            <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
          </button>
        </div>

        {/* Component Title Input */}
        <input
          type="text"
          placeholder="Component title..."
          value={selectedComponent.props.title || ''}
          className="w-full px-3 py-2 bg-white dark:bg-gray-800 
                   border border-gray-200 dark:border-gray-700 rounded-lg 
                   text-sm font-medium focus:ring-2 focus:ring-primary-500/50 
                   outline-none transition-all"
        />
      </div>

      {/* Tabbed Sections */}
      <div className="flex-1 overflow-y-auto">
        <Accordion
          type="multiple"
          value={expandedSections}
          onValueChange={setExpandedSections}
          className="divide-y divide-gray-200 dark:divide-gray-700"
        >
          {/* General Properties */}
          <AccordionItem value="general" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:bg-gray-50 
                                       dark:hover:bg-gray-800/50 
                                       text-sm font-bold uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-primary-600" />
                General
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 py-3 space-y-3 
                                       bg-gray-50/50 dark:bg-gray-900/50">
              <PropertyField
                label="Visibility"
                type="switch"
                value={selectedComponent.props.visible}
              />
              <PropertyField
                label="Class Name"
                type="text"
                value={selectedComponent.props.className}
                placeholder="custom-class"
              />
            </AccordionContent>
          </AccordionItem>

          {/* Layout Properties */}
          <AccordionItem value="layout" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:bg-gray-50 
                                       dark:hover:bg-gray-800/50 
                                       text-sm font-bold uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <Layout className="w-4 h-4 text-primary-600" />
                Layout
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 py-3 space-y-3 
                                       bg-gray-50/50 dark:bg-gray-900/50">
              {/* Visual Size Selector */}
              <div>
                <label className="text-xs font-bold text-gray-700 
                                dark:text-gray-300 uppercase tracking-wider mb-2 
                                block">
                  Padding
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {['None', 'Small', 'Medium', 'Large'].map((size) => (
                    <button
                      key={size}
                      className={`
                        py-2 px-1 rounded-lg text-xs font-bold transition-all
                        ${selectedComponent.props.padding === size.toLowerCase()
                          ? 'bg-primary-600 text-white shadow-md'
                          : 'bg-white dark:bg-gray-800 text-gray-600 border border-gray-200 hover:border-primary-400'
                        }
                      `}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Direction Selector with Icons */}
              <div>
                <label className="text-xs font-bold text-gray-700 
                                dark:text-gray-300 uppercase tracking-wider mb-2 
                                block">
                  Direction
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button className="aspect-square rounded-lg border-2 
                                   border-gray-200 hover:border-primary-500 
                                   flex items-center justify-center 
                                   transition-all">
                    <ArrowDownIcon className="w-5 h-5" />
                  </button>
                  <button className="aspect-square rounded-lg border-2 
                                   border-gray-200 hover:border-primary-500 
                                   flex items-center justify-center 
                                   transition-all">
                    <ArrowRightIcon className="w-5 h-5" />
                  </button>
                  <button className="aspect-square rounded-lg border-2 
                                   border-primary-600 bg-primary-50 
                                   flex items-center justify-center">
                    <Grid className="w-5 h-5 text-primary-600" />
                  </button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Styling Properties */}
          <AccordionItem value="styling" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:bg-gray-50 
                                       dark:hover:bg-gray-800/50 
                                       text-sm font-bold uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-primary-600" />
                Styling
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 py-3 space-y-3 
                                       bg-gray-50/50 dark:bg-gray-900/50">
              {/* Color Picker */}
              <div>
                <label className="text-xs font-bold text-gray-700 
                                dark:text-gray-300 uppercase tracking-wider mb-2 
                                block">
                  Background Color
                </label>
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg border-2 border-gray-300 
                                bg-primary-600 cursor-pointer 
                                shadow-inner hover:scale-110 transition-transform" />
                  <input
                    type="text"
                    value="#6366F1"
                    className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 
                             border border-gray-200 rounded-lg text-sm 
                             font-mono"
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Data Binding */}
          <AccordionItem value="data" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:bg-gray-50 
                                       dark:hover:bg-gray-800/50 
                                       text-sm font-bold uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-primary-600" />
                Data Binding
                {selectedComponent.binding && (
                  <span className="ml-auto px-2 py-0.5 bg-green-100 
                                 dark:bg-green-900/30 text-green-700 
                                 dark:text-green-400 text-[10px] font-bold 
                                 rounded-full">
                    CONNECTED
                  </span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 py-3 space-y-3 
                                       bg-gray-50/50 dark:bg-gray-900/50">
              <button className="w-full px-4 py-3 bg-gradient-to-r 
                               from-primary-600 to-primary-700 text-white 
                               rounded-lg font-bold text-sm 
                               shadow-lg hover:shadow-xl hover:scale-105 
                               transition-all flex items-center justify-center 
                               gap-2">
                <Database className="w-4 h-4" />
                {selectedComponent.binding ? 'Edit Binding' : 'Configure Binding'}
              </button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Quick Actions Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 
                    bg-white dark:bg-gray-800">
        <div className="grid grid-cols-2 gap-2">
          <button className="px-3 py-2 bg-gray-100 dark:bg-gray-700 
                           hover:bg-gray-200 dark:hover:bg-gray-600 
                           rounded-lg text-sm font-bold transition-all 
                           flex items-center justify-center gap-2">
            <Copy className="w-4 h-4" />
            Duplicate
          </button>
          <button className="px-3 py-2 bg-gray-100 dark:bg-gray-700 
                           hover:bg-gray-200 dark:hover:bg-gray-600 
                           rounded-lg text-sm font-bold transition-all 
                           flex items-center justify-center gap-2">
            <Code className="w-4 h-4" />
            View Code
          </button>
        </div>
      </div>
    </div>
  );
};
```

### 2.4 Enhanced Canvas

```tsx
export const EnhancedBuilderCanvas = () => {
  const { zoom, setZoom, canvasMode } = useBuilderStore();

  return (
    <div className="relative h-full bg-gradient-to-br 
                  from-gray-100 via-gray-50 to-gray-100 
                  dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      
      {/* Canvas Controls - Floating */}
      <div className="absolute top-4 right-4 z-30 
                    flex flex-col gap-2">
        
        {/* Zoom Controls */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl 
                      border border-gray-200 dark:border-gray-700 p-2">
          <div className="flex flex-col gap-1">
            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 
                             rounded transition-colors">
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="text-center text-xs font-bold text-gray-600 
                          dark:text-gray-400 py-1">
              {Math.round(zoom * 100)}%
            </div>
            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 
                             rounded transition-colors">
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="w-full h-px bg-gray-200 dark:bg-gray-700 my-1" />
            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 
                             rounded transition-colors">
              <Maximize className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Device Preview Modes */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl 
                      border border-gray-200 dark:border-gray-700 p-2">
          <div className="flex flex-col gap-1">
            <button className="p-2 bg-primary-50 dark:bg-primary-900/30 
                             text-primary-600 rounded transition-all">
              <Monitor className="w-4 h-4" />
            </button>
            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 
                             rounded transition-colors">
              <Tablet className="w-4 h-4" />
            </button>
            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 
                             rounded transition-colors">
              <Smartphone className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Canvas Viewport */}
      <div className="h-full overflow-auto p-8">
        <div
          className="mx-auto bg-white dark:bg-gray-900 
                   shadow-2xl rounded-lg overflow-hidden 
                   transition-all duration-300"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            width: canvasMode === 'desktop' ? '100%' : 
                   canvasMode === 'tablet' ? '768px' : '375px',
            minHeight: '600px',
          }}
        >
          <ComponentRenderer />
        </div>
      </div>

      {/* Drop Zone Indicators */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Would show visual feedback for drag-drop targets */}
      </div>
    </div>
  );
};
```

---

## Phase 3: Enhanced Functionality

### 3.1 Keyboard Shortcuts Panel

```tsx
export const KeyboardShortcutsPanel = () => {
  const shortcuts = [
    { keys: ['Ctrl', 'S'], action: 'Save page' },
    { keys: ['Ctrl', 'Z'], action: 'Undo' },
    { keys: ['Ctrl', 'Shift', 'Z'], action: 'Redo' },
    { keys: ['Del'], action: 'Delete component' },
    { keys: ['Esc'], action: 'Deselect' },
    { keys: ['Ctrl', 'D'], action: 'Duplicate' },
  ];

  return (
    <div className="p-6 max-w-md">
      <h3 className="font-bold text-lg mb-4">Keyboard Shortcuts</h3>
      <div className="space-y-2">
        {shortcuts.map((shortcut, i) => (
          <div key={i} className="flex items-center justify-between py-2 
                                border-b border-gray-100 last:border-0">
            <span className="text-sm text-gray-600">{shortcut.action}</span>
            <div className="flex gap-1">
              {shortcut.keys.map((key, j) => (
                <kbd key={j} className="px-2 py-1 bg-gray-100 rounded text-xs 
                                     font-mono font-bold border border-gray-300">
                  {key}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

### 3.2 Undo/Redo System

```tsx
// Add to BuilderHeader
<div className="flex gap-1 bg-white/10 p-1 rounded-lg">
  <button
    disabled={!canUndo}
    className="p-2 hover:bg-white/20 rounded disabled:opacity-30 
             disabled:cursor-not-allowed transition-all"
    title="Undo (Ctrl+Z)"
  >
    <Undo className="w-4 h-4 text-white" />
  </button>
  <button
    disabled={!canRedo}
    className="p-2 hover:bg-white/20 rounded disabled:opacity-30 
             disabled:cursor-not-allowed transition-all"
    title="Redo (Ctrl+Shift+Z)"
  >
    <Redo className="w-4 h-4 text-white" />
  </button>
</div>
```

### 3.3 Component Tree View

```tsx
export const ComponentTreeView = () => {
  const { currentPage, selectedComponentId, setSelectedComponentId } = useBuilderStore();

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-bold uppercase tracking-wider">
          Component Tree
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <TreeNode
          component={currentPage}
          level={0}
          selectedId={selectedComponentId}
          onSelect={setSelectedComponentId}
        />
      </div>
    </div>
  );
};

const TreeNode = ({ component, level, selectedId, onSelect }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = component.children?.length > 0;

  return (
    <div>
      <div
        className={`
          flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer 
          transition-all group
          ${selectedId === component.id 
            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400' 
            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
          }
        `}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onSelect(component.id)}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          >
            {expanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
        )}
        <component.icon className="w-4 h-4" />
        <span className="text-sm font-medium flex-1">
          {component.props.title || component.type}
        </span>
        <button className="opacity-0 group-hover:opacity-100 p-1 
                         hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
          <Eye className="w-3 h-3" />
        </button>
      </div>
      {hasChildren && expanded && (
        <div>
          {component.children.map((child) => (
            <TreeNode
              key={child.id}
              component={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};
```

---

## Phase 4: Performance & Polish

### 4.1 Loading States

```tsx
export const ComponentLoadingSkeleton = () => (
  <div className="p-3 rounded-lg border border-gray-200 animate-pulse">
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 bg-gray-200 rounded-md" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-3 bg-gray-100 rounded w-1/2" />
      </div>
    </div>
  </div>
);
```

### 4.2 Error Boundaries

```tsx
export class BuilderErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFrom(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center p-8 max-w-md">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full 
                          bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
            <p className="text-gray-600 mb-6">
              The builder encountered an error. Please refresh the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg 
                       font-bold hover:bg-primary-700 transition-all"
            >
              Reload Builder
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### 4.3 Animations & Transitions

```css
/* Enhanced transitions */
@keyframes slideInFromLeft {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes fadeInScale {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-slide-in {
  animation: slideInFromLeft 0.3s ease-out;
}

.animate-fade-in-scale {
  animation: fadeInScale 0.2s ease-out;
}

/* Smooth property changes */
.transition-smooth {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

## Implementation Roadmap

### Week 1-2: Foundation + DnD Migration ⚠️
**PRIORITY: DnD Migration must be completed first**
- [ ] **Migrate from react-dnd to @dnd-kit** (CRITICAL)
  - [ ] Install @dnd-kit packages
  - [ ] Update CustomBuilder.tsx with DndContext
  - [ ] Migrate ComponentPalette.tsx
  - [ ] Migrate BuilderCanvas.tsx
  - [ ] Migrate LayersPanel.tsx
  - [ ] Migrate DraggableComponent.tsx
  - [ ] Test all drag-and-drop functionality
- [ ] Implement responsive grid system
- [ ] Create collapsible panel architecture
- [ ] Add breakpoint handlers
- [ ] Set up animation framework

### Week 3-4: Visual Enhancement
- [ ] Redesign header with db-sync styling
- [ ] Enhanced component palette with grid/list views
- [ ] Rich properties panel with accordions
- [ ] Visual property selectors (colors, sizes)
- [ ] Add drag overlay for better feedback

### Week 5-6: Functionality
- [ ] Component tree view
- [ ] Keyboard shortcuts system
- [ ] Undo/redo implementation
- [ ] Canvas zoom and device preview modes

### Week 7-8: Polish & Testing
- [ ] Loading states and skeletons
- [ ] Error boundaries
- [ ] Performance optimization
- [ ] Cross-browser testing
- [ ] Mobile responsiveness validation
- [ ] Accessibility testing (keyboard navigation, screen readers)


---

## Success Metrics

### User Experience
- **Responsiveness**: Smooth on screens from 1024px to 3840px
- **Performance**: < 100ms interaction delay
- **Visual Polish**: Matches db-sync quality standards
- **Accessibility**: WCAG 2.1 AA compliance

### Technical
- **Code Quality**: TypeScript strict mode, 0 linting errors
- **Bundle Size**: < 200KB additional overhead
- **Test Coverage**: > 80% for new components

---

## Conclusion

This revamp transforms the builder from a **basic, rigid interface** to a **professional-grade, responsive, visually stunning design tool** that:

✅ **Matches db-sync UI patterns** - Consistent design language across the app  
✅ **Fully responsive** - Works seamlessly on all devices  
✅ **Rich visual feedback** - Gradients, shadows, animations, micro-interactions  
✅ **Enhanced functionality** - Tree view, shortcuts, undo/redo, zoom controls  
✅ **Production-ready** - Error handling, loading states, accessibility  

**Next Step**: Review this proposal and prioritize implementation phases based on business needs.
