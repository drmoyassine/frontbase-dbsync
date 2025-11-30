import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { RendererProps } from './types';

export const InputRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => (
    <Input
        placeholder={effectiveProps.placeholder || 'Enter text...'}
        type={effectiveProps.type || 'text'}
        className={combinedClassName}
        style={inlineStyles}
        readOnly
    />
);

export const TextareaRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => (
    <Textarea
        placeholder={effectiveProps.placeholder || 'Enter text...'}
        className={combinedClassName}
        style={inlineStyles}
        rows={effectiveProps.rows || 3}
        readOnly
    />
);

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

export const CheckboxRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => (
    <div className={cn('flex items-center space-x-2', combinedClassName)} style={inlineStyles}>
        <Checkbox id={`checkbox-${Math.random()}`} />
        <label htmlFor={`checkbox-${Math.random()}`} className="text-sm">
            {effectiveProps.label || 'Checkbox'}
        </label>
    </div>
);

export const SwitchRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => (
    <div className={cn('flex items-center space-x-2', combinedClassName)} style={inlineStyles}>
        <Switch />
        <label className="text-sm">
            {effectiveProps.label || 'Toggle'}
        </label>
    </div>
);
