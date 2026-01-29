import React from 'react';
import { cn } from '@/lib/utils';
import { RendererProps } from '../types';
import { ICON_MAP } from '@/components/builder/properties/IconPicker';

export const IconRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => {
    const iconName = effectiveProps.icon || effectiveProps.name || 'Star';
    const size = effectiveProps.size || 'md';
    const color = effectiveProps.color || 'currentColor';

    // Size classes
    const sizeClasses = {
        xs: 'w-4 h-4',
        sm: 'w-6 h-6',
        md: 'w-8 h-8',
        lg: 'w-10 h-10',
        xl: 'w-12 h-12',
    };

    const sizeClass = sizeClasses[size as keyof typeof sizeClasses] || sizeClasses.md;

    // Check if it's an emoji (short string with no URL characters)
    const isEmoji = iconName.length <= 4 && !/^[a-zA-Z0-9\/]/.test(iconName);
    // Check if it's an image URL
    const isUrl = iconName.startsWith('http') || iconName.startsWith('/');

    if (isUrl) {
        return (
            <img
                src={iconName}
                alt=""
                className={cn('object-contain', sizeClass, combinedClassName)}
                style={{ ...inlineStyles }}
            />
        );
    }

    if (isEmoji) {
        // Render as emoji
        return (
            <span
                className={cn('inline-flex items-center justify-center', sizeClass, combinedClassName)}
                style={{ ...inlineStyles }}
            >
                {iconName}
            </span>
        );
    }

    // Try to render as Lucide icon
    const IconComponent = ICON_MAP[iconName];
    if (IconComponent) {
        return (
            <IconComponent
                className={cn(sizeClass, combinedClassName)}
                style={{ color, ...inlineStyles }}
            />
        );
    }

    // Fallback: render as text
    return (
        <span
            className={cn('inline-flex items-center justify-center', sizeClass, combinedClassName)}
            style={{ color, ...inlineStyles }}
        >
            {iconName}
        </span>
    );
};
