/**
 * Dropdown Renderer - Single-select with search using shadcn Combobox pattern.
 * Fetches options from FK table via /distinct endpoint.
 */

import React, { useState, useEffect } from 'react';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { rankWith, and, isStringControl, optionIs, ControlProps } from '@jsonforms/core';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { columnToLabel } from '@/lib/schemaToJsonSchema';
import { useFormInteraction } from '../FormInteractionContext';
import { FieldSettingsPopover } from '@/components/builder/form/FieldSettingsPopover';

interface DropdownRendererProps extends ControlProps { }

const DropdownRendererComponent: React.FC<DropdownRendererProps> = ({
    data,
    handleChange,
    path,
    label,
    schema,
    uischema,
    enabled,
    errors,
}) => {
    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);
    const [loading, setLoading] = useState(false);
    const { onFieldClick, isBuilderMode, fieldOverrides, onFieldOverrideChange } = useFormInteraction();

    const isReadOnly = uischema?.options?.readonly ?? false;
    const displayLabel = label || columnToLabel(path.split('.').pop() || '');

    const fieldName = path.split('.').pop() || path;
    const fieldSettings = fieldOverrides?.[fieldName] || {};

    // Get FK info from uischema options (set by schemaToJsonSchema)
    const fkTable = uischema?.options?.fkTable;
    const fkColumn = uischema?.options?.fkColumn || 'id';
    const dataSourceId = uischema?.options?.dataSourceId;
    const fkDisplayColumn = uischema?.options?.fkDisplayColumn || fieldSettings?.fkDisplayColumn;

    // Fetch options from FK table
    useEffect(() => {
        if (!fkTable) return;

        const fetchOptions = async () => {
            setLoading(true);
            try {
                // If we have a displayColumn, fetch records with id and displayColumn
                if (fkDisplayColumn && fkDisplayColumn !== 'id') {
                    const selectCols = `id,${fkDisplayColumn}`;
                    const endpoint = dataSourceId && dataSourceId !== 'backend'
                        ? `/api/sync/datasources/${dataSourceId}/tables/${fkTable}/data/?select=${selectCols}&limit=200`
                        : `/api/database/table-data/${fkTable}/?limit=200`;

                    const response = await fetch(endpoint);
                    const result = await response.json();
                    const records = result.records || result.rows || [];

                    setOptions(records.map((r: any) => ({
                        value: String(r.id || r[fkColumn]),
                        label: String(r[fkDisplayColumn] || r.id || r[fkColumn])
                    })));
                } else {
                    // Fallback: fetch distinct IDs (original behavior)
                    const endpoint = dataSourceId && dataSourceId !== 'backend'
                        ? `/api/sync/datasources/${dataSourceId}/tables/${fkTable}/distinct/${fkColumn}/`
                        : `/api/database/tables/${fkTable}/distinct/${fkColumn}/`;

                    const response = await fetch(endpoint);
                    const result = await response.json();
                    const values = result.data || [];

                    setOptions(values.map((v: any) => ({
                        value: String(v),
                        label: String(v)
                    })));
                }
            } catch (error) {
                console.error('Failed to fetch dropdown options:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchOptions();
    }, [fkTable, fkColumn, fkDisplayColumn, dataSourceId]);

    // Also support static enum options from schema
    const enumOptions = schema?.enum || [];
    const allOptions = enumOptions.length > 0
        ? enumOptions.map((v: any) => ({ value: String(v), label: String(v) }))
        : options;

    // Find current selection label for display
    const currentOption = allOptions.find(opt => String(opt.value) === String(data));
    const currentLabel = currentOption?.label || data;

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
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        disabled={!enabled || isReadOnly}
                        className={cn(
                            'w-full justify-between',
                            !data && 'text-muted-foreground',
                            errors && 'border-destructive',
                            isBuilderMode && 'pointer-events-none' // Disable inner interaction in builder mode
                        )}
                    >
                        {currentLabel || `Select ${(fieldSettings.label || displayLabel).toLowerCase()}...`}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                    <Command>
                        <CommandInput placeholder={`Search ${(fieldSettings.label || displayLabel).toLowerCase()}...`} />
                        <CommandList>
                            <CommandEmpty>
                                {loading ? 'Loading...' : 'No results found.'}
                            </CommandEmpty>
                            <CommandGroup>
                                {/* Clear option */}
                                <CommandItem
                                    value=""
                                    onSelect={() => {
                                        handleChange(path, undefined);
                                        setOpen(false);
                                    }}
                                >
                                    <span className="text-muted-foreground">Clear</span>
                                </CommandItem>
                                {allOptions.map((option) => (
                                    <CommandItem
                                        key={option.value}
                                        value={option.label}
                                        onSelect={() => {
                                            handleChange(path, option.value);
                                            setOpen(false);
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                'mr-2 h-4 w-4',
                                                String(data) === option.value ? 'opacity-100' : 'opacity-0'
                                            )}
                                        />
                                        {option.label}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
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
                fkTable={fkTable}
                dataSourceId={dataSourceId}
            >
                {content}
            </FieldSettingsPopover>
        );
    }

    return content;
};

export const DropdownRenderer = withJsonFormsControlProps(DropdownRendererComponent);

// Tester: match when rendererHint is 'dropdown' or has enum
export const dropdownRendererTester = rankWith(
    5,
    and(isStringControl, optionIs('rendererHint', 'dropdown'))
);
