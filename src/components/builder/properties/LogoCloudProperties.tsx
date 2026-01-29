/**
 * Logo Cloud Properties Panel
 * 
 * Configuration UI for the LogoCloud component.
 * Allows editing logos, display mode, size, speed, and URLs.
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { Plus, Trash2, Image, Type, Grip } from 'lucide-react';

interface LogoItem {
    id: string;
    type: 'image' | 'text';
    value: string;
    url?: string;
}

interface LogoCloudPropertiesPanelProps {
    componentId: string;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const LogoCloudProperties: React.FC<LogoCloudPropertiesPanelProps> = ({
    componentId,
    props,
    updateComponentProp
}) => {
    const logos: LogoItem[] = props.logos || [];

    const addLogo = () => {
        const newLogo: LogoItem = {
            id: `logo-${Date.now()}`,
            type: 'text',
            value: 'Brand Name',
            url: '',
        };
        updateComponentProp('logos', [...logos, newLogo]);
    };

    const updateLogo = (index: number, updates: Partial<LogoItem>) => {
        const updated = logos.map((logo, i) =>
            i === index ? { ...logo, ...updates } : logo
        );
        updateComponentProp('logos', updated);
    };

    const removeLogo = (index: number) => {
        updateComponentProp('logos', logos.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-4">
            {/* Display Mode */}
            <div className="space-y-2">
                <Label>Display Mode</Label>
                <Select
                    value={props.displayMode || 'static'}
                    onValueChange={(value) => updateComponentProp('displayMode', value)}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="static">Static Grid</SelectItem>
                        <SelectItem value="marquee">Animated Marquee</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Logo Size */}
            <div className="space-y-2">
                <Label>Logo Size</Label>
                <Select
                    value={props.logoSize?.toString() || 'md'}
                    onValueChange={(value) => updateComponentProp('logoSize', value)}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="sm">Small (24px)</SelectItem>
                        <SelectItem value="md">Medium (32px)</SelectItem>
                        <SelectItem value="lg">Large (48px)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Marquee Options */}
            {props.displayMode === 'marquee' && (
                <>
                    <div className="space-y-2">
                        <Label>Animation Speed: {props.speed || 20}s</Label>
                        <Slider
                            value={[props.speed || 20]}
                            onValueChange={([value]) => updateComponentProp('speed', value)}
                            min={5}
                            max={60}
                            step={1}
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Pause on Hover</Label>
                        <Switch
                            checked={props.pauseOnHover !== false}
                            onCheckedChange={(checked) => updateComponentProp('pauseOnHover', checked)}
                        />
                    </div>
                </>
            )}

            {/* Grayscale Effect */}
            <div className="flex items-center justify-between">
                <Label>Grayscale Effect</Label>
                <Switch
                    checked={props.grayscale !== false}
                    onCheckedChange={(checked) => updateComponentProp('grayscale', checked)}
                />
            </div>

            {/* Logos List */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label>Logos ({logos.length})</Label>
                    <Button size="sm" variant="outline" onClick={addLogo}>
                        <Plus className="w-4 h-4 mr-1" /> Add
                    </Button>
                </div>

                <Accordion type="multiple" className="w-full">
                    {logos.map((logo, index) => (
                        <AccordionItem key={logo.id} value={logo.id}>
                            <AccordionTrigger className="text-sm py-2">
                                <div className="flex items-center gap-2">
                                    <Grip className="w-4 h-4 text-muted-foreground" />
                                    {logo.type === 'image' ? (
                                        <Image className="w-4 h-4" />
                                    ) : (
                                        <Type className="w-4 h-4" />
                                    )}
                                    <span className="truncate max-w-[150px]">
                                        {logo.value || `Logo ${index + 1}`}
                                    </span>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="space-y-3 pt-2">
                                {/* Type Toggle */}
                                <div className="space-y-1">
                                    <Label className="text-xs">Type</Label>
                                    <Select
                                        value={logo.type}
                                        onValueChange={(value: 'image' | 'text') =>
                                            updateLogo(index, { type: value })
                                        }
                                    >
                                        <SelectTrigger className="h-8">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="text">Text</SelectItem>
                                            <SelectItem value="image">Image URL</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Value */}
                                <div className="space-y-1">
                                    <Label className="text-xs">
                                        {logo.type === 'image' ? 'Image URL' : 'Brand Name'}
                                    </Label>
                                    <Input
                                        className="h-8"
                                        value={logo.value}
                                        onChange={(e) => updateLogo(index, { value: e.target.value })}
                                        placeholder={logo.type === 'image' ? 'https://...' : 'Company Name'}
                                    />
                                </div>

                                {/* Link URL */}
                                <div className="space-y-1">
                                    <Label className="text-xs">Link URL (optional)</Label>
                                    <Input
                                        className="h-8"
                                        value={logo.url || ''}
                                        onChange={(e) => updateLogo(index, { url: e.target.value })}
                                        placeholder="https://..."
                                    />
                                </div>

                                {/* Remove */}
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    className="w-full"
                                    onClick={() => removeLogo(index)}
                                >
                                    <Trash2 className="w-4 h-4 mr-1" /> Remove
                                </Button>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>

                {logos.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                        No logos added. Click "Add" to add logos.
                    </p>
                )}
            </div>
        </div>
    );
};
