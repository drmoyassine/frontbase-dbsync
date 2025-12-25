import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { useDashboardStore } from '@/stores/dashboard';

import { useTables } from '@/hooks/useDatabase';

interface TableSelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
  dataSourceId?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  showRefresh?: boolean;
  variant?: 'default' | 'compact';
}

export function TableSelector({
  value,
  onValueChange,
  dataSourceId,
  label = "Table",
  placeholder = "Select a table",
  disabled = false,
  showRefresh = true,
  variant = 'default'
}: TableSelectorProps) {
  const { connected, initialize } = useDataBindingStore();
  const { data: tables = [], isLoading: tablesLoading, error, refetch } = useTables();

  // Initialize connection if needed
  React.useEffect(() => {
    if (!connected) {
      initialize();
    }
  }, [connected, initialize]);

  const handleRefresh = () => {
    refetch();
  };

  const isLoading = tablesLoading;
  const tableList = tables.map(table => table.name);
  const errorMessage = error instanceof Error ? error.message : 'Failed to load tables';

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2 w-full">
        <Select
          value={value || ''}
          onValueChange={onValueChange}
          disabled={disabled || isLoading || tableList.length === 0}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={isLoading ? "Loading..." : placeholder} />
          </SelectTrigger>
          <SelectContent>
            {tableList.map((table) => (
              <SelectItem key={table} value={table}>
                {table}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showRefresh && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleRefresh}
            disabled={isLoading}
            title="Refresh tables"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {showRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>
      <Select
        value={value || ''}
        onValueChange={onValueChange}
        disabled={disabled || isLoading || tableList.length === 0}
      >
        <SelectTrigger>
          <SelectValue placeholder={isLoading ? "Loading tables..." : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {tableList.map((table) => (
            <SelectItem key={table} value={table}>
              {table}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!isLoading && tableList.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {!connected
            ? 'Database not connected. Please configure your Supabase connection.'
            : (error ? errorMessage : 'No tables found. Make sure your database is properly connected.')
          }
        </p>
      )}
    </div>
  );
}
