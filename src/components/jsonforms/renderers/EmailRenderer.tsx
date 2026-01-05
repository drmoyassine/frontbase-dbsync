/**
 * Email Renderer - Email input with validation using shadcn Input.
 */

import React from 'react';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { rankWith, and, isStringControl, formatIs, ControlProps } from '@jsonforms/core';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail } from 'lucide-react';
import { columnToLabel } from '@/lib/schemaToJsonSchema';

interface EmailRendererProps extends ControlProps { }

const EmailRendererComponent: React.FC<EmailRendererProps> = ({
    data,
    handleChange,
    path,
    label,
    schema,
    uischema,
    enabled,
    errors,
}) => {
    const isReadOnly = uischema?.options?.readonly ?? false;
    const displayLabel = label || columnToLabel(path.split('.').pop() || '');

    return (
        <div className="space-y-2">
            <Label htmlFor={path} className={errors ? 'text-destructive' : ''}>
                {displayLabel}
                {schema?.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    id={path}
                    type="email"
                    value={data ?? ''}
                    onChange={(e) => handleChange(path, e.target.value || undefined)}
                    disabled={!enabled || isReadOnly}
                    placeholder="email@example.com"
                    className={cn('pl-10', errors && 'border-destructive')}
                />
            </div>
            {errors && (
                <p className="text-sm text-destructive">{errors}</p>
            )}
        </div>
    );
};

// Helper for className merging
function cn(...classes: (string | boolean | undefined)[]) {
    return classes.filter(Boolean).join(' ');
}

export const EmailRenderer = withJsonFormsControlProps(EmailRendererComponent);

// Tester: match email format or rendererHint
export const emailRendererTester = rankWith(
    5,
    and(isStringControl, formatIs('email'))
);
