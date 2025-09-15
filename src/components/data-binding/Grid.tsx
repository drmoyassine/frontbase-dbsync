import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useUniversalData } from '@/hooks/useUniversalData';
import { ComponentDataBinding } from '@/lib/data-sources/types';

interface GridProps {
  componentId: string;
  binding?: ComponentDataBinding;
  className?: string;
  columns?: number;
  onConfigureBinding?: () => void;
}

export function Grid({ 
  componentId, 
  binding, 
  className = '', 
  columns = 3, 
  onConfigureBinding 
}: GridProps) {
  const {
    data,
    loading,
    error
  } = useUniversalData({
    componentId,
    binding: binding || null
  });

  if (!binding) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">No data binding configured</p>
            {onConfigureBinding && (
              <button
                onClick={onConfigureBinding}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Configure Data
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-${columns} gap-4 ${className}`}>
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
                <div className="h-3 bg-muted rounded w-1/4"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <p className="text-destructive">Error loading data: {error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
            >
              Retry
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            No data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatValue = (value: any, columnName: string) => {
    const columnConfig = binding?.columnOverrides?.[columnName];
    
    switch (columnConfig?.displayType) {
      case 'badge':
        return (
          <Badge variant={value === 'active' ? 'default' : 'secondary'}>
            {value?.toString()}
          </Badge>
        );
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'currency':
        return new Intl.NumberFormat('en-US', { 
          style: 'currency', 
          currency: 'USD' 
        }).format(value);
      case 'percentage':
        return `${(value * 100).toFixed(1)}%`;
      case 'image':
        return (
          <img 
            src={value} 
            alt="" 
            className="w-12 h-12 rounded-full object-cover"
          />
        );
      default:
        return value?.toString() || '';
    }
  };

  const getVisibleColumns = () => {
    if (!data[0]) return [];
    const allColumns = Object.keys(data[0]);
    
    if (binding?.columnOverrides) {
      return allColumns.filter(col => 
        binding.columnOverrides?.[col]?.visible !== false
      );
    }
    
    return allColumns.slice(0, 4); // Default to first 4 columns
  };

  const getColumnDisplayName = (columnName: string) => {
    return binding?.columnOverrides?.[columnName]?.displayName || 
           columnName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const visibleColumns = getVisibleColumns();
  const primaryColumn = visibleColumns[0];
  const secondaryColumns = visibleColumns.slice(1, 3);

  return (
    <div className={`grid grid-cols-1 md:grid-cols-${Math.min(columns, 4)} gap-4 ${className}`}>
      {data.map((item, index) => (
        <Card key={index} className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {formatValue(item[primaryColumn], primaryColumn)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {secondaryColumns.map((column) => (
                <div key={column} className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">
                    {getColumnDisplayName(column)}:
                  </span>
                  <span className="font-medium">
                    {formatValue(item[column], column)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}