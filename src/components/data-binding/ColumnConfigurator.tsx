import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GripVertical, Eye, EyeOff } from 'lucide-react';
import { useTableSchema } from '@/hooks/useUniversalData';
import { ColumnSchema } from '@/lib/data-sources/types';

interface ColumnConfig {
  name: string;
  displayName: string;
  displayType: 'text' | 'badge' | 'date' | 'currency' | 'percentage' | 'image' | 'link';
  visible: boolean;
  order: number;
}

interface ColumnConfiguratorProps {
  tableName?: string;
  value: ColumnConfig[];
  onChange: (columns: ColumnConfig[]) => void;
  showGlobalOverrides?: boolean;
}

export function ColumnConfigurator({
  tableName,
  value,
  onChange,
  showGlobalOverrides = true
}: ColumnConfiguratorProps) {
  const { schema, loading } = useTableSchema(tableName);
  const [columns, setColumns] = useState<ColumnConfig[]>(value);

  // Initialize columns from schema
  useEffect(() => {
    if (schema && schema.columns.length > 0) {
      const newColumns = schema.columns.map((col, index) => {
        const existing = value.find(c => c.name === col.name);
        return existing || {
          name: col.name,
          displayName: col.globalDisplayName || col.name,
          displayType: col.globalDisplayType || getDefaultDisplayType(col),
          visible: true,
          order: index
        };
      });
      setColumns(newColumns);
      if (JSON.stringify(newColumns) !== JSON.stringify(value)) {
        onChange(newColumns);
      }
    }
  }, [schema, value, onChange]);

  const getDefaultDisplayType = (column: ColumnSchema): ColumnConfig['displayType'] => {
    if (column.type === 'date') return 'date';
    if (column.type === 'number') return 'text';
    if (column.type === 'boolean') return 'badge';
    if (column.name.toLowerCase().includes('email')) return 'link';
    if (column.name.toLowerCase().includes('url') || column.name.toLowerCase().includes('link')) return 'link';
    if (column.name.toLowerCase().includes('image') || column.name.toLowerCase().includes('photo')) return 'image';
    return 'text';
  };

  const updateColumn = (index: number, updates: Partial<ColumnConfig>) => {
    const newColumns = [...columns];
    newColumns[index] = { ...newColumns[index], ...updates };
    setColumns(newColumns);
    onChange(newColumns);
  };

  const toggleAllVisible = (visible: boolean) => {
    const newColumns = columns.map(col => ({ ...col, visible }));
    setColumns(newColumns);
    onChange(newColumns);
  };

  const reorderColumn = (fromIndex: number, toIndex: number) => {
    const newColumns = [...columns];
    const [movedColumn] = newColumns.splice(fromIndex, 1);
    newColumns.splice(toIndex, 0, movedColumn);
    
    // Update order values
    newColumns.forEach((col, index) => {
      col.order = index;
    });
    
    setColumns(newColumns);
    onChange(newColumns);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-sm text-muted-foreground">Loading table schema...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!schema) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm text-muted-foreground">
            Select a table to configure columns
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Column Configuration</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleAllVisible(true)}
            >
              <Eye className="w-4 h-4 mr-1" />
              Show All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleAllVisible(false)}
            >
              <EyeOff className="w-4 h-4 mr-1" />
              Hide All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {columns.map((column, index) => {
          const schemaColumn = schema.columns.find(c => c.name === column.name);
          
          return (
            <div
              key={column.name}
              className="flex items-center gap-4 p-3 border rounded-lg bg-background"
            >
              {/* Drag Handle */}
              <div className="cursor-move text-muted-foreground">
                <GripVertical className="w-4 h-4" />
              </div>
              
              {/* Visibility Toggle */}
              <div className="flex items-center gap-2">
                <Switch
                  checked={column.visible}
                  onCheckedChange={(visible) => updateColumn(index, { visible })}
                />
                <Label className="text-sm">Show</Label>
              </div>
              
              {/* Column Info */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{column.name}</span>
                  {schemaColumn?.isPrimaryKey && (
                    <Badge variant="outline" className="text-xs">PK</Badge>
                  )}
                  {schemaColumn?.isForeignKey && (
                    <Badge variant="outline" className="text-xs">FK</Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {schemaColumn?.type}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  {/* Display Name */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Display Name</Label>
                    <Input
                      value={column.displayName}
                      onChange={(e) => updateColumn(index, { displayName: e.target.value })}
                      placeholder={column.name}
                      className="h-8"
                    />
                  </div>
                  
                  {/* Display Type */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Display Type</Label>
                    <Select
                      value={column.displayType}
                      onValueChange={(displayType: ColumnConfig['displayType']) => 
                        updateColumn(index, { displayType })
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="badge">Badge</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="currency">Currency</SelectItem>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="image">Image</SelectItem>
                        <SelectItem value="link">Link</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        
        {columns.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No columns found in the selected table
          </div>
        )}
      </CardContent>
    </Card>
  );
}