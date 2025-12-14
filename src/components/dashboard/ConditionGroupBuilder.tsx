import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';
import { SmartValueInput } from './SmartValueInput';
import type {
    RLSCondition,
    RLSConditionGroup,
    RLSComparisonOperator,
    RLSValueSource
} from '@/types/rls';

interface ConditionGroupBuilderProps {
    group: RLSConditionGroup;
    onChange: (group: RLSConditionGroup) => void;
    columns: Array<{ name: string; type: string }>; // Target columns for the left side
    sourceColumns?: Array<{ name: string; type: string }>; // Columns for the right side (contacts/user attributes)
    allowedSources?: RLSValueSource[];
    enumColumns?: Record<string, string[]>; // Map of column name -> possible values
    title?: string;
    showCombinator?: boolean;
}

/**
 * Generate a unique ID for conditions
 */
function generateId(): string {
    return `cond-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create an empty condition
 */
export function createEmptyCondition(defaultSource: RLSValueSource = 'literal'): RLSCondition {
    return {
        id: generateId(),
        column: '',
        operator: 'equals',
        source: defaultSource,
        sourceColumn: ''
    };
}

export function ConditionGroupBuilder({
    group,
    onChange,
    columns,
    sourceColumns = [],
    allowedSources = ['contacts', 'auth', 'literal'],
    enumColumns = {},
    title,
    showCombinator = true
}: ConditionGroupBuilderProps) {

    const updateCondition = (conditionId: string, updates: Partial<RLSCondition>) => {
        onChange({
            ...group,
            conditions: group.conditions.map(c =>
                'id' in c && c.id === conditionId ? { ...c, ...updates } : c
            )
        });
    };

    const addCondition = () => {
        onChange({
            ...group,
            conditions: [...group.conditions, createEmptyCondition(allowedSources.includes('literal') ? 'literal' : allowedSources[0])]
        });
    };

    const removeCondition = (conditionId: string) => {
        onChange({
            ...group,
            conditions: group.conditions.filter(c => !('id' in c) || c.id !== conditionId)
        });
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                {title && <Label className="text-sm font-medium">{title}</Label>}
                {showCombinator && (
                    <div className="flex items-center gap-2">
                        <Select
                            value={group.combinator}
                            onValueChange={(val) => onChange({ ...group, combinator: val as 'AND' | 'OR' })}
                        >
                            <SelectTrigger className="w-[80px] h-7 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="AND">AND</SelectItem>
                                <SelectItem value="OR">OR</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>

            <div className="space-y-2">
                {group.conditions.map((cond, index) => {
                    if (!('column' in cond)) return null;
                    const condition = cond as RLSCondition;

                    return (
                        <div key={condition.id} className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-lg border">
                            {index > 0 && showCombinator && (
                                <Badge variant="outline" className="text-xs shrink-0">
                                    {group.combinator}
                                </Badge>
                            )}

                            {/* Target table column (Left Side) */}
                            <Select
                                value={condition.column}
                                onValueChange={(val) => updateCondition(condition.id, { column: val })}
                            >
                                <SelectTrigger className="w-[140px] h-8">
                                    <SelectValue placeholder="Column" />
                                </SelectTrigger>
                                <SelectContent>
                                    {columns.map(col => (
                                        <SelectItem key={col.name} value={col.name}>
                                            {col.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* Operator */}
                            <Select
                                value={condition.operator}
                                onValueChange={(val) => updateCondition(condition.id, { operator: val as RLSComparisonOperator })}
                            >
                                <SelectTrigger className="w-[120px] h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="equals">equals</SelectItem>
                                    <SelectItem value="not_equals">not equals</SelectItem>
                                    <SelectItem value="greater_than">greater than</SelectItem>
                                    <SelectItem value="less_than">less than</SelectItem>
                                    <SelectItem value="in">is in</SelectItem>
                                    <SelectItem value="not_in">is not in</SelectItem>
                                    <SelectItem value="is_null">is empty</SelectItem>
                                    <SelectItem value="is_not_null">is not empty</SelectItem>
                                    <SelectItem value="contains">contains</SelectItem>
                                    <SelectItem value="starts_with">starts with</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Only show value source if not null check */}
                            {!['is_null', 'is_not_null'].includes(condition.operator) && (
                                <SmartValueInput
                                    value={condition.source === 'literal' ? (condition.literalValue || '') : (condition.sourceColumn || condition.literalValue || '')}
                                    source={condition.source}
                                    sourceColumn={condition.sourceColumn}
                                    targetColumn={condition.column}
                                    possibleValues={condition.column ? enumColumns[condition.column] : undefined}
                                    userColumns={sourceColumns}
                                    targetColumns={columns}
                                    allowedSources={allowedSources}
                                    onChange={(updates) => {
                                        updateCondition(condition.id, {
                                            source: updates.source,
                                            sourceColumn: updates.sourceColumn,
                                            // Ideally literalValue should be cleared if not literal, but for now we keep it simple or sync
                                            literalValue: updates.value
                                        });
                                    }}
                                />
                            )}

                            {/* Remove button */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive ml-auto"
                                onClick={() => removeCondition(condition.id)}
                                disabled={group.conditions.length <= 1}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    );
                })}
            </div>

            <Button
                variant="outline"
                size="sm"
                onClick={addCondition}
                className="w-full"
            >
                <Plus className="h-4 w-4 mr-2" />
                Add Condition
            </Button>
        </div>
    );
}
