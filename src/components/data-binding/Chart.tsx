import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
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

interface ChartProps {
  componentId: string;
  binding?: ComponentDataBinding;
  className?: string;
  chartType?: 'bar' | 'line' | 'pie';
  onConfigureBinding?: () => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export function Chart({ 
  componentId, 
  binding, 
  className = '', 
  chartType = 'bar', 
  onConfigureBinding 
}: ChartProps) {
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
            <div className="h-48 bg-muted rounded"></div>
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

  const chartConfig = {
    data: {
      label: "Data",
      color: "hsl(var(--chart-1))",
    },
  };

  const renderChart = () => {
    if (!data || data.length === 0) {
      return (
        <div className="h-48 flex items-center justify-center text-muted-foreground">
          No data available
        </div>
      );
    }

    const chartData = data.slice(0, 10); // Limit to 10 items for better visualization

    switch (chartType) {
      case 'line':
        return (
          <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={Object.keys(chartData[0])[0]} />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line 
                type="monotone" 
                dataKey={Object.keys(chartData[0])[1] || Object.keys(chartData[0])[0]} 
                stroke="var(--color-data)" 
                strokeWidth={2}
              />
            </LineChart>
          </ChartContainer>
        );

      case 'pie':
        return (
          <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey={Object.keys(chartData[0])[1] || Object.keys(chartData[0])[0]}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
            </PieChart>
          </ChartContainer>
        );

      default: // bar
        return (
          <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={Object.keys(chartData[0])[0]} />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar 
                dataKey={Object.keys(chartData[0])[1] || Object.keys(chartData[0])[0]} 
                fill="var(--color-data)" 
              />
            </BarChart>
          </ChartContainer>
        );
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="capitalize">
          {binding.tableName?.replace(/_/g, ' ')} Chart
        </CardTitle>
      </CardHeader>
      <CardContent>
        {renderChart()}
      </CardContent>
    </Card>
  );
}