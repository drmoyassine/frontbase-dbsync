import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RendererProps } from '../types';

export const SelectRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => (
    <Select>
        <SelectTrigger className={combinedClassName} style={inlineStyles}>
            <SelectValue placeholder={effectiveProps.placeholder || 'Select an option'} />
        </SelectTrigger>
        <SelectContent>
            {(effectiveProps.options || ['Option 1', 'Option 2', 'Option 3']).map((option: string, index: number) => (
                <SelectItem key={index} value={option.toLowerCase().replace(/\s+/g, '-')}>
                    {option}
                </SelectItem>
            ))}
        </SelectContent>
    </Select>
);
