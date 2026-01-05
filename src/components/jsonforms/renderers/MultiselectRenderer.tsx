/**
 * Multiselect Renderer - Multi-select with search for JSON array columns.
 */

import React, { useState, useEffect } from 'react';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { rankWith, isObjectArrayControl, and, schemaTypeIs, optionIs, ControlProps } from '@jsonforms/core';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { columnToLabel } from '@/lib/schemaToJsonSchema';

interface MultiselectRendererProps extends ControlProps { }

const MultiselectRendererComponent: React.FC<MultiselectRendererProps> = ({
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
    const [options, setOptions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const isReadOnly = uischema?.options?.readonly ?? false;
    const displayLabel = label || columnToLabel(path.split('.').pop() || '');

    // Get config from uischema options
    const optionsTable = uischema?.options?.optionsTable;
    const optionsColumn = uischema?.options?.optionsColumn;
    const dataSourceId = uischema?.options?.dataSourceId;
    const staticOptions = uischema?.options?.options || [];

    // Selected values (ensure array)
    const selectedValues: string[] = Array.isArray(data) ? data : [];

    // Fetch options from database if configured
    useEffect(() => {
        if (staticOptions.length > 0) {
            setOptions(staticOptions);
            return;
        }

        if (!optionsTable || !optionsColumn) return;

        const fetchOptions = async () => {
            setLoading(true);
            try {
                const endpoint = dataSourceId && dataSourceId !== 'backend'
                    ? `/api/sync/datasources/${dataSourceId}/tables/${optionsTable}/distinct/${optionsColumn}`
                    : `/api/database/tables/${optionsTable}/distinct/${optionsColumn}`;

                const response = await fetch(endpoint);
                const result = await response.json();

                if (result.success || result.data) {
                    setOptions(result.data || []);
                }
            } catch (error) {
                console.error('Failed to fetch multiselect options:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchOptions();
    }, [optionsTable, optionsColumn, dataSourceId, staticOptions]);

    const toggleValue = (value: string) => {
        if (selectedValues.includes(value)) {
            handleChange(path, selectedValues.filter(v => v !== value));
        } else {
            handleChange(path, [...selectedValues, value]);
        }
    };

    const removeValue = (value: string) => {
        handleChange(path, selectedValues.filter(v => v !== value));
    };

    return (
        <div className="space-y-2">
            <Label htmlFor={path} className={errors ? 'text-destructive' : ''}>
                {displayLabel}
                {schema?.required && <span className="text-destructive ml-1">*</span>}
            </Label>

            {/* Selected values as badges */}
            {selectedValues.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {selectedValues.map((value) => (
                        <Badge
                            key={value}
                            variant="secondary"
                            className="gap-1"
                        >
                            {value}
                            {!isReadOnly && enabled && (
                                <X
                                    className="h-3 w-3 cursor-pointer hover:text-destructive"
                                    onClick={() => removeValue(value)}
                                />
                            )}
                        </Badge>
                    ))}
                </div>
            )}

            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        disabled={!enabled || isReadOnly}
                        className={cn(
                            'w-full justify-between',
                            errors && 'border-destructive'
                        )}
                    >
                        {selectedValues.length === 0
                            ? `Select ${displayLabel.toLowerCase()}...`
                            : `${selectedValues.length} selected`
                        }
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                    <Command>
                        <CommandInput placeholder={`Search ${displayLabel.toLowerCase()}...`} />
                        <CommandList>
                            <CommandEmpty>
                                {loading ? 'Loading...' : 'No results found.'}
                            </CommandEmpty>
                            <CommandGroup>
                                {options.map((option) => (
                                    <CommandItem
                                        key={String(option)}
                                        value={String(option)}
                                        onSelect={() => toggleValue(String(option))}
                                    >
                                        <Check
                                            className={cn(
                                                'mr-2 h-4 w-4',
                                                selectedValues.includes(String(option)) ? 'opacity-100' : 'opacity-0'
                                            )}
                                        />
                                        {String(option)}
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
};

export const MultiselectRenderer = withJsonFormsControlProps(MultiselectRendererComponent);

// Tester: match when rendererHint is 'multiselect' or array type
export const multiselectRendererTester = rankWith(
    5,
    optionIs('rendererHint', 'multiselect')
);
