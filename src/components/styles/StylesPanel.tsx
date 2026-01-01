import React from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { PropertySelector } from './PropertySelector';
import { PropertyList } from './PropertyList';
import { CSSEditor } from './CSSEditor';
import { CSS_PROPERTY_CONFIGS } from '@/lib/styles/configs';
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

                    <PropertyList
                        activeProperties={styles.activeProperties}
                        values={styles.values}
                        onUpdate={updateValues}
                        onRemove={removeProperty}
                    />
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
