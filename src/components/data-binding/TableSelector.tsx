import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useDataBindingStore } from '@/stores/data-binding-simple';

interface TableSelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
  dataSourceId?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  showRefresh?: boolean;
}

export function TableSelector({
  value,
  onValueChange,
  dataSourceId,
  label = "Table",
  placeholder = "Select a table",
  disabled = false,
  showRefresh = true
}: TableSelectorProps) {
  const { tables, tablesLoading, tablesError, fetchTables, connected } = useDataBindingStore();

  const loadTables = React.useCallback(async () => {
    if (!connected) return;
    await fetchTables();
  }, [connected, fetchTables]);

  React.useEffect(() => {
    loadTables();
  }, [loadTables]);

  const handleRefresh = () => {
    loadTables();
  };

  const isLoading = tablesLoading;
  const tableList = tables.map(table => table.name);

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
          {tablesError || 'No tables found. Make sure your database is properly connected.'}
        </p>
      )}
    </div>
  );
}