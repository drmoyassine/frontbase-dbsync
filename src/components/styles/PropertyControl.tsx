import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { SelectControl } from './controls/SelectControl';
import { NumberControl } from './controls/NumberControl';
import { ColorControl } from './controls/ColorControl';
import { SpacingControl } from './controls/SpacingControl';
import { CompositeControl } from './controls/CompositeControl';
import type { CSSPropertyConfig } from '@/lib/styles/types';

interface PropertyControlProps {
    config: CSSPropertyConfig;
    value: any;
    onChange: (value: any) => void;
    onRemove: () => void;
}

export const PropertyControl: React.FC<PropertyControlProps> = ({
    config,
    value,
    onChange,
    onRemove
}) => {
    return (
        <div className="property-control border border-border rounded-lg p-3 mb-3 bg-background/50">
            <div className="flex items-center justify-between mb-3">
                <Label className="font-semibold text-sm">{config.name}</Label>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRemove}
                    className="h-6 w-6 p-0"
                >
                    <X className="h-3 w-3" />
                </Button>
            </div>

            <div className="property-control-input">
                {config.controlType === 'select' && (
                    <SelectControl config={config} value={value} onChange={onChange} />
                )}

                {config.controlType === 'number' && (
                    <NumberControl config={config} value={value} onChange={onChange} />
                )}

                {config.controlType === 'color' && (
                    <ColorControl value={value} onChange={onChange} />
                )}

                {config.controlType === 'spacing' && (
                    <SpacingControl value={value} onChange={onChange} />
                )}

                {config.controlType === 'composite' && (
                    <CompositeControl config={config} value={value} onChange={onChange} />
                )}
            </div>

            {config.description && (
                <p className="text-xs text-muted-foreground mt-2">
                    {config.description}
                </p>
            )}
        </div>
    );
};
