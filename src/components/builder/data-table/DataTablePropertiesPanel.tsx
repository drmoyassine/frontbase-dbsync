import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataSourceSelector } from '@/components/data-binding/DataSourceSelector';
import { TableSelector } from '@/components/data-binding/TableSelector';
import { CompactColumnConfigurator } from './CompactColumnConfigurator';
import { FilterConfigurator } from './FilterConfigurator';
import { ComponentDataBinding } from '@/hooks/data/useSimpleData';
import { useBuilderStore } from '@/stores/builder';

interface DataTablePropertiesPanelProps {
    componentId: string;
    binding: ComponentDataBinding | null;
    onBindingUpdate: (binding: ComponentDataBinding) => void;
}

export const DataTablePropertiesPanel: React.FC<DataTablePropertiesPanelProps> = ({
    componentId,
    binding,
    onBindingUpdate
}) => {
    const updateBinding = (updates: Partial<ComponentDataBinding>) => {
        if (!binding) return;
        onBindingUpdate({ ...binding, ...updates });
    };

    const effectiveBinding = binding || {
        dataSourceId: '',
        tableName: '',
        columnOverrides: {},
        columnOrder: [],
        filtering: { searchEnabled: false, filters: {} },
        pagination: { enabled: true, pageSize: 20 },
        refreshInterval: 0
    };

    return (
        <Tabs defaultValue="binding" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="binding">Data</TabsTrigger>
                <TabsTrigger value="options" disabled={!binding}>Options</TabsTrigger>
                <TabsTrigger value="filters" disabled={!binding}>Filters</TabsTrigger>
                <TabsTrigger value="actions" disabled={!binding}>Actions</TabsTrigger>
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
                            onValueChange={(value) => updateBinding({ tableName: value })}
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
                            <p>Select a Data Source and Table above to configure columns and other properties.</p>
                        </div>
                    )}
                </div>
            </TabsContent>

            {/* Options Tab */}
            <TabsContent value="options" className="space-y-4 p-4">
                {binding ? (
                    <div className="space-y-6">
                        {/* Search */}
                        <div className="space-y-3 p-4 border rounded-lg">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="search-enabled" className="font-medium">Search</Label>
                                <Switch
                                    id="search-enabled"
                                    checked={binding.filtering?.searchEnabled || false}
                                    onCheckedChange={(checked) =>
                                        updateBinding({
                                            filtering: { ...binding.filtering!, searchEnabled: checked }
                                        })
                                    }
                                />
                            </div>
                            {binding.filtering?.searchEnabled && (
                                <div className="space-y-2 pt-2">
                                    <Label className="text-sm text-muted-foreground">
                                        Searchable Columns (leave empty for all text columns)
                                    </Label>
                                    <Input
                                        placeholder="e.g., name, email, description"
                                        value={binding.searchColumns?.join(', ') || ''}
                                        onChange={(e) => {
                                            const columns = e.target.value
                                                .split(',')
                                                .map(c => c.trim())
                                                .filter(Boolean);
                                            updateBinding({ searchColumns: columns.length > 0 ? columns : undefined });
                                        }}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Pagination */}
                        <div className="space-y-3 p-4 border rounded-lg">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="pagination-enabled" className="font-medium">Pagination</Label>
                                <Switch
                                    id="pagination-enabled"
                                    checked={binding.pagination?.enabled || false}
                                    onCheckedChange={(checked) =>
                                        updateBinding({
                                            pagination: { ...binding.pagination!, enabled: checked }
                                        })
                                    }
                                />
                            </div>
                            {binding.pagination?.enabled && (
                                <div className="space-y-2 pt-2">
                                    <Label htmlFor="page-size" className="text-sm">Rows per page</Label>
                                    <Input
                                        id="page-size"
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={binding.pagination?.pageSize || 20}
                                        onChange={(e) =>
                                            updateBinding({
                                                pagination: {
                                                    ...binding.pagination!,
                                                    pageSize: parseInt(e.target.value) || 20
                                                }
                                            })
                                        }
                                    />
                                </div>
                            )}
                        </div>

                        {/* Refresh Interval */}
                        <div className="space-y-3 p-4 border rounded-lg">
                            <Label htmlFor="refresh-interval" className="font-medium">Refresh Interval</Label>
                            <Select
                                value={binding.refreshInterval?.toString() || '-1'}
                                onValueChange={(value) => updateBinding({ refreshInterval: parseInt(value) })}
                            >
                                <SelectTrigger id="refresh-interval">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="-1">Manual</SelectItem>
                                    <SelectItem value="0">Real-time</SelectItem>
                                    <SelectItem value="5">Every 5 seconds</SelectItem>
                                    <SelectItem value="30">Every 30 seconds</SelectItem>
                                    <SelectItem value="60">Every minute</SelectItem>
                                    <SelectItem value="300">Every 5 minutes</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Note: Auto-refresh will be implemented in a future update
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-8 text-muted-foreground">
                        Configure data binding first to enable options.
                    </div>
                )}
            </TabsContent>

            <TabsContent value="filters" className="space-y-4 p-4">
                {binding ? (
                    <FilterConfigurator
                        tableName={binding.tableName}
                        dataSourceId={binding.dataSourceId}
                        filters={binding.frontendFilters || []}
                        onFiltersChange={(filters) => updateBinding({ frontendFilters: filters })}
                    />
                ) : (
                    <div className="text-center py-8 text-muted-foreground">
                        Configure data binding first to enable filters.
                    </div>
                )}
            </TabsContent>

            {/* Actions Tab */}
            <TabsContent value="actions" className="space-y-4 p-4">
                <div className="text-sm text-muted-foreground text-center py-4">
                    Actions configuration coming soon.
                </div>
            </TabsContent>
        </Tabs>
    );
};
