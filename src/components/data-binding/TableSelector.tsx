import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useDataBindingStore } from '@/stores/data-binding';

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
  const { tables, schemasLoading, refreshSchemas } = useDataBindingStore();

  const handleRefresh = () => {
    refreshSchemas();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {showRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={schemasLoading}
          >
            <RefreshCw className={`w-4 h-4 ${schemasLoading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>
      <Select 
        value={value || ''} 
        onValueChange={onValueChange}
        disabled={disabled || schemasLoading || tables.length === 0}
      >
        <SelectTrigger>
          <SelectValue placeholder={schemasLoading ? "Loading tables..." : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {tables.map((table) => (
            <SelectItem key={table} value={table}>
              {table}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!schemasLoading && tables.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No tables found. Make sure your data source is connected.
        </p>
      )}
    </div>
  );
}