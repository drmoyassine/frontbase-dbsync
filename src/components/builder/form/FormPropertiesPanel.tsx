import React, { useState, useEffect } from 'react';
import { useBuilderStore } from '@/stores/builder';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { FieldConfigurator } from './FieldConfigurator';
import type { ColumnSchema, TableSchema } from '@/types/schema';
import { DataSourceSelector } from '@/components/data-binding/DataSourceSelector';
import { TableSelector } from '@/components/data-binding/TableSelector';

interface FormPropertiesPanelProps {
    componentId: string;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
    type: 'Form' | 'InfoList';
}

export const FormPropertiesPanel: React.FC<FormPropertiesPanelProps> = ({
    componentId,
    props,
    updateComponentProp,
    type
}) => {
    const [schema, setSchema] = useState<TableSchema | null>(null);
    const [loadingSchema, setLoadingSchema] = useState(false);
    const focusedField = useBuilderStore(s => s.focusedField);

    // Fetch schema when datasource/table changes
    useEffect(() => {
        if (!props.dataSourceId || !props.tableName) {
            setSchema(null);
            return;
        }

        const fetchSchema = async () => {
            setLoadingSchema(true);
            try {
                const response = await fetch(`/api/sync/datasources/${props.dataSourceId}/tables/${props.tableName}/schema`);
                if (response.ok) {
                    const data = await response.json();
                    setSchema(data);
                }
            } catch (error) {
                console.error('Failed to fetch schema:', error);
            } finally {
                setLoadingSchema(false);
            }
        };

        fetchSchema();
    }, [props.dataSourceId, props.tableName]);

    // Derived state for current mode (default to create if not set)
    const currentMode = props.recordId !== undefined ? 'edit' : 'create';

    return (
        <Tabs defaultValue="fields" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="fields">Fields</TabsTrigger>
                <TabsTrigger value="options">Options</TabsTrigger>
                <TabsTrigger value="actions" disabled={type === 'InfoList'}>Actions</TabsTrigger>
            </TabsList>

            <div className="max-h-[calc(100vh-250px)] overflow-y-auto px-1 pb-4">
                {/* FIELDS TAB */}
                <TabsContent value="fields" className="space-y-6 mt-0">

                    {/* Data Source Configuration */}
                    <div className="space-y-4">
                        <DataSourceSelector
                            value={props.dataSourceId}
                            onValueChange={(value) => updateComponentProp('dataSourceId', value)}
                        />

                        <TableSelector
                            value={props.tableName}
                            onValueChange={(value) => updateComponentProp('tableName', value)}
                            dataSourceId={props.dataSourceId}
                        />
                    </div>

                    <Separator />

                    {/* Mode & Record ID (Moved from Options) */}
                    <div className="space-y-4">
                        {type === 'Form' && (
                            <div className="space-y-2">
                                <Label>Form Mode</Label>
                                <Select
                                    value={currentMode}
                                    onValueChange={(value) => {
                                        if (value === 'create') {
                                            updateComponentProp('recordId', undefined); // Clear record ID for create mode
                                        } else if (value === 'edit' && !props.recordId) {
                                            updateComponentProp('recordId', ''); // Initialize with empty string to switch mode
                                        }
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="create">Create New Record</SelectItem>
                                        <SelectItem value="edit">Edit Existing Record</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Record ID - Only shown in Edit mode or for InfoList (which always needs an ID/Context) */}
                        {(currentMode === 'edit' || type === 'InfoList') && (
                            <div className="space-y-2">
                                <Label>Record ID</Label>
                                <p className="text-xs text-muted-foreground mb-1.5">
                                    {type === 'Form'
                                        ? "Bind to a URL param (e.g. {{params.id}}) or variable."
                                        : "ID of the record to display."}
                                </p>
                                <Input
                                    value={props.recordId || ''}
                                    onChange={(e) => updateComponentProp('recordId', e.target.value || undefined)}
                                    placeholder="e.g. {{params.id}} or 123"
                                />
                            </div>
                        )}
                    </div>

                    <Separator />

                    {/* Field Configuration */}
                    {schema?.columns && (
                        <div className="space-y-2">
                            <Label>Field Configuration</Label>
                            <FieldConfigurator
                                columns={schema.columns}
                                overrides={props.fieldOverrides || {}}
                                onOverridesChange={(overrides) => updateComponentProp('fieldOverrides', overrides)}
                                order={props.fieldOrder || []}
                                onOrderChange={(order) => updateComponentProp('fieldOrder', order)}
                                focusedField={focusedField}
                                onFocusHandled={() => useBuilderStore.getState().setFocusedField(null)}
                                componentType={type}
                            />
                        </div>
                    )}

                    {(!schema && props.tableName && loadingSchema) && (
                        <div className="text-sm text-muted-foreground text-center py-4">Loading schema...</div>
                    )}
                    {(!schema && !props.tableName) && (
                        <div className="text-sm text-muted-foreground text-center py-4">
                            Select a datasource and table to configure fields.
                        </div>
                    )}
                </TabsContent>

                {/* OPTIONS TAB */}
                <TabsContent value="options" className="space-y-4 mt-0">
                    <div className="space-y-4">
                        {/* Layout option for InfoList */}
                        {type === 'InfoList' && (
                            <div className="space-y-2">
                                <Label>Layout</Label>
                                <Select
                                    value={props.layout || '2'}
                                    onValueChange={(value) => updateComponentProp('layout', value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select layout" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="list">Inline List</SelectItem>
                                        <SelectItem value="1">1 Column</SelectItem>
                                        <SelectItem value="2">2 Columns</SelectItem>
                                        <SelectItem value="3">3 Columns</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Field Spacing option for InfoList (only when using list layout) */}
                        {type === 'InfoList' && props.layout === 'list' && (
                            <div className="space-y-2">
                                <Label>Field Spacing</Label>
                                <Select
                                    value={props.fieldSpacing || 'normal'}
                                    onValueChange={(value) => updateComponentProp('fieldSpacing', value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select spacing" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="compact">Compact</SelectItem>
                                        <SelectItem value="normal">Normal</SelectItem>
                                        <SelectItem value="relaxed">Relaxed</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="flex items-center justify-between">
                            <div className="flex flex-col gap-0.5">
                                <Label>Show Card Wrapper</Label>
                                <span className="text-xs text-muted-foreground">Wrap content in a styled card</span>
                            </div>
                            <Switch
                                checked={props.showCard ?? true}
                                onCheckedChange={(checked) => updateComponentProp('showCard', checked)}
                            />
                        </div>

                        {type === 'Form' && (
                            <>
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col gap-0.5">
                                        <Label>Show Cancel Button</Label>
                                    </div>
                                    <Switch
                                        checked={props.showCancel ?? true}
                                        onCheckedChange={(checked) => updateComponentProp('showCancel', checked)}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </TabsContent>

                {/* ACTIONS TAB */}
                <TabsContent value="actions" className="space-y-4 mt-0">
                    {/* Placeholder for future action config (e.g. redirect after submit) */}
                    <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
                        Submit actions configuration coming soon.
                    </div>
                </TabsContent>
            </div>
        </Tabs>
    );
};
