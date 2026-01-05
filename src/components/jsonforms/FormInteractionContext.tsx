import React, { createContext, useContext } from 'react';

interface FormInteractionContextType {
    /** Called when a field is clicked (for focus tracking) */
    onFieldClick?: (fieldName: string) => void;
    /** Whether builder mode is active (enables inline settings popover) */
    isBuilderMode?: boolean;
    /** Current field overrides */
    fieldOverrides?: Record<string, any>;
    /** Called when field settings change (for builder mode) */
    onFieldOverrideChange?: (fieldName: string, updates: any) => void;
}

const FormInteractionContext = createContext<FormInteractionContextType>({});

export const useFormInteraction = () => useContext(FormInteractionContext);

export const FormInteractionProvider: React.FC<{
    onFieldClick?: (fieldName: string) => void;
    isBuilderMode?: boolean;
    fieldOverrides?: Record<string, any>;
    onFieldOverrideChange?: (fieldName: string, updates: any) => void;
    children: React.ReactNode;
}> = ({ onFieldClick, isBuilderMode, fieldOverrides, onFieldOverrideChange, children }) => {
    return (
        <FormInteractionContext.Provider value={{
            onFieldClick,
            isBuilderMode,
            fieldOverrides,
            onFieldOverrideChange
        }}>
            {children}
        </FormInteractionContext.Provider>
    );
};
