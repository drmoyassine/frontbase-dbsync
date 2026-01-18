/**
 * LiquidJS Engine Configuration
 * 
 * Provides template rendering with custom filters for Frontbase.
 * Replaces the regex-based variable resolution with full templating support.
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
    const symbols: Record<string, string> = {
        USD: '$',
        EUR: '€',
        GBP: '£',
        KES: 'KSh',
        JPY: '¥',
        CNY: '¥',
        INR: '₹',
        BRL: 'R$',
        AUD: 'A$',
        CAD: 'C$',
    };
    const symbol = symbols[currency] || currency + ' ';
    const num = Number(value);
    if (isNaN(num)) return value;
    return `${symbol}${num.toFixed(2)}`;
});

/**
 * Relative time (time ago)
 * Usage: {{ createdAt | time_ago }} → "2 days ago"
 */
liquid.registerFilter('time_ago', (value: string | Date) => {
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffDays < 365) {
        const months = Math.floor(diffDays / 30);
        return `${months} month${months > 1 ? 's' : ''} ago`;
    }
    const years = Math.floor(diffDays / 365);
    return `${years} year${years > 1 ? 's' : ''} ago`;
});

/**
 * Convert timezone
 * Usage: {{ system.datetime | timezone: visitor.timezone }} → "2026-01-18 17:00:00"
 */
liquid.registerFilter('timezone', (value: string, tz: string) => {
    try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return value;
        return date.toLocaleString('en-US', { timeZone: tz || 'UTC' });
    } catch {
        return value;
    }
});

/**
 * Format date
 * Usage: {{ date | date_format: "short" }} → "Jan 18, 2026"
 * Usage: {{ date | date_format: "long" }} → "January 18, 2026"
 * Usage: {{ date | date_format: "iso" }} → "2026-01-18"
 */
liquid.registerFilter('date_format', (value: string | Date, format: string = 'short') => {
    try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return value;
        
        switch (format) {
            case 'short':
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            case 'long':
                return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            case 'iso':
                return date.toISOString().split('T')[0];
            case 'time':
                return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            default:
                return date.toLocaleDateString();
        }
    } catch {
        return value;
    }
});

/**
 * JSON stringify
 * Usage: {{ page.jsonld | json }} → '{"@type":"WebPage",...}'
 */
liquid.registerFilter('json', (value: unknown) => {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
});

/**
 * Pluralize
 * Usage: {{ count | pluralize: "item", "items" }} → "items" (if count != 1)
 */
liquid.registerFilter('pluralize', (count: number, singular: string, plural: string) => {
    return count === 1 ? singular : plural;
});

/**
 * Escape HTML entities
 * Usage: {{ userInput | escape_html }}
 */
liquid.registerFilter('escape_html', (value: string) => {
    if (typeof value !== 'string') return value;
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
});

/**
 * Truncate words (not characters)
 * Usage: {{ text | truncate_words: 10 }}
 */
liquid.registerFilter('truncate_words', (value: string, wordCount: number = 10) => {
    if (typeof value !== 'string') return value;
    const words = value.split(/\s+/);
    if (words.length <= wordCount) return value;
    return words.slice(0, wordCount).join(' ') + '...';
});

/**
 * Slugify text
 * Usage: {{ title | slugify }} → "my-page-title"
 */
liquid.registerFilter('slugify', (value: string) => {
    if (typeof value !== 'string') return value;
    return value
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
});

/**
 * Number formatting with locale
 * Usage: {{ amount | number }} → "1,234.56"
 */
liquid.registerFilter('number', (value: number, locale: string = 'en-US') => {
    const num = Number(value);
    if (isNaN(num)) return value;
    return num.toLocaleString(locale);
});

/**
 * Percentage formatting
 * Usage: {{ ratio | percent }} → "75%"
 * Usage: {{ ratio | percent: 2 }} → "75.50%"
 */
liquid.registerFilter('percent', (value: number, decimals: number = 0) => {
    const num = Number(value);
    if (isNaN(num)) return value;
    return `${(num * 100).toFixed(decimals)}%`;
});

export { Liquid };
