import React from 'react';
import { Separator } from '@/components/ui/separator';
import { RendererProps } from '../types';

export const SeparatorRenderer: React.FC<RendererProps> = ({ combinedClassName, inlineStyles }) => (
    <Separator className={combinedClassName} style={inlineStyles} />
);
