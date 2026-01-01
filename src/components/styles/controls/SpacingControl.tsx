import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import type { SpacingValue } from '@/lib/styles/types';

interface SpacingControlProps {
    value: SpacingValue;
    onChange: (value: SpacingValue) => void;
}

export const SpacingControl: React.FC<SpacingControlProps> = ({
    value,
    onChange
}) => {
    const [mode, setMode] = useState<'all' | 'custom'>(
        value.top === value.right && value.right === value.bottom && value.bottom === value.left
            ? 'all'
            : 'custom'
    );

    const handleAllChange = (newValue: number) => {
        onChange({
            top: newValue,
            right: newValue,
            bottom: newValue,
            left: newValue
        });
    };

    const handleSideChange = (side: keyof SpacingValue, newValue: number) => {
        onChange({
            ...value,
            [side]: newValue
        });
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-end">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMode(mode === 'all' ? 'custom' : 'all')}
                    className="text-xs"
                >
                    {mode === 'all' ? 'Custom' : 'All Sides'}
                </Button>
            </div>

            {mode === 'all' ? (
                <div className="flex items-center gap-2">
                    <Input
                        type="number"
                        value={value.top}
                        onChange={(e) => handleAllChange(parseInt(e.target.value) || 0)}
                        min={0}
                        className="flex-1"
                    />
                    <span className="text-sm text-muted-foreground">All Sides</span>
                </div>
            ) : (
                <div className="grid grid-cols-4 gap-2">
                    <div className="flex flex-col items-center gap-1">
                        <ArrowUp className="h-3 w-3 text-muted-foreground" />
                        <Input
                            type="number"
                            value={value.top}
                            onChange={(e) => handleSideChange('top', parseInt(e.target.value) || 0)}
                            min={0}
                            className="text-center"
                        />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <Input
                            type="number"
                            value={value.right}
                            onChange={(e) => handleSideChange('right', parseInt(e.target.value) || 0)}
                            min={0}
                            className="text-center"
                        />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <ArrowDown className="h-3 w-3 text-muted-foreground" />
                        <Input
                            type="number"
                            value={value.bottom}
                            onChange={(e) => handleSideChange('bottom', parseInt(e.target.value) || 0)}
                            min={0}
                            className="text-center"
                        />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <ArrowLeft className="h-3 w-3 text-muted-foreground" />
                        <Input
                            type="number"
                            value={value.left}
                            onChange={(e) => handleSideChange('left', parseInt(e.target.value) || 0)}
                            min={0}
                            className="text-center"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
