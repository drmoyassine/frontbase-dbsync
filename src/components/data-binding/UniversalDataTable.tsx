import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Search, Settings, ArrowUpDown } from 'lucide-react';
import { useSimpleData } from '@/hooks/useSimpleData';
import { cn } from '@/lib/utils';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { FilterConfig } from '@/hooks/data/useSimpleData';

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
    displayType?: 'text' | 'badge' | 'date' | 'currency' | 'percentage' | 'image' | 'link';
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
}

export function UniversalDataTable({
  componentId,
  binding: bindingProp,
  className,
  onConfigureBinding
}: UniversalDataTableProps) {
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
    setSearchQuery
  } = useSimpleData({
    componentId,
    binding,
    autoFetch: true
  });

  const [searchInput, setSearchInput] = useState('');

  const handleSort = (column: string) => {
    console.log('[UniversalDataTable] handleSort triggered for:', column);
    if (!binding?.sorting.enabled) return;

    const currentDirection = binding.sorting.column === column ? binding.sorting.direction : undefined;
    const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';
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
      actualValue = row[tableName]?.[colName];
    }

    if (actualValue === null || actualValue === undefined) {
      return <span className="text-muted-foreground">—</span>;
    }

    const columnConfig = binding?.columnOverrides?.[columnName];
    const displayType = columnConfig?.displayType || 'text';

    switch (displayType) {
      case 'badge':
        return <Badge variant="outline" className={cn("border-0 font-medium", getBadgeColor(String(actualValue)))}>{String(actualValue)}</Badge>;
      case 'date':
        return new Date(actualValue).toLocaleDateString();
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

    // Add related columns from overrides
    if (binding?.columnOverrides) {
      Object.keys(binding.columnOverrides).forEach(key => {
        if (key.includes('.')) {
          // Ensure we haven't already added this (unlikely for valid schema, but good safety)
          if (!allColumnsMap.has(key)) {
            const [tableName, columnName] = key.split('.');
            allColumnsMap.set(key, {
              name: key,
              type: 'text',
              relatedTable: tableName,
              relatedColumn: columnName
            });
          }
        }
      });
    }

    // 2. Determine visible columns based on overrides
    const visibleKeys = new Set<string>();
    allColumnsMap.forEach((col, key) => {
      const override = binding?.columnOverrides?.[key];
      // Default to visible if no override, unless it's a related column (which we only show if explicitly added/visible usually, 
      // but here we just check 'visible !== false' to be permissive, as the Configurator controls the specific list)
      // Actually, related columns without overrides shouldn't just appear. 
      // But the map only has related columns IF they are in overrides.
      // Base columns appear by default.
      if (override?.visible !== false) {
        visibleKeys.add(key);
      }
    });

    // 3. Sort based on columnOrder
    if (binding?.columnOrder && binding.columnOrder.length > 0) {
      // Add columns in order
      binding.columnOrder.forEach(key => {
        if (visibleKeys.has(key)) {
          columns.push(allColumnsMap.get(key));
          visibleKeys.delete(key); // Remove so we don't add again
        }
      });
      // Add remaining visible columns (fallback for those not in order list)
      visibleKeys.forEach(key => {
        const col = allColumnsMap.get(key);
        if (col) columns.push(col);
      });
    } else {
      // Default order: Base columns then Related columns
      // Actually, just use Schema order for base, then alpha for others? 
      // Let's stick to the previous behavior: Schema order first.
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

      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {visibleColumns.map((column: any) => (
                      <TableHead key={column.name}>
                        <div className="flex items-center space-x-1">
                          <span>{getColumnDisplayName(column.name)}</span>
                          {binding.sorting?.enabled && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0"
                              onClick={() => handleSort(column.name)}
                            >
                              <ArrowUpDown className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
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
                      <TableRow key={index}>
                        {visibleColumns.map((column: any) => (
                          <TableCell key={column.name}>
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
                    const page = binding.pagination.page || 0;
                    const pageSize = binding.pagination.pageSize || 20;
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
                    onClick={() => setPagination(Math.max(0, (binding.pagination.page || 0) - 1))}
                    disabled={binding.pagination.page === 0 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination((binding.pagination.page || 0) + 1)}
                    disabled={((binding.pagination.page || 0) + 1) * binding.pagination.pageSize >= count || loading}
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
