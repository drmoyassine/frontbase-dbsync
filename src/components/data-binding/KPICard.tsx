import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useSimpleData } from '@/hooks/useSimpleData';

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

interface KPICardProps {
  componentId: string;
  binding?: ComponentDataBinding;
  className?: string;
  onConfigureBinding?: () => void;
}

export function KPICard({ componentId, binding, className = '', onConfigureBinding }: KPICardProps) {
  const {
    data,
    loading,
    error
  } = useSimpleData({
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
      <Card className={className}>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="h-8 bg-muted rounded w-1/2"></div>
            <div className="h-4 bg-muted rounded w-1/4"></div>
          </div>
        </CardContent>
      </Card>
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

  // Calculate KPI value from data
  const kpiValue = data?.length > 0 ? data[0] : {};
  const valueField = Object.keys(kpiValue)[0] || 'count';
  const value = kpiValue[valueField] || 0;

  // Format value based on display type
  const formatValue = (val: any) => {
    if (typeof val === 'number') {
      return val.toLocaleString();
    }
    return val?.toString() || '0';
  };

  // Mock trend calculation (you can enhance this based on your needs)
  const trend = 5.2; // percentage change
  const getTrendIcon = (trend: number) => {
    if (trend > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (trend < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getTrendColor = (trend: number) => {
    if (trend > 0) return 'text-green-500';
    if (trend < 0) return 'text-red-500';
    return 'text-muted-foreground';
  };

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium capitalize">
          {valueField.replace(/_/g, ' ')}
        </CardTitle>
        {getTrendIcon(trend)}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatValue(value)}</div>
        <div className="flex items-center space-x-2 text-xs text-muted-foreground">
          <span className={getTrendColor(trend)}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
          <span>from last period</span>
        </div>
      </CardContent>
    </Card>
  );
}