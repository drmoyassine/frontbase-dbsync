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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Settings,
    Palette,
    Zap,
    Eye,
    EyeOff,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    AlignVerticalJustifyStart,
    AlignVerticalJustifyCenter,
    AlignVerticalJustifyEnd,
    Package,
    Plus,
    Filter,
    Play
} from 'lucide-react';
import type { Page, ContainerStyles } from '@/types/builder';

interface PageSettingsDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const PageSettingsDrawer: React.FC<PageSettingsDrawerProps> = ({
    open,
    onOpenChange,
}) => {
    const { currentPageId, pages, updatePage } = useBuilderStore();
    const [activeTab, setActiveTab] = useState<string>('basic');

    const currentPage = pages.find((p) => p.id === currentPageId);

    if (!currentPage) return null;

    const containerStyles = currentPage.containerStyles || {};

    const handleUpdatePage = (updates: Partial<Page>) => {
        if (currentPageId) {
            updatePage(currentPageId, updates);
        }
    };

    const handleStyleChange = (key: keyof ContainerStyles, value: any) => {
        const newStyles: ContainerStyles = {
            ...containerStyles,
            [key]: value
        };
        handleUpdatePage({ containerStyles: newStyles });
    };

    const handlePaddingChange = (value: number) => {
        handleStyleChange('padding', {
            top: value,
            right: value,
            bottom: value,
            left: value
        });
    };

    const currentPadding = containerStyles.padding?.top || 50;

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
                        <div className="rounded-lg border border-border p-4 bg-muted/30">
                            <h3 className="font-semibold mb-4">Container Layout</h3>

                            {/* Orientation */}
                            <div className="space-y-2 mb-4">
                                <Label>Orientation</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        variant={containerStyles.orientation === 'row' ? 'default' : 'outline'}
                                        className="justify-start"
                                        onClick={() => handleStyleChange('orientation', 'row')}
                                    >
                                        Row
                                    </Button>
                                    <Button
                                        variant={containerStyles.orientation === 'column' ? 'default' : 'outline'}
                                        className="justify-start"
                                        onClick={() => handleStyleChange('orientation', 'column')}
                                    >
                                        Column
                                    </Button>
                                </div>
                            </div>

                            {/* Gap */}
                            <div className="space-y-2 mb-4">
                                <Label>Gap</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        value={containerStyles.gap || 30}
                                        onChange={(e) => handleStyleChange('gap', parseInt(e.target.value) || 0)}
                                        className="flex-1"
                                    />
                                    <span className="text-sm text-muted-foreground">px</span>
                                </div>
                            </div>

                            {/* Flex Wrap */}
                            <div className="space-y-2 mb-4">
                                <Label>Flex Wrap</Label>
                                <Select
                                    value={containerStyles.flexWrap || 'nowrap'}
                                    onValueChange={(value: any) => handleStyleChange('flexWrap', value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="nowrap">No Wrap</SelectItem>
                                        <SelectItem value="wrap">Wrap</SelectItem>
                                        <SelectItem value="wrap-reverse">Wrap Reverse</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Align Items */}
                            <div className="space-y-2 mb-4">
                                <Label>Align Items</Label>
                                <div className="grid grid-cols-4 gap-2">
                                    <Button
                                        variant={containerStyles.alignItems === 'start' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => handleStyleChange('alignItems', 'start')}
                                    >
                                        <AlignVerticalJustifyStart className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant={containerStyles.alignItems === 'center' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => handleStyleChange('alignItems', 'center')}
                                    >
                                        <AlignVerticalJustifyCenter className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant={containerStyles.alignItems === 'end' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => handleStyleChange('alignItems', 'end')}
                                    >
                                        <AlignVerticalJustifyEnd className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant={containerStyles.alignItems === 'stretch' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => handleStyleChange('alignItems', 'stretch')}
                                    >
                                        Stretch
                                    </Button>
                                </div>
                            </div>

                            {/* Justify Content */}
                            <div className="space-y-2 mb-4">
                                <Label>Justify Content</Label>
                                <div className="grid grid-cols-5 gap-2">
                                    <Button
                                        variant={containerStyles.justifyContent === 'start' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => handleStyleChange('justifyContent', 'start')}
                                    >
                                        <AlignLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant={containerStyles.justifyContent === 'center' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => handleStyleChange('justifyContent', 'center')}
                                    >
                                        <AlignCenter className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant={containerStyles.justifyContent === 'end' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => handleStyleChange('justifyContent', 'end')}
                                    >
                                        <AlignRight className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant={containerStyles.justifyContent === 'between' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => handleStyleChange('justifyContent', 'between')}
                                    >
                                        <AlignJustify className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant={containerStyles.justifyContent === 'around' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => handleStyleChange('justifyContent', 'around')}
                                    >
                                        Around
                                    </Button>
                                </div>
                            </div>

                            {/* Background Color */}
                            <div className="space-y-2 mb-4">
                                <Label>Background Color</Label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={containerStyles.backgroundColor || '#FFFFFF'}
                                        onChange={(e) => handleStyleChange('backgroundColor', e.target.value)}
                                        className="w-10 h-10 rounded border border-border cursor-pointer"
                                    />
                                    <Input
                                        type="text"
                                        value={containerStyles.backgroundColor || '#FFFFFF'}
                                        onChange={(e) => handleStyleChange('backgroundColor', e.target.value)}
                                        placeholder="#FFFFFF"
                                        className="flex-1"
                                    />
                                </div>
                            </div>

                            {/* Padding */}
                            <div className="space-y-2 mb-4">
                                <div className="flex items-center justify-between">
                                    <Label>Padding</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        value={currentPadding}
                                        onChange={(e) => handlePaddingChange(parseInt(e.target.value) || 0)}
                                        className="flex-1"
                                    />
                                    <span className="text-sm text-muted-foreground">All Sides</span>
                                </div>
                            </div>

                            {/* Styling Mode */}
                            <div className="space-y-2">
                                <Label>Styling Mode</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        variant={containerStyles.stylingMode !== 'css' ? 'outline' : 'ghost'}
                                        onClick={() => handleStyleChange('stylingMode', 'visual')}
                                    >
                                        Visual
                                    </Button>
                                    <Button
                                        variant={containerStyles.stylingMode === 'css' ? 'outline' : 'ghost'}
                                        onClick={() => handleStyleChange('stylingMode', 'css')}
                                    >
                                        CSS (Advanced)
                                    </Button>
                                </div>
                            </div>
                        </div>
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
            </SheetContent>
        </Sheet>
    );
};
