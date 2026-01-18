# Phase 0: LiquidJS Templating Engine - Implementation Plan

**Goal:** Replace regex-based variable resolution with LiquidJS for filters/transformations + add `@` mention autocomplete in Builder.  
**Estimated Effort:** 1-1.5 days  
**Risk:** Low (LiquidJS is battle-tested, used by Shopify)  
**Priority:** PREREQUISITE for Sprint 5  

**Last Updated:** 2026-01-18

> [!CAUTION]
> This phase **MUST** be completed before Sprint 5 UI Components. All components depend on this templating system.

---

## Table of Contents

1. [Overview](#overview)
2. [Part 1: Edge Engine - LiquidJS Integration](#part-1-edge-engine---liquidjs-integration)
3. [Part 2: Builder - @ Mention Autocomplete](#part-2-builder---mention-autocomplete)
4. [Part 3: Visitor Tracking Settings](#part-3-visitor-tracking-settings)
5. [Part 4: Variable Scopes & Context](#part-4-variable-scopes--context)
6. [Files Summary](#files-summary)
7. [Verification Plan](#verification-plan)
8. [Acceptance Criteria](#acceptance-criteria)

---

## Overview

### Current State

The existing `resolveProps()` function in `ssr/PageRenderer.ts` uses **regex** to replace `{{variable}}` patterns:

```typescript
// Current: Regex-based (limited)
resolved[key] = value.replace(/\{\{(\w+(?:\.\w+)?)\}\}|\$\{(\w+(?:\.\w+)?)\}/g, ...)
```

**Limitations:**
- ❌ No filters (`{{ name | upcase }}`)
- ❌ No conditionals (`{% if user %}...{% endif %}`)
- ❌ No loops (`{% for item in items %}...{% endfor %}`)

### Target State

Replace with **LiquidJS** templating engine:

```liquid
{{ user.name | upcase }}                    → "JOHN"
{{ text | truncate: 50 }}                   → "Lorem ipsum..."
{% if user %}Welcome, {{ user.firstName }}!{% endif %}
{% for item in items %}{{ item.name }}{% endfor %}
```

---

## Part 1: Edge Engine - LiquidJS Integration

### 1.1 Install LiquidJS

**File:** `services/edge/package.json`

```bash
cd services/edge && npm install liquidjs
```

**Dependency:**
```json
{
  "dependencies": {
    "liquidjs": "^10.10.0"
  }
}
```

**Bundle Impact:** ~15KB gzipped

---

### 1.2 Create Liquid Engine Module

**File:** [NEW] `services/edge/src/ssr/lib/liquid.ts`

```typescript
/**
 * LiquidJS Engine Configuration
 * 
 * Provides template rendering with custom filters for Frontbase.
 */

import { Liquid } from 'liquidjs';

// Create engine instance
export const liquid = new Liquid({
  strictVariables: false,    // Allow undefined variables (render as empty)
  strictFilters: false,      // Allow undefined filters (pass through)
  trimTagLeft: false,        // Preserve whitespace
  trimTagRight: false,
  trimOutputLeft: false,
  trimOutputRight: false,
});

// =============================================================================
// Custom Filters
// =============================================================================

/**
 * Format as currency
 * Usage: {{ price | money }} → "$29.99"
 * Usage: {{ price | money: "EUR" }} → "€29.99"
 */
liquid.registerFilter('money', (value: number, currency: string = 'USD') => {
  const symbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', KES: 'KSh' };
  const symbol = symbols[currency] || currency + ' ';
  return `${symbol}${Number(value).toFixed(2)}`;
});

/**
 * Relative time (time ago)
 * Usage: {{ createdAt | time_ago }} → "2 days ago"
 */
liquid.registerFilter('time_ago', (value: string | Date) => {
  const date = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
});

/**
 * Convert timezone
 * Usage: {{ system.datetime | timezone: visitor.timezone }} → "2026-01-18 17:00:00"
 */
liquid.registerFilter('timezone', (value: string, tz: string) => {
  try {
    const date = new Date(value);
    return date.toLocaleString('en-US', { timeZone: tz });
  } catch {
    return value;
  }
});

/**
 * Default value
 * Usage: {{ url.page | default: 1 }} → 1 (if url.page is undefined)
 */
liquid.registerFilter('default', (value: unknown, defaultValue: unknown) => {
  return value !== undefined && value !== null && value !== '' ? value : defaultValue;
});

/**
 * JSON stringify
 * Usage: {{ page.jsonld | json }} → '{"@type":"WebPage",...}'
 */
liquid.registerFilter('json', (value: unknown) => {
  return JSON.stringify(value);
});

/**
 * Pluralize
 * Usage: {{ count | pluralize: "item", "items" }} → "items" (if count != 1)
 */
liquid.registerFilter('pluralize', (count: number, singular: string, plural: string) => {
  return count === 1 ? singular : plural;
});

export { Liquid };
```

---

### 1.3 Update PageRenderer to Use LiquidJS

**File:** [MODIFY] `services/edge/src/ssr/PageRenderer.ts`

#### Changes Required:

1. **Import liquid engine**
2. **Make `resolveProps()` async** (LiquidJS is async)
3. **Make `renderComponent()` async**
4. **Make `renderPage()` async**

```typescript
// Add import
import { liquid } from './lib/liquid.js';

/**
 * Resolve dynamic props that contain LiquidJS template expressions.
 * NOW ASYNC - LiquidJS parseAndRender is async.
 */
async function resolveProps(
    props: Record<string, unknown> | undefined,
    context: TemplateContext
): Promise<Record<string, unknown>> {
    if (!props) return {};

    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(props)) {
        if (typeof value === 'string' && (value.includes('{{') || value.includes('{%'))) {
            // Use LiquidJS for template rendering
            try {
                resolved[key] = await liquid.parseAndRender(value, context);
            } catch (error) {
                console.error(`Template error in prop "${key}":`, error);
                resolved[key] = value; // Fallback to original value
            }
        } else if (typeof value === 'object' && value !== null) {
            // Recursively resolve nested objects
            resolved[key] = await resolveProps(value as Record<string, unknown>, context);
        } else {
            resolved[key] = value;
        }
    }

    return resolved;
}

/**
 * Render a single component to HTML.
 * NOW ASYNC - due to LiquidJS.
 */
async function renderComponent(
    component: PageComponent, 
    context: TemplateContext, 
    depth: number = 0
): Promise<string> {
    const { id, type, props, styles, children, binding } = component;
    const resolvedProps = await resolveProps(props, context);
    
    // ... rest of implementation (make children rendering async too)
    const childrenHtml = children 
        ? (await Promise.all(children.map(child => renderComponent(child, context, depth + 1)))).join('')
        : '';
    
    // ... switch statement for component types
}

/**
 * Main entry point: Render a page layout to HTML.
 * NOW ASYNC - due to LiquidJS.
 */
export async function renderPage(
    layoutData: PageLayoutData, 
    context: TemplateContext
): Promise<string> {
    // ... implementation
    const contentHtml = (await Promise.all(
        layoutData.content.map(component => renderComponent(component, context))
    )).join('');
    
    return `<div class="fb-page ${rootClass}" style="${rootStyle}">${contentHtml}</div>`;
}
```

---

### 1.4 Create Template Context Builder

**File:** [NEW] `services/edge/src/ssr/lib/context.ts`

```typescript
/**
 * Template Context Builder
 * 
 * Builds the unified context object for LiquidJS template rendering.
 */

import type { VariableStore } from '../store.js';

// =============================================================================
// Types
// =============================================================================

export interface TemplateContext {
    page: PageContext;
    user: UserContext | null;
    visitor: VisitorContext;
    url: Record<string, string>;
    system: SystemContext;
    cookies: Record<string, string>;
    local: Record<string, unknown>;
    session: Record<string, unknown>;
    record?: Record<string, unknown>;
    records?: Record<string, unknown>[];
}

interface PageContext {
    id: string;
    title: string;
    url: string;
    slug: string;
    description: string;
    published: boolean;
    createdAt: string;
    updatedAt: string;
    image: string;
    type: string;
    custom: Record<string, unknown>;
}

interface UserContext {
    id: string;
    email: string;
    name: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    role: string;
    [key: string]: unknown;
}

interface VisitorContext {
    ip: string;
    country: string;
    city: string;
    timezone: string;
    device: 'mobile' | 'tablet' | 'desktop';
    browser: string;
    os: string;
    language: string;
    referrer: string;
    isBot: boolean;
}

interface SystemContext {
    date: string;
    time: string;
    datetime: string;
    timestamp: number;
    year: number;
    month: number;
    day: number;
    env: string;
}

// =============================================================================
// Context Builder
// =============================================================================

export async function buildTemplateContext(
    request: Request,
    pageData: PageData,
    store: VariableStore,
    dataContext?: { record?: Record<string, unknown>; records?: Record<string, unknown>[] }
): Promise<TemplateContext> {
    
    // Parse cookies
    const cookies = parseCookies(request.headers.get('Cookie') || '');
    
    // Get user from session (if authenticated)
    const user = await getUserFromSession(request);
    
    // Build visitor context from headers
    const visitor = buildVisitorContext(request);
    
    // Flatten URL query params
    const url = buildUrlContext(request);
    
    // System variables (UTC)
    const system = buildSystemContext();
    
    return {
        page: {
            id: pageData.id,
            title: pageData.title,
            url: pageData.canonicalUrl || `${new URL(request.url).origin}/${pageData.slug}`,
            slug: pageData.slug,
            description: pageData.description || '',
            published: pageData.published,
            createdAt: pageData.createdAt,
            updatedAt: pageData.updatedAt,
            image: pageData.ogImage || '',
            type: pageData.ogType || 'website',
            custom: pageData.customVariables || {},
        },
        user,
        visitor,
        url,
        system,
        cookies,
        local: store.getPageVariables(),
        session: {}, // Client-only, empty on SSR
        record: dataContext?.record,
        records: dataContext?.records,
    };
}

// =============================================================================
// Helper Functions
// =============================================================================

function parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    cookieHeader.split(';').forEach(cookie => {
        const [name, ...rest] = cookie.trim().split('=');
        if (name) cookies[name] = rest.join('=');
    });
    return cookies;
}

function buildVisitorContext(request: Request): VisitorContext {
    const headers = request.headers;
    const userAgent = headers.get('User-Agent') || '';
    
    // Parse device type from User-Agent
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
    const isTablet = /iPad|Tablet/i.test(userAgent);
    
    // Parse browser
    let browser = 'Unknown';
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';
    
    // Parse OS
    let os = 'Unknown';
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';
    
    return {
        ip: headers.get('CF-Connecting-IP') || headers.get('X-Forwarded-For')?.split(',')[0] || '',
        country: headers.get('CF-IPCountry') || '',
        city: '', // Requires geo-IP service
        timezone: (request as any).cf?.timezone || 'UTC',
        device: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop',
        browser,
        os,
        language: headers.get('Accept-Language')?.split(',')[0] || 'en',
        referrer: headers.get('Referer') || '',
        isBot: /bot|crawl|spider|slurp/i.test(userAgent),
    };
}

function buildUrlContext(request: Request): Record<string, string> {
    const url: Record<string, string> = {};
    new URL(request.url).searchParams.forEach((value, key) => {
        url[key] = value;
    });
    return url;
}

function buildSystemContext(): SystemContext {
    const now = new Date();
    return {
        date: now.toISOString().split('T')[0],
        time: now.toISOString().split('T')[1].replace('Z', '') + 'Z',
        datetime: now.toISOString(),
        timestamp: now.getTime(),
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
        day: now.getUTCDate(),
        env: process.env.NODE_ENV || 'development',
    };
}

async function getUserFromSession(request: Request): Promise<UserContext | null> {
    // TODO: Implement JWT decoding and user fetch
    // This will be implemented when we integrate with auth
    return null;
}
```

---

### 1.6 Supabase Auth Integration (MVP)

**File:** [NEW] `services/edge/src/ssr/lib/auth.ts`

For MVP, we use Supabase Auth. The auth provider is configured in `/users` settings.

```typescript
/**
 * Supabase Auth - User Session Handler
 * 
 * Decodes Supabase JWT and fetches user record from contacts table.
 * MVP: Supabase Auth only. Post-MVP: Support Clerk, Auth0, etc.
 */

import { createClient } from '@supabase/supabase-js';
import type { UserContext } from './context.js';

// Initialize Supabase client (read-only for Edge)
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Get authenticated user from request.
 * 
 * 1. Extract JWT from cookie or Authorization header
 * 2. Verify & decode JWT via Supabase
 * 3. Fetch full user record from contacts table
 */
export async function getUserFromSession(request: Request): Promise<UserContext | null> {
    try {
        // 1. Extract access token
        const accessToken = extractAccessToken(request);
        if (!accessToken) return null;
        
        // 2. Verify token and get Supabase user
        const { data: { user }, error } = await supabase.auth.getUser(accessToken);
        if (error || !user) {
            console.warn('Auth verification failed:', error?.message);
            return null;
        }
        
        // 3. Fetch full user record from contacts table
        const { data: contact, error: contactError } = await supabase
            .from('contacts')
            .select('*')
            .eq('email', user.email)
            .single();
        
        if (contactError || !contact) {
            // User exists in auth but not in contacts - return minimal info
            return {
                id: user.id,
                email: user.email || '',
                name: user.user_metadata?.full_name || '',
                firstName: user.user_metadata?.first_name || '',
                lastName: user.user_metadata?.last_name || '',
                avatar: user.user_metadata?.avatar_url,
                role: 'user',
            };
        }
        
        // Return full contact record as user context
        return {
            id: contact.id,
            email: contact.email,
            name: contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
            firstName: contact.first_name || '',
            lastName: contact.last_name || '',
            avatar: contact.avatar_url,
            role: contact.role || 'user',
            phone: contact.phone,
            company: contact.company,
            createdAt: contact.created_at,
            // Include all other contact fields
            ...contact,
        };
        
    } catch (error) {
        console.error('getUserFromSession error:', error);
        return null;
    }
}

/**
 * Extract access token from request.
 * Checks: 1) sb-access-token cookie, 2) Authorization header
 */
function extractAccessToken(request: Request): string | null {
    // Try cookie first (preferred for SSR)
    const cookieHeader = request.headers.get('Cookie') || '';
    const cookies = parseCookies(cookieHeader);
    
    if (cookies['sb-access-token']) {
        return cookies['sb-access-token'];
    }
    
    // Fallback to Authorization header
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }
    
    return null;
}

function parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    cookieHeader.split(';').forEach(cookie => {
        const [name, ...rest] = cookie.trim().split('=');
        if (name) cookies[name] = rest.join('=');
    });
    return cookies;
}
```

**Update `context.ts`** to import from auth module:

```typescript
// In context.ts
import { getUserFromSession } from './auth.js';

// Remove the stub function, use imported one
```

**Environment Variables Required:**

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

---

### 1.5 Update SSR Route Handler

**File:** [MODIFY] `services/edge/src/routes/pages.ts`

Update the page route handler to use the new async `renderPage()`:

```typescript
import { buildTemplateContext } from '../ssr/lib/context.js';
import { renderPage } from '../ssr/PageRenderer.js';

app.get('/:slug', async (c) => {
    const pageData = await fetchPageData(c.req.param('slug'));
    
    // Build template context
    const context = await buildTemplateContext(c.req.raw, pageData, store);
    
    // Render page (now async)
    const html = await renderPage(pageData.layoutData, context);
    
    return c.html(wrapInHtmlDocument(html, pageData, context));
});
```

---

## Part 2: Builder - @ Mention Autocomplete

### 2.1 Create VariablePicker Component

**File:** [NEW] `src/components/builder/VariablePicker.tsx`

```typescript
/**
 * Variable Picker - Autocomplete dropdown for template variables
 * 
 * Triggered by @ keystroke in text fields.
 * Shows available variables and filters with fuzzy search.
 */

import { useState, useEffect, useRef } from 'react';
import { useVariables } from '@/hooks/useVariables';

interface VariablePickerProps {
    onSelect: (value: string) => void;
    onClose: () => void;
    searchTerm: string;
    position: { top: number; left: number };
}

export function VariablePicker({ onSelect, onClose, searchTerm, position }: VariablePickerProps) {
    const { variables, filters, isLoading } = useVariables();
    const [selectedIndex, setSelectedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);
    
    // Filter by search term
    const filteredVariables = variables.filter(v => 
        v.path.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const filteredFilters = filters.filter(f =>
        f.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                setSelectedIndex(i => Math.min(i + 1, filteredVariables.length + filteredFilters.length - 1));
            } else if (e.key === 'ArrowUp') {
                setSelectedIndex(i => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
                handleSelect(selectedIndex);
            } else if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndex, filteredVariables, filteredFilters]);
    
    const handleSelect = (index: number) => {
        if (index < filteredVariables.length) {
            onSelect(`{{ ${filteredVariables[index].path} }}`);
        } else {
            const filterIndex = index - filteredVariables.length;
            onSelect(` | ${filteredFilters[filterIndex].name}`);
        }
        onClose();
    };
    
    return (
        <div 
            className="variable-picker"
            style={{ top: position.top, left: position.left }}
            ref={listRef}
        >
            {isLoading ? (
                <div className="loading">Loading...</div>
            ) : (
                <>
                    {filteredVariables.length > 0 && (
                        <div className="section">
                            <div className="section-header">📁 Variables</div>
                            {filteredVariables.map((v, i) => (
                                <div
                                    key={v.path}
                                    className={`item ${i === selectedIndex ? 'selected' : ''}`}
                                    onClick={() => handleSelect(i)}
                                >
                                    <span className="path">{v.path}</span>
                                    <span className="type">{v.type}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {filteredFilters.length > 0 && (
                        <div className="section">
                            <div className="section-header">🔧 Filters</div>
                            {filteredFilters.map((f, i) => (
                                <div
                                    key={f.name}
                                    className={`item ${i + filteredVariables.length === selectedIndex ? 'selected' : ''}`}
                                    onClick={() => handleSelect(i + filteredVariables.length)}
                                >
                                    <span className="name">{f.name}</span>
                                    <span className="description">{f.description}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
```

---

### 2.2 Create VariableInput Wrapper

**File:** [NEW] `src/components/builder/VariableInput.tsx`

```typescript
/**
 * Variable Input - Text input with @ mention support
 * 
 * Wraps any text input to add variable autocomplete functionality.
 */

import { useState, useRef, useCallback } from 'react';
import { VariablePicker } from './VariablePicker';

interface VariableInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    multiline?: boolean;
}

export function VariableInput({ value, onChange, placeholder, className, multiline }: VariableInputProps) {
    const [showPicker, setShowPicker] = useState(false);
    const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 });
    const [searchTerm, setSearchTerm] = useState('');
    const [cursorPosition, setCursorPosition] = useState(0);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
    
    const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
        const target = e.target as HTMLInputElement;
        const pos = target.selectionStart || 0;
        setCursorPosition(pos);
        
        // Check for @ trigger
        const textBeforeCursor = value.slice(0, pos);
        const atIndex = textBeforeCursor.lastIndexOf('@');
        
        if (atIndex !== -1 && !textBeforeCursor.slice(atIndex).includes(' ')) {
            setSearchTerm(textBeforeCursor.slice(atIndex + 1));
            setShowPicker(true);
            
            // Position picker near cursor
            const rect = target.getBoundingClientRect();
            setPickerPosition({
                top: rect.bottom + 5,
                left: rect.left + (atIndex * 8), // Approximate character width
            });
        } else {
            setShowPicker(false);
        }
    }, [value]);
    
    const handleSelect = useCallback((insertValue: string) => {
        // Find @ position and replace with selected value
        const textBeforeCursor = value.slice(0, cursorPosition);
        const atIndex = textBeforeCursor.lastIndexOf('@');
        const newValue = value.slice(0, atIndex) + insertValue + value.slice(cursorPosition);
        onChange(newValue);
        setShowPicker(false);
    }, [value, cursorPosition, onChange]);
    
    const InputComponent = multiline ? 'textarea' : 'input';
    
    return (
        <div className="variable-input-wrapper">
            <InputComponent
                ref={inputRef as any}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyUp={handleKeyUp}
                placeholder={placeholder}
                className={className}
            />
            {showPicker && (
                <VariablePicker
                    searchTerm={searchTerm}
                    position={pickerPosition}
                    onSelect={handleSelect}
                    onClose={() => setShowPicker(false)}
                />
            )}
        </div>
    );
}
```

---

### 2.3 Create useVariables Hook

**File:** [NEW] `src/hooks/useVariables.ts`

```typescript
/**
 * useVariables Hook
 * 
 * Fetches available variables and filters from the API.
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Variable {
    path: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    source: 'page' | 'user' | 'visitor' | 'url' | 'system' | 'record' | 'local' | 'session' | 'cookies';
    description?: string;
}

interface Filter {
    name: string;
    args?: string[];
    description: string;
}

interface VariablesResponse {
    variables: Variable[];
    filters: Filter[];
}

export function useVariables(pageId?: string) {
    const { data, isLoading, error } = useQuery<VariablesResponse>({
        queryKey: ['variables', pageId],
        queryFn: async () => {
            const response = await api.get('/api/variables', { params: { page_id: pageId } });
            return response.data;
        },
        staleTime: 60_000, // Cache for 1 minute
    });
    
    return {
        variables: data?.variables || [],
        filters: data?.filters || [],
        isLoading,
        error,
    };
}
```

---

### 2.4 Create Variables Registry API

**File:** [NEW] `fastapi-backend/app/routers/variables.py`

```python
"""
Variables Registry API

Returns available template variables and filters for the Builder.
"""

from fastapi import APIRouter, Depends
from typing import List, Optional
from pydantic import BaseModel

router = APIRouter(prefix="/variables", tags=["variables"])

class Variable(BaseModel):
    path: str
    type: str
    source: str
    description: Optional[str] = None

class Filter(BaseModel):
    name: str
    args: Optional[List[str]] = None
    description: str

class VariablesResponse(BaseModel):
    variables: List[Variable]
    filters: List[Filter]

# Built-in LiquidJS filters
BUILTIN_FILTERS = [
    Filter(name="upcase", description="Convert to uppercase"),
    Filter(name="downcase", description="Convert to lowercase"),
    Filter(name="capitalize", description="Capitalize first letter"),
    Filter(name="truncate", args=["length"], description="Truncate to length"),
    Filter(name="strip", description="Remove whitespace"),
    Filter(name="split", args=["delimiter"], description="Split into array"),
    Filter(name="join", args=["separator"], description="Join array to string"),
    Filter(name="first", description="First item of array"),
    Filter(name="last", description="Last item of array"),
    Filter(name="size", description="Length of array/string"),
    Filter(name="plus", args=["number"], description="Add number"),
    Filter(name="minus", args=["number"], description="Subtract number"),
    Filter(name="times", args=["number"], description="Multiply by number"),
    Filter(name="divided_by", args=["number"], description="Divide by number"),
    Filter(name="round", description="Round to nearest integer"),
    Filter(name="date", args=["format"], description="Format date"),
    Filter(name="default", args=["value"], description="Default if empty"),
    # Custom filters
    Filter(name="money", args=["currency"], description="Format as currency"),
    Filter(name="time_ago", description="Relative time (e.g., '2 days ago')"),
    Filter(name="timezone", args=["tz"], description="Convert to timezone"),
    Filter(name="json", description="JSON stringify"),
    Filter(name="pluralize", args=["singular", "plural"], description="Pluralize based on count"),
]

# Static variable scopes
STATIC_VARIABLES = [
    # Page
    Variable(path="page.id", type="string", source="page", description="Page ID"),
    Variable(path="page.title", type="string", source="page", description="Page title"),
    Variable(path="page.url", type="string", source="page", description="Canonical URL"),
    Variable(path="page.slug", type="string", source="page", description="URL slug"),
    Variable(path="page.description", type="string", source="page", description="Meta description"),
    Variable(path="page.image", type="string", source="page", description="OpenGraph image"),
    Variable(path="page.type", type="string", source="page", description="OpenGraph type"),
    Variable(path="page.custom.*", type="object", source="page", description="Custom page variables"),
    
    # User
    Variable(path="user.id", type="string", source="user", description="User ID"),
    Variable(path="user.email", type="string", source="user", description="Email address"),
    Variable(path="user.name", type="string", source="user", description="Full name"),
    Variable(path="user.firstName", type="string", source="user", description="First name"),
    Variable(path="user.lastName", type="string", source="user", description="Last name"),
    Variable(path="user.role", type="string", source="user", description="User role"),
    Variable(path="user.*", type="object", source="user", description="Any contact field"),
    
    # Visitor
    Variable(path="visitor.ip", type="string", source="visitor", description="IP address"),
    Variable(path="visitor.country", type="string", source="visitor", description="Country code"),
    Variable(path="visitor.city", type="string", source="visitor", description="City"),
    Variable(path="visitor.timezone", type="string", source="visitor", description="Timezone"),
    Variable(path="visitor.device", type="string", source="visitor", description="Device type"),
    Variable(path="visitor.browser", type="string", source="visitor", description="Browser name"),
    Variable(path="visitor.os", type="string", source="visitor", description="Operating system"),
    Variable(path="visitor.language", type="string", source="visitor", description="Preferred language"),
    
    # URL
    Variable(path="url.*", type="string", source="url", description="Query parameter"),
    
    # System
    Variable(path="system.date", type="string", source="system", description="Current date (UTC)"),
    Variable(path="system.time", type="string", source="system", description="Current time (UTC)"),
    Variable(path="system.datetime", type="string", source="system", description="ISO timestamp (UTC)"),
    Variable(path="system.year", type="number", source="system", description="Current year"),
    Variable(path="system.month", type="number", source="system", description="Current month"),
    Variable(path="system.day", type="number", source="system", description="Current day"),
    
    # User-defined
    Variable(path="local.*", type="any", source="local", description="Page-level variable"),
    Variable(path="session.*", type="any", source="session", description="Session variable"),
    Variable(path="cookies.*", type="string", source="cookies", description="Cookie value"),
]

@router.get("", response_model=VariablesResponse)
async def get_variables(page_id: Optional[str] = None):
    """
    Get available template variables and filters.
    
    If page_id is provided, includes page-specific custom variables.
    """
    variables = STATIC_VARIABLES.copy()
    
    # TODO: Add page-specific custom variables if page_id provided
    # TODO: Add data source record fields if page has data bindings
    
    return VariablesResponse(
        variables=variables,
        filters=BUILTIN_FILTERS
    )
```

---

### 2.5 Register Router in FastAPI

**File:** [MODIFY] `fastapi-backend/app/main.py`

```python
from app.routers import variables

app.include_router(variables.router, prefix="/api")
```

---

## Part 3: Visitor Tracking Settings

Visitor tracking variables (`visitor.isFirstVisit`, `visitor.visitCount`, etc.) require **optional cookie storage**. This is controlled via Settings UI.

### 3.1 Settings UI Component

**File:** [MODIFY] `src/modules/dbsync/pages/Settings.tsx`

Add a "Privacy & Tracking" section under the existing settings:

```tsx
// Add to Settings.tsx

interface PrivacySettings {
    enableVisitorTracking: boolean;
    cookieExpiryDays: number;
    requireCookieConsent: boolean;
}

function PrivacyTrackingSection() {
    const [settings, setSettings] = useState<PrivacySettings>({
        enableVisitorTracking: false,
        cookieExpiryDays: 365,
        requireCookieConsent: true,
    });
    
    const handleSave = async () => {
        await api.put('/api/settings/privacy', settings);
        toast.success('Privacy settings saved');
    };
    
    return (
        <SettingsSection title="Privacy & Tracking">
            <div className="setting-row">
                <label>
                    <input
                        type="checkbox"
                        checked={settings.enableVisitorTracking}
                        onChange={(e) => setSettings(s => ({ 
                            ...s, 
                            enableVisitorTracking: e.target.checked 
                        }))}
                    />
                    Enable visitor tracking cookies
                </label>
                <p className="description">
                    Track first visit, visit count, and landing page for personalization.
                </p>
            </div>
            
            {settings.enableVisitorTracking && (
                <>
                    <div className="setting-row">
                        <label>Cookie expiry (days)</label>
                        <input
                            type="number"
                            value={settings.cookieExpiryDays}
                            onChange={(e) => setSettings(s => ({ 
                                ...s, 
                                cookieExpiryDays: parseInt(e.target.value) 
                            }))}
                            min={1}
                            max={365}
                        />
                    </div>
                    
                    <div className="setting-row">
                        <label>
                            <input
                                type="checkbox"
                                checked={settings.requireCookieConsent}
                                onChange={(e) => setSettings(s => ({ 
                                    ...s, 
                                    requireCookieConsent: e.target.checked 
                                }))}
                            />
                            Require cookie consent before tracking
                        </label>
                    </div>
                </>
            )}
            
            <button onClick={handleSave}>Save</button>
        </SettingsSection>
    );
}
```

---

### 3.2 Settings API Endpoint

**File:** [NEW] `fastapi-backend/app/routers/settings.py`

```python
"""
Settings API - Privacy & Tracking Configuration
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/settings", tags=["settings"])

class PrivacySettings(BaseModel):
    enableVisitorTracking: bool = False
    cookieExpiryDays: int = 365
    requireCookieConsent: bool = True

# Store settings in database (fb_settings table)
@router.get("/privacy")
async def get_privacy_settings():
    # TODO: Fetch from fb_settings table
    return PrivacySettings()

@router.put("/privacy")
async def update_privacy_settings(settings: PrivacySettings):
    # TODO: Save to fb_settings table
    return settings
```

---

### 3.3 Edge Visitor Tracking Logic

**File:** [NEW] `services/edge/src/ssr/lib/tracking.ts`

```typescript
/**
 * Visitor Tracking - Optional Cookie-Based Tracking
 * 
 * Only active if enabled in /settings → Privacy & Tracking
 */

import type { VisitorContext } from './context.js';

interface TrackingConfig {
    enableVisitorTracking: boolean;
    cookieExpiryDays: number;
    requireCookieConsent: boolean;
}

interface TrackingVariables {
    isFirstVisit: boolean;
    visitCount: number;
    firstVisitAt: string;
    landingPage: string;
}

const TRACKING_COOKIE_NAME = 'fb_visitor';

/**
 * Extend visitor context with tracking variables (if enabled)
 */
export function applyVisitorTracking(
    visitor: VisitorContext,
    request: Request,
    config: TrackingConfig,
    cookies: Record<string, string>
): VisitorContext & Partial<TrackingVariables> {
    
    // If tracking disabled, return base visitor context
    if (!config.enableVisitorTracking) {
        return visitor;
    }
    
    // If consent required, check for consent cookie
    if (config.requireCookieConsent && cookies['fb_consent'] !== 'accepted') {
        return visitor;
    }
    
    // Parse existing tracking cookie
    const trackingData = parseTrackingCookie(cookies[TRACKING_COOKIE_NAME]);
    
    // Determine if first visit
    const isFirstVisit = !trackingData;
    
    // Build tracking variables
    const tracking: TrackingVariables = {
        isFirstVisit,
        visitCount: (trackingData?.visitCount || 0) + 1,
        firstVisitAt: trackingData?.firstVisitAt || new Date().toISOString(),
        landingPage: trackingData?.landingPage || new URL(request.url).pathname,
    };
    
    return {
        ...visitor,
        ...tracking,
    };
}

/**
 * Build Set-Cookie header for tracking (called on response)
 */
export function buildTrackingCookie(
    tracking: TrackingVariables,
    config: TrackingConfig
): string {
    const data = JSON.stringify({
        visitCount: tracking.visitCount,
        firstVisitAt: tracking.firstVisitAt,
        landingPage: tracking.landingPage,
    });
    
    const maxAge = config.cookieExpiryDays * 86400;
    return `${TRACKING_COOKIE_NAME}=${encodeURIComponent(data)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
}

function parseTrackingCookie(value: string | undefined): TrackingVariables | null {
    if (!value) return null;
    try {
        return JSON.parse(decodeURIComponent(value));
    } catch {
        return null;
    }
}
```

---

### 3.4 Integration with Context Builder

**Update:** `services/edge/src/ssr/lib/context.ts`

```typescript
import { applyVisitorTracking, TrackingConfig } from './tracking.js';

export async function buildTemplateContext(
    request: Request,
    pageData: PageData,
    store: VariableStore,
    trackingConfig: TrackingConfig,  // ADD THIS
    dataContext?: { record?: Record<string, unknown>; records?: Record<string, unknown>[] }
): Promise<TemplateContext> {
    
    const cookies = parseCookies(request.headers.get('Cookie') || '');
    const user = await getUserFromSession(request);
    
    // Build base visitor context
    let visitor = buildVisitorContext(request);
    
    // Apply tracking if enabled
    visitor = applyVisitorTracking(visitor, request, trackingConfig, cookies);
    
    // ... rest of context building
}
```

---

### 3.5 Fetch Config in SSR Route

**Update:** `services/edge/src/routes/pages.ts`

```typescript
// Fetch tracking config from Edge KV or Redis
async function getTrackingConfig(): Promise<TrackingConfig> {
    // TODO: Fetch from Redis/KV cache (originally from fb_settings table)
    return {
        enableVisitorTracking: false,
        cookieExpiryDays: 365,
        requireCookieConsent: true,
    };
}

app.get('/:slug', async (c) => {
    const pageData = await fetchPageData(c.req.param('slug'));
    const trackingConfig = await getTrackingConfig();
    
    const context = await buildTemplateContext(
        c.req.raw, 
        pageData, 
        store,
        trackingConfig  // Pass config
    );
    
    // ... render page
});
```

---

## Part 4: Variable Scopes & Context

### Variable Scope Summary

| Scope | Storage | Lifetime | SSR | Use Case |
|-------|---------|----------|-----|----------|
| `page.*` | Database | Permanent | ✅ | Page metadata, SEO |
| `user.*` | Session | Login session | ✅ | User profile |
| `visitor.*` | Headers | Per-request | ✅ | Device, location |
| `url.*` | Query string | Per-request | ✅ | URL parameters |
| `system.*` | Runtime | Per-request | ✅ | Date/time (UTC) |
| `record.*` | Query | Per-component | ✅ | Data binding |
| `local.*` | In-memory | Page navigation | ✅ | UI state |
| `session.*` | localStorage | Browser session | ❌ | Cart, preferences |
| `cookies.*` | Cookies | Configurable | ✅ | Theme, locale |

---

## Files Summary

### New Files

| Path | Purpose |
|------|---------|
| `services/edge/src/ssr/lib/liquid.ts` | LiquidJS engine with custom filters |
| `services/edge/src/ssr/lib/context.ts` | Template context builder |
| `services/edge/src/ssr/lib/auth.ts` | Supabase Auth - JWT decode & user fetch |
| `services/edge/src/ssr/lib/tracking.ts` | Visitor tracking cookie logic |
| `src/components/builder/VariablePicker.tsx` | Autocomplete dropdown |
| `src/components/builder/VariableInput.tsx` | Input with @ trigger |
| `src/hooks/useVariables.ts` | Variables fetch hook |
| `fastapi-backend/app/routers/variables.py` | Variables registry API |
| `fastapi-backend/app/routers/settings.py` | Privacy & Tracking settings API |

### Modified Files

| Path | Changes |
|------|---------|
| `services/edge/package.json` | Add `liquidjs`, `@supabase/supabase-js` |
| `services/edge/src/ssr/PageRenderer.ts` | Make async, use LiquidJS |
| `services/edge/src/routes/pages.ts` | Use buildTemplateContext, add tracking |
| `fastapi-backend/app/main.py` | Register variables & settings routers |
| `src/modules/dbsync/pages/Settings.tsx` | Add Privacy & Tracking section |

---

## Verification Plan

### 1. Unit Tests (Edge Engine)

**File:** [NEW] `services/edge/src/ssr/__tests__/liquid.test.ts`

```bash
cd services/edge && npm test -- --grep "LiquidJS"
```

**Test Cases:**
- [ ] Basic variable rendering: `{{ user.name }}` → "John"
- [ ] Nested paths: `{{ user.address.city }}` → "Nairobi"
- [ ] Filters: `{{ name | upcase }}` → "JOHN"
- [ ] Custom filters: `{{ price | money }}` → "$29.99"
- [ ] Conditionals: `{% if user %}...{% endif %}`
- [ ] Loops: `{% for item in items %}...{% endfor %}`
- [ ] Undefined variables: `{{ missing }}` → "" (no error)

### 2. Integration Tests (SSR)

**Command:**
```bash
cd services/edge && npm run dev
# In another terminal:
curl http://localhost:3000/test-page | grep "Expected Output"
```

**Test Cases:**
- [ ] Page renders with resolved variables
- [ ] Filters work in rendered output
- [ ] Context object has all scopes

### 3. API Tests (Variables Registry)

**Command:**
```bash
curl http://localhost:8000/api/variables | jq
```

**Expected Response:**
```json
{
  "variables": [...],
  "filters": [...]
}
```

### 4. Browser Tests (@ Mention)

**Manual Test Steps:**
1. Open Builder at `/builder/{page_id}`
2. Click on any text component
3. In Properties Panel, type `@` in the "Text" field
4. Verify: Dropdown appears with variables list
5. Type `user` to filter
6. Select `user.name`
7. Verify: Field shows `{{ user.name }}`
8. Publish page and verify variable renders on live page

---

## Acceptance Criteria

### Phase 0 Complete When:

**Edge Engine (LiquidJS)**
- [ ] LiquidJS installed and configured in Edge service
- [ ] `resolveProps()` uses LiquidJS (async) for template rendering
- [ ] Custom filters work: `{{ name | upcase }}`, `{{ price | money }}`, `{{ date | time_ago }}`
- [ ] All variable scopes populated in context (page, user, visitor, url, system, record, local, session, cookies)
- [ ] System variables are in UTC

**Supabase Auth (MVP)**
- [ ] JWT extracted from cookie or Authorization header
- [ ] Token verified via Supabase `getUser()`
- [ ] User record fetched from contacts table
- [ ] `{{ user.* }}` variables available in templates

**Builder (@ Mention)**
- [ ] Builder shows `@` autocomplete in text fields
- [ ] Variables registry API returns available variables/filters
- [ ] Selecting variable inserts `{{ variable.path }}`
- [ ] Filter picker appears after `|` character

**Visitor Tracking Settings**
- [ ] Privacy & Tracking section in `/settings`
- [ ] Enable/disable visitor tracking cookies
- [ ] Cookie expiry configurable
- [ ] Consent requirement option
- [ ] `visitor.isFirstVisit`, `visitor.visitCount` work when enabled

**Backward Compatibility**
- [ ] All existing pages still render correctly
- [ ] Old `{{variable}}` syntax still works

---

## Dependencies

```json
{
  "liquidjs": "^10.10.0",
  "@supabase/supabase-js": "^2.39.0"
}
```

**Bundle Impact:** 
- LiquidJS: ~15KB gzipped
- Supabase client: ~40KB gzipped (already in bundle if using Supabase)

---

## Environment Variables

```env
# Supabase (required for auth)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Async rendering breaks existing code | Comprehensive testing, gradual rollout |
| Performance impact from LiquidJS | Cache parsed templates, benchmark |
| Breaking changes to existing pages | Keep regex fallback temporarily |
| Builder autocomplete UX issues | User testing, iterate on design |
| Auth token expiry | Refresh tokens via Supabase client |
| Settings not synced to Edge | Cache in Redis/KV, invalidate on update |

---

## Estimated Effort (Updated)

| Part | Effort |
|------|--------|
| Part 1: Edge Engine (LiquidJS) | 0.5 day |
| Part 2: Builder (@ Mention) | 0.5 day |
| Part 3: Visitor Tracking Settings | 0.25 day |
| Testing & Polish | 0.25 day |
| **Total** | **1.5 days** |
