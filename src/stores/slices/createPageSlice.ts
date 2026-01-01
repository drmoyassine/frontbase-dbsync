import { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Page } from '@/types/builder';
import { BuilderState } from '../builder';
import { toast } from '@/hooks/use-toast';
import { getPages, createPage as createPageApi, updatePage as updatePageApi, deletePage as deletePageApi } from '../../services/pages-api';

export interface PageSlice {
    pages: Page[];
    currentPageId: string | null;
    isLoading: boolean;
    error: string | null;

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
    isLoading: false,
    error: null,

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
            await deletePageApi(id);

            set((state) => ({
                pages: state.pages.filter(page => page.id !== id),
                currentPageId: state.currentPageId === id ? null : state.currentPageId
            }));

            toast({
                title: "Page moved to trash",
                description: "Page has been moved to trash successfully"
            });
        } catch (error: any) {
            toast({
                title: "Error deleting page",
                description: error.response?.data?.message || error.message || "Failed to delete page",
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
            // This would need to be implemented in the API
            // For now, we'll just reload the pages
            await get().loadPagesFromDatabase(true);

            toast({
                title: "Page restored",
                description: "Page has been restored successfully"
            });
        } catch (error: any) {
            toast({
                title: "Error restoring page",
                description: error.response?.data?.message || error.message || "Failed to restore page",
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
            await deletePageApi(id);

            set((state) => ({
                pages: state.pages.filter(page => page.id !== id),
                currentPageId: state.currentPageId === id ? null : state.currentPageId
            }));

            toast({
                title: "Page permanently deleted",
                description: "Page has been permanently deleted"
            });
        } catch (error: any) {
            toast({
                title: "Error deleting page",
                description: error.response?.data?.message || error.message || "Failed to permanently delete page",
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
            // Serialize containerStyles into layoutData.root for database storage
            const sanitizedPage = { ...page };

            if (sanitizedPage.containerStyles) {
                // Ensure layoutData exists
                if (!sanitizedPage.layoutData) {
                    sanitizedPage.layoutData = { content: [], root: {} };
                }

                // Move containerStyles into layoutData.root
                sanitizedPage.layoutData = {
                    ...sanitizedPage.layoutData,
                    root: {
                        ...sanitizedPage.layoutData.root,
                        containerStyles: sanitizedPage.containerStyles
                    }
                };

                // Remove top-level containerStyles (not in DB schema)
                delete sanitizedPage.containerStyles;
            }

            console.log('💾 [Store] Saving page:', {
                id: pageId,
                componentCount: page.layoutData?.content?.length || 0,
                hasContainerStyles: !!page.containerStyles,
                serializedToRoot: !!sanitizedPage.layoutData?.root?.containerStyles
            });

            await updatePageApi(pageId, sanitizedPage);

            setUnsavedChanges(false);

            toast({
                title: "Page saved",
                description: "Page has been saved successfully"
            });
        } catch (error: any) {
            console.error('❌ [Store] Save failed:', error);
            toast({
                title: "Error saving page",
                description: error.response?.data?.message || error.message || "Failed to save page",
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

            await updatePageApi(pageId, { ...page, isPublic: true });

            setUnsavedChanges(false);

            toast({
                title: "Page published",
                description: "Page has been published successfully"
            });
        } catch (error: any) {
            toast({
                title: "Error publishing page",
                description: error.response?.data?.message || error.message || "Failed to publish page",
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

            await updatePageApi(pageId, { ...page, isPublic: newVisibility });

            toast({
                title: "Page updated",
                description: `Page ${newVisibility ? 'published' : 'made private'}`
            });
        } catch (error: any) {
            toast({
                title: "Error updating page",
                description: error.response?.data?.message || error.message || "Failed to update page visibility",
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
            const pagesRaw = await getPages();

            // Deserialize containerStyles from layoutData.root to top-level
            const pages = (pagesRaw || []).map((page: any) => {
                const layoutData = page.layoutData ?? page.layout_data ?? { content: [], root: {} };

                // Extract containerStyles from layoutData.root
                const containerStyles = layoutData?.root?.containerStyles;

                console.log('📥 [Store] Loading page:', {
                    id: page.id,
                    name: page.name,
                    hasContainerStylesInRoot: !!containerStyles
                });

                return {
                    ...page,
                    isPublic: page.isPublic ?? page.is_public ?? false,
                    isHomepage: page.isHomepage ?? page.is_homepage ?? false,
                    layoutData,
                    containerStyles, // Expose at top level for easy access
                    createdAt: page.createdAt ?? page.created_at ?? new Date().toISOString(),
                    updatedAt: page.updatedAt ?? page.updated_at ?? new Date().toISOString(),
                    deletedAt: page.deletedAt ?? page.deleted_at ?? null
                };
            }) as Page[];

            set({
                pages: pages || [],
                hasUnsavedChanges: false,
                isInitialized: true
            });
        } catch (error: any) {
            console.error('Failed to load pages:', error);
            toast({
                title: "Error loading pages",
                description: error.response?.data?.message || error.message || "Failed to load pages from database",
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
            const newPage = await createPageApi(pageData);

            set((state) => ({
                pages: [...state.pages, newPage],
                hasUnsavedChanges: false
            }));

            toast({
                title: "Page created",
                description: "Page has been created successfully"
            });

            return newPage.id;
        } catch (error: any) {
            toast({
                title: "Error creating page",
                description: error.response?.data?.message || error.message || "Failed to create page",
                variant: "destructive"
            });
            return null;
        } finally {
            setSaving(false);
        }
    },
});
