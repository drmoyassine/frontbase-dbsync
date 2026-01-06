import React, { useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, GripVertical } from 'lucide-react';
import { ConditionGroupBuilder, createEmptyCondition } from './ConditionGroupBuilder';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import type { RLSTableRule, RLSOperation, RLSConditionGroup } from '@/types/rls';

interface TableRuleCardProps {
    rule: RLSTableRule;
    onChange: (rule: RLSTableRule) => void;
    onDelete: () => void;
    availableTables: string[];
    isOnlyRule: boolean;  // Disable delete if it's the only rule
    index: number;
}

/**
 * A reusable card component for each table rule in batch policy creation.
 * Contains: table selector, operation selector, row conditions builder.
 */
export function TableRuleCard({
    rule,
    onChange,
    onDelete,
    availableTables,
    isOnlyRule,
    index
}: TableRuleCardProps) {
    const { schemas, loadTableSchema } = useDataBindingStore();

    // Load schema when table changes
    useEffect(() => {
        if (rule.tableName) {
            loadTableSchema(rule.tableName);
        }
    }, [rule.tableName, loadTableSchema]);

    // Get columns for selected table
    const tableColumns = useMemo(() => {
        if (!rule.tableName) return [];
        const schema = schemas.get(rule.tableName);
        if (!schema?.columns) return [];

        // Deduplicate by name
        const seen = new Set();
        return schema.columns
            .filter(c => {
                if (seen.has(c.name)) return false;
                seen.add(c.name);
                return true;
            })
            .map(c => ({ name: c.name, type: c.type }));
    }, [rule.tableName, schemas]);

    const handleTableChange = (tableName: string) => {
        onChange({
            ...rule,
            tableName
        });
    };

    const handleOperationChange = (operation: RLSOperation) => {
        onChange({
            ...rule,
            operation
        });
    };

    const handleConditionGroupChange = (conditionGroup: RLSConditionGroup) => {
        onChange({
            ...rule,
            conditionGroup
        });
    };

    return (
        <Card className="border-l-4 border-l-blue-500 bg-slate-50/50">
            <CardContent className="pt-4 space-y-4">
                {/* Header with table selector and delete button */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <GripVertical className="h-4 w-4 cursor-grab opacity-50" />
                        <span className="font-medium text-foreground">Table {index + 1}</span>
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onDelete}
                        disabled={isOnlyRule}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title={isOnlyRule ? "Cannot delete the only rule" : "Delete this table rule"}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>

                {/* Table and Operation selectors in a row */}
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="text-muted-foreground">can</span>

                    {/* Operation selector */}
                    <Select value={rule.operation} onValueChange={handleOperationChange}>
                        <SelectTrigger className="w-[140px] h-8 bg-white">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="SELECT">view (SELECT)</SelectItem>
                            <SelectItem value="INSERT">create (INSERT)</SelectItem>
                            <SelectItem value="UPDATE">edit (UPDATE)</SelectItem>
                            <SelectItem value="DELETE">delete (DELETE)</SelectItem>
                            <SelectItem value="ALL">do anything (ALL)</SelectItem>
                        </SelectContent>
                    </Select>

                    <span className="text-muted-foreground">records in</span>

                    {/* Table selector */}
                    <Select value={rule.tableName} onValueChange={handleTableChange}>
                        <SelectTrigger className="w-[200px] h-8 bg-white">
                            <SelectValue placeholder="Select table..." />
                        </SelectTrigger>
                        <SelectContent>
                            {availableTables.map((table) => (
                                <SelectItem key={table} value={table}>
                                    {table}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Row Conditions - only show if table is selected */}
                {rule.tableName && (
                    <div className="space-y-2 pt-2 border-t">
                        <Label className="text-xs font-medium text-muted-foreground">
                            Where (Row Conditions)
                        </Label>
                        <ConditionGroupBuilder
                            group={rule.conditionGroup}
                            onChange={handleConditionGroupChange}
                            columns={tableColumns}
                            allowedSources={['literal', 'auth', 'user_attribute', 'target_column']}
                            showCombinator={true}
                        />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
