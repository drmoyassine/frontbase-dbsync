/**
 * useVariables Hook
 * 
 * Fetches available template variables and filters from the API.
 * Used by VariablePicker for autocomplete suggestions.
 */

import { useQuery } from '@tanstack/react-query';

export interface Variable {
    path: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
    source: 'page' | 'user' | 'visitor' | 'url' | 'system' | 'record' | 'local' | 'session' | 'cookies';
    description?: string;
}

export interface Filter {
    name: string;
    args?: string[];
    description: string;
}

interface VariablesResponse {
    variables: Variable[];
    filters: Filter[];
}

/**
 * Hook to fetch available template variables and filters.
 * Optionally accepts a pageId to include page-specific custom variables.
 */
export function useVariables(pageId?: string) {
    const { data, isLoading, error } = useQuery<VariablesResponse>({
        queryKey: ['variables', pageId],
        queryFn: async () => {
            try {
                const url = pageId
                    ? `/api/variables/registry?page_id=${encodeURIComponent(pageId)}`
                    : '/api/variables/registry';
                const response = await fetch(url, {
                    credentials: 'include'
                });
                if (!response.ok) {
                    throw new Error('Failed to fetch variables registry');
                }
                return response.json();
            } catch (err) {
                // If API fails, return static defaults
                console.warn('Failed to fetch variables from API, using defaults:', err);
                return getDefaultVariables();
            }
        },
        staleTime: 60_000, // Cache for 1 minute
        retry: false, // Don't retry if API fails
    });

    return {
        variables: data?.variables || [],
        filters: data?.filters || [],
        isLoading,
        error,
    };
}

/**
 * Static default variables (fallback when API unavailable)
 */
function getDefaultVariables(): VariablesResponse {
    return {
        variables: [
            // Page
            { path: 'page.id', type: 'string', source: 'page', description: 'Page ID' },
            { path: 'page.title', type: 'string', source: 'page', description: 'Page title' },
            { path: 'page.slug', type: 'string', source: 'page', description: 'Page slug/URL' },
            { path: 'page.url', type: 'string', source: 'page', description: 'Full page URL' },
            { path: 'page.description', type: 'string', source: 'page', description: 'Meta description' },
            { path: 'page.image', type: 'string', source: 'page', description: 'OG image URL' },

            // Visitor (Basic - Always Available)
            { path: 'visitor.country', type: 'string', source: 'visitor', description: 'Country code' },
            { path: 'visitor.city', type: 'string', source: 'visitor', description: 'City name' },
            { path: 'visitor.timezone', type: 'string', source: 'visitor', description: 'Timezone offset' },
            { path: 'visitor.device', type: 'string', source: 'visitor', description: 'Device type (mobile/tablet/desktop)' },

            // Visitor (Configurable - Controlled by Settings > Privacy & Tracking)
            { path: 'visitor.ip', type: 'string', source: 'visitor', description: 'IP address' },
            { path: 'visitor.browser', type: 'string', source: 'visitor', description: 'Browser name' },
            { path: 'visitor.os', type: 'string', source: 'visitor', description: 'Operating system' },
            { path: 'visitor.language', type: 'string', source: 'visitor', description: 'Preferred language' },

            // User
            { path: 'user.id', type: 'string', source: 'user', description: 'User ID' },
            { path: 'user.email', type: 'string', source: 'user', description: 'Email address' },
            { path: 'user.name', type: 'string', source: 'user', description: 'Full name' },
            { path: 'user.firstName', type: 'string', source: 'user', description: 'First name' },
            { path: 'user.lastName', type: 'string', source: 'user', description: 'Last name' },
            { path: 'user.avatar', type: 'string', source: 'user', description: 'Avatar URL' },
            { path: 'user.role', type: 'string', source: 'user', description: 'User role' },

            // URL
            { path: 'url.param_name', type: 'string', source: 'url', description: 'Value of query parameter (e.g. ?id=123)' },

            // System
            { path: 'system.date', type: 'string', source: 'system', description: 'Current date (UTC)' },
            { path: 'system.time', type: 'string', source: 'system', description: 'Current time (UTC)' },
            { path: 'system.datetime', type: 'string', source: 'system', description: 'ISO timestamp (UTC)' },
            { path: 'system.year', type: 'number', source: 'system', description: 'Current year' },
            { path: 'system.month', type: 'number', source: 'system', description: 'Current month' },
            { path: 'system.day', type: 'number', source: 'system', description: 'Current day' },

            // Record (data binding)

            { path: 'record.field_name', type: 'any', source: 'record', description: 'Field from the current data record' },

            // User-defined
            { path: 'local.variable_name', type: 'any', source: 'local', description: 'Page-level local variable' },
            { path: 'session.variable_name', type: 'any', source: 'session', description: 'Session storage variable' },
            { path: 'cookies.cookie_name', type: 'string', source: 'cookies', description: 'Browser cookie value' },
        ],
        filters: [
            // Built-in LiquidJS filters
            { name: 'upcase', description: 'Convert to uppercase' },
            { name: 'downcase', description: 'Convert to lowercase' },
            { name: 'capitalize', description: 'Capitalize first letter' },
            { name: 'truncate', args: ['length'], description: 'Truncate to length' },
            { name: 'strip', description: 'Remove whitespace' },
            { name: 'split', args: ['delimiter'], description: 'Split into array' },
            { name: 'join', args: ['separator'], description: 'Join array to string' },
            { name: 'first', description: 'First item of array' },
            { name: 'last', description: 'Last item of array' },
            { name: 'size', description: 'Length of array/string' },
            { name: 'plus', args: ['number'], description: 'Add number' },
            { name: 'minus', args: ['number'], description: 'Subtract number' },
            { name: 'times', args: ['number'], description: 'Multiply by number' },
            { name: 'divided_by', args: ['number'], description: 'Divide by number' },
            { name: 'round', description: 'Round to nearest integer' },
            { name: 'floor', description: 'Round down' },
            { name: 'ceil', description: 'Round up' },
            { name: 'abs', description: 'Absolute value' },
            { name: 'default', args: ['value'], description: 'Default if empty' },
            { name: 'date', args: ['format'], description: 'Format date' },

            // Custom Frontbase filters
            { name: 'money', args: ['currency'], description: 'Format as currency ($29.99)' },
            { name: 'time_ago', description: 'Relative time (2 days ago)' },
            { name: 'timezone', args: ['tz'], description: 'Convert timezone' },
            { name: 'date_format', args: ['format'], description: 'Format date (short/long/iso)' },
            { name: 'json', description: 'JSON stringify' },
            { name: 'pluralize', args: ['singular', 'plural'], description: 'Pluralize based on count' },
            { name: 'escape_html', description: 'Escape HTML entities' },
            { name: 'truncate_words', args: ['count'], description: 'Truncate by word count' },
            { name: 'slugify', description: 'Convert to URL slug' },
            { name: 'number', args: ['locale'], description: 'Format number with commas' },
            { name: 'percent', args: ['decimals'], description: 'Format as percentage' },
        ],
    };
}
