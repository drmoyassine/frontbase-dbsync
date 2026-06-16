/**
 * Chart Properties Panel
 * Configuration UI for the Chart component
 */

import React, { useState, useEffect } from 'react';
import { Type, Hash, Calendar, ToggleLeft, HelpCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataSourceSelector } from '@/components/data-binding/DataSourceSelector';
import { TableSelector } from '@/components/data-binding/TableSelector';
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

type ColumnInfo = { name: string; type: string };

/** Small type icon shown beside each column option (matches data-table field UX). */
const ColumnTypeIcon: React.FC<{ type: string }> = ({ type }) => {
    const t = (type || '').toLowerCase();
    const cls = 'h-3.5 w-3.5 text-muted-foreground shrink-0';
    if (/(int|numeric|decimal|float|double|real|money|serial)/.test(t)) return <Hash className={cls} />;
    if (/(date|time)/.test(t)) return <Calendar className={cls} />;
    if (/(bool)/.test(t)) return <ToggleLeft className={cls} />;
    return <Type className={cls} />;
};

/** Label with an inline help tooltip, matching the screenshot's "?" affordance. */
const FieldLabel: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
    <div className="flex items-center gap-1.5">
        <Label className="text-sm">{children}</Label>
        {hint && (
            <TooltipProvider delayDuration={200}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[220px] text-xs">{hint}</TooltipContent>
                </Tooltip>
            </TooltipProvider>
        )}
    </div>
);

/** Column dropdown with type icons. Pass `allowNone` for an optional "Select Column" clear option. */
const ColumnSelect: React.FC<{
    value: string;
    columns: ColumnInfo[];
    placeholder: string;
    allowNone?: boolean;
    onChange: (value: string) => void;
}> = ({ value, columns, placeholder, allowNone, onChange }) => {
    const NONE = '__none__';
    return (
        <Select
            value={value || (allowNone ? NONE : '')}
            onValueChange={(v) => onChange(v === NONE ? '' : v)}
        >
            <SelectTrigger>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {allowNone && (
                    <SelectItem value={NONE}>
                        <span className="text-muted-foreground">{placeholder}</span>
                    </SelectItem>
                )}
                {columns.map((col) => (
                    <SelectItem key={col.name} value={col.name}>
                        <span className="flex items-center gap-2">
                            <ColumnTypeIcon type={col.type} />
                            {col.name}
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};

export const ChartProperties: React.FC<ChartPropertiesProps> = ({
    componentId,
    binding,
    onBindingUpdate,
    props,
    updateComponentProp
}) => {
    const { globalSchema } = useDataBindingStore();
    const [columns, setColumns] = useState<ColumnInfo[]>([]);

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
    const chartType = props.chartType || 'bar';

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

    // Load columns for the field selectors
    useEffect(() => {
        if (!effectiveBinding.tableName) return;

        const fetchColumns = async () => {
            const allColumns: ColumnInfo[] = [];
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
                        <div className="space-y-4 pt-4 border-t">
                            {/* Chart Style */}
                            <div className="space-y-1.5">
                                <FieldLabel>Chart Style</FieldLabel>
                                <Select
                                    value={chartType}
                                    onValueChange={(value) => updateComponentProp('chartType', value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="bar">Bar</SelectItem>
                                        <SelectItem value="line">Line</SelectItem>
                                        <SelectItem value="pie">Pie</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Variant (bar charts only) */}
                            {chartType === 'bar' && (
                                <div className="space-y-1.5">
                                    <FieldLabel>Variant</FieldLabel>
                                    <Select
                                        value={effectiveBinding.chartConfig?.variant || 'vertical'}
                                        onValueChange={(value: 'vertical' | 'horizontal') =>
                                            updateChartConfig({ variant: value })
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="vertical">Vertical</SelectItem>
                                            <SelectItem value="horizontal">Horizontal</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {/* Label Field */}
                            <div className="space-y-1.5">
                                <FieldLabel hint="The column used for category labels (X-axis / pie slices).">
                                    Label Field
                                </FieldLabel>
                                <ColumnSelect
                                    value={effectiveBinding.chartConfig?.labelColumn || ''}
                                    columns={columns}
                                    placeholder="Select Column"
                                    onChange={(value) => updateChartConfig({ labelColumn: value })}
                                />
                            </div>

                            {/* Value Field */}
                            <div className="space-y-1.5">
                                <FieldLabel hint="The numeric column plotted as the value (Y-axis / slice size).">
                                    Value Field
                                </FieldLabel>
                                <ColumnSelect
                                    value={effectiveBinding.chartConfig?.valueColumn || ''}
                                    columns={columns}
                                    placeholder="Select Column"
                                    onChange={(value) => updateChartConfig({ valueColumn: value })}
                                />
                            </div>

                            {/* Group By */}
                            <div className="space-y-1.5">
                                <FieldLabel hint="Optional. Combine rows that share this column's value and aggregate the Value Field.">
                                    Group By
                                </FieldLabel>
                                <ColumnSelect
                                    value={effectiveBinding.chartConfig?.groupBy || ''}
                                    columns={columns}
                                    placeholder="Select Column"
                                    allowNone
                                    onChange={(value) => updateChartConfig({ groupBy: value })}
                                />
                            </div>

                            {/* Aggregation (only relevant once grouping is set) */}
                            {effectiveBinding.chartConfig?.groupBy && (
                                <div className="space-y-1.5">
                                    <FieldLabel hint="How to combine the Value Field within each group.">
                                        Aggregation
                                    </FieldLabel>
                                    <Select
                                        value={effectiveBinding.chartConfig?.aggregation || 'sum'}
                                        onValueChange={(value: 'sum' | 'count') =>
                                            updateChartConfig({ aggregation: value })
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="sum">Sum</SelectItem>
                                            <SelectItem value="count">Count</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
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
                        {/* Display */}
                        <div className="space-y-3 p-4 border rounded-lg">
                            <Label className="font-semibold block">Display</Label>
                            <div className="space-y-2">
                                <Label htmlFor="max-rows" className="text-sm">Max Rows</Label>
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
