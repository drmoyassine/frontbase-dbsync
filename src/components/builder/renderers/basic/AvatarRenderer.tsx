import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RendererProps } from '../types';

export const AvatarRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => (
    <Avatar className={combinedClassName} style={inlineStyles}>
        <AvatarImage src={effectiveProps.src} alt={effectiveProps.alt || 'Avatar'} />
        <AvatarFallback>{effectiveProps.fallback || 'U'}</AvatarFallback>
    </Avatar>
);
