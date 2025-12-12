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
import { Settings, Save, RotateCcw, Plus, Trash2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export function UserContactConfigPanel() {
  const { config, setConfig, setContactsTable, resetConfig } = useUserContactConfig();
  const { schemas, loadTableSchema, initialize, connected, connectionError } = useDataBindingStore();
  const { fetchConnections } = useDashboardStore();
  const { toast } = useToast();

  // Local state for form
  const [selectedTable, setSelectedTable] = useState('');
  const [columns, setColumns] = useState({
    authUserIdColumn: '',
    contactIdColumn: '',
    contactTypeColumn: '',
    permissionLevelColumn: '',
    nameColumn: '',
    emailColumn: '',
    phoneColumn: '',
    avatarColumn: ''
  });
  const [enabled, setEnabledState] = useState(true);
  const [contactTypes, setContactTypes] = useState<Record<string, string>>({});
  const [permissionLevels, setPermissionLevels] = useState<Record<string, string>>({});

  // Initialize data binding store
  useEffect(() => {
    const initializeStores = async () => {
      await fetchConnections();
      initialize();
    };
    initializeStores();
  }, [fetchConnections, initialize]);

  // Load initial config
  useEffect(() => {
    if (config) {
      setSelectedTable(config.contactsTable);
      setColumns({
        authUserIdColumn: config.columnMapping.authUserIdColumn || '',
        contactIdColumn: config.columnMapping.contactIdColumn || '',
        contactTypeColumn: config.columnMapping.contactTypeColumn || '',
        permissionLevelColumn: config.columnMapping.permissionLevelColumn || '',
        nameColumn: config.columnMapping.nameColumn || '',
        emailColumn: config.columnMapping.emailColumn || '',
        phoneColumn: config.columnMapping.phoneColumn || '',
        avatarColumn: config.columnMapping.avatarColumn || ''
      });
      setContactTypes(config.contactTypes || {});
      setPermissionLevels(config.permissionLevels || {});
      setEnabledState(config.enabled);

      if (config.contactsTable) {
        loadTableSchema(config.contactsTable);
      }
    }
  }, [config, loadTableSchema]);

  const tableSchema = selectedTable ? schemas.get(selectedTable) : null;
  const availableColumns = tableSchema?.columns || [];

  const handleTableChange = async (tableName: string) => {
    setSelectedTable(tableName);
    if (tableName) {
      await loadTableSchema(tableName);
    }
  };

  const handleSave = () => {
    if (!selectedTable || !columns.authUserIdColumn || !columns.contactIdColumn || !columns.contactTypeColumn || !columns.permissionLevelColumn) {
      toast({
        title: "Missing Configuration",
        description: "Please select a table and all required columns (marked with *)",
        variant: "destructive"
      });
      return;
    }

    setConfig({
      contactsTable: selectedTable,
      columnMapping: {
        authUserIdColumn: columns.authUserIdColumn,
        contactIdColumn: columns.contactIdColumn,
        contactTypeColumn: columns.contactTypeColumn,
        permissionLevelColumn: columns.permissionLevelColumn,
        nameColumn: columns.nameColumn || undefined,
        emailColumn: columns.emailColumn || undefined,
        phoneColumn: columns.phoneColumn || undefined,
        avatarColumn: columns.avatarColumn || undefined,
      },
      contactTypes,
      permissionLevels,
      enabled
    });

    toast({
      title: "Configuration Saved",
      description: "User contact data configuration has been updated",
    });
  };

  // Helper for Key-Value editors
  const KeyValueEditor = ({ title, data, onChange }: { title: string, data: Record<string, string>, onChange: (d: Record<string, string>) => void }) => {
    return (
      <div className="space-y-2 border p-3 rounded-md">
        <div className="flex justify-between items-center">
          <h4 className="text-sm font-medium">{title}</h4>
          <Button variant="ghost" size="sm" onClick={() => onChange({ ...data, [`new_${Object.keys(data).length + 1}`]: 'New Item' })}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
          {Object.entries(data).map(([key, value], idx) => (
            <div key={idx} className="flexgap-2 items-center">
              <Input
                className="h-8 text-xs w-1/3"
                value={key}
                onChange={(e) => {
                  const newData = { ...data };
                  delete newData[key];
                  newData[e.target.value] = value;
                  onChange(newData);
                }}
                placeholder="Key (e.g. admin)"
              />
              <Input
                className="h-8 text-xs flex-1"
                value={value}
                onChange={(e) => onChange({ ...data, [key]: e.target.value })}
                placeholder="Label"
              />
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => {
                const newData = { ...data };
                delete newData[key];
                onChange(newData);
              }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {Object.keys(data).length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No items defined</p>}
        </div>
      </div>
    );
  };

  const ColumnSelect = ({ label, field, required = false }: { label: string, field: keyof typeof columns, required?: boolean }) => (
    <div>
      <Label className="text-xs">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <Select value={columns[field]} onValueChange={(val) => setColumns(prev => ({ ...prev, [field]: val }))}>
        <SelectTrigger className="h-8">
          <SelectValue placeholder="Select column" />
        </SelectTrigger>
        <SelectContent>
          {availableColumns.map((c) => (
            <SelectItem key={c.name} value={c.name}>{c.name} ({c.type})</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          User Contact Data Configuration
        </CardTitle>
        <CardDescription>
          Map your Supabase contact table to system users
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center space-x-2">
          <Switch id="enable-user-sync" checked={enabled} onCheckedChange={setEnabledState} />
          <Label htmlFor="enable-user-sync">Enable user contact data sync</Label>
        </div>

        {!connected && (
          <div className="p-4 border border-amber-200 bg-amber-50 rounded-lg text-sm text-amber-800">
            {connectionError || 'Database not connected. Please configure your Supabase connection first.'}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label htmlFor="contacts-table">Contacts Table</Label>
            <TableSelector
              value={selectedTable}
              onValueChange={handleTableChange}
              placeholder="Select contact table"
              disabled={!connected}
            />
          </div>

          {selectedTable && (
            <div className="space-y-4">
              <Separator />
              <h4 className="font-medium text-sm">Required Mapping</h4>
              <div className="grid grid-cols-2 gap-4">
                <ColumnSelect label="Contact ID (PK)" field="contactIdColumn" required />
                <ColumnSelect label="Auth User ID (FK)" field="authUserIdColumn" required />
                <ColumnSelect label="Contact Type" field="contactTypeColumn" required />
                <ColumnSelect label="Permission Level" field="permissionLevelColumn" required />
              </div>

              <h4 className="font-medium text-sm mt-4">Optional Display Mapping</h4>
              <div className="grid grid-cols-2 gap-4">
                <ColumnSelect label="Name" field="nameColumn" />
                <ColumnSelect label="Email" field="emailColumn" />
                <ColumnSelect label="Phone" field="phoneColumn" />
                <ColumnSelect label="Avatar" field="avatarColumn" />
              </div>

              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <KeyValueEditor title="Contact Types (User Groups)" data={contactTypes} onChange={setContactTypes} />
                <KeyValueEditor title="Permission Levels" data={permissionLevels} onChange={setPermissionLevels} />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={resetConfig}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!selectedTable}>
            <Save className="h-4 w-4 mr-2" />
            Save Configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}