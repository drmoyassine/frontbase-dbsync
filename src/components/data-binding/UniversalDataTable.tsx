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
    if (!binding?.sorting.enabled) return;

    const currentDirection = binding.sorting.column === column ? binding.sorting.direction : undefined;
    const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';
    setSorting(column, newDirection);
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setSearchQuery(value);
  };

  const formatValue = (value: any, columnName: string): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground">—</span>;
    }

    const columnConfig = binding?.columnOverrides?.[columnName];
    const displayType = columnConfig?.displayType || 'text';

    switch (displayType) {
      case 'badge':
        return <Badge variant="secondary">{String(value)}</Badge>;
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(Number(value));
      case 'percentage':
        return `${(Number(value) * 100).toFixed(1)}%`;
      case 'image':
        return (
          <img
            src={String(value)}
            alt="Image"
            className="w-8 h-8 rounded object-cover"
          />
        );
      case 'link':
        return (
          <a
            href={String(value)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {String(value)}
          </a>
        );
      default:
        if (typeof value === 'object') {
          return <code className="text-xs">{JSON.stringify(value)}</code>;
        }
        return String(value);
    }
  };

  const getVisibleColumns = () => {
    if (!schema) return [];
    return schema.columns.filter(col => {
      const override = binding?.columnOverrides?.[col.name];
      return override?.visible !== false;
    });
  };

  const getColumnDisplayName = (columnName: string) => {
    const override = binding?.columnOverrides?.[columnName];
    return override?.displayName || columnName;
  };

  if (!binding || !binding.tableName) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Data Table
            <Button variant="outline" size="sm" onClick={onConfigureBinding}>
              <Settings className="w-4 h-4 mr-2" />
              Configure
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No data source configured. Click Configure to set up data binding.
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
            <Button variant="outline" size="sm" onClick={onConfigureBinding}>
              <Settings className="w-4 h-4 mr-2" />
              Configure
            </Button>
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

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Data Table
          <Button variant="outline" size="sm" onClick={onConfigureBinding}>
            <Settings className="w-4 h-4 mr-2" />
            Configure
          </Button>
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
                    {visibleColumns.map((column) => (
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
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={visibleColumns.length} className="text-center py-8">
                        No data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((row, index) => (
                      <TableRow key={index}>
                        {visibleColumns.map((column) => (
                          <TableCell key={column.name}>
                            {formatValue(row[column.name], column.name)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {binding.pagination?.enabled && data.length > 0 && (
              <div className="flex items-center justify-between px-2 py-4">
                <div className="text-sm text-muted-foreground">
                  Showing {data.length} entries (Page {(binding.pagination.page || 0) + 1})
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
                    disabled={data.length < binding.pagination.pageSize || loading}
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