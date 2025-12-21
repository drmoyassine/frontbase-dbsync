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
import { Separator } from '@/components/ui/separator';

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

  // Check if this is a DataTable component - use simplified UI
  const isDataTable = componentType === 'DataTable';

  // Simplified single-view UI for DataTable
  if (isDataTable) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Configure Data Table</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6 p-1">
            {/* Data Source Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Data Source</h3>
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

            <Separator />

            {/* Table Options Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Table Options</h3>

              <div className="grid grid-cols-2 gap-4">
                {/* Pagination */}
                <div className="space-y-3 p-4 border rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="pagination-enabled"
                      checked={binding.pagination?.enabled || false}
                      onCheckedChange={(checked) =>
                        updateBinding({
                          pagination: { ...binding.pagination!, enabled: checked }
                        })
                      }
                    />
                    <Label htmlFor="pagination-enabled" className="font-medium">Enable Pagination</Label>
                  </div>
                  {binding.pagination?.enabled && (
                    <div className="space-y-2">
                      <Label htmlFor="page-size">Rows per page</Label>
                      <Input
                        id="page-size"
                        type="number"
                        min={1}
                        max={100}
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

                {/* Sorting */}
                <div className="space-y-3 p-4 border rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="sorting-enabled"
                      checked={binding.sorting?.enabled || false}
                      onCheckedChange={(checked) =>
                        updateBinding({
                          sorting: { ...binding.sorting!, enabled: checked }
                        })
                      }
                    />
                    <Label htmlFor="sorting-enabled" className="font-medium">Enable Sorting</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Users can click column headers to sort
                  </p>
                </div>

                {/* Search */}
                <div className="space-y-3 p-4 border rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="search-enabled"
                      checked={binding.filtering?.searchEnabled || false}
                      onCheckedChange={(checked) =>
                        updateBinding({
                          filtering: { ...binding.filtering!, searchEnabled: checked }
                        })
                      }
                    />
                    <Label htmlFor="search-enabled" className="font-medium">Enable Search</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Show search bar above table
                  </p>
                </div>

                {/* Refresh Interval */}
                <div className="space-y-3 p-4 border rounded-lg">
                  <Label htmlFor="refresh-interval" className="font-medium">Refresh Interval</Label>
                  <Select
                    value={binding.refreshInterval?.toString() || '-1'}
                    onValueChange={(value) => updateBinding({ refreshInterval: parseInt(value) })}
                  >
                    <SelectTrigger id="refresh-interval">
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
            </div>

            {/* Column Configuration */}
            {binding.tableName && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Column Configuration</h3>
                  <ColumnConfigurator
                    tableName={binding.tableName}
                    dataSourceId={binding.dataSourceId}
                    columnOverrides={binding.columnOverrides || {}}
                    onColumnOverridesChange={(overrides) => updateBinding({ columnOverrides: overrides })}
                  />
                </div>
              </>
            )}
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

  // Original tabbed UI for other component types
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