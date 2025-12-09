import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, X, Filter, ChevronDown, Search } from 'lucide-react';
import { FilterConfig } from '@/hooks/data/useSimpleData';
import { databaseApi } from '@/services/database-api';
import { format } from 'date-fns';

interface FilterBarProps {
    filters: FilterConfig[];
    tableName: string;
    onFilterValuesChange: (updatedFilters: FilterConfig[]) => void;
}

interface FilterInputProps {
    filter: FilterConfig;
    tableName: string;
    onValueChange: (value: any) => void;
}

// Text filter input
const TextFilterInput: React.FC<FilterInputProps> = ({ filter, onValueChange }) => (
    <Input
        placeholder={filter.label || filter.column}
        value={(filter.value as string) || ''}
        onChange={(e) => onValueChange(e.target.value || undefined)}
        className="h-8 w-40"
    />
);

// Dropdown filter with embedded search
const DropdownFilterInput: React.FC<FilterInputProps> = ({ filter, tableName, onValueChange }) => {
    const [options, setOptions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (filter.column) {
            setLoading(true);
            let queryTable = tableName;
            let queryColumn = filter.column;

            if (filter.column.includes('.')) {
                const [relTable, relCol] = filter.column.split('.');
                queryTable = relTable;
                queryColumn = relCol;
            }

            databaseApi.fetchDistinctValues(queryTable, queryColumn)
                .then((result) => {
                    if (result.success) {
                        setOptions(result.data || []);
                    }
                    setLoading(false);
                })
                .catch(() => setLoading(false));
        }
    }, [filter.column, tableName]);

    const filteredOptions = options.filter(opt =>
        opt.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const displayLabel = filter.label || filter.column;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" className="h-8 w-40 justify-between px-2">
                    <span className={filter.value ? '' : 'text-muted-foreground'}>
                        {filter.value || displayLabel}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-0" align="start">
                <div className="p-2 border-b">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 h-8"
                        />
                    </div>
                </div>
                <ScrollArea className="h-[180px]">
                    <div className="p-1">
                        <button
                            className="w-full text-left px-2 py-1.5 hover:bg-muted rounded text-sm"
                            onClick={() => { onValueChange(undefined); setOpen(false); }}
                        >
                            All
                        </button>
                        {loading ? (
                            <div className="text-sm text-muted-foreground p-2">Loading...</div>
                        ) : (
                            filteredOptions.map((opt) => (
                                <button
                                    key={opt}
                                    className={`w-full text-left px-2 py-1.5 hover:bg-muted rounded text-sm ${filter.value === opt ? 'bg-muted font-medium' : ''}`}
                                    onClick={() => { onValueChange(opt); setOpen(false); }}
                                >
                                    {opt}
                                </button>
                            ))
                        )}
                        {!loading && filteredOptions.length === 0 && (
                            <div className="text-sm text-muted-foreground p-2 text-center">No results</div>
                        )}
                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
};

// Multi-select filter with embedded search
const MultiselectFilterInput: React.FC<FilterInputProps> = ({ filter, tableName, onValueChange }) => {
    const [options, setOptions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const selectedValues = (filter.value as string[]) || [];

    useEffect(() => {
        if (filter.column) {
            setLoading(true);
            let queryTable = tableName;
            let queryColumn = filter.column;

            if (filter.column.includes('.')) {
                const [relTable, relCol] = filter.column.split('.');
                queryTable = relTable;
                queryColumn = relCol;
            }

            databaseApi.fetchDistinctValues(queryTable, queryColumn)
                .then((result) => {
                    if (result.success) {
                        setOptions(result.data || []);
                    }
                    setLoading(false);
                })
                .catch(() => setLoading(false));
        }
    }, [filter.column, tableName]);

    const toggleValue = (val: string) => {
        if (selectedValues.includes(val)) {
            const newVals = selectedValues.filter(v => v !== val);
            onValueChange(newVals.length > 0 ? newVals : undefined);
        } else {
            onValueChange([...selectedValues, val]);
        }
    };

    const filteredOptions = options.filter(opt =>
        opt.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const displayLabel = filter.label || filter.column;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" className="h-8 w-40 justify-between px-2">
                    <div className="flex items-center gap-1 truncate">
                        {selectedValues.length === 0 ? (
                            <span className="text-muted-foreground">{displayLabel}</span>
                        ) : (
                            <span className="text-xs">{selectedValues.length} selected</span>
                        )}
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-0" align="start">
                <div className="p-2 border-b">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 h-8"
                        />
                    </div>
                </div>
                <ScrollArea className="h-[180px]">
                    <div className="p-2 space-y-1">
                        {loading ? (
                            <div className="text-sm text-muted-foreground p-2">Loading...</div>
                        ) : (
                            filteredOptions.map((opt) => (
                                <label
                                    key={opt}
                                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer"
                                >
                                    <Checkbox
                                        checked={selectedValues.includes(opt)}
                                        onCheckedChange={() => toggleValue(opt)}
                                    />
                                    <span className="text-sm truncate">{opt}</span>
                                </label>
                            ))
                        )}
                        {!loading && filteredOptions.length === 0 && (
                            <div className="text-sm text-muted-foreground p-2 text-center">No results</div>
                        )}
                    </div>
                </ScrollArea>
                {selectedValues.length > 0 && (
                    <div className="p-2 border-t">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => onValueChange(undefined)}
                        >
                            Clear all
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
};

// Number range filter
const NumberFilterInput: React.FC<FilterInputProps> = ({ filter, onValueChange }) => {
    const value = (filter.value as { min?: number; max?: number }) || {};

    return (
        <div className="flex items-center gap-1">
            <Input
                type="number"
                placeholder="Min"
                value={value.min ?? ''}
                onChange={(e) => {
                    const newVal = e.target.value ? { ...value, min: parseFloat(e.target.value) } : { ...value, min: undefined };
                    if (newVal.min === undefined && newVal.max === undefined) {
                        onValueChange(undefined);
                    } else {
                        onValueChange(newVal);
                    }
                }}
                className="h-8 w-20"
            />
            <span className="text-muted-foreground">-</span>
            <Input
                type="number"
                placeholder="Max"
                value={value.max ?? ''}
                onChange={(e) => {
                    const newVal = e.target.value ? { ...value, max: parseFloat(e.target.value) } : { ...value, max: undefined };
                    if (newVal.min === undefined && newVal.max === undefined) {
                        onValueChange(undefined);
                    } else {
                        onValueChange(newVal);
                    }
                }}
                className="h-8 w-20"
            />
        </div>
    );
};

// Date range filter (simplified - using "last X days" input)
const DateRangeFilterInput: React.FC<FilterInputProps> = ({ filter, onValueChange }) => {
    const value = (filter.value as { lastDays?: number; start?: string; end?: string }) || {};

    return (
        <div className="flex items-center gap-2">
            <Input
                type="number"
                placeholder="Last X days"
                value={value.lastDays ?? ''}
                onChange={(e) => {
                    if (e.target.value) {
                        onValueChange({ lastDays: parseInt(e.target.value) });
                    } else {
                        onValueChange(undefined);
                    }
                }}
                className="h-8 w-28"
            />
        </div>
    );
};

// Boolean filter
const BooleanFilterInput: React.FC<FilterInputProps> = ({ filter, onValueChange }) => {
    const value = filter.value as boolean | undefined;

    return (
        <Select
            value={value === undefined ? '' : value.toString()}
            onValueChange={(val) => {
                if (val === '') {
                    onValueChange(undefined);
                } else {
                    onValueChange(val === 'true');
                }
            }}
        >
            <SelectTrigger className="h-8 w-32">
                <SelectValue placeholder={filter.label || filter.column} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
            </SelectContent>
        </Select>
    );
};

// Main FilterBar component
export const FilterBar: React.FC<FilterBarProps> = ({
    filters,
    tableName,
    onFilterValuesChange
}) => {
    // Only show filters that have a column configured
    const activeFilters = filters.filter(f => f.column);

    if (activeFilters.length === 0) {
        return null;
    }

    const handleValueChange = (filterId: string, value: any) => {
        const updatedFilters = filters.map(f =>
            f.id === filterId ? { ...f, value } : f
        );
        onFilterValuesChange(updatedFilters);
    };

    const clearAllFilters = () => {
        const clearedFilters = filters.map(f => ({ ...f, value: undefined }));
        onFilterValuesChange(clearedFilters);
    };

    const hasActiveValues = filters.some(f => f.value !== undefined && f.value !== null && f.value !== '');

    const renderFilterInput = (filter: FilterConfig) => {
        const props: FilterInputProps = {
            filter,
            tableName,
            onValueChange: (value) => handleValueChange(filter.id, value)
        };

        switch (filter.filterType) {
            case 'text':
                return <TextFilterInput {...props} />;
            case 'dropdown':
                return <DropdownFilterInput {...props} />;
            case 'multiselect':
                return <MultiselectFilterInput {...props} />;
            case 'number':
                return <NumberFilterInput {...props} />;
            case 'dateRange':
                return <DateRangeFilterInput {...props} />;
            case 'boolean':
                return <BooleanFilterInput {...props} />;
            default:
                return <TextFilterInput {...props} />;
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/30 rounded-lg border">
            <div className="flex items-center gap-1.5 text-muted-foreground">
                <Filter className="h-4 w-4" />
                <span className="text-sm font-medium">Filters:</span>
            </div>

            {activeFilters.map((filter) => (
                <div key={filter.id} className="flex items-center gap-1">
                    {renderFilterInput(filter)}
                </div>
            ))}

            {hasActiveValues && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground hover:text-destructive"
                    onClick={clearAllFilters}
                >
                    <X className="h-3 w-3 mr-1" />
                    Clear all
                </Button>
            )}
        </div>
    );
};
