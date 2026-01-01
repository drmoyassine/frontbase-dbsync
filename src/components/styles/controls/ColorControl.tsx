import React from 'react';
import { Input } from '@/components/ui/input';

interface ColorControlProps {
    value: string;
    onChange: (value: string) => void;
}

export const ColorControl: React.FC<ColorControlProps> = ({
    value,
    onChange
}) => {
    return (
        <div className="flex items-center gap-2">
            <input
                type="color"
                value={value === 'transparent' ? '#FFFFFF' : value}
                onChange={(e) => onChange(e.target.value)}
                className="w-12 h-10 rounded border border-border cursor-pointer"
            />
            <Input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="#000000"
                className="flex-1 font-mono text-sm"
            />
        </div>
    );
};
