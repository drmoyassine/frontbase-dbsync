import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

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
  // Fetch tables from the selected datasource
  const { data: tables = [], isLoading, error, refetch } = useQuery<string[]>({
    queryKey: ['datasource-tables', dataSourceId],
    queryFn: async () => {
      if (!dataSourceId) return [];
      const response = await fetch(`/api/sync/datasources/${dataSourceId}/tables`);
      if (!response.ok) throw new Error('Failed to fetch tables');
      return response.json();
    },
    enabled: !!dataSourceId,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Reset table selection when datasource changes
  React.useEffect(() => {
    if (value && tables.length > 0 && !tables.includes(value)) {
      onValueChange('');
    }
  }, [dataSourceId, tables, value, onValueChange]);

  const handleRefresh = () => {
    refetch();
  };

  const errorMessage = error instanceof Error ? error.message : 'Failed to load tables';

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2 w-full">
        <Select
          value={value || ''}
          onValueChange={onValueChange}
          disabled={disabled || isLoading || tables.length === 0 || !dataSourceId}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={
              !dataSourceId ? "Select datasource first" :
                isLoading ? "Loading..." :
                  placeholder
            } />
          </SelectTrigger>
          <SelectContent>
            {tables.map((table) => (
              <SelectItem key={table} value={table}>
                {table}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showRefresh && dataSourceId && (
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
        {showRefresh && dataSourceId && (
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
        disabled={disabled || isLoading || tables.length === 0 || !dataSourceId}
      >
        <SelectTrigger>
          <SelectValue placeholder={
            !dataSourceId ? "Select a datasource first" :
              isLoading ? "Loading tables..." :
                placeholder
          } />
        </SelectTrigger>
        <SelectContent>
          {tables.map((table) => (
            <SelectItem key={table} value={table}>
              {table}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!isLoading && !dataSourceId && (
        <p className="text-sm text-muted-foreground">
          Please select a datasource to view available tables.
        </p>
      )}
      {!isLoading && dataSourceId && tables.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">
          No tables found in this datasource.
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}
