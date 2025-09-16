import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ColumnMapping {
  authUserIdColumn: string;
  nameColumn?: string;
  emailColumn?: string;
  phoneColumn?: string;
  avatarColumn?: string;
}

interface UserContactConfig {
  contactsTable: string;
  columnMapping: ColumnMapping;
  enabled: boolean;
}

interface UserContactConfigState {
  config: UserContactConfig | null;
  isConfigured: boolean;
  
  // Actions
  setConfig: (config: UserContactConfig) => void;
  updateColumnMapping: (mapping: Partial<ColumnMapping>) => void;
  setContactsTable: (tableName: string) => void;
  setEnabled: (enabled: boolean) => void;
  resetConfig: () => void;
}

export const useUserContactConfig = create<UserContactConfigState>()(
  persist(
    (set, get) => ({
      config: null,
      isConfigured: false,

      setConfig: (config) => {
        set({ 
          config, 
          isConfigured: !!(config.contactsTable && config.columnMapping.authUserIdColumn)
        });
      },

      updateColumnMapping: (mapping) => {
        const currentConfig = get().config;
        if (!currentConfig) return;
        
        const updatedConfig = {
          ...currentConfig,
          columnMapping: { ...currentConfig.columnMapping, ...mapping }
        };
        
        set({ 
          config: updatedConfig,
          isConfigured: !!(updatedConfig.contactsTable && updatedConfig.columnMapping.authUserIdColumn)
        });
      },

      setContactsTable: (tableName) => {
        const currentConfig = get().config;
        const updatedConfig = currentConfig 
          ? { ...currentConfig, contactsTable: tableName }
          : { contactsTable: tableName, columnMapping: { authUserIdColumn: '' }, enabled: true };
        
        set({ 
          config: updatedConfig,
          isConfigured: !!(updatedConfig.contactsTable && updatedConfig.columnMapping.authUserIdColumn)
        });
      },

      setEnabled: (enabled) => {
        const currentConfig = get().config;
        if (!currentConfig) return;
        
        set({ config: { ...currentConfig, enabled } });
      },

      resetConfig: () => {
        set({ config: null, isConfigured: false });
      },
    }),
    {
      name: 'user-contact-config',
    }
  )
);