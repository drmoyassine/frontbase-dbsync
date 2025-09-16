import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Database, Table, RefreshCw, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SimpleDataTable } from '@/components/data-binding/SimpleDataTable';
import { useDataBindingStore } from '@/stores/data-binding-simple';

export const SimpleDataTableView: React.FC = () => {
  const { connected, connectionError, tables, tablesLoading, tablesError, fetchTables } = useDataBindingStore();
  const [selectedTable, setSelectedTable] = useState<string>('');

  // Auto-select first table when tables become available
  React.useEffect(() => {
    if (tables.length > 0 && !selectedTable) {
      setSelectedTable(tables[0].name);
    }
  }, [tables.length, selectedTable]);

  // Show connection error if any
  if (connectionError) {
    return (
      <Card className="w-full max-w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Tables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {connectionError}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Show error if tables failed to load
  if (tablesError) {
    return (
      <Card className="w-full max-w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Tables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
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

  // Show no tables found message
  if (tables.length === 0 && !tablesLoading && connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Tables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">No tables found in your database</p>
            <Button onClick={fetchTables} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Tables
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show not connected message
  if (!connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Tables
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
            <Database className="h-5 w-5" />
            Database Tables
            {tables.length > 0 && (
              <Badge variant="secondary">{tables.length} tables</Badge>
            )}
          </CardTitle>
          <Button
            onClick={fetchTables}
            variant="outline"
            size="sm"
            disabled={tablesLoading}
          >
            <RefreshCw className={`h-4 w-4 ${tablesLoading ? 'animate-spin' : ''}`} />
          </Button>
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
                <SimpleDataTable 
                  componentId={`table-${table.name}`}
                  binding={{
                    componentId: `table-${table.name}`,
                    dataSourceId: "backend",
                    tableName: table.name,
                    refreshInterval: 30000,
                    pagination: {
                      enabled: true,
                      pageSize: 25,
                      page: 1
                    },
                    sorting: {
                      enabled: true,
                      column: '',
                      direction: 'asc'
                    },
                    filtering: {
                      searchEnabled: true,
                      filters: {}
                    },
                    columnOverrides: {}
                  }}
                />
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