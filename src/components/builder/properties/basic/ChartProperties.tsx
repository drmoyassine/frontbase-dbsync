/**
 * Chart Properties Panel
 * Configuration UI for the Chart component
 */

import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataSourceSelector } from '@/components/data-binding/DataSourceSelector';
import { TableSelector } from '@/components/data-binding/TableSelector';
import { CompactColumnConfigurator } from '@/components/builder/data-table/CompactColumnConfigurator';
import { ComponentDataBinding } from '@/hooks/data/useSimpleData';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { DefaultSortColumnSelector } from '@/components/builder/data-table/DataTablePropertiesPanel';

interface ChartPropertiesProps {
    componentId: string;
    binding: ComponentDataBinding | null;
    onBindingUpdate: (binding: ComponentDataBinding) => void;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const ChartProperties: React.FC<ChartPropertiesProps> = ({
    componentId,
    binding,
    onBindingUpdate,
    props,
    updateComponentProp
}) => {
    const { globalSchema } = useDataBindingStore();
    const [columns, setColumns] = useState<{ name: string; type: string }[]>([]);

    const defaultBinding: ComponentDataBinding = {
        componentId: componentId,
        dataSourceId: '',
        tableName: '',
        columnOverrides: {},
        columnOrder: [],
        filtering: { searchEnabled: false, filters: {} },
        pagination: { enabled: false, pageSize: 10, page: 0 },
        sorting: { enabled: false },
        refreshInterval: -1,
        chartConfig: {
            labelColumn: '',
            valueColumn: '',
            maxRows: 10
        }
    };

    const effectiveBinding = binding || defaultBinding;

    const updateBinding = (updates: Partial<ComponentDataBinding>) => {
        onBindingUpdate({ ...effectiveBinding, ...updates });
    };

    const updateChartConfig = (updates: Partial<NonNullable<ComponentDataBinding['chartConfig']>>) => {
        onBindingUpdate({
            ...effectiveBinding,
            chartConfig: {
                ...(effectiveBinding.chartConfig || { labelColumn: '', valueColumn: '', maxRows: 10 }),
                ...updates
            }
        });
    };

    // Load columns for axis selectors
    useEffect(() => {
        if (!effectiveBinding.tableName) return;

        const fetchColumns = async () => {
            const allColumns: { name: string; type: string }[] = [];
            const dataSourceId = effectiveBinding.dataSourceId;
            const tableName = effectiveBinding.tableName;

            if (dataSourceId && dataSourceId !== 'backend') {
                try {
                    const response = await fetch(
                        `/api/sync/datasources/${dataSourceId}/tables/${tableName}/schema`
                    );
                    if (response.ok) {
                        const schemaData = await response.json();
                        (schemaData.columns || []).forEach((col: any) => {
                            allColumns.push({
                                name: col.column_name || col.name,
                                type: col.data_type || col.type || 'text',
                            });
                        });
                    }
                } catch (error) {
                    console.error('[ChartProperties] Failed to fetch schema:', error);
                }
            } else {
                const gTable = globalSchema.tables.find((t: any) => t.table_name === tableName);
                if (gTable && gTable.columns) {
                    gTable.columns.forEach((c: any) => {
                        allColumns.push({ name: c.column_name, type: c.data_type });
                    });
                }
            }
            setColumns(allColumns);
        };

        fetchColumns();
    }, [effectiveBinding.tableName, effectiveBinding.dataSourceId, globalSchema]);

    return (
        <Tabs defaultValue="binding" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="binding">Data</TabsTrigger>
                <TabsTrigger value="options" disabled={!binding}>Options</TabsTrigger>
            </TabsList>

            {/* Data Binding Tab */}
            <TabsContent value="binding" className="space-y-4 p-4">
                <div className="space-y-4">
                    <div>
                        <DataSourceSelector
                            value={effectiveBinding.dataSourceId}
                            onValueChange={(value) => updateBinding({ dataSourceId: value })}
                        />
                    </div>

                    <div>
                        <TableSelector
                            value={effectiveBinding.tableName}
                            onValueChange={(value) => {
                                updateBinding({
                                    tableName: value,
                                    columnOverrides: {},
                                    columnOrder: [],
                                    sorting: { enabled: false, column: undefined, direction: 'asc' },
                                    chartConfig: {
                                        labelColumn: '',
                                        valueColumn: '',
                                        maxRows: 10
                                    }
                                });
                            }}
                            dataSourceId={effectiveBinding.dataSourceId}
                        />
                    </div>

                    {effectiveBinding.tableName && binding && (
                        <div className="pt-4 border-t">
                            <Label className="text-base font-semibold mb-3 block">Columns</Label>
                            <CompactColumnConfigurator
                                tableName={effectiveBinding.tableName}
                                dataSourceId={effectiveBinding.dataSourceId}
                                columnOverrides={effectiveBinding.columnOverrides || {}}
                                columnOrder={effectiveBinding.columnOrder}
                                onColumnOverridesChange={(overrides) => updateBinding({ columnOverrides: overrides })}
                                onColumnOrderChange={(order) => updateBinding({ columnOrder: order })}
                            />
                        </div>
                    )}

                    {!binding && (
                        <div className="pt-4 mt-4 border-t border-dashed text-center text-sm text-muted-foreground bg-muted/20 p-4 rounded-lg">
                            <p>Select a Data Source and Table above to configure chart data.</p>
                        </div>
                    )}
                </div>
            </TabsContent>

            {/* Options Tab */}
            <TabsContent value="options" className="space-y-4 p-4">
                {binding ? (
                    <div className="space-y-6">
                        {/* Chart General Config */}
                        <div className="space-y-4 p-4 border rounded-lg">
                            <Label className="font-semibold block">Chart Settings</Label>

                            <div className="space-y-2">
                                <Label htmlFor="chart-type">Chart Type</Label>
                                <Select
                                    value={props.chartType || 'bar'}
                                    onValueChange={(value) => updateComponentProp('chartType', value)}
                                >
                                    <SelectTrigger id="chart-type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="bar">Bar Chart</SelectItem>
                                        <SelectItem value="line">Line Chart</SelectItem>
                                        <SelectItem value="pie">Pie Chart</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="label-column">Label Column (X-Axis)</Label>
                                <Select
                                    value={effectiveBinding.chartConfig?.labelColumn || ''}
                                    onValueChange={(value) => updateChartConfig({ labelColumn: value })}
                                >
                                    <SelectTrigger id="label-column">
                                        <SelectValue placeholder="Select label column..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {columns.map((col) => (
                                            <SelectItem key={col.name} value={col.name}>
                                                {col.name} <span className="text-xs text-muted-foreground">({col.type})</span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="value-column">Value Column (Y-Axis)</Label>
                                <Select
                                    value={effectiveBinding.chartConfig?.valueColumn || ''}
                                    onValueChange={(value) => updateChartConfig({ valueColumn: value })}
                                >
                                    <SelectTrigger id="value-column">
                                        <SelectValue placeholder="Select value column..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {columns.map((col) => (
                                            <SelectItem key={col.name} value={col.name}>
                                                {col.name} <span className="text-xs text-muted-foreground">({col.type})</span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="max-rows">Max Rows</Label>
                                <Input
                                    id="max-rows"
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={effectiveBinding.chartConfig?.maxRows ?? 10}
                                    onChange={(e) => updateChartConfig({ maxRows: parseInt(e.target.value) || 10 })}
                                />
                            </div>
                        </div>

                        {/* Sorting */}
                        <div className="space-y-3 p-4 border rounded-lg">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="chart-sort-enabled" className="font-medium">Default Sort</Label>
                                <Switch
                                    id="chart-sort-enabled"
                                    checked={binding.sorting?.enabled || false}
                                    onCheckedChange={(checked) =>
                                        updateBinding({
                                            sorting: { ...binding.sorting!, enabled: checked }
                                        })
                                    }
                                />
                            </div>
                            {binding.sorting?.enabled && (
                                <div className="space-y-3 pt-2">
                                    <div className="space-y-2">
                                        <Label className="text-sm">Sort Column</Label>
                                        <DefaultSortColumnSelector
                                            tableName={binding.tableName}
                                            dataSourceId={binding.dataSourceId}
                                            columnOrder={binding.columnOrder}
                                            value={binding.sorting?.column || ''}
                                            onValueChange={(column) =>
                                                updateBinding({
                                                    sorting: { ...binding.sorting!, column }
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-sm">Sort Direction</Label>
                                        <Select
                                            value={binding.sorting?.direction || 'asc'}
                                            onValueChange={(direction: 'asc' | 'desc') =>
                                                updateBinding({
                                                    sorting: { ...binding.sorting!, direction }
                                                })
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="asc">Ascending (A → Z, 1 → 9)</SelectItem>
                                                <SelectItem value="desc">Descending (Z → A, 9 → 1)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Refresh Interval */}
                        <div className="space-y-3 p-4 border rounded-lg">
                            <Label htmlFor="refresh-interval" className="font-medium">Refresh Interval</Label>
                            <Select
                                value={effectiveBinding.refreshInterval?.toString() || '-1'}
                                onValueChange={(value) => updateBinding({ refreshInterval: parseInt(value) })}
                            >
                                <SelectTrigger id="refresh-interval">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="-1">Manual</SelectItem>
                                    <SelectItem value="5">Every 5 seconds</SelectItem>
                                    <SelectItem value="30">Every 30 seconds</SelectItem>
                                    <SelectItem value="60">Every minute</SelectItem>
                                    <SelectItem value="300">Every 5 minutes</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-8 text-muted-foreground">
                        Configure data binding first to enable options.
                    </div>
                )}
            </TabsContent>
        </Tabs>
    );
};
