import React, { useState, useEffect } from 'react';
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
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, X, Search } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DataTablePropertiesPanelProps {
    componentId: string;
    binding: ComponentDataBinding | null;
    onBindingUpdate: (binding: ComponentDataBinding) => void;
}

// ============ SearchColumnSelector Component ============
interface SearchColumnSelectorProps {
    tableName: string;
    selectedColumns: string[];
    onColumnsChange: (columns: string[]) => void;
}

const SearchColumnSelector: React.FC<SearchColumnSelectorProps> = ({
    tableName,
    selectedColumns,
    onColumnsChange
}) => {
    const { loadTableSchema, globalSchema } = useDataBindingStore();
    const [columns, setColumns] = useState<{ name: string; type: string }[]>([]);
    const [searchFilter, setSearchFilter] = useState('');
    const [open, setOpen] = useState(false);

    // Load columns for the table
    useEffect(() => {
        if (!tableName) return;

        // Get columns from globalSchema if available
        const gTable = globalSchema.tables.find((t: any) => t.table_name === tableName);
        if (gTable && gTable.columns) {
            setColumns(gTable.columns.map((c: any) => ({ name: c.column_name, type: c.data_type })));
        } else {
            // Fallback to loading schema
            loadTableSchema(tableName).then((schema: any) => {
                if (schema?.columns) {
                    setColumns(schema.columns.map((c: any) => ({ name: c.name, type: c.type })));
                }
            });
        }
    }, [tableName, globalSchema, loadTableSchema]);

    const toggleColumn = (columnName: string) => {
        if (selectedColumns.includes(columnName)) {
            onColumnsChange(selectedColumns.filter(c => c !== columnName));
        } else {
            onColumnsChange([...selectedColumns, columnName]);
        }
    };

    const filteredColumns = columns.filter(c =>
        c.name.toLowerCase().includes(searchFilter.toLowerCase())
    );

    const textColumns = filteredColumns.filter(c =>
        ['text', 'character varying', 'varchar', 'char'].includes(c.type)
    );

    const otherColumns = filteredColumns.filter(c =>
        !['text', 'character varying', 'varchar', 'char'].includes(c.type)
    );

    return (
        <div className="space-y-2 pt-2">
            <Label className="text-sm text-muted-foreground">
                Searchable Columns (leave empty for all text columns)
            </Label>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className="w-full justify-between h-auto min-h-9 px-3 py-2"
                    >
                        <div className="flex flex-wrap gap-1 items-center">
                            {selectedColumns.length === 0 ? (
                                <span className="text-muted-foreground">All text columns</span>
                            ) : (
                                selectedColumns.map(col => (
                                    <Badge key={col} variant="secondary" className="text-xs">
                                        {col}
                                        <X
                                            className="w-3 h-3 ml-1 cursor-pointer hover:text-destructive"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleColumn(col);
                                            }}
                                        />
                                    </Badge>
                                ))
                            )}
                        </div>
                        <ChevronDown className="w-4 h-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                    <div className="p-2 border-b">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search columns..."
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                                className="pl-8 h-8"
                            />
                        </div>
                    </div>
                    <ScrollArea className="h-[200px]">
                        <div className="p-2 space-y-1">
                            {textColumns.length > 0 && (
                                <>
                                    <div className="text-xs font-medium text-muted-foreground px-2 py-1">
                                        Text Columns
                                    </div>
                                    {textColumns.map(col => (
                                        <label
                                            key={col.name}
                                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer"
                                        >
                                            <Checkbox
                                                checked={selectedColumns.includes(col.name)}
                                                onCheckedChange={() => toggleColumn(col.name)}
                                            />
                                            <span className="text-sm">{col.name}</span>
                                            <Badge variant="outline" className="text-[10px] ml-auto">
                                                {col.type}
                                            </Badge>
                                        </label>
                                    ))}
                                </>
                            )}
                            {otherColumns.length > 0 && (
                                <>
                                    <div className="text-xs font-medium text-muted-foreground px-2 py-1 mt-2">
                                        Other Columns
                                    </div>
                                    {otherColumns.map(col => (
                                        <label
                                            key={col.name}
                                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer"
                                        >
                                            <Checkbox
                                                checked={selectedColumns.includes(col.name)}
                                                onCheckedChange={() => toggleColumn(col.name)}
                                            />
                                            <span className="text-sm">{col.name}</span>
                                            <Badge variant="outline" className="text-[10px] ml-auto">
                                                {col.type}
                                            </Badge>
                                        </label>
                                    ))}
                                </>
                            )}
                            {filteredColumns.length === 0 && (
                                <div className="text-center py-4 text-muted-foreground text-sm">
                                    No columns found
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                    {selectedColumns.length > 0 && (
                        <div className="p-2 border-t">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full text-xs"
                                onClick={() => onColumnsChange([])}
                            >
                                Clear selection
                            </Button>
                        </div>
                    )}
                </PopoverContent>
            </Popover>
        </div>
    );
};


export const DataTablePropertiesPanel: React.FC<DataTablePropertiesPanelProps> = ({
    componentId,
    binding,
    onBindingUpdate
}) => {
    const defaultBinding: ComponentDataBinding = {
        componentId: componentId,
        dataSourceId: '',
        tableName: '',
        columnOverrides: {},
        columnOrder: [],
        filtering: { searchEnabled: false, filters: {} },
        pagination: { enabled: true, pageSize: 20, page: 0 },
        sorting: { enabled: true },
        refreshInterval: 0
    };

    const effectiveBinding = binding || defaultBinding;

    const updateBinding = (updates: Partial<ComponentDataBinding>) => {
        onBindingUpdate({ ...effectiveBinding, ...updates });
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
                                <SearchColumnSelector
                                    tableName={binding.tableName}
                                    selectedColumns={binding.searchColumns || []}
                                    onColumnsChange={(columns) => updateBinding({ searchColumns: columns.length > 0 ? columns : undefined })}
                                />
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
