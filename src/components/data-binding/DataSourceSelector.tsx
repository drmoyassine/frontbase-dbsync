import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useDataBindingStore } from '@/stores/data-binding';

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
  const { dataSources, activeDataSourceId } = useDataBindingStore();

  // Use active data source as default if no value provided
  const selectedValue = value || activeDataSourceId || '';

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select 
        value={selectedValue} 
        onValueChange={onValueChange}
        disabled={disabled || dataSources.length === 0}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {dataSources.map((dataSource) => (
            <SelectItem key={dataSource.id} value={dataSource.id}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  dataSource.isActive ? 'bg-green-500' : 'bg-gray-400'
                }`} />
                <span>{dataSource.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({dataSource.type})
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {dataSources.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No data sources configured. Add a data source first.
        </p>
      )}
    </div>
  );
}