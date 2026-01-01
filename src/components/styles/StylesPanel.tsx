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

    // Group properties by category
    const getPropertiesByCategory = () => {
        const grouped: Record<string, string[]> = {};

        getAllCategories().forEach(category => {
            const categoryProps = styles.activeProperties.filter(propId => {
                const categoryPropertyIds = CSS_CATEGORIES[category as keyof typeof CSS_CATEGORIES] || [];
                return categoryPropertyIds.includes(propId);
            });

            if (categoryProps.length > 0) {
                grouped[category] = categoryProps;
            }
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

                    {!hasProperties ? (
                        <div className="text-center py-8 text-sm text-muted-foreground">
                            No properties added yet. Click "Add Property" to get started.
                        </div>
                    ) : (
                        <Accordion type="multiple" defaultValue={Object.keys(categorizedProperties)} className="w-full">
                            {Object.entries(categorizedProperties).map(([category, propertyIds]) => (
                                <AccordionItem key={category} value={category}>
                                    <AccordionTrigger className="text-sm font-semibold">
                                        {category} ({propertyIds.length})
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <div className="space-y-2 pt-2">
                                            {propertyIds.map((propertyId) => {
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
                                            })}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    )}
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
