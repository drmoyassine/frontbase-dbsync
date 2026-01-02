import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface SizeValue {
    width: number | 'auto';
    height: number | 'auto';
    widthUnit: 'px' | '%';
    heightUnit: 'px' | '%';
}

interface SizingControlProps {
    value: SizeValue;
    onChange: (value: SizeValue) => void;
}

const defaultValue: SizeValue = {
    width: 'auto',
    height: 'auto',
    widthUnit: 'px',
    heightUnit: 'px'
};

export const SizingControl: React.FC<SizingControlProps> = ({
    value = defaultValue,
    onChange
}) => {
    const safeValue = { ...defaultValue, ...value };

    const handleWidthChange = (newWidth: string) => {
        const parsed = newWidth === '' || newWidth === 'auto' ? 'auto' : parseInt(newWidth) || 0;
        onChange({ ...safeValue, width: parsed });
    };

    const handleHeightChange = (newHeight: string) => {
        const parsed = newHeight === '' || newHeight === 'auto' ? 'auto' : parseInt(newHeight) || 0;
        onChange({ ...safeValue, height: parsed });
    };

    const handleWidthUnitChange = (unit: 'px' | '%') => {
        onChange({ ...safeValue, widthUnit: unit });
    };

    const handleHeightUnitChange = (unit: 'px' | '%') => {
        onChange({ ...safeValue, heightUnit: unit });
    };

    return (
        <div className="flex items-center gap-2 w-full">
            {/* Width */}
            <div className="flex items-center gap-0.5 flex-1">
                <span className="text-[10px] text-muted-foreground">W</span>
                <Input
                    type="text"
                    value={safeValue.width === 'auto' ? '' : safeValue.width}
                    placeholder="auto"
                    onChange={(e) => handleWidthChange(e.target.value)}
                    className="w-12 h-7 text-xs text-center px-1"
                />
                <Select value={safeValue.widthUnit} onValueChange={handleWidthUnitChange}>
                    <SelectTrigger className="w-10 h-7 text-xs px-1">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="px">px</SelectItem>
                        <SelectItem value="%">%</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Height */}
            <div className="flex items-center gap-0.5 flex-1">
                <span className="text-[10px] text-muted-foreground">H</span>
                <Input
                    type="text"
                    value={safeValue.height === 'auto' ? '' : safeValue.height}
                    placeholder="auto"
                    onChange={(e) => handleHeightChange(e.target.value)}
                    className="w-12 h-7 text-xs text-center px-1"
                />
                <Select value={safeValue.heightUnit} onValueChange={handleHeightUnitChange}>
                    <SelectTrigger className="w-10 h-7 text-xs px-1">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="px">px</SelectItem>
                        <SelectItem value="%">%</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
};
