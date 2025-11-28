import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { DataSourceSelector } from '@/components/data-binding/DataSourceSelector';
import { TableSelector } from '@/components/data-binding/TableSelector';
import { ColumnConfigurator } from '@/components/data-binding/ColumnConfigurator';
import { PropertyMapper } from '@/components/builder/data-binding/PropertyMapper';
import { useDataBindingStore } from '@/stores/data-binding-simple';

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
  fieldMapping?: Record<string, string>;
}

interface DataBindingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  componentId: string;
  componentType: string;
  onSave: (binding: ComponentDataBinding) => void;
}

export function DataBindingModal({
  open,
  onOpenChange,
  componentId,
  componentType,
  onSave
}: DataBindingModalProps) {
  const store = useDataBindingStore();
  const existingBinding = store.getComponentBinding(componentId);

  const [binding, setBinding] = useState<ComponentDataBinding>({
    componentId,
    dataSourceId: 'backend',
    tableName: '',
    refreshInterval: -1,
    pagination: {
      enabled: true,
      pageSize: 10,
      page: 0
    },
    sorting: {
      enabled: true
    },
    filtering: {
      searchEnabled: true,
      filters: {}
    },
    columnOverrides: {},
    fieldMapping: {}
  });

  useEffect(() => {
    if (existingBinding) {
      setBinding(existingBinding);
    }
  }, [existingBinding]);

  const handleSave = () => {
    onSave(binding);
    onOpenChange(false);
  };

  const updateBinding = (updates: Partial<ComponentDataBinding>) => {
    setBinding(prev => ({ ...prev, ...updates }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Configure Data Binding - {componentType}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="basic" className="w-full h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-5 flex-shrink-0">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="mapping">Mapping</TabsTrigger>
              <TabsTrigger value="columns">Columns</TabsTrigger>
              <TabsTrigger value="display">Display</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-6 flex-1 overflow-y-auto p-1">
              <div className="space-y-4">
                <DataSourceSelector
                  value={binding.dataSourceId}
                  onValueChange={(value) => updateBinding({ dataSourceId: value })}
                />

                <TableSelector
                  value={binding.tableName}
                  onValueChange={(value) => updateBinding({ tableName: value })}
                  dataSourceId={binding.dataSourceId}
                />
              </div>

              <div className="space-y-4">
                <div>
                  <Label>Refresh Interval</Label>
                  <Select
                    value={binding.refreshInterval?.toString() || '-1'}
                    onValueChange={(value) => updateBinding({ refreshInterval: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="-1">Manual</SelectItem>
                      <SelectItem value="0">Real-time</SelectItem>
                      <SelectItem value="5">Every 5 seconds</SelectItem>
                      <SelectItem value="30">Every 30 seconds</SelectItem>
                      <SelectItem value="60">Every minute</SelectItem>
                      <SelectItem value="300">Every 5 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="mapping" className="space-y-4 flex-1 overflow-y-auto">
              <PropertyMapper
                tableName={binding.tableName}
                componentType={componentType}
                mapping={binding.fieldMapping || {}}
                onMappingChange={(mapping) => updateBinding({ fieldMapping: mapping })}
              />
            </TabsContent>

            <TabsContent value="columns" className="space-y-4 flex-1 overflow-y-auto">
              {binding.tableName && (
                <ColumnConfigurator
                  tableName={binding.tableName}
                  dataSourceId={binding.dataSourceId}
                  columnOverrides={binding.columnOverrides || {}}
                  onColumnOverridesChange={(overrides) => updateBinding({ columnOverrides: overrides })}
                />
              )}
            </TabsContent>

            <TabsContent value="display" className="space-y-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <h4 className="font-medium">Pagination</h4>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={binding.pagination?.enabled || false}
                      onCheckedChange={(checked) =>
                        updateBinding({
                          pagination: { ...binding.pagination!, enabled: checked }
                        })
                      }
                    />
                    <Label>Enable Pagination</Label>
                  </div>
                  {binding.pagination?.enabled && (
                    <div>
                      <Label>Page Size</Label>
                      <Input
                        type="number"
                        value={binding.pagination?.pageSize || 10}
                        onChange={(e) =>
                          updateBinding({
                            pagination: {
                              ...binding.pagination!,
                              pageSize: parseInt(e.target.value) || 10
                            }
                          })
                        }
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Sorting</h4>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={binding.sorting?.enabled || false}
                      onCheckedChange={(checked) =>
                        updateBinding({
                          sorting: { ...binding.sorting!, enabled: checked }
                        })
                      }
                    />
                    <Label>Enable Sorting</Label>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium">Search & Filtering</h4>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={binding.filtering?.searchEnabled || false}
                    onCheckedChange={(checked) =>
                      updateBinding({
                        filtering: { ...binding.filtering!, searchEnabled: checked }
                      })
                    }
                  />
                  <Label>Enable Search</Label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4 flex-1 overflow-y-auto">
              <div className="space-y-4">
                <h4 className="font-medium">Bulk Actions</h4>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={false}
                    onCheckedChange={() => { }}
                    disabled
                  />
                  <Label>Enable Bulk Actions (Coming Soon)</Label>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!binding.tableName}>
            Save Configuration
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}