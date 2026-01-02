import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { SelectControl } from './controls/SelectControl';
import { NumberControl } from './controls/NumberControl';
import { ColorControl } from './controls/ColorControl';
import { SpacingControl } from './controls/SpacingControl';
import { CompositeControl } from './controls/CompositeControl';
import { ToggleGroupControl } from './controls/ToggleGroupControl';
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
    // Determine if this control type needs full width (toggle groups, spacing)
    const needsFullWidth = config.useToggleGroup || config.controlType === 'spacing' || config.controlType === 'composite';

    return (
        <div className="property-control border border-border rounded-md p-2 mb-2 bg-background/50">
            <div className={`flex items-center gap-2 ${needsFullWidth ? 'flex-col items-stretch' : 'justify-between'}`}>
                {/* Label row with remove button */}
                <div className="flex items-center justify-between min-w-0 flex-shrink-0">
                    <Label className="font-medium text-xs whitespace-nowrap">{config.name}</Label>
                    {needsFullWidth && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onRemove}
                            className="h-5 w-5 p-0 ml-2"
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    )}
                </div>

                {/* Control input */}
                <div className={`property-control-input flex-1 ${needsFullWidth ? '' : 'max-w-[60%]'}`}>
                    {config.controlType === 'select' && config.useToggleGroup && (
                        <ToggleGroupControl config={config} value={value} onChange={onChange} />
                    )}

                    {config.controlType === 'select' && !config.useToggleGroup && (
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

                {/* Remove button for inline controls */}
                {!needsFullWidth && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onRemove}
                        className="h-5 w-5 p-0 flex-shrink-0"
                    >
                        <X className="h-3 w-3" />
                    </Button>
                )}
            </div>
        </div>
    );
};
