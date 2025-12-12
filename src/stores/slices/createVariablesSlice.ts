import { StateCreator } from 'zustand';
import { AppVariable } from '@/types/builder';
import { BuilderState } from '../builder';
import { toast } from '@/hooks/use-toast';

export interface VariablesSlice {
    appVariables: AppVariable[];
    addAppVariable: (variable: Omit<AppVariable, 'id' | 'createdAt'>) => void;
    updateAppVariable: (id: string, updates: Partial<AppVariable>) => void;
    deleteAppVariable: (id: string) => void;
    loadVariablesFromDatabase: () => Promise<void>;
}

export const createVariablesSlice: StateCreator<BuilderState, [], [], VariablesSlice> = (set, get) => ({
    appVariables: [],

    loadVariablesFromDatabase: async () => {
        try {
            const { variableAPI } = await import('@/lib/api');
            const result = await variableAPI.getAllVariables();

            if (result.success && result.data) {
                set({ appVariables: result.data.data || result.data });
            }
        } catch (error) {
            console.error('Failed to load variables:', error);
        }
    },

    addAppVariable: async (variableData) => {
        const { setSaving } = get();
        setSaving(true);
        try {
            const { variableAPI } = await import('@/lib/api');
            const result = await variableAPI.createVariable(variableData);

            if (result.success && result.data) {
                set((state) => ({
                    appVariables: [...state.appVariables, result.data.data || result.data]
                }));
                toast({
                    title: "Variable created",
                    description: "App variable has been created successfully"
                });
            } else {
                throw new Error(result.error || 'Failed to create variable');
            }
        } catch (error) {
            toast({
                title: "Error creating variable",
                description: error instanceof Error ? error.message : "Failed to create variable",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },

    updateAppVariable: async (id, updates) => {
        const { setSaving } = get();
        setSaving(true);
        try {
            const { variableAPI } = await import('@/lib/api');
            const result = await variableAPI.updateVariable(id, updates);

            if (result.success && result.data) {
                const updatedVar = result.data.data || result.data;
                set((state) => ({
                    appVariables: state.appVariables.map(variable =>
                        variable.id === id ? updatedVar : variable
                    )
                }));
                toast({
                    title: "Variable updated",
                    description: "App variable has been updated successfully"
                });
            } else {
                throw new Error(result.error || 'Failed to update variable');
            }
        } catch (error) {
            toast({
                title: "Error updating variable",
                description: error instanceof Error ? error.message : "Failed to update variable",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },

    deleteAppVariable: async (id) => {
        const { setSaving } = get();
        setSaving(true);
        try {
            const { variableAPI } = await import('@/lib/api');
            const result = await variableAPI.deleteVariable(id);

            if (result.success) {
                set((state) => ({
                    appVariables: state.appVariables.filter(variable => variable.id !== id)
                }));
                toast({
                    title: "Variable deleted",
                    description: "App variable has been deleted successfully"
                });
            } else {
                throw new Error(result.error || 'Failed to delete variable');
            }
        } catch (error) {
            toast({
                title: "Error deleting variable",
                description: error instanceof Error ? error.message : "Failed to delete variable",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },
});
