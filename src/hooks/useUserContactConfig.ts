import { useBuilderStore } from '@/stores/builder';
import { UserContactConfig } from '@/types/builder';
import { projectAPI } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

export const useUserContactConfig = () => {
  const { project, updateProject } = useBuilderStore();
  const { toast } = useToast();

  const config = project?.usersConfig || null;

  // Check if minimal required config is present
  const isConfigured = !!(
    config?.contactsTable &&
    config?.columnMapping?.authUserIdColumn &&
    config?.columnMapping?.contactIdColumn
  );

  const saveConfig = async (newConfig: UserContactConfig) => {
    // 1. Optimistic update
    updateProject({ usersConfig: newConfig });

    // 2. API Call
    try {
      const result = await projectAPI.updateProject({ usersConfig: newConfig });
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Failed to save users config:', error);
      toast({
        title: "Error saving configuration",
        description: "Failed to persist changes to the server.",
        variant: "destructive"
      });
      // Revert would go here if we tracked previous state
    }
  };

  const setConfig = (newConfig: UserContactConfig) => {
    saveConfig(newConfig);
  };

  const updateColumnMapping = (mapping: Partial<UserContactConfig['columnMapping']>) => {
    if (!config) return;
    const newConfig = {
      ...config,
      columnMapping: { ...config.columnMapping, ...mapping }
    };
    saveConfig(newConfig);
  };

  const setContactsTable = (tableName: string) => {
    if (!config) {
      // Initialize with defaults if no config exists
      saveConfig({
        contactsTable: tableName,
        columnMapping: {
          authUserIdColumn: '',
          contactIdColumn: '',
          contactTypeColumn: '',
          permissionLevelColumn: ''
        },
        contactTypes: {},
        permissionLevels: {},
        enabled: true
      });
    } else {
      saveConfig({ ...config, contactsTable: tableName });
    }
  };

  const setEnabled = (enabled: boolean) => {
    if (!config) return;
    saveConfig({ ...config, enabled });
  };

  const resetConfig = () => {
    if (project) {
      const { usersConfig, ...rest } = project;
      // We pass undefined/null to clear it. 
      // Note: API might need to handle null explicitely to delete. 
      // For now sending empty object or null.
      updateProject({ usersConfig: undefined }); // Local clear
      projectAPI.updateProject({ usersConfig: null }); // Server clear
    }
  };

  return {
    config,
    isConfigured,
    setConfig,
    updateColumnMapping,
    setContactsTable,
    setEnabled,
    resetConfig
  };
};