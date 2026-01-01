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
    Package,
    Plus,
    Filter,
    Play
} from 'lucide-react';

interface PageSettingsDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const PageSettingsDrawer: React.FC<PageSettingsDrawerProps> = ({
    open,
    onOpenChange,
}) => {
    const { currentPageId, pages, updatePageMeta } = useBuilderStore();
    const [activeTab, setActiveTab] = useState<string>('basic');

    const currentPage = pages.find((p) => p.id === currentPageId);

    if (!currentPage) return null;

    const handleUpdateMeta = (key: string, value: any) => {
        if (currentPageId) {
            updatePageMeta(currentPageId, { [key]: value });
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
                                onChange={(e) => handleUpdateMeta('name', e.target.value)}
                                placeholder="Enter page name"
                            />
                        </div>

                        {/* Page Path */}
                        <div className="space-y-2">
                            <Label htmlFor="pagePath">Page Path</Label>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">/</span>
                                <Input
                                    id="pagePath"
                                    value={currentPage.path || ''}
                                    onChange={(e) => handleUpdateMeta('path', e.target.value)}
                                    placeholder="page-path"
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
                                value={currentPage.meta?.title || ''}
                                onChange={(e) => handleUpdateMeta('title', e.target.value)}
                                placeholder="Page title for search engines"
                            />
                        </div>

                        {/* Page Description (SEO) */}
                        <div className="space-y-2">
                            <Label htmlFor="pageDescription">Page Description (SEO)</Label>
                            <Textarea
                                id="pageDescription"
                                value={currentPage.meta?.description || ''}
                                onChange={(e) => handleUpdateMeta('description', e.target.value)}
                                placeholder="Brief description for search engines"
                                rows={3}
                            />
                        </div>

                        {/* Status */}
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <div className="flex items-center gap-2">
                                <Badge variant={currentPage.published ? 'default' : 'secondary'}>
                                    {currentPage.published ? 'Published' : 'Draft'}
                                </Badge>
                                <Badge variant={currentPage.visible ? 'default' : 'outline'}>
                                    {currentPage.visible ? (
                                        <>
                                            <Eye className="h-3 w-3 mr-1" />
                                            Visible
                                        </>
                                    ) : (
                                        <>
                                            <EyeOff className="h-3 w-3 mr-1" />
                                            Hidden
                                        </>
                                    )}
                                </Badge>
                            </div>
                        </div>
                    </TabsContent>

                    {/* STYLES TAB */}
                    <TabsContent value="styles" className="space-y-6">
                        <div className="rounded-lg border border-border p-4 bg-muted/30">
                            <h3 className="font-semibold mb-4">Container Layout</h3>

                            {/* Orientation */}
                            <div className="space-y-2 mb-4">
                                <Label className="flex items-center gap-2">
                                    Orientation
                                </Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button variant="outline" className="justify-start">
                                        Row
                                    </Button>
                                    <Button variant="ghost" className="justify-start">
                                        Column
                                    </Button>
                                </div>
                            </div>

                            {/* Gap */}
                            <div className="space-y-2 mb-4">
                                <Label className="flex items-center gap-2">
                                    Gap
                                </Label>
                                <div className="flex items-center gap-2">
                                    <Input type="number" defaultValue="30" className="flex-1" />
                                    <span className="text-sm text-muted-foreground">px</span>
                                </div>
                            </div>

                            {/* Flex Wrap */}
                            <div className="space-y-2 mb-4">
                                <Label className="flex items-center gap-2">
                                    Flex Wrap
                                </Label>
                                <Select defaultValue="nowrap">
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
                                <Label className="flex items-center gap-2">
                                    Align Items
                                </Label>
                                <div className="grid grid-cols-3 gap-2">
                                    <Button variant="outline" size="sm">
                                        <AlignLeft className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm">
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm">
                                        <AlignRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Justify Content */}
                            <div className="space-y-2 mb-4">
                                <Label className="flex items-center gap-2">
                                    Justify Content
                                </Label>
                                <div className="grid grid-cols-5 gap-2">
                                    <Button variant="outline" size="sm">
                                        <AlignLeft className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm">
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm">
                                        <AlignCenter className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm">
                                        <AlignJustify className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm">
                                        <AlignRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Background Color */}
                            <div className="space-y-2 mb-4">
                                <Label className="flex items-center gap-2">
                                    Background Color
                                </Label>
                                <div className="flex items-center gap-2">
                                    <div className="w-10 h-10 rounded border border-border bg-white cursor-pointer"></div>
                                    <Input type="text" placeholder="#FFFFFF" className="flex-1" />
                                </div>
                            </div>

                            {/* Padding */}
                            <div className="space-y-2 mb-4">
                                <div className="flex items-center justify-between">
                                    <Label className="flex items-center gap-2">
                                        Padding
                                    </Label>
                                    <Button variant="ghost" size="sm">
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input type="number" defaultValue="50" className="flex-1" />
                                    <span className="text-sm text-muted-foreground">All Sides</span>
                                </div>
                            </div>

                            {/* Styling Mode */}
                            <div className="space-y-2">
                                <Label>Styling Mode</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button variant="outline">Visual</Button>
                                    <Button variant="ghost">CSS (Advanced)</Button>
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
