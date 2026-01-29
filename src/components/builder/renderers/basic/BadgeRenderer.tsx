import React from 'react';
import { Badge } from '@/components/ui/badge';
import { RendererProps } from '../types';
import { ICON_MAP } from '@/components/builder/properties/IconPicker';

export const BadgeRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, createEditableText }) => {
    const iconName = effectiveProps.icon;
    const iconPosition = effectiveProps.iconPosition || 'left';
    const IconComponent = iconName ? ICON_MAP[iconName] : null;

    // Custom color styles
    const customStyles: React.CSSProperties = {};
    if (effectiveProps.backgroundColor) customStyles.backgroundColor = effectiveProps.backgroundColor;
    if (effectiveProps.textColor) customStyles.color = effectiveProps.textColor;

    return (
        <Badge
            variant={effectiveProps.variant || 'default'}
            className={combinedClassName}
            style={customStyles}
        >
            {IconComponent && iconPosition === 'left' && (
                <IconComponent
                    className="w-3 h-3 mr-1.5"
                    style={effectiveProps.iconColor ? { color: effectiveProps.iconColor } : undefined}
                />
            )}
            {createEditableText(effectiveProps.text || 'Now in Private Alpha', 'text', '')}
            {IconComponent && iconPosition === 'right' && (
                <IconComponent
                    className="w-3 h-3 ml-1.5"
                    style={effectiveProps.iconColor ? { color: effectiveProps.iconColor } : undefined}
                />
            )}
        </Badge>
    );
};
