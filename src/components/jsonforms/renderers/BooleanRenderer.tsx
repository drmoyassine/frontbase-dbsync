/**
 * Boolean Renderer - Toggle switch using shadcn Switch component.
 */

import React from 'react';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { rankWith, isBooleanControl, ControlProps } from '@jsonforms/core';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { columnToLabel } from '@/lib/schemaToJsonSchema';

interface BooleanRendererProps extends ControlProps { }

const BooleanRendererComponent: React.FC<BooleanRendererProps> = ({
    data,
    handleChange,
    path,
    label,
    uischema,
    enabled,
    errors,
}) => {
    const isReadOnly = uischema?.options?.readonly ?? false;
    const displayLabel = label || columnToLabel(path.split('.').pop() || '');

    return (
        <div className="flex items-center justify-between space-x-3 py-2">
            <Label
                htmlFor={path}
                className={`flex-1 cursor-pointer ${errors ? 'text-destructive' : ''}`}
            >
                {displayLabel}
            </Label>
            <Switch
                id={path}
                checked={data ?? false}
                onCheckedChange={(checked) => handleChange(path, checked)}
                disabled={!enabled || isReadOnly}
            />
            {errors && (
                <p className="text-sm text-destructive">{errors}</p>
            )}
        </div>
    );
};

export const BooleanRenderer = withJsonFormsControlProps(BooleanRendererComponent);

// Tester: match boolean type
export const booleanRendererTester = rankWith(2, isBooleanControl);
