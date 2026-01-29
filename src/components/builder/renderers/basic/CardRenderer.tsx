/**
 * Card Renderer
 * 
 * Enhanced Card component with built-in icon, title, description support.
 * Supports alignment and color customization for feature card layouts.
 */

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { RendererProps } from '../types';
import { ICON_MAP } from '../../properties/IconPicker';

// Icon size mappings
const ICON_SIZE_MAP = {
    sm: 24,
    md: 32,
    lg: 48,
};

// Get Lucide icon component by name from the shared map
const getIconComponent = (iconName: string): React.ComponentType<{ size?: number; color?: string; className?: string }> | null => {
    if (!iconName) return null;
    return (ICON_MAP as any)[iconName] || null;
};

export const CardRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, children }) => {
    const {
        title,
        description,
        content,
        // New icon & alignment props
        icon,
        iconSize = 'md',
        iconColor = 'hsl(var(--primary))', // Use hsl() for CSS variable
        iconAlignment = 'center',
        textAlignment = 'center',
    } = effectiveProps;



    // Check if we have children components - if so, they ARE the content
    const hasChildren = React.Children.count(children) > 0;

    // Get icon component
    const IconComponent = icon ? getIconComponent(icon) : null;
    const iconSizeValue = ICON_SIZE_MAP[iconSize as keyof typeof ICON_SIZE_MAP] || 32;

    // Alignment mappings
    const alignMap = {
        left: 'flex-start',
        center: 'center',
        right: 'flex-end',
    };

    const textAlignMap = {
        left: 'left' as const,
        center: 'center' as const,
        right: 'right' as const,
    };

    // Feature card mode: has icon OR (title + description without children)
    const isFeatureMode = IconComponent && !hasChildren;

    if (isFeatureMode) {
        return (
            <Card className={combinedClassName} style={inlineStyles}>
                <CardContent className="p-6">
                    <div
                        className="flex flex-col gap-4"
                        style={{
                            alignItems: alignMap[iconAlignment as keyof typeof alignMap] || 'center',
                            textAlign: textAlignMap[textAlignment as keyof typeof textAlignMap] || 'center',
                        }}
                    >
                        {/* Icon */}
                        <div
                            className="flex"
                            style={{
                                justifyContent: alignMap[iconAlignment as keyof typeof alignMap] || 'center',
                            }}
                        >
                            <IconComponent
                                size={iconSizeValue}
                                color={iconColor}
                            />
                        </div>

                        {/* Title */}
                        {title && (
                            <h3 className="text-lg font-semibold">
                                {title}
                            </h3>
                        )}

                        {/* Description */}
                        {description && (
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {description}
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Default card mode: standard header + content
    return (
        <Card className={combinedClassName} style={inlineStyles}>
            {/* Only show header if we have title/description AND no children */}
            {(!hasChildren && (title || description)) && (
                <CardHeader>
                    {title && <CardTitle>{title}</CardTitle>}
                    {description && <CardDescription>{description}</CardDescription>}
                </CardHeader>
            )}
            <CardContent className={hasChildren ? 'p-4' : ''}>
                {hasChildren ? children : (content && <p>{content}</p>)}
            </CardContent>
        </Card>
    );
};
