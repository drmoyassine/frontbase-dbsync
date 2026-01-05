/**
 * Date Renderer - Date picker using shadcn DatePicker/Calendar components.
 */

import React from 'react';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { rankWith, isDateControl, isDateTimeControl, or, ControlProps } from '@jsonforms/core';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { columnToLabel } from '@/lib/schemaToJsonSchema';
import { useFormInteraction } from '../FormInteractionContext';
import { FieldSettingsPopover } from '@/components/builder/form/FieldSettingsPopover';

interface DateRendererProps extends ControlProps { }

const DateRendererComponent: React.FC<DateRendererProps> = ({
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
    const isDateTime = schema?.format === 'date-time';
    const { onFieldClick, isBuilderMode, fieldOverrides, onFieldOverrideChange } = useFormInteraction();

    const fieldName = path.split('.').pop() || path;
    const fieldSettings = fieldOverrides?.[fieldName] || {};

    // Parse date from string
    const dateValue = data ? parseISO(data) : undefined;

    const handleDateSelect = (date: Date | undefined) => {
        if (date) {
            // Format based on type
            const formatted = isDateTime
                ? date.toISOString()
                : format(date, 'yyyy-MM-dd');
            handleChange(path, formatted);
        } else {
            handleChange(path, undefined);
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
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        disabled={!enabled || isReadOnly}
                        className={cn(
                            'w-full justify-start text-left font-normal',
                            !data && 'text-muted-foreground',
                            errors && 'border-destructive',
                            isBuilderMode && 'pointer-events-none' // Disable inner interaction in builder mode
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateValue ? format(dateValue, isDateTime ? 'PPP p' : 'PPP') : 'Select date...'}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="single"
                        selected={dateValue}
                        onSelect={handleDateSelect}
                        initialFocus
                    />
                </PopoverContent>
            </Popover>
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

export const DateRenderer = withJsonFormsControlProps(DateRendererComponent);

// Tester: match date or date-time format
export const dateRendererTester = rankWith(3, or(isDateControl, isDateTimeControl));
