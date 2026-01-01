import React from 'react';
import { useBuilderStore } from '@/stores/builder';
import { componentTemplates, ComponentTemplate } from '@/lib/templates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export const TemplatesBrowser: React.FC = () => {
    const [searchQuery, setSearchQuery] = React.useState('');
    const [selectedCategory, setSelectedCategory] = React.useState<ComponentTemplate['category'] | 'all'>('all');

    const { moveComponent, currentPageId } = useBuilderStore();

    const categories: Array<{ id: ComponentTemplate['category'] | 'all'; label: string }> = [
        { id: 'all', label: 'All' },
        { id: 'hero', label: 'Heroes' },
        { id: 'navigation', label: 'Navigation' },
        { id: 'footer', label: 'Footers' },
        { id: 'form', label: 'Forms' },
        { id: 'content', label: 'Content' },
        { id: 'cta', label: 'CTAs' }
    ];

    const filteredTemplates = componentTemplates.filter(template => {
        const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
        const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

        return matchesCategory && matchesSearch;
    });

    const handleTemplateClick = (template: ComponentTemplate) => {
        if (!currentPageId) return;

        // Add template components to canvas
        template.components.forEach((component, index) => {
            const newComponent = {
                ...component,
                id: `template-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`
            };

            // Add to end of page
            moveComponent(currentPageId, null, newComponent, index, undefined, undefined);
        });
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b space-y-3">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Templates</h3>
                    <Badge variant="secondary" className="ml-auto">
                        {filteredTemplates.length}
                    </Badge>
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search templates..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>

                {/* Category Tabs */}
                <Tabs value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as any)} className="w-full">
                    <TabsList className="w-full justify-start overflow-x-auto">
                        {categories.map(cat => (
                            <TabsTrigger key={cat.id} value={cat.id} className="text-xs">
                                {cat.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            {/* Templates Grid */}
            <div className="flex-1 overflow-y-auto p-4">
                {filteredTemplates.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-20" />
                        <p className="text-sm">No templates found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3">
                        {filteredTemplates.map(template => (
                            <div
                                key={template.id}
                                onClick={() => handleTemplateClick(template)}
                                className={cn(
                                    "p-4 rounded-lg border-2 border-border bg-card",
                                    "hover:border-primary hover:bg-accent cursor-pointer",
                                    "transition-all duration-200",
                                    "group"
                                )}
                            >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <h4 className="font-medium text-sm group-hover:text-primary transition-colors">
                                        {template.name}
                                    </h4>
                                    <Badge variant="outline" className="text-xs">
                                        {template.category}
                                    </Badge>
                                </div>

                                <p className="text-xs text-muted-foreground mb-3">
                                    {template.description}
                                </p>

                                <div className="flex flex-wrap gap-1">
                                    {template.tags.slice(0, 3).map(tag => (
                                        <Badge key={tag} variant="secondary" className="text-xs">
                                            {tag}
                                        </Badge>
                                    ))}
                                    {template.tags.length > 3 && (
                                        <Badge variant="secondary" className="text-xs">
                                            +{template.tags.length - 3}
                                        </Badge>
                                    )}
                                </div>

                                <div className="mt-3 pt-3 border-t border-border/50">
                                    <p className="text-xs text-muted-foreground">
                                        Click to add to canvas →
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
