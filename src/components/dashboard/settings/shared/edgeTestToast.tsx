/**
 * Shared test-toast utility for edge infrastructure test results.
 * Used by EdgeCachesForm, EdgeQueuesForm, EdgeEndpointDialog, etc.
 */
import React from 'react';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';

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
