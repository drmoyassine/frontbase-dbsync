/**
 * Number Renderer - Numeric input using shadcn Input component.
 */

import React from 'react';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { rankWith, isNumberControl, isIntegerControl, or, ControlProps } from '@jsonforms/core';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { columnToLabel } from '@/lib/schemaToJsonSchema';
import { useFormInteraction } from '../FormInteractionContext';
import { FieldSettingsPopover } from '@/components/builder/form/FieldSettingsPopover';

interface NumberRendererProps extends ControlProps { }

const NumberRendererComponent: React.FC<NumberRendererProps> = ({
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
    const isInteger = schema?.type === 'integer';
    const { onFieldClick, isBuilderMode, fieldOverrides, onFieldOverrideChange } = useFormInteraction();

    const fieldName = path.split('.').pop() || path;
    const fieldSettings = fieldOverrides?.[fieldName] || {};

    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '') {
            handleChange(path, undefined);
        } else {
            const parsed = isInteger ? parseInt(value, 10) : parseFloat(value);
            if (!isNaN(parsed)) {
                handleChange(path, parsed);
            }
        }
    };

    const content = (
        <div
            className="space-y-2"
            onClick={(e) => {
                if (!isBuilderMode) {
                    e.stopPropagation();
                }
                onFieldClick?.(path);
            }}
        >
            <Label htmlFor={path} className={errors ? 'text-destructive' : ''}>
                {fieldSettings.label || displayLabel}
                {schema?.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
                id={path}
                type="number"
                value={data ?? ''}
                onChange={handleNumberChange}
                disabled={!enabled || isReadOnly}
                placeholder={`Enter ${(fieldSettings.label || displayLabel).toLowerCase()}...`}
                step={isInteger ? 1 : 'any'}
                className={errors ? 'border-destructive' : ''}
            />
            {errors && (
                <p className="text-sm text-destructive">{errors}</p>
            )}
        </div>
    );

    if (isBuilderMode && onFieldOverrideChange) {
        return (
            <FieldSettingsPopover
                fieldName={fieldName}
                settings={fieldSettings}
                onSave={(updates) => onFieldOverrideChange(fieldName, updates)}
                componentType="Form"
                isBuilderMode={true}
            >
                {content}
            </FieldSettingsPopover>
        );
    }

    return content;
};

export const NumberRenderer = withJsonFormsControlProps(NumberRendererComponent);

// Tester: match number or integer types
export const numberRendererTester = rankWith(2, or(isNumberControl, isIntegerControl));
