import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { PropertySelector } from './PropertySelector';
import { PropertyControl } from './PropertyControl';
import { CSSEditor } from './CSSEditor';
import { CSS_PROPERTY_CONFIGS, CSS_CATEGORIES, getAllCategories } from '@/lib/styles/configs';
import { stylesToCSS } from '@/lib/styles/converters';
import type { StylesData } from '@/lib/styles/types';
import {
    LayoutGrid,
    Space,
    Maximize2,
    Type,
    Palette,
    Sparkles,
    LucideIcon
} from 'lucide-react';

// Category icons mapping
const CATEGORY_ICONS: Record<string, LucideIcon> = {
    'Layout': LayoutGrid,
    'Spacing': Space,
    'Sizing': Maximize2,
    'Typography': Type,
    'Colors': Palette,
    'Effects': Sparkles,
};

interface StylesPanelProps {
    styles: StylesData;
    onUpdate: (styles: StylesData) => void;
    title?: string;
}

export const StylesPanel: React.FC<StylesPanelProps> = ({
    styles,
    onUpdate,
    title = 'Styles'
}) => {
    const addProperty = (propertyId: string) => {
        const config = CSS_PROPERTY_CONFIGS[propertyId];
        if (!config) return;

        onUpdate({
            ...styles,
            activeProperties: [...styles.activeProperties, propertyId],
            values: {
                ...styles.values,
                [propertyId]: config.defaultValue
            }
        });
    };

    const removeProperty = (propertyId: string) => {
        const newActive = styles.activeProperties.filter(p => p !== propertyId);
        const newValues = { ...styles.values };
        delete newValues[propertyId];

        onUpdate({
            ...styles,
            activeProperties: newActive,
            values: newValues
        });
    };

    const updateValues = (newValues: any) => {
        onUpdate({
            ...styles,
            values: newValues
        });
    };

    const toggleMode = () => {
        onUpdate({
            ...styles,
            stylingMode: styles.stylingMode === 'visual' ? 'css' : 'visual'
        });
    };

    // Group properties by category - ALWAYS include all categories
    const getPropertiesByCategory = () => {
        const grouped: Record<string, string[]> = {};

        // Initialize ALL categories (even empty ones)
        getAllCategories().forEach(category => {
            grouped[category] = [];
        });

        // Then populate with active properties
        getAllCategories().forEach(category => {
            const categoryProps = styles.activeProperties.filter(propId => {
                const categoryPropertyIds = CSS_CATEGORIES[category as keyof typeof CSS_CATEGORIES] || [];
                return categoryPropertyIds.includes(propId);
            });

            grouped[category] = categoryProps;
        });

        return grouped;
    };

    const categorizedProperties = getPropertiesByCategory();
    const hasProperties = styles.activeProperties.length > 0;

    return (
        <div className="styles-panel space-y-4">
            {title && (
                <h3 className="font-semibold text-sm">{title}</h3>
            )}

            {/* Styling Mode Toggle */}
            <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                    <Button
                        variant={styles.stylingMode === 'visual' ? 'default' : 'outline'}
                        onClick={toggleMode}
                        size="sm"
                    >
                        Visual
                    </Button>
                    <Button
                        variant={styles.stylingMode === 'css' ? 'default' : 'outline'}
                        onClick={toggleMode}
                        size="sm"
                    >
                        CSS (Advanced)
                    </Button>
                </div>
            </div>

            <Separator />

            {styles.stylingMode === 'visual' ? (
                /* VISUAL MODE */
                <>
                    <PropertySelector
                        excludeProperties={styles.activeProperties}
                        onSelect={addProperty}
                    />

                    <Accordion type="multiple" defaultValue={[]} className="w-full">
                        {Object.entries(categorizedProperties).map(([category, propertyIds]) => {
                            const CategoryIcon = CATEGORY_ICONS[category];
                            return (
                                <AccordionItem key={category} value={category}>
                                    <AccordionTrigger className="text-sm font-semibold">
                                        <span className="flex items-center gap-2">
                                            {CategoryIcon && <CategoryIcon className="h-4 w-4 text-muted-foreground" />}
                                            {category} ({propertyIds.length})
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <div className="space-y-2 pt-2">
                                            {propertyIds.length === 0 ? (
                                                <div className="text-xs text-muted-foreground text-center py-2">
                                                    No properties. Add via + button above.
                                                </div>
                                            ) : (
                                                propertyIds.map((propertyId) => {
                                                    const config = CSS_PROPERTY_CONFIGS[propertyId];
                                                    if (!config) return null;

                                                    return (
                                                        <PropertyControl
                                                            key={propertyId}
                                                            config={config}
                                                            value={styles.values[propertyId]}
                                                            onChange={(value) => updateValues({ ...styles.values, [propertyId]: value })}
                                                            onRemove={() => removeProperty(propertyId)}
                                                        />
                                                    );
                                                })
                                            )}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            );
                        })}
                    </Accordion>
                </>
            ) : (
                /* CSS MODE */
                <CSSEditor
                    css={stylesToCSS(styles.values)}
                    readOnly
                />
            )}
        </div>
    );
};
