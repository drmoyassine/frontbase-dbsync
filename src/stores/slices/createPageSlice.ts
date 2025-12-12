import { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Page } from '@/types/builder';
import { BuilderState } from '../builder';
import { toast } from '@/hooks/use-toast';

export interface PageSlice {
    pages: Page[];
    currentPageId: string | null;

    createPage: (page: Omit<Page, 'id' | 'createdAt' | 'updatedAt'>) => void;
    updatePage: (id: string, updates: Partial<Page>) => void;
    deletePage: (id: string) => Promise<void>;
    restorePage: (id: string) => Promise<void>;
    permanentDeletePage: (id: string) => Promise<void>;
    setCurrentPage: (id: string) => void;
    setCurrentPageId: (id: string | null) => void;

    // Database integration
    savePageToDatabase: (pageId: string) => Promise<void>;
    publishPage: (pageId: string) => Promise<void>;
    togglePageVisibility: (pageId: string) => Promise<void>;
    loadPagesFromDatabase: (includeDeleted?: boolean) => Promise<void>;
    createPageInDatabase: (pageData: Omit<Page, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string | null>;
}

export const createPageSlice: StateCreator<BuilderState, [], [], PageSlice> = (set, get) => ({
    pages: [],
    currentPageId: null,

    setCurrentPage: (id) => set({ currentPageId: id }),
    setCurrentPageId: (id) => set({ currentPageId: id }),

    createPage: (pageData) => {
        const newPage: Page = {
            ...pageData,
            id: uuidv4(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        set((state) => ({
            pages: [...state.pages, newPage],
            currentPageId: newPage.id
        }));
    },

    updatePage: (id, updates) => set((state) => ({
        pages: state.pages.map(page =>
            page.id === id
                ? { ...page, ...updates, updatedAt: new Date().toISOString() }
                : page
        ),
        hasUnsavedChanges: true
    })),

    deletePage: async (id) => {
        const { setSaving } = get();
        setSaving(true);
        try {
            const { pageAPI } = await import('@/lib/api');
            const result = await pageAPI.deletePage(id);

            if (!result.success) {
                throw new Error(result.error || 'Failed to delete page');
            }

            set((state) => ({
                pages: state.pages.filter(page => page.id !== id),
                currentPageId: state.currentPageId === id ? null : state.currentPageId
            }));

            toast({
                title: "Page moved to trash",
                description: "Page has been moved to trash successfully"
            });
        } catch (error) {
            toast({
                title: "Error deleting page",
                description: error instanceof Error ? error.message : "Failed to delete page",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },

    restorePage: async (id) => {
        const { setSaving } = get();
        setSaving(true);
        try {
            const { pageAPI } = await import('@/lib/api');
            const result = await pageAPI.restorePage(id);

            if (!result.success) {
                throw new Error(result.error || 'Failed to restore page');
            }

            await get().loadPagesFromDatabase(true);

            toast({
                title: "Page restored",
                description: "Page has been restored successfully"
            });
        } catch (error) {
            toast({
                title: "Error restoring page",
                description: error instanceof Error ? error.message : "Failed to restore page",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },

    permanentDeletePage: async (id) => {
        const { setSaving } = get();
        setSaving(true);
        try {
            const { pageAPI } = await import('@/lib/api');
            const result = await pageAPI.permanentDeletePage(id);

            if (!result.success) {
                throw new Error(result.error || 'Failed to permanently delete page');
            }

            set((state) => ({
                pages: state.pages.filter(page => page.id !== id),
                currentPageId: state.currentPageId === id ? null : state.currentPageId
            }));

            toast({
                title: "Page permanently deleted",
                description: "Page has been permanently deleted"
            });
        } catch (error) {
            toast({
                title: "Error deleting page",
                description: error instanceof Error ? error.message : "Failed to permanently delete page",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },

    savePageToDatabase: async (pageId: string) => {
        const { pages, setSaving, setUnsavedChanges } = get();
        const page = pages.find(p => p.id === pageId);
        if (!page) return;

        setSaving(true);
        try {
            const { pageAPI } = await import('@/lib/api');

            // Create a sanitized copy of the page
            const { layout_data, ...sanitizedPage } = page as any;

            if (page.layoutData) {
                sanitizedPage.layoutData = page.layoutData;
            }

            console.log('💾 Saving page:', {
                id: pageId,
                componentCount: page.layoutData?.content?.length || 0,
                hasLayoutData: !!sanitizedPage.layoutData
            });

            const result = await pageAPI.updatePage(pageId, sanitizedPage);

            if (!result.success) {
                throw new Error(result.error || 'Failed to save page');
            }

            setUnsavedChanges(false);

            toast({
                title: "Page saved",
                description: "Page has been saved successfully"
            });
        } catch (error) {
            toast({
                title: "Error saving page",
                description: error instanceof Error ? error.message : "Failed to save page",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },

    publishPage: async (pageId: string) => {
        const { pages, updatePage, setSaving, setUnsavedChanges } = get();
        const page = pages.find(p => p.id === pageId);
        if (!page) return;

        setSaving(true);
        try {
            updatePage(pageId, { isPublic: true });

            const { pageAPI } = await import('@/lib/api');
            const result = await pageAPI.updatePage(pageId, { ...page, isPublic: true });

            if (!result.success) {
                throw new Error(result.error || 'Failed to publish page');
            }

            setUnsavedChanges(false);

            toast({
                title: "Page published",
                description: "Page has been published successfully"
            });
        } catch (error) {
            toast({
                title: "Error publishing page",
                description: error instanceof Error ? error.message : "Failed to publish page",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },

    togglePageVisibility: async (pageId: string) => {
        const { pages, updatePage, setSaving } = get();
        const page = pages.find(p => p.id === pageId);
        if (!page) return;

        setSaving(true);
        try {
            const newVisibility = !page.isPublic;
            updatePage(pageId, { isPublic: newVisibility });

            const { pageAPI } = await import('@/lib/api');
            const result = await pageAPI.updatePage(pageId, { ...page, isPublic: newVisibility });

            if (!result.success) {
                throw new Error(result.error || 'Failed to update page visibility');
            }

            toast({
                title: "Page updated",
                description: `Page ${newVisibility ? 'published' : 'made private'}`
            });
        } catch (error) {
            toast({
                title: "Error updating page",
                description: error instanceof Error ? error.message : "Failed to update page visibility",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },

    loadPagesFromDatabase: async (includeDeleted = false) => {
        const { setLoading } = get();
        setLoading(true);
        try {
            const { pageAPI } = await import('@/lib/api');
            const result = await pageAPI.getAllPages(includeDeleted);

            if (result.success && result.data) {
                set({
                    pages: result.data.data || result.data,
                    hasUnsavedChanges: false,
                    isInitialized: true
                });
            }
        } catch (error) {
            console.error('Failed to load pages:', error);
            toast({
                title: "Error loading pages",
                description: "Failed to load pages from database",
                variant: "destructive"
            });
            set({ isInitialized: true });
        } finally {
            setLoading(false);
        }
    },

    createPageInDatabase: async (pageData) => {
        const { setSaving } = get();
        setSaving(true);

        try {
            const { pageAPI } = await import('@/lib/api');
            const result = await pageAPI.createPage(pageData);

            if (result.success && result.data) {
                const newPage = result.data.data || result.data;
                set((state) => ({
                    pages: [...state.pages, newPage],
                    hasUnsavedChanges: false
                }));

                toast({
                    title: "Page created",
                    description: "Page has been created successfully"
                });

                return newPage.id;
            } else {
                throw new Error(result.error || 'Failed to create page');
            }
        } catch (error) {
            toast({
                title: "Error creating page",
                description: error instanceof Error ? error.message : "Failed to create page",
                variant: "destructive"
            });
            return null;
        } finally {
            setSaving(false);
        }
    },
});
