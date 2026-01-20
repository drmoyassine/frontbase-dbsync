/**
 * ArrayEditor Component
 * 
 * Generic editor for array-type props (features, pricing plans, FAQ items, etc.)
 * Supports add, remove, reorder, and inline editing.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FieldSchema {
    type: 'text' | 'textarea' | 'number' | 'url';
    label: string;
    placeholder?: string;
}

export interface ArrayEditorProps<T extends Record<string, any>> {
    items: T[];
    onItemsChange: (items: T[]) => void;
    itemSchema: Record<keyof T, FieldSchema>;
    addLabel?: string;
    emptyMessage?: string;
    maxItems?: number;
    minItems?: number;
    defaultItem?: Partial<T>;
}

export function ArrayEditor<T extends Record<string, any>>({
    items = [],
    onItemsChange,
    itemSchema,
    addLabel = 'Add Item',
    emptyMessage = 'No items yet. Click to add one.',
    maxItems,
    minItems = 0,
    defaultItem = {}
}: ArrayEditorProps<T>) {
    const [expandedIndex, setExpandedIndex] = React.useState<number | null>(items.length > 0 ? 0 : null);

    const handleAddItem = () => {
        if (maxItems && items.length >= maxItems) return;

        const newItem = { ...defaultItem } as T;
        // Initialize empty values for each field
        Object.keys(itemSchema).forEach(key => {
            if (newItem[key as keyof T] === undefined) {
                newItem[key as keyof T] = '' as any;
            }
        });

        const newItems = [...items, newItem];
        onItemsChange(newItems);
        setExpandedIndex(newItems.length - 1);
    };

    const handleRemoveItem = (index: number) => {
        if (items.length <= minItems) return;
        const newItems = items.filter((_, i) => i !== index);
        onItemsChange(newItems);
        if (expandedIndex === index) {
            setExpandedIndex(null);
        } else if (expandedIndex !== null && expandedIndex > index) {
            setExpandedIndex(expandedIndex - 1);
        }
    };

    const handleUpdateItem = (index: number, field: keyof T, value: any) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        onItemsChange(newItems);
    };

    const handleMoveItem = (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= items.length) return;

        const newItems = [...items];
        [newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]];
        onItemsChange(newItems);
        setExpandedIndex(newIndex);
    };

    const getItemPreview = (item: T): string => {
        // Try to get a meaningful preview from common field names
        const previewFields = ['title', 'name', 'question', 'text', 'icon'];
        for (const field of previewFields) {
            if (item[field] && typeof item[field] === 'string') {
                const value = item[field] as string;
                return value.length > 30 ? value.substring(0, 30) + '...' : value;
            }
        }
        return `Item ${items.indexOf(item) + 1}`;
    };

    const renderField = (item: T, index: number, fieldKey: string, schema: FieldSchema) => {
        const value = item[fieldKey as keyof T] ?? '';

        const commonProps = {
            id: `item-${index}-${fieldKey}`,
            value: value as string,
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                handleUpdateItem(index, fieldKey as keyof T, e.target.value),
            placeholder: schema.placeholder || `Enter ${schema.label.toLowerCase()}`
        };

        return (
            <div key={fieldKey} className="space-y-1.5">
                <Label htmlFor={commonProps.id} className="text-xs">{schema.label}</Label>
                {schema.type === 'textarea' ? (
                    <Textarea {...commonProps} rows={2} className="text-sm" />
                ) : (
                    <Input
                        {...commonProps}
                        type={schema.type === 'number' ? 'number' : 'text'}
                        className="h-8 text-sm"
                    />
                )}
            </div>
        );
    };

    return (
        <div className="space-y-3">
            {items.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg">
                    {emptyMessage}
                </div>
            ) : (
                <div className="space-y-2">
                    {items.map((item, index) => (
                        <Card key={index} className="overflow-hidden">
                            {/* Item Header */}
                            <div
                                className="flex items-center gap-2 px-3 py-2 bg-muted/50 cursor-pointer hover:bg-muted/80 transition-colors"
                                onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
                            >
                                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="flex-1 text-sm font-medium truncate">
                                    {getItemPreview(item)}
                                </span>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={(e) => { e.stopPropagation(); handleMoveItem(index, 'up'); }}
                                        disabled={index === 0}
                                    >
                                        <ChevronUp className="h-3 w-3" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={(e) => { e.stopPropagation(); handleMoveItem(index, 'down'); }}
                                        disabled={index === items.length - 1}
                                    >
                                        <ChevronDown className="h-3 w-3" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-destructive hover:text-destructive"
                                        onClick={(e) => { e.stopPropagation(); handleRemoveItem(index); }}
                                        disabled={items.length <= minItems}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>

                            {/* Item Fields (Expandable) */}
                            <div className={cn(
                                "overflow-hidden transition-all duration-200",
                                expandedIndex === index ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                            )}>
                                <div className="p-3 space-y-3 border-t">
                                    {Object.entries(itemSchema).map(([key, schema]) =>
                                        renderField(item, index, key, schema as FieldSchema)
                                    )}
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Add Button */}
            <Button
                variant="outline"
                size="sm"
                onClick={handleAddItem}
                disabled={maxItems ? items.length >= maxItems : false}
                className="w-full"
            >
                <Plus className="h-4 w-4 mr-2" />
                {addLabel}
            </Button>
        </div>
    );
}
