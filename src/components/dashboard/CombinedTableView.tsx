import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  RefreshCw, 
  Search, 
  Database, 
  Eye, 
  FileText, 
  ExternalLink,
  Download,
  Filter,
  ChevronDown,
  Check
} from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboard';
import { TableSchemaModal } from './TableSchemaModal';
import { TableDataModal } from './TableDataModal';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface TableData {
  columns: string[];
  data: Record<string, any>[];
  total: number;
}

export const CombinedTableView: React.FC = () => {
  const {
    supabaseTables,
    tablesLoading,
    tablesError,
    selectedTable,
    tableSchemaModalOpen,
    tableDataModalOpen,
    setSelectedTable,
    setTableSchemaModalOpen,
    setTableDataModalOpen,
    fetchSupabaseTables,
    connections
  } = useDashboardStore();

  const [tableDropdownOpen, setTableDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTable, setCurrentTable] = useState<string>('');
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    if (connections.supabase.connected) {
      fetchSupabaseTables();
    }
  }, [connections.supabase.connected, fetchSupabaseTables]);

  useEffect(() => {
    if (supabaseTables.length > 0 && !currentTable) {
      setCurrentTable(supabaseTables[0].name);
    }
  }, [supabaseTables, currentTable]);

  useEffect(() => {
    if (currentTable) {
      fetchTableData(currentTable);
    }
  }, [currentTable]);

  const fetchTableData = async (tableName: string) => {
    setDataLoading(true);
    setDataError(null);
    
    try {
      const response = await fetch(`/api/database/table-data/${tableName}?limit=50&offset=0`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const data = Array.isArray(result.data) ? result.data : [];
          const columns = data.length > 0 ? Object.keys(data[0]) : [];
          setTableData({
            columns,
            data,
            total: data.length
          });
        }
      } else {
        const error = await response.json();
        setDataError(error.message || 'Failed to fetch table data');
      }
    } catch (error) {
      setDataError('Network error occurred');
    } finally {
      setDataLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    if (!tableData || !searchQuery) return tableData?.data || [];
    
    return tableData.data.filter(row =>
      Object.values(row).some(value =>
        String(value).toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
  }, [tableData, searchQuery]);

  const handleViewSchema = (tableName: string) => {
    setSelectedTable(tableName);
    setTableSchemaModalOpen(true);
  };

  const handleViewData = (tableName: string) => {
    setSelectedTable(tableName);
    setTableDataModalOpen(true);
  };

  const handleOpenInSupabase = (tableName: string) => {
    if (connections.supabase.url) {
      const baseUrl = connections.supabase.url.replace('/rest/v1', '');
      window.open(`${baseUrl}/_/editor/${tableName}`, '_blank');
    }
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'string' && value.length > 50) {
      return value.substring(0, 47) + '...';
    }
    return String(value);
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
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Database Tables
              {supabaseTables.length > 0 && (
                <Badge variant="secondary">{supabaseTables.length}</Badge>
              )}
            </CardTitle>
            <Button
              onClick={fetchSupabaseTables}
              variant="outline"
              size="sm"
              disabled={tablesLoading}
            >
              <RefreshCw className={`h-4 w-4 ${tablesLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          
          {/* Table Selector and Operations */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Popover open={tableDropdownOpen} onOpenChange={setTableDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={tableDropdownOpen}
                    className="w-full justify-between"
                    disabled={tablesLoading}
                  >
                    {currentTable || "Select table..."}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search tables..." />
                    <CommandList>
                      <CommandEmpty>No tables found.</CommandEmpty>
                      <CommandGroup>
                        {supabaseTables.map((table) => (
                          <CommandItem
                            key={table.name}
                            value={table.name}
                            onSelect={() => {
                              setCurrentTable(table.name);
                              setTableDropdownOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                currentTable === table.name ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex items-center gap-2">
                              <span>{table.name}</span>
                              <Badge variant="outline" className="text-xs">
                                {table.schema}
                              </Badge>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            
            {/* Table Operations */}
            {currentTable && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleViewSchema(currentTable)}
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Schema
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleViewData(currentTable)}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View All
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleOpenInSupabase(currentTable)}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Search Bar */}
          {currentTable && tableData && (
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search table data..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          )}
        </CardHeader>

        <CardContent>
          {tablesLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Loading tables...</p>
            </div>
          ) : currentTable ? (
            <div className="space-y-4">
              {/* Table Stats */}
              {tableData && (
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{tableData.columns.length} columns</span>
                  <span>{tableData.total} rows</span>
                  {searchQuery && (
                    <span>{filteredData.length} filtered</span>
                  )}
                </div>
              )}

              {/* Table Content */}
              {dataLoading ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading data...</p>
                </div>
              ) : dataError ? (
                <div className="text-center py-8">
                  <p className="text-destructive mb-2">{dataError}</p>
                  <Button variant="outline" size="sm" onClick={() => fetchTableData(currentTable)}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </div>
              ) : tableData && tableData.data.length > 0 ? (
                <ScrollArea className="h-96 w-full border rounded-lg">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0 z-10">
                        <tr>
                          {tableData.columns.map((column) => (
                            <th key={column} className="px-4 py-2 text-left font-medium border-b">
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredData.map((row, index) => (
                          <tr key={index} className="hover:bg-muted/25 border-b">
                            {tableData.columns.map((column) => (
                              <td key={column} className="px-4 py-2 font-mono text-xs">
                                {formatValue(row[column])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No data found in this table</p>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <TableSchemaModal
        open={tableSchemaModalOpen}
        onOpenChange={setTableSchemaModalOpen}
        tableName={selectedTable}
      />

      <TableDataModal
        open={tableDataModalOpen}
        onOpenChange={setTableDataModalOpen}
        tableName={selectedTable}
      />
    </>
  );
};