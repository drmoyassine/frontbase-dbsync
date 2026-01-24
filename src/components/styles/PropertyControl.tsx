import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { X, HelpCircle } from 'lucide-react';
import { SelectControl } from './controls/SelectControl';
import { NumberControl } from './controls/NumberControl';
import { ColorControl } from './controls/ColorControl';
import { SpacingControl } from './controls/SpacingControl';
import { SizingControl } from './controls/SizingControl';
import { DimensionControl } from './controls/DimensionControl';
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
    return (
        <div className="property-control border border-border rounded-md p-2 mb-2 bg-background/50">
            {/* Label with optional tooltip */}
            <div className="flex items-center gap-1 mb-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {config.name}
                </Label>
                {config.description && (
                    <TooltipProvider delayDuration={300}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[200px] text-xs">
                                {config.description}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>

            <div className="flex items-center gap-2 justify-between">
                {/* Control input - takes remaining space */}
                <div className="property-control-input flex-1">
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

                    {config.controlType === 'sizing' && (
                        <SizingControl value={value} onChange={onChange} />
                    )}

                    {config.controlType === 'dimension' && (
                        <DimensionControl
                            value={value}
                            onChange={onChange}
                            dimension={(config as any).dimension || 'width'}
                            placeholder={(config as any).defaultValue?.value === 'none' ? 'none' : 'auto'}
                        />
                    )}
                </div>

                {/* Remove button */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRemove}
                    className="h-5 w-5 p-0 flex-shrink-0"
                >
                    <X className="h-3 w-3" />
                </Button>
            </div>
        </div>
    );
};
