import React from 'react';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { rankWith, isStringControl, ControlProps } from '@jsonforms/core';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { columnToLabel } from '@/lib/schemaToJsonSchema';
import { useFormInteraction } from '../FormInteractionContext';
import { FieldSettingsPopover } from '@/components/builder/form/FieldSettingsPopover';

interface TextRendererProps extends ControlProps { }

const TextRendererComponent: React.FC<TextRendererProps> = ({
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
    const { onFieldClick, isBuilderMode, fieldOverrides, onFieldOverrideChange } = useFormInteraction();

    const fieldName = path.split('.').pop() || path;
    const fieldSettings = fieldOverrides?.[fieldName] || {};



    const fieldContent = (
        <div
            className="space-y-2"
            onClick={(e) => {
                // Determine if we are in builder mode to allow propagation
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
                type="text"
                value={data ?? ''}
                onChange={(e) => handleChange(path, e.target.value || undefined)}
                disabled={!enabled || isReadOnly}
                placeholder={`Enter ${(fieldSettings.label || displayLabel).toLowerCase()}...`}
                className={errors ? 'border-destructive' : ''}
            />
            {errors && (
                <p className="text-sm text-destructive">{errors}</p>
            )}
        </div>
    );

    // Wrap with popover in builder mode
    if (isBuilderMode && onFieldOverrideChange) {
        return (
            <FieldSettingsPopover
                fieldName={fieldName}
                settings={fieldSettings}
                onSave={(updates) => onFieldOverrideChange(fieldName, updates)}
                componentType="Form"
                isBuilderMode={true}
            >
                {fieldContent}
            </FieldSettingsPopover>
        );
    }

    return fieldContent;
};

export const TextRenderer = withJsonFormsControlProps(TextRendererComponent);

// Tester: match any string type (lowest priority fallback)
export const textRendererTester = rankWith(1, isStringControl);
