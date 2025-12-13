import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Trash2, Code, AlertCircle } from 'lucide-react';
import { TableSelector } from '@/components/data-binding/TableSelector';
import { useUserContactConfig } from '@/hooks/useUserContactConfig';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import type {
    RLSOperation,
    RLSCondition,
    RLSConditionGroup,
    RLSPolicyFormData,
    RLSComparisonOperator,
    RLSValueSource
} from '@/types/rls';
import { OPERATION_LABELS, OPERATOR_CONFIG } from '@/types/rls';

interface RLSPolicyBuilderProps {
    initialData?: Partial<RLSPolicyFormData>;
    onSubmit: (data: RLSPolicyFormData, sql: { using: string; check: string }) => void;
    onCancel: () => void;
    isEditing?: boolean;
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
function createEmptyCondition(): RLSCondition {
    return {
        id: generateId(),
        column: '',
        operator: 'equals',
        source: 'contacts',
        sourceColumn: ''
    };
}

/**
 * Create an empty condition group
 */
function createEmptyConditionGroup(): RLSConditionGroup {
    return {
        id: generateId(),
        combinator: 'AND',
        conditions: [createEmptyCondition()]
    };
}

export function RLSPolicyBuilder({
    initialData,
    onSubmit,
    onCancel,
    isEditing = false
}: RLSPolicyBuilderProps) {
    const { config } = useUserContactConfig();
    const { schemas, loadTableSchema } = useDataBindingStore();

    // Form state
    const [policyName, setPolicyName] = useState(initialData?.policyName || '');
    const [tableName, setTableName] = useState(initialData?.tableName || '');
    const [operation, setOperation] = useState<RLSOperation>(initialData?.operation || 'SELECT');
    const [selectedContactTypes, setSelectedContactTypes] = useState<string[]>(initialData?.contactTypes || []);
    const [selectedPermissionLevels, setSelectedPermissionLevels] = useState<string[]>(initialData?.permissionLevels || []);
    const [conditionGroup, setConditionGroup] = useState<RLSConditionGroup>(
        initialData?.conditionGroup || createEmptyConditionGroup()
    );

    // Load table schema when table changes
    useEffect(() => {
        if (tableName) {
            loadTableSchema(tableName);
        }
    }, [tableName, loadTableSchema]);

    // Get columns for selected table
    const tableColumns = useMemo(() => {
        if (!tableName) return [];
        const schema = schemas.get(tableName);
        if (!schema?.columns) return [];
        return schema.columns.map(c => ({ name: c.name, type: c.type }));
    }, [tableName, schemas]);

    // Get contacts table columns
    const contactsColumns = useMemo(() => {
        if (!config?.contactsTable) return [];
        const schema = schemas.get(config.contactsTable);
        if (!schema?.columns) return [];
        return schema.columns.map(c => ({ name: c.name, type: c.type }));
    }, [config?.contactsTable, schemas]);

    // Load contacts table schema
    useEffect(() => {
        if (config?.contactsTable) {
            loadTableSchema(config.contactsTable);
        }
    }, [config?.contactsTable, loadTableSchema]);

    // Available contact types from config
    const contactTypes = useMemo(() => {
        if (!config?.contactTypes) return [];
        return Object.entries(config.contactTypes).map(([key, label]) => ({ value: key, label }));
    }, [config?.contactTypes]);

    // Available permission levels from config
    const permissionLevels = useMemo(() => {
        if (!config?.permissionLevels) return [];
        return Object.entries(config.permissionLevels).map(([key, label]) => ({ value: key, label }));
    }, [config?.permissionLevels]);

    // Update a condition in the group
    const updateCondition = useCallback((conditionId: string, updates: Partial<RLSCondition>) => {
        setConditionGroup(prev => ({
            ...prev,
            conditions: prev.conditions.map(c =>
                'id' in c && c.id === conditionId ? { ...c, ...updates } : c
            )
        }));
    }, []);

    // Add a new condition
    const addCondition = useCallback(() => {
        setConditionGroup(prev => ({
            ...prev,
            conditions: [...prev.conditions, createEmptyCondition()]
        }));
    }, []);

    // Remove a condition
    const removeCondition = useCallback((conditionId: string) => {
        setConditionGroup(prev => ({
            ...prev,
            conditions: prev.conditions.filter(c => !('id' in c) || c.id !== conditionId)
        }));
    }, []);

    // Build SQL expression from conditions
    const buildSQLExpression = useCallback((): { using: string; check: string } => {
        const conditions: string[] = [];

        // Add contact type filter if specified
        if (selectedContactTypes.length > 0 && config?.columnMapping?.contactTypeColumn) {
            const typeValues = selectedContactTypes.map(t => `'${t}'`).join(', ');
            conditions.push(`(SELECT ${config.columnMapping.contactTypeColumn} FROM ${config.contactsTable} WHERE ${config.columnMapping.authUserIdColumn} = auth.uid()) IN (${typeValues})`);
        }

        // Add permission level filter if specified
        if (selectedPermissionLevels.length > 0 && config?.columnMapping?.permissionLevelColumn) {
            const levelValues = selectedPermissionLevels.map(l => `'${l}'`).join(', ');
            conditions.push(`(SELECT ${config.columnMapping.permissionLevelColumn} FROM ${config.contactsTable} WHERE ${config.columnMapping.authUserIdColumn} = auth.uid()) IN (${levelValues})`);
        }

        // Build conditions from the visual builder
        conditionGroup.conditions.forEach((cond) => {
            if (!('column' in cond) || !cond.column) return;

            const condition = cond as RLSCondition;
            let sqlCondition = '';

            // Build left side (target table column)
            const leftSide = condition.column;

            // Build right side based on source
            let rightSide = '';
            if (condition.source === 'auth') {
                rightSide = 'auth.uid()';
            } else if (condition.source === 'contacts' && condition.sourceColumn && config) {
                rightSide = `(SELECT ${condition.sourceColumn} FROM ${config.contactsTable} WHERE ${config.columnMapping.authUserIdColumn} = auth.uid())`;
            } else if (condition.source === 'literal' && condition.literalValue) {
                // Escape single quotes for SQL
                rightSide = `'${condition.literalValue.replace(/'/g, "''")}'`;
            }

            // Build comparison
            switch (condition.operator) {
                case 'equals':
                    sqlCondition = `${leftSide} = ${rightSide}`;
                    break;
                case 'not_equals':
                    sqlCondition = `${leftSide} != ${rightSide}`;
                    break;
                case 'greater_than':
                    sqlCondition = `${leftSide} > ${rightSide}`;
                    break;
                case 'less_than':
                    sqlCondition = `${leftSide} < ${rightSide}`;
                    break;
                case 'in':
                    sqlCondition = `${leftSide} IN ${rightSide}`;
                    break;
                case 'not_in':
                    sqlCondition = `${leftSide} NOT IN ${rightSide}`;
                    break;
                case 'is_null':
                    sqlCondition = `${leftSide} IS NULL`;
                    break;
                case 'is_not_null':
                    sqlCondition = `${leftSide} IS NOT NULL`;
                    break;
                case 'contains':
                    sqlCondition = `${leftSide} ILIKE '%' || ${rightSide} || '%'`;
                    break;
                case 'starts_with':
                    sqlCondition = `${leftSide} ILIKE ${rightSide} || '%'`;
                    break;
            }

            if (sqlCondition) {
                conditions.push(sqlCondition);
            }
        });

        const combinedUsing = conditions.length > 0
            ? conditions.join(` ${conditionGroup.combinator} `)
            : 'true';

        // For INSERT/UPDATE, WITH CHECK is often the same as USING
        const combinedCheck = ['INSERT', 'UPDATE', 'ALL'].includes(operation)
            ? combinedUsing
            : '';

        return { using: combinedUsing, check: combinedCheck };
    }, [conditionGroup, selectedContactTypes, selectedPermissionLevels, config, operation]);

    // Generated SQL preview
    const generatedSQL = useMemo(() => buildSQLExpression(), [buildSQLExpression]);

    // Handle form submission
    const handleSubmit = () => {
        const formData: RLSPolicyFormData = {
            policyName,
            tableName,
            operation,
            contactTypes: selectedContactTypes,
            permissionLevels: selectedPermissionLevels,
            conditionGroup,
            roles: ['authenticated'],
            permissive: true
        };

        onSubmit(formData, generatedSQL);
    };

    // Validation
    const isValid = policyName.trim() && tableName && (
        selectedContactTypes.length > 0 ||
        selectedPermissionLevels.length > 0 ||
        conditionGroup.conditions.some(c => 'column' in c && c.column)
    );

    return (
        <div className="space-y-6">
            {/* Policy name and table */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="policyName" className="text-sm font-medium">Policy Name *</Label>
                    <Input
                        id="policyName"
                        value={policyName}
                        onChange={(e) => setPolicyName(e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase())}
                        placeholder="e.g., users_can_view_own_records"
                        className="mt-1.5"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Lowercase with underscores only</p>
                </div>

                <div>
                    <Label className="text-sm font-medium">Target Table *</Label>
                    <div className="mt-1.5">
                        <TableSelector
                            value={tableName}
                            onValueChange={setTableName}
                            placeholder="Select table"
                        />
                    </div>
                </div>
            </div>

            <Separator />

            {/* Natural language builder */}
            <div className="space-y-4">
                <Label className="text-sm font-medium">Access Rule</Label>

                <Card className="bg-slate-50/50">
                    <CardContent className="pt-4">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            {/* Contact Type Selection */}
                            <span className="text-muted-foreground">Users with type</span>
                            <Select
                                value={selectedContactTypes.length === 1 ? selectedContactTypes[0] : selectedContactTypes.length > 0 ? '_multiple_' : '_any_'}
                                onValueChange={(val) => {
                                    if (val === '_any_') {
                                        setSelectedContactTypes([]);
                                    } else if (val === '_multiple_') {
                                        // Keep current selection
                                    } else {
                                        setSelectedContactTypes([val]);
                                    }
                                }}
                            >
                                <SelectTrigger className="w-[140px] h-8">
                                    <SelectValue placeholder="Any type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="_any_">Any type</SelectItem>
                                    {contactTypes.map(ct => (
                                        <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* Permission Level Selection */}
                            <span className="text-muted-foreground">and permission</span>
                            <Select
                                value={selectedPermissionLevels.length === 1 ? selectedPermissionLevels[0] : selectedPermissionLevels.length > 0 ? '_multiple_' : '_any_'}
                                onValueChange={(val) => {
                                    if (val === '_any_') {
                                        setSelectedPermissionLevels([]);
                                    } else if (val === '_multiple_') {
                                        // Keep current selection
                                    } else {
                                        setSelectedPermissionLevels([val]);
                                    }
                                }}
                            >
                                <SelectTrigger className="w-[140px] h-8">
                                    <SelectValue placeholder="Any level" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="_any_">Any level</SelectItem>
                                    {permissionLevels.map(pl => (
                                        <SelectItem key={pl.value} value={pl.value}>{pl.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* Operation */}
                            <span className="text-muted-foreground">can</span>
                            <Select value={operation} onValueChange={(val) => setOperation(val as RLSOperation)}>
                                <SelectTrigger className="w-[120px] h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="SELECT">view</SelectItem>
                                    <SelectItem value="INSERT">create</SelectItem>
                                    <SelectItem value="UPDATE">edit</SelectItem>
                                    <SelectItem value="DELETE">delete</SelectItem>
                                    <SelectItem value="ALL">do anything to</SelectItem>
                                </SelectContent>
                            </Select>

                            <span className="text-muted-foreground">records in</span>
                            <Badge variant="secondary" className="font-mono">
                                {tableName || 'table'}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Condition builder */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Where (conditions)</Label>
                    <div className="flex items-center gap-2">
                        <Select
                            value={conditionGroup.combinator}
                            onValueChange={(val) => setConditionGroup(prev => ({ ...prev, combinator: val as 'AND' | 'OR' }))}
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
                </div>

                <div className="space-y-2">
                    {conditionGroup.conditions.map((cond, index) => {
                        if (!('column' in cond)) return null;
                        const condition = cond as RLSCondition;

                        return (
                            <div key={condition.id} className="flex items-center gap-2 p-3 bg-white rounded-lg border">
                                {index > 0 && (
                                    <Badge variant="outline" className="text-xs shrink-0">
                                        {conditionGroup.combinator}
                                    </Badge>
                                )}

                                {/* Target table column */}
                                <Select
                                    value={condition.column}
                                    onValueChange={(val) => updateCondition(condition.id, { column: val })}
                                >
                                    <SelectTrigger className="w-[140px] h-8">
                                        <SelectValue placeholder="Column" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {tableColumns.map(col => (
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
                                        <SelectItem value="is_null">is empty</SelectItem>
                                        <SelectItem value="is_not_null">is not empty</SelectItem>
                                    </SelectContent>
                                </Select>

                                {/* Only show value source if not null check */}
                                {!['is_null', 'is_not_null'].includes(condition.operator) && (
                                    <>
                                        {/* Value source */}
                                        <Select
                                            value={condition.source}
                                            onValueChange={(val) => updateCondition(condition.id, { source: val as RLSValueSource })}
                                        >
                                            <SelectTrigger className="w-[120px] h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="contacts">contacts.</SelectItem>
                                                <SelectItem value="auth">auth.uid()</SelectItem>
                                                <SelectItem value="literal">value</SelectItem>
                                            </SelectContent>
                                        </Select>

                                        {/* Source column or value */}
                                        {condition.source === 'contacts' && (
                                            <Select
                                                value={condition.sourceColumn || ''}
                                                onValueChange={(val) => updateCondition(condition.id, { sourceColumn: val })}
                                            >
                                                <SelectTrigger className="w-[140px] h-8">
                                                    <SelectValue placeholder="Column" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {contactsColumns.map(col => (
                                                        <SelectItem key={col.name} value={col.name}>
                                                            {col.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}

                                        {condition.source === 'literal' && (
                                            <Input
                                                value={condition.literalValue || ''}
                                                onChange={(e) => updateCondition(condition.id, { literalValue: e.target.value })}
                                                placeholder="Value"
                                                className="w-[140px] h-8"
                                            />
                                        )}
                                    </>
                                )}

                                {/* Remove button */}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                    onClick={() => removeCondition(condition.id)}
                                    disabled={conditionGroup.conditions.length <= 1}
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

            <Separator />

            {/* SQL Preview */}
            <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    Generated SQL
                </Label>
                <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs overflow-x-auto">
                    <div className="text-slate-400">-- USING clause (read access)</div>
                    <div className="text-green-400">{generatedSQL.using || 'true'}</div>
                    {generatedSQL.check && (
                        <>
                            <div className="text-slate-400 mt-2">-- WITH CHECK clause (write access)</div>
                            <div className="text-blue-400">{generatedSQL.check}</div>
                        </>
                    )}
                </div>
            </div>

            {/* Validation warning */}
            {!isValid && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Please provide a policy name, select a table, and add at least one filter or condition.</span>
                </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onCancel}>
                    Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={!isValid}>
                    {isEditing ? 'Update Policy' : 'Create Policy'}
                </Button>
            </div>
        </div>
    );
}
