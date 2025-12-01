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

    if (!binding) {
        return (
            <div className="space-y-4 p-4">
                <p className="text-sm text-muted-foreground">
                    No data binding configured. Configure a data source and table to get started.
                </p>
            </div>
        );
    }

    return (
        <Tabs defaultValue="binding" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="binding">Data Binding</TabsTrigger>
                <TabsTrigger value="options">Options</TabsTrigger>
                <TabsTrigger value="filters">Filters</TabsTrigger>
            </TabsList>

            {/* Data Binding Tab */}
            <TabsContent value="binding" className="space-y-4 p-4">
                <div className="space-y-4">
                    <div>
                        <Label>Data Source</Label>
                        <DataSourceSelector
                            value={binding.dataSourceId}
                            onValueChange={(value) => updateBinding({ dataSourceId: value })}
                        />
                    </div>

                    <div>
                        <Label>Table</Label>
                        <TableSelector
                            value={binding.tableName}
                            onValueChange={(value) => updateBinding({ tableName: value })}
                            dataSourceId={binding.dataSourceId}
                        />
                    </div>

                    {binding.tableName && (
                        <div className="pt-4 border-t">
                            <Label className="text-base font-semibold mb-3 block">Columns</Label>
                            <CompactColumnConfigurator
                                tableName={binding.tableName}
                                dataSourceId={binding.dataSourceId}
                                columnOverrides={binding.columnOverrides || {}}
                                columnOrder={binding.columnOrder}
                                onColumnOverridesChange={(overrides) => updateBinding({ columnOverrides: overrides })}
                                onColumnOrderChange={(order) => updateBinding({ columnOrder: order })}
                            />
                        </div>
                    )}
                </div>
            </TabsContent>

            {/* Options Tab */}
            <TabsContent value="options" className="space-y-4 p-4">
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
            </TabsContent>

            {/* Filters Tab */}
            <TabsContent value="filters" className="space-y-4 p-4">
                <FilterConfigurator
                    tableName={binding.tableName}
                    dataSourceId={binding.dataSourceId}
                    filters={binding.frontendFilters || []}
                    onFiltersChange={(filters) => updateBinding({ frontendFilters: filters })}
                />
            </TabsContent>
        </Tabs>
    );
};
