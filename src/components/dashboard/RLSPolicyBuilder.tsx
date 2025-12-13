import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Code, AlertCircle, Wand2, FileCode } from 'lucide-react';
import { TableSelector } from '@/components/data-binding/TableSelector';
import { useUserContactConfig } from '@/hooks/useUserContactConfig';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import type {
    RLSOperation,
    RLSCondition,
    RLSConditionGroup,
    RLSPolicyFormData,
    RLSComparisonOperator,
    RLSValueSource,
    RLSPropagationTarget,
} from '@/types/rls';
import { OPERATION_LABELS, OPERATOR_CONFIG } from '@/types/rls';

interface RLSPolicyBuilderProps {
    initialData?: Partial<RLSPolicyFormData>;
    existingExpressions?: { using: string; check: string };
    forceRawMode?: boolean;
    onSubmit: (data: RLSPolicyFormData, sql: { using: string; check: string }, propagationTargets?: RLSPropagationTarget[]) => void;
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
    existingExpressions,
    forceRawMode = false,
    onSubmit,
    onCancel,
    isEditing = false
}: RLSPolicyBuilderProps) {
    const { config } = useUserContactConfig();
    const { schemas, loadTableSchema, globalSchema, fetchGlobalSchema } = useDataBindingStore();

    // Form state
    const [policyName, setPolicyName] = useState(initialData?.policyName || '');
    const [tableName, setTableName] = useState(initialData?.tableName || '');
    const [operation, setOperation] = useState<RLSOperation>(initialData?.operation || 'SELECT');
    const [selectedContactTypes, setSelectedContactTypes] = useState<string[]>(initialData?.contactTypes || []);
    const [selectedPermissionLevels, setSelectedPermissionLevels] = useState<string[]>(initialData?.permissionLevels || []);
    const [conditionGroup, setConditionGroup] = useState<RLSConditionGroup>(
        initialData?.conditionGroup || createEmptyConditionGroup()
    );

    // Propagation state - tables with FKs pointing to contacts
    const [propagationTargets, setPropagationTargets] = useState<Array<{
        tableName: string;
        fkColumn: string;
        fkReferencedColumn: string;
        selected: boolean;
    }>>([]);

    // Edit mode: use tabs to switch between visual and raw SQL
    // If forceRawMode is true (policy modified externally or no metadata), default to raw mode
    // If we have initial conditionGroup data (restored from metadata), use visual mode
    const [editMode, setEditMode] = useState<'visual' | 'raw'>(
        forceRawMode
            ? 'raw'
            : (initialData?.conditionGroup ? 'visual' : (isEditing && existingExpressions?.using ? 'raw' : 'visual'))
    );
    const [rawUsing, setRawUsing] = useState(existingExpressions?.using || '');
    const [rawCheck, setRawCheck] = useState(existingExpressions?.check || '');

    // Fetch global schema if not already loaded (for FK detection)
    useEffect(() => {
        if (!globalSchema?.foreign_keys?.length) {
            fetchGlobalSchema();
        }
    }, [globalSchema, fetchGlobalSchema]);

    // Detect related tables with FKs pointing to the contacts table
    useEffect(() => {
        if (!config?.contactsTable || !globalSchema?.foreign_keys?.length) {
            setPropagationTargets([]);
            return;
        }

        const contactsTable = config.contactsTable;

        // Find all tables that have FKs pointing TO the contacts table (reverse FKs)
        const relatedTables = globalSchema.foreign_keys
            .filter(fk => fk.foreign_table_name === contactsTable)
            .map(fk => ({
                tableName: fk.table_name,
                fkColumn: fk.column_name,
                fkReferencedColumn: fk.foreign_column_name,
                selected: false
            }));

        // Group by table name (in case of multiple FKs to same table) - keep first for now
        const uniqueTables = new Map<string, typeof relatedTables[0]>();
        relatedTables.forEach(t => {
            if (!uniqueTables.has(t.tableName)) {
                uniqueTables.set(t.tableName, t);
            }
        });

        setPropagationTargets(Array.from(uniqueTables.values()));
    }, [config?.contactsTable, globalSchema?.foreign_keys]);

    // Handle propagation target selection
    const togglePropagationTarget = useCallback((tableNameToToggle: string) => {
        setPropagationTargets(prev => prev.map(t =>
            t.tableName === tableNameToToggle
                ? { ...t, selected: !t.selected }
                : t
        ));
    }, []);

    // Handle FK column change (for tables with multiple FKs)
    const setTargetFkColumn = useCallback((tableNameToUpdate: string, fkColumn: string, fkReferencedColumn: string) => {
        setPropagationTargets(prev => prev.map(t =>
            t.tableName === tableNameToUpdate
                ? { ...t, fkColumn, fkReferencedColumn }
                : t
        ));
    }, []);

    // Get alternative FK columns for a table (when table has multiple FKs to contacts)
    const getAlternativeFkColumns = useCallback((tableNameToCheck: string) => {
        if (!config?.contactsTable || !globalSchema?.foreign_keys) return [];
        return globalSchema.foreign_keys
            .filter(fk => fk.table_name === tableNameToCheck && fk.foreign_table_name === config.contactsTable)
            .map(fk => ({
                fkColumn: fk.column_name,
                fkReferencedColumn: fk.foreign_column_name
            }));
    }, [config?.contactsTable, globalSchema?.foreign_keys]);

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

    // Generated SQL preview - either from visual builder or raw input
    const generatedSQL = useMemo(() => {
        if (editMode === 'raw') {
            return { using: rawUsing, check: rawCheck };
        }
        return buildSQLExpression();
    }, [editMode, rawUsing, rawCheck, buildSQLExpression]);

    // Handle form submission
    const handleSubmit = () => {
        const formData: RLSPolicyFormData = {
            policyName,
            tableName,
            operation,
            contactTypes: selectedContactTypes,
            permissionLevels: selectedPermissionLevels,
            conditionGroup,
            roles: initialData?.roles || ['authenticated'],
            permissive: initialData?.permissive !== undefined ? initialData.permissive : true
        };

        // Use raw SQL in edit mode, or generated SQL in visual mode
        const sqlToSubmit = editMode === 'raw'
            ? { using: rawUsing, check: rawCheck }
            : generatedSQL;

        // Only include selected propagation targets
        const selectedPropagationTargets = propagationTargets.filter(t => t.selected);

        onSubmit(formData, sqlToSubmit, selectedPropagationTargets);
    };

    // Validation - different rules for visual vs raw mode
    const isValid = policyName.trim() && tableName && (
        editMode === 'raw'
            ? rawUsing.trim().length > 0  // Raw mode just needs a USING expression
            : (
                selectedContactTypes.length > 0 ||
                selectedPermissionLevels.length > 0 ||
                conditionGroup.conditions.some(c => 'column' in c && c.column)
            )
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

            {/* Mode tabs for editing */}
            <Tabs value={editMode} onValueChange={(v) => setEditMode(v as 'visual' | 'raw')} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="visual" className="gap-2">
                        <Wand2 className="h-4 w-4" />
                        Visual Builder
                    </TabsTrigger>
                    <TabsTrigger value="raw" className="gap-2">
                        <FileCode className="h-4 w-4" />
                        Raw SQL
                    </TabsTrigger>
                </TabsList>

                {/* Visual Builder Tab */}
                <TabsContent value="visual" className="space-y-4 mt-4">
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
                </TabsContent>

                {/* Raw SQL Tab */}
                <TabsContent value="raw" className="space-y-4 mt-4">
                    <div className="space-y-4">
                        <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
                            <AlertCircle className="h-4 w-4 inline mr-2" />
                            <strong>Advanced Mode:</strong> Edit the raw SQL expressions directly. Use with caution.
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Operation</Label>
                            <Select value={operation} onValueChange={(val) => setOperation(val as RLSOperation)}>
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="SELECT">SELECT (view)</SelectItem>
                                    <SelectItem value="INSERT">INSERT (create)</SelectItem>
                                    <SelectItem value="UPDATE">UPDATE (edit)</SelectItem>
                                    <SelectItem value="DELETE">DELETE (delete)</SelectItem>
                                    <SelectItem value="ALL">ALL (all operations)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-medium">
                                USING Expression (required)
                                <span className="text-muted-foreground font-normal ml-2 text-xs">
                                    Determines which rows can be read
                                </span>
                            </Label>
                            <Textarea
                                value={rawUsing}
                                onChange={(e) => setRawUsing(e.target.value)}
                                placeholder="e.g., auth.uid() = user_id"
                                className="font-mono text-sm min-h-[100px]"
                            />
                        </div>

                        {['INSERT', 'UPDATE', 'ALL'].includes(operation) && (
                            <div className="space-y-2">
                                <Label className="text-sm font-medium">
                                    WITH CHECK Expression (optional)
                                    <span className="text-muted-foreground font-normal ml-2 text-xs">
                                        Determines which rows can be written
                                    </span>
                                </Label>
                                <Textarea
                                    value={rawCheck}
                                    onChange={(e) => setRawCheck(e.target.value)}
                                    placeholder="e.g., auth.uid() = user_id"
                                    className="font-mono text-sm min-h-[80px]"
                                />
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            <Separator />

            {/* SQL Preview */}
            <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    {editMode === 'raw' ? 'SQL Expression' : 'Generated SQL'}
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

            {/* Propagation Settings (only when base table is contacts) */}
            {propagationTargets.length > 0 && tableName === config?.contactsTable && (
                <div className="space-y-4 pt-4 border-t">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium">Apply to related tables</h3>
                        <Badge variant="outline" className="text-xs font-normal">Optional</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Automatically create policies for tables linked to the contacts table.
                        Users will only see records related to their contact.
                    </p>

                    <div className="grid gap-3 pt-2">
                        {propagationTargets.map((target) => (
                            <div key={target.tableName} className="flex items-start space-x-3 p-3 border rounded-md bg-muted/20">
                                <Checkbox
                                    id={`propagate-${target.tableName}`}
                                    checked={target.selected}
                                    onCheckedChange={() => togglePropagationTarget(target.tableName)}
                                />
                                <div className="grid gap-1.5 flex-1">
                                    <Label
                                        htmlFor={`propagate-${target.tableName}`}
                                        className="text-sm font-medium leading-none cursor-pointer"
                                    >
                                        {target.tableName}
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                        Linked via <code className="bg-muted px-1 rounded">{target.fkColumn}</code>
                                    </p>

                                    {/* Multiple FKs Handling */}
                                    {target.selected && getAlternativeFkColumns(target.tableName).length > 1 && (
                                        <div className="mt-2 text-xs">
                                            <Label className="text-xs text-muted-foreground mb-1 block">
                                                Which relationship to use?
                                            </Label>
                                            <Select
                                                value={target.fkColumn}
                                                onValueChange={(val) => {
                                                    // Find the referencing column for this FK
                                                    const fkInfo = getAlternativeFkColumns(target.tableName).find(fk => fk.fkColumn === val);
                                                    if (fkInfo) {
                                                        setTargetFkColumn(target.tableName, val, fkInfo.fkReferencedColumn);
                                                    }
                                                }}
                                            >
                                                <SelectTrigger className="h-7 text-xs w-full max-w-[200px]">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {getAlternativeFkColumns(target.tableName).map(fk => (
                                                        <SelectItem key={fk.fkColumn} value={fk.fkColumn} className="text-xs">
                                                            via {fk.fkColumn}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Validation warning */}
            {!isValid && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>
                        {editMode === 'raw'
                            ? 'Please provide a policy name, select a table, and enter a USING expression.'
                            : 'Please provide a policy name, select a table, and add at least one filter or condition.'}
                    </span>
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

