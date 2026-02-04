/**
 * FieldMappingField - Map fields for data operations
 * 
 * Allows users to add/remove field mappings for insert/update operations.
 */

import React from 'react';
import { Plus, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

export interface FieldMapping {
    id: string;
    sourceField: string;
    targetColumn: string;
    transform?: string;
}

interface FieldMappingFieldProps {
    name: string;
    label?: string;
    value: FieldMapping[];
    onChange: (value: FieldMapping[]) => void;
    description?: string;
    columns?: string[]; // Available columns from the selected table
}

export function FieldMappingField({
    label,
    value = [],
    onChange,
    description,
    columns = [],
}: FieldMappingFieldProps) {
    const handleAdd = () => {
        const newMapping: FieldMapping = {
            id: `field-${Date.now()}`,
            sourceField: '',
            targetColumn: '',
        };
        onChange([...value, newMapping]);
    };

    const handleRemove = (id: string) => {
        onChange(value.filter((m) => m.id !== id));
    };

    const handleUpdate = (id: string, updates: Partial<FieldMapping>) => {
        onChange(
            value.map((m) => (m.id === id ? { ...m, ...updates } : m))
        );
    };

    return (
        <div className="space-y-3">
            {label && <Label>{label}</Label>}

            <div className="space-y-2">
                {value.length === 0 && (
                    <div className="text-xs text-muted-foreground py-2 text-center border border-dashed rounded">
                        No field mappings. Click "Add Field" to start.
                    </div>
                )}

                {value.map((mapping) => (
                    <div
                        key={mapping.id}
                        className="flex items-center gap-2 bg-muted/50 p-2 rounded border"
                    >
                        {/* Source field (from input data) */}
                        <Input
                            value={mapping.sourceField}
                            onChange={(e) =>
                                handleUpdate(mapping.id, { sourceField: e.target.value })
                            }
                            placeholder="{{ $input.data.field }}"
                            className="flex-1 h-8 text-xs font-mono"
                        />

                        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />

                        {/* Target column */}
                        {columns.length > 0 ? (
                            <Select
                                value={mapping.targetColumn}
                                onValueChange={(v) =>
                                    handleUpdate(mapping.id, { targetColumn: v })
                                }
                            >
                                <SelectTrigger className="flex-1 h-8 text-xs">
                                    <SelectValue placeholder="Column" />
                                </SelectTrigger>
                                <SelectContent>
                                    {columns.map((col) => (
                                        <SelectItem key={col} value={col}>
                                            {col}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <Input
                                value={mapping.targetColumn}
                                onChange={(e) =>
                                    handleUpdate(mapping.id, { targetColumn: e.target.value })
                                }
                                placeholder="column_name"
                                className="flex-1 h-8 text-xs"
                            />
                        )}

                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => handleRemove(mapping.id)}
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                ))}
            </div>

            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAdd}
                className="w-full"
            >
                <Plus className="w-4 h-4 mr-2" />
                Add Field
            </Button>

            {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
            )}
        </div>
    );
}
