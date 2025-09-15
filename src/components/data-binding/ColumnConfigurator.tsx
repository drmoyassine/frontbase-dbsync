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

interface ColumnConfiguratorProps {
  tableName: string;
  dataSourceId?: string;
  columnOverrides?: { [columnName: string]: any };
  onColumnOverridesChange: (overrides: { [columnName: string]: any }) => void;
}

export function ColumnConfigurator({
  tableName,
  dataSourceId,
  columnOverrides = {},
  onColumnOverridesChange
}: ColumnConfiguratorProps) {
  const { schema, loading } = useTableSchema(tableName);
  
  const updateColumnOverride = (columnName: string, updates: any) => {
    const newOverrides = {
      ...columnOverrides,
      [columnName]: {
        ...columnOverrides[columnName],
        ...updates
      }
    };
    onColumnOverridesChange(newOverrides);
  };

  const toggleAllVisible = (visible: boolean) => {
    if (!schema) return;
    
    const newOverrides = { ...columnOverrides };
    schema.columns.forEach(column => {
      newOverrides[column.name] = {
        ...newOverrides[column.name],
        visible
      };
    });
    onColumnOverridesChange(newOverrides);
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
        {schema.columns.map((column, index) => {
          const override = columnOverrides[column.name] || {};
          
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
                  checked={override.visible !== false}
                  onCheckedChange={(visible) => updateColumnOverride(column.name, { visible })}
                />
                <Label className="text-sm">Show</Label>
              </div>
              
              {/* Column Info */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{column.name}</span>
                  {column.isPrimaryKey && (
                    <Badge variant="outline" className="text-xs">PK</Badge>
                  )}
                  {column.isForeignKey && (
                    <Badge variant="outline" className="text-xs">FK</Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {column.type}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  {/* Display Name */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Display Name</Label>
                    <Input
                      value={override.displayName || column.name}
                      onChange={(e) => updateColumnOverride(column.name, { displayName: e.target.value })}
                      placeholder={column.name}
                      className="h-8"
                    />
                  </div>
                  
                  {/* Display Type */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Display Type</Label>
                    <Select
                      value={override.displayType || 'text'}
                      onValueChange={(displayType) => updateColumnOverride(column.name, { displayType })}
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
        
        {schema.columns.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No columns found in the selected table
          </div>
        )}
      </CardContent>
    </Card>
  );
}