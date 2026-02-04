/**
 * PropertiesPane - Schema-Driven Node Configuration Sidebar
 * 
 * Renders configuration options for the selected node based on its schema.
 */

import React, { useMemo } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useActionsStore } from '@/stores/actions';
import { cn } from '@/lib/utils';
import {
    getNodeSchema,
    isFieldVisible,
    FieldDefinition,
    SelectFieldDefinition,
    CodeFieldDefinition,
    KeyValueFieldDefinition,
} from '@/lib/workflow/nodeSchemas';
import { SelectField, DynamicSelectField, KeyValueField, CodeField, ExpressionField, ConditionBuilderField, FieldMappingField } from './fields';

interface PropertiesPaneProps {
    className?: string;
}

export function PropertiesPane({ className }: PropertiesPaneProps) {
    const { nodes, selectedNodeId, updateNode, removeNode, selectNode } = useActionsStore();

    const selectedNode = nodes.find((n) => n.id === selectedNodeId);

    // Get schema for the selected node type
    const schema = useMemo(() => {
        if (!selectedNode) return null;
        return getNodeSchema(selectedNode.data.type);
    }, [selectedNode?.data.type]);

    // Convert inputs array to values object for easier access
    const fieldValues = useMemo(() => {
        if (!selectedNode) return {};
        return selectedNode.data.inputs.reduce((acc, input) => {
            acc[input.name] = input.value;
            return acc;
        }, {} as Record<string, any>);
    }, [selectedNode?.data.inputs]);

    if (!selectedNode) {
        return (
            <div className={cn('w-80 bg-background border-l p-4', className)}>
                <div className="text-sm text-muted-foreground text-center py-8">
                    Select a node to configure
                </div>
            </div>
        );
    }

    const handleFieldChange = (fieldName: string, value: any) => {
        const updatedInputs = selectedNode.data.inputs.map((input) =>
            input.name === fieldName ? { ...input, value } : input
        );

        // If field doesn't exist yet, add it
        if (!updatedInputs.find(i => i.name === fieldName)) {
            const fieldDef = schema?.inputs.find(i => i.name === fieldName);
            updatedInputs.push({
                name: fieldName,
                type: fieldDef?.type || 'string',
                value,
            });
        }

        updateNode(selectedNode.id, { inputs: updatedInputs });
    };

    const handleDelete = () => {
        removeNode(selectedNode.id);
    };

    // Render a field based on its type
    const renderField = (field: FieldDefinition) => {
        // Check conditional visibility
        if (!isFieldVisible(field, fieldValues)) {
            return null;
        }

        const value = fieldValues[field.name];
        const fieldLabel = field.label || field.name;

        switch (field.type) {
            case 'string':
            case 'password':
                return (
                    <div key={field.name} className="space-y-2">
                        <Label htmlFor={field.name}>
                            {fieldLabel}
                            {field.required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                        <Input
                            id={field.name}
                            type={field.type === 'password' ? 'password' : 'text'}
                            value={value || ''}
                            onChange={(e) => handleFieldChange(field.name, e.target.value)}
                            placeholder={field.placeholder}
                        />
                        {field.description && (
                            <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                    </div>
                );

            case 'number':
                return (
                    <div key={field.name} className="space-y-2">
                        <Label htmlFor={field.name}>
                            {fieldLabel}
                            {field.required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                        <Input
                            id={field.name}
                            type="number"
                            value={value ?? field.default ?? ''}
                            onChange={(e) => handleFieldChange(field.name, Number(e.target.value))}
                            placeholder={field.placeholder}
                        />
                        {field.description && (
                            <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                    </div>
                );

            case 'boolean':
                return (
                    <div key={field.name} className="flex items-center justify-between py-2">
                        <div>
                            <Label htmlFor={field.name}>{fieldLabel}</Label>
                            {field.description && (
                                <p className="text-xs text-muted-foreground">{field.description}</p>
                            )}
                        </div>
                        <Switch
                            id={field.name}
                            checked={value ?? field.default ?? false}
                            onCheckedChange={(checked) => handleFieldChange(field.name, checked)}
                        />
                    </div>
                );

            case 'select':
                const selectField = field as SelectFieldDefinition;
                const isDynamicOptions = typeof selectField.options === 'string';

                // Handle dynamic options (datasources, tables, etc.)
                if (isDynamicOptions) {
                    // Determine dependency for tables (needs selected dataSource)
                    let dependsOnValue: string | undefined;
                    if (selectField.options === 'tables') {
                        dependsOnValue = fieldValues['dataSource'];
                    }

                    return (
                        <DynamicSelectField
                            key={field.name}
                            name={field.name}
                            label={fieldLabel}
                            value={value ?? field.default ?? ''}
                            options={selectField.options}
                            onChange={(v) => handleFieldChange(field.name, v)}
                            description={field.description}
                            required={field.required}
                            dependsOnValue={dependsOnValue}
                            placeholder={
                                selectField.options === 'datasources'
                                    ? 'Select a configured data source'
                                    : selectField.options === 'tables'
                                        ? 'Select a table'
                                        : 'Select...'
                            }
                        />
                    );
                }

                // Static options
                const options = Array.isArray(selectField.options)
                    ? selectField.options
                    : [];
                return (
                    <SelectField
                        key={field.name}
                        name={field.name}
                        label={fieldLabel}
                        value={value ?? field.default ?? ''}
                        options={options}
                        onChange={(v) => handleFieldChange(field.name, v)}
                        description={field.description}
                        required={field.required}
                    />
                );

            case 'json':
                return (
                    <div key={field.name} className="space-y-2">
                        <Label htmlFor={field.name}>
                            {fieldLabel}
                            {field.required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                        <Textarea
                            id={field.name}
                            value={typeof value === 'object' ? JSON.stringify(value, null, 2) : value || ''}
                            onChange={(e) => {
                                try {
                                    const parsed = JSON.parse(e.target.value);
                                    handleFieldChange(field.name, parsed);
                                } catch {
                                    handleFieldChange(field.name, e.target.value);
                                }
                            }}
                            placeholder={field.placeholder || '{}'}
                            rows={4}
                            className="font-mono text-xs"
                        />
                        {field.description && (
                            <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                    </div>
                );

            case 'code':
                const codeField = field as CodeFieldDefinition;
                return (
                    <CodeField
                        key={field.name}
                        name={field.name}
                        label={fieldLabel}
                        value={value || ''}
                        onChange={(v) => handleFieldChange(field.name, v)}
                        language={codeField.language}
                        description={field.description}
                        placeholder={field.placeholder}
                        required={field.required}
                    />
                );

            case 'expression':
                return (
                    <ExpressionField
                        key={field.name}
                        name={field.name}
                        label={fieldLabel}
                        value={value || ''}
                        onChange={(v) => handleFieldChange(field.name, v)}
                        description={field.description}
                        placeholder={field.placeholder}
                        required={field.required}
                    />
                );

            case 'keyValue':
                const kvField = field as KeyValueFieldDefinition;
                return (
                    <KeyValueField
                        key={field.name}
                        name={field.name}
                        label={fieldLabel}
                        value={value || []}
                        onChange={(v) => handleFieldChange(field.name, v)}
                        description={field.description}
                        keyPlaceholder={kvField.keyPlaceholder}
                        valuePlaceholder={kvField.valuePlaceholder}
                    />
                );

            case 'conditionBuilder':
                return (
                    <ConditionBuilderField
                        key={field.name}
                        name={field.name}
                        label={fieldLabel}
                        value={value || field.default || []}
                        onChange={(v) => handleFieldChange(field.name, v)}
                        description={field.description}
                    />
                );

            case 'fieldMapping':
                return (
                    <FieldMappingField
                        key={field.name}
                        name={field.name}
                        label={fieldLabel}
                        value={value || []}
                        onChange={(v) => handleFieldChange(field.name, v)}
                        description={field.description}
                        dataSourceId={fieldValues['dataSource']}
                        tableName={fieldValues['table']}
                    />
                );

            default:
                return null;
        }
    };

    return (
        <div className={cn('w-80 bg-background border-l flex flex-col', className)}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
                <div>
                    <h3 className="font-semibold text-sm">{selectedNode.data.label}</h3>
                    <p className="text-xs text-muted-foreground">
                        {schema?.description || selectedNode.data.type}
                    </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => selectNode(null)}>
                    <X className="w-4 h-4" />
                </Button>
            </div>

            {/* Properties */}
            <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                {/* Node Label (always shown) */}
                <div className="space-y-2">
                    <Label htmlFor="node-label">Label</Label>
                    <Input
                        id="node-label"
                        value={selectedNode.data.label}
                        onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                    />
                </div>

                {/* Schema-driven fields */}
                {schema?.inputs.map(renderField)}

                {/* Fallback for nodes without schema */}
                {!schema && selectedNode.data.inputs.map((input) => (
                    <div key={input.name} className="space-y-2">
                        <Label htmlFor={`input-${input.name}`}>{input.name}</Label>
                        <Input
                            id={`input-${input.name}`}
                            value={input.value || ''}
                            onChange={(e) => handleFieldChange(input.name, e.target.value)}
                        />
                    </div>
                ))}

                {/* Outputs display (read-only) */}
                {schema && schema.outputs.length > 0 && (
                    <div className="pt-4 border-t">
                        <h4 className="text-xs font-medium text-muted-foreground mb-2">Outputs</h4>
                        <div className="space-y-1">
                            {schema.outputs.map((output) => (
                                <div key={output.name} className="flex justify-between text-xs">
                                    <span className="font-mono">{output.name}</span>
                                    <span className="text-muted-foreground">{output.type}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t">
                <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={handleDelete}
                >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Node
                </Button>
            </div>
        </div>
    );
}
