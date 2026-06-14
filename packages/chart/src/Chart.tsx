import React, { useMemo } from 'react';
import { 
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
    XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend 
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { ChartProps } from './types';
import { useChartQuery } from './hooks/useChartQuery';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export function Chart({
    mode = 'builder',
    componentId,
    binding,
    className = '',
    style,
    chartType = 'bar',
    height = '300px',
    initialData,
    onConfigureBinding,
    configureOverlay,
}: ChartProps) {
    // Cast to break cross-package csstype version incompatibility (see InfoList).
    const safeStyle = style as React.CSSProperties | undefined;
    // Data fetching via custom edge-aware hook
    const {
        data,
        isLoading: loading,
        error
    } = useChartQuery({
        mode,
        binding: binding || {
            componentId,
            dataSourceId: '',
            tableName: '',
            pagination: { enabled: false, pageSize: 10, page: 0 },
            sorting: { enabled: false },
            filtering: { searchEnabled: false, filters: {} },
            columnOverrides: {},
        },
        initialData,
        enabled: !!binding?.tableName,
    });

    const title = binding?.tableName 
        ? binding.tableName.replace(/_/g, ' ') 
        : '';

    // Card styling matching standard shadcn/ui Card structure
    const cardClass = "rounded-lg border bg-card text-card-foreground shadow-sm";
    const headerClass = "flex flex-col space-y-1.5 p-6 pb-4";
    const titleClass = "text-lg font-semibold capitalize";
    const contentClass = "p-6 pt-0";

    // Derive chart data. NOTE: this hook must run before any early return below,
    // otherwise the hook order changes between renders (loading -> loaded) and
    // React throws "Rendered more hooks than during the previous render".
    const chartData = useMemo(() => {
        if (!data || data.length === 0) return [];
        return data.slice(0, 10); // Limit to 10 rows for clean chart display
    }, [data]);

    // 1. Unconfigured State
    if (!binding?.tableName) {
        return (
            <div className={cn(cardClass, className)} style={safeStyle}>
                <div className="p-6 text-center space-y-4">
                    <p className="text-muted-foreground text-sm">No data binding configured</p>
                    {configureOverlay as any}
                    {!configureOverlay && onConfigureBinding && (
                        <button
                            onClick={onConfigureBinding}
                            className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
                        >
                            Configure Data
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // 2. Loading State (Matching SSR skeleton layout)
    if (loading && !data) {
        return (
            <div className={cn(cardClass, className)} style={safeStyle}>
                <div className={headerClass}>
                    <div className="h-4 bg-muted rounded w-1/3 animate-pulse"></div>
                </div>
                <div className={contentClass}>
                    <div 
                        className="fb-chart-container fb-skeleton" 
                        style={{ height, borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <span className="text-muted-foreground text-sm">Loading chart...</span>
                    </div>
                </div>
            </div>
        );
    }

    // 3. Error State
    if (error) {
        return (
            <div className={cn(cardClass, className)} style={safeStyle}>
                <div className="p-6 text-center space-y-4">
                    <p className="text-destructive text-sm font-medium">Error loading data: {error instanceof Error ? error.message : String(error)}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-destructive text-destructive-foreground text-sm font-medium rounded-md hover:bg-destructive/90 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    // 4. Render Chart Types
    const renderChartContent = () => {
        if (chartData.length === 0) {
            return (
                <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ height }}>
                    No data available
                </div>
            );
        }

        const keys = Object.keys(chartData[0]);
        const xAxisKey = keys[0];
        const valueKey = keys[1] || xAxisKey;

        // Custom container styles to satisfy recharts sizing constraints
        const containerStyle = {
            width: '100%',
            height,
        };

        switch (chartType) {
            case 'line':
                return (
                    <div style={containerStyle}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                <XAxis 
                                    dataKey={xAxisKey} 
                                    stroke="hsl(var(--muted-foreground))" 
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis 
                                    stroke="hsl(var(--muted-foreground))" 
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip 
                                    contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
                                />
                                <Legend />
                                <Line 
                                    type="monotone" 
                                    dataKey={valueKey} 
                                    stroke="hsl(var(--primary))" 
                                    strokeWidth={2}
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                );

            case 'pie':
                return (
                    <div style={containerStyle}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    outerRadius="80%"
                                    fill="#8884d8"
                                    dataKey={valueKey}
                                    nameKey={xAxisKey}
                                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                                >
                                    {chartData.map((_: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
                                />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                );

            default: // bar
                return (
                    <div style={containerStyle}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                <XAxis 
                                    dataKey={xAxisKey} 
                                    stroke="hsl(var(--muted-foreground))" 
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis 
                                    stroke="hsl(var(--muted-foreground))" 
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip 
                                    contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
                                />
                                <Legend />
                                <Bar 
                                    dataKey={valueKey} 
                                    fill="hsl(var(--primary))" 
                                    radius={[4, 4, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                );
        }
    };

    return (
        <div className={cn(cardClass, className)} style={safeStyle}>
            <div className={headerClass}>
                <h3 className={titleClass}>{title} Chart</h3>
            </div>
            <div className={contentClass}>
                {renderChartContent()}
            </div>
        </div>
    );
}

export default Chart;
