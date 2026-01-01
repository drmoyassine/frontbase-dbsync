import React, { useState } from 'react';
import { useBuilderStore } from '@/stores/builder';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
    Settings,
    Palette,
    Zap,
    Eye,
    EyeOff,
    Package,
    Plus,
    Filter,
    Play
} from 'lucide-react';
import type { Page, StylesData } from '@/types/builder';
import { StylesPanel } from '@/components/styles/StylesPanel';
import { getDefaultPageStyles } from '@/lib/styles/defaults';
import { toast } from 'sonner';

interface PageSettingsDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const PageSettingsDrawer: React.FC<PageSettingsDrawerProps> = ({
    open,
    onOpenChange,
}) => {
    const { currentPageId, pages, updatePage, savePageToDatabase } = useBuilderStore();
    const [activeTab, setActiveTab] = useState<string>('basic');
    const [isSaving, setIsSaving] = useState(false);

    const currentPage = pages.find((p) => p.id === currentPageId);

    if (!currentPage) return null;

    // Convert old ContainerStyles to new StylesData if needed
    const getContainerStyles = (): StylesData => {
        if (!currentPage.containerStyles) {
            // No styles yet - use defaults  
            return getDefaultPageStyles();
        }

        // Check if it's already new format
        if ('activeProperties' in currentPage.containerStyles) {
            return currentPage.containerStyles as StylesData;
        }

        // Convert old format to new format
        const oldStyles = currentPage.containerStyles as any;
        const activeProperties: string[] = [];
        const values: Record<string, any> = {};

        if (oldStyles.orientation) {
            activeProperties.push('flexDirection');
            values.flexDirection = oldStyles.orientation;
        }
        if (oldStyles.gap !== undefined) {
            activeProperties.push('gap');
            values.gap = oldStyles.gap;
        }
        if (oldStyles.padding) {
            activeProperties.push('padding');
            values.padding = oldStyles.padding;
        }
        if (oldStyles.alignItems) {
            activeProperties.push('alignItems');
            values.alignItems = oldStyles.alignItems === 'start' ? 'flex-start' :
                oldStyles.alignItems === 'end' ? 'flex-end' : oldStyles.alignItems;
        }
        if (oldStyles.justifyContent) {
            activeProperties.push('justifyContent');
            values.justifyContent = oldStyles.justifyContent === 'start' ? 'flex-start' :
                oldStyles.justifyContent === 'end' ? 'flex-end' :
                    oldStyles.justifyContent === 'between' ? 'space-between' :
                        oldStyles.justifyContent === 'around' ? 'space-around' : oldStyles.justifyContent;
        }
        if (oldStyles.backgroundColor) {
            activeProperties.push('backgroundColor');
            values.backgroundColor = oldStyles.backgroundColor;
        }
        if (oldStyles.flexWrap) {
            activeProperties.push('flexWrap');
            values.flexWrap = oldStyles.flexWrap;
        }

        return {
            activeProperties,
            values,
            stylingMode: oldStyles.stylingMode || 'visual'
        };
    };

    const containerStyles = getContainerStyles();

    const handleUpdatePage = (updates: Partial<Page>) => {
        if (currentPageId) {
            updatePage(currentPageId, updates);
        }
    };

    const handleStylesUpdate = (newStyles: StylesData) => {
        handleUpdatePage({ containerStyles: newStyles });
    };

    const handleSave = async () => {
        if (!currentPageId) return;

        setIsSaving(true);
        try {
            await savePageToDatabase(currentPageId);
            onOpenChange(false);
        } catch (error) {
            console.error('Failed to save page:', error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
                <SheetHeader className="mb-6">
                    <SheetTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Page Settings
                    </SheetTitle>
                </SheetHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 mb-6">
                        <TabsTrigger value="basic" className="gap-2">
                            <Package className="h-4 w-4" />
                            Basic
                        </TabsTrigger>
                        <TabsTrigger value="styles" className="gap-2">
                            <Palette className="h-4 w-4" />
                            Styles
                        </TabsTrigger>
                        <TabsTrigger value="advanced" className="gap-2">
                            <Zap className="h-4 w-4" />
                            Advanced
                        </TabsTrigger>
                    </TabsList>

                    {/* BASIC TAB */}
                    <TabsContent value="basic" className="space-y-6">
                        {/* Page Name */}
                        <div className="space-y-2">
                            <Label htmlFor="pageName">Page Name</Label>
                            <Input
                                id="pageName"
                                value={currentPage.name}
                                onChange={(e) => handleUpdatePage({ name: e.target.value })}
                                placeholder="Enter page name"
                            />
                        </div>

                        {/* Page Slug */}
                        <div className="space-y-2">
                            <Label htmlFor="pageSlug">URL Slug</Label>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">/</span>
                                <Input
                                    id="pageSlug"
                                    value={currentPage.slug || ''}
                                    onChange={(e) => handleUpdatePage({ slug: e.target.value })}
                                    placeholder="page-slug"
                                    className="flex-1"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                URL-friendly path (e.g., about-us, contact)
                            </p>
                        </div>

                        {/* Page Title (SEO) */}
                        <div className="space-y-2">
                            <Label htmlFor="pageTitle">Page Title (SEO)</Label>
                            <Input
                                id="pageTitle"
                                value={currentPage.title || ''}
                                onChange={(e) => handleUpdatePage({ title: e.target.value })}
                                placeholder="Page title for search engines"
                                maxLength={60}
                            />
                            <p className="text-xs text-muted-foreground">
                                {(currentPage.title || '').length}/60 characters
                            </p>
                        </div>

                        {/* Page Description (SEO) */}
                        <div className="space-y-2">
                            <Label htmlFor="pageDescription">Page Description (SEO)</Label>
                            <Textarea
                                id="pageDescription"
                                value={currentPage.description || ''}
                                onChange={(e) => handleUpdatePage({ description: e.target.value })}
                                placeholder="Brief description for search engines"
                                rows={3}
                                maxLength={160}
                            />
                            <p className="text-xs text-muted-foreground">
                                {(currentPage.description || '').length}/160 characters
                            </p>
                        </div>

                        {/* Keywords */}
                        <div className="space-y-2">
                            <Label htmlFor="pageKeywords">Keywords</Label>
                            <Input
                                id="pageKeywords"
                                value={currentPage.keywords || ''}
                                onChange={(e) => handleUpdatePage({ keywords: e.target.value })}
                                placeholder="keyword1, keyword2, keyword3"
                            />
                        </div>

                        {/* Status */}
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <div className="flex items-center gap-2">
                                <Badge variant={currentPage.deletedAt ? 'destructive' : 'default'}>
                                    {currentPage.deletedAt ? 'Deleted' : 'Active'}
                                </Badge>
                                <Badge variant={currentPage.isPublic ? 'default' : 'outline'}>
                                    {currentPage.isPublic ? (
                                        <>
                                            <Eye className="h-3 w-3 mr-1" />
                                            Public
                                        </>
                                    ) : (
                                        <>
                                            <EyeOff className="h-3 w-3 mr-1" />
                                            Private
                                        </>
                                    )}
                                </Badge>
                                {currentPage.isHomepage && (
                                    <Badge variant="secondary">Homepage</Badge>
                                )}
                            </div>
                        </div>
                    </TabsContent>

                    {/* STYLES TAB */}
                    <TabsContent value="styles" className="space-y-6">
                        <StylesPanel
                            styles={containerStyles}
                            onUpdate={handleStylesUpdate}
                            title="Container Layout"
                        />
                    </TabsContent>

                    {/* ADVANCED TAB */}
                    <TabsContent value="advanced" className="space-y-6">
                        {/* Display Conditions - Placeholder */}
                        <div className="rounded-lg border border-border p-4 bg-muted/30">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Filter className="h-4 w-4 text-muted-foreground" />
                                    <h3 className="font-semibold">Display Conditions</h3>
                                </div>
                                <Button variant="ghost" size="sm">
                                    <Plus className="h-3 w-3" />
                                </Button>
                            </div>
                            <div className="flex items-center gap-2 p-3 rounded-md bg-background border border-dashed">
                                <Filter className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">Not configured</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                Control when this page is visible based on user conditions
                            </p>
                        </div>

                        <Separator />

                        {/* Page Load Actions - Placeholder */}
                        <div className="rounded-lg border border-border p-4 bg-muted/30">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Play className="h-4 w-4 text-muted-foreground" />
                                    <h3 className="font-semibold">Page Load Actions</h3>
                                </div>
                                <Button variant="ghost" size="sm">
                                    Configure Action
                                </Button>
                            </div>
                            <div className="flex items-center gap-2 p-3 rounded-md bg-background border border-dashed">
                                <Play className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">Not configured</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                Run actions automatically when this page loads
                            </p>
                        </div>

                        <Separator />

                        {/* Page History - Placeholder */}
                        <div className="rounded-lg border border-border p-4 bg-muted/30">
                            <div className="flex items-center gap-2 mb-3">
                                <h3 className="font-semibold">Page History</h3>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Save current changes to activate
                            </p>
                        </div>
                    </TabsContent>
                </Tabs>

                {/* Sticky Save/Close Buttons */}
                <div className="sticky bottom-0 left-0 right-0 mt-6 pt-4 pb-4 px-6 bg-background border-t border-border flex gap-2">
                    <Button
                        onClick={() => onOpenChange(false)}
                        variant="outline"
                        className="flex-1"
                        disabled={isSaving}
                    >
                        Close
                    </Button>
                    <Button
                        onClick={handleSave}
                        className="flex-1"
                        disabled={isSaving}
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
};
