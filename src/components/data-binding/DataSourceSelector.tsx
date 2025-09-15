import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useDataBindingStore } from '@/stores/data-binding-simple';

interface DataSourceSelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function DataSourceSelector({
  value,
  onValueChange,
  label = "Data Source",
  placeholder = "Select a data source",
  disabled = false
}: DataSourceSelectorProps) {
  const { connected } = useDataBindingStore();

  // For the simplified system, we only have one data source (backend)
  const dataSourceId = 'backend';
  const selectedValue = value || (connected ? dataSourceId : '');

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select 
        value={selectedValue} 
        onValueChange={onValueChange}
        disabled={disabled || !connected}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {connected && (
            <SelectItem value={dataSourceId}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span>Backend Database</span>
                <span className="text-xs text-muted-foreground">
                  (supabase)
                </span>
              </div>
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {!connected && (
        <p className="text-sm text-muted-foreground">
          No database connection available. Connect to a database first.
        </p>
      )}
    </div>
  );
}