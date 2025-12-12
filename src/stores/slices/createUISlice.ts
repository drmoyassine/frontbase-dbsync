import { StateCreator } from 'zustand';
import { BuilderState } from '../builder';

export interface UISlice {
    // Builder state
    isPreviewMode: boolean;
    isSaving: boolean;
    isLoading: boolean;
    hasUnsavedChanges: boolean;

    // Responsive state
    currentViewport: 'mobile' | 'tablet' | 'desktop';
    zoomLevel: number;
    showDeviceFrame: boolean;

    // Supabase connection
    isSupabaseConnected: boolean;
    supabaseTables: any[];
    isInitialized: boolean;

    // Actions
    setPreviewMode: (isPreview: boolean) => void;
    setSaving: (saving: boolean) => void;
    setLoading: (loading: boolean) => void;
    setUnsavedChanges: (hasChanges: boolean) => void;
    setCurrentViewport: (viewport: 'mobile' | 'tablet' | 'desktop') => void;
    setZoomLevel: (zoom: number) => void;
    setShowDeviceFrame: (show: boolean) => void;
    setSupabaseConnection: (connected: boolean, tables?: any[]) => void;
}

export const createUISlice: StateCreator<BuilderState, [], [], UISlice> = (set) => ({
    isPreviewMode: false,
    isSaving: false,
    isLoading: false,
    hasUnsavedChanges: false,

    currentViewport: 'desktop',
    zoomLevel: 100,
    showDeviceFrame: true,

    isSupabaseConnected: false,
    supabaseTables: [],
    isInitialized: false,

    setPreviewMode: (isPreview) => set({ isPreviewMode: isPreview }),
    setSaving: (saving) => set({ isSaving: saving }),
    setLoading: (loading) => set({ isLoading: loading }),
    setUnsavedChanges: (hasChanges) => set({ hasUnsavedChanges: hasChanges }),
    setCurrentViewport: (viewport) => set({ currentViewport: viewport }),
    setZoomLevel: (zoom) => set({ zoomLevel: zoom }),
    setShowDeviceFrame: (show) => set({ showDeviceFrame: show }),
    setSupabaseConnection: (connected, tables) => set({ isSupabaseConnected: connected, supabaseTables: tables || [] }),
});
