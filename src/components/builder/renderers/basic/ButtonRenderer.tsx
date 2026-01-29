import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RendererProps } from '../types';
import { ICON_MAP } from '@/components/builder/properties/IconPicker';

// Helper to render a Lucide icon by name
const renderLucideIcon = (iconName: string, className?: string): React.ReactNode => {
    if (!iconName) return null;
    const IconComponent = ICON_MAP[iconName];
    if (!IconComponent) return null;
    return <IconComponent className={className} />;
};

export const ButtonRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, createEditableText }) => {
    return (
        <Button
            variant={effectiveProps.variant || 'default'}
            size={effectiveProps.size || 'default'}
            className={cn("gap-2", combinedClassName)}
            style={inlineStyles}
        >
            {renderLucideIcon(effectiveProps.leftIcon, "w-4 h-4")}
            {createEditableText(effectiveProps.text || 'Button', 'text', '')}
            {renderLucideIcon(effectiveProps.rightIcon, "w-4 h-4")}
        </Button>
    );
};
