import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X } from 'lucide-react';
import { FilterConfig } from '@/hooks/data/useSimpleData';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { databaseApi } from '@/services/database-api';
import { Checkbox } from '@/components/ui/checkbox';

interface FilterConfiguratorProps {
    tableName: string;
    dataSourceId?: string;
    filters: FilterConfig[];
    onFiltersChange: (filters: FilterConfig[]) => void;
}

interface FilterItemProps {
    filter: FilterConfig;
    columns: { name: string; type: string }[];
    onUpdate: (filter: FilterConfig) => void;
    onRemove: () => void;
}

const FilterItem: React.FC<FilterItemProps> = ({
    filter,
    columns,
    onUpdate,
    onRemove
}) => {
    const [options, setOptions] = useState<string[]>([]);
    const [loadingOptions, setLoadingOptions] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Auto-fetch options for dropdown/multiselect filters
    useEffect(() => {
        if (
            filter.column &&
            (filter.filterType === 'dropdown' || filter.filterType === 'multiselect')
        ) {
            setLoadingOptions(true);
            databaseApi
                .fetchDistinctValues(filter.column.split('.')[0], filter.column.split('.').pop() || filter.column)
                .then((result) => {
                    if (result.success) {
                        setOptions(result.data || []);
                    }
                    setLoadingOptions(false);
                })
                .catch(() => {
                    setLoadingOptions(false);
                });
        }
    }, [filter.column, filter.filterType]);

    const filteredOptions = options.filter(opt =>
        opt.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="p-3 border rounded-lg space-y-3 bg-background">
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 grid grid-cols-2 gap-2">
                    {/* Column Selection */}
                    <div>
                        <Label className="text-xs">Column</Label>
                        <Select
                            value={filter.column}
                            onValueChange={(column) => onUpdate({ ...filter, column })}
                        >
                            <SelectTrigger className="h-8">
                                <SelectValue placeholder="Select column" />
                            </SelectTrigger>
                            <SelectContent>
                                {columns.map((col) => (
                                    <SelectItem key={col.name} value={col.name}>
                                        {col.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Filter Type */}
                    <div>
                        <Label className="text-xs">Filter Type</Label>
                        <Select
                            value={filter.filterType}
                            onValueChange={(filterType: any) => onUpdate({ ...filter, filterType })}
                        >
                            <SelectTrigger className="h-8">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="text">Text Input</SelectItem>
                                <SelectItem value="dropdown">Dropdown</SelectItem>
                                <SelectItem value="multiselect">Multi-Select</SelectItem>
                                <SelectItem value="number">Number Range</SelectItem>
                                <SelectItem value="dateRange">Date Range</SelectItem>
                                <SelectItem value="boolean">Boolean Toggle</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Remove Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive mt-4"
                    onClick={onRemove}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Filter Options Preview (for dropdown/multiselect) */}
            {(filter.filterType === 'dropdown' || filter.filterType === 'multiselect') && (
                <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                        {loadingOptions ? 'Loading options...' : `${options.length} options available`}
                    </Label>

                    {options.length > 0 && (
                        <div className="space-y-2">
                            <Input
                                placeholder="Search options..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-7 text-xs"
                            />
                            <div className="max-h-32 overflow-y-auto border rounded p-2 space-y-1">
                                {filteredOptions.slice(0, 10).map((opt, idx) => (
                                    <div key={idx} className="text-xs px-2 py-1 hover:bg-muted rounded">
                                        {opt}
                                    </div>
                                ))}
                                {filteredOptions.length > 10 && (
                                    <div className="text-xs text-muted-foreground px-2 py-1">
                                        +{filteredOptions.length - 10} more
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Date Range Configuration */}
            {filter.filterType === 'dateRange' && (
                <div className="space-y-2">
                    <Label className="text-xs">Last X Days</Label>
                    <Input
                        type="number"
                        placeholder="e.g., 7, 30, 90"
                        value={filter.value?.lastDays || ''}
                        onChange={(e) => onUpdate({
                            ...filter,
                            value: { lastDays: parseInt(e.target.value) || undefined }
                        })}
                        className="h-7 text-xs"
                    />
                </div>
            )}

            {/* Custom Label */}
            <div>
                <Label className="text-xs text-muted-foreground">
                    Custom Label (optional)
                </Label>
                <Input
                    placeholder={filter.column || 'Filter label'}
                    value={filter.label || ''}
                    onChange={(e) => onUpdate({ ...filter, label: e.target.value })}
                    className="h-7 text-xs"
                />
            </div>
        </div>
    );
};

export const FilterConfigurator: React.FC<FilterConfiguratorProps> = ({
    tableName,
    dataSourceId,
    filters,
    onFiltersChange
}) => {
    const { loadTableSchema } = useDataBindingStore();
    const [schema, setSchema] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    // Load schema to get available columns
    useEffect(() => {
        if (tableName) {
            setLoading(true);
            loadTableSchema(tableName)
                .then((result) => {
                    setSchema(result);
                    setLoading(false);
                })
                .catch(() => {
                    setSchema(null);
                    setLoading(false);
                });
        }
    }, [tableName, loadTableSchema]);

    const addFilter = () => {
        const newFilter: FilterConfig = {
            id: `filter-${Date.now()}`,
            column: '',
            filterType: 'text'
        };
        onFiltersChange([...filters, newFilter]);
    };

    const updateFilter = (index: number, updatedFilter: FilterConfig) => {
        const newFilters = [...filters];
        newFilters[index] = updatedFilter;
        onFiltersChange(newFilters);
    };

    const removeFilter = (index: number) => {
        const newFilters = filters.filter((_, i) => i !== index);
        onFiltersChange(newFilters);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-4">
                <div className="text-sm text-muted-foreground">Loading columns...</div>
            </div>
        );
    }

    if (!schema) {
        return (
            <div className="text-sm text-muted-foreground p-4">
                Select a table to configure filters
            </div>
        );
    }

    const columns = schema.columns || [];

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label>Frontend Filters</Label>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={addFilter}
                    className="h-8"
                >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Filter
                </Button>
            </div>

            {filters.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg">
                    No filters configured. Click "Add Filter" to create one.
                </div>
            ) : (
                <div className="space-y-3">
                    {filters.map((filter, index) => (
                        <FilterItem
                            key={filter.id}
                            filter={filter}
                            columns={columns}
                            onUpdate={(updated) => updateFilter(index, updated)}
                            onRemove={() => removeFilter(index)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
