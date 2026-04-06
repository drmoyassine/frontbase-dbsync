/**
 * Shared test-toast utility for edge infrastructure test results.
 * Used by EdgeCachesForm, EdgeQueuesForm, EdgeEndpointDialog, etc.
 * Also provides `showApiErrorToast` for structured backend error display.
 */
import React from 'react';
import { toast } from 'sonner';
import { Check, X, AlertTriangle } from 'lucide-react';

export interface TestResult {
    success: boolean;
    message: string;
    latency_ms?: number;
}

export const showTestToast = (result: TestResult, label: string) => {
    toast.custom((id) => (
        React.createElement('div', {
            className: 'w-[356px] rounded-lg border bg-background shadow-lg p-3 space-y-2',
            style: { pointerEvents: 'auto' as const },
        },
            React.createElement('div', { className: 'flex items-center gap-2.5' },
                React.createElement('div', {
                    className: `w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${result.success ? 'bg-emerald-500' : 'bg-red-500'}`,
                },
                    result.success
                        ? React.createElement(Check, { className: 'h-3 w-3 text-white' })
                        : React.createElement(X, { className: 'h-3 w-3 text-white' })
                ),
                React.createElement('div', { className: 'flex-1 min-w-0' },
                    React.createElement('span', { className: 'text-sm font-medium' }, label),
                    React.createElement('span', { className: 'text-xs text-muted-foreground ml-2' }, result.message)
                )
            )
        )
    ), { duration: result.success ? 4000 : 8000 });
};

/**
 * Parse and display structured API errors from FastAPI.
 * Supports: Axios errors, Response objects, and plain Error objects.
 * Parses `detail` as string, array of `{msg, loc}`, or nested object.
 */
export const showApiErrorToast = (error: any, label: string = 'Error') => {
    let message = 'An unexpected error occurred';

    // Axios error shape: error.response.data.detail
    const detail = error?.response?.data?.detail ?? error?.detail ?? error?.message;

    if (typeof detail === 'string') {
        message = detail;
    } else if (Array.isArray(detail)) {
        // FastAPI validation errors: [{msg: '...', loc: ['body', 'field'], type: '...'}]
        message = detail.map((d: any) => {
            if (typeof d === 'string') return d;
            const loc = d.loc ? d.loc.filter((l: any) => l !== 'body').join('.') : '';
            return loc ? `${loc}: ${d.msg}` : d.msg;
        }).join(' • ');
    } else if (typeof detail === 'object' && detail !== null) {
        message = detail.msg || detail.message || JSON.stringify(detail);
    }

    toast.custom((id) => (
        React.createElement('div', {
            className: 'w-[356px] rounded-lg border border-destructive/30 bg-background shadow-lg p-3 space-y-2',
            style: { pointerEvents: 'auto' as const },
        },
            React.createElement('div', { className: 'flex items-start gap-2.5' },
                React.createElement('div', {
                    className: 'w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-red-500 mt-0.5',
                },
                    React.createElement(AlertTriangle, { className: 'h-3 w-3 text-white' })
                ),
                React.createElement('div', { className: 'flex-1 min-w-0' },
                    React.createElement('span', { className: 'text-sm font-medium' }, label),
                    React.createElement('p', { className: 'text-xs text-muted-foreground mt-0.5 break-words' }, message)
                )
            )
        )
    ), { duration: 8000 });
};

