import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Search, Database, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboard';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

interface TableData {
  data: Record<string, any>[];
  columns: { column_name: string; data_type: string }[];
  total: number;
}

export const SimpleDataTableView: React.FC = () => {
  const {
    supabaseTables,
    tablesLoading,
    tablesError,
    fetchSupabaseTables,
    connections
  } = useDashboardStore();

  // Add extensive logging for debugging
  console.log('=== SimpleDataTableView DEBUG ===');
  console.log('Component mounted/re-rendered');
  console.log('Connections state:', connections);
  console.log('Supabase connected:', connections.supabase.connected);
  console.log('Supabase URL:', connections.supabase.url);
  console.log('Tables loading:', tablesLoading);
  console.log('Tables error:', tablesError);
  console.log('Supabase tables:', supabaseTables);
  console.log('=== END DEBUG ===');

  const [selectedTable, setSelectedTable] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  useEffect(() => {
    console.log('=== USEEFFECT: FETCH TABLES ===');
    console.log('Supabase connected:', connections.supabase.connected);
    if (connections.supabase.connected) {
      console.log('Fetching Supabase tables...');
      fetchSupabaseTables();
    } else {
      console.log('Supabase not connected, skipping table fetch');
    }
  }, [connections.supabase.connected, fetchSupabaseTables]);

  useEffect(() => {
    console.log('=== USEEFFECT: FETCH TABLE DATA ===');
    console.log('Selected table:', selectedTable);
    console.log('Offset:', offset);
    if (selectedTable) {
      console.log('Fetching table data for:', selectedTable);
      fetchTableData();
    } else {
      console.log('No table selected, skipping data fetch');
    }
  }, [selectedTable, offset]);

  useEffect(() => {
    console.log('=== USEEFFECT: AUTO SELECT TABLE ===');
    console.log('Tables available:', supabaseTables.length);
    console.log('Current selected table:', selectedTable);
    if (supabaseTables.length > 0 && !selectedTable) {
      console.log('Auto-selecting first table:', supabaseTables[0].name);
      setSelectedTable(supabaseTables[0].name);
    }
  }, [supabaseTables, selectedTable]);

  const fetchTableData = async () => {
    if (!selectedTable) return;

    console.log('=== FETCHING TABLE DATA ===');
    console.log('Selected table:', selectedTable);
    console.log('Limit:', limit);
    console.log('Offset:', offset);

    setDataLoading(true);
    setDataError(null);

    try {
      const url = `/api/database/table-data/${selectedTable}?limit=${limit}&offset=${offset}`;
      console.log('Fetching from URL:', url);
      
      const response = await fetch(url, {
        credentials: 'include'
      });

      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Response error text:', errorText);
        throw new Error(`Failed to fetch table data: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('Raw API result:', result);
      console.log('Result success:', result.success);
      console.log('Result data type:', typeof result.data);
      console.log('Result data:', result.data);
      console.log('Result data length:', result.data?.length);
      
      if (!result.success) {
        console.error('API returned success=false:', result.message);
        throw new Error(result.message || 'Failed to fetch table data');
      }

      // Get schema for columns
      console.log('Fetching schema for table:', selectedTable);
      const schemaResponse = await fetch(`/api/database/table-schema/${selectedTable}`, {
        credentials: 'include'
      });

      console.log('Schema response status:', schemaResponse.status);
      
      let columns: { column_name: string; data_type: string }[] = [];
      if (schemaResponse.ok) {
        const schemaResult = await schemaResponse.json();
        console.log('Schema result:', schemaResult);
        console.log('Schema result.data:', schemaResult.data);
        if (schemaResult.success && schemaResult.data) {
          // Try different possible locations for columns in the schema response
          columns = schemaResult.data.columns || schemaResult.columns || schemaResult.data || [];
          console.log('Columns from schema:', columns);
        }
      }

      // Add defensive programming - check if result.data exists and is array
      console.log('Checking result.data existence...');
      console.log('result.data exists:', !!result.data);
      console.log('result.data is array:', Array.isArray(result.data));
      
      // If no schema from API, infer from data (with null check)
      if (columns.length === 0 && result.data && Array.isArray(result.data) && result.data.length > 0) {
        console.log('Inferring columns from first row');
        const firstRow = result.data[0];
        console.log('First row:', firstRow);
        columns = Object.keys(firstRow).map(key => ({
          column_name: key,
          data_type: typeof firstRow[key]
        }));
        console.log('Inferred columns:', columns);
      } else if (!result.data || !Array.isArray(result.data)) {
        console.error('result.data is not a valid array:', result.data);
        // Set empty columns if data is invalid
        columns = [];
      }

      // Ensure we have valid data before setting state
      const validData = result.data && Array.isArray(result.data) ? result.data : [];
      console.log('Valid data length:', validData.length);
      
      const tableDataToSet = {
        data: validData,
        columns,
        total: validData.length
      };
      
      console.log('Setting table data:', tableDataToSet);
      setTableData(tableDataToSet);
      console.log('=== TABLE DATA FETCH COMPLETED ===');
      
    } catch (error) {
      console.error('=== ERROR FETCHING TABLE DATA ===');
      console.error('Error details:', error);
      console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch table data';
      console.log('Setting error message:', errorMessage);
      setDataError(errorMessage);
    } finally {
      console.log('Setting dataLoading to false');
      setDataLoading(false);
    }
  };

  const handleTableChange = (tableName: string) => {
    setSelectedTable(tableName);
    setOffset(0);
    setSearchQuery('');
  };

  const handlePrevious = () => {
    setOffset(Math.max(0, offset - limit));
  };

  const handleNext = () => {
    setOffset(offset + limit);
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground italic">null</span>;
    }
    if (typeof value === 'object') {
      return <span className="text-muted-foreground">{JSON.stringify(value)}</span>;
    }
    const str = String(value);
    if (str.length > 100) {
      return <span title={str}>{str.substring(0, 100)}...</span>;
    }
    return str;
  };

  const filteredData = tableData?.data.filter(row =>
    Object.values(row).some(value =>
      String(value || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
  ) || [];

  const handleOpenInSupabase = () => {
    if (connections.supabase.url && selectedTable) {
      const baseUrl = connections.supabase.url.replace('/rest/v1', '');
      const projectRef = baseUrl.split('//')[1]?.split('.')[0];
      if (projectRef) {
        window.open(`https://supabase.com/dashboard/project/${projectRef}/editor/${selectedTable}`, '_blank');
      }
    }
  };

  if (tablesError) {
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
            <p className="text-muted-foreground mb-4">{tablesError}</p>
            <Button onClick={fetchSupabaseTables} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (supabaseTables.length === 0 && !tablesLoading) {
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
            <p className="text-muted-foreground">No tables found in your Supabase database</p>
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
            Database Table Viewer
            {supabaseTables.length > 0 && (
              <Badge variant="secondary">{supabaseTables.length} tables</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {selectedTable && (
              <Button
                onClick={handleOpenInSupabase}
                variant="outline"
                size="sm"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in Supabase
              </Button>
            )}
            <Button
              onClick={fetchSupabaseTables}
              variant="outline"
              size="sm"
              disabled={tablesLoading}
            >
              <RefreshCw className={`h-4 w-4 ${tablesLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        
        <div className="flex gap-4">
          <div className="flex-1">
            <Select value={selectedTable} onValueChange={handleTableChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a table" />
              </SelectTrigger>
              <SelectContent>
                {supabaseTables.map((table) => (
                  <SelectItem key={table.name} value={table.name}>
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      {table.name}
                      <Badge variant="outline" className="text-xs">
                        {table.schema}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search table data..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {tablesLoading ? (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading tables...</p>
          </div>
        ) : dataLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : dataError ? (
          <div className="text-center py-8">
            <p className="text-destructive mb-4">{dataError}</p>
            <Button onClick={fetchTableData} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        ) : selectedTable && tableData ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {filteredData.length} of {tableData.total} rows
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevious}
                  disabled={offset === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNext}
                  disabled={tableData.data.length < limit}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="h-96 w-full overflow-hidden">
              <ScrollArea className="h-full w-full">
                <div className="w-full overflow-x-auto">
                  <Table className="min-w-full">
                    <TableHeader>
                      <TableRow>
                        {tableData.columns.map((column) => (
                          <TableHead key={column.column_name} className="min-w-32 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span>{column.column_name}</span>
                              <span className="text-xs text-muted-foreground font-normal">
                                {column.data_type}
                              </span>
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={tableData.columns.length} className="text-center py-8">
                            <div className="text-muted-foreground">
                              {searchQuery ? 'No matching data found' : 'No data in this table'}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredData.map((row, index) => (
                          <TableRow key={index}>
                            {tableData.columns.map((column) => (
                              <TableCell key={column.column_name} className="min-w-32 max-w-64 truncate">
                                {formatValue(row[column.column_name])}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </ScrollArea>
            </div>
          </div>
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