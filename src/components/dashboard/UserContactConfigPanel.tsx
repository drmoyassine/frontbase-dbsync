import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TableSelector } from '@/components/data-binding/TableSelector';
import { useUserContactConfig } from '@/hooks/useUserContactConfig';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { useDashboardStore } from '@/stores/dashboard';
import { useToast } from '@/hooks/use-toast';
import { Settings, Save, RotateCcw } from 'lucide-react';

export function UserContactConfigPanel() {
  const { config, setConfig, setContactsTable, updateColumnMapping, setEnabled, resetConfig } = useUserContactConfig();
  const { tables, loadTableSchema, schemas, initialize, connected, connectionError } = useDataBindingStore();
  const { fetchConnections } = useDashboardStore();
  const { toast } = useToast();
  
  const [selectedTable, setSelectedTable] = useState(config?.contactsTable || '');
  const [authUserIdColumn, setAuthUserIdColumn] = useState(config?.columnMapping.authUserIdColumn || '');
  const [nameColumn, setNameColumn] = useState(config?.columnMapping.nameColumn || '');
  const [emailColumn, setEmailColumn] = useState(config?.columnMapping.emailColumn || '');
  const [phoneColumn, setPhoneColumn] = useState(config?.columnMapping.phoneColumn || '');
  const [avatarColumn, setAvatarColumn] = useState(config?.columnMapping.avatarColumn || '');
  const [enabled, setEnabledState] = useState(config?.enabled ?? true);

  const tableSchema = selectedTable ? schemas.get(selectedTable) : null;
  const availableColumns = tableSchema?.columns || [];

  // Initialize data binding store and fetch connections on mount
  useEffect(() => {
    const initializeStores = async () => {
      await fetchConnections();
      initialize();
    };
    initializeStores();
  }, [fetchConnections, initialize]);

  const handleTableChange = async (tableName: string) => {
    setSelectedTable(tableName);
    setContactsTable(tableName);
    
    // Load schema for the selected table
    if (tableName) {
      await loadTableSchema(tableName);
    }
  };

  const handleSave = () => {
    if (!selectedTable || !authUserIdColumn) {
      toast({
        title: "Missing Configuration",
        description: "Please select a table and auth user ID column",
        variant: "destructive"
      });
      return;
    }

    const newConfig = {
      contactsTable: selectedTable,
      columnMapping: {
        authUserIdColumn,
        nameColumn: nameColumn || undefined,
        emailColumn: emailColumn || undefined,
        phoneColumn: phoneColumn || undefined,
        avatarColumn: avatarColumn || undefined,
      },
      enabled
    };

    setConfig(newConfig);
    
    toast({
      title: "Configuration Saved",
      description: "User contact data configuration has been updated",
    });
  };

  const handleReset = () => {
    resetConfig();
    setSelectedTable('');
    setAuthUserIdColumn('');
    setNameColumn('');
    setEmailColumn('');
    setPhoneColumn('');
    setAvatarColumn('');
    setEnabledState(true);
    
    toast({
      title: "Configuration Reset",
      description: "User contact configuration has been cleared",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          User Contact Data Configuration
        </CardTitle>
        <CardDescription>
          Configure how user contact data is synced with Supabase auth users
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center space-x-2">
          <Switch
            id="enable-user-sync"
            checked={enabled}
            onCheckedChange={setEnabledState}
          />
          <Label htmlFor="enable-user-sync">Enable user contact data sync</Label>
        </div>

        {!connected && (
          <div className="p-4 border border-amber-200 bg-amber-50 rounded-lg">
            <p className="text-sm text-amber-800">
              {connectionError || 'Database not connected. Please configure your Supabase connection first.'}
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label htmlFor="contacts-table">Contacts Table</Label>
            <TableSelector
              value={selectedTable}
              onValueChange={handleTableChange}
              placeholder="Select the table containing contact data"
              disabled={!connected}
            />
          </div>

          {selectedTable && (
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-medium">Column Mapping</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="auth-user-id-column">
                    Auth User ID Column <span className="text-red-500">*</span>
                  </Label>
                  <Select value={authUserIdColumn} onValueChange={setAuthUserIdColumn}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableColumns.map((column) => (
                        <SelectItem key={column.name} value={column.name}>
                          {column.name} ({column.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="name-column">Name Column (Optional)</Label>
                  <Select value={nameColumn} onValueChange={setNameColumn}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {availableColumns.map((column) => (
                        <SelectItem key={column.name} value={column.name}>
                          {column.name} ({column.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="email-column">Email Column (Optional)</Label>
                  <Select value={emailColumn} onValueChange={setEmailColumn}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {availableColumns.map((column) => (
                        <SelectItem key={column.name} value={column.name}>
                          {column.name} ({column.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="phone-column">Phone Column (Optional)</Label>
                  <Select value={phoneColumn} onValueChange={setPhoneColumn}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {availableColumns.map((column) => (
                        <SelectItem key={column.name} value={column.name}>
                          {column.name} ({column.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={!selectedTable || !authUserIdColumn}>
            <Save className="h-4 w-4 mr-2" />
            Save Configuration
          </Button>
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}