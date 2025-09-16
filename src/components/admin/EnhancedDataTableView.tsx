import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Database, Table, BarChart3, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataTable } from './DataTable';
import { DataList } from './DataList';
import { useDataBindingStore } from '@/stores/data-binding-simple';

export const EnhancedDataTableView: React.FC = () => {
  const { connected, tables, tablesLoading, tablesError, fetchTables } = useDataBindingStore();
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [viewMode, setViewMode] = useState<'table' | 'list'>('list');

  React.useEffect(() => {
    if (tables.length > 0 && !selectedTable) {
      setSelectedTable(tables[0].name);
    }
  }, [tables, selectedTable]);

  if (tablesError) {
    return (
      <Card className="w-full max-w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Enhanced Database Tables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">{tablesError}</p>
            <Button onClick={fetchTables} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (tables.length === 0 && !tablesLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Enhanced Database Tables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No tables found in your Supabase database</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Enhanced Database Tables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Database not connected</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Enhanced Database Admin
            {tables.length > 0 && (
              <Badge variant="secondary">{tables.length} tables</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'table' | 'list')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="list">List View</TabsTrigger>
                <TabsTrigger value="table">Table View</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              onClick={fetchTables}
              variant="outline"
              size="sm"
              disabled={tablesLoading}
            >
              <RefreshCw className={`h-4 w-4 ${tablesLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {tablesLoading ? (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading tables...</p>
          </div>
        ) : tables.length > 0 ? (
          <Tabs value={selectedTable} onValueChange={setSelectedTable}>
            <TabsList className="grid w-full grid-cols-auto mb-6">
              {tables.slice(0, 6).map((table) => (
                <TabsTrigger key={table.name} value={table.name} className="flex items-center gap-2">
                  <Table className="h-3 w-3" />
                  {table.name}
                </TabsTrigger>
              ))}
              {tables.length > 6 && (
                <TabsTrigger value="" className="flex items-center gap-2">
                  <span>+{tables.length - 6} more</span>
                </TabsTrigger>
              )}
            </TabsList>
            
            {tables.map((table) => (
              <TabsContent key={table.name} value={table.name}>
                {viewMode === 'list' ? (
                  <DataList 
                    resource={table.name}
                    title={`${table.name} - Enhanced List View`}
                    perPage={25}
                    actions={{
                      create: false,
                      edit: false,
                      show: true,
                      delete: false
                    }}
                  />
                ) : (
                  <DataTable 
                    tableName={table.name}
                    title={`${table.name} - Enhanced Table View`}
                    pageSize={25}
                    searchable={true}
                    sortable={true}
                    filterable={true}
                  />
                )}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="text-center py-8">
            <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Select a table to view its data</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};