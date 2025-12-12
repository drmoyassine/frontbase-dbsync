import React, { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronLeft, ChevronRight, Search, Settings, ArrowUpDown, Check, X, Pencil } from 'lucide-react';
import { useSimpleData } from '@/hooks/useSimpleData';
import { cn } from '@/lib/utils';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { FilterConfig } from '@/hooks/data/useSimpleData';
import { FilterBar } from './FilterBar';

interface ComponentDataBinding {
  componentId: string;
  dataSourceId: string;
  tableName: string;
  refreshInterval?: number;
  pagination: {
    enabled: boolean;
    pageSize: number;
    page: number;
  };
  sorting: {
    enabled: boolean;
    column?: string;
    direction?: 'asc' | 'desc';
  };
  filtering: {
    searchEnabled: boolean;
    filters: Record<string, any>;
  };
  columnOverrides: Record<string, {
    displayName?: string;
    visible?: boolean;
    displayType?: 'text' | 'badge' | 'date' | 'boolean' | 'currency' | 'percentage' | 'image' | 'link';
    dateFormat?: string;
  }>;
  columnOrder?: string[];
  searchColumns?: string[];
  frontendFilters?: FilterConfig[];
}

interface UniversalDataTableProps {
  componentId: string;
  binding?: ComponentDataBinding | null;
  className?: string;
  onConfigureBinding?: () => void;
  onColumnOverrideChange?: (columnName: string, updates: any) => void; // For builder mode column editing
}

export function UniversalDataTable({
  componentId,
  binding: bindingProp,
  className,
  onConfigureBinding,
  onColumnOverrideChange
}: UniversalDataTableProps) {
  // Detect builder mode
  const isBuilderMode = typeof window !== 'undefined' && window.location.pathname.startsWith('/builder');
  // Get binding from store as fallback if props don't have it
  const { getComponentBinding } = useDataBindingStore();
  const binding = bindingProp || getComponentBinding(componentId);



  const {
    data,
    count,
    loading,
    error,
    schema,
    refetch,
    setFilters,
    setSorting,
    setPagination,
    setSearchQuery,
    currentSorting,
    currentPagination
  } = useSimpleData({
    componentId,
    binding,
    autoFetch: true
  });

  const [searchInput, setSearchInput] = useState('');
  const [runtimeFilters, setRuntimeFilters] = useState<FilterConfig[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [columnPopoverOpen, setColumnPopoverOpen] = useState(false);

  // Sync runtimeFilters with binding.frontendFilters
  useEffect(() => {
    if (binding?.frontendFilters) {
      setRuntimeFilters(binding.frontendFilters);
    }
  }, [binding?.frontendFilters]);

  // Update filters when runtime filter values change
  const handleFilterValuesChange = (updatedFilters: FilterConfig[]) => {
    setRuntimeFilters(updatedFilters);
    // Convert to format expected by setFilters: { [column]: value }
    const filterRecord: Record<string, any> = {};
    updatedFilters.forEach(f => {
      if (f.column && f.value !== undefined && f.value !== null && f.value !== '') {
        filterRecord[f.column] = { filterType: f.filterType, value: f.value };
      }
    });
    setFilters(filterRecord);
  };

  const handleSort = (column: string) => {
    console.log('[UniversalDataTable] handleSort triggered for:', column, 'currentSorting:', currentSorting);
    if (!binding?.sorting.enabled) return;

    // Use currentSorting from useSimpleData (local state) instead of binding prop
    const currentDirection = currentSorting?.column === column ? currentSorting?.direction : undefined;
    const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';
    console.log('[UniversalDataTable] Toggle:', currentDirection, '->', newDirection);
    setSorting(column, newDirection);
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setSearchQuery(value);
  };

  const getBadgeColor = (value: string) => {
    const colors = [
      "bg-red-100 text-red-800 hover:bg-red-100/80",
      "bg-orange-100 text-orange-800 hover:bg-orange-100/80",
      "bg-amber-100 text-amber-800 hover:bg-amber-100/80",
      "bg-yellow-100 text-yellow-800 hover:bg-yellow-100/80",
      "bg-lime-100 text-lime-800 hover:bg-lime-100/80",
      "bg-green-100 text-green-800 hover:bg-green-100/80",
      "bg-emerald-100 text-emerald-800 hover:bg-emerald-100/80",
      "bg-teal-100 text-teal-800 hover:bg-teal-100/80",
      "bg-cyan-100 text-cyan-800 hover:bg-cyan-100/80",
      "bg-sky-100 text-sky-800 hover:bg-sky-100/80",
      "bg-blue-100 text-blue-800 hover:bg-blue-100/80",
      "bg-indigo-100 text-indigo-800 hover:bg-indigo-100/80",
      "bg-violet-100 text-violet-800 hover:bg-violet-100/80",
      "bg-purple-100 text-purple-800 hover:bg-purple-100/80",
      "bg-fuchsia-100 text-fuchsia-800 hover:bg-fuchsia-100/80",
      "bg-pink-100 text-pink-800 hover:bg-pink-100/80",
      "bg-rose-100 text-rose-800 hover:bg-rose-100/80",
    ];

    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = value.charCodeAt(i) + ((hash << 5) - hash);
    }

    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const formatValue = (value: any, columnName: string, row?: any): React.ReactNode => {
    // Handle related columns (e.g., "institutions.name")
    let actualValue = value;
    if (row && columnName.includes('.')) {
      const [tableName, colName] = columnName.split('.');
      let relationData = row[tableName];

      // Fallback: Case-insensitive lookup if direct access fails
      if (!relationData) {
        const lowerTableName = tableName.toLowerCase();
        const matchingKey = Object.keys(row).find(k => k.toLowerCase() === lowerTableName);
        if (matchingKey) {
          relationData = row[matchingKey];
        }
      }

      // Handle array response (common in PostgREST for relations) or single object
      if (Array.isArray(relationData)) {
        actualValue = relationData[0]?.[colName];
      } else {
        actualValue = relationData?.[colName];
      }
    }

    if (actualValue === null || actualValue === undefined) {
      return <span className="text-muted-foreground">—</span>;
    }

    const columnConfig = binding?.columnOverrides?.[columnName];
    const displayType = columnConfig?.displayType || 'text';

    switch (displayType) {
      case 'badge':
        return <Badge variant="outline" className={cn("border-0 font-medium", getBadgeColor(String(actualValue)))}>{String(actualValue)}</Badge>;
      case 'boolean':
        // Render boolean as tick or X
        const boolVal = actualValue === true || actualValue === 'true' || actualValue === 1;
        return boolVal ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <X className="h-4 w-4 text-red-500" />
        );
      case 'date':
        // Use custom date format if specified
        const dateFormat = columnConfig?.dateFormat || 'MMM dd, yyyy';
        const dateVal = new Date(actualValue);
        if (isNaN(dateVal.getTime())) return String(actualValue);

        if (dateFormat === 'relative') {
          // Relative date formatting
          const now = new Date();
          const diffMs = now.getTime() - dateVal.getTime();
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          if (diffDays === 0) return 'Today';
          if (diffDays === 1) return 'Yesterday';
          if (diffDays < 7) return `${diffDays} days ago`;
          if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
          if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
          return `${Math.floor(diffDays / 365)} years ago`;
        }

        // Standard date formats using Intl
        const formatMap: Record<string, Intl.DateTimeFormatOptions> = {
          'MMM dd, yyyy': { month: 'short', day: '2-digit', year: 'numeric' },
          'dd/MM/yyyy': { day: '2-digit', month: '2-digit', year: 'numeric' },
          'MM/dd/yyyy': { month: '2-digit', day: '2-digit', year: 'numeric' },
          'yyyy-MM-dd': { year: 'numeric', month: '2-digit', day: '2-digit' },
          'dd MMM yyyy': { day: '2-digit', month: 'short', year: 'numeric' },
          'EEEE, MMM dd': { weekday: 'long', month: 'short', day: '2-digit' }
        };

        const options = formatMap[dateFormat] || formatMap['MMM dd, yyyy'];

        // Handle locale-specific formatting
        if (dateFormat === 'dd/MM/yyyy') {
          return dateVal.toLocaleDateString('en-GB', options);
        } else if (dateFormat === 'yyyy-MM-dd') {
          return dateVal.toISOString().split('T')[0];
        }

        return dateVal.toLocaleDateString('en-US', options);
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(Number(actualValue));
      case 'percentage':
        return `${(Number(actualValue) * 100).toFixed(1)}%`;
      case 'image':
        return (
          <img
            src={String(actualValue)}
            alt="Image"
            className="w-8 h-8 rounded object-cover"
          />
        );
      case 'link':
        return (
          <a
            href={String(actualValue)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {String(actualValue)}
          </a>
        );
      default:
        if (typeof actualValue === 'object') {
          return <code className="text-xs">{JSON.stringify(actualValue)}</code>;
        }
        return String(actualValue);
    }
  };

  const getVisibleColumns = () => {
    if (!schema) return [];

    let columns: any[] = [];

    // 1. Get all potential columns (base + related from overrides)
    const allColumnsMap = new Map<string, any>();

    // Add base columns
    schema.columns.forEach((col: any) => {
      allColumnsMap.set(col.name, col);
    });

    // Helper to ensure related or virtual column exists in map
    const ensureVirtualColumn = (key: string) => {
      if (!allColumnsMap.has(key)) {
        if (key.includes('.')) {
          const [tableName, columnName] = key.split('.');
          allColumnsMap.set(key, {
            name: key,
            type: 'text',
            relatedTable: tableName,
            relatedColumn: columnName
          });
        } else {
          // Treat as virtual column (e.g. from RPC or calculated)
          allColumnsMap.set(key, {
            name: key,
            type: 'text',
            isVirtual: true
          });
        }
      }
    };

    // Add virtual/related columns from overrides
    if (binding?.columnOverrides) {
      Object.keys(binding.columnOverrides).forEach(key => {
        ensureVirtualColumn(key);
      });
    }

    // 2. Determine visible columns based on overrides
    // Columns are OFF by default - must have explicit visible: true
    // UNLESS it's a virtual column from RPC that we want to show?
    // Actually, overrides follow standard rules: hidden unless visible: true/undefined logic?
    // Wait, typical logic is: if explicitly hidden=true, hide. If visible=false, hide.
    // The current logic says: `return override?.visible === true;` -> Hidden by default?
    // Let's check how config panel sets it. Usually toggle sets `hidden: false`.
    // Actually, if I look at UserManagementTable:
    // [config.columnMapping.authUserIdColumn]: { hidden: false, ... }
    // 'email': { ... } -> visible is undefined.

    // Logic check: `override?.visible === true` means everything is HIDDEN unless explicitly set to visible: true.
    // But in UserManagementTable I didn't set `visible: true` for 'email', I just set displayName etc.
    // So 'email' is hidden by default. Use `hidden` property instead?

    // Let's check ComponentDataBinding interface
    // visible?: boolean;
    // But UniversalDataTable uses `hidden` in other places? No, interface says `visible`.

    // In UserManagementTable I used `hidden: false` or `hidden: true`.
    // But the interface in UniversalDataTable defines `visible?: boolean`.
    // I need to align them.
    // UserManagementTable passes `hidden`. UniversalDataTable expects `visible`.

    // I will update UniversalDataTable to handle `hidden` as well (legacy/compat).
    const isVisible = (key: string) => {
      const override = binding?.columnOverrides?.[key] as any;
      if (override?.hidden !== undefined) return !override.hidden; // Respect 'hidden' prop if present
      if (override?.visible !== undefined) return override.visible;
      return false; // Default hidden if neither set (current behavior)
    };

    const visibleKeys = new Set<string>();
    allColumnsMap.forEach((col, key) => {
      if (isVisible(key)) {
        visibleKeys.add(key);
      }
    });

    // 3. Sort based on columnOrder
    if (binding?.columnOrder && binding.columnOrder.length > 0) {
      // Add columns in order
      binding.columnOrder.forEach(key => {
        // Ensure related columns in order exist in map (robustness)
        ensureVirtualColumn(key);

        // Re-check visibility for potentially newly added columns
        if (isVisible(key)) {
          // Note: We don't check visibleKeys here strictly because we might have just added it to map
          const col = allColumnsMap.get(key);
          if (col) {
            columns.push(col);
            visibleKeys.delete(key);
          }
        }
      });
      // Add remaining visible columns (fallback for those not in order list)
      visibleKeys.forEach(key => {
        const col = allColumnsMap.get(key);
        if (col) columns.push(col);
      });
    } else {
      // Default order: Base columns then Related columns
      schema.columns.forEach((col: any) => {
        if (visibleKeys.has(col.name)) {
          columns.push(col);
          visibleKeys.delete(col.name);
        }
      });
      // Then remaining (foreign)
      visibleKeys.forEach(key => {
        const col = allColumnsMap.get(key);
        if (col) columns.push(col);
      });
    }

    return columns;
  };

  const getColumnDisplayName = (columnName: string) => {
    const override = binding?.columnOverrides?.[columnName];
    return override?.displayName || columnName;
  };

  // Column Settings Popover for builder mode
  const renderColumnWithSettings = (columnName: string, content: React.ReactNode, isHeader: boolean = false) => {
    if (!isBuilderMode || !onColumnOverrideChange) {
      return content;
    }

    const columnConfig = binding?.columnOverrides?.[columnName] || {};

    return (
      <Popover>
        <PopoverTrigger asChild>
          <div
            className={cn(
              "cursor-pointer hover:bg-primary/5 transition-colors -m-2 p-2 rounded",
              isHeader && "flex items-center gap-1"
            )}
            title="Click to configure column"
          >
            {content}
            {isHeader && <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium leading-none">Column Settings</h4>
              <p className="text-sm text-muted-foreground">
                Configure how {columnName} appears in the table.
              </p>
            </div>
            <div className="grid gap-3">
              <div className="grid grid-cols-3 items-center gap-4">
                <Label>Label</Label>
                <Input
                  value={columnConfig.displayName || ''}
                  onChange={(e) => onColumnOverrideChange(columnName, { displayName: e.target.value })}
                  placeholder={columnName}
                  className="col-span-2 h-8"
                />
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <Label>Type</Label>
                <Select
                  value={columnConfig.displayType || 'text'}
                  onValueChange={(displayType) => onColumnOverrideChange(columnName, { displayType })}
                >
                  <SelectTrigger className="col-span-2 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="badge">Badge</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="boolean">Boolean (✓/✗)</SelectItem>
                    <SelectItem value="currency">Currency</SelectItem>
                    <SelectItem value="percentage">%</SelectItem>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="link">Link</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {columnConfig.displayType === 'date' && (
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label>Format</Label>
                  <Select
                    value={columnConfig.dateFormat || 'MMM dd, yyyy'}
                    onValueChange={(dateFormat) => onColumnOverrideChange(columnName, { dateFormat })}
                  >
                    <SelectTrigger className="col-span-2 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MMM dd, yyyy">Dec 10, 2024</SelectItem>
                      <SelectItem value="dd/MM/yyyy">10/12/2024</SelectItem>
                      <SelectItem value="MM/dd/yyyy">12/10/2024</SelectItem>
                      <SelectItem value="yyyy-MM-dd">2024-12-10</SelectItem>
                      <SelectItem value="dd MMM yyyy">10 Dec 2024</SelectItem>
                      <SelectItem value="relative">Relative</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  // Render loading state if schema is fetching
  if (binding?.tableName && !schema) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Data Table
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-sm text-muted-foreground">Loading table schema...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!binding || !binding.tableName) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Data Table
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No data source configured. Select this component to configure data binding.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Data Table
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-destructive py-8">
            Error loading data: {error}
            <div className="mt-2">
              <Button variant="outline" onClick={refetch}>
                Retry
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const visibleColumns = getVisibleColumns();

  if (visibleColumns.length === 0) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle>Data Table</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No columns visible. Configure columns in the properties panel.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Data Table
        </CardTitle>

        {binding.filtering?.searchEnabled && (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
      </CardHeader>

      {/* Filter Bar */}
      {runtimeFilters.length > 0 && (
        <div className="px-6 pb-4">
          <FilterBar
            filters={runtimeFilters}
            tableName={binding.tableName}
            onFilterValuesChange={handleFilterValuesChange}
          />
        </div>
      )}

      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : (
          <>
            <div className="rounded-md border overflow-x-auto">
              <Table className="min-w-max">
                <TableHeader>
                  <TableRow>
                    {visibleColumns.map((column: any) => (
                      <TableHead key={column.name} className="whitespace-nowrap group">
                        {renderColumnWithSettings(
                          column.name,
                          <div className="flex items-center space-x-1">
                            <span>{getColumnDisplayName(column.name)}</span>
                            {binding.sorting?.enabled && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto p-0"
                                onClick={(e) => { e.stopPropagation(); handleSort(column.name); }}
                              >
                                <ArrowUpDown className="h-3 w-3" />
                              </Button>
                            )}
                          </div>,
                          true
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr:nth-child(even)]:bg-muted/50">
                  {data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={visibleColumns.length} className="text-center py-8">
                        No data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((row, index) => (
                      <TableRow key={index} className="h-12">
                        {visibleColumns.map((column: any) => (
                          <TableCell key={column.name} className="max-w-[200px] truncate whitespace-nowrap py-2">
                            {formatValue(row[column.name], column.name, row)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {binding.pagination?.enabled && (
              <div className="flex items-center justify-between px-2 py-4">
                <div className="text-sm text-muted-foreground">
                  {(() => {
                    const page = currentPagination.page;
                    const pageSize = currentPagination.pageSize;
                    const start = count === 0 ? 0 : page * pageSize + 1;
                    const end = Math.min((page + 1) * pageSize, count);
                    const totalPages = Math.ceil(count / pageSize);

                    return `Showing ${start}-${end} of ${count} entries (Page ${page + 1} of ${totalPages || 1})`;
                  })()}
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(Math.max(0, currentPagination.page - 1))}
                    disabled={currentPagination.page === 0 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(currentPagination.page + 1)}
                    disabled={(currentPagination.page + 1) * currentPagination.pageSize >= count || loading}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
